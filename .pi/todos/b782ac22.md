{
  "id": "b782ac22",
  "title": "TUI: /pearls rem command for creating memories",
  "tags": [
    "memory",
    "tui"
  ],
  "status": "closed",
  "created_at": "2026-04-30T14:32:37.350Z",
  "priority": 2,
  "parent": "b286d44d"
}

# TUI: /pearls rem command for creating memories

## Description

Add `/pearls rem` command to the TUI. Opens an inline input field (like the search input in /pearls) where the user types the memory text. On submit, creates a memory with a short summary as title and full text as body. Shows a notification confirming creation. Falls back to CLI arg when `!ctx.hasUI`.
