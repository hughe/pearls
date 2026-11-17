---
id: 8b3cd549
title: Change the metadata format again
status: open
created_at: 2026-11-16T23:31:34Z
priority: 0
assigned_to_session: 01a1e6b6-9193-774b-8347-72214add64ae
slug: change-the-metadata-format-again
---

# Change the metadata format again

## Description

Replace the JSON metadata block in pearl `.md` files with Obsidian-compatible
YAML frontmatter.

### New file format

The leading `---` must be the first three bytes of the file:

```
---
title: My note
tags: [rust, sqlite]
created_at: 2026-11-16T23:31:34Z
status: open
id: T8b3cd549
---
# My first pearl
...body...
```

Decisions:

- **Field names**: unchanged from the current JSON block (`id`, `title`,
  `tags`, `status`, `created_at`, `priority`, `parent`, `type`, `closed_at`,
  `assigned_to_session`, `slug`). Obsidian-compatible values.
- **Empty/optional fields**: omitted entirely from frontmatter (no `tags: []`).
- **Title**: frontmatter `title` is canonical; a `# Title` heading remains the
  first line of the body for readability/preview. Heading edits are cosmetic;
  CLI renames update the frontmatter.
- **Datetimes**: `YYYY-MM-DDTHH:mm:ssZ` (UTC, explicit `Z`, no milliseconds)
  for `created_at` and `closed_at`.
- **YAML library**: use a real YAML library (e.g. `yaml` or `js-yaml`),
  adding a runtime dependency is acceptable.

### Compatibility

- **Reader**: accept all layouts indefinitely — YAML frontmatter, JSON
  frontmatter (leading `{`), and JSON footer (after trailing `---`).
- **Writer**: YAML frontmatter only.
- **Migration**: extend the existing `migrate-layout` command to convert
  existing files to YAML frontmatter. Also migrate footer-layout files.
- **Footer layout**: dropped as a write option.
- **Old readers**: hard cutover; no backward compatibility for older
  extension/CLI versions reading new files.
- **Other files**: `settings.json` and other JSON files are unaffected.

### Scope

Update in the same change:

- `extensions/pearls.ts` (canonical read/write)
- `src/cli.ts`, `src/pearls-wrapper.ts`, `src/migrate-layout.ts`
- tests
- shell completions (`src/completions.ts`)
- help text
- docs (README, `skills/pearls/SKILL.md`)
