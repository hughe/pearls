{
  "id": "75073a8c",
  "title": "CLI v0.1 done: list/get/create/update/append/delete/close/reopen/claim/release/dir/path",
  "tags": [
    "cli",
    "v0.1"
  ],
  "status": "closed",
  "created_at": "2026-04-26T23:54:08.186Z"
}

Implemented in src/cli.ts as a thin wrapper that reuses functions exported from extensions/todo.ts. Storage format, locking, GC and session-assignment semantics all come from todo.ts unchanged.
