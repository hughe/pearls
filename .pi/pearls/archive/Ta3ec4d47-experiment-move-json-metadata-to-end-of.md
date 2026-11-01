# Experiment: Move JSON metadata to end of item files

## Description

Currently pearls items store metadata as JSON frontmatter at the top of the file. Experiment with moving the JSON metadata to the **end** of the item file instead, after the markdown body:

```
Markdown Text ...

---
JSON metadata
```

Rationale: having the human-readable markdown body first makes files easier to read/edit directly, with machine metadata tucked at the bottom like a signature/footer.

## Notes

- Should probably be behind a feature flag / experimental setting so existing items keep working (or a migration path).
- Need to handle backward compatibility with files that still use frontmatter.
- Update the parser/serializer in src accordingly.
- Verify list/get/create/update/append round-trips still work.

## Requirements

- **Backward compatible**: the reader must continue to support items with JSON frontmatter at the top, so mixed-layout items work during and after migration.
- **Migration command**: the command to change layouts should rewrite **all** existing pearl files to the new layout (frontmatter → footer and vice versa).

## Progress log (2026-09-15)

Implemented and shipped:

- **`extensions/pearls.ts`**
  - New `TodoLayout` type (`"frontmatter" | "footer"`) plus a `layout` key in `settings.json` (default `"frontmatter"`); added `writeTodoSettings`.
  - Reader: `splitFrontMatter` now detects the footer layout too — markdown body, then a `---` separator line, then the JSON metadata. Detection requires the last `---` line to be followed by a single complete parseable JSON object, so bodies that merely end with `---` and prose (or contain `---` inside) are unaffected. Backward compatible: files starting with `{` keep parsing exactly as before; both layouts can mix freely.
  - Writer: `serializeTodo(todo, layout)`; footer layout writes `body\n\n---\n{json}\n`. `writeTodoFile` resolves the layout from the directory's `settings.json` (walking up from `archive/`), or takes an explicit layout override.
- **`src/migrate-layout.ts`** (new) — `migrateTodoLayout` rewrites every pearl in the todos dir *and* archive under per-id locks, then flips `layout` in `settings.json` so future create/update/append writes match. `--dry-run` supported.
- **`src/cli.ts`** — new `migrate-layout` command: `pearls migrate-layout --to footer|frontmatter [--dry-run] [--json]`. Help, quickstart, and zsh completions updated.
- **Tests** — new "layout migration" section in `test/cli.sh`: dry-run safety, validation errors, markdown-first output, round-trips, mixed-layout backward compat, layout persistence across create/update/append/claim/close, `---` inside body, idempotent second run. Full suite: 269/269 passing (tsx and dist).

## Caveat

Footer layout is intentionally experimental: the upstream Pi `todo` extension only understands the frontmatter layout, so a directory flipped to footer diverges from Pi until the upstream adopts the reader. `migrate-layout --to frontmatter` restores it. This repo's own `.pi/pearls` was left in the default layout; try it with `pearls migrate-layout --to footer --dry-run`.

## Correction (2026-09-15, later)

The "Caveat" above was based on a wrong assumption. There is no upstream to stay compatible with: `extensions/pearls.ts` was seeded from mitsuhiko's `todos.ts` but is pearls' own canonical implementation — it is what both the CLI and Pi's `/pearls` UI load, and it will never flow back upstream. So the footer layout is safe to use everywhere; both layouts are fully supported by the one reader that exists. Docs (README intro, CLI header, wrapper header) were updated to reflect that `extensions/pearls.ts` is maintained as pearls' own code, and the upstream-compat caveat was removed. 269/269 tests still pass.

---
{
  "id": "a3ec4d47",
  "title": "Experiment: move JSON metadata to end of item files (footer instead of frontmatter)",
  "tags": [
    "experimental",
    "format"
  ],
  "status": "closed",
  "created_at": "2026-09-15T15:01:34.416Z",
  "priority": 2,
  "slug": "experiment-move-json-metadata-to-end-of"
}
