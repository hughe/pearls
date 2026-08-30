/**
 * Tasteful ANSI colorization for pearls' human-readable output.
 *
 * Coloring is pure presentation: these functions take already-formatted
 * plain text (or plain fragments) and return the same text with ANSI
 * escape codes woven in. When stdout is not a terminal the CLI never
 * calls them, so piped/redirected output — the bytes agents parse —
 * stays identical to the plain formatter.
 *
 * Palette:
 *   - pearl ids (T<hex> / M<hex>) are gray — quiet chrome; the priority
 *     colors carry the meaning and the id stays reference material
 *   - priorities get their own color: bold red for P0, cooling down to
 *     blue for P4, dim for the unspecified "[P?]"
 *   - closed pearls are dimmed so live work stands out
 *   - section headers are bold; metadata (tags, status, assignment) is dim
 *   - an assignment to the current session is green
 */
import process from "node:process";

const RESET = "\x1b[0m";

/** SGR parameter lists per priority; index by digit or "?" for unset. */
const PRIORITY_PARAMS: Record<string, string[]> = {
	"0": ["1", "31"], // bold red — hottest
	"1": ["31"], // red
	"2": ["35"], // magenta
	"3": ["36"], // cyan
	"4": ["34"], // blue — coolest
	"?": ["2"], // dim
};

export type ColorMode = "auto" | "always" | "never";

/**
 * Decide whether to colorize, honouring --color/--no-color and the usual
 * environment conventions. Default "auto": colorize only when stdout is
 * a terminal.
 */
export function colorEnabled(
	mode: ColorMode,
	stream: { isTTY?: boolean } | NodeJS.WriteStream,
): boolean {
	if (mode === "never") return false;
	if (mode === "always") return true;
	const env = process.env;
	if (env.NO_COLOR && env.NO_COLOR !== "0") return false;
	if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
	if (env.CLICOLOR_FORCE && env.CLICOLOR_FORCE !== "0") return true;
	return stream.isTTY === true;
}

/** True for statuses that count as finished ("closed", "done"). */
export function isClosedStatus(status: string | undefined): boolean {
	return !!status && ["closed", "done"].includes(status.toLowerCase());
}

function sgr(params: string[]): string {
	return `\x1b[${params.join(";")}m`;
}

/** Wrap text in an ANSI style, skipping empty fragments. */
function paint(params: string[], text: string): string {
	return text ? sgr(params) + text + RESET : "";
}

/** Prepend "2" (dim) to params for closed pearls, unless already dim. */
function dimmed(params: string[]): string[] {
	return params.includes("2") ? params : ["2", ...params];
}

/** Paint a pearl id (T<hex> / M<hex>) in gray; ids are quiet chrome. */
export function colorPearlId(id: string, closed = false): string {
	return paint(closed ? ["2", "90"] : ["90"], id);
}

/** Paint "[P<n>]" / "[P?]" with the priority's color. */
export function colorPriorityTag(priority: number | undefined, closed = false): string {
	const key = priority === undefined ? "?" : String(priority);
	const params = PRIORITY_PARAMS[key] ?? ["2"];
	return paint(closed ? dimmed(params) : params, `[P${key}]`);
}

/** Paint a bare priority value ("2") with the priority's color. */
export function colorPriorityValue(priority: number | undefined, closed = false): string {
	const key = priority === undefined ? "?" : String(priority);
	const params = PRIORITY_PARAMS[key] ?? ["2"];
	return paint(closed ? dimmed(params) : params, key);
}

/** Paint text dim — used for metadata and closed pearls. */
export function dim(text: string): string {
	return paint(["2"], text);
}

/** Paint text bold — used for section headers. */
export function bold(text: string): string {
	return paint(["1"], text);
}

// ---------------------------------------------------------------------------
// formatTodoList() post-processing
// ---------------------------------------------------------------------------

// A rendered todo line: tree prefix (indent, │ ├ └ ─ and the orphan ¿),
// then "T<hex> [P#] title [tags] (assigned: x) (status)".
const TODO_LINE_RE = /^([\s│├└─¿]*)([TM][0-9a-f]+) \[P([0-9?])\] (.*)$/;
const SECTION_RE = /^(Assigned|Open|Closed) todos \(\d+\):$/;

/**
 * Colorize the plain-text output of formatTodoList() line by line.
 * Upstream todo logic is untouched; this is purely a display shim.
 */
export function colorizeListOutput(
	text: string,
	opts: { currentSessionId?: string } = {},
): string {
	return text.split("\n").map((line) => colorizeListLine(line, opts.currentSessionId)).join("\n");
}

function colorizeListLine(line: string, currentSessionId?: string): string {
	if (!line) return line;
	if (SECTION_RE.test(line)) return bold(line);
	if (line === "No todos." || line.trim() === "none") return dim(line);

	const m = TODO_LINE_RE.exec(line);
	if (!m) return line;

	const prefix = m[1]!;
	const id = m[2]!;
	const pri = m[3]!;
	let rest = m[4]!;

	// Trailing metadata, peeled from the end: " (status)", an optional
	// " (assigned: <session>)", an optional " [tags]". What remains is
	// the title.
	let statusText = "";
	const sm = / \(([^()]*)\)$/.exec(rest);
	if (sm) {
		statusText = sm[0];
		rest = rest.slice(0, sm.index);
	}
	let assignText = "";
	let isCurrentSession = false;
	const am = / \(assigned: ([^()]*)\)$/.exec(rest);
	if (am) {
		assignText = am[0];
		isCurrentSession = am[1] === currentSessionId;
		rest = rest.slice(0, am.index);
	}
	let tagText = "";
	const tm = / \[[^\[\]]*\]$/.exec(rest);
	if (tm) {
		tagText = tm[0];
		rest = rest.slice(0, tm.index);
	}
	const title = rest;

	const closed = isClosedStatus(statusText.slice(2, -1));
	const idOut = colorPearlId(id, closed);
	const priOut = paint(closed ? dimmed(PRIORITY_PARAMS[pri] ?? ["2"]) : PRIORITY_PARAMS[pri] ?? ["2"], ` [P${pri}]`);
	const titleOut = closed ? dim(title) : title;
	const tagsOut = dim(tagText);
	const assignOut = assignText
		? isCurrentSession
			? paint(["32"], assignText)
			: dim(assignText)
		: "";
	const statusOut = dim(statusText);

	return `${prefix}${idOut}${priOut} ${titleOut}${tagsOut}${assignOut}${statusOut}`;
}