# Remove automatic GC/archiving

## Description

Automatic retirement of closed pearls on startup was a bad idea: files moved (or vanished with `archive: false`) without anyone asking. Remove the machinery entirely; archiving is now purely on-demand via `pearls archive` / the `archive` tool action.

## Scope

- Delete `garbageCollectTodos` and its invocation on session/startup (extension + CLI); delete the `--no-gc` flag.
- Settings: drop `gc` and `archive` keys; the threshold setting becomes `archiveDays` (default 30), reading a legacy `gcDays` value as fallback so existing settings files keep working.
- `archiveClosedTodos` / `pearls archive` stay, now the only retirement path.
- Update help, quickstart, README, SKILL.md, completions, this repo's settings.json, tests; version bump 0.9.0 → 0.10.0.

## Acceptance

- Startup never moves or deletes pearls, whatever settings say.
- `pearls archive` still works, defaults to `archiveDays` (legacy `gcDays` honored).
- Tests cover: no startup archiving, archive command behavior unchanged, legacy gcDays fallback.

## Done

Automatic GC/archiving removed entirely (v0.10.0, 304/304 checks on tsx and dist):

- **extensions/pearls.ts**: `garbageCollectTodos` deleted; `session_start` only ensures the dir — pearls are never moved or deleted automatically. Settings are now `{ archiveDays, layout }`; `gcDays` is read as a legacy alias for `archiveDays`, `gc`/`archive` keys are ignored. `archiveClosedTodos` (the `archive` tool action / `pearls archive`) is the only retirement path.
- **CLI**: startup GC gone; `--no-gc` kept as a documented deprecated no-op (still parses as a boolean so existing scripts don't break). `pearls archive` defaults to `archiveDays`. Help/quickstart/completions updated.
- **Tests**: "archive on gc" section replaced by "no automatic archiving" (startup moves nothing, no archive dir created, then on-demand archive over legacy settings preserves the M-prefix/created_at-fallback coverage); archive-command section uses legacy `gcDays` settings to prove the alias.
- **Docs**: README, SKILL.md; repo settings.json now `{ "archiveDays": 30, "layout": "footer" }`.

---
{
  "id": "e67f1d93",
  "title": "Remove automatic GC/archiving",
  "tags": [
    "feature",
    "archive"
  ],
  "status": "closed",
  "created_at": "2026-11-06T15:58:22.983Z",
  "priority": 1,
  "slug": "remove-automatic-gc-archiving"
}
