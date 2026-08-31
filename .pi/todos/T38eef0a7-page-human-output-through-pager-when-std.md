{
  "id": "38eef0a7",
  "title": "Page human output through $PAGER when stdout is a terminal",
  "tags": [
    "ux",
    "cli"
  ],
  "status": "open",
  "created_at": "2026-08-30T23:26:25.398Z",
  "assigned_to_session": "01a054c3-63a8-7ea1-8d70-23e6569db3d8",
  "priority": 1,
  "slug": "page-human-output-through-pager-when-std"
}

Pipe human output through $PAGER when stdout is a terminal, following git conventions.

## Details

- Pager is `$PEARLS_PAGER`, falling back to `$PAGER`, then `less`; an empty value disables it (git-style).
- When the pager is `less` and `$LESS` is unset, pass `FRX`: `R` lets colors through, and `F`+`X` mean output that fits on one screen never engages the pager — it prints inline and less exits immediately. So the pager only appears when output actually overflows the screen.
- Piped output (agents) never sees a pager; `--json` disables it explicitly. Errors go to stderr unpaged.
- Applies to all human output: list, list-all, memories, search, get, help, quickstart.
- New module `src/output.ts` owns the pager lifecycle (`initPager` / `out` / `endOutput`); cli.ts routes all human writes through `out()`.
- Handle the user quitting the pager early (EPIPE) by falling back to direct stdout writes.
- Tests: pager only starts on TTY, short output prints inline under FRX, long output pages, `PEARLS_PAGER` override honored.
