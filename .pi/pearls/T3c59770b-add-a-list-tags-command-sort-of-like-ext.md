{
  "id": "3c59770b",
  "title": "Add a list tags command.  Sort of like \"EXTRACT-TAG | sort | uniq -c\" ",
  "tags": [],
  "status": "closed",
  "created_at": "2026-09-13T02:22:54.462Z",
  "priority": 1,
  "slug": "add-a-list-tags-command-sort-of-like-ext"
}

# Add a list tags command.  Sort of like "EXTRACT-TAG | sort | uniq -c" 

## Description

Implemented `pearls list-tags` (alias `tags`) to count tags on open/assigned todos by default, with `--closed`, `--archived`, and `--json` support. Updated CLI help, zsh completions, README, and test coverage. Verified with `npm run typecheck`, `npm test`, and `npm run build`.
