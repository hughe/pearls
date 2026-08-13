{
  "id": "37ef967e",
  "title": "Archive closed pearls on GC instead of deleting them",
  "tags": [
    "archive",
    "gc"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:49:26.455Z",
  "priority": 1,
  "parent": "cec97615",
  "slug": "archive-closed-pearls-on-gc-instead-of-d"
}

# Archive closed pearls on GC instead of deleting them

## Description

Part C. `garbageCollectTodos` currently calls `fs.unlink` on any closed
pearl past the age threshold — the work is simply gone. It moves the file
into `<todosDir>/archive/` instead.

## Scope

- `garbageCollectTodos` (`extensions/pearls.ts`, ~line 897): create
  `<todosDir>/archive/` on demand and `fs.rename` the file into it rather
  than unlinking. Handle the cross-device `EXDEV` case with a copy + unlink
  fallback, since a todos dir can sit on a different mount to its parent.
- The archive is always resolved relative to the todos directory, so it
  follows `--todo-dir` and `$PEARLS_DIR` and a scratch dir gets its own
  archive.
- Name collision in the archive (same id already archived, e.g. after a
  reopen and re-close): suffix rather than overwrite.
- Settings: add `archive: true` to `DEFAULT_TODO_SETTINGS` and
  `normalizeTodoSettings`, so `archive: false` restores the old
  delete-on-GC behaviour. `gc` and `gcDays` keep their current meaning.
- Both entry points share this function — the CLI's startup GC in
  `src/cli.ts` and the Pi extension's `session_start` handler (~line 1777) —
  so one change covers both surfaces.

## Read path

`listTodos` uses a non-recursive `readdir` and filters on `.md`, so the
`archive` subdirectory is skipped for free and `list` / `list-all` stay
clean.

- `get <id>` and `path <id>` still resolve archived pearls: `findTodoPath`
  checks the archive directory after the main one, so a link in an old
  commit message keeps working.
- `list-all --archived` includes the archive in the listing. A flag, not a
  new command.

## Decided

- `pearls delete` stays a true delete — the quickstart frames it as "for
  mistakes only", and a typo'd pearl should not clutter the archive.
- `.pi/todos/archive/` is committed to git. Only `*.lock` stays ignored, so
  the existing `.gitignore` rule needs no change; confirm archived pearls
  are not accidentally caught by it.

## Related

The `created_at` / `closed_at` GC timing bug is its own child
(TODO-90066643) and should land alongside this one — without it, every
pearl this repo has ever closed moves to the archive on the first GC pass.

## Done when

A pearl closed longer than `gcDays` ago ends up in `.pi/todos/archive/`
after a GC pass, is absent from `list-all`, appears under
`list-all --archived`, and is still readable via `get`.
