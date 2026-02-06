# CURRENT_STATE

## Current Sprint
- Sprint 2 (Widget System) implemented and ready to ship.
- Exit criteria status:
  - Widget modules load dynamically from registry.
  - Collapsed widgets render through lightweight snapshot paths.

## What Exists Today
- Sprint 0 foundations remain in place.
- Sprint 1 ink engine remains modular and lazy-loaded.
- Sprint 2 widget system additions:
  - Expanded-Area widget module:
    - `src/widgets/expanded-area/index.js`
    - `src/widgets/expanded-area/expanded-area-widget.js`
  - Long-press context menu feature:
    - `src/features/widget-system/long-press-menu.js`
  - Widget base/runtime extensions:
    - `src/core/widgets/widget-base.js`
    - `src/core/canvas/canvas-runtime.js`
  - App shell/menu wiring:
    - `index.html`
    - `src/main.js`
    - `src/styles/app.css`

## In Progress
- No active implementation tasks.

## Blockers
- None.

## Decisions Made
- Expanded-Area widget is registered in `WidgetRegistry` and loaded only on instantiation.
- Long-press context menu supports:
  - create expanded-area widget
  - collapse/expand selected widget
  - remove selected widget
- `WidgetBase` now has explicit collapse semantics via `setCollapsed(...)` and world-space hit testing.
- Runtime renders collapsed widgets through `renderSnapshot(...)` to keep collapsed rendering cheap.

## Next Actions
1. Begin Sprint 3 implementation (`docs/SPRINT_3_PDF_Widget.md`).
2. Keep PDF renderer lazy and isolated as a widget module.
3. Preserve tablet zoom + ink responsiveness while integrating document rendering.

## Verification Status
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check` passed.
- Local server smoke command executed:
  - `timeout 2s python3 -m http.server 4173 --directory /home/illya/io_dev/notes-app`
- Architecture checks:
  - `registry.register("expanded-area", () => import("./widgets/expanded-area/index.js"))` exists in `src/main.js`
  - `createWidgetContextMenu(...)` wired in `src/main.js`
  - `setCollapsed(...)` in `src/core/widgets/widget-base.js`
  - Snapshot render branch for collapsed widgets in `src/core/canvas/canvas-runtime.js`

## Last Updated
- 2026-02-06 (local environment time)
