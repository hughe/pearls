# If there is no argument, run pearls list

## Description

## Progress

- 2026-11-16: Implemented in src/cli.ts. Bare `pearls` (no command) now defaults to `list` (`parsed.command ??= "list"`); `--help` / `help` still show the reference. USAGE in help documents the default. Tests added for bare `pearls` and bare `pearls --json`; 322/322 pass on src and dist. README and SKILL.md updated.

---
{
  "id": "88dde0c5",
  "title": "If there is no argument, run pearls list",
  "tags": [],
  "status": "closed",
  "created_at": "2026-11-16T00:26:24.976Z",
  "slug": "if-there-is-no-argument-run-pearls-list"
}
