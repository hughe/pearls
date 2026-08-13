{
  "id": "a19c302f",
  "title": "Write new pearls under T<hex>-<slug>.md, plus a reslug command",
  "tags": [
    "naming",
    "cli"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:49:21.021Z",
  "priority": 1,
  "parent": "cec97615",
  "slug": "write-new-pearls-under-t-hex-slug-md-plu"
}

# Write new pearls under T<hex>-<slug>.md, plus a reslug command

## Description

Wire the sanitiser and the resolver together on the write path, so newly
created pearls land under the new name.

## Scope

- `cmdCreate` (`src/cli.ts`): compute `slug` from `--slug` or the title,
  store it in the front matter, and write to `todoFileName(id, slug)`.
- `import-beads`: same treatment, slug from the imported issue title, so a
  bulk import produces readable filenames rather than 400 hex names.
- The Pi extension's own create paths (tool `create` action and the TUI
  memory creation around lines 1907 / 2243 / 2274) must agree, or Pi and the
  CLI produce different layouts in the same directory.

## Rename policy (decided)

The slug is **frozen at creation**. `update --title` changes the title and
leaves the filename alone — routine title fixes should not churn git
history or invalidate a path someone copied.

Two ways to rename deliberately:

- `update <id> --slug <text>` — set the slug explicitly;
- `reslug <id>` — re-derive the slug from the current title.

Both perform the move inside the existing `withTodoLock` block: write the
new file, then unlink the old, so an interrupted rename never leaves two
files claiming one id. Both are no-ops when the target name already matches.
`reslug` with no id could re-derive the whole directory, but that overlaps
`migrate-filenames` — keep `reslug` single-pearl and let the migration
command handle bulk.

## Done when

`pearls create "Fix the login page"` produces
`.pi/todos/T<hex>-fix-the-login-page.md`, `pearls path <id>` prints it,
`get` / `append` / `close` round-trip against it, `update --title` leaves
the name untouched, and `reslug` moves it.
