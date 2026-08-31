/**
 * Pipe human output through $PAGER when stdout is a terminal.
 *
 * Follows git's conventions: the pager is $PEARLS_PAGER, falling back to
 * $PAGER, then "less". When the pager is less and $LESS is unset we pass
 * FRX: R lets colors through, and F+X mean output that fits on one screen
 * never engages the pager at all — it prints inline and less exits. So
 * the pager only appears when the output actually needs it.
 *
 * Piped output (agents) never sees a pager: stdout isn't a TTY, and
 * --json disables it explicitly. Errors go to stderr unpaged.
 */
import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";

let pager: ChildProcess | null = null;
let pagerDied = false;
let pagerExit: Promise<void> | null = null;

export function initPager(opts: { disabled?: boolean } = {}): void {
	if (opts.disabled || !process.stdout.isTTY) return;
	const spec = (process.env.PEARLS_PAGER ?? process.env.PAGER ?? "less").trim();
	if (!spec) return; // empty string disables the pager, git-style

	const env = { ...process.env };
	if (!env.LESS && /(^|[\s/])less([\s]|$)/.test(spec)) {
		env.LESS = "FRX";
	}

	const child = spawn(spec, {
		shell: true,
		stdio: ["pipe", "inherit", "inherit"],
		env,
	});
	pagerExit = new Promise((resolve) => child.once("exit", () => resolve()));
	child.once("error", () => (pagerDied = true));
	// User quit the pager early (EPIPE) — stop feeding it, go direct.
	child.stdin?.once("error", () => (pagerDied = true));
	pager = child;
}

/** True while the pager is running — stdout is effectively a terminal. */
export function pagerActive(): boolean {
	return pager !== null && !pagerDied;
}

export function out(text: string): void {
	if (pager && !pagerDied && pager.stdin) {
		pager.stdin.write(text);
	} else {
		process.stdout.write(text);
	}
}

export async function endOutput(): Promise<void> {
	if (!pager) return;
	if (!pagerDied) {
		try {
			pager.stdin?.end();
		} catch {
			// already closed
		}
	}
	pager = null;
	await pagerExit;
}