# Pearl file layout

Every pearl is a single markdown file with Obsidian-compatible YAML
front matter. The leading `---` fence is the first three bytes of the
file:

```
---
id: 0f1e2d3c
title: My note
tags: [rust, sqlite]
status: open
created_at: 2026-11-16T23:31:34Z
priority: 1
slug: my-note
---
# My note

body text
```

## Writer rules

The writer emits exactly one canonical form:

- `---\n{yaml}---\n\n{body}\n` (or `---\n{yaml}---\n` when the body is
  empty).
- Only set fields appear; unset ones (`tags`, `priority`, `parent`,
  `type`, `closed_at`, `assigned_to_session`, `slug`) are omitted
  entirely.
- Datetimes (`created_at`, `closed_at`) are UTC in Obsidian style,
  `YYYY-MM-DDTHH:mm:ssZ` — no milliseconds.
- `tags` is written as a flow sequence (`tags: [a, b]`).
- The body is trimmed at both ends and opens with a `# Title` heading.
  That heading is cosmetic; the front matter `title` is canonical, and
  `pearls update --title` rewrites the heading to match.

Serialization uses the [`yaml`](https://eemeli.org/yaml/) package, so
titles needing quoting (colons, `#`, leading dashes, …) are escaped
correctly.

Because the writer always re-emits the whole file in canonical form, a
hand-edited pearl is normalised the next time pearls writes to it —
including a pearl that still sits in a legacy layout.

## Reader algorithm

The reader must answer one question for a raw file: *where does the
metadata live?* It is deliberately forgiving — an unrecognised file is
treated as all-body with empty metadata rather than an error, and the
id always comes from the filename, never the content.

Three layouts are accepted, indefinitely:

1. **YAML front matter** (canonical) — a `---` fence as the first line
   of the file, closed by the first later `---` line. The text between
   the fences is the metadata; everything after the closing fence is
   the body. Only the *first* closing fence counts, so a body that
   itself contains `---` lines (markdown hr rules) round-trips fine.
2. **JSON front matter** (legacy) — a bare `{...}` block at the very
   top of the file, found with a depth-counting scan
   (`findJsonObjectEnd`) that tracks string state so braces inside
   string values don't count as structural.
3. **JSON footer** (legacy) — the markdown body first, then a trailing
   `---` line and a single complete JSON object. `splitFooterMatter`
   searches backwards for the *last* separator line and validates that
   everything after it is one parseable JSON object.

### Dispatch order

```
if content starts with a "---" fence line
     → try YAML front matter (first closing fence wins)
else if content starts with "{" → JSON front matter
else                             → try JSON footer
```

YAML is checked first so a canonical file is never mistaken for a
body-first (footer) file. A file that starts with `---` but has no
closing fence falls through to the footer/JSON checks like anything
else.

### Parsing the metadata text

`safeMetadataParse` dispatches on the first character of the raw
metadata text: `{` means legacy JSON (`JSON.parse`), anything else is
YAML (`YAML.parse` — this is the text *between* the fences, so a YAML
front matter block never starts with `{`). YAML date scalars that the
parser resolves to `Date` objects are normalised to ISO strings so the
shared field validation always sees strings. Any parse failure yields
empty metadata (with the filename still supplying the id).

### Why this is safe

The footer check — *last* separator + full-line `---` + complete
parseable JSON object to EOF — means ordinary markdown that happens to
end with `---` and prose falls through to "all body". A YAML-frontmatter
pearl whose body contains `---` is safe twice over: the fence detector
stops at the first closing fence, and even if it didn't, the footer
scanner only accepts a JSON tail.

### Known edge cases

- A body that *literally ends* with a `---` line followed by a bare
  JSON object is indistinguishable from a real legacy footer by content
  alone. Accepted: don't end a pearl body that way.
- A hand-written file that opens with a `---` fence but never closes it
  is not treated as front matter (the fence pair must be complete).

## Complexity

All three detectors are single O(n) passes (the footer scanner is
worst-case O(k·n) for k separator candidates, but the real one is at
the end of the file and is found first). The implementation lives in
`extensions/pearls.ts`: `splitFrontMatter` dispatches,
`splitYamlFrontMatter` handles fences, `splitFooterMatter` the legacy
footer, and `serializeYamlFrontMatter` + `serializeTodo` write the
canonical form.

## Migrating

Legacy files are read indefinitely, so no migration is *required* — any
write re-emits the file as YAML front matter. `pearls migrate-layout`
bulk-converts a directory (including the archive) and prunes the
retired `layout` key from `settings.json`; `--dry-run` previews.
