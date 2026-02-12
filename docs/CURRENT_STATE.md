# CURRENT_STATE

## Snapshot
- Date: 2026-02-12
- Branch reviewed: `main`
- Scope of this pass:
  - Comprehensive codebase/app-state review (performance, storage, reliability)
  - Documentation normalization and archive

## Current App Surface (Implemented)

### Core runtime
- Canvas runtime, camera pan/zoom/pinch: `src/core/canvas/`, `src/main.js`
- Modular widget architecture and lazy registration: `src/core/widgets/`, `src/main.js`

### Active widget types
- Notes widget (`expanded-area`): `src/widgets/expanded-area/`
- PDF widget (`pdf-document`): `src/widgets/pdf/`
- Reference/Snip widget (`reference-popup`): `src/widgets/reference-popup/`
- Diagram widget (`diagram`): `src/widgets/diagram/`

### Key user-facing systems
- Ink engine with pen/eraser/lasso and lasso-to-note flow: `src/features/ink/`
- Pen gestures including barrel handling/bindings: `src/features/gestures/pen-gestures.js`
- Radial widget creation: `src/features/widget-system/widget-creation-controller.js`
- Unified widget interactions (move/resize/collapse/docked-body interactions):
  - `src/features/widget-system/widget-interaction-manager.js`
- Viewport docking with edge glows and unsnap: `src/main.js`
- Notebook/section scoped persistence and switching:
  - `src/features/contexts/`
  - `src/features/sections/`
  - `src/features/notebooks/`
- Library UI and drag-to-spawn workflows: `src/features/references/reference-manager-ui.js`, `src/main.js`
- PDF raster/import/storage + missing-PDF reimport path:
  - `src/widgets/pdf/pdf-document-widget.js`
  - `src/features/documents/document-manager.js`
  - `src/main.js`
- PWA service worker and offline shell caching: `sw.js`, `src/main.js`

## Comprehensive Review Findings (Severity Ordered)

### High
1. Test suite is not fully green on `main`.
- Failing test: `tests/ui/widget-types.test.mjs`
- Root issue: test expectations still reflect pre-diagram policy while `diagram` is now in `SUPPORTED_WIDGET_TYPES` and `USER_CREATION_TYPES`.
- Impact: weak CI signal and reduced confidence in regression detection.

2. No integration tests for highest-risk pointer/render flows.
- Current tests are predominantly storage/UI-unit tests.
- Missing automated coverage for drag/dock/library-spawn/radial + touch/pen interaction sequences and PDF section-switch rendering reliability.
- Impact: user-visible regressions can ship while unit tests remain green.

### Medium
1. Runtime orchestration is highly centralized.
- `src/main.js` currently ~8.7k LOC and owns many concern boundaries.
- Impact: elevated change risk and slower safe iteration.

2. Partially dead/legacy feature surfaces remain.
- Graph feature code remains in tree (`src/features/graph/`, `src/widgets/graph/`) while current supported widget policy is centered on notes/pdf/reference/diagram.
- Impact: maintenance and onboarding complexity.

3. Storage-pressure UX is resilient but still disruptive.
- The app correctly warns/fails safely under quota pressure and can request PDF reimport; this preserves integrity but interrupts workflow for heavy notebooks.
- Impact: reliability is safe, continuity is not ideal under constrained storage.

## Medium Severity Plan Tracking
- `src/main.js` orchestration split:
  - Status: in progress
  - Plan: `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md`
  - Completed in current cycle:
    - Input routing extracted to `src/features/runtime/input-routing-controller.js`
    - Library overlay orchestration extracted to `src/features/runtime/library-overlay-controller.js`
    - Viewport dock overlay orchestration extracted to `src/features/runtime/viewport-dock-overlay-controller.js`
    - Workspace persistence orchestration extracted to `src/features/runtime/workspace-persistence-controller.js`
  - Remaining slices are documented in the plan and should be implemented in listed order.

### Low
1. Live documentation had drifted from implementation.
- Resolved in this pass by archiving non-core docs and refreshing canonical docs.

## Documentation State (After This Pass)

### Live canonical docs (exactly 4)
- `docs/README.md`
- `docs/CURRENT_STATE.md`
- `docs/PROJECT_SUMMARY.md`
- `docs/MISSING_FROM_VISION.md`

### Archived docs
- Non-core top-level docs moved to `docs/done/`, including:
  - `FINAL_DESIGN.md`
  - `SPRINTS_SUMMARY.md` (archived as `SPRINTS_SUMMARY_active_2026-02-12.md` due filename collision)
  - `SPRINT_8` through `SPRINT_18` specs

## Verification Status

Commands run in this pass:
- `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`
  - Result: 15 passed, 1 failed (`tests/ui/widget-types.test.mjs`).
- `node tests/ui/widget-types.test.mjs`
  - Confirmed assertion mismatch caused by diagram support being added to widget policy.
- Static scan:
  - `rg -n "TODO|FIXME|HACK|XXX|BUG" src tests docs`
  - No active TODO/FIXME markers found in core runtime paths.

## Recommended Next Steps
1. Fix `tests/ui/widget-types.test.mjs` to match current widget policy.
2. Add integration tests for touch/pen/mouse interaction flows (radial create, library drag-spawn, viewport dock/undock, PDF section rehydration).
3. Continue executing `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md` until `main.js` is bootstrap/composition-only.
4. Decide whether graph is coming back soon; if not, archive/remove dormant graph surfaces.
