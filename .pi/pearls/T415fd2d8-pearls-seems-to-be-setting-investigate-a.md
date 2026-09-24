# Pearls seems to be setting core.bare=true. Investigate and if this is true, remove it. Pearl should not be doing that.

## Description

## Investigation findings (2026-09-19)

**Claim is false — pearls does not set core.bare=true.**

- The original title lost its subject to zsh command substitution: the backticked `core.bare=true` inside double quotes was executed as a command (not found) and expanded to nothing, so the stored title read "setting .".
- Pearl's only git interaction is in `src/migrate-filenames.ts`: `git rev-parse --is-inside-work-tree`, `git ls-files --error-unmatch`, and `git mv`. None of these write git config.
- `extensions/pearls.ts` spawns no processes — it is pure file I/O under `.pi/pearls`.
- Verified on disk: no `.git/config` under /home/hugh/projects has `bare = true`; this repo has `core.bare=false` (untouched since May 2); `~/.gitconfig` has no bare setting; `dist/` matches source.
- Nothing to remove. Closed as investigated-and-refuted.

---
{
  "id": "415fd2d8",
  "title": "Pearls seems to be setting core.bare=true. Investigate and if this is true, remove it. Pearl should not be doing that.",
  "tags": [],
  "status": "closed",
  "created_at": "2026-09-19T19:11:17.925Z",
  "priority": 0,
  "closed_at": "2026-09-19T19:15:37.231Z",
  "slug": "pearls-seems-to-be-setting-investigate-a"
}
