# PROJECT_SUMMARY

## Phase 2 Focus

This roadmap continues from the completed foundation sprints (0, 1, 2, 3, 4, 5, 7) and targets the missing capabilities captured in `docs/MISSING_FROM_VISION.md`.

The goal is to evolve the prototype into a production-shaped modular notes system without breaking the current performance-first architecture.

## Current Baseline

Implemented already:
- Canvas runtime with pan/zoom and touch pinch support
- Lazy widget registry and modular loading
- Ink engine with persistence
- PDF widget with tiled rendering and whitespace collapse
- Reference popup and snip flow
- Graph widget with persistence

Archived specs are in `docs/done/`.

## Non-Negotiable Principles

1. All features stay modular and lazily loaded.
2. Interaction latency remains first priority.
3. UI stays minimal and context-driven.
4. Data models must support safe schema evolution.

## Phase 2 Workstreams

1. Contexts and scoped workspaces
2. Universal widget interaction system
3. Intent-driven widget creation UX
4. Suggestion system with recoverable ghosts
5. Multi-document management and bindings
6. Advanced popup semantics
7. Research and citation workflows
8. Ink gestures and searchable metadata
9. Peek mode and world-scale semantics
10. Schema migrations and asset lifecycle
11. Production UI minimalism and onboarding

## Out of Scope (Still Deferred)

- Collaboration
- Cloud sync and accounts
- OCR
- Simulation engines

## Success Criteria

- Users can work in multiple scoped contexts without cross-contamination.
- Widget interactions are consistent across all widget types.
- Suggestion flows are recoverable and non-destructive.
- Search and metadata allow fast retrieval of created material.
- Documentation and schema strategy support ongoing iteration without data loss.
