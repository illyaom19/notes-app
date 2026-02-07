# CURRENT_STATE

## Current Sprint
- Sprints 14-18 are now implemented on this branch in one integrated pass and aligned against `docs/FINAL_DESIGN.md` for production-readiness polish.
- Sprint 10/12/13 remain implemented; Sprint 11 remains skipped per directive.

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
  - Context metadata store: `src/features/contexts/context-store.js`
  - Context-scoped workspace persistence: `src/features/contexts/context-workspace-store.js`
  - Context management UI controller (lazy-loaded): `src/features/contexts/context-management-ui.js`
  - Research panel/citation capture (lazy-loaded): `src/features/research/research-panel.js`
  - Search indexing and navigation: `src/features/search/search-index.js`
  - Pen gesture preference manager: `src/features/input/gesture-manager.js`
  - UI mode + onboarding hint services: `src/features/ui/ui-mode.js`, `src/features/ui/onboarding.js`
  - Schema envelope + asset catalog lifecycle: `src/features/storage/schema-storage.js`, `src/features/storage/asset-manager.js`

## In Progress
- None.

## Blockers
- None.

## Decisions Made
- Sprints 14-18 were delivered in a single cohesive branch with lazy boundaries preserved (research panel remains lazy-loaded on first use).
- Workspace persistence migrated to an explicit envelope with schema compatibility (`{ schemaVersion, data }`) while retaining transparent v1 reads.
- Asset lifecycle is tracked via bounded local asset catalog recomputed from serialized widgets during persistence.
- Peek mode is render-mode based and transient (`normal` vs `peek`) with snapshot-first rendering in peek.
- World-size insertion semantics are explicit via per-widget-type world defaults and provenance placement metadata.
- Production UI minimalism is the default mode; debug affordances are still available via explicit mode switch.

## Next Actions
1. Perform tablet/stylus QA pass for gesture detection and peek interactions under real pen hardware.
2. Add deeper migration regression coverage for malformed historical payloads (schema v1 edge cases).
3. Validate citation capture UX copy and hint text with user feedback before release cut.

## Verification Status
- `for f in $(rg --files src | rg '\.js$'); do node --check "$f" || exit 1; done` passed.
- `python3 -m http.server 4173` + Playwright smoke flow (tools toggle, research panel open, search input, screenshot capture) passed.

## Last Updated
- 2026-02-07 (local environment time)
