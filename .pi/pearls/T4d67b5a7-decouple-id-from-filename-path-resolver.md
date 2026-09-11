{
  "id": "4d67b5a7",
  "title": "Decouple id from filename: path resolver over the todos directory",
  "tags": [
    "naming",
    "refactor"
  ],
  "status": "closed",
  "created_at": "2026-08-13T21:48:39.004Z",
  "priority": 1,
  "parent": "cec97615",
  "closed_at": "2026-08-13T22:34:46.182Z",
  "slug": "decouple-id-from-filename-path-resolver"
}

# Decouple id from filename: path resolver over the todos directory

## Description

The structural change. Today `getTodoPath(dir, id)` returns `dir/<id>.md`
and callers treat that as both "where this pearl lives" and "where a new
pearl should go". With a slug in the name those two meanings split apart.

## Scope

Replace the single function with three, in `extensions/pearls.ts`:

- `todoFileName(id, slug)` -> `T<hex>-<slug>.md`. Pure composition, used
  only when creating or renaming.
- `parseTodoFileName(entry)` -> `{ id, slug } | null`. Matches
  `^T([0-9a-f]{8})-(.+)\.md$` (new) and `^([0-9a-f]{8})\.md$` (legacy), so
  both layouts coexist in one directory.
- `findTodoPath(todosDir, id)` / `findTodoPathSync(todosDir, id)` -> the
  existing file for an id, or null. Implemented as a `readdir` + scan with a
  per-process cache keyed on the directory, invalidated on any write, so a
  single CLI run does not re-scan for every command.

Then update every consumer:

- `listTodos` / `listTodosSync`: derive the id via `parseTodoFileName`
  rather than `entry.slice(0, -3)`; skip entries that do not parse; surface
  the parsed `slug` on the record.
- `generateTodoId`: uniqueness currently means "no `<id>.md` exists", which
  becomes "no entry parses to this id" — must use the resolver, or a fresh
  id could collide with an existing slugged file.
- `getLockPath`: unchanged, stays `<hex>.lock` (see epic decision 3).
- `src/cli.ts`: `cmdGet`, `cmdUpdate`, `cmdAppend`, `cmdPath`, `cmdRefine`
  switch to `findTodoPath`; `cmdCreate` switches to `todoFileName`.
- `extensions/pearls.ts` Pi tool + TUI paths (roughly lines 1620-2430) do
  the same — the TUI is synchronous in places, hence the sync variant.
- `src/import-beads.ts` composes a path per imported issue.

## Watch for

- `getTodoPath` is exported through `src/pearls-wrapper.ts`; keep an export
  of that name (delegating to the resolver, falling back to the legacy
  composed path when nothing is found) so no external caller breaks
  silently.
- A pearl whose filename hex disagrees with its front-matter `id`: the
  filename wins (epic decision 1); worth a one-line warning to stderr
  rather than a silent pick.

## Done when

Every read, write, lock and delete goes through the resolver, and a
directory containing a mix of `<hex>.md` and `T<hex>-<slug>.md` behaves
identically for both.

## Done

`parseTodoFileName` recognises both `T<hex>-<slug>.md` and legacy
`<hex>.md`; `getTodoPath` became the resolver (scan the todos dir, then the
archive, then fall back to the legacy composed path so existing
`existsSync` "not found" checks still work); `newTodoPath`/`todoFileName`
handle creation. Keeping the resolver behind the existing `getTodoPath`
name meant the ~20 read call sites in the Pi tool and TUI needed no
changes at all — only the five creation sites did.

Deviation from the plan: no readdir cache. The directory is small, the CLI
is one-shot, and an invalidation bug would be worse than the scan. Worth
revisiting only if the Pi TUI shows up slow on a large backlog.
