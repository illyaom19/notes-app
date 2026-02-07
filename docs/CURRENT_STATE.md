# CURRENT_STATE

## Current Sprint
- Sprint 18 (`docs/SPRINT_18_Production_UI_Minimalism_and_Onboarding.md`) has now been implemented onto current `main`.
- Sprint 10 and Sprint 12 remain implemented; Sprint 11 remains skipped per directive.
- UX flow refactor pass (Notebook + Section composition, radial creation, grouped search, notebook library linking) has been integrated on top of Sprint 18.

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
  - Search index pipeline + search panel (lazy-loaded): `src/features/search/`
  - Pen gesture recognizer + bindings: `src/features/gestures/pen-gestures.js`
  - World-size normalization utilities: `src/features/widget-system/world-sizing.js`
  - Context metadata store: `src/features/contexts/context-store.js`
  - Context-scoped workspace persistence: `src/features/contexts/context-workspace-store.js`
  - Context management UI controller (lazy-loaded): `src/features/contexts/context-management-ui.js`

## In Progress
- No active blocker.
- Sprint 18 production UI and onboarding flow is now active:
  - UI mode (`debug` / `production`) is persisted and switchable from top-bar controls.
  - Production mode hides debug-heavy chrome (status + advanced controls) and keeps an intent-first quick action surface.
  - A lazy-loaded onboarding hint overlay now guides first-run flows and persists per-context dismissal/completion state.

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
- Gesture and search models now follow:
  - `GesturePrefs`: enable flags + per-gesture bindings (`doubleTap`, `barrelTap`)
  - `SearchIndexEntry`: `{ id, contextId, widgetId, fields, updatedAt }`
  - Search indexing remains in-memory, context-aware, and debounced on widget mutations.
- World sizing and placement now follow:
  - Optional world-size config by type loaded from `notes-app.world-size-config.v1`.
  - Creator defaults are normalized in world units per widget type.
  - Placement metadata is attached to created widgets under `metadata.placementMetadata`.
- Storage migration and asset lifecycle now follow:
  - Persisted envelope shape: `{ schemaVersion, data }`.
  - Migration runner utilities live in `src/features/storage/schema-migrations.js`.
  - Asset catalog model: `{ id, type, sizeBytes, refs, createdAt, lastAccessedAt, derivedFrom?, hash? }`.
  - Workspace serialization now stores `pdfAssetId` / `imageAssetId` with inline payload fallback repair for stale assets.
  - Unreferenced assets are garbage-collected on context/widget ref updates and on maintenance passes.
- Production UI and onboarding now follow:
  - `UiModeState`: `{ mode: "debug" | "production" }` stored at `notes-app.ui-mode.v1`.
  - Production mode defaults to minimal persistent chrome and compact document controls.
  - Onboarding state is stored per profile/context with hint entries:
    - `{ hintId, dismissedAt, completionState }`
  - Onboarding hint overlays are lazy-loaded and non-blocking.
  - Users can disable/re-enable or reset hints without leaving the canvas workflow.
- Notebook/Section composition now follows:
  - Existing context model is treated as notebook scope in UX.
  - New section state is stored per notebook at `notes-app.notebook.sections.v1`.
  - Active workspace persistence uses scope key composition `<notebookId>::<sectionId>`.
  - Legacy notebook-only workspace payloads are migrated lazily into the active section on first load.
- Creation UX now follows:
  - Touch-and-hold radial creation is primary (`src/features/widget-system/widget-creation-controller.js`).
  - Creation menu supports drag-to-highlight and release-to-select.
  - Creation menu includes notebook-library insertion (`library-reference`).
- Notebook library now follows:
  - Shared notebook reference library store at `notes-app.notebook.library.v1`.
  - Reference popup long-press menu supports `Save Ref To Notebook`.
  - Linked instances carry `metadata.librarySourceId` and sync metadata-only from the notebook library.
  - Notebook deletion now clears associated library and section metadata records.
- Search UX now follows:
  - Search results are grouped by current section and other sections in the active notebook.
  - Search panel supports non-selectable group headers.
  - Result navigation routes across notebook/section scope before focusing target widget.
- Production-shell adjustments now follow:
  - Section strip is the persistent interaction rail in production.
  - Notebook management and gesture settings are exposed via the menu panel (hamburger-like `Menu` button).
  - Onboarding hint catalog is reduced to three task hints (PDF import, radial create, search/peek).
- Popup clutter handling now follows:
  - Reference popup overflow (>3) is auto-minimized and dock-stacked along the viewport edge.
- Research flow policy (current):
  - Research panel code remains present for compatibility, but active UX emphasis has shifted to notebook/section/radial/search flows and research remains deferred for future re-introduction.

## Next Actions
1. Run tablet-first UX QA on radial hold creation (hold threshold, accidental activation, drag-release selection confidence).
2. Validate section migration behavior from legacy context-only payloads across multi-notebook workspaces.
3. Add explicit notebook-library editing UI (list/manage entries without requiring widget context menu save path).
4. Decide whether to fully remove hidden/deferred research panel wiring or retain compatibility mode.

## Verification Status
- `for f in $(rg --files /home/illya/io_dev/notes-app/src | rg '\\.js$'); do node --check \"$f\"; done` passed.
- `node --test tests/storage/*.test.mjs` passed.
- `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs` passed.
- `for f in $(rg --files /home/illya/io_dev/notes-app/src /home/illya/io_dev/notes-app/tests | rg '\\.(js|mjs)$'); do node --check \"$f\" || exit 1; done` passed.
- `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs` passed (including new `tests/ui/notebook-sections-store.test.mjs` and `tests/ui/notebook-library-store.test.mjs`).

## Last Updated
- 2026-02-07 (local environment time)
