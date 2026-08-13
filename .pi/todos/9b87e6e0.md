{
  "id": "9b87e6e0",
  "title": "Migration command: rename existing pearls into the new scheme",
  "tags": [
    "naming",
    "cli",
    "migration"
  ],
  "status": "open",
  "created_at": "2026-08-13T21:49:23.680Z",
  "priority": 1,
  "parent": "cec97615"
}

# Migration command: rename existing pearls into the new scheme

## Description

Part B of the epic: a mode that converts a directory of legacy `<hex>.md`
files (and any file whose slug has gone stale) to `T<hex>-<slug>.md`.

## Shape

`pearls migrate-filenames [--dry-run] [--force]`

Name is up for grabs — `migrate`, `rename-files`, `reslug` and `fsck` are
all plausible; `migrate-filenames` is unambiguous about what it touches.

## Behaviour

1. Scan the todos directory (and the archive directory, once part C lands —
   archived pearls should not be left in the old scheme).
2. For each entry that parses as a pearl, compute the target name from the
   front-matter `slug`, else the title. Skip entries already at the target.
3. Move: prefer `git mv` when the directory is inside a git work tree and
   the file is tracked, so git records a rename instead of a
   delete-plus-add; fall back to `fs.rename` otherwise. Detect the work tree
   once per run rather than per file.
4. Persist the derived `slug` into the front matter as part of the move, so
   a second run is a no-op.
5. Report `old -> new` per file, plus a count; `--dry-run` prints exactly
   the same report and touches nothing.

## Failure handling

- Target already exists: refuse and report, unless `--force`, which
  disambiguates with a numeric suffix. This should be near-impossible given
  the hex prefix, but a half-finished earlier run could leave one.
- Unreadable or unparseable file: skip with a warning, never abort the whole
  run — a directory with one bad file must still migrate the rest.
- Lock the directory, or at least each pearl via `withTodoLock`, so a
  concurrent agent does not write to a file mid-move.

## Should it ever run automatically?

Proposal: no. Explicit command only, because it rewrites filenames in a
directory that is committed to git and a surprise mass-rename inside an
unrelated `pearls list` would be hostile. A one-line hint on stderr when
legacy files are detected ("N pearls use the old filename scheme; run
pearls migrate-filenames") is a friendlier middle ground. **Confirm with
Hugh.**

## Done when

Running the command against a copy of this repo's `.pi/todos` renames all
25 files, git shows them as renames, and a second run reports zero changes.

## Decided

- Command name: **`pearls migrate-filenames`** (with `--dry-run` and
  `--force`). Unambiguous about what it touches; leaves `migrate` free for a
  future schema migration.
- Never runs automatically. A one-line stderr hint when legacy files are
  detected is fine; a surprise mass-rename inside `pearls list` is not.
- Slug derivation follows TODO-dc019010 exactly: lowercase, sanitise, then
  cut to 40. The migration must produce byte-identical names to what
  `create` would have produced for the same title.
- While rewriting the front matter, consider back-filling `closed_at` from
  `created_at` on closed pearls that lack it — see TODO-90066643.
