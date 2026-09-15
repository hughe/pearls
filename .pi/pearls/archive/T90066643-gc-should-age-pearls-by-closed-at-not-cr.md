{
  "id": "90066643",
  "title": "GC should age pearls by closed_at, not created_at",
  "tags": [
    "archive",
    "gc",
    "bug"
  ],
  "status": "closed",
  "created_at": "2026-08-13T21:58:40.498Z",
  "priority": 1,
  "parent": "cec97615",
  "closed_at": "2026-08-13T22:34:56.570Z",
  "slug": "gc-should-age-pearls-by-closed-at-not-cr"
}

# GC should age pearls by closed_at, not created_at

## Description

`garbageCollectTodos` (`extensions/pearls.ts` ~line 921) reads
`Date.parse(parsed.created_at)` and compares it to the `gcDays` cutoff. The
settings documentation at line 28 says the threshold is "days since
closed_at", a `closed_at` field is written on close (line 1630), and it is
parsed and serialised throughout — it is simply not used by GC.

The effect is that a pearl created a year ago and closed yesterday is
retired immediately, while the intent was to keep it for `gcDays` after it
was closed. In this repo that means all 25 previously closed pearls are
already past the threshold.

## Fix

- Use `closed_at` for the age comparison, falling back to `created_at` when
  `closed_at` is absent. The fallback matters: every pearl closed before the
  field existed has no `closed_at`, and the alternative — skipping them
  because the date is unparseable — would pin them in the todos directory
  forever.
- Consider back-filling `closed_at` from `created_at` during
  `migrate-filenames`, since it already rewrites the front matter. That
  would let the fallback be dropped later.

## Ordering

Land this together with the archiving child. Fixing the date without
archiving would still be a delete, just a better-timed one; archiving
without the date fix means this repo's whole closed history moves to the
archive on the next GC pass, which is survivable but noisy.

## Done when

A pearl created long ago but closed today survives GC, a pearl closed more
than `gcDays` ago is archived, and a closed pearl with no `closed_at` is
aged by `created_at` as before.

## Done

GC now ages from `closed_at`, falling back to `created_at` when it is
absent. Covered by tests: a pearl created in 2020 but closed today
survives; one closed in 2020 is archived; one closed with no `closed_at`
falls back and is archived.
