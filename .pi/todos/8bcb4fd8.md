{
  "id": "8bcb4fd8",
  "title": "Docs: README, CLI help, quickstart and SKILL.md for the new layout",
  "tags": [
    "docs"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:49:57.915Z",
  "priority": 2,
  "parent": "cec97615"
}

# Docs: README, CLI help, quickstart and SKILL.md for the new layout

## Description

Four places describe the storage format or the command surface, and all
four go stale with this epic.

- **README.md** — "Todos live in `.pi/todos/<id>.md`" (line 15), the command
  table (add the migration command, `--slug`), the ids paragraph (line 99)
  which says the raw `<hex>` filename is an accepted id form, and a new
  short section on the archive directory and how GC behaves now.
- **`HELP` in `src/cli.ts`** — `--slug` on create/update, the migration
  command, and the `--no-gc` blurb which should mention that GC now archives
  rather than deletes.
- **`QUICKSTART` in `src/cli.ts`** — the "WHAT THIS IS" paragraph names
  `.pi/todos/<id>.md`, and "WHAT NOT TO DO" tells agents not to hand-edit
  files; add that renaming a pearl file by hand breaks nothing as long as
  the `T<hex>-` prefix survives, since the hex is the id.
- **`skills/pearls/SKILL.md`** — the quick-reference table and the "IDs"
  section; agents read this to drive the CLI, so `--slug` belongs in the
  create example. Bump the skill's `metadata.version`.
- **`AGENTS.md`** — no change needed, it is the original project brief.

Also bump the package version, and add a short note to the README covering
what happens on an un-migrated checkout (legacy names keep working) so
nobody panics at a mixed directory.

## Also document

- `pearls reslug <id>` and the rename policy: the slug is frozen at
  creation, `update --title` does not rename.
- That `.pi/todos/archive/` is committed to git, and that `pearls delete`
  is still a true delete while GC archives.
- `list-all --archived`.
