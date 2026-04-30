{
  "id": "ac3e6f2b",
  "title": "Memory indexing on startup/compaction",
  "tags": [
    "memory"
  ],
  "status": "closed",
  "created_at": "2026-04-30T14:32:37.384Z",
  "priority": 2,
  "parent": "b286d44d"
}

# Memory indexing on startup/compaction

## Description

On agent startup or memory compaction, scan all memory files in .pi/todos/ and build an index of title + ID only (no bodies) to keep context lean. The agent loads this index into its context so it knows what memories exist and can retrieve a body by ID when needed.

## Refinement Notes

1. **When to generate:** Pi extension: on `session_start` and re-inject on `session_compact`. CLI: new `pearls summarize-memories` command. Always scan fresh, no caching.
2. **Output format:** Both human-readable (one line per memory: `TODO-xxxx Short title`) and `--json` (`[{ id, title }]`).
3. **Default scope:** Open memories only. Add `--closed` flag to include closed/stale ones.
4. **How to prime context in Pi:** Inject a persistent message via `before_agent_start` with `customType: "pearls-memory-index"` on `session_start`. On `session_compact`, re-inject a fresh copy (the old message got compacted away).
5. **No per-turn re-injection needed:** If a memory is created during the session, the agent already knows about it. Only need to re-inject after compaction removes the index message.
