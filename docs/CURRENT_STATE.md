# CURRENT_STATE

## Current Sprint
- Sprint 14 (`docs/SPRINT_14_Research_Panel_and_Citation_Model.md`) has now been implemented onto current `main`.
- Sprint 10 and Sprint 12 remain implemented; Sprint 11 remains skipped per directive.

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
  - Widget creation controller: `src/features/widget-system/widget-creation-controller.js`
  - Universal widget interaction manager: `src/features/widget-system/widget-interaction-manager.js`
  - Reference popup interactions + snip tool: `src/features/reference-popups/`
  - Whitespace analyzer/manager: `src/features/whitespace/`
  - Graph interactions: `src/features/graph/`
  - Research panel capture flow (lazy-loaded): `src/features/research/research-panel.js`
  - Context metadata store: `src/features/contexts/context-store.js`
  - Context-scoped workspace persistence: `src/features/contexts/context-workspace-store.js`
  - Context management UI controller (lazy-loaded): `src/features/contexts/context-management-ui.js`

## In Progress
- No active blocker.
- Sprint 14 research/citation flow is now active:
  - Research panel is loaded on demand and captures text/definition/image snippets with citation fields.
  - `ResearchCapture` records are persisted per context and deduped by citation/content key.
  - Reference popup payloads now persist citation metadata, snippet content type, and capture id linkage.
  - Reference popups render citation cards and provide a source-jump action.

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
- Creation intents now carry provenance metadata (`createdFrom`, source/context fields) across manual, suggestion-accepted, and imported paths.
- Whitespace-driven expanded-space creation now records `createdFrom: suggestion-accepted`.
- Popup metadata now follows:
  - `PopupMetadata`: `{ id, title, type, sourceDocumentId, tags[], createdAt }`
- Popup behavior preferences now follow:
  - `PopupBehaviorPrefs`: `{ avoidStylus, motionReduced }` (stored at `notes-app.popup.behavior.v1`)
- Research capture and citation model now follows:
  - `Citation`: `{ sourceTitle, url, accessedAt, author?, publisher?, snippetType, attributionText }`
  - `ResearchCapture`: `{ id, contextId, contentType, content, citation }`
  - Workspace schema now persists `researchCaptures[]` alongside widget state.

## Next Actions
1. Run QA for each capture type (`text`, `definition`, `image`) and verify save/restore per context.
2. Validate source-link action and citation card rendering across zoom levels and collapsed/minimized popup states.
3. Add regression tests for `researchCaptures` normalization/migration and citation payload import behavior.

## Verification Status
- `for f in $(rg --files /home/illya/io_dev/notes-app/src | rg '\\.js$'); do node --check \"$f\"; done` passed.

## Last Updated
- 2026-02-07 (local environment time)
