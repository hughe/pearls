# Pearl file layout

Every pearl is a single markdown file with a JSON metadata block. The
metadata is the same object in both layouts; only its position differs.

```
frontmatter (default)      footer
-----------------------------------------------------------------
{                          # Title
  "id": "…",
  "title": "…",            body text
  "tags": [ … ]
}                          ---
                           { "id": "…", "title": "…", "tags": [ … ] }
# Title
body text
```

Which layout *new writes* use is decided by the `layout` key in
`<todos-dir>/settings.json` (`"frontmatter"` is the default;
`pearls migrate-layout --to footer` flips it and rewrites every pearl,
`--dry-run` previews). **Reading always supports both layouts**, so a
directory can mix them freely — during a migration, or forever.

The implementation lives in `extensions/pearls.ts`:
`splitFrontMatter` dispatches, `splitFooterMatter` handles the footer
case, and `serializeTodo(todo, layout)` writes either form.

## Writer rules

Both layouts are emitted in one canonical form:

| Layout     | Output                                   |
|------------|------------------------------------------|
| frontmatter| `{json}\n\n{body}\n` (or `{json}\n` when the body is empty) |
| footer     | `{body}\n\n---\n{json}\n` (or `---\n{json}\n` when the body is empty) |

The body is trimmed at both ends before writing. Because the writer
always re-emits the whole file in canonical form, a hand-edited pearl
gets normalised the next time pearls writes to it.

## Reader algorithm

The reader must answer one question for a raw file: *where does the JSON
metadata live?* It is deliberately forgiving — an unrecognised file is
treated as all-body with empty metadata rather than an error, and the id
always comes from the filename, never the content.

### Step 1 — dispatch on the first byte

```
if content starts with "{" → frontmatter layout
otherwise                   → try footer layout
```

This is byte one of the original `todos.ts` logic, unchanged, so
frontmatter files parse exactly as they always have.

### Frontmatter layout

A single forward scan (`findJsonObjectEnd`) walks the file with a
depth counter while tracking string state (`inString` / `escaped`), so
braces inside JSON string values don't count as structural. When the
depth returns to 0, the metadata object ends there.

- Text up to and including that `}` is the metadata.
- The remainder, with leading newlines stripped, is the body.
- If no balanced object is found, the whole file is body.

Note there are no `---` fences in this layout — it is bare JSON at the
top of the file. The `---` in the footer layout is the *only* place the
separator syntax is used.

### Footer layout

`splitFooterMatter` searches **backwards from the end of the file**:

1. Trim trailing whitespace. Prepend a synthetic `\n` to the search
   haystack so a file that *begins* with the separator
   (`---\n{json}` — an empty-body footer pearl) is still found.
2. Find the last occurrence of the line `\n---` (via `lastIndexOf`).
   Searching backwards is the key choice: a body that itself contains
   `---` lines (markdown hr rules, setext underlines) never wins — the
   *last* separator does.
3. Validate the candidate is really a separator line: the `---` must be
   a complete line (the next character is `\n` or EOF), so `----` or
   `--force` don't match.
4. Validate the tail after the separator. All three must hold:
   - it starts with `{`,
   - `findJsonObjectEnd` returns exactly `len - 1` — one balanced
     object spans the entire tail, with no trailing junk,
   - it parses with `JSON.parse`.
5. If any check fails, resume `lastIndexOf` searching backwards for an
     earlier `---` candidate. If none validates, the whole file is
     body (metadata stays empty, and the filename still supplies the
     id).

On success: the tail is the metadata, and the text before the separator
line (rtrimmed) is the body.

### Why this is safe

The three-part check — *last* separator + full-line `---` + complete
parseable JSON object to EOF — means ordinary markdown that happens to
end with `---` and prose falls through to "all body". A pearl whose body
contains `---` inside (e.g. between sections) round-trips fine, because
the writer appends its own separator after the body, making it the last
one in the file.

### Known edge case

A body that *literally ends* with a `---` line followed by a bare JSON
object is indistinguishable from a real footer by content alone, and
would be parsed as one. There is no fix for this that doesn't make the
format more baroque (e.g. fenced metadata), so it is accepted: don't end
a pearl body with a `---` line plus a JSON object.

## Complexity

Frontmatter detection is a single O(n) pass. Footer detection scans
backwards; each candidate separator validates with one pass over the
tail, so worst case is O(k·n) for k `---` candidates — but in practice
the real separator is at the very end of the file and is found on the
first `lastIndexOf`, making the common case O(n).
