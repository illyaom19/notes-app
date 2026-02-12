AI note-taking app roadmap framework (everything we discussed)
0) Core product goals

Tablet-first, stylus-first note taking for STEM-heavy workflows (but flexible for any subject).

“Imported PDFs + interactive widgets” as the main concept.

Collapsible/expandable everything to keep the canvas clean.

Fast, local-first performance with smart rendering at different zoom levels.

1) Content model: everything is a widget

Widget = the universal building block (each is an object with data + view state + actions).

Document widget (imported PDFs, slides, assignments, handouts, readings)

Example/Problem widget (solve inside the notes)

Expanded-area widget (a “micro-canvas” for extra workspace that collapses back into a small box)

Reference popup widget (formula sheet, assignments, other docs)

Image widget (embedded image with pan/zoom/crop)

Web definition widget (saved excerpt/summary + citation link; optional snapshot/preview)

Diagram widget family

Circuit diagrams

Logic gates / digital systems

Network diagrams (router networks, topology)

ML network diagrams (nodes/edges, layers)

Graphing widget (Desmos-like interactive, with saved snapshot)

Calculator / scratch widget (quick calculations that can insert results back into notes)

Global widget behaviors

Collapse / expand

Drag / reposition (where applicable)

Resize handle (where applicable)

Long-press context menu (minimal UI until needed)

Title/label support (lightweight, optional)

Export / share actions per widget type

Question to pressure-test:
If everything is a widget, how do you prevent “widget soup” when a user has tons of them—what’s the absolute minimum UI that still makes things findable?

2) Import pipeline: “smart suggestions” from PDFs

When a user imports a PDF note package

AI scans layout + structure to identify “sections”

Examples, problems, missing-solution gaps, step-by-step blocks

Large whitespace regions that likely imply “work here”

The app proposes widget suggestions in-place:

Small icon + short label + checkmark / ❌

Approve = widget is created

Dismiss = app forgets the suggestion completely

Suggestion safety nets

Suggestions are non-blocking (never interrupt lecture flow)

Re-trigger later: a “ghost” indicator (sidebar/ruler/overlay) for dismissed or postponed suggestions

Optional manual “rescan page / document” action

Question to pressure-test:
How will you handle false positives (a big blank gap that was just formatting) without training users to ignore every suggestion?

3) Adaptive whitespace + space management

Whitespace collapsing (optional)

Detect whitespace only (not content) and collapse it to save vertical space

When a widget exists in that region, collapsing becomes “widget collapsed view”

Semi-transparent preview/edge hint so the user knows it’s just whitespace and can expand it

Expanding sections

“Expand section” action to create more workspace around an active widget

The “Expanded-area widget” solves the “too little space” problem elegantly:

Tap -> opens larger canvas

Work inside -> collapse back into compact card

Question to pressure-test:
How do you keep context visible (the surrounding text/diagram) when a user expands a widget so they don’t lose what they were solving?

4) Multi-document workflow: references, popups, split views, tabs

Reference system

Each course/topic context can define:

Default formula sheet

Syllabus

Reference docs

Assignments (A1…A5)

Any “pinned” doc shortcuts

Pop-up reference windows

Minimal UI floating windows with:

Pan + zoom inside the popup

Quick minimize back to icon/label

Multiple popups open at once

Drag + resize handles

Snip-and-paste

Inside a reference popup: Quick Snip button

Grab a formula/definition snippet

Paste into main note space or into a widget

Smart “nudge away” (optional)

If stylus approaches popup, popup nudges aside to avoid blocking writing

Toggleable (accessibility / preference)

Split-screen + tabs

Drag a popup into a split view with current document (reference-focused split, not full “desktop chaos”)

Tab bar / list of currently open documents

Context boundaries

Course/topic “spaces” keep references scoped so users don’t see everything everywhere

Cross-topic references available via “More…” → “Import reference from other topic”

Question to pressure-test:
What’s the cleanest way to prevent clutter when users have 3+ references open—without making them micromanage windows?

5) STEM power features
5.1 Graphing (Desmos-style)

Graphing widget supports:

Interactive mode (full tool)

Snapshot mode (static image preview when collapsed / inactive)

Tap to re-activate interactive mode

Store graph state so it reloads exactly

5.2 Math / calculation tooling

Calculator widget (lightweight, inserts results)

Optional symbolic / step-by-step engine later (phase 2/3)

5.3 Electrical engineering diagram workflows

Circuit diagram widget:

Drawing + snapping + component library (optional to start simple)

Context menu actions:

Export as SPICE netlist (basic)

Export as SPICE netlist (guided: let user add initial conditions / parameters by referencing notes)

“90% usable export” goal:

Auto-generate nodes + components

User tweaks models, ICs, sources as needed

Question to pressure-test:
How will you handle component models (op-amp macros, MOSFET models, etc.) so exports don’t feel fake or useless?

6) Non-STEM / general knowledge workflows

Embedded research capture

Embedded web browser (or constrained “research panel”) to grab:

Definitions

Images

Excerpts

Citations

Web content as widgets

“Definition widget” can be:

Collapsed: icon + title (“Fourier Transform definition”)

Expanded: excerpt/summary + citation link + optional stored snapshot preview

Copyright/legality strategy (practical direction)

Favor:

User-captured snippets/excerpts (small)

Summaries + citation links

Metadata (title, author/site, date accessed)

User-generated notes around the snippet

Avoid “rehosting full pages” behavior

Question to pressure-test:
Where’s your line between “helping a student cite a source” vs “copying content into the app,” and how will you enforce it in UX?

7) Stylus + tablet must-haves

Palm rejection

Pressure sensitivity (and ideally tilt)

Low-latency inking pipeline

Gesture shortcuts (double-tap pen, quick lasso, undo/redo)

Shape recognition (optional)

Offline-first (no internet required to take notes)

OCR / searchable text (typed + optional handwriting recognition later)

Smooth zoom/pan navigation

Question to pressure-test:
If handwriting recognition is out-of-scope early, what’s your “search” MVP—typed text only, tags, or per-widget titles?

8) Navigation + zoom behavior (LOD performance)

Zoom philosophy you proposed

Default working zoom level

No infinite zoom-out

“Peek/Show Desktop” style quick zoom-out to view structure/map

Infinite (or generous) zoom-in allowed

Level-of-detail degradation

At far zoom:

Widgets render as icons/placeholders/snapshots only

No heavy interactive rendering

At near zoom:

Full rendering

Ink detail, text detail, diagrams, interactive tools

Widget sizing rule

Widgets have a world/canvas size (consistent relative scale)

Visual size changes with zoom (like any canvas)

Insert-at-current-zoom should still map to sane default world units so it doesn’t appear comically huge/small

Question to pressure-test:
When a user adds a widget while extremely zoomed in, how do you ensure it doesn’t become microscopic when they return to normal zoom?

9) Data + storage architecture (local-first)

Local-first plan

Start fully local (fast, reliable)

Later add sync once the model is stable

Per-widget data storage

Widget schema:

id, type, position, size, z-index, collapsed_state, title

content_payload (type-specific)

assets references (images, PDFs, snapshots)

created_at, updated_at, version

Each widget can serialize cleanly to database (object-oriented mapping)

Assets strategy

Images:

Store raw original (for fidelity)

Store compressed preview(s) (for speed)

PDFs:

Store original file

Store rendered page thumbnails / tiles for fast viewing

Graph widgets:

Store state + static snapshot

Web widgets:

Store excerpt/summary + citation metadata + optional snapshot

Ink/stylus data

Store as vector strokes (custom stroke format or SVG-like path data)

Capture: points, pressure, tilt, timestamp, tool, color, thickness

Generate raster caches/tiles for fast rendering at different zoom levels

Code modularity

Widget code loaded on-demand (“only import if widget exists”)

Keeps app lightweight and reduces cold-start cost

Question to pressure-test:
What’s your migration/versioning plan when widget schemas evolve (you will change them)?

10) Performance + rendering strategy

Virtualization: only render visible widgets

Tiled rendering for big PDFs/canvases

Snapshot-first for heavy widgets (graphs, web previews, large diagrams)

Background preprocessing (import scan, thumbnail generation) without blocking writing

Deterministic caching rules so reopening notes is instant

Question to pressure-test:
How do you prevent “import processing” from draining battery or heating the tablet during a long day of lectures?

11) UX principles (the vibe you’re aiming for)

Minimal UI by default

Power features hidden behind:

Context menus (long press)

“More…” actions

Compact icons with labels

User stays in flow:

Suggestions are optional

Popups are lightweight

Snip/paste is fast

Collapse keeps things clean