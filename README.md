# Pearls

An agent-friendly to-do list manager, inspired by [Beads](https://github.com/steveyegge/beads)
and wrapped around Armin Ronacher's
[`todos.ts`](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/todos.ts)
extension for [Pi](https://github.com/mariozechner/pi).

`pearls` is a thin CLI around Armin's `todos.ts`. It is **not** Pi-specific
— any coding agent that can run a shell command (Claude Code, Cursor,
Aider, Codex, a plain bash agent, etc.) can drive todos through `pearls`,
and a human can use the same commands from the terminal. If you do happen
to be running Pi, its `/todos` UI reads and writes the same files, so all
three surfaces stay in sync.

Todos live in `.pi/todos/<id>.md` (override with `--todo-dir` or
`$PI_TODO_PATH`). They are intended to be **committed to the repo** so
everybody — humans and agents, on every checkout — sees the same backlog.
Only the per-session `*.lock` files are gitignored.

## Layout

- `extensions/todo.ts` – a verbatim copy of Armin's Pi extension, with a
  single-line `@ts-nocheck` marker and `export` added to the handful of
  storage/logic functions the CLI reuses. No behaviour changes.
- `src/todo-wrapper.ts` – a small re-export bridge that types the subset
  of exports the CLI needs.
- `src/cli.ts` – the `pearls` CLI. All commands dispatch into functions
  that already exist in `extensions/todo.ts`.

## Install

```sh
npm install
npm run build
# then either invoke ./dist/src/cli.js directly, npm link to get `pearls`
# on PATH, or use `npm run pearls -- <args>` for dev.
```

Requires Node ≥ 20.

## Usage

```sh
pearls help                                    # list commands
pearls create "Write README" --tag docs        # create a todo
pearls list                                    # human output
pearls list --json                             # machine-readable (matches Pi tool output)
pearls search readme                           # fuzzy-search open todos
pearls search readme --closed                  # include closed todos in results
pearls get TODO-deadbeef                       # show one
pearls append TODO-deadbeef --stdin-body < notes.md
pearls close TODO-deadbeef                     # shortcut for --status closed
pearls claim TODO-deadbeef --session mysession # --force to steal
```

For an agent that isn't Pi, the typical loop is:

```sh
pearls list --json                             # decide what to work on
pearls claim TODO-deadbeef --session $AGENT_ID # avoid double-work
# …do the work…
pearls append TODO-deadbeef --stdin-body       # record progress
pearls close TODO-deadbeef                     # done
```

Global flags:

- `--todo-dir <path>` — override the todos directory (default `.pi/todos`
  or `$PI_TODO_PATH`). The flag sets `PI_TODO_PATH` internally, so the
  resolution matches Pi exactly.
- `--session <id>` — identifies the caller for claim/release. Defaults to
  `$PEARLS_SESSION` or `cli:<user>@<host>`.
- `--json` — emit a stable JSON payload (identical to what Pi's `todo`
  tool returns to an LLM), suitable for any agent that parses tool output.
- `--no-gc` — skip startup GC of old closed todos.

## Commands

| Command                 | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `list`                  | Open + assigned todos (default).                                     |
| `list-all`              | Includes closed.                                                     |
| `search <query…>`       | Fuzzy-search by id / title / tags / status / assignment. Prints `TODO-<id>  <title>` per match. Add `--closed` to include closed todos; add `--json` for the same shape as `list --json`. |
| `get <id>` / `show <id>`| Single todo, body included.                                          |
| `create <title…>`       | `--tag` (repeatable), `--status`, `--body`, `--body-file`, `--stdin-body`. |
| `update <id>`           | Same body sources, plus `--title`, `--status`, `--tag` (replaces).   |
| `append <id>`           | Append markdown to body (from `--body` / file / stdin).              |
| `close <id>`            | Shortcut for `update --status closed`.                               |
| `reopen <id>`           | Shortcut for `update --status open`.                                 |
| `claim <id>`            | Assign to current session. `--force` to steal.                       |
| `release <id>`          | Release the session's assignment. `--force` to release someone else's.|
| `delete <id>`           | Remove a todo.                                                       |
| `dir`                   | Print the resolved todos directory.                                  |
| `path <id>`             | Print the absolute path to a todo's `.md` file.                      |

Ids may be written as `TODO-<hex>` or the raw `<hex>` filename; both are
accepted everywhere, matching the Pi tool.

## Tests

`test/cli.sh` is a bash smoke/integration test that drives every command
against a scratch todos directory and asserts both human and `--json`
output plus the on-disk file format.

```sh
npm test          # runs against src/cli.ts via tsx (no build needed)
npm run test:dist # builds then runs against dist/src/cli.js
```

## Status

v0.1 — CLI feature-complete against the actions exposed by Armin's
`todos.ts` tool. Memory/beads-style features described in AGENTS.md are
deliberately out of scope for now.
