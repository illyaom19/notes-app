# CURRENT_STATE

Updated 2026-10-14. The approved UI improvement implementation and reliability follow-up are on `origin/main`. Remaining hardware release gates are listed below. No deployment was requested. The decision ledger is `docs/plans/UI_IMPROVEMENT_PLAN.md`. Earlier review/planning history is preserved in `docs/reviews/CURRENT_STATE_before_UI_implementation_2026-10-08.md`.

## Implemented surface

- `src/features/history/`: chronological per-section widget/diagram/native-ink undo and redo, persisted bounded history (100 actions / 2 MiB), deletion Undo notification, and 30-day section content recovery. History stores asset references; erased strokes and widget ordering are included. Notebook/library deletion is outside this section recovery bin.
- Compact two-row tablet shell, shared resizable Library/Search drawer, library filters, explicit Add and drag handles, labeled gesture creation, grouped settings, contextual hints, local font, focus indicators and reduced motion. No new persistent Add or zoom toolbar.
- Independent library copies retain source provenance. Visible stale copies offer Link/Dismiss/Never; replacement requires confirmation and can be undone. Library search activation now reveals/previews the matching entry.
- Notebook-wide retained full-text search includes stored section content, diagram labels and extractable text from new PDF imports. No OCR. Dismissed suggestions now have an always-reachable recovery tray while their PDF is focused.
- PDF export settings, image-based page previews, selected-widget/section scope, portrait/landscape, fit/tiles and cancellation. Editable `.notesbackup` archives include app settings, all notebooks, recovery and stored assets; restore verifies hashes and uses a durable settings rollback journal.
- Local PDF.js worker, character maps, standard fonts and UI font; generated service-worker precache (`scripts/build-offline-manifest.py`). Offline lazy feature loading no longer depends on a CDN.
- Shared asset catalogs preserve originals; original PDF bytes survive worker transfer; persistence writes envelopes before releasing previous references. Save feedback waits for asset writes and ignores stale asynchronous completions.
- PDF image decoding uses shared LRU retention and two concurrent loads. Immutable raster registration is memoized. Search workspace reads avoid modifying ownership. Source-update and notebook-search orchestration have separate modules.

## Verification — 2026-10-14

- `npm test`: **67 passed**, 0 failed (2026-10-14).
- All eight scripts in `npm run test:browser` passed: creation/undo/reload; independent library Add/search/PDF download; deletion/bin/archive corruption and interrupted-restore recovery; stale-copy link/Undo; offline cold reload/PDF import/search/export/backup with original-byte retention; suggestion-tray recovery and cancelled-restore asset cleanup; four viewport sizes and mixed pen/widget history; 100-item touch scrolling without spawning and library search reveal; twelve PDF section round trips; injected quota failure/Retry; and sibling-tab restore coordination.
- Tablet emulation measured header height 109.94px (audit baseline 332px).
- Browser dependencies are isolated under `/tmp/notes-app-browsers` and `/tmp/notes-app-libs`; these are environment prerequisites, not app dependencies.
- Offline manifest rebuilt: 277 assets, version `ef8977a48a1fe11e`. All source/test JavaScript syntax checks and `git diff --check` passed. Phone/tablet screenshots were visually inspected in the prior pass; regenerate the manifest after source changes.

## Remaining work / release limits

- Extend coverage for real-device drag/dock/pen cancellation, sustained large-PDF switching/export, browser-specific quota ceilings, and concurrent edits outside restore. These are outstanding acceptance scenarios, not reported test passes.
- Physical Galaxy Tab/S Pen and iPad/Apple Pencil acceptance cannot be established through desktop Chromium emulation. Pen latency, palm rejection, Safari storage limits and real long-session memory remain unverified.
- Full optimization is an ongoing accepted workstream; warm raster-registration improvements do not establish whole-app frame-time or startup targets. Main orchestration remains large.
- History and archives are bounded; backup records over 128 MiB are rejected. Restore stages immutable assets, removes newly staged assets on cancellation/failure, and coordinates sibling tabs. Very large browser-quota and simultaneous-edit fault scenarios still need device/browser validation.
- Legacy PDFs without captured text need reimport to gain text search. Export remains raster/image based. The decoded cache may retain one page larger than its 64 MiB soft budget.
- Typing, new research UI, lossless raw-canvas Snip/unpack architecture, clipboard, dark mode and object accessibility navigator remain explicitly deferred.

### Latest review and checks
- Added 44px diagram controls with wrapping, matching-library-item search navigation, preserved-case search snippets, and a persistent suggestion recovery tray. Source replacement now uses the same guarded history transaction as Undo.
- Added reproducible CPU workloads in `tests/performance/workloads.mjs`; results/limits in `docs/reviews/UI_OPTIMIZATION_RESULTS_2026-10-08.md`. Dense full reindex and history snapshots remain measurable costs.
- Browser mixed pen/widget undo/redo now passes; the failing assertion treated a legacy empty workspace as having an ink array. Four viewport checks and a 100-item touch-swipe/no-spawn + search-reveal workflow pass. Unchanged searchable-input caching reduced repeated 1,000-note indexing median from 41.0 ms to 5.5 ms in the CPU fixture.

### Reliability follow-up — 2026-10-14
- Added `tests/browser/reliability-check.mjs`. Twelve section switches preserve one PDF widget and one original PDF asset; injected `QuotaExceededError` keeps the current section active until the retry save succeeds.
- Offline browser coverage now verifies the dismissed-suggestion recovery tray and that aborting an archive restore after staging begins removes every newly inserted asset.
- Workspace restore publishes a short-lived coordination event. Sibling tabs pause persistence while restore runs, reload after commit, and resume after failure or a five-minute expiry fallback.

### Push handoff
- User requested committing and pushing the implementation. `git fetch origin` confirmed local `main` and `origin/main` were aligned before this commit; `git diff --check` passed. Existing validation remains 67 unit/storage tests and seven browser workflows passing.
- Staged whitespace validation found and removed an extra source EOF line and trailing whitespace in bundled license text; license wording is unchanged. Regenerated the offline manifest and passed `git diff --cached --check`.
- 2026-10-14 follow-up adds the eighth browser workflow, cancelled-restore asset cleanup, and cross-tab restore coordination. The full unit suite and all eight browser workflows pass; the final offline manifest contains 277 assets.
