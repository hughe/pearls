/**
 * `pearls migrate-layout` — move the JSON metadata block of every pearl
 * between the two on-disk layouts:
 *
 *   frontmatter (default)      footer (experimental)
 *   -------------------       --------------------
 *   {                          # Title
 *     "id": ...                body text
 *   }
 *                              ---
 *   # Title                    { "id": ... }
 *   body text
 *
 * The reader supports both layouts everywhere, so a directory can contain
 * a mix at any time; migration is cosmetic. Running it also flips the
 * `layout` key in settings.json so subsequent writes (create, update,
 * append, claim, ...) keep producing files in the chosen layout.
 */
import fs from "node:fs/promises";
import path from "node:path";

import {
	ensureTodoExists,
	getTodoArchiveDir,
	parseTodoFileName,
	readTodoSettings,
	withTodoLock,
	writeTodoFile,
	writeTodoSettings,
	type CliExtensionContextLike,
	type TodoLayout,
} from "./pearls-wrapper.js";

export interface MigrateLayoutOptions {
	todosDir: string;
	ctx: CliExtensionContextLike;
	to: TodoLayout;
	dryRun?: boolean;
}

export interface MigrateLayoutResult {
	/** Files rewritten to the target layout (basenames, in processing order). */
	migrated: { file: string; archived: boolean }[];
	/** Files already in the target layout, left untouched. */
	unchanged: number;
	errors: string[];
	/** The layout written to settings.json ("dry-run" when --dry-run). */
	settings: TodoLayout | "dry-run";
}

/** Detect which layout a file's raw content is in. */
export function detectTodoLayout(content: string): TodoLayout {
	// The reader treats a leading `{` as frontmatter, so a file can only be
	// in the footer layout when it does not start with one.
	return content.startsWith("{") ? "frontmatter" : "footer";
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

		if (detectTodoLayout(content) === opts.to) {
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
			const todo = await ensureTodoExists(filePath, id);
			if (!todo) return { error: "unreadable" } as const;
			// Re-read under the lock in case the file changed since we
			// sniffed its layout, then write it back in the target layout.
			await writeTodoFile(filePath, todo, opts.to);
			return { ok: true } as const;
		});
		if (typeof outcome === "object" && "error" in outcome) {
			result.errors.push(`skipped ${entry}: ${outcome.error}`);
			continue;
		}
		result.migrated.push({ file: entry, archived });
	}
}

export async function migrateTodoLayout(opts: MigrateLayoutOptions): Promise<MigrateLayoutResult> {
	const result: MigrateLayoutResult = {
		migrated: [],
		unchanged: 0,
		errors: [],
		settings: "dry-run",
	};

	await migrateDir(opts.todosDir, opts, false, result);
	await migrateDir(getTodoArchiveDir(opts.todosDir), opts, true, result);

	// Flip settings.json last: until it changes, ordinary writes keep
	// producing frontmatter, which the reader handles either way.
	if (!opts.dryRun) {
		const settings = await readTodoSettings(opts.todosDir);
		await writeTodoSettings(opts.todosDir, { ...settings, layout: opts.to });
		result.settings = opts.to;
	}

	return result;
}
