{
  "id": "f585f25e",
  "title": "import-beads reports success but doesn't write .md files",
  "tags": [
    "bug",
    "import-beads"
  ],
  "status": "closed",
  "created_at": "2026-04-28T16:10:34.762Z",
  "priority": 0
}

## Bug

When running `pearls import-beads <file>`, the command reported "imported N issue(s)" but no `.md` files appeared in the todos directory.

## Resolution

Bug is already fixed. Reproduced successfully with a fresh directory — `.md` files are written correctly. All 132/132 tests pass including the import-beads suite. Likely fixed incidentally by commit 23a9e52 (seed pearl bodies with headings).
