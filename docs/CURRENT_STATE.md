# CURRENT_STATE

## Current Sprint
- Sprint 12 (`docs/SPRINT_12_Multi_Document_Management.md`) implemented on top of current `main`.
- Sprint 11 was skipped per current implementation directive.

## What Exists Today
- Core runtime and modular widget architecture:
  - `src/core/canvas/`
  - `src/core/widgets/`
- Implemented widgets:
  - Dummy: `src/widgets/dummy/`
  - Expanded area: `src/widgets/expanded-area/`
  - PDF document (stacked pages + tile virtualization + snapshots): `src/widgets/pdf/`
  - Reference popup: `src/widgets/reference-popup/`
  - Graph widget (interactive + snapshot): `src/widgets/graph/`
- Implemented feature modules:
  - Ink engine: `src/features/ink/`
  - Document manager: `src/features/documents/document-manager.js`
  - Widget long-press menu: `src/features/widget-system/`
  - Universal widget interaction manager: `src/features/widget-system/widget-interaction-manager.js`
  - Reference popup interactions + snip tool: `src/features/reference-popups/`
  - Whitespace analyzer/manager: `src/features/whitespace/`
  - Graph interactions: `src/features/graph/`
  - Context metadata store: `src/features/contexts/context-store.js`
  - Context-scoped workspace persistence: `src/features/contexts/context-workspace-store.js`
  - Context management UI controller (lazy-loaded): `src/features/contexts/context-management-ui.js`

## In Progress
- No active blocker; Sprint 12 core scope is in place.
- Existing Sprint 10 creation-menu scaffolding remains present in working tree and is not fully wired.

## Blockers
- None.

## Decisions Made
- All heavy paths remain lazy-loaded via dynamic import/registry.
- Sprint 8 persistence will be partitioned by context id to satisfy scope isolation.
- Active context will be resolved before restoring workspace widgets at boot.
- Legacy/missing context metadata will be normalized into the default context during load.
- Context-scoped widget/document state is persisted via `notes-app.context.workspace.v1.<contextId>`.
- Cross-context import regenerates widget ids to avoid conflicts and preserves document bindings where possible.
- Sprint 9 interaction model will standardize move/resize/collapse affordances across widget types via one shared manager.
- Stylus will remain ink-only; widget manipulation will be touch/mouse driven.
- Runtime pointer routing now dispatches touch events to widget handlers before camera pan/pinch fallback.
- Shared move/resize/collapse is centralized in `WidgetInteractionManager`; specialized handlers keep only widget-specific actions.
- Widget serializable state now carries `interactionFlags` capability contract.
- Canvas runtime now renders ink layers after widgets so stylus strokes remain visible on expanded-space, reference popup, and PDF widget surfaces.
- PDF whitespace collapse now uses segment-based tile mapping so only collapsed whitespace regions compress while surrounding PDF content remains unscaled.
- Ink now persists with layer semantics:
  - Global layer strokes stay in world space.
  - PDF layer strokes stay attached to PDF widgets.
  - Widget layer strokes stay attached to widgets and collapse with collapsed widget bounds.
- Document registry is now independent from runtime widgets and persisted with explicit bindings:
  - `DocumentEntry`: `{ id, contextId, title, sourceType, widgetId, openedAt, pinned }`
  - `DocumentBindings`: `{ documentId, defaultReferenceIds, formulaSheetIds }`
- Active document focus brings the document widget plus its bound references/formula widgets to front.
- Workspace schema now persists `documentBindings` with backward compatibility migration from legacy `referenceWidgetIds`.
- UI now includes:
  - Open-document tab strip and list switcher.
  - Document settings panel for reference/formula binding assignment.
  - Pin/unpin and focus-bound-widget actions.

## Next Actions
1. Complete and wire Sprint 10 contextual creation controller (`creation-command-menu`) or remove dormant scaffolding.
2. Run manual QA for multi-document flows on tablet hardware (switch, pin, bind, context import).
3. Add targeted regression tests for document binding migration and focus behavior.

## Verification Status
- `for f in $(rg --files /home/illya/io_dev/notes-app/src | rg '\\.js$'); do node --check \"$f\"; done` passed.

## Last Updated
- 2026-02-06 (local environment time)
