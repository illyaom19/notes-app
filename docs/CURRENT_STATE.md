# CURRENT_STATE

## Current Sprint
- Sprint 1 (Ink Engine) implemented and ready to ship.
- Exit criteria status:
  - Vector stylus strokes with pressure capture implemented.
  - Zoom/pan camera preserves stroke geometry in world coordinates.

## What Exists Today
- Sprint 0 foundations remain in place.
- Sprint 1 ink engine modules:
  - `src/features/ink/index.js`
  - `src/features/ink/ink-engine.js`
  - `src/features/ink/stroke-store.js`
  - `src/features/ink/rendering.js`
  - `src/features/ink/stroke-raster-cache.js`
  - `src/features/ink/persistence.js`
- Canvas runtime now supports pluggable input handlers and render layers:
  - `src/core/canvas/canvas-runtime.js`
- App shell now supports ink controls and status:
  - `index.html`
  - `src/main.js`
  - `src/styles/app.css`

## In Progress
- No active implementation tasks.

## Blockers
- None.

## Decisions Made
- Ink subsystem is lazily loaded via dynamic import:
  - `import("./features/ink/index.js")` only when user clicks "Enable Ink".
- Stylus capture is pen-only (`pointerType === "pen"`) to avoid conflict with mouse pan/zoom.
- Completed strokes are raster-cached per camera/view state; active strokes remain vector-rendered for low latency.
- Local persistence uses `localStorage` with a versioned payload (`notes-app.ink.strokes.v1`).
- Undo/redo supports UI buttons and keyboard gestures (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`).

## Next Actions
1. Begin Sprint 2 implementation (`docs/SPRINT_2_Widget_System.md`).
2. Keep ink feature isolated as a module while introducing the expanded-area widget.
3. Maintain no-heavy-load boot behavior in all new integrations.

## Verification Status
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check` passed.
- Local server smoke command executed:
  - `timeout 2s python3 -m http.server 4173 --directory /home/illya/io_dev/notes-app`
- Architecture checks:
  - Lazy ink import in `src/main.js`
  - Pen-only input gate in `src/features/ink/ink-engine.js`
  - Persistence save path in `src/features/ink/persistence.js`

## Last Updated
- 2026-02-06 (local environment time)
