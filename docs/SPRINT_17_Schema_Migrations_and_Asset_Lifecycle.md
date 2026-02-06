# Sprint 17 - Schema Migrations and Asset Lifecycle

## Goal
Establish explicit schema versioning, migration pipeline, and asset lifecycle management.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 9.1 and 9.2 identify missing migration and storage lifecycle strategy.

## Scope
In scope:
- Schema version registry
- Migration runner for persisted data
- Asset reference counting and cleanup

Out of scope:
- Cloud backup/version history

## Deliverables
- Migration framework with version map and tests
- Asset catalog tracking raw/derived items
- Garbage collection pass and storage budget enforcement

## Architecture Changes
- Add storage abstraction layer with migrations on startup.
- Add asset manager module used by PDF/snip/research widgets.

## Data Model Changes
- Persisted payload envelope: `{ schemaVersion, data }`
- `AssetRecord`: `{ id, type, sizeBytes, refs, createdAt, lastAccessedAt, derivedFrom? }`

## UI and Interaction Contract
- Users receive non-blocking migration status only on failure/major changes.
- Cleanup is automatic and transparent.

## Performance Constraints
- Migration and cleanup operations are chunked to avoid blocking input.

## Edge Cases and Failure Modes
- Corrupt persisted payloads.
- Partial migration failures.
- Asset refs leaked on widget deletion/import rollback.

## Test Plan
- Migration tests across multiple historical versions.
- Asset ref-count integrity tests.
- Storage pressure simulation.

## Exit Criteria
- Persisted data upgrades safely.
- Asset storage remains bounded and recoverable.
