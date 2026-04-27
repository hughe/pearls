{
  "id": "14f6a5a9",
  "title": "Add an importer for beads.",
  "tags": [],
  "status": "closed",
  "created_at": "2026-04-27T00:30:21.068Z"
}

# Description

Import the .issues.jsonl format from beads.  Map issue status. Add description and other information to the body of the issues 
as markdown.  Descritption first.

Add the original identifier of each beads.

Put memorys in a seperate .jsonl file, we'll sort them out later.

Implemented `pearls import-beads <issues.jsonl>` in TypeScript (`src/import-beads.ts`). Maps each beads issue to a fresh pearl: description leads the body, then a `## Beads metadata` section with original id, type, priority, assignee, dates, close reason, external ref, labels, dependencies; plus optional `## Acceptance criteria`, `## Notes`, `## Comments` sections. Status normalises closed/done/resolved → "closed" and preserves `in_progress`/`deferred` verbatim. Tags default to `[beads, <issue_type>, ...labels]`. Records without a title are appended verbatim to `<todos-dir>/memories.jsonl` to be sorted out later. Supports `--dry-run` and `--json`. 16 new test assertions; 91/91 passing. Smoke-tested against real `../sldball/sldb/.beads/issues.jsonl` (302 issues).
