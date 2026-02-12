# PROJECT_SUMMARY

## Product Direction

`notes-app` is a tablet/stylus-first, local-first canvas workspace where documents and notes are organized as movable widgets.

Primary goals:
- Keep drawing and navigation latency low in dense canvases.
- Keep storage reliable for document-heavy notebooks.
- Keep widget interactions predictable across touch, pen, and mouse.
- Keep UI minimal while still discoverable.

## Current Architecture Shape

- Runtime orchestration: `src/main.js`
- Canvas + camera core: `src/core/canvas/`
- Widget base + rendering contracts: `src/core/widgets/`
- Widget types currently active:
  - Notes (`expanded-area`)
  - PDF (`pdf-document`)
  - Reference/Snip (`reference-popup`)
  - Diagram (`diagram`)
- Key feature modules:
  - Ink + lasso: `src/features/ink/`
  - Widget interactions + creation: `src/features/widget-system/`
  - Notebook/section/library stores: `src/features/notebooks/`, `src/features/sections/`, `src/features/contexts/`
  - Suggestions + references/library UI: `src/features/suggestions/`, `src/features/references/`
  - PDF/document lifecycle: `src/features/documents/`, `src/widgets/pdf/`
  - Gestures and minimap: `src/features/gestures/`, `src/features/minimap/`

## Execution Priorities (Current)

1. Reliability first:
- eliminate state-loss edge cases across section/notebook switches
- keep PDF/library rehydration stable under storage pressure

2. Performance under load:
- maintain smooth ink while canvases are widget/PDF heavy
- reduce interaction jank during drag/resize/dock operations

3. Input consistency:
- ensure parity for touch, pen, and mouse in all primary flows
- avoid modality-specific regressions in creation/selection/drag/drop

4. Maintainability:
- reduce orchestration coupling in `src/main.js`
- increase integration tests for gesture- and render-heavy flows

## Out of Scope (Still Deferred)

- Multi-user collaboration
- Cloud sync/accounts
- OCR pipelines
