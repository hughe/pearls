# Pearls

An agent-friendly to-do list manager, inspired by [Beads](https://github.com/steveyegge/beads).
Its storage format and Pi extension were seeded from Armin Ronacher's
[`todos.ts`](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/todos.ts),
which pearls has since made its own — the copy in `extensions/pearls.ts`
is the canonical implementation and diverges freely from the original.

`pearls` is a thin CLI around the pearls extension (`extensions/pearls.ts`).
It is **not** Pi-specific — any coding agent that can run a shell command
(Claude Code, Cursor, Aider, Codex, a plain bash agent, etc.) can drive
todos through `pearls`, and a human can use the same commands from the
terminal. If you do happen to be running Pi, its `/pearls` UI reads and
writes the same files through the same code, so all surfaces stay in
sync.

Todos live in `.pi/pearls/T<id>-<slug>.md`, and memories — pearls created
with `--type memory` — in `.pi/pearls/M<id>-<slug>.md` (override the
directory with `--pearls-dir` or `$PEARLS_DIR`). The hex `<id>` is what every
command resolves; the leading letter and the `<slug>` are derived from the
entry's type and title purely so the directory reads well. They are intended to be **committed to the repo** so everybody
— humans and agents, on every checkout — sees the same backlog. Only the
per-session `*.lock` files are gitignored.

Pearls written before this scheme are named `<id>.md`. They keep working
everywhere — an un-migrated checkout is never broken — and
`pearls migrate-filenames` converts them. The same command moves a legacy
`.pi/todos/` directory to `.pi/pearls/` (both locations are found by the
walk-up search, so nothing breaks before you migrate).

Closed todos are not deleted when they age out: `pearls` moves them to
`.pi/pearls/archive/`, which is committed alongside the backlog.

## Layout

- `extensions/pearls.ts` – a vendored copy of Armin's Pi extension, renamed
  to `pearls` (activated via `/pearls` in Pi). A single-line `@ts-nocheck`
  marker and `export` added to the handful of storage/logic functions the
  CLI reuses. No behaviour changes beyond the rename.
- `src/pearls-wrapper.ts` – a small re-export bridge that types the subset
  of exports the CLI needs.
- `src/cli.ts` – the `pearls` CLI. All commands dispatch into functions
  that already exist in `extensions/pearls.ts`.

## Install

For a global install for your user (builds this checkout and installs into
your npm prefix — no root required):

```sh
scripts/install.sh
```

If your npm prefix is system-owned, point it at a user directory first
(`npm config set prefix ~/.npm-global`, plus `export PATH="$HOME/.npm-global/bin:$PATH"`).

Or, by hand:

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
pearls list-tags                               # count tags, like sort | uniq -c
pearls search -f readme                        # fuzzy-search open todos
pearls search -f readme --closed               # include closed todos in results
pearls get Tdeadbeef                           # show one
pearls create "A long title" --slug short      # choose the filename slug
pearls migrate-filenames --dry-run             # preview <id>.md + directory renames
pearls append Tdeadbeef --stdin-body < notes.md
pearls close Tdeadbeef                         # shortcut for --status closed
pearls claim Tdeadbeef --session mysession     # --force to steal
```

For an agent that isn't Pi, the typical loop is:

```sh
pearls list --json                             # decide what to work on
pearls claim Tdeadbeef --session $AGENT_ID     # avoid double-work
# …do the work…
pearls append Tdeadbeef --stdin-body           # record progress
pearls close Tdeadbeef                         # done
```

Global flags:

- `--pearls-dir <path>` — override the todos directory (default `.pi/pearls`
  or `$PEARLS_DIR`). The flag sets `PEARLS_DIR` internally, so the
  resolution matches Pi exactly. `--todo-dir` is a deprecated alias.
- `--session <id>` — identifies the caller for claim/release. Defaults to
  `$PEARLS_SESSION` or `cli:<user>@<host>`.
- `--json` — emit a stable JSON payload (identical to what Pi's `todo`
  tool returns to an LLM), suitable for any agent that parses tool output.
- `--no-gc` — skip startup GC of old closed todos.

Storage settings live in `<todos-dir>/settings.json`:

- `gc` (default `true`) — retire closed todos on startup.
- `gcDays` (default `30`) — how long after `closed_at` a todo is retired.
  Todos closed before `closed_at` existed fall back to `created_at`.
- `archive` (default `true`) — move retired todos to `<todos-dir>/archive/`
  instead of deleting them.
- `layout` (default `"frontmatter"`) — which on-disk layout new writes
  use: `"frontmatter"` (JSON at the top) or `"footer"` (markdown first,
  JSON at the bottom after a `---` separator). Managed by
  `pearls migrate-layout`; both layouts are always readable.

## Commands

| Command                 | Notes                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `list`                  | Open + assigned todos (default). Closed todos are hidden at every level of the tree, children of an epic included. |
| `list-all`              | Includes closed. A closed child is shown nested under its epic, not repeated as a flat entry. `--archived` also includes the archive. |
| `list-tags` / `tags`    | Counts tags on open + assigned todos, like `sort | uniq -c`. Add `--closed` to include closed todos; `--archived` also includes the archive. `--json` emits entries like `{"tag":"docs","count":2}`. |
| `search <query…>`       | Fuzzy-search by id / title / tags / status / assignment. Prints `T<id>  <title>` per match. Add `--closed` to include closed todos; add `--json` for the same shape as `list --json`. |
| `get <id>` / `show <id>`| Single todo, body included.                                          |
| `create <title…>`       | `--tag` (repeatable), `--status`, `--body`, `--body-file`, `--stdin-body`, `--slug` (filename slug; defaults to the title). |
| `update <id>`           | Same body sources, plus `--title`, `--status`, `--tag` (replaces), `--slug` (renames the file). |
| `append <id>`           | Append markdown to body (from `--body` / file / stdin).              |
| `close <id>`            | Shortcut for `update --status closed`.                               |
| `reopen <id>`           | Shortcut for `update --status open`.                                 |
| `claim <id>`            | Assign to current session. `--force` to steal.                       |
| `release <id>`          | Release the session's assignment. `--force` to release someone else's.|
| `delete <id>`           | Remove a todo.                                                       |
| `dir`                   | Print the resolved todos directory.                                  |
| `path <id>`             | Print the absolute path to a todo's `.md` file.                      |
| `view <id> [mdv-args]`  | Open the pearl in [mdv](../mdv), which renders it in your browser. pearls runs mdv in the foreground and exits with its status. Extra args after `<id>` go to mdv (a port, or flags after `--`, e.g. `-- -n` for one-shot mode). Requires `mdv` on `$PATH`. |
| `mdv <id> [mdv-args]`   | Alias for `view`.                                                     |
| `reslug <id>`           | Re-derive the filename slug from the current title and rename.       |
| `migrate-filenames`     | Bring filenames up to date: legacy `<id>.md` files become `T<id>-<slug>.md`, and memories still lettered `T` become `M<id>-<slug>.md`. Also moves a legacy `.pi/todos/` directory to `.pi/pearls/`. `--dry-run` previews; `git mv` is used for tracked files so history follows. |
| `migrate-layout`        | Move the JSON metadata block of every pearl between the two on-disk layouts: `--to frontmatter` (default: JSON at the top) or `--to footer` (markdown body first, JSON after a `---` separator at the bottom). `--dry-run` previews. Also updates `settings.json` so future writes use the chosen layout. Both layouts are always readable, so the directory keeps working during and after the switch. |
| `quickstart`            | Print an agent-oriented guide to the typical pearls loop.            |
| `version`               | Print the pearls version (same as `--version`).                       |
| `completions <shell>`   | Print a shell completion script to stdout. Currently `zsh` (the
  default).                                                          |

Ids are displayed as `T<hex>` for todos and `M<hex>` for memories, matching
the letter on the file. Input is forgiving: the bare `<hex>`, either letter,
and the older `TODO-<hex>` form are all accepted everywhere.

Renaming a pearl file by hand is safe as long as the `T<hex>-` / `M<hex>-`
prefix survives — that hex is the id, and the letter and slug are only
decoration (the front matter `type` is what actually makes something a
memory). Retitling a
todo deliberately does *not* rename its file; use `reslug` for that.

## File layout

Each pearl is a markdown file plus a JSON metadata block. Two layouts are
supported:

```
frontmatter (default)      footer
-----------------------------------------------------------------
{                          # Title
  "id": "…",              body text
  "title": "…"
}                          ---
                           { "id": "…", "title": "…" }
# Title
body text
```

Reading always supports both layouts, so a directory can mix them freely
(`migrate-layout` rewrites every pearl and records the choice in
`settings.json` so future writes match). The footer layout puts the
human-readable text first. It is flagged experimental only because it is
new — the CLI and the Pi extension share the same reader, so everything
understands both layouts.

## Shell completions

`pearls completions zsh` prints a zsh completion script on stdout — it
completes commands, flags, and pearl ids (live, from `pearls list-all`).
Install it for this user with one command — the script auto-detects
oh-my-zsh (installs into `$ZSH/custom/completions`, which oh-my-zsh
already puts on `fpath`) and falls back to `~/.zfunc` otherwise,
printing the lines to add to `.zshrc`:

```sh
scripts/install-completions.sh
```

Or install it manually anywhere on your `fpath`:

```sh
pearls completions zsh > "${fpath[1]}/_pearls"
```

or, without touching system directories:

```sh
mkdir -p ~/.zfunc
pearls completions zsh > ~/.zfunc/_pearls
# in .zshrc:  fpath=(~/.zfunc $fpath)  then  autoload -Uz compinit && compinit
```

Then restart your shell (`exec zsh`) and try `pearls <Tab>`. If the
completions seem stale, zsh's cached dump is the usual culprit — remove it
and restart:

```sh
rm -f ~/.zcompdump* && exec zsh
```

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
