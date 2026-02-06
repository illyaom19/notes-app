
AI-ASSISTED MODULAR NOTE-TAKING APP
Product Requirements & Engineering Directive
(Agent-Ready Specification)

NON-NEGOTIABLE ENGINEERING PRINCIPLES

1. Everything must be modular
- All functionality is composed of independent, self-contained modules (“widgets”).
- No widget code, assets, or logic may load unless that widget exists in the document.

2. Dynamic loading only
- Widgets must be lazy-loaded.
- Heavy functionality must never load at app start.
- Snapshot/placeholder rendering must be used when widgets are inactive or collapsed.

3. Performance over everything
- App must remain fast with hundreds of widgets and large PDFs.
- Rendering must degrade gracefully with zoom level (LOD system).
- Background processing must never block stylus input.

4. Minimal, modern UI
- UI must be nearly invisible.
- No persistent toolbars unless required.
- Contextual actions appear only on interaction.
- Canvas-first design philosophy.

PRODUCT VISION

This application transforms static documents into interactive, collapsible workspaces using AI-assisted widget suggestions. It is designed for tablet and stylus users, especially in STEM fields, while remaining flexible for general use.

PLATFORM & ARCHITECTURE DIRECTION

Preferred: Web-first core deployed as PWA or static-site native wrapper.

Acceptable stacks:
- HTML/CSS/JS with Canvas/WebGL, IndexedDB or SQLite WASM
- Flutter with deferred imports
- Other lightweight modular stacks supporting lazy loading and offline-first storage

CORE CONCEPT: EVERYTHING IS A WIDGET

Each widget:
- Has independent data, rendering, lifecycle
- Loads code only when instantiated or activated

Widget properties:
id, type, position, size, collapsed_state, render_mode, assets, data_payload, metadata

WIDGET TYPES (MVP)

- Document Widget (PDFs, slides)
- Example / Problem Widget
- Expanded-Area Widget
- Image Widget
- Reference Popup Widget

AI-ASSISTED IMPORT FLOW

On PDF import:
- Detect whitespace, examples, gaps
- Suggest widgets inline
- Accept or dismiss suggestions
- Dismissed suggestions forgotten unless manually recovered

ADAPTIVE WHITESPACE SYSTEM

- Detect whitespace only
- Collapse and expand dynamically
- Collapsed widgets show preview edge

MULTI-DOCUMENT REFERENCING

- Course/topic contexts
- Reference popups with zoom, pan, snip
- Multiple popups allowed
- Optional stylus proximity nudge

STEM FEATURES (MODULAR)

- Graphing Widget with snapshot mode
- Diagram Widgets (logic, networks)
- Circuit Diagram Widget with SPICE export

RESEARCH & NON-STEM SUPPORT

- Embedded research panel
- Definition widgets with citation metadata
- No full web page storage

STYLUS & INPUT

- Palm rejection
- Pressure sensitivity
- Low-latency vector ink
- Undo/redo gestures

ZOOM & RENDERING

- Limited zoom-out with peek mode
- Infinite zoom-in
- Level-of-detail rendering by zoom

DATA STORAGE

- Local-first
- Widget-based serialization
- Raw + preview assets

PERFORMANCE REQUIREMENTS

- Virtualized rendering
- Background processing
- No blocking stylus input

UX PHILOSOPHY

- Canvas-first
- Minimal UI
- Long-press for actions
- One-hand + stylus friendly

MVP SCOPE

Included:
- PDF import
- Manual widgets
- Stylus writing
- Reference popups
- Local storage

Excluded:
- Sync
- Collaboration
- OCR
- Simulation

FINAL DIRECTIVE

If a feature cannot be implemented without loading unnecessary code, it must be redesigned.
