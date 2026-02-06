# CURRENT_STATE

## Current Sprint
- Sprint 3 (PDF Document Widget) implemented.
- Exit criteria status:
  - PDF widget loads via lazy module import.
  - PDF rendering path uses tile cache and thumbnail snapshot mode.

## What Exists Today
- Sprint 0 foundations remain in place.
- Sprint 1 ink engine remains modular and lazy-loaded.
- Sprint 2 widget system (expanded-area + long-press menu) remains active.
- Sprint 3 PDF widget additions:
  - PDF widget module:
    - `src/widgets/pdf/index.js`
    - `src/widgets/pdf/pdf-document-widget.js`
    - `src/widgets/pdf/pdf-tile-cache.js`
    - `src/widgets/pdf/pdfjs-loader.js`
  - App import pipeline wiring:
    - `index.html`
    - `src/main.js`
  - Runtime render context extended for widget viewport rendering:
    - `src/core/canvas/canvas-runtime.js`

## In Progress
- No active implementation tasks.

## Blockers
- None.

## Decisions Made
- PDF widget is registered lazily: `registry.register("pdf-document", () => import("./widgets/pdf/index.js"))`.
- `pdfjs-dist` is loaded only inside the PDF widget module through CDN dynamic import (primary + fallback).
- Tiled rendering is done by per-page tile cache (`PdfTileCache`) with queued tile rasterization.
- Collapsed PDF widgets render thumbnail snapshots only (cheap collapsed path).
- Ink overlay remains compatible because ink rendering layer already sits over the canvas scene.

## Next Actions
1. Begin Sprint 4 implementation (`docs/SPRINT_4_Reference_Popups.md`).
2. Keep popup/snip functionality modular and lazily loaded.
3. Preserve tablet zoom and ink responsiveness while adding multi-document referencing.

## Verification Status
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check` passed.
- Local server smoke command executed:
  - `timeout 2s python3 -m http.server 4173 --directory /home/illya/io_dev/notes-app`
- Architecture checks:
  - PDF lazy registry entry exists in `src/main.js`
  - File-input import pipeline exists in `index.html` + `src/main.js`
  - Tile cache rendering exists in `src/widgets/pdf/pdf-tile-cache.js`
  - Thumbnail snapshot path exists in `src/widgets/pdf/pdf-document-widget.js`

## Last Updated
- 2026-02-06 (local environment time)
