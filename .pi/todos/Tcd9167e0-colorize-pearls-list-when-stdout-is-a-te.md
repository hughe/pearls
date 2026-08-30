{
  "id": "cd9167e0",
  "title": "Colorize pearls list when stdout is a terminal",
  "tags": [],
  "status": "closed",
  "created_at": "2026-08-30T22:20:16.331Z",
  "slug": "colorize-pearls-list-when-stdout-is-a-te"
}

# Colorize pearls list when stdout is a terminal

## Description

## Implementation notes

- `src/colorize.ts`: pure display shim over `formatTodoList()` output — no upstream todo logic touched.
- Palette: ids yellow; priorities P0 bold red → P1 red → P2 magenta → P3 cyan → P4 blue; `[P?]` dim; closed pearls dimmed throughout; section headers bold; tags/status dim; assignment to the current session green.
- Applied to `list`, `list-all`, `memories`, `search`, `get`, and `summarize-memories` human output.
- Colors only when stdout is a TTY, so piped output (agent payload) is byte-identical to plain. Controls: `--color`/`--no-color` flags; `NO_COLOR`, `FORCE_COLOR`, `CLICOLOR_FORCE` env vars.
- Tests in `test/cli.sh` (colorized output section): no escapes when piped, forced colors present, ANSI-stripped output equals plain, closed dimming, flag precedence. 211/211 passing.

Palette revision: pearl ids changed from yellow to **bold (no color)** — ids stand out by weight, so they can't clash with the priority colors. Closed ids are dim-bold. Tests updated accordingly.

Final palette: ids are **gray** (quiet chrome; tried bold first, user preferred gray). Closed ids are dim-gray.
