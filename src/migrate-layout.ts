/**
 * `pearls migrate-layout` — bring every pearl up to the canonical YAML
 * front matter format:
 *
 *   ---
 *   title: My note
 *   tags: [rust, sqlite]
 *   created_at: 2026-11-16T23:31:34Z
 *   ---
 *   # My note
 *   body text
 *
 * Files still in a legacy layout — a bare JSON block at the top of the
 * file, or a JSON footer after a trailing `---` separator — are read
 * transparently and rewritten here. The reader keeps supporting the
 * legacy layouts indefinitely, so this command is never required; it
 * just bulk-converts a directory so every file looks the same. It also
 * drops the stale `layout` key from settings.json if it is still there.
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
	ensureTodoExists,
	getTodoArchiveDir,
	getTodoSettingsPath,
	parseTodoFileName,
	readTodoSettings,
	withTodoLock,
	writeTodoFile,
	writeTodoSettings,
	type CliExtensionContextLike,
} from "./pearls-wrapper.js";

export interface MigrateLayoutOptions {
	todosDir: string;
	ctx: CliExtensionContextLike;
	dryRun?: boolean;
}

export interface MigrateLayoutResult {
	/** Files rewritten to YAML front matter (basenames, in processing order). */
	migrated: { file: string; archived: boolean }[];
	/** Files already in YAML front matter form, left untouched. */
	unchanged: number;
	errors: string[];
	/** True when the stale "layout" key was removed from settings.json. */
	settingsUpdated: boolean;
}

/**
 * True when a file's raw content is already in YAML front matter form:
 * it opens with a `---` fence and contains a closing `---` line. This
 * mirrors the reader's fence detection so files are only rewritten when
 * the reader would treat them as legacy too.
 */
export function isYamlFrontMatter(content: string): boolean {
	if (!content.startsWith("---\n")) return false;
	const lines = content.split("\n");
	return lines.slice(1).some((line) => line.trimEnd() === "---");
}

async function migrateDir(
	dir: string,
	opts: MigrateLayoutOptions,
	archived: boolean,
	result: MigrateLayoutResult,
): Promise<void> {
	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		return; // archive dir may not exist yet
	}

	for (const entry of entries.sort()) {
		if (!parseTodoFileName(entry)) continue;

		const filePath = path.join(dir, entry);
		let content: string;
		try {
			content = await fs.readFile(filePath, "utf8");
		} catch {
			result.errors.push(`skipped ${entry}: unreadable`);
			continue;
		}

		if (isYamlFrontMatter(content)) {
			result.unchanged += 1;
			continue;
		}

		if (opts.dryRun) {
			result.migrated.push({ file: entry, archived });
			continue;
		}

		// Lock on the id so a concurrent agent can't write to the file
		// while it is being rewritten underneath them.
		const id = parseTodoFileName(entry)!.id;
		const outcome = await withTodoLock(opts.todosDir, id, opts.ctx, async () => {
			// Re-read under the lock in case the file changed since we
			// sniffed its format, then write it back as YAML front matter.
			const todo = await ensureTodoExists(filePath, id);
			if (!todo) return { error: "unreadable" } as const;
			await writeTodoFile(filePath, todo);
			return { ok: true } as const;
		});
		if (typeof outcome === "object" && "error" in outcome) {
			result.errors.push(`skipped ${entry}: ${outcome.error}`);
			continue;
		}
		result.migrated.push({ file: entry, archived });
	}
}

async function pruneSettingsKey(
	todosDir: string,
	dryRun: boolean,
): Promise<boolean> {
	// settings.json from before the YAML cutover carries a "layout" key
	// that no longer selects anything; drop it. Normalised settings never
	// contain it, so rewriting is idempotent.
	let raw: unknown;
	try {
		raw = JSON.parse(await fs.readFile(getTodoSettingsPath(todosDir), "utf8"));
	} catch {
		return false; // missing or unreadable: nothing to prune
	}
	if (
		typeof raw !== "object" ||
		raw === null ||
		!("layout" in raw) ||
		typeof (raw as Record<string, unknown>).layout !== "string"
	) {
		return false;
	}
	if (!dryRun) {
		const settings = await readTodoSettings(todosDir);
		await writeTodoSettings(todosDir, settings);
	}
	return true;
}

export async function migrateTodoLayout(opts: MigrateLayoutOptions): Promise<MigrateLayoutResult> {
	const result: MigrateLayoutResult = {
		migrated: [],
		unchanged: 0,
		errors: [],
		settingsUpdated: false,
	};

	await migrateDir(opts.todosDir, opts, false, result);
	await migrateDir(getTodoArchiveDir(opts.todosDir), opts, true, result);
	result.settingsUpdated = await pruneSettingsKey(opts.todosDir, Boolean(opts.dryRun));

	return result;
}
