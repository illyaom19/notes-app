# Sprint 8 - Contexts and Scoped Workspaces

## Goal
Introduce a first-class context model (course/topic/project) that scopes documents, references, and widgets.

## Why This Sprint Exists
`MISSING_FROM_VISION.md` section 1.1 identifies the absence of context boundaries and context switching.

## Scope
In scope:
- Context container data model
- Context switcher UI
- Context-scoped widget/document storage
- Explicit cross-context import flow

Out of scope:
- Multi-user sharing
- Server sync

## Deliverables
- Context registry service
- Context picker UI and create/rename/delete actions
- Runtime filtering so only active-context widgets render
- Cross-context import dialog for selected widgets/references

## Architecture Changes
- Add `ContextStore` module with lazy loading for context management UI.
- Extend runtime boot to resolve active context before widget restoration.
- Partition persisted keys by context id.

## Data Model Changes
- `Context`: `{ id, name, type, createdAt, updatedAt }`
- `ContextBinding`: widget/document metadata includes `contextId`
- `ActiveContextState`: `{ activeContextId, lastOpenedAt }`

## UI and Interaction Contract
- Users can switch context from top-level context control.
- Switching context unloads visible widgets from prior context and restores active context state.
- Import action allows selecting source context and specific assets/widgets.

## Performance Constraints
- Context switching target: under 120ms for empty/light contexts.
- No loading of non-active-context heavy widget modules.

## Edge Cases and Failure Modes
- Deleted active context: fallback to default context.
- Missing context metadata on legacy widgets: migrate to default context.
- Import conflicts on ids: resolve with regenerated ids and source reference retained.

## Test Plan
- Create multiple contexts and verify widget isolation.
- Switch contexts repeatedly and verify no stale widgets remain.
- Import selected items from one context to another.
- Restart app and verify active context persistence.

## Exit Criteria
- Context isolation is reliable.
- Cross-context import works for core widget types.
- Legacy data loads safely into default context.
