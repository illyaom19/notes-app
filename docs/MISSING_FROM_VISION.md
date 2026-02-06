# MISSING_FROM_INITIAL_VISION.md

**Gap Analysis: Initial Idea Transcript vs Current Implementation**

This document enumerates all **features, behaviors, architectural concepts, and UX principles** that were part of the original idea transcript / PRD but are **not yet implemented or only partially implemented** in the current prototype.

The intent is not criticism — this is a **completeness and prioritization map**.

---

## 1. CORE CONCEPTUAL GAPS

### 1.1 Course / Topic Contexts

**Original Vision**

- Notes exist inside _contexts_ (courses, topics, projects).
- Each context scopes:
  - PDFs
  - Reference popups
  - Formula sheets
  - Assignments
- Cross-context references available via explicit import.

**Current State**

- Single global canvas.
- All widgets exist in one flat namespace.
- No concept of context boundaries.

**Missing**

- Context container model.
- Context switching UI.
- Context-scoped reference sets.
- Cross-context reference import mechanism.

---

## 2. WIDGET SYSTEM GAPS

### 2.1 Universal Widget Interaction Model

**Original Vision**

- All widgets share:
  - Drag
  - Resize
  - Collapse / expand
  - Snapshot rendering
  - Context menu actions
- Interactions are uniform, not widget-specific.

**Current State**

- Widget interactions are implemented per-widget.
- No generalized drag/resize framework.
- Some widgets movable/resizable, others not.

**Missing**

- Global widget interaction layer.
- Unified drag/resize handles.
- Shared affordances (hover, focus, selection).

---

### 2.2 Widget Discovery & Creation UX

**Original Vision**

- Widgets are suggested automatically.
- Manual creation exists but is secondary.
- UI for widget creation is subtle and contextual.

**Current State**

- Manual widget instantiation via toolbar or context menu.
- Dummy widget exists primarily for testing.

**Missing**

- Intent-driven widget creation UX.
- Inline widget affordances tied to document structure.
- Visual consistency between manually created and auto-created widgets.

---

## 3. AI-ASSISTED FLOWS (INTENTIONALLY SKIPPED BUT STILL MISSING)

### 3.1 Inline Widget Suggestions

**Original Vision**

- AI suggests widgets based on:
  - Examples
  - Missing solution steps
  - Large whitespace gaps
- Suggestions appear inline with:
  - Icon
  - Short label
  - Accept / Dismiss

**Current State**

- No suggestion pipeline.
- Whitespace detection exists, but only for collapse.

**Missing**

- Suggestion model (even heuristic-based).
- Suggestion UI elements.
- Accept / dismiss interaction.

---

### 3.2 Ghost Suggestion Tray

**Original Vision**

- Dismissed suggestions can be recovered later.
- Ghost icons appear in sidebar/ruler-like UI.

**Current State**

- No suggestion persistence.
- No ghost affordances.

**Missing**

- Suggestion lifecycle state machine.
- Ghost tray UI.
- Re-trigger logic.

---

## 4. MULTI-DOCUMENT WORKFLOW GAPS

### 4.1 Reference Assignment per Document / Lecture

**Original Vision**

- Each lecture/document can have:
  - Assigned formula sheet
  - Assigned references
- These appear as quick-access popups.

**Current State**

- Reference popups exist but are ad-hoc.
- No semantic link between document and reference.

**Missing**

- Document → reference bindings.
- Default popup sets per document.
- Reference presets.

---

### 4.2 Tabbed / Open Document Management

**Original Vision**

- Users can:
  - Open multiple documents
  - Switch via tabs or list
  - Maintain working set visibility

**Current State**

- Widgets persist on canvas.
- No concept of “open documents”.

**Missing**

- Open document registry.
- Tab / document switcher UI.
- Focus management between documents.

---

## 5. ADVANCED POPUP BEHAVIOR GAPS

### 5.1 Stylus-Aware Popup Avoidance

**Original Vision**

- Popups dynamically nudge away when stylus approaches.
- Optional / accessibility-toggleable.

**Current State**

- Popups are static.

**Missing**

- Stylus proximity detection.
- Popup avoidance physics.
- Toggleable behavior.

---

### 5.2 Popup Metadata & Labeling

**Original Vision**

- Popups have:
  - Titles
  - Type indicators
  - Contextual labels

**Current State**

- Reference popups are largely anonymous containers.

**Missing**

- Popup identity model.
- Label rendering.
- Metadata persistence.

---

## 6. NON-STEM / RESEARCH WORKFLOWS

### 6.1 Embedded Research Browser

**Original Vision**

- Lightweight embedded browser.
- Capture:
  - Definitions
  - Images
  - Snippets
- Save as widgets with citation.

**Current State**

- No browser.
- Snip tool is image-only.

**Missing**

- Research panel.
- Text + citation capture.
- Web definition widget.

---

### 6.2 Citation & Attribution Model

**Original Vision**

- Respect copyright.
- Store:
  - Source
  - URL
  - Access date
- Avoid full-page rehosting.

**Current State**

- No citation model.

**Missing**

- Citation schema.
- Attribution UI.
- Link-back mechanics.

---

## 7. STYLUS & INK GAPS

### 7.1 Gesture-Based Tool Switching

**Original Vision**

- Double-tap pen actions.
- Quick tool switching gestures.

**Current State**

- Ink enabled via UI button only.

**Missing**

- Stylus gesture recognition.
- Tool mode state machine.

---

### 7.2 Search & Indexing

**Original Vision**

- Search across:
  - Typed text
  - Widget titles
  - (Future) handwriting OCR

**Current State**

- No search functionality.

**Missing**

- Indexing system.
- Search UI.
- Widget-level metadata search.

---

## 8. ZOOM & NAVIGATION GAPS

### 8.1 Peek / Overview Mode

**Original Vision**

- Temporary zoom-out “peek” to understand layout.
- Not full infinite zoom-out.

**Current State**

- Zoom is clamped but continuous.

**Missing**

- Dedicated peek gesture / mode.
- Simplified overview rendering.

---

### 8.2 World-Scale Widget Semantics

**Original Vision**

- Widgets have stable world-scale.
- Inserted widgets behave predictably regardless of zoom.

**Current State**

- Widget sizing is partially implicit.

**Missing**

- Explicit world-unit sizing model.
- Insert-at-current-zoom normalization.

---

## 9. DATA & ARCHITECTURE GAPS

### 9.1 Widget Schema Versioning

**Original Vision**

- Widget schemas evolve safely.
- Versioned migrations.

**Current State**

- LocalStorage keys versioned, but no migration strategy.

**Missing**

- Schema version registry.
- Migration layer.
- Forward/backward compatibility plan.

---

### 9.2 Asset Lifecycle Management

**Original Vision**

- Raw assets preserved.
- Derived previews cached.
- Cleanup when widgets deleted.

**Current State**

- Assets stored ad-hoc.

**Missing**

- Asset reference counting.
- Garbage collection.
- Storage budgeting.

---

## 10. UX / POLISH GAPS

### 10.1 Minimalism Enforcement

**Original Vision**

- UI appears only on intent.
- Almost no persistent chrome.

**Current State**

- Debug-heavy top bar.
- Status panel always visible.

**Missing**

- Production UI mode.
- Debug UI gating.
- Gesture-first workflows.

---

### 10.2 Onboarding & Discoverability

**Original Vision**

- Subtle onboarding.
- Affordances teach themselves.

**Current State**

- No onboarding flow.

**Missing**

- First-run hints.
- Progressive disclosure.
- Demo content.

---

## 11. INTENTIONALLY DEFERRED (NOT FAILURES)

These were consciously excluded and are **not blockers**:

- Collaboration
- Sync / backend
- OCR
- Simulation
- Accounts

---

## SUMMARY

**You have implemented:**

- The hardest parts (canvas, modular widgets, lazy loading, ink, PDF tiling, whitespace collapse).
- Correct architectural direction.

**What’s missing is mostly:**

- Semantic structure (contexts, references, relationships).
- Uniform interaction models.
- UX polish and discoverability.
- AI assist layer (planned later).

This is a **very strong foundation** — the remaining work is _composition, not reinvention_.
