# CURRENT_STATE

## Snapshot
- Reviewed: 2026-09-26, after repository refresh.
- Checked-out `main` and `origin/main`: `6151df2` (`fix: restore widget delete on trash drop release`). Initial working tree clean.
- This checkout is 110 commits beyond `e970c4a`, the baseline inspected in the previous conversation review. That earlier assessment is obsolete for this checkout.
- Scope: source/documentation review and existing test/syntax verification. No application code changed; no branch switch, merge, or fetch performed by this review.

## Current App Surface
- Canvas pan/zoom/pinch and lazy widget registration: `src/core/canvas/`, `src/core/widgets/`, `src/main.js`.
- Supported widget types: notes (`expanded-area`), PDF (`pdf-document`), reference/snip (`reference-popup`), and diagram (`diagram`), defined in `src/features/widget-system/widget-types.js`.
- Ink pen/eraser/lasso and lasso-to-note: `src/features/ink/`; configurable pen/barrel gestures: `src/features/gestures/pen-gestures.js`.
- Radial creation, shared widget interactions, viewport docking, library drag/spawn and trash-drop deletion.
- Notebook/section workspace persistence and document/reference libraries: `src/features/contexts/`, `src/features/sections/`, `src/features/notebooks/`.
- PDF import/rasterization, asset hydration, missing-file reimport and document lifecycle: `src/features/documents/`, `src/widgets/pdf/`, `src/features/runtime/document-pdf-runtime.js`.
- Suggestions with persisted lifecycle: `src/features/suggestions/`; search with scheduled/debounced reindexing: `src/features/search/`.
- Research/reference text rendering and source action exist in `src/widgets/reference-popup/reference-popup-widget.js`; a full default research-browser workflow remains deferred in product scope.
- Section overview/navigation uses `src/features/minimap/section-minimap-controller.js`; legacy peek state remains in runtime.
- Schema migrations, asset references/deduplication/cleanup/budget handling: `src/features/storage/`.
- Production mode and context/profile-scoped onboarding with reset support: `src/features/ui/`, `src/features/onboarding/`.
- PWA shell caching: `sw.js`; section A4 PDF share/export: `src/features/share/section-pdf-share-runtime.js`.
- These source-level capabilities are not a claim that every browser/hardware acceptance scenario has passed.

## Review Findings / Remaining Work

### High priority: integration verification
- Existing storage/UI suite passes, including the previously failing diagram widget-policy test.
- No committed browser integration coverage found for pen/touch/mouse drag/drop, docking, radial creation, library spawn, PDF section-switch rendering, or the newly added PDF share flow.
- Real tablet/stylus latency, browser startup, offline behavior, PDF export output, and end-to-end recovery under storage pressure were not exercised in this review.
- Release readiness therefore remains unverified despite green unit tests and syntax checks.

### Medium priority: orchestration cleanup
- `src/main.js` is 5,377 lines, down from the earlier documentation estimate of ~8.7k; it is not yet bootstrap/composition-only.
- Runtime extractions now include input routing, library/dock overlays, workspace persistence, dialogs, context/section, document/PDF, library/reference, knowledge, onboarding, and ink/gesture orchestration under `src/features/runtime/`.
- Active plan: `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`; final cleanup and runtime-boundary test coverage remain.

### Medium priority: storage continuity
- Unit tests cover asset cleanup/budgets, PDF byte restoration, schema migration, notebook isolation and quota-failure handling.
- Heavy-notebook continuity under actual browser quota pressure and the reimport experience still need browser/device validation. Store-level tests do not establish complete workflow reliability.

## Corrected Stale Findings
- The previously documented widget-policy failure is fixed; current suite is 55/55 passing.
- `src/features/graph/` and `src/widgets/graph/` were removed in `c557443`; dormant graph code is no longer an outstanding cleanup item.
- The runtime segmentation plan is ahead of the old CURRENT_STATE summary; domain runtimes listed above are already extracted.
- Previous review findings about memory-only contexts, missing migration/asset infrastructure, simplistic onboarding and no tests describe older code, not this checkout.

## Documentation / Product Scope
- Four live canonical root docs: `docs/README.md`, `docs/PROJECT_SUMMARY.md`, `docs/CURRENT_STATE.md`, `docs/MISSING_FROM_VISION.md`.
- Sprint 8–18 specs, `FINAL_DESIGN.md`, and the old sprint summary are archived under `docs/done/`; the latter is `SPRINTS_SUMMARY_active_2026-02-12.md`.
- Historical sprint labels are not a current completion ledger. Product now centers on notebooks/sections and notes/PDF/reference/diagram workflows.
- Collaboration/cloud sync/accounts, OCR ingestion and a full default research-browser workflow remain deferred.

## Verification — 2026-09-26
- `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`: **55 passed, 0 failed**, including expected injected quota-failure warnings.
- `node --input-type=module --check` for all 75 `src/**/*.js` files plus `sw.js`: **76 passed, 0 failed**.
- Git/source inspection confirmed current refs, feature policy, removed graph code and runtime extraction progress.
- Final `git diff --check` passed; only `docs/CURRENT_STATE.md` and `docs/MISSING_FROM_VISION.md` changed. Review complete.
- Browser/tablet, performance, offline, export and end-to-end acceptance tests were not run.

## Changes / Next Actions
- Updated this file and `docs/MISSING_FROM_VISION.md` to remove resolved findings and reflect current verification.
- Add browser integration coverage for core pointer, docking, library, section/PDF restore and share flows; perform real tablet acceptance checks.
- Finish the orchestration cleanup and test extracted runtime boundaries.
- Review storage-pressure continuity with realistic notebook/PDF sizes before release sign-off.

## UI / Feature Audit — 2026-09-26 (complete)
- Scope: ease of use, responsive/dense-workspace scaling, aesthetics, accessibility, interaction mechanics and implementation completeness at `6151df2`.
- Plan: inspect DOM/CSS and interaction modules, exercise browser workflows if temporary tooling can be installed, and produce a prioritized evidence-based report under `docs/reviews/`.
- Application code will remain unchanged. Preserve the existing documentation edits from the preceding review.
- Browser tooling was not preinstalled; attempting a temporary Playwright installation under `/tmp/notes-ui-audit`.

### UI audit verification results
- Temporary Playwright/Chromium and required shared libraries were installed/extracted under `/tmp/notes-ui-audit`; a local-only server on port 4173 served the unchanged app.
- Fresh-profile browser checks: 1440×900, 1024×768, 768×1024, 390×844; basic startup produced no page errors. Portrait/phone header measured 332px versus 53px on desktop; Add Section is off-edge. At 390×450 with search open, canvas begins below the viewport (y=545px).
- Confirmed browser findings: library touch swipe spawns a widget instead of scrolling; one search match reports two results; Delete followed by Ctrl+Z does not restore a widget; Ctrl+C collapses a selected widget.
- Isolated source-module checks: switching search index scopes removes prior scope entries; text after the indexing cap is unsearchable; diagram X action deletes all nodes when none is selected.
- Generated sample PDF import, reload restoration and PDF download succeeded; searching visible PDF body text returned no matches.
- Automated axe scan of initial desktop/tablet-sized DOM found missing visible H1 only; canvas-drawn controls are not fully covered by this scan.
- Screenshots saved under `docs/reviews/ui-audit-2026-09-26/`. Browser emulation is not physical tablet/stylus or large-PDF performance validation.

### UI audit outcome and handoff
- Full prioritized report: `docs/reviews/UI_EASE_OF_USE_AND_FEATURE_AUDIT_2026-09-26.md`.
- Release-priority usability gaps: narrow-screen header/canvas layout, touch library scrolling versus accidental spawning, nonrecoverable widget/diagram deletion, Ctrl+C shortcut collision, and search scope/content/count defects.
- Current research panel has no DOM entry point in `index.html`; distinguish dormant infrastructure from accessible features.
- Next order: safe editing and responsive shell, explicit creation/library actions, reliable retrieval, then visual hierarchy and real-device validation.
- Only documentation and screenshot evidence were changed; no application fixes were attempted as part of this analysis.

- Final documentation verification: `git diff --check` passed; all report screenshot links resolve. Working changes are the two canonical docs plus `docs/reviews/` report/evidence. Temporary local audit server stopped at completion.

## UI improvement planning — 2026-09-26
- User requested a change plan with direction questions for each change; no application implementation is in scope yet.
- Finalized decision plan: `docs/plans/UI_IMPROVEMENT_PLAN.md`, covering 30 main decisions and five behavior follow-ups.
- D01–D05 accepted: unified ink/widget/diagram Undo/Redo plus deletion Undo notification; selected-node Delete with separate confirmed Clear; fix shortcut modifiers while deferring clipboard; compact two-row header; library swipe-scroll, tap-preview, explicit Add and dedicated drag handle.
- Later batches cover creation/library mechanics, search/feature scope, visual/accessibility choices, export/storage/offline and release validation. Recommendations are explicitly unapproved; no defaults will be inferred from silence.
- Current handoff: D01–D13 and D16–D35 accepted; D14/D15 deferred with a future raw-canvas-to-Note architecture direction. All current-pass direction questions resolved. Implementation stages and acceptance gates finalized in `docs/plans/UI_IMPROVEMENT_PLAN.md`; application code unchanged.
- Planning verification: `git diff --check` passed. Documentation-only work; no new application tests needed.

### Planning decisions recorded — batch 1
- Updated `docs/plans/UI_IMPROVEMENT_PLAN.md` with the user’s exact selected directions and implementation implications.
- Explicit scope constraint: clipboard copy/paste is deferred; fixing Ctrl/Cmd+C modifier handling must not expand into clipboard implementation.
- Batch 2 asks each direction separately, consistent with the agreed top-row layout and library gestures. No application implementation started.
- Verification/handoff: `git diff --check` passed. Documentation-only changes; awaiting D06–D10 choices.

### Planning decisions recorded — batch 2
- D06: gesture-only creation with improved hints/labels; no persistent Add button. D07: simplified labeled radial menu supporting drag/release and open/tap.
- D08: resizable searchable/filterable library drawer with visible Close and optional recents. D05 library scroll/preview/Add/dedicated-handle behavior remains accepted.
- D09: independent copies by default, optional linking, plus source-version provenance and a small adjacent stale-version hint when visible. Actions: Link, Dismiss, Never show again for this widget. Independent content never auto-updates.
- D10: retain current gesture-first widget mechanics; explain Pin versus Dock through clearer labels/hints. This does not revoke the dedicated library drag handle.
- Updated `docs/plans/UI_IMPROVEMENT_PLAN.md`, including acceptance checks and explicitly unresolved history/linking details. No application changes.
- Batch 2 verification/handoff: `git diff --check` passed; documentation-only changes. Awaiting D11–D15 preferences shown directly in the conversation.

### Planning decisions recorded — search and canvas architecture
- D11A: notebook-wide search over sections/library with scope narrowing. D12A: full existing text, titles/tags/diagram labels and extractable PDF text; no OCR or new typing implementation. D13A: shared Library/Search side drawer with truthful counts/snippets and keyboard navigation.
- D14/D15 deferred: no typing or new research UI in this pass. Accepted future direction is native canvas content anywhere, optional lossless Snip into Note for movement/library benefits, and conversion back to editable raw elements.
- Recorded deferred architecture requirements and unresolved conversion semantics in `docs/plans/UI_IMPROVEMENT_PLAN.md`; aligned `docs/PROJECT_SUMMARY.md` and `docs/MISSING_FROM_VISION.md` without presenting planned behavior as implemented.
- Next questions D16–D20 cover suggestions, diagram scope, aesthetics, widget identity/navigation and touch target density. Planning only; no application changes.
- Verification/handoff: `git diff --check` passed. Documentation-only updates; awaiting D16–D20 directions. Deferred architecture is not an implementation claim.

### Planning decisions recorded — suggestions and visual direction
- D16A: nonblocking inline suggestions with Accept/Dismiss and recovery tray. D17A: basic flowchart hardening with unified undo; no expanded diagram families.
- D18A: preserve teal while simplifying surfaces/shadows, unifying icons and strengthening hierarchy. D19B: contextual titles and gesture-first navigation; improve minimap/hints without adding persistent labels/navigation controls.
- D20A: finger-friendly hit areas with compact icons and consistent spacing. No adaptive or user-switched density mode selected.
- Updated `docs/plans/UI_IMPROVEMENT_PLAN.md` and acceptance checks to respect these choices. D21–D25 cover onboarding, settings, accessibility, theme details and PDF export. Planning only.
- Verification/handoff: `git diff --check` passed. Documentation-only changes; awaiting D21–D25 preferences.

### Planning decisions recorded — onboarding, settings and export
- D21A: contextual gesture/library/docking hints, controlled from Help. D22A: one grouped menu for document actions, writing/gestures, appearance and Help; developer controls tucked away.
- D23B: labels, focus, keyboard actions and reduced motion now; accessible widget navigator deferred. D24B: one bundled font and theme/icon consistency; dark mode deferred.
- D25A: PDF export preview, selected-content/section scope, orientation, fit/tiled pages and cancellation; retain image-based output initially. No vector/searchable export promise.
- Updated `docs/plans/UI_IMPROVEMENT_PLAN.md` and acceptance checks. Final main questions D26–D30 cover save feedback, editable backup, offline behavior, supported devices and refactoring scope. No application implementation.
- Verification/handoff: `git diff --check` passed. Documentation-only updates; awaiting D26–D30 preferences.

### Planning decisions recorded — reliability, offline and full optimization
- D26A: transient Saving/Saved feedback with persistent actionable failures. D27C: full-workspace editable backup/restore including notebooks, settings, native contents and assets.
- D28A: essentially all current core functionality must work offline after installation, including PDFs, search, suggestions, export and backup; locally bundle required dependencies/fonts/workers while preserving lazy execution. External citation navigation is separate from local functionality.
- D29A: tablet/desktop editing with basic phone access; prioritize Galaxy Tab/S Pen and iPad/Apple Pencil. Physical hardware checks remain necessary; no claim that they have passed.
- D30: full measured optimization across input, rendering, PDF pipelines, storage/history, memory, startup, indexing/UI updates and module architecture. Deferred typing/research/Note migration remain excluded.
- Updated `docs/plans/UI_IMPROVEMENT_PLAN.md` with accepted directions, reliability checks and optimization workstream. Final D31–D35 questions settle undo scope/lifetime, Recently Deleted, stale-copy hint dismissal and linking with local edits.
- Handoff: planning only; no application implementation. Awaiting D31–D35 directions before consolidating implementation stages.
- Verification: `git diff --check` passed after the planning updates. Documentation-only changes; application tests were not rerun.

### Planning finalized — recovery and source linking
- User selected 31A/32A: unified per-section ink/widget/diagram history with bounded persistence across app restarts; 33A: 30-day Recently Deleted with manual empty.
- User selected 34A: suppress dismissed source revision, prompt again only for a newer revision; permanent per-widget suppression remains. 35A: preview/confirm source replacement, preserving the old local contents through Undo.
- Consolidated `docs/plans/UI_IMPROVEMENT_PLAN.md` into six stages: baseline/contracts; durable editing; tablet shell; source/search/suggestions; export/backup/offline; optimization and physical-device release validation. Documented dependencies, transactional recovery/asset retention, and verification gates.
- Read archived sprint summary at `docs/done/SPRINTS_SUMMARY_active_2026-02-12.md`; `docs/SPRINTS_SUMMARY.md` no longer exists. Current product decisions govern this plan.
- Planning complete. No application changes or new application test runs; implementation and hardware validation remain future work.
- Verification: corrected the planned persistence integration path to `src/features/runtime/workspace-persistence-controller.js` after checking it against the repository. `git diff --check` passed; documentation-only work.

## Approved UI implementation — in progress
- User authorized implementation of the finalized plan. Baseline: 55 tests passed (`node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`).
- Added serializable per-section entity-delta history and deletion retention foundation in `src/features/history/section-history.js`; workspace serialization retains recovery asset references and native ink. Runtime/UI wiring and verification in progress.
- Fixed shortcut modifier guard and removed diagram Delete fallback that cleared the entire diagram. No completion claim yet.

### Implementation progress — runtime, tablet UI and offline workflows
- 59 unit/store tests pass, including new history ordering, reload, bounded retention and deletion-bin checks. Browser create/undo/redo/reload flow passes without page errors; tablet header is ~110px (audit baseline 332px).
- Added shared Library/Search drawer placement, compact navigation/tool rows, labeled radial creation and explicit library Add/drag handles; source-copy provenance/hints and recoverable linking are wired.
- Added local PDF.js/font assets, full asset precache manifest generation, notebook-wide retained text search and PDF text extraction on import. Added export settings/page preview/cancel, verified editable archive format and staged restore/rollback code.
- Added bounded decoded PDF image cache and raster-registration memoization. Browser workflows, offline integration, fault injection and performance validation still in progress; physical tablets unavailable in this environment.
