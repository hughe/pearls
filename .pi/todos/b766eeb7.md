{
  "id": "b766eeb7",
  "title": "Add a pearls SKILL for use in Claude and other agents without plugins",
  "tags": [
    "skill",
    "claude",
    "agents",
    "cli"
  ],
  "status": "closed",
  "created_at": "2026-04-29T18:21:02.926Z",
  "priority": 1
}

## Goal

Create an **Agent Skills**–compatible `SKILL.md` at `skills/pearls/SKILL.md` so that any agent (Claude Code, Cursor, Windsurf, etc.) that supports the [Agent Skills specification](https://agentskills.io/specification) can drive pearls without a plugin.

## Format

Follow the [Agent Skills spec](https://agentskills.io/specification):

- **Directory**: `skills/pearls/SKILL.md` (directory name must match `name` field)
- **Frontmatter**: `name: pearls`, `description: …` (max 1024 chars, keyword-rich for agent matching), `compatibility: Requires pearls CLI on $PATH`, optional `metadata`
- **Body**: Markdown instructions for the agent — step-by-step commands, flags, examples, edge cases
- Keep SKILL.md under 500 lines; move detailed reference to `references/` if needed
- Use progressive disclosure: description is ~100 tokens (loaded at startup), body is the full instructions (<5000 tokens), reference files loaded on demand

## Scope

- **Todos only** — no memory/beads features
- Commands the agent should surface:
  - `/pearls list` — show open + assigned todos
  - `/pearls create` — agent asks: title, priority (0–4), description/body, tags, is it an epic (parent), parent id
  - `/pearls get <id>` — inspect a single todo
  - `/pearls update <id>` — change status, title, body, priority, tags, parent
  - `/pearls append <id>` — add to body (progress notes, etc.)
  - `/pearls close <id>` — mark done (clears assignment)
  - `/pearls reopen <id>` — reopen
  - `/pearls claim <id>` / `/pearls release <id>` — coordination
  - `/pearls search` — `-f` fuzzy, `-p` priority, `-c` child-of, `--closed`
  - `/pearls delete <id>` — for mistakes only
- Agent should **always** use `--json` flag for machine-readable output
- Assume `pearls` is already on `$PATH`; no install instructions

## Audience

Written **for the agent** — the agent reads SKILL.md and follows the instructions to help the user manage todos without leaving the command line.

## Interaction pattern

When the user says something like "add a todo" or "what's on my list", the agent should:
1. Ask clarifying questions (title, priority, tags, parent, description) **before** running the CLI command
2. Run the appropriate `pearls` command with `--json`
3. Parse and present the result to the user in natural language

## File structure

```
skills/
└── pearls/
    ├── SKILL.md          # Required: metadata + instructions
    └── references/
        └── CLI.md        # Optional: full CLI reference (flags, examples)
```
