---
id: 1a1ab01a
title: Move pearls directory from .pi/pearls to pearls
tags: [migration]
status: closed
created_at: 2026-11-18T19:35:47Z
priority: 2
closed_at: 2026-11-20T16:32:20Z
slug: move-pearls-directory-from-pi-pearls-to
---

# Move pearls directory from .pi/pearls to pearls

## Description

Change the default pearls directory location from `WHEREVER/.pi/pearls` to
`WHEREVER/pearls`.

## Decisions (grill session 2026-11-18)

1. **Location: repo root.** `pearls/` sits alongside `src/`, `extensions/`,
   etc. The resolver walks up from cwd looking for `pearls/` (instead of
   `.pi/pearls/`). Pearls stay per-project.
2. **Migration: explicit command.** New `pearls migrate-dir` command moves
   `.pi/pearls` → `pearls/`. Nothing ever moves automatically — consistent
   with the on-demand archive philosophy.
3. **Collisions: error out.** Migration refuses if the target `pearls/`
   already exists and is non-empty; the user resolves it manually.
   (Empty/absent target is fine.)
4. **Read compatibility: fallback indefinitely.** Resolver prefers
   `pearls/` walking up from cwd; if not found, falls back to `.pi/pearls`
   (like the legacy JSON layouts). If both exist, `pearls/` wins.
5. **`PEARLS_DIR`: unchanged.** Full verbatim override — if set, it is used
   as-is, no walk-up, no fallback. Honored by both extension and CLI.
6. **Extension changes in lockstep.** `extensions/pearls.ts` gets the same
   resolution change in the same release; extension and CLI share the
   logic, so there is no split-brain window.

## Notes

- `settings.json`, `archive/` subdirectory, and lock files all move with
  the directory; in-flight lock holders are left to lock TTL.
- Note for lock files: the migration command should probably refuse to run
  while any `.lock` file is live (or just move them and let TTL handle it —
  implementer's judgment).
- `.gitignore` update: `.pi/pearls/*.lock` → also cover `pearls/*.lock`
  (keep the old pattern during the fallback era).

## Scope

- `extensions/pearls.ts` + `src/pearls-wrapper.ts` (shared path resolution)
- `src/cli.ts` — new `migrate-dir` command (help text, `--json`, `--dry-run`)
- `src/completions.ts` — new command + flags
- tests (both layouts, fallback order, collision refusal, PEARLS_DIR
  override, migration round-trip)
- docs (README, `docs/file-layout.md`, `skills/pearls/SKILL.md`)
- migrate this repo's own `.pi/pearls` → `pearls/` as part of the change
