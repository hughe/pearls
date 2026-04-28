{
  "id": "1cff3294",
  "title": "Show priority (Px / P?) in TUI todo selector list between TODO ID and title",
  "tags": [
    "tui",
    "priority"
  ],
  "status": "closed",
  "created_at": "2026-04-27T15:38:20.431Z",
  "priority": 2
}

## What

Modify `TodoSelectorComponent.updateList()` in `extensions/todo.ts` to display each todo's priority between the TODO ID and the title.

## Format

- `P0`, `P1`, `P2`, `P3`, `P4` when `todo.priority` is defined (0–4)
- `P?` when `todo.priority` is `undefined`

## Where in the line

Current:
```
→ TODO-be25071f Add a few tests... [cli, tests] (open)
```

Desired:
```
→ TODO-be25071f P2 Add a few tests... [cli, tests] (open)
```

## Implementation notes

- The priority data is already on `TodoFrontMatter.priority` — no storage changes needed.
- `renderTodoHeading()` and `formatPriorityTag()` already render `[P0]` etc for the tool result view, but the TUI selector uses its own inline formatting. Use the compact `Px` / `P?` format (no brackets) to keep lines short.
- Styling: use `theme.fg("muted", ...)` for `P?` and `theme.fg("accent", ...)` for `P0`–`P4`, or a single muted color for consistency.
- Only `TodoSelectorComponent.updateList()` needs to change — the detail overlay and action menu don't need priority display changes.
