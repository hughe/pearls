# Change the pearls path from .pi/todos to .pi/pearls.  Add this to the migration code.

## Description

## Result

- `extensions/pearls.ts`: default dir is now `.pi/pearls` (`.pi/todos` kept as a legacy fallback in the walk-up search so un-migrated checkouts keep working; `.pi/pearls` wins when both exist). Error message updated.
- `src/migrate-filenames.ts`: `pearls migrate-filenames` now moves a legacy `.pi/todos` directory to `.pi/pearls` before the filename pass (git mv preferred so history follows; skipped when PEARLS_DIR/PI_TODO_PATH/--pearls-dir explicitly points at the old path; error if `.pi/pearls` already exists). New `dirMove` field in the result, printed in human output and included in --json.
- Help text, quickstart, README, SKILL.md, .gitignore updated (legacy lock rule kept alongside the new one).
- `test/cli.sh`: new "legacy directory location" section (11 checks) covering dry-run, the move, idempotency, and .pi/pearls preference. 236/236 pass in both tsx and dist modes.
- This repo's own directory was migrated: `git mv .pi/todos .pi/pearls`, renames staged, history intact.

---
{
  "id": "f89cb653",
  "title": "Change the pearls path from .pi/todos to .pi/pearls.  Add this to the migration code.",
  "tags": [],
  "status": "closed",
  "created_at": "2026-09-07T21:00:12.384Z",
  "priority": 1,
  "closed_at": "2026-09-07T21:54:37.886Z",
  "slug": "change-the-pearls-path-from-pi-todos-to"
}
