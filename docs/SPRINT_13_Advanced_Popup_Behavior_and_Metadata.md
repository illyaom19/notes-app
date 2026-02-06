# Sprint 13 - Advanced Popup Behavior and Metadata

## Goal
Add popup identity semantics and optional stylus-aware avoidance behavior.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 5.1 and 5.2 call out missing metadata and proximity behavior.

## Scope
In scope:
- Popup metadata model and labels
- Optional stylus proximity avoidance
- Accessibility toggle for motion behavior

Out of scope:
- Complex physics engine

## Deliverables
- Popup metadata schema and persistence
- Labeled popup header badges/type indicators
- Toggleable proximity-nudge interaction

## Architecture Changes
- Extend popup interaction manager with proximity observer.
- Add motion preference gating.

## Data Model Changes
- `PopupMetadata`: `{ id, title, type, sourceDocumentId, tags[], createdAt }`
- `PopupBehaviorPrefs`: `{ avoidStylus: boolean, motionReduced: boolean }`

## UI and Interaction Contract
- Popups always display identity (title/type).
- Proximity nudge is subtle, bounded, and user-toggleable.

## Performance Constraints
- Proximity checks must be lightweight and throttled.

## Edge Cases and Failure Modes
- Stylus hover unavailable on device.
- Nudge conflicts with screen edges.
- Reduced motion preference overrides avoid behavior.

## Test Plan
- Verify metadata persistence and label rendering.
- Validate nudge behavior on supported and unsupported devices.
- Validate accessibility toggle behavior.

## Exit Criteria
- Popup identity is persistent and visible.
- Avoidance behavior is optional and stable.
