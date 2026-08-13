{
  "id": "cec97615",
  "title": "Epic: slug-based pearl filenames + archive instead of delete",
  "tags": [
    "epic",
    "naming",
    "archive",
    "cli"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:48:05.939Z",
  "priority": 1,
  "slug": "epic-slug-based-pearl-filenames-archive"
}

# Epic: slug-based pearl filenames + archive instead of delete

## Description

Three related changes to how pearl files are named and retired.

**A. Rename scheme.** Pearl files become `T<hex>-<slug>.md` (today they are
`<hex>.md` — note the on-disk name has no `TODO-` prefix; that prefix only
exists in *display* form via `formatTodoId`). `<slug>` comes from a new
`--slug` flag, falling back to the title, sanitised for filesystem safety
and truncated to 40 chars.

**B. Migration mode.** `pearls migrate-filenames`, which renames existing
pearls into the new scheme (dry-run first, `git mv` where possible).

**C. Archive instead of delete.** `garbageCollectTodos` currently `unlink`s
old closed pearls. It moves them into `.pi/todos/archive/` instead.

## Why this is not a one-line change

The filename *is* the id today. `getTodoPath(dir, id)` composes
`dir/<id>.md`, and `listTodos` / `listTodosSync` / `garbageCollectTodos`
recover the id with `entry.slice(0, -3)`. Once the filename carries a slug,
id -> path stops being computable and becomes a lookup. That resolver is
the spine of this epic; everything else hangs off it.

Call sites that compose or decompose a pearl path:
`extensions/pearls.ts` (getTodoPath, getLockPath, generateTodoId,
listTodos, listTodosSync, garbageCollectTodos, and ~12 uses inside the Pi
extension/tool code), `src/cli.ts` (create, get, update, append, path,
refine), `src/import-beads.ts`.

## Decisions

Settled with Hugh, 2026-08-13. These are binding on the children.

1. **Slug source** — the title, when `--slug` is not given.
2. **Case** — lowercase.
3. **Truncation** — sanitise the whole title first, then cut to 40 chars.
4. **Renames** — the slug is frozen at creation. `update --title` does not
   rename; `--slug` does, and `pearls reslug <id>` re-derives from the
   title on purpose.
5. **Archive location** — `<todos-dir>/archive/`, i.e. `.pi/todos/archive/`,
   so it travels with `--todo-dir` and `$PEARLS_DIR`.
6. **Archive in git** — committed, like the pearls themselves. Only
   `*.lock` stays ignored.
7. **Delete** — `pearls delete` stays a true delete. Archiving is the GC
   path's job.
8. **GC timing** — the `created_at` / `closed_at` mismatch is a bug and is
   fixed in this epic (see the GC timing child).
9. **Migration command** — `pearls migrate-filenames`.

## Design decisions taken while planning

1. **Filename hex stays authoritative for the id.** The `T` prefix plus 8
   hex chars is the unique key; the slug is decoration and may drift from
   the title. Front matter `id` is used only as a fallback for files whose
   name does not parse.
2. **A `slug` field is added to the front matter.** It makes renames
   idempotent, lets the migration detect "already correct", and lets a
   human-chosen `--slug` survive a later title edit.
3. **Lock files stay keyed on the bare id** (`<hex>.lock`), so the existing
   `.pi/todos/*.lock` gitignore rule keeps working and locking does not
   depend on the slug being current.
4. **Legacy `<hex>.md` files keep working forever** (read path), so an
   un-migrated checkout is never broken by a newer pearls.
5. **Archived pearls stay readable** by `get` and `path`.

## Note on a live hazard

Every non-`--no-gc` pearls invocation in this repo right now would delete
all 25 previously closed pearls: `garbageCollectTodos` compares
`created_at` against `gcDays`, and every closed pearl here was created more
than 30 days ago. Part C converts that from data loss into a file move, and
the GC timing child stops it triggering at all for pearls closed recently.
Until both land, use `--no-gc` when driving pearls in this repo.

## Children, in suggested order

1. TODO-dc019010 — Slug derivation: `--slug` flag, sanitiser, front-matter field
2. TODO-4d67b5a7 — Decouple id from filename: path resolver (the structural one)
3. TODO-a19c302f — Write new pearls under `T<hex>-<slug>.md`, plus `reslug`
4. TODO-9b87e6e0 — `pearls migrate-filenames` (part B)
5. TODO-37ef967e — Archive on GC instead of delete (part C)
6. TODO-90066643 — GC ages pearls by `closed_at`, not `created_at`
7. TODO-e3dff928 — Tests
8. TODO-8bcb4fd8 — Docs
9. TODO-96cc7086 — Migrate this repo's own backlog (last)

1 and 2 are independent of each other; 3 needs both. 5 and 6 are
independent of 1-4 and should land first — together they defuse the
deletion hazard above.
