/**
 * `pearls migrate-dir` — move the pearls directory from its legacy
 * `.pi/pearls` (or `.pi/todos`) location to the canonical `pearls`
 * directory at the same level as `.pi`.
 *
 * ```
 *   .pi/pearls/   ->   pearls/
 *   .pi/todos/    ->   pearls/
 * ```
 *
 * The walk-up search finds all three locations, so the command is never
 * required — but migrating means new checkouts and the docs agree on one
 * place. Nothing ever moves automatically; this command is the only way,
 * mirroring the on-demand archive philosophy.
 *
 * The move prefers `git mv` for tracked files so history follows the
 * directory, and falls back to a plain rename otherwise. It refuses to
 * run when the target `pearls` already exists and is non-empty (an empty
 * target directory is absorbed). Lock files and the archive/ subdirectory
 * move along with everything else.
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { isGitWorkTree, movePath } from "./migrate-filenames.js";

export interface MigrateDirOptions {
	todosDir: string;
	dryRun?: boolean;
}

export interface MigrateDirResult {
	/** The move performed (or previewed). Absent when there was nothing to do. */
	move?: { from: string; to: string; method: "git" | "fs" | "dry-run" };
	/** Why nothing was moved, when the command is a no-op. */
	noopReason?: string;
	errors: string[];
}

const CANONICAL_BASENAME = "pearls";
const LEGACY_PARENT_BASENAME = ".pi";
const LEGACY_BASENAMES = new Set(["pearls", "todos"]);

/**
 * Plan the move of a legacy `.pi/pearls` / `.pi/todos` directory to the
 * sibling `pearls` directory. Returns null when `todosDir` was resolved
 * through an explicit override (moving what PEARLS_DIR points at would
 * break it), a noop reason when it is already canonical, or an error when
 * the target exists and is non-empty.
 */
function planDirMove(
	todosDir: string,
): { from: string; to: string } | { error: string } | { noop: string } | null {
	// An explicit PEARLS_DIR / PI_TODO_PATH / --pearls-dir override wins over
	// the default location; moving what it points at would break it, so only
	// migrate directories the walk-up search found.
	if (
		(process.env.PEARLS_DIR && process.env.PEARLS_DIR.trim()) ||
		(process.env.PI_TODO_PATH && process.env.PI_TODO_PATH.trim())
	) {
		return null;
	}
	const from = path.resolve(todosDir);
	const parent = path.dirname(from);
	if (
		path.basename(parent) !== LEGACY_PARENT_BASENAME ||
		!LEGACY_BASENAMES.has(path.basename(from))
	) {
		return { noop: `${from} is already the canonical location` };
	}
	return { from, to: path.join(path.dirname(parent), CANONICAL_BASENAME) };
}

/**
 * Ensure the target path is vacant: absent, or an empty directory (which
 * is removed so the rename can land). Returns an error string when the
 * target exists and is anything but an empty directory.
 */
async function ensureTargetVacant(
	to: string,
	dryRun: boolean,
): Promise<string | undefined> {
	if (!existsSync(to)) return undefined;
	let entries: string[];
	try {
		entries = await fs.readdir(to);
	} catch {
		return `cannot move to ${to}: it exists and is not a directory`;
	}
	if (entries.length === 0) {
		if (!dryRun) await fs.rmdir(to);
		return undefined;
	}
	return `cannot move to ${to}: it already exists and is not empty; merge them manually and re-run`;
}

export async function migrateTodoDir(opts: MigrateDirOptions): Promise<MigrateDirResult> {
	const result: MigrateDirResult = { errors: [] };
	const plan = planDirMove(opts.todosDir);

	if (plan === null) {
		result.noopReason =
			"the todos directory was set via PEARLS_DIR; an explicit override is never moved";
		return result;
	}
	if ("noop" in plan) {
		result.noopReason = plan.noop;
		return result;
	}
	if ("error" in plan) {
		result.errors.push(plan.error);
		return result;
	}

	const collision = await ensureTargetVacant(plan.to, Boolean(opts.dryRun));
	if (collision) {
		result.errors.push(collision);
		return result;
	}

	if (opts.dryRun) {
		result.move = { ...plan, method: "dry-run" };
		return result;
	}

	const useGit = await isGitWorkTree(plan.from);
	const method = await movePath(plan.from, plan.from, plan.to, useGit);
	result.move = { ...plan, method };
	return result;
}
