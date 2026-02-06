# Sprint 12 - Multi-Document Management

## Goal
Support explicit open-document management and document-level reference bindings.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 4.1 and 4.2 identify missing document registry and assignment semantics.

## Scope
In scope:
- Open document registry
- Tab/list document switcher
- Document-to-reference binding presets

Out of scope:
- Server document sharing

## Deliverables
- Document manager module
- Open/focus/pin document UI
- Document settings panel for assigned references/formula sheets

## Architecture Changes
- Add document registry independent from widget runtime list.
- Add focus state linking active document to visible related widgets.

## Data Model Changes
- `DocumentEntry`: `{ id, contextId, title, sourceType, openedAt, pinned }`
- `DocumentBindings`: `{ documentId, defaultReferenceIds[], formulaSheetIds[] }`

## UI and Interaction Contract
- Users can switch among open documents via tabs/list.
- Opening a document applies its default reference set quickly.

## Performance Constraints
- Switching focused document should avoid full app reload.

## Edge Cases and Failure Modes
- Missing bound reference widgets.
- Duplicate open documents.
- Stale bindings when references deleted.

## Test Plan
- Open multiple PDFs and switch focus.
- Assign references and verify auto-open behavior.
- Persist and restore document working set.

## Exit Criteria
- Multi-document workflow is explicit and stable.
- Document-level reference binding works predictably.
