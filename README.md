# Pearls

An agent-friendly to-do list manager, inspired by [Beads](https://github.com/steveyegge/beads)
and wrapped around Armin Ronacher's
[`todos.ts`](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/todos.ts)
extension for [Pi](https://github.com/mariozechner/pi).

`pearls` is a thin CLI around Armin's `todos.ts`. The Pi UI is left in
place: a human can manage todos on the command line while an agent running
in Pi uses the `/todos` tool against the same storage directory, with
matching file format, locking, GC, and per-session assignments. Both
surfaces operate on the exact same `.pi/todos/<id>.md` files.

## Layout

- `extensions/todo.ts` – a verbatim copy of Armin's Pi extension, with a
  single-line `@ts-nocheck` marker and `export` added to the handful of
  storage/logic functions the CLI reuses. No behaviour changes.
- `src/todo.ts` – a small re-export bridge that types the subset of
  exports the CLI needs.
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
pearls list --json                             # the same JSON the Pi tool emits
pearls get TODO-deadbeef                       # show one
pearls append TODO-deadbeef --stdin-body < notes.md
pearls close TODO-deadbeef                     # shortcut for --status closed
pearls claim TODO-deadbeef --session mysession # --force to steal
```

Global flags:

- `--todo-dir <path>` — override the todos directory (default `.pi/todos`
  or `$PI_TODO_PATH`). The flag sets `PI_TODO_PATH` internally, so the
  resolution matches Pi exactly.
- `--session <id>` — identifies the caller for claim/release. Defaults to
  `$PEARLS_SESSION` or `cli:<user>@<host>`.
- `--json` — emit the same JSON payload the Pi `todo` tool returns (shape
  preserved so an agent can parse pearls output the same way).
- `--no-gc` — skip startup GC of old closed todos.

## Commands

| Command                 | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `list`                  | Open + assigned todos (default).                                     |
| `list-all`              | Includes closed.                                                     |
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

## Status

v0.1 — CLI feature-complete against the actions exposed by Armin's
`todos.ts` tool. Memory/beads-style features described in AGENTS.md are
deliberately out of scope for now.
