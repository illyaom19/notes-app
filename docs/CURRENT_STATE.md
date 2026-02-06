# CURRENT_STATE

## Current Sprint
- Sprint 4 (Reference Popups) implemented and ready to ship.
- Exit criteria status:
  - Floating reference popup widget added.
  - Popups support drag, resize, minimize, close, and multi-popup management.
  - Quick snip pipeline captures canvas regions into popup widgets.

## What Exists Today
- Sprint 0 foundations remain in place.
- Sprint 1 ink engine remains modular and lazy-loaded.
- Sprint 2 widget system (expanded-area + long-press menu) remains active.
- Sprint 3 PDF widget supports vertical stacked pages with visible-page virtualization.
- Sprint 4 additions:
  - Reference popup widget:
    - `src/widgets/reference-popup/index.js`
    - `src/widgets/reference-popup/reference-popup-widget.js`
  - Snip + popup interaction features:
    - `src/features/reference-popups/snip-tool.js`
    - `src/features/reference-popups/popup-interactions.js`
  - App wiring and status outputs:
    - `index.html`
    - `src/main.js`

## In Progress
- No active implementation tasks.

## Blockers
- None.

## Decisions Made
- Reference popup modules are lazy-loaded via `WidgetRegistry` and dynamic feature imports.
- Snip tool is opt-in (`Start Snip`), captures viewport region to PNG data URL, then instantiates popup widgets.
- Popup interactions are runtime input handlers for non-pen pointers to avoid breaking ink flow.
- Multi-popup management is done through runtime z-order + per-popup controls.

## Next Actions
1. Begin Sprint 5 implementation (`docs/SPRINT_5_Whitespace_Management.md`).
2. Keep whitespace analysis lazy and non-destructive.
3. Integrate whitespace collapse/expand with Expanded-Area widget.

## Verification Status
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check` passed.
- Local server smoke command executed:
  - `timeout 2s python3 -m http.server 4173 --directory /home/illya/io_dev/notes-app`
- Architecture checks:
  - `registry.register("reference-popup", ...)` exists in `src/main.js`
  - Snip tool + popup interactions lazy imports exist in `src/main.js`
  - Drag/resize/minimize logic exists in `src/features/reference-popups/popup-interactions.js`

## Last Updated
- 2026-02-06 (local environment time)
