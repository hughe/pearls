---
name: pearls
description: >
  Manage a shared todo backlog via the pearls CLI. Use when the user asks
  to create, list, search, update, close, or organize tasks/todos/issues.
  Also use when the user mentions todos, tasks, backlog, priorities, or
  wants to track work items. Supports epics (parent/child), tags,
  priorities, and multi-agent coordination via claim/release.
compatibility: Requires the pearls CLI on $PATH. Works with any agent that can run shell commands.
metadata:
  author: pearls
  version: "1.0"
---

# Pearls — Todo Management Skill

You manage todos through the `pearls` CLI. Every command below should be
run with `--json` so you can parse the output programmatically. Present
results to the user in natural language.

## Invoking the Skill

When the user types a `/pearls` command:

- **`/pearls`** (no arguments) → run `pearls list --json` and summarize the results
- **`/pearls help`** → explain the available commands and how to use them
- **`/pearls <command> [args]`** → run the corresponding `pearls` CLI command

## Quick Reference

| What | Command |
|------|---------|
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

## IDs

Todos are identified as `TODO-<hex>` (e.g. `TODO-b766eeb7`). Both the
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

## Interaction Guidelines

1. **Ask before acting.** When the user says "add a todo", ask for the
   title, then follow up on priority, body, tags, and parent as needed.
   Don't create a bare task with no context if the user provided details
   — put them in `--body`.
2. **Present results naturally.** After running a command, translate the
   JSON output into a short, readable summary for the user.
3. **Use --json always.** You need structured output to reason about the
   results. The human-friendly format is for terminals.
4. **Don't edit files directly.** Always go through the `pearls` CLI.
   The underlying `.pi/todos/` files use lock-based coordination that
   bypassing would break.
5. **Close, don't delete.** Use `pearls close` to mark work done.
   `delete` is only for tasks created by mistake.
6. **Claim before starting.** If you're going to work on a task, claim
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

For the full CLI reference including all flags, see [CLI Reference](references/CLI.md).
