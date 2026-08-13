{
  "id": "97cc3631",
  "title": "Show children in to-do list.",
  "tags": [],
  "status": "closed",
  "created_at": "2026-04-27T18:51:22.988Z",
  "priority": 1
}

The To-Do List should display children below their parent, indented by two spaces, using ASCII tree characters:
- `├──` for a middle child
- `└──` for the last child
- `│` for continuation lines

**Applies to:** `pearls list`, `pearls list-all`, and the TUI.

**Sibling ordering:** Priority (highest first), then creation date (oldest first).

**Depth:** Unlimited nesting.

**Orphaned children** (parent closed/deleted): Show them indented but replace tree characters with `¿`.

**No collapse/expand option.** Always show the full tree.
