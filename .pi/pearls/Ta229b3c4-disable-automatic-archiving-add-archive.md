# Disable automatic archiving; add archive command to CLI and Pi module

## Description

Right now archiving happens automatically: startup GC retires closed pearls older than `gcDays`
(`archive: true` moves them to `.pi/pearls/archive/`). Two deliverables:

1. **Disable automatic archiving.** Setting `"gc": false` in settings.json already stops startup
   retirement; document that as the way to disable it and flip this repo's `.pi/pearls/settings.json`
   to `gc: false`.
2. **`pearls archive` command** (bulk, not per-id): when invoked, archives every pearl that has
   been closed for N days. N defaults to `gcDays` from settings.json; `--days <n>` overrides.
   `--dry-run` previews. Runs regardless of the `gc` setting (explicit invocation is the manual
   replacement for automatic retirement). Always archives (never deletes — deletion stays with
   `pearls delete`).

## Acceptance

- `pearls archive [--days <n>] [--dry-run] [--json]` in the CLI; help/completions updated.
- Pi module (extensions/pearls.ts) exposes an `archive` action on the pearls tool.
- Shared eligibility logic with GC (closed status, age by `closed_at` with `created_at` fallback).
- README + SKILL.md document the command and how to disable automatic archiving.
- Tests in test/cli.sh cover: manual archive moves files, --dry-run, --days override, works with gc:false.

## Done

Implemented in this session (all 303 CLI checks pass, tsx + dist builds):

- **extensions/pearls.ts**: extracted `findRetirableTodos` (shared closed + age eligibility, `closed_at` with `created_at` fallback); GC now uses it unchanged; new exported `archiveClosedTodos(todosDir, days, dryRun)` archives pearls closed longer than N days on demand (always archives, never deletes). Added an `archive` action to the pearls tool (optional `days` / `dryRun` params) with agent-facing text and TUI `renderResult` support.
- **CLI**: `pearls archive [--days <n>] [--dry-run] [--json]` — bulk command, takes no id. N defaults to `gcDays` from settings.json. Help, quickstart and zsh completions updated.
- **Disabling automatic archiving**: documented that `"gc": false` in settings.json is the switch, and set it in this repo's own `.pi/pearls/settings.json`.
- README, SKILL.md updated; tests added in test/cli.sh; version bumped 0.8.3 → 0.9.0.

---
{
  "id": "a229b3c4",
  "title": "Disable automatic archiving; add archive command to CLI and Pi module",
  "tags": [
    "feature",
    "archive"
  ],
  "status": "closed",
  "created_at": "2026-11-06T15:39:27.281Z",
  "priority": 1,
  "slug": "disable-automatic-archiving-add-archive"
}
