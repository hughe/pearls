{
  "id": "4e7534ef",
  "title": "Find pearls directory by walking up from cwd looking for .pi/todos",
  "tags": [
    "cli",
    "enhancement"
  ],
  "status": "closed",
  "created_at": "2026-04-28T20:04:59.552Z",
  "priority": 2
}

Replace the current hardcoded `<cwd>/.pi/todos` resolution in `getTodosDir()` with a walk-up search, and introduce a new `PEARLS_DIR` env var.

## Resolution priority (highest to lowest)

1. `--todo-dir <path>` CLI flag or `PI_TODO_PATH` env var — points directly to the `.pi/todos` directory. **Deprecated.** Print a deprecation warning to stderr on CLI startup if `PI_TODO_PATH` is set.
2. `PEARLS_DIR` env var — points to the project root (the directory *containing* `.pi/todos`). Resolved as `$PEARLS_DIR/.pi/todos`.
3. Walk-up — starting from `cwd`, search each ancestor directory for one that contains `.pi/todos/`. Use `<first-match>/.pi/todos`.
4. Error — if no `.pi/todos` is found anywhere up to `/`, exit with a clear error message.

## Scope

Apply to both the CLI (`src/cli.ts`) and the Pi extension (`extensions/pearls.ts`), both of which call `getTodosDir()`.

## Implementation notes

- The walk-up logic belongs in `getTodosDir()` in `extensions/pearls.ts` (the CLI already delegates to this).
- `getTodosDirLabel()` should reflect the same priority so labels shown to the user are consistent.
- The deprecation warning for `PI_TODO_PATH` should be emitted once, at startup, before any command runs, on stderr only.
