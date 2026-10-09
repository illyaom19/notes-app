# MISSING_FROM_VISION

Updated 2026-10-08. Track actual remaining gaps; historical audit findings are in `docs/reviews/UI_EASE_OF_USE_AND_FEATURE_AUDIT_2026-09-26.md`. Implementation status and current test outcomes are in `docs/CURRENT_STATE.md`.

## Release validation

- Physical Galaxy Tab/S Pen and iPad/Apple Pencil checks remain outstanding: latency, palm rejection, gesture/docking ergonomics, Safari storage behavior and long-session memory. Desktop Chromium emulation cannot replace these.
- Browser coverage now exists for creation, history/reload, library Add, stale-source linking, PDF export, backup restore and offline PDF import/search. Mixed pen/widget history, four viewport sizes and 100-item touch scrolling now pass. Section-switch PDF stress, multi-tab restore and quota-fault integration still need coverage.
- Broader performance acceptance remains open. Repeat raster registration is much cheaper; dense history snapshots and full indexing still consume measurable CPU. See `docs/reviews/UI_OPTIMIZATION_RESULTS_2026-10-08.md` for reproducible workloads and limits.

## Implementation limits

- Recovery covers section canvas content. Notebook/section/library deletion is not restored by that section's Recently Deleted bin.
- Archive restore validates checksums and stages immutable assets; aborted staging may leave unreferenced payloads. Settings rollback requires spare local storage. Backup records over 128 MiB are rejected.
- Searchable PDF text is extracted on import; legacy PDFs without saved text require reimport. OCR is outside scope. PDF export remains image based.
- Source-link preview describes content; it is not yet a rich side-by-side visual diff. Existing source provenance cannot be reconstructed for old independent copies that never stored it.
- Main orchestration still owns many concerns despite separate history, export, backup, search and source-update modules.
- PDF decode cache has a 64 MiB soft budget and permits one oversized image. Device memory pressure remains to be measured.

## Explicitly deferred product scope

Typing anywhere on canvas; new research workflow; lossless raw-element Snip into Note and unpacking; clipboard; dark mode; canvas accessibility object navigator; new diagram families. These must not be added implicitly while finishing the accepted UI pass.
