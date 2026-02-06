# Sprint 16 - Peek Mode and World-Scale Semantics

## Goal
Implement dedicated peek/overview mode and explicit world-unit sizing semantics.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 8.1 and 8.2 identify missing overview behavior and predictable insertion scale.

## Scope
In scope:
- Temporary peek mode with simplified rendering
- Explicit world-unit widget sizing model
- Insert-at-current-zoom normalization rules

Out of scope:
- Unlimited deep overview zoom

## Deliverables
- Peek mode trigger and rendering policy
- Widget size normalization utilities
- Placement rules for new widgets independent of camera zoom

## Architecture Changes
- Add render-mode flag for peek LOD.
- Introduce world-space dimension helpers used by all creators.

## Data Model Changes
- Optional global sizing config: world-unit defaults per widget type
- Placement metadata for newly instantiated widgets

## UI and Interaction Contract
- Peek mode is transient and intentionally simplified.
- New widgets appear at predictable world sizes regardless of zoom.

## Performance Constraints
- Peek mode must reduce render cost versus normal interactive mode.

## Edge Cases and Failure Modes
- Entering peek during active ink stroke.
- Extremely dense canvases.
- Legacy widgets missing normalized size metadata.

## Test Plan
- Verify consistent placement/sizing at different zoom factors.
- Validate peek behavior with mixed widget types.
- Confirm graceful fallback for legacy data.

## Exit Criteria
- Users can orient quickly with peek mode.
- Widget scale semantics are deterministic.
