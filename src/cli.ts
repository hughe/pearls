#!/usr/bin/env node
/**
 * pearls — an agent-friendly CLI wrapper around Armin Ronacher's `todos.ts`.
 *
 * The CLI is deliberately agent-agnostic: any tool that can run a shell
 * command (Claude Code, Cursor, Aider, Codex, a plain bash agent, a human)
 * can manage todos through pearls. If Pi happens to be running too, its
 * `/todos` UI operates on the same files, but pearls does not depend on
 * Pi being present at runtime.
 *
 * Storage is 100% compatible with `extensions/todo.ts`: both read and write
 * the same `.pi/todos/<id>.md` files with JSON front matter, honour
 * `PI_TODO_PATH`, respect lock files, and share a settings.json.
 *
 * Every operation here is implemented by calling a function that already
 * exists in todo.ts — no business logic is reimplemented. The CLI only
 * parses args, constructs a stub ExtensionContext, and formats output.
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
	appendTodoBody,
	claimTodoAssignment,
	clearAssignmentIfClosed,
	deleteTodo,
	ensureTodoExists,
	ensureTodosDir,
	filterTodos,
	formatTodoId,
	formatTodoList,
	garbageCollectTodos,
	generateTodoId,
	getTodoPath,
	getTodosDir,
	hasPiTodoPathDeprecation,
	listTodos,
	readTodoSettings,
	releaseTodoAssignment,
	serializeTodoForAgent,
	serializeTodoListForAgent,
	splitTodosByAssignment,
	updateTodoStatus,
	validatePriority,
	validateTodoId,
	withTodoLock,
	writeTodoFile,
	type TodoFrontMatter,
	type TodoRecord,
} from "./pearls-wrapper.js";
import { importBeads } from "./import-beads.js";

// ---------------------------------------------------------------------------
// Stub ExtensionContext
// ---------------------------------------------------------------------------

/**
 * Build a minimal ExtensionContext-compatible object for todo.ts.
 *
 * todo.ts touches only: ctx.cwd, ctx.hasUI, ctx.sessionManager.getSessionId(),
 * ctx.sessionManager.getSessionFile(), and ctx.ui.confirm() (only when
 * hasUI=true). We set hasUI=false so ui is never used.
 */
function makeCtx(opts: { cwd: string; sessionId: string }) {
	const sessionFile = `${opts.sessionId}.json`;
	return {
		cwd: opts.cwd,
		hasUI: false,
		sessionManager: {
			getSessionId: () => opts.sessionId,
			getSessionFile: () => sessionFile,
		},
		// ui is intentionally absent; hasUI=false guarantees it isn't called.
	};
}

function defaultSessionId(): string {
	const envSession =
		process.env.PEARLS_SESSION || process.env.PI_SESSION_ID;
	if (envSession && envSession.trim()) return envSession.trim();
	const user = os.userInfo().username || "user";
	const host = os.hostname().split(".")[0] || "host";
	return `cli:${user}@${host}`;
}

// ---------------------------------------------------------------------------
// Argument parsing (tiny hand-rolled parser; no extra deps)
// ---------------------------------------------------------------------------

interface ParsedArgs {
	command: string | undefined;
	positional: string[];
	flags: Record<string, string | boolean>;
}

const KNOWN_STRING_FLAGS = new Set([
	"todo-dir",
	"session",
	"title",
	"status",
	"tag",
	"body",
	"body-file",
	"id",
	"search",
	"format",
	"priority",
	"parent",
	"fuzzy",
	"child-of",
]);

// Short flags that take a value, mapped to their long-form key.
const SHORT_VALUE_FLAGS: Record<string, string> = {
	f: "fuzzy",
	p: "priority",
	c: "child-of",
};

import { VERSION } from "./version.js";

const KNOWN_BOOL_FLAGS = new Set([
	"json",
	"all",
	"force",
	"closed",
	"help",
	"version",
	"stdin-body",
	"quiet",
	"no-gc",
	"dry-run",
]);

function parseArgs(argv: string[]): ParsedArgs {
	const positional: string[] = [];
	const flags: Record<string, string | boolean> = {};
	let command: string | undefined;
	const multi: Record<string, string[]> = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--") {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			const eq = arg.indexOf("=");
			const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).trim();
			let value: string | boolean;
			if (eq !== -1) {
				value = arg.slice(eq + 1);
			} else if (KNOWN_BOOL_FLAGS.has(key)) {
				value = true;
			} else if (KNOWN_STRING_FLAGS.has(key)) {
				const next = argv[i + 1];
				if (next === undefined || next.startsWith("--")) {
					throw new CliError(`--${key} requires a value`);
				}
				value = next;
				i += 1;
			} else {
				// Unknown flag — treat boolean if followed by another flag/end,
				// else string. Be permissive rather than fail on typos early.
				const next = argv[i + 1];
				if (next === undefined || next.startsWith("--")) {
					value = true;
				} else {
					value = next;
					i += 1;
				}
			}
			if (key === "tag") {
				if (typeof value !== "string") {
					throw new CliError("--tag requires a string value");
				}
				(multi.tag ??= []).push(value);
			} else {
				flags[key] = value;
			}
		} else if (arg.startsWith("-") && arg.length > 1) {
			// short flags: -h / -q (boolean), -f/-p/-c (take a value).
			const short = arg.slice(1);
			if (short === "h") flags.help = true;
			else if (short === "q") flags.quiet = true;
			else if (SHORT_VALUE_FLAGS[short]) {
				const longKey = SHORT_VALUE_FLAGS[short];
				const next = argv[i + 1];
				if (next === undefined || next.startsWith("--")) {
					throw new CliError(`-${short} requires a value`);
				}
				flags[longKey] = next;
				i += 1;
			} else throw new CliError(`Unknown short flag: ${arg}`);
		} else if (command === undefined) {
			command = arg;
		} else {
			positional.push(arg);
		}
	}

	if (multi.tag) flags.tag = multi.tag.join("\n"); // sentinel join; we split later

	return { command, positional, flags };
}

function getTags(flags: Record<string, string | boolean>): string[] | undefined {
	const v = flags.tag;
	if (v === undefined) return undefined;
	if (typeof v !== "string") return [];
	return v.split("\n").map((t) => t.trim()).filter(Boolean);
}

function getPriority(
	flags: Record<string, string | boolean>,
): number | undefined {
	const v = flags.priority;
	if (v === undefined) return undefined;
	if (typeof v !== "string") {
		throw new CliError("--priority requires an integer 0-4");
	}
	const trimmed = v.trim();
	if (!trimmed) return undefined;
	const n = Number(trimmed);
	const err = validatePriority(n);
	if (err) throw new CliError(err);
	return n;
}

function getParent(
	flags: Record<string, string | boolean>,
): string | undefined | null {
	const v = flags.parent;
	if (v === undefined) return undefined;
	if (typeof v !== "string") {
		throw new CliError("--parent requires a TODO-<hex> id");
	}
	const trimmed = v.trim();
	if (!trimmed) return null;
	const validated = validateTodoId(trimmed);
	if ("error" in validated) {
		throw new CliError(`--parent: ${validated.error}`);
	}
	return validated.id;
}

async function readBody(flags: Record<string, string | boolean>): Promise<string | undefined> {
	if (flags["body-file"]) {
		return await fs.readFile(String(flags["body-file"]), "utf8");
	}
	if (flags["stdin-body"]) {
		return await readStdin();
	}
	if (typeof flags.body === "string") return flags.body;
	return undefined;
}

async function readStdin(): Promise<string> {
	return await new Promise<string>((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => (data += chunk));
		process.stdin.on("end", () => resolve(data));
		process.stdin.on("error", reject);
	});
}

class CliError extends Error {}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printJsonList(todos: TodoFrontMatter[]): void {
	process.stdout.write(serializeTodoListForAgent(todos) + "\n");
}

function printJsonTodo(todo: TodoRecord): void {
	process.stdout.write(serializeTodoForAgent(todo) + "\n");
}

function printHumanList(todos: TodoFrontMatter[], allTodos?: TodoFrontMatter[]): void {
	process.stdout.write(formatTodoList(todos, allTodos) + "\n");
}

function printHumanTodo(todo: TodoRecord): void {
	const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
	const assignText = todo.assigned_to_session
		? ` (assigned: ${todo.assigned_to_session})`
		: "";
	process.stdout.write(
		`${formatTodoId(todo.id)} ${todo.title || "(untitled)"}${tagText}${assignText}\n`,
	);
	process.stdout.write(`status: ${todo.status || "open"}\n`);
	process.stdout.write(`priority: ${todo.priority !== undefined ? todo.priority : "?"}\n`);
	if (todo.parent) {
		process.stdout.write(`parent: ${formatTodoId(todo.parent)}\n`);
	}
	if (todo.created_at) {
		process.stdout.write(`created: ${todo.created_at}\n`);
	}
	if (todo.body && todo.body.trim()) {
		process.stdout.write("\n" + todo.body.trimEnd() + "\n");
	}
}

function fail(msg: string, code = 1): never {
	process.stderr.write(`pearls: ${msg}\n`);
	process.exit(code);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const HELP = `pearls — agent-friendly todos (compatible with Pi's todo extension)

USAGE
  pearls [global-flags] <command> [flags] [args]

GLOBAL FLAGS
  --todo-dir <path>      Override the todos directory (default: walk up from
                         cwd looking for .pi/todos, or $PEARLS_DIR).
  $PEARLS_DIR            Path to the todos directory (alternative to
                         --todo-dir).
  $PI_TODO_PATH          Deprecated alias for PEARLS_DIR. Use PEARLS_DIR
                         instead.
  --session <id>         Session id used for claim/release (default:
                         $PEARLS_SESSION or cli:<user>@<host>).
  --json                 Emit stable JSON (identical to Pi's todo tool output),
                         suitable for any agent that parses tool results.
  --no-gc                Skip the normal startup garbage collection of old
                         closed todos.
  -h, --help             Show this help.
      --version          Print version and exit.

COMMANDS
  list                   List open + assigned todos (default human output).
  list-all               List every todo including closed.
  search [filters]       Filter todos. At least one of:
                           -f, --fuzzy <term>      Fuzzy-match id/title/
                                                    tags/status/assignee.
                           -p, --priority <0-4>    Exact priority match.
                           -c, --child-of <id>     Only todos whose parent
                                                    field equals <id>.
                         Prints one line per match: 'TODO-<id>  <title>'.
                         Closed todos are excluded unless --closed is
                         passed. Use --json for the same shape as
                         list --json.
  get <id>               Print a single todo (id may be TODO-<hex> or <hex>).
  show <id>              Alias for get.
  create <title...>      Create a new todo. Flags: --tag <t> (repeatable),
                         --status <s>, --body <text>, --body-file <file>,
                         --stdin-body, --priority <0-4>, --parent <id>.
  update <id>            Update a todo. Flags: --title, --status, --tag
                         (repeatable, replaces), --body, --body-file,
                         --stdin-body, --priority <0-4>, --parent <id>
                         (pass empty string to clear).
  append <id>            Append markdown to a todo's body. Body sources as
                         for create.
  delete <id>            Delete a todo.
  close <id>             Shortcut for update --status closed.
  reopen <id>            Shortcut for update --status open.
  claim <id>             Claim a todo for the current session. --force to
                         steal from another session.
  release <id>           Release the current session's assignment. --force
                         to release someone else's.
  dir                    Print the resolved todos directory.
  path <id>              Print the absolute path to a todo's .md file.
  refine <id>           Print a refinement prompt for the todo. The agent
                         should ask the user clarifying questions before
                         rewriting the todo.
  quickstart             Print an agent-oriented guide to using pearls.
  import-beads <file>    Import a beads issues.jsonl file. Creates one
                         pearl per issue (description first in body, beads
                         metadata appended). Non-issue records are
                         appended verbatim to memories.jsonl in the todos
                         directory. Supports --dry-run.
  help                   Show this help.

OUTPUT
  Human mode is the default and matches the "Assigned / Open / Closed"
  sections used by the underlying todo tool. --json produces a stable
  JSON payload (the same one Pi's todo tool returns to an LLM), so any
  agent that can run a shell command can parse pearls output directly.

EXAMPLES
  pearls create "Write README" --tag docs --body "Explain storage format"
  pearls list --json
  pearls search -f readme              # open/assigned todos mentioning "readme"
  pearls search -f readme --closed     # include closed ones too
  pearls search -p 0                   # only priority-0 todos
  pearls search -c TODO-deadbeef       # children of TODO-deadbeef
  pearls append TODO-deadbeef --stdin-body < notes.md
  pearls close TODO-deadbeef
  PI_TODO_PATH=./todos pearls list
`;

const QUICKSTART = `pearls quickstart — an agent's guide to driving the todo list

WHAT THIS IS
  pearls is a CLI for a shared todo backlog living in .pi/todos/<id>.md.
  Files are committed to the repo, so humans and agents on every checkout
  see the same list. Any agent that can run a shell command can use it.

THE TYPICAL LOOP
  1. Discover work:
       pearls list --json
     The JSON has three buckets: assigned (claimed by some session),
     open (unclaimed), and closed. Pick something from open, or pick
     up something already assigned to your own session.

  2. Claim it so other agents don't double up:
       pearls claim TODO-<id> --session "$AGENT_ID"
     Use a stable session id per agent run; pearls also reads
     $PEARLS_SESSION. Add --force to steal a stale claim.

  3. Do the work. Record progress as you go:
       pearls append TODO-<id> --stdin-body <<'EOF'
       Tried X, hit Y, switching to Z.
       EOF

  4. Finish:
       pearls close TODO-<id>
     close clears the assignment automatically.

CREATING WORK
  pearls create "Short imperative title" \\
    --tag area --tag kind \\
    --stdin-body <<'EOF'
  Why this matters, what 'done' looks like, links to context.
  EOF

  Keep titles short and imperative. Put detail in the body — agents and
  humans both read it. Tags are free-form; reuse what's already in use
  (check 'pearls list --json' to see existing tags).

INSPECTING / SEARCHING
  pearls get TODO-<id>            # full body
  pearls search -f <query>        # fuzzy match across id/title/tags/status
  pearls search -f <query> --closed  # include closed todos
  pearls search -p 0              # priority 0 todos
  pearls search -c TODO-<id>      # children of <id>
  pearls list-all                 # everything, including closed

IDS
  Ids are written as TODO-<hex> in output, but every command also accepts
  the bare <hex>. Copy-paste either form.

OUTPUT FOR AGENTS
  Add --json to list / search / get / create / update for a stable
  machine-readable payload. The shape matches Pi's /todos tool exactly,
  so any code that already parses Pi tool output works here unchanged.

WHAT NOT TO DO
  - Don't edit .pi/todos/*.md by hand while pearls is running; the lock
    files (.lock) coordinate concurrent writers.
  - Don't reuse another session's id to bypass claim/release; use --force
    if you genuinely need to steal, so the audit trail is honest.
  - Don't delete todos to "close" them — use 'pearls close'. Deletes are
    for mistakes only.

SEE ALSO
  pearls help     full command reference and global flags
`;

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

interface RunContext {
	todosDir: string;
	ctx: ReturnType<typeof makeCtx>;
	json: boolean;
	flags: Record<string, string | boolean>;
	positional: string[];
}

async function main(argv: string[]): Promise<void> {
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(argv);
	} catch (err) {
		if (err instanceof CliError) fail(err.message, 2);
		throw err;
	}

	if (parsed.flags.version) {
		process.stdout.write(VERSION + "\n");
		return;
	}
	if (parsed.flags.help || parsed.command === "help" || parsed.command === undefined) {
		process.stdout.write(HELP);
		return;
	}

	// Resolve todos dir. --todo-dir sets PEARLS_DIR (highest priority).
	// PI_TODO_PATH is a deprecated alias; warn if it is set without --todo-dir.
	if (typeof parsed.flags["todo-dir"] === "string") {
		process.env.PEARLS_DIR = parsed.flags["todo-dir"];
	} else if (hasPiTodoPathDeprecation()) {
		process.stderr.write(
			"pearls: warning: PI_TODO_PATH is deprecated. " +
			"Use PEARLS_DIR instead.\n",
		);
	}
	const cwd = process.cwd();
	const todosDir = getTodosDir(cwd);

	const sessionId =
		typeof parsed.flags.session === "string" ? parsed.flags.session : defaultSessionId();
	const ctx = makeCtx({ cwd, sessionId });

	// Mirror todo.ts's session_start behaviour: ensure dir + (optionally) gc.
	await ensureTodosDir(todosDir);
	if (!parsed.flags["no-gc"]) {
		const settings = await readTodoSettings(todosDir);
		await garbageCollectTodos(todosDir, settings);
	}

	const run: RunContext = {
		todosDir,
		ctx,
		json: Boolean(parsed.flags.json),
		flags: parsed.flags,
		positional: parsed.positional,
	};

	switch (parsed.command) {
		case "list":
			return await cmdList(run, { includeClosed: false });
		case "list-all":
			return await cmdList(run, { includeClosed: true });
		case "search":
			return await cmdSearch(run);
		case "get":
		case "show":
			return await cmdGet(run);
		case "create":
		case "new":
		case "add":
			return await cmdCreate(run);
		case "update":
		case "edit":
			return await cmdUpdate(run);
		case "append":
			return await cmdAppend(run);
		case "delete":
		case "rm":
			return await cmdDelete(run);
		case "close":
			return await cmdSetStatus(run, "closed");
		case "reopen":
		case "open":
			return await cmdSetStatus(run, "open");
		case "claim":
			return await cmdClaim(run);
		case "release":
			return await cmdRelease(run);
		case "dir":
			process.stdout.write(todosDir + "\n");
			return;
		case "path":
			return cmdPath(run);
		case "refine":
			return await cmdRefine(run);
	case "quickstart":
			process.stdout.write(QUICKSTART);
			return;
		case "import-beads":
			return await cmdImportBeads(run);
		default:
			fail(`Unknown command: ${parsed.command}. Try 'pearls help'.`, 2);
	}
}

// ---- list / list-all ------------------------------------------------------

async function cmdList(
	run: RunContext,
	opts: { includeClosed: boolean },
): Promise<void> {
	const todos = await listTodos(run.todosDir);
	const listed = opts.includeClosed
		? todos
		: (() => {
				const { assignedTodos, openTodos } = splitTodosByAssignment(todos);
				return [...assignedTodos, ...openTodos];
			})();

	if (run.json) {
		printJsonList(listed);
	} else {
		printHumanList(listed, todos);
	}
}

// ---- search ---------------------------------------------------------------

async function cmdSearch(run: RunContext): Promise<void> {
	const fuzzy =
		typeof run.flags.fuzzy === "string" && run.flags.fuzzy.trim()
			? run.flags.fuzzy.trim()
			: undefined;
	const priority = getPriority(run.flags);
	const childOf = (() => {
		const v = run.flags["child-of"];
		if (v === undefined) return undefined;
		if (typeof v !== "string" || !v.trim()) {
			throw new CliError("--child-of requires a TODO-<hex> id");
		}
		const validated = validateTodoId(v);
		if ("error" in validated) {
			throw new CliError(`--child-of: ${validated.error}`);
		}
		return validated.id;
	})();

	if (fuzzy === undefined && priority === undefined && childOf === undefined) {
		throw new CliError(
			"search requires at least one of -f/--fuzzy, -p/--priority, -c/--child-of",
		);
	}
	if (run.positional.length > 0) {
		throw new CliError(
			"search no longer accepts positional terms; use -f/--fuzzy <term>",
		);
	}

	const includeClosed = Boolean(run.flags.closed);

	const all = await listTodos(run.todosDir);
	let candidates = includeClosed
		? all
		: (() => {
				const { assignedTodos, openTodos } = splitTodosByAssignment(all);
				return [...assignedTodos, ...openTodos];
			})();

	if (priority !== undefined) {
		candidates = candidates.filter((t) => t.priority === priority);
	}
	if (childOf !== undefined) {
		candidates = candidates.filter((t) => t.parent === childOf);
	}

	const matches = fuzzy ? filterTodos(candidates, fuzzy) : candidates;

	if (run.json) {
		// Same three-section shape as list --json so agents can parse it
		// with the same code path. Closed bucket will be empty unless
		// --closed was passed.
		printJsonList(matches);
		return;
	}

	if (matches.length === 0) {
		// Exit 0 with no output keeps shell pipelines clean; a caller can
		// detect "no hits" by checking `wc -l`.
		return;
	}

	for (const todo of matches) {
		const pri = todo.priority !== undefined ? `[P${todo.priority}] ` : "[P?] ";
		process.stdout.write(
			`${formatTodoId(todo.id)}  ${pri}${todo.title || "(untitled)"}\n`,
		);
	}
}

// ---- get ------------------------------------------------------------------

function resolveId(run: RunContext): string {
	const raw =
		(typeof run.flags.id === "string" && run.flags.id) ||
		run.positional[0];
	if (!raw) throw new CliError("todo id required");
	const validated = validateTodoId(raw);
	if ("error" in validated) throw new CliError(validated.error);
	return validated.id;
}

async function cmdGet(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const filePath = getTodoPath(run.todosDir, id);
	const todo = await ensureTodoExists(filePath, id);
	if (!todo) fail(`Todo ${formatTodoId(id)} not found`, 1);
	if (run.json) printJsonTodo(todo);
	else printHumanTodo(todo);
}

// ---- create ---------------------------------------------------------------

async function cmdCreate(run: RunContext): Promise<void> {
	// Title from --title or from positional (joined), to keep quoting loose.
	let title = typeof run.flags.title === "string" ? run.flags.title : undefined;
	if (!title && run.positional.length > 0) {
		title = run.positional.join(" ");
	}
	if (!title || !title.trim()) throw new CliError("title required (positional or --title)");

	const tags = getTags(run.flags) ?? [];
	const status =
		typeof run.flags.status === "string" && run.flags.status.trim()
			? run.flags.status.trim()
			: "open";
	const priority = getPriority(run.flags);
	const parent = getParent(run.flags);
	const providedBody = (await readBody(run.flags)) ?? "";
	// Seed every new pearl with a `# <title>` heading and a `## Description`
	// section so bodies have a predictable shape (matches the import-beads
	// layout). Provided body content lands under Description.
	const descriptionContent = providedBody.replace(/^\s+|\s+$/g, "");
	const body =
		`# ${title}\n\n## Description\n\n` +
		(descriptionContent ? descriptionContent + "\n" : "");

	const id = await generateTodoId(run.todosDir);
	const filePath = getTodoPath(run.todosDir, id);
	const todo: TodoRecord = {
		id,
		title,
		tags,
		status,
		created_at: new Date().toISOString(),
		priority,
		parent: parent ?? undefined,
		body,
	};

	const result = await withTodoLock(run.todosDir, id, run.ctx, async () => {
		await writeTodoFile(filePath, todo);
		return todo;
	});
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

// ---- update ---------------------------------------------------------------

async function cmdUpdate(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const filePath = getTodoPath(run.todosDir, id);
	if (!existsSync(filePath)) fail(`Todo ${formatTodoId(id)} not found`);

	const title = typeof run.flags.title === "string" ? run.flags.title : undefined;
	const status = typeof run.flags.status === "string" ? run.flags.status : undefined;
	const tags = getTags(run.flags);
	const body = await readBody(run.flags);
	const priority = getPriority(run.flags);
	const parent = getParent(run.flags);

	if (
		title === undefined &&
		status === undefined &&
		tags === undefined &&
		body === undefined &&
		priority === undefined &&
		parent === undefined
	) {
		throw new CliError(
			"update requires at least one of --title, --status, --tag, --body, --body-file, --stdin-body, --priority, --parent",
		);
	}

	const result = await withTodoLock(run.todosDir, id, run.ctx, async () => {
		const existing = await ensureTodoExists(filePath, id);
		if (!existing) return { error: `Todo ${formatTodoId(id)} not found` } as const;
		existing.id = id;
		if (title !== undefined) existing.title = title;
		if (status !== undefined) existing.status = status;
		if (tags !== undefined) existing.tags = tags;
		if (body !== undefined) existing.body = body;
		if (priority !== undefined) existing.priority = priority;
		if (parent !== undefined) existing.parent = parent ?? undefined;
		if (!existing.created_at) existing.created_at = new Date().toISOString();
		clearAssignmentIfClosed(existing);
		await writeTodoFile(filePath, existing);
		return existing;
	});
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

// ---- append ---------------------------------------------------------------

async function cmdAppend(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const filePath = getTodoPath(run.todosDir, id);
	if (!existsSync(filePath)) fail(`Todo ${formatTodoId(id)} not found`);

	const body = await readBody(run.flags);
	if (!body || !body.trim()) throw new CliError("append requires --body, --body-file, or --stdin-body");

	const result = await withTodoLock(run.todosDir, id, run.ctx, async () => {
		const existing = await ensureTodoExists(filePath, id);
		if (!existing) return { error: `Todo ${formatTodoId(id)} not found` } as const;
		return await appendTodoBody(filePath, existing, body);
	});
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

// ---- delete ---------------------------------------------------------------

async function cmdDelete(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const result = await deleteTodo(run.todosDir, id, run.ctx);
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else if (!run.flags.quiet) {
		process.stdout.write(`Deleted ${formatTodoId(id)}\n`);
	}
}

// ---- status shortcuts -----------------------------------------------------

async function cmdSetStatus(run: RunContext, status: string): Promise<void> {
	const id = resolveId(run);
	const result = await updateTodoStatus(run.todosDir, id, status, run.ctx);
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

// ---- claim / release ------------------------------------------------------

async function cmdClaim(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const result = await claimTodoAssignment(
		run.todosDir,
		id,
		run.ctx,
		Boolean(run.flags.force),
	);
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

async function cmdRelease(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const result = await releaseTodoAssignment(
		run.todosDir,
		id,
		run.ctx,
		Boolean(run.flags.force),
	);
	if (typeof result === "object" && "error" in result) fail(result.error);

	if (run.json) printJsonTodo(result as TodoRecord);
	else printHumanTodo(result as TodoRecord);
}

// ---- import-beads ---------------------------------------------------------

async function cmdImportBeads(run: RunContext): Promise<void> {
	const file = run.positional[0];
	if (!file) throw new CliError("import-beads requires a path to issues.jsonl");
	if (!existsSync(file)) fail(`No such file: ${file}`);

	const result = await importBeads({
		file,
		todosDir: run.todosDir,
		ctx: run.ctx,
		dryRun: Boolean(run.flags["dry-run"]),
	});

	if (run.json) {
		process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		return;
	}

	const verb = run.flags["dry-run"] ? "would import" : "imported";
	process.stdout.write(`${verb} ${result.imported} issue(s)\n`);
	if (result.memories > 0) {
		const dest = result.memoriesPath ?? "memories.jsonl";
		const verb2 = run.flags["dry-run"] ? "would write" : "wrote";
		process.stdout.write(
			`${verb2} ${result.memories} memory record(s) to ${dest}\n`,
		);
	}
	if (result.skipped > 0) {
		process.stdout.write(`skipped ${result.skipped} record(s)\n`);
	}
	for (const err of result.errors) {
		process.stderr.write(`pearls: ${err}\n`);
	}
}

// ---- path -----------------------------------------------------------------

function cmdPath(run: RunContext): void {
	const id = resolveId(run);
	process.stdout.write(path.resolve(getTodoPath(run.todosDir, id)) + "\n");
}

// ---- refine ---------------------------------------------------------------

async function cmdRefine(run: RunContext): Promise<void> {
	const id = resolveId(run);
	const filePath = getTodoPath(run.todosDir, id);
	const todo = await ensureTodoExists(filePath, id);
	if (!todo) fail(`Todo ${formatTodoId(id)} not found`, 1);

	const title = todo.title || "(untitled)";
	const prompt =
		`Let's refine task ${formatTodoId(id)} "${title}": ` +
		"Ask me for the missing details needed to refine the todo together. " +
		"Do not rewrite the todo yet and do not make assumptions. " +
		"Ask clear, concrete questions and wait for my answers before drafting any structured description.";

	if (run.json) {
		process.stdout.write(
			JSON.stringify({ id: formatTodoId(id), title, refine_prompt: prompt }) + "\n",
		);
	} else {
		process.stdout.write(prompt + "\n");
	}
}

// ---------------------------------------------------------------------------

main(process.argv.slice(2)).catch((err) => {
	if (err instanceof CliError) fail(err.message, 2);
	process.stderr.write(
		`pearls: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	if (process.env.PEARLS_DEBUG) {
		process.stderr.write(String((err as Error).stack ?? err) + "\n");
	}
	process.exit(1);
});
