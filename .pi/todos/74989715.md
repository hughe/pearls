{
  "id": "74989715",
  "title": "Investigate GC timing for closed pearls",
  "tags": [
    "bug"
  ],
  "status": "closed",
  "created_at": "2026-04-30T15:14:58.532Z",
  "priority": 1,
  "closed_at": "2026-05-02T17:41:34.586Z"
}

# Investigate GC timing for closed pearls

## Description

Closed pearls appear to be garbage collected sooner than the expected 7-day threshold. Check the GC logic in the extension and CLI startup to verify the gcDays setting is being read and applied correctly. The default in settings.json should be gcDays: 7.

Likely root cause: the GC logic compares created_at against the cutoff, not the time the pearl was closed. So a pearl created >7 days ago and closed today gets GC'd immediately, even though it's only been closed for seconds. The comparison should use closed_at (or status change time) instead of created_at.
