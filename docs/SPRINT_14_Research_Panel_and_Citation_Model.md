# Sprint 14 - Research Panel and Citation Model

## Goal
Provide a lightweight research workflow with citation-safe capture into widgets.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` sections 6.1 and 6.2 define missing research and attribution support.

## Scope
In scope:
- Embedded lightweight research panel
- Capture text snippets/definitions/images
- Citation metadata schema and rendering

Out of scope:
- Full page archival and rehosting

## Deliverables
- Research panel module
- Capture-to-widget flow for cited snippets
- Citation card UI and source link-back

## Architecture Changes
- Add research feature module loaded on demand.
- Separate raw capture from rendered widget preview.

## Data Model Changes
- `Citation`: `{ sourceTitle, url, accessedAt, author?, publisher?, snippetType, attributionText }`
- `ResearchCapture`: `{ id, contextId, contentType, content, citation }`

## UI and Interaction Contract
- Users can capture snippet + citation in one flow.
- Widgets show attribution clearly with source jump action.

## Performance Constraints
- Research panel must not load during normal canvas boot.

## Edge Cases and Failure Modes
- Unavailable or blocked URLs.
- Missing citation fields.
- Duplicate capture deduping.

## Test Plan
- Capture each supported content type with citation.
- Verify persistence and re-open behavior.
- Verify citation rendering and link integrity.

## Exit Criteria
- Research captures are citation-complete.
- No full-page storage violations.
