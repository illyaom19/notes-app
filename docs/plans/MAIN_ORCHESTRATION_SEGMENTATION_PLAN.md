# Main Orchestration Segmentation Plan

## Objective
Refactor `src/main.js` to a bootstrap/composition entrypoint while moving runtime orchestration into focused modules.

## Status
- Plan type: active implementation plan
- Priority: Medium severity from `docs/CURRENT_STATE.md`
- Goal state: `main.js` is bootstrap-only

## Completed Work
- Extracted runtime controllers:
  - `src/features/runtime/input-routing-controller.js`
  - `src/features/runtime/library-overlay-controller.js`
  - `src/features/runtime/viewport-dock-overlay-controller.js`
  - `src/features/runtime/workspace-persistence-controller.js`
- Wired `src/main.js` to delegate to these controllers for input routing, dock overlays, library overlays, and persistence scheduling.
- Extracted dialog orchestration runtime:
  - `src/features/runtime/dialog-runtime.js`
- Extracted context/section orchestration runtime:
  - `src/features/runtime/context-section-runtime.js`
- Extracted document/PDF orchestration runtime:
  - `src/features/runtime/document-pdf-runtime.js`
- Extracted library/reference orchestration runtime:
  - `src/features/runtime/library-reference-runtime.js`
- Wired `src/main.js` to delegate dialog + context/section orchestration to runtime modules.
- Wired `src/main.js` to delegate document/PDF import, reimport, hydration, and document-binding/focus orchestration.
- Wired `src/main.js` to delegate library serialization, duplicate checks, drag-import flows, linked-library sync, and library spawn/import flows.
- Extracted knowledge orchestration runtime:
  - `src/features/runtime/knowledge-runtime.js`
- Wired `src/main.js` to delegate suggestion scheduling/execution/state transitions and search/research panel runtime glue.
- Extracted onboarding orchestration runtime:
  - `src/features/runtime/onboarding-runtime.js`
- Wired `src/main.js` to delegate onboarding hint overlay scheduling, catalog actions, and hint controls runtime glue.
- Extracted core ink/gesture orchestration runtime:
  - `src/features/runtime/ink-gesture-runtime.js`
- Wired `src/main.js` to delegate ink feature loading, ink-tool actions, pen-style updates, and pen-gesture controller bootstrapping.
- Completed ink/gesture runtime extraction (phase 2):
  - moved gesture preference control event wiring
  - moved ink dropdown open/close and hover wiring
  - moved ink cursor-pill routing helpers

## Remaining Slices (Ordered)
1. Final cleanup pass
- Remove dead helpers from `main.js`.
- Keep `main.js` focused on runtime construction + bootstrap wiring only.
- In progress:
  - removed dead onboarding proxy helpers no longer referenced
  - removed dead ink/dropdown cursor proxy helpers and routed input controller directly to runtime methods
  - removed onboarding runtime proxy wrappers and switched callsites to direct `onboardingRuntime` invocation

## Contracts To Keep Stable
- Widget drag payload semantics used across interaction and overlay controllers.
- `widget.metadata.viewportDock` shape and version semantics.
- Workspace persistence payload schema in `contextWorkspaceStore.saveFromRuntime(...)`.
- Existing UI behavior and gesture semantics (no UX changes in this refactor).

## Test Matrix
Run after every slice:
- `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`

Recommended targeted additions:
- Runtime-module tests per extracted slice in `tests/ui/` or `tests/storage/` as applicable.
- Regression checks for:
  - viewport docking
  - library drag/drop + trash target
  - PDF import/reimport and restore flows
  - context/section switching persistence

## Definition of Done
- `main.js` is bootstrap/composition-oriented.
- Domain orchestration resides in runtime modules under `src/features/runtime/`.
- All existing storage/UI tests pass.
- New runtime-module tests cover extracted orchestration boundaries.
- `docs/CURRENT_STATE.md` updated to reflect completion of the Medium-severity split task.

## Execution Log Template
- Date:
- Slice:
- Files added/updated:
- Behavior changed: yes/no (should be "no" for this refactor)
- Tests run:
- Result:
- Commit:

## Execution Log
- Date: 2026-02-12
- Slice: Dialog runtime extraction + Context/section runtime extraction
- Files added/updated:
  - `src/features/runtime/dialog-runtime.js`
  - `src/features/runtime/context-section-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Document/PDF runtime extraction
- Files added/updated:
  - `src/features/runtime/document-pdf-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Library/reference runtime extraction
- Files added/updated:
  - `src/features/runtime/library-reference-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Knowledge runtime extraction
- Files added/updated:
  - `src/features/runtime/knowledge-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Onboarding runtime extraction
- Files added/updated:
  - `src/features/runtime/onboarding-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Ink/gesture runtime extraction (phase 1)
- Files added/updated:
  - `src/features/runtime/ink-gesture-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Ink/gesture runtime extraction (phase 2)
- Files added/updated:
  - `src/features/runtime/ink-gesture-runtime.js`
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Final cleanup pass (phase 1)
- Files added/updated:
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending

- Date: 2026-02-12
- Slice: Final cleanup pass (phase 2)
- Files added/updated:
  - `src/main.js`
  - `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
- Behavior changed: no (refactor-only target)
- Tests run: `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
- Result: pass (16/16)
- Commit: pending
