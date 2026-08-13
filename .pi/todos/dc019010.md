{
  "id": "dc019010",
  "title": "Slug derivation: --slug flag, sanitiser, and slug front-matter field",
  "tags": [
    "naming",
    "cli"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:48:36.279Z",
  "priority": 1,
  "parent": "cec97615"
}

# Slug derivation: --slug flag, sanitiser, and slug front-matter field

## Description

Foundation for the whole epic: one pure function that turns a title or an
explicit `--slug` into the filename-safe fragment, plus the plumbing to
carry it.

## Scope

- `slugifyTodo(input: string): string` in `extensions/pearls.ts`:
  - lowercase the input;
  - replace every character outside `[a-z0-9]` with `-` (this covers
    spaces, `/`, `:`, quotes, emoji, and the rest);
  - collapse runs of `-` to a single `-`;
  - trim leading and trailing `-`;
  - **then** truncate to 40 chars, and re-trim any trailing `-` the cut
    created. Sanitise-then-truncate, so 40 chars are 40 useful chars.
- `--slug <text>` added to `KNOWN_STRING_FLAGS` in `src/cli.ts`, accepted by
  `create` and `update`. The flag's value goes through the same sanitiser —
  a `--slug` containing a `/` must not escape the todos directory.
- Slug source precedence: explicit `--slug`, else the title.
- Optional `slug` field on `TodoFrontMatter`, parsed in `parseFrontMatter`
  and emitted by `serializeTodo` only when set, so untouched files keep a
  byte-identical front matter.

## Worked examples

- `Fix the login page` -> `fix-the-login-page`
- `TUI: Ctrl+Shift+M filter toggle for memories in /pearls`
  -> `tui-ctrl-shift-m-filter-toggle-for-memor`
- `CLI v0.1 done: list/get/create/update/append/delete/...`
  -> `cli-v0-1-done-list-get-create-update-app`
- `???` -> `untitled`

## Edge cases

- Input that sanitises to the empty string falls back to the literal
  `untitled`, so every filename has the same shape.
- Reserved Windows device names (`con`, `nul`, `aux`, …) are harmless
  because the name always starts with `T<hex>-`.
- A 40-char cut landing mid-word is fine; the hex prefix carries identity,
  the slug only has to be recognisable.

## Done when

`slugifyTodo` is exported and covered by the shell tests added in the
testing child; `--slug` parses on create and update; the field round-trips
through write/read without disturbing files that do not use it.
