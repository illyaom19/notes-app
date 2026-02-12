# MISSING_FROM_VISION

This file tracks **real remaining gaps** between the current app and the intended product direction.

## Critical

- None confirmed in this review pass.

## High

1. Automated test suite is not green on `main`.
- `tests/ui/widget-types.test.mjs` still asserts the pre-diagram widget policy and fails now that `diagram` is supported.
- Impact: CI confidence is reduced and regressions can hide behind known red tests.

2. No integration coverage for high-risk pointer/render flows.
- Existing tests are mostly store/unit-level (`tests/storage/*.mjs`, `tests/ui/*.mjs`).
- Missing: automated validation for pen/touch drag-drop, dock/undock, radial creation, library spawn-to-canvas, and PDF section-switch rehydration.
- Impact: behavior can regress without detection despite unit tests passing.

## Medium

1. Runtime orchestration is highly centralized.
- `src/main.js` is currently large and owns many unrelated concerns (input routing, persistence wiring, UI overlays, widget lifecycle, docking, library drag state).
- Impact: change risk is high; unrelated features can regress during routine edits.

2. Legacy/unused feature surfaces remain in tree.
- Example: `src/features/graph/` and `src/widgets/graph/` exist while graph widgets are not part of current supported widget types.
- Impact: maintenance overhead and confusion about current supported behavior.

3. Storage UX under quota pressure still needs hardening.
- Current flow warns on quota failures and can request reimport for missing PDF state; this is safe but still disruptive in heavy notebooks.
- Impact: notebook continuity degrades in low-storage environments.

## Low

1. Historical docs had diverged from implementation.
- This pass resolves that by archiving historical sprint/design docs and reducing live docs to 4 canonical files.

## Deferred by Product Decision

- Collaboration / cloud sync / accounts
- OCR ingestion
- Full research-browser workflow as a first-class default flow
