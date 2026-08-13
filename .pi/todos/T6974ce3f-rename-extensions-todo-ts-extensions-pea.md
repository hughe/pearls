{
  "id": "6974ce3f",
  "title": "Rename extensions/todo.ts → extensions/pearls.ts, update imports & docs",
  "tags": [
    "refactor",
    "cli",
    "docs"
  ],
  "status": "closed",
  "created_at": "2026-04-28T15:58:02.706Z",
  "priority": 1
}

## Goal
Rename `extensions/todo.ts` to `extensions/pearls.ts` so the vendored extension file matches the project name, and update everything that references it.

## Checklist
- [x] `git mv extensions/todo.ts extensions/pearls.ts`
- [x] Rename `src/todo-wrapper.ts` → `src/pearls-wrapper.ts`, update its import from `../extensions/todo.js` → `../extensions/pearls.js`
- [x] Update `src/cli.ts` import from `./todo-wrapper.js` → `./pearls-wrapper.js`
- [x] Update `src/import-beads.ts` import from `./todo-wrapper.js` → `./pearls-wrapper.js`
- [x] Update `package.json` description: `todo` → `pearls`
- [x] Update `README.md` Layout section: `extensions/todo.ts` → `extensions/pearls.ts`, `src/todo-wrapper.ts` → `src/pearls-wrapper.ts`
- [x] Update `src/pearls-wrapper.ts` internal comment references
- [x] Rebuild and run tests (`npm run build && npm test`)

## Results
- Build passes cleanly
- 118/119 tests pass; the 1 failure is a pre-existing `import-beads` bug (filed as TODO-f585f25e)
- `dist/extensions/pearls.js` is the only output (old `todo.js` removed after clean rebuild)

## Not changed
- `todosExtension` function name (vendored upstream code)
- `AGENTS.md` (historical context)
- `src/cli.ts` header comment (upstream provenance)
- User-visible strings: `.pi/todos/`, `TODO-` prefix, `PI_TODO_PATH`
