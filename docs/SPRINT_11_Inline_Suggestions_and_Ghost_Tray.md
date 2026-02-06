# Sprint 11 - Inline Suggestions and Ghost Tray

## Goal
Implement suggestion lifecycle with inline accept/dismiss and recoverable ghost tray.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 3.1 and 3.2 define suggestion and recovery flows.

## Scope
In scope:
- Heuristic or model-backed suggestion generation
- Inline suggestion chips with accept/dismiss
- Ghost tray for dismissed suggestions

Out of scope:
- Cloud model serving

## Deliverables
- Suggestion generation pipeline interface
- Suggestion UI component set
- Ghost tray with restore and permanent discard actions

## Architecture Changes
- Add `SuggestionEngine` abstraction with pluggable providers.
- Add suggestion store partitioned by context/document.

## Data Model Changes
- `Suggestion`: `{ id, contextId, documentId, kind, anchor, label, state, createdAt }`
- Lifecycle states: `proposed`, `accepted`, `dismissed`, `ghosted`, `restored`, `discarded`

## UI and Interaction Contract
- Inline suggestion shows compact icon/label and accept/dismiss controls.
- Dismissed items move to ghost tray.
- Restored suggestions reappear at original or nearest valid anchor.

## Performance Constraints
- Suggestion computation is async and non-blocking.
- UI updates avoid jank during ink and pan.

## Edge Cases and Failure Modes
- Anchor region no longer valid.
- Duplicate suggestion suppression.
- Stale suggestions after document edits/import.

## Test Plan
- Generate, accept, dismiss, restore, and discard suggestions.
- Verify persistence across reload.
- Verify no duplicates after repeated analysis passes.

## Exit Criteria
- Suggestion lifecycle is complete and recoverable.
- Suggestion UI does not obstruct core workflow.
