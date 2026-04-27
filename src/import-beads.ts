/**
 * Importer for beads' `.beads/issues.jsonl` format.
 *
 * Each line in issues.jsonl is one issue record. We map every issue to a
 * pearl (a fresh `<hex>.md` in the todos directory). The original beads id
 * and other metadata go into the body so they survive the round-trip; the
 * description (if any) leads the body so a reader sees the actual content
 * first.
 *
 * Records that don't look like issues (no `title`) are appended verbatim
 * to `<todosDir>/memories.jsonl` for later processing — beads memories
 * don't have a settled schema yet, and we don't want to drop data.
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
	generateTodoId,
	getTodoPath,
	withTodoLock,
	writeTodoFile,
	type CliExtensionContextLike,
	type TodoRecord,
} from "./todo-wrapper.js";

interface BeadsDependency {
	issue_id?: string;
	depends_on_id?: string;
	type?: string;
}

interface BeadsComment {
	author?: string;
	created_at?: string;
	body?: string;
	text?: string;
}

interface BeadsIssue {
	id?: string;
	title?: string;
	description?: string;
	status?: string;
	priority?: number;
	issue_type?: string;
	assignee?: string;
	owner?: string;
	created_at?: string;
	created_by?: string;
	updated_at?: string;
	started_at?: string;
	closed_at?: string;
	close_reason?: string;
	external_ref?: string;
	acceptance_criteria?: string;
	notes?: string;
	labels?: string[];
	dependencies?: BeadsDependency[];
	comments?: BeadsComment[];
}

export interface ImportBeadsOptions {
	/** Path to issues.jsonl. */
	file: string;
	/** Pearls todos directory. */
	todosDir: string;
	/** Stub ExtensionContext for withTodoLock. */
	ctx: CliExtensionContextLike;
	/** Parse + report only; don't write any files. */
	dryRun?: boolean;
}

export interface ImportBeadsResult {
	imported: number;
	memories: number;
	skipped: number;
	memoriesPath?: string;
	errors: string[];
}

/**
 * Map a beads status onto something pearls' UI understands.
 *
 * Pearls' `isTodoClosed` only treats "closed"/"done" as closed, but
 * otherwise stores status as a free-form string. We preserve the original
 * value (so "in_progress" / "deferred" round-trip) and only normalise the
 * closed-equivalents to "closed" so the closed bucket fills correctly.
 */
function mapStatus(status: string | undefined): string {
	if (!status) return "open";
	const s = status.trim().toLowerCase();
	if (s === "closed" || s === "done" || s === "resolved") return "closed";
	return s;
}

function isIssueRecord(value: unknown): value is BeadsIssue {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v.title === "string" && v.title.trim().length > 0;
}

function fmt(label: string, value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string" && value.trim() === "") return undefined;
	return `- **${label}:** ${value}`;
}

function buildBody(issue: BeadsIssue): string {
	const parts: string[] = [];
	const description = (issue.description ?? "").trim();
	if (description) parts.push(description);

	const meta: string[] = [];
	const push = (line: string | undefined) => {
		if (line) meta.push(line);
	};
	push(fmt("Original ID", issue.id));
	push(fmt("Type", issue.issue_type));
	push(fmt("Priority", issue.priority));
	push(fmt("Assignee", issue.assignee ?? issue.owner));
	push(fmt("Created by", issue.created_by));
	push(fmt("Created", issue.created_at));
	push(fmt("Started", issue.started_at));
	push(fmt("Updated", issue.updated_at));
	push(fmt("Closed", issue.closed_at));
	push(fmt("Close reason", issue.close_reason));
	push(fmt("External ref", issue.external_ref));

	if (issue.labels && issue.labels.length > 0) {
		push(fmt("Labels", issue.labels.join(", ")));
	}

	if (issue.dependencies && issue.dependencies.length > 0) {
		const deps = issue.dependencies
			.map((d) => `${d.type ?? "depends_on"} → ${d.depends_on_id ?? "?"}`)
			.join("; ");
		push(fmt("Dependencies", deps));
	}

	if (meta.length > 0) {
		parts.push("## Beads metadata\n\n" + meta.join("\n"));
	}

	const ac = (issue.acceptance_criteria ?? "").trim();
	if (ac) parts.push("## Acceptance criteria\n\n" + ac);

	const notes = (issue.notes ?? "").trim();
	if (notes) parts.push("## Notes\n\n" + notes);

	if (issue.comments && issue.comments.length > 0) {
		const block = issue.comments
			.map((c) => {
				const head = [c.author, c.created_at].filter(Boolean).join(" — ");
				const body = (c.body ?? c.text ?? "").trim();
				return `### ${head || "(comment)"}\n\n${body}`;
			})
			.join("\n\n");
		parts.push("## Comments\n\n" + block);
	}

	return parts.join("\n\n") + (parts.length ? "\n" : "");
}

function buildTags(issue: BeadsIssue): string[] {
	const tags = new Set<string>(["beads"]);
	if (issue.issue_type && issue.issue_type.trim()) {
		tags.add(issue.issue_type.trim());
	}
	for (const label of issue.labels ?? []) {
		if (typeof label === "string" && label.trim()) tags.add(label.trim());
	}
	return [...tags];
}

export async function importBeads(
	opts: ImportBeadsOptions,
): Promise<ImportBeadsResult> {
	const raw = await fs.readFile(opts.file, "utf8");
	const lines = raw.split(/\r?\n/);

	const result: ImportBeadsResult = {
		imported: 0,
		memories: 0,
		skipped: 0,
		errors: [],
	};

	const memoriesPath = path.join(opts.todosDir, "memories.jsonl");
	const memoriesBuf: string[] = [];

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (!line.trim()) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (err) {
			result.errors.push(
				`line ${i + 1}: invalid JSON (${(err as Error).message})`,
			);
			result.skipped += 1;
			continue;
		}

		if (!isIssueRecord(parsed)) {
			memoriesBuf.push(line);
			result.memories += 1;
			continue;
		}

		const issue = parsed;
		const todoId = await generateTodoId(opts.todosDir);
		const filePath = getTodoPath(opts.todosDir, todoId);

		const todo: TodoRecord = {
			id: todoId,
			title: (issue.title ?? "").trim(),
			tags: buildTags(issue),
			status: mapStatus(issue.status),
			created_at: issue.created_at && issue.created_at.trim()
				? issue.created_at
				: new Date().toISOString(),
			body: buildBody(issue),
		};

		if (opts.dryRun) {
			result.imported += 1;
			continue;
		}

		const writeResult = await withTodoLock(
			opts.todosDir,
			todoId,
			opts.ctx,
			async () => {
				await writeTodoFile(filePath, todo);
				return todo;
			},
		);
		if (writeResult && typeof writeResult === "object" && "error" in writeResult) {
			result.errors.push(
				`issue ${issue.id ?? "(unknown)"}: ${writeResult.error}`,
			);
			result.skipped += 1;
			continue;
		}
		result.imported += 1;
	}

	if (memoriesBuf.length > 0 && !opts.dryRun) {
		await fs.appendFile(memoriesPath, memoriesBuf.join("\n") + "\n", "utf8");
		result.memoriesPath = memoriesPath;
	} else if (memoriesBuf.length > 0) {
		result.memoriesPath = memoriesPath;
	}

	return result;
}
