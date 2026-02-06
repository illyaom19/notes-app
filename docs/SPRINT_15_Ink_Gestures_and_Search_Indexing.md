# Sprint 15 - Ink Gestures and Search Indexing

## Goal
Add gesture-based tool switching and global search across typed and widget metadata.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 7.1 and 7.2 identify gesture and search gaps.

## Scope
In scope:
- Pen gesture shortcuts (where hardware supports)
- Search index for widget titles/content metadata
- Search UI with result navigation

Out of scope:
- Handwriting OCR content indexing

## Deliverables
- Gesture recognizer and configurable bindings
- Search indexing pipeline
- Search panel and jump-to-result behavior

## Architecture Changes
- Add input gesture state machine on top of existing pointer handling.
- Add incremental index updater tied to widget mutations.

## Data Model Changes
- `GesturePrefs`: tool mapping and enable flags
- `SearchIndexEntry`: `{ id, contextId, widgetId, fields, updatedAt }`

## UI and Interaction Contract
- Users can switch tools quickly via gestures/double-tap where available.
- Search returns matching widgets and focuses canvas location.

## Performance Constraints
- Index updates are batched/debounced and non-blocking.

## Edge Cases and Failure Modes
- Unsupported pen gesture APIs.
- Large index sizes.
- Deleted widgets with stale index entries.

## Test Plan
- Gesture flow tests on supported/unsupported devices.
- Search correctness for titles and metadata fields.
- Stress test with many widgets.

## Exit Criteria
- Gesture switching is reliable and optional.
- Search is fast and accurate for indexed fields.
