# CURRENT_STATE

Updated 2026-10-19. The approved UI improvement implementation and reliability follow-up are on `origin/main`; the workspace-storage migration described below is currently uncommitted. Remaining hardware release gates are listed below. No deployment was requested. The decision ledger is `docs/plans/UI_IMPROVEMENT_PLAN.md`. Earlier review/planning history is preserved in `docs/reviews/CURRENT_STATE_before_UI_implementation_2026-10-08.md`.

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

### Storage diagnosis — 2026-10-18
- The Settings usage figure comes from `navigator.storage.estimate()` and represents combined origin storage, while section workspaces still save widgets, ink and recovery/history data through `localStorage`.
- History is bounded to 2 MiB per section, but there is no global `localStorage` budget across sections. A tablet can therefore reject a workspace write at the much smaller Web Storage limit while still reporting substantial device free space and modest combined origin use.
- `saveWorkspace()` currently converts every serialization or storage exception into `false`; the persistence controller consequently labels every such failure as storage pressure. The warning does not prove that device or browser-origin storage is full.
- The diagnostic pass made no application changes; its corrective direction was implemented on 2026-10-19 as described below.

### Workspace storage migration — 2026-10-19
- Section workspace payloads now use the dedicated `notes-app-workspaces` IndexedDB database. Startup hydrates an in-memory cache before canvas restoration, durably copies legacy `localStorage` workspaces, and removes legacy records only after the IndexedDB flush succeeds. Failed migration retains the original records and falls back to `localStorage` for that session.
- IndexedDB writes are serialized per workspace key. Save feedback and Retry wait for workspace and asset writes; asynchronous failures identify the IndexedDB backend and actual exception instead of displaying every failure as device storage exhaustion. The Settings meter labels combined browser-origin use separately from workspace bytes.
- Persisted undo/redo history has an 8 MiB combined workspace budget in addition to the existing 2 MiB per-section cap. Startup trims oldest section history when existing data exceeds the global budget; Recently Deleted entries remain separate.
- Editable backup format v2 includes both asset and workspace IndexedDB records. Inspection and restore remain compatible with v1 backups, and failed/cancelled restore rolls back workspace records as well as newly staged assets.
- Browser coverage reads persisted workspaces through the IndexedDB inspection API. Reliability coverage verifies legacy migration, repeated section switching, injected IndexedDB quota failure/Retry, and sibling-tab restore coordination.

## Verification — 2026-10-19
- `npm test`: **67 passed**, 0 failed.
- `npm run test:browser`: all eight browser workflows passed after the migration; the focused offline and reliability workflows also passed after their final fixture/migration assertions.
- `npm run offline:build`: 278 assets, version `53a0cc92423f6ed9`.
- Chromium 153 / Playwright 1.63 ran from `/tmp/notes-app-browsers`; test-only shared libraries ran from `/tmp/notes-app-libs`.

### Push handoff
- User requested committing and pushing the implementation. `git fetch origin` confirmed local `main` and `origin/main` were aligned before this commit; `git diff --check` passed. Existing validation remains 67 unit/storage tests and seven browser workflows passing.
- Staged whitespace validation found and removed an extra source EOF line and trailing whitespace in bundled license text; license wording is unchanged. Regenerated the offline manifest and passed `git diff --cached --check`.
- 2026-10-14 follow-up adds the eighth browser workflow, cancelled-restore asset cleanup, and cross-tab restore coordination. The full unit suite and all eight browser workflows pass; the final offline manifest contains 277 assets.
