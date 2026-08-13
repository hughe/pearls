{
  "id": "e3dff928",
  "title": "Tests for slugs, mixed-scheme directories, migration and archiving",
  "tags": [
    "tests"
  ],
  "status": "closed",
  "created_at": "2026-08-13T21:49:55.199Z",
  "priority": 2,
  "parent": "cec97615",
  "closed_at": "2026-08-13T22:34:59.232Z",
  "slug": "tests-for-slugs-mixed-scheme-directories"
}

# Tests for slugs, mixed-scheme directories, migration and archiving

## Description

`test/cli.sh` is the only test harness and it hard-codes the old layout at
line 169: `FILE="$WORK/todos/$ID.md"`. That assertion must change, and the
new behaviour needs its own coverage.

## Update

- Derive the on-disk path from `pearls path <id>` instead of composing it,
  so the tests stop caring about the naming scheme and never need this edit
  again.

## Add

- Slug derivation: a title with spaces, punctuation, a slash, a very long
  title (assert the 40-char cap), and a title that sanitises to nothing.
- `--slug` overriding the title, including on `update`.
- Mixed directory: drop a legacy `<hex>.md` file into the scratch dir by
  hand and assert `list`, `get`, `close` and `path` all work against it
  alongside new-scheme files.
- Migration: run `--dry-run`, assert nothing moved and the report is right,
  then run for real and assert the renames plus idempotency on a second run.
- Archive: write a closed pearl with an old timestamp, run a GC pass with a
  small `gcDays` in `settings.json`, assert the file moved into `archive/`,
  is gone from `list-all`, and is still reachable via `get`.
- `generateTodoId` collision: a slugged file must make its own id
  unavailable to a new pearl.

## Note

The suite runs against a scratch directory via `PEARLS_DIR`, so these are
safe to write destructively. Run both `npm test` and `npm run test:dist` —
the dist path exercises the compiled output, which is where a missed export
in `src/pearls-wrapper.ts` would surface.

## Additional cases from the settled decisions

- Slug casing: assert a mixed-case title with acronyms produces an
  all-lowercase slug.
- Truncation order: assert a punctuation-heavy title longer than 40 chars
  yields a full 40-char slug (sanitise-then-truncate), not a short one.
- `--slug` containing a `/` or `..` must not escape the todos directory.
- Rename policy: `update --title` leaves the filename unchanged;
  `update --slug` and `reslug <id>` both move it, and both are no-ops when
  the name already matches.
- GC timing (TODO-90066643): a pearl with an old `created_at` but a recent
  `closed_at` survives GC; one closed long ago is archived; one with no
  `closed_at` at all still ages by `created_at`.
- `list-all --archived` includes archived pearls, plain `list-all` does not.
- `delete` still removes the file rather than archiving it.

## Done

192/192 checks pass under both `npm test` and `npm run test:dist`. The
file-format assertions now ask `pearls path <id>` instead of composing the
name, so they survive the next scheme change.

Found while doing this: the import-beads section was already failing on
main. Its fixture uses fixed 2026-04 dates, so the imported closed issue is
now past gcDays and GC deleted it before the assertions ran — verified
against origin/main in a scratch worktree. That section now passes
`--no-gc`.
