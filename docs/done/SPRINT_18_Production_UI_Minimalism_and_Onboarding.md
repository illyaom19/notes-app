# Sprint 18 - Production UI Minimalism and Onboarding

## Goal
Ship production-oriented minimal chrome with onboarding and progressive discoverability.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 10.1 and 10.2 identify debug-heavy UI and no onboarding.

## Scope
In scope:
- Production mode UI gating for debug panels
- Intent-first controls and gesture-first defaults
- First-run onboarding and progressive hints

Out of scope:
- Full tutorial course content

## Deliverables
- Production/debug mode switch and configuration
- Minimal chrome layout
- Onboarding hint system with dismissal persistence

## Architecture Changes
- Add UI mode configuration source.
- Add onboarding state service keyed by context and user profile (local).

## Data Model Changes
- `UiModeState`: `{ mode: 'debug' | 'production' }`
- `OnboardingState`: `{ hintId, dismissedAt, completionState }[]`

## UI and Interaction Contract
- Production mode shows only essential controls by default.
- Hints appear contextually and do not block writing.

## Performance Constraints
- Onboarding overlays are lightweight and lazy-loaded.

## Edge Cases and Failure Modes
- Users disable hints then need re-enable path.
- Small-screen/tablet layout conflicts.
- Mode switching while tools are open.

## Test Plan
- Validate production mode flow end-to-end on tablet.
- Validate onboarding hint progression and dismissal persistence.
- Regression test access to core operations with minimal chrome.

## Exit Criteria
- Production mode is usable without debug surfaces.
- New users can discover core flows without external docs.
