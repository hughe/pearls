/**
 * `pearls migrate-filenames` — convert a todos directory to the current
 * filename scheme.
 *
 * Pearls used to be stored as `<hex>.md`; they are now `T<hex>-<slug>.md`
 * for todos and `M<hex>-<slug>.md` for memories, where the slug is derived
 * from the title (or from an explicit `--slug`).
 * Reading both layouts works everywhere, so migrating is optional — but a
 * directory of hex filenames is miserable to browse, which is the whole
 * point of the scheme.
 *
 * The rename prefers `git mv` for tracked files so history follows the
 * pearl, and falls back to a plain rename otherwise. The derived slug is
 * written into the front matter as part of the move, which makes a second
 * run a no-op.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
	ensureTodoExists,
	getTodoArchiveDir,
	parseTodoFileName,
	slugifyTodo,
	todoFileName,
	withTodoLock,
	writeTodoFile,
	type CliExtensionContextLike,
} from "./pearls-wrapper.js";

const execFileAsync = promisify(execFile);

export interface MigrateOptions {
	todosDir: string;
	ctx: CliExtensionContextLike;
	dryRun?: boolean;
	force?: boolean;
}

export interface MigrateRename {
	from: string;
	to: string;
	dir: string;
	archived: boolean;
	method: "git" | "fs" | "dry-run";
}

export interface MigrateResult {
	renamed: MigrateRename[];
	unchanged: number;
	errors: string[];
}

/** True when `dir` sits inside a git work tree. */
async function isGitWorkTree(dir: string): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"]);
		return stdout.trim() === "true";
	} catch {
		return false;
	}
}

async function isTracked(dir: string, filePath: string): Promise<boolean> {
	try {
		await execFileAsync("git", ["-C", dir, "ls-files", "--error-unmatch", filePath]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Pick a free target name. Collisions should be impossible — the id is in
 * the filename — but a half-finished earlier run could leave one behind, so
 * bail out unless the caller passed --force.
 */
function resolveTarget(
	dir: string,
	name: string,
	force: boolean,
): { target: string } | { error: string } {
	const direct = path.join(dir, name);
	if (!existsSync(direct)) return { target: direct };
	if (!force) {
		return { error: `${name} already exists; rerun with --force to disambiguate` };
	}
	for (let attempt = 1; attempt < 100; attempt += 1) {
		const candidate = path.join(dir, name.replace(/\.md$/, `-${attempt}.md`));
		if (!existsSync(candidate)) return { target: candidate };
	}
	return { error: `no free filename for ${name}` };
}

async function movePath(
	dir: string,
	from: string,
	to: string,
	useGit: boolean,
): Promise<"git" | "fs"> {
	if (useGit && (await isTracked(dir, from))) {
		try {
			await execFileAsync("git", ["-C", dir, "mv", from, to]);
			return "git";
		} catch {
			// Fall through: an unstageable file still deserves to be renamed.
		}
	}
	await fs.rename(from, to);
	return "fs";
}

async function migrateDir(
	dir: string,
	opts: MigrateOptions,
	archived: boolean,
	result: MigrateResult,
): Promise<void> {
	let entries: string[];
	try {
		entries = await fs.readdir(dir);
	} catch {
		return; // archive dir may not exist yet
	}

	const useGit = opts.dryRun ? false : await isGitWorkTree(dir);

	for (const entry of entries.sort()) {
		const name = parseTodoFileName(entry);
		if (!name) continue;

		const filePath = path.join(dir, entry);
		const todo = await ensureTodoExists(filePath, name.id).catch(() => null);
		if (!todo) {
			result.errors.push(`skipped ${entry}: unreadable`);
			continue;
		}

		const slug = slugifyTodo(todo.slug || todo.title);
		// The front matter decides todo vs memory; the prefix letter follows
		// it, so a memory that predates the M prefix gets re-lettered here.
		const target = todoFileName(name.id, slug, todo.type);
		if (target === entry && todo.slug === slug) {
			result.unchanged += 1;
			continue;
		}

		if (opts.dryRun) {
			result.renamed.push({ from: entry, to: target, dir, archived, method: "dry-run" });
			continue;
		}

		// Lock on the id so a concurrent agent can't write to the old path
		// while it is being moved out from under it.
		const outcome = await withTodoLock(opts.todosDir, name.id, opts.ctx, async () => {
			let finalPath = filePath;
			let method: "git" | "fs" = "fs";

			if (target !== entry) {
				const resolved = resolveTarget(dir, target, Boolean(opts.force));
				if ("error" in resolved) return resolved;
				method = await movePath(dir, filePath, resolved.target, useGit);
				finalPath = resolved.target;
			}

			// Persist the slug so a second run is a no-op.
			todo.slug = slug;
			await writeTodoFile(finalPath, todo);
			return { to: path.basename(finalPath), method } as const;
		});

		if (typeof outcome === "object" && "error" in outcome) {
			result.errors.push(`skipped ${entry}: ${outcome.error}`);
			continue;
		}
		result.renamed.push({ from: entry, to: outcome.to, dir, archived, method: outcome.method });
	}
}

export async function migrateTodoFilenames(opts: MigrateOptions): Promise<MigrateResult> {
	const result: MigrateResult = { renamed: [], unchanged: 0, errors: [] };
	await migrateDir(opts.todosDir, opts, false, result);
	await migrateDir(getTodoArchiveDir(opts.todosDir), opts, true, result);
	return result;
}
