---
id: 2e467e57
title: Add a way to filter by tag in "pearls list" and the equivalent in the extension
status: closed
created_at: 2026-09-15T16:36:23Z
priority: 1
slug: add-a-way-to-filter-by-tag-in-no-todos-a
---

# Add a way to filter by tag in No todos. and the equivalent in the extension

## Description

## Progress

- 2026-11-16: Implemented.
  - CLI (`src/cli.ts`): `--tag <t>` (repeatable, AND semantics) now filters `list`, `list-all` and `memories`; human + `--json` output. `filterByTags()` helper reuses the existing repeatable-`--tag` arg parsing.
  - Extension (`extensions/pearls.ts`): new optional `filterTags` array param on the pearls tool, applied to the `list` / `list-all` / `list-memories` actions (same AND semantics) via exported `filterTodosByTags()`. The TUI's fuzzy search already matches tags, so no UI change was needed.
  - Docs: HELP, QUICKSTART, zsh completions, README, skills/pearls/SKILL.md all updated.
  - Tests: new sections in `test/cli.sh` for `list --tag` (incl. AND, --json, list-all, closed interplay) and `memories --tag`; 319/319 pass on src and dist.
