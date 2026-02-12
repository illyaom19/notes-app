# Sprint 10 - Widget Discovery and Intent-Driven Creation

## Goal
Replace toolbar-heavy creation with contextual, document-aware widget creation affordances.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` section 2.2 highlights missing intent-driven creation UX.

## Scope
In scope:
- Inline creation affordances near relevant document regions
- Reduced explicit debug creation buttons for production mode
- Unified creation flow for manual and suggested widgets

Out of scope:
- AI ranking model sophistication

## Deliverables
- Contextual creation entrypoints on canvas/document surfaces
- Lightweight command palette or radial creation menu
- Consistent visual treatment for manual and auto-created widgets

## Architecture Changes
- Add `WidgetCreationController` decoupled from toolbar.
- Define creation intents and target anchors.

## Data Model Changes
- `CreationIntent`: `{ type, anchor, sourceWidgetId, contextId, createdFrom }`
- Metadata for provenance (`manual`, `suggestion-accepted`, `imported`)

## UI and Interaction Contract
- Users can create widgets from in-context affordances without opening full tools panel.
- Creation UI appears on intent, not persistently.

## Performance Constraints
- Affordance overlays must not force full-canvas re-layout.

## Edge Cases and Failure Modes
- Anchor unavailable due zoom/layout changes.
- Creation canceled mid-flow.
- Unsupported widget type in current context.

## Test Plan
- Create each widget type through contextual flow.
- Verify provenance metadata correctness.
- Verify debug mode still supports explicit creation fallback.

## Exit Criteria
- Contextual creation is primary flow.
- Manual creation is consistent and low-friction.
