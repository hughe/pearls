{
  "id": "ac3e6f2b",
  "title": "Memory indexing on startup/compaction",
  "tags": [
    "memory"
  ],
  "status": "open",
  "created_at": "2026-04-30T14:32:37.384Z",
  "priority": 2,
  "parent": "b286d44d"
}

# Memory indexing on startup/compaction

## Description

On agent startup or memory compaction, scan all memory files in .pi/todos/ and build an index of title + ID only (no bodies) to keep context lean. The agent loads this index into its context so it knows what memories exist and can retrieve a body by ID when needed.
