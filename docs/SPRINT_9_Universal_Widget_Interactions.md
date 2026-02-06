# Sprint 9 - Universal Widget Interactions

## Goal
Unify drag, resize, collapse/expand, selection, focus, and snapshot affordances across all widgets.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` section 2.1 identifies inconsistent per-widget interaction handling.

## Scope
In scope:
- Shared interaction layer
- Unified resize handles and selection visuals
- Consistent context menu behavior

Out of scope:
- New widget types

## Deliverables
- `WidgetInteractionManager` with pointer routing and z-order integration
- Shared widget control affordances
- Widget capability contract (`movable`, `resizable`, `collapsible`)

## Architecture Changes
- Move drag/resize logic out of feature-specific handlers where possible.
- Add widget-level interaction adapter API.
- Keep specialized internals (for example graph pan inside body) behind standard hooks.

## Data Model Changes
- Extend serializable widget state with optional interaction flags.
- Track selected/focused widget id in runtime UI state.

## UI and Interaction Contract
- Every widget supports the same move/resize/collapse gestures where enabled.
- Selection visuals are consistent at all zoom levels.
- Keyboard affordances for selected widget actions are standardized.

## Performance Constraints
- Interaction routing must not add perceivable pointer lag.
- Hit testing remains O(visible widgets) with early-out ordering.

## Edge Cases and Failure Modes
- Nested controls inside widgets must not conflict with global handles.
- Touch and mouse behavior parity.
- Collapsed widgets keep minimal interaction surface only.

## Test Plan
- Validate all widget types for move/resize/collapse parity.
- Regression tests on graph and popup specialized interactions.
- Stress test with high widget counts.

## Exit Criteria
- Interaction parity achieved across core widgets.
- No regressions in existing tool-specific controls.
