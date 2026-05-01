---
name: pearls
description: >
  Manage a shared todo backlog and persistent memories via the pearls CLI.
  Use when the user asks to create, list, search, update, close, or
  organize tasks/todos/issues, or when the user asks to remember
  something, create a memory, or recall a memory. Also use when the
  user mentions todos, tasks, backlog, priorities, memories, or
  wants to track work items or persist context. Supports epics
  (parent/child), tags, priorities, and multi-agent coordination
  via claim/release.
compatibility: Requires the pearls CLI on $PATH. Works with any agent that can run shell commands.
metadata:
  author: pearls
  version: "1.1"
---

# Pearls — Todo & Memory Management Skill

You manage todos and memories through the `pearls` CLI. Every command below should be
run with `--json` so you can parse the output programmatically. Present
results to the user in natural language.

## Invoking the Skill

When the user types a `/pearls` command:

- **`/pearls`** (no arguments) → run `pearls list --json` and summarize the results
- **`/pearls rem`** → open the memory creation input in Pi, or create a memory from the CLI
- **`/pearls help`** → explain the available commands and how to use them
- **`/pearls <command> [args]`** → run the corresponding `pearls` CLI command

When the user asks you to remember something:

- **"Remember this"** / **"Please remember …"** → create a memory immediately
- **"What do I have remembered?"** / **"Show my memories"** → list memories

## Quick Reference

| What | Command |
|------|----------|
| See open tasks | `pearls list --json` |
| See all tasks | `pearls list-all --json` |
| Create a task | `pearls create "Title" --json [flags]` |
| View a task | `pearls get <id> --json` |
| Update a task | `pearls update <id> --json [flags]` |
| Add notes | `pearls append <id> --json --body "notes"` |
| Close a task | `pearls close <id> --json` |
| Reopen a task | `pearls reopen <id> --json` |
| Search tasks | `pearls search -f <term> --json` |
| Claim a task | `pearls claim <id> --json` |
| Release a task | `pearls release <id> --json` |
| Delete a task | `pearls delete <id> --json` |
| Refine a task | `pearls refine <id> --json` |
| Create a memory | `pearls create "Title" --type memory --json --body "Full text"` |
| List memories | `pearls memories --json` |
| Memory index | `pearls summarize-memories --json` |

## IDs

Todos and memories are identified as `TODO-<hex>` (e.g. `TODO-b766eeb7`). Both the
full form and the bare hex are accepted by every command.

## Workflow

### Discovering work

```
pearls list --json
```

The JSON contains three buckets: `assigned` (claimed by a session),
`open` (unclaimed), and `closed`. Focus on `open` and `assigned`.

### Creating a task

**Always ask the user for at least a title before creating.** Then ask
follow-up questions as appropriate:

- **Title** (required) — short, imperative verb phrase.
- **Priority** — 0 (highest) to 4 (lowest). Default is unset.
- **Description / body** — what "done" looks like, context, links.
- **Tags** — free-form labels (e.g. `bug`, `feature`, `docs`).
- **Parent** — the ID of an epic this task belongs to, if any.

```
pearls create "Implement login page" \
  --priority 1 \
  --tag feature \
  --tag auth \
  --parent TODO-a1b2c3d4 \
  --body "Build a login page with email/password. Must validate inputs." \
  --json
```

### Claiming a task

Before starting work, claim the task so other agents don't duplicate
effort:

```
pearls claim <id> --json
```

Use `--force` to steal a stale claim from another session.

### Recording progress

Use `append` to add notes without overwriting the existing body:

```
pearls append <id> --json --body "Found root cause: missing null check in handler."
```

### Completing work

```
pearls close <id> --json
```

Closing automatically releases the claim.

### Searching

Search requires at least one filter:

```
pearls search -f "login" --json          # fuzzy match
pearls search -p 0 --json                # priority 0 only
pearls search -c TODO-a1b2c3d4 --json    # children of an epic
pearls search -f "login" --closed --json # include closed
```

### Updating a task

```
pearls update <id> --priority 2 --tag bugfix --json
```

Note: `--tag` **replaces** all tags. To add a tag, include the existing
ones too.

### Refining a task

When a task is vague or missing details, use `refine` to generate a
prompt that guides an interactive refinement conversation:

```
pearls refine <id> --json
```

This emits a prompt asking the user clarifying questions before rewriting
the todo. As the agent, you should use this prompt as your instructions —
ask the user the questions, collect their answers, then use `pearls update`
to apply the refined details.

### Deleting a task

Only for mistakes. Use `close` to mark work as done.

```
pearls delete <id> --json
```

## Memories

Memories are persistent notes stored alongside todos, distinguished by
`type: memory`. They are used to persist context across sessions — things
the agent should recall later, like project conventions, architecture
decisions, or important facts.

### Creating a memory

When the user says "Remember this", "Please remember …", or similar:

1. Extract a **short summary** for the title (imperative, ≤80 chars)
2. Put the **full text** in the body
3. Create with `--type memory`:

```
pearls create "Short summary" --type memory --body "Full text of what to remember" --json
```

**Do not ask for confirmation** — just create the memory. The user
explicitly asked you to remember it.

### Listing memories

```
pearls memories --json
```

Memories are **not** included in `pearls list` — they are a separate
concern. Use `pearls memories` or `pearls summarize-memories` to see them.

### Memory index

`pearls summarize-memories` lists open memory IDs + titles only (no bodies).
This is the compact format used on session startup to prime the agent's
context. Use it when you need a quick overview of what memories exist.

```
pearls summarize-memories --json       # [{ id, title }, ...]
pearls summarize-memories --closed     # include stale/closed memories
```

### Retrieving a memory's full text

Use the same `pearls get` command as for todos:

```
pearls get <id> --json
```

### Closing a memory

When a memory becomes stale or irrelevant, close it:

```
pearls close <id> --json
```

## Interaction Guidelines

1. **Ask before acting (for todos).** When the user says "add a todo", ask for the
   title, then follow up on priority, body, tags, and parent as needed.
   Don't create a bare task with no context if the user provided details —
   put them in `--body`.
2. **Don't ask — just remember (for memories).** When the user says "remember this"
   or "please remember …", create the memory immediately without asking for
   confirmation. Extract a short summary as the title and put the full text
   in the body.
3. **Present results naturally.** After running a command, translate the
   JSON output into a short, readable summary for the user.
4. **Use --json always.** You need structured output to reason about the
   results. The human-friendly format is for terminals.
5. **Don't edit files directly.** Always go through the `pearls` CLI.
   The underlying `.pi/todos/` files use lock-based coordination that
   bypassing would break.
6. **Close, don't delete.** Use `pearls close` to mark work done.
   `delete` is only for tasks created by mistake.
7. **Claim before starting.** If you're going to work on a task, claim
   it first so other agents (or humans using Pi) know it's in progress.

## Priority Scale

| Priority | Meaning |
|----------|---------|
| 0 | Critical / urgent |
| 1 | High |
| 2 | Medium |
| 3 | Low |
| 4 | Someday / nice-to-have |

## Common Patterns

**"What's on my plate?"**
→ `pearls list --json` — summarize the `assigned` and `open` buckets.

**"Create an epic with subtasks"**
→ Create the epic first, then create each subtask with `--parent <epic-id>`.

**"What's the status of X?"**
→ `pearls search -f "X" --json` then `pearls get <id> --json` for details.

**"I'm done with X"**
→ `pearls close <id> --json`

**"Add notes to X"**
→ `pearls append <id> --json --body "notes here"`

**"Remember this"** / **"Please remember …"**
→ `pearls create "Short summary" --type memory --body "Full text" --json`

**"What do I have remembered?"** / **"Show my memories"**
→ `pearls memories --json`

For the full CLI reference including all flags, see [CLI Reference](references/CLI.md).
