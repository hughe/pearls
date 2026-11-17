---
id: da2507bd
title: '"--todo-dir" should be "--pearls-dir"'
status: closed
created_at: 2026-09-03T14:59:47Z
priority: 2
closed_at: 2026-09-03T15:25:34Z
slug: todo-dir-should-be-pearls-dir
---

# "--todo-dir" should be "--pearls-dir"

## Description

Renamed the flag to --pearls-dir across cli.ts, help, README and tests. --todo-dir is kept as a deprecated alias that still works but prints a stderr warning (mirroring the PI_TODO_PATH deprecation). Tests cover both the new flag and the alias warning.
