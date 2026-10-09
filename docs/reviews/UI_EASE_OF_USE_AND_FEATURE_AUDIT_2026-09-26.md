# UI, Usability, Scaling and Feature Audit

Date: 2026-09-26. Baseline: `main` at `6151df2`.

## Assessment

The app has a useful core: writing on a spatial workspace, importing PDFs, organizing notebooks/sections, and reusing material through a library. The desktop shell is compact, and the common widget styling gives the canvas a coherent foundation. Basic PDF import, restoration and export worked in this audit.

The current experience is not ready to be called easy to use on its intended tablet form factor. The main problems are hidden entry points, competing gesture meanings, destructive actions without recovery, incomplete retrieval, and a broken narrow-screen layout. Several mechanics reduce visible chrome by transferring complexity to the user. Fix those before adding more widgets or decorative polish.

**Priority definitions:** P1 = fix before usability/release sign-off; P2 = next usability iteration; P3 = refinement. These are product priorities, not security severity ratings.

## Method and limits

- Read live product/state/gap docs, HTML, CSS, theme, and relevant feature/runtime modules.
- Ran Chromium through temporary Playwright tooling against the unchanged app served locally; used disposable profiles and synthetic content.
- Checked 1440×900 desktop, 1024×768 landscape tablet, 768×1024 portrait tablet, 390×844 phone, and a short 390×450 viewport.
- Exercised note creation/rename/library save, search, deletion/undo, Ctrl+C, diagram creation, a 50-item library with CDP touch input, generated PDF import, PDF download and reload restoration.
- Ran direct browser module checks for search scope retention, long-text indexing, and diagram deletion semantics.
- Ran an axe scan on the initial DOM. This cannot establish accessibility of canvas-only controls.
- Did not validate physical pen latency/palm rejection, Safari/iPadOS, native share sheets, sustained large-PDF workloads, full export visual fidelity, or every suggestion/docking/ink combination. No hardware performance claim is made.
- The existing 55-test passing result is from the preceding review; it was not rerun as a substitute for this browser audit.

## 1. Release-priority findings

### P1 — Narrow-screen header consumes the workspace

**Browser-confirmed.** Below 940px, `.section-strip` changes to a column, so each ink/search/menu control occupies a separate row.

| Viewport | Header height | Share of viewport height | Other observation |
| --- | ---: | ---: | --- |
| 1440×900 | 53px | 6% | Compact desktop header |
| 1024×768 | 53px | 7% | Landscape layout remains compact |
| 768×1024 | 332px | 32% | Add Section extends from x=759 to x=792, past the viewport |
| 390×844 | 332px | 39% | Add Section extends from x=381 to x=414, past the viewport |
| 390×450, search open | Canvas starts at y=545px | Entire canvas is below the visible area | Body scrolling is disabled |

The phone menu also becomes a tall, mostly empty sheet while the oversized header remains above it. This is a layout failure, not a subjective preference about whitespace.

**Improve:** two deliberate rows on narrow screens: notebook/section navigation, then a compact tool group. Give the tab scroller its own shrinkable space and keep Add Section outside its scrolling contents. Clamp search/menu height to available space and allow their contents to scroll. Account for safe-area insets and short/keyboard-constrained viewports.

**Acceptance:** at 768×1024 and 390×844, all primary actions remain reachable, header stays roughly within 100px, and opening search never puts the canvas entirely below the viewport.

Source: `src/styles/app.css:326`, `src/styles/app.css:2159`; `index.html` section strip. [Portrait evidence](ui-audit-2026-09-26/tablet-portrait-initial.png), [phone menu](ui-audit-2026-09-26/phone-menu.png), [short viewport](ui-audit-2026-09-26/short-search.jpg).

### P1 — Library swipes create content instead of scrolling

**Browser-confirmed with 50 seeded items.** The list had 1,649px of content in a 258px viewport. An upward touch swipe left `scrollTop` at zero and increased canvas widget count from one to two.

Rows start drag tracking on pointer-down; movement beyond 7px activates import/drag. The scroll stack and chips have `touch-action: none`. Vertical browsing and dragging are competing for the same gesture, and dragging wins.

**Improve:** make vertical swipe scroll. Use a distinct drag handle or hold-before-drag; provide an explicit **Add to section** action in the preview. Keep drag-to-spawn as a shortcut. Preserve scroll position when the list refreshes.

**Acceptance:** users can browse 100 items by touch without creating anything; adding an item has a clear preview and explicit destination.

Source: `src/features/references/reference-manager-ui.js:1394`, `src/styles/app.css:1413`. [Dense library](ui-audit-2026-09-26/library-50.jpg).

### P1 — Destructive actions do not match the apparent Undo contract

**Browser-confirmed:** delete a note through its context menu, then Ctrl+Z: widget count remains zero. The header says “Undo,” but both that button and Ctrl+Z invoke the ink history only.

Deletion through context menu, Delete/Backspace and the drag trash target is immediate. There is no corresponding workspace-history restoration path in these handlers. Moving/resizing/renaming and diagram mutations likewise do not use a shared transaction history.

**Improve:** add workspace undo/redo for creation/deletion, transforms, diagram edits and library operations. Until then, label the current control **Undo ink**, show a recoverable “Deleted — Undo” notification for widget deletion, and protect unrecoverable destructive actions.

Source: `src/main.js:4745`, `src/main.js:4876`, `src/features/widget-system/long-press-menu.js:323`, `src/features/widget-system/widget-interaction-manager.js:925`.

### P1 — Diagram X changes meaning and can clear the entire diagram

**Source and module-confirmed:** the `clear-selection` toolbar action deletes a selected node; if no node is selected, it empties all nodes and edges. A two-node test with no selection returned zero nodes. The same small X icon represents both operations, without a confirmation or diagram undo path.

**Improve:** Delete selected should be disabled without a selection. Put **Clear diagram…** in an overflow menu with confirmation and undo. Keep destructive controls away from creation controls.

Source: `src/widgets/diagram/diagram-widget.js:597`. [Diagram controls](ui-audit-2026-09-26/diagram.jpg).

### P1 — Search promises substantially more than it retrieves

Several independent issues were reproduced:

- One selectable match displays **“2 results”** because group headings are included in the count.
- A search result for a plain note showed an internal UUID and the implementation term **“Expanded Area”** instead of useful content/type copy.
- After indexing section B, section A entries are removed. The “Other Notebook Sections” presentation is not backed by a retained notebook-wide index in this path.
- Text is capped through `pushUnique(..., maxLength = 220)` before it enters the search corpus. A keyword after a long excerpt prefix was not found.
- A word visibly present in an imported, digitally generated PDF (“Chlorophyll”) returned no results, despite the input placeholder advertising document text. The index extracts filename/title/metadata, not PDF body text.
- ArrowDown while focus remains in the query input does not navigate results; the handler explicitly excludes typing targets.
- Query handling calls `reindexNow` synchronously on each input event, despite a separate debounced background reindex API. At scale this adds avoidable typing work.

**Improve:** index full searchable fields independently from shortened display snippets; retain section/library entries; extract PDF text; expose scope choices; count only selectable results; map internal types to product labels; strip internal IDs from snippets. Support ArrowUp/Down and Enter directly from the search field. If notebook/PDF search is deferred, narrow the UI promise explicitly.

**Acceptance:** a query finds an unopened section item and PDF body text; a long excerpt remains fully searchable; one match reports one result; keyboard selection works from the input.

Sources: `src/features/search/search-index.js:48`, `:150`, `:250`; `src/features/search/search-panel.js`; `src/features/runtime/knowledge-runtime.js:446`. [Search evidence](ui-audit-2026-09-26/search.jpg).

### P1 — Ctrl+C collapses the selected widget

**Browser-confirmed.** Select a note and press Ctrl+C: persisted widget state changes to `collapsed: true`. The shared key handler tests `key === "c"` without rejecting Ctrl/Meta modifiers. This conflicts with a deeply established copy expectation and with the app's own “Copy” context-menu action.

**Improve:** reserve Ctrl/Cmd+C for copying; require unmodified C for collapse if that shortcut remains, and document it. Audit other global shortcuts for modifier and focus conflicts.

Source: `src/features/widget-system/widget-interaction-manager.js:936`.

## 2. Mechanics that make the app harder to learn

### P2 — Basic creation depends on discovering a hidden gesture

The persistent plus adds a **section**, not a widget. Widget creation is reached through right-click on blank canvas or a 420ms finger hold followed by radial selection/release. Pen pointer-down does not open this creation controller. Touch users cannot simply hold, release, then choose: release commits a selected option or closes the menu. On a dense canvas, finding blank space becomes another prerequisite.

The first-run hint offers PDF import, but there is no equally direct **New note** entry. Dismissing/finishing hints removes that obvious import entry point too. The gesture is useful as an expert shortcut but too hidden as the primary creation route.

**Improve:** add a persistent **Add** button with labeled Note / PDF / Snip / Diagram choices; retain the radial menu as optional. Let touch users tap to select after opening, with an obvious cancel region. Show **Write a note** and **Import PDF** in the empty state.

Source: `index.html`, `src/features/widget-system/widget-creation-controller.js`, `src/features/runtime/onboarding-runtime.js`.

### P2 — Radial menu is visually elaborate but semantically weak

The large translucent ring, dashed ring, central disc and shadows dominate the screen. Options have icons and ARIA labels, but no visible labels. Notes, PDF and snip icons are similar document-like shapes. The central disc overlaps portions of option circles in the captured view and has no useful content.

**Improve:** simplify to four clear labeled choices; remove the oversized decorative center or use it for an explicit Cancel label. Avoid teaching users icon geometry before they can add content.

[Radial evidence](ui-audit-2026-09-26/radial.jpg); `src/styles/app.css:1888` and creation controller.

### P2 — Library behaves like a transient palette, although it is a document manager

All types share a narrow mixed list, sorted by update time, with truncated single-line titles. There is no visible library search, type filter, sort selector, multi-select or explicit add button. “Recently used” duplicates a subset and consumes vertical room even when empty. Clicking a row previews; it does not add or open the item. Close exists in markup inside a hidden container. Long press/right-click reveals management actions.

The model also distinguishes a library source, a canvas instance, linked/frozen state, and cross-notebook imported copies. These are powerful distinctions with little persistent UI explanation. Renaming a linked item can update the library title, which is broader than a user may expect from a local rename.

**Improve:** a resizable library drawer with search, type filters, thumbnails/type markers, explicit **Open/Add**, visible Close, and an overflow menu per row. Make **Linked to library** and **Independent copy** visible in item details. Say whether an action affects the source or this instance. Keep recents optional.

Source: `src/features/references/reference-manager-ui.js`, `src/features/runtime/library-reference-runtime.js`, `src/main.js:2531`.

### P2 — Too many meanings for touching or dragging a widget

Users must learn the distinctions between selection, ink, node movement, internal diagram pan, world pan, docked-body pan, title movement, resize, pin, collapse, edge-hold docking, library drop and trash drop. Some depend on pointer type, hover, selection, timing or hidden state. Docked widgets refuse the normal widget context menu, so familiar management actions disappear after docking.

**Improve:** define one visible selection frame; reserve a title/handle for movement; keep content interaction inside the body. Expose **Dock left/right**, **Undock**, **Lock position** and **Collapse** as labeled actions, with gestures as shortcuts. Retain the same management menu in docked state. Rename “Pin” if its intended meaning is locking the widget: current pinning also hides controls and blocks collapse/resize, not just navigation placement.

Sources: `src/features/widget-system/widget-interaction-manager.js`, `src/features/widget-system/long-press-menu.js:99`, `src/features/runtime/viewport-dock-overlay-controller.js`.

### P2 — Onboarding assumes PDFs and misses the confusing interactions

The first action is “Start With A PDF”; handwritten blank notes get no direct starter action. The radial hint is gated on having a PDF. Four hint actions (primary action, dismiss, disable, reset) compete inside a permanent-looking floating card. Library drag/open behavior, safe deletion, docking and the current tool are more likely to need teaching than resetting the tutorial.

**Improve:** contextual empty-state choices, then one short hint near the action just attempted. Move reset/disable to help/settings. Teach equivalent mouse, finger and pen routes rather than only the finger hold gesture.

### P2 — Settings mixes task actions, developer controls and gesture configuration

The menu mixes Mode: Production, Ink Enabled, Ink Tool, Import Widgets, Share, gesture toggles/bindings and hints in one undifferentiated set of pills. Ink selection is duplicated in the header. “Import Widgets” means a multi-step cross-notebook/section selection, not importing a file. “Share” exports the current section as PDF, but does not say that until later.

**Improve:** separate document actions from preferences. Rename to **Copy from another notebook…** and **Export section as PDF…**. Keep production/debug mode in developer settings. Show the active tool once, clearly.

[Phone menu evidence](ui-audit-2026-09-26/phone-menu.png); `index.html`, `src/main.js:4274`.

## 3. Visual design and accessibility

### What to preserve

- Restrained teal/blue-gray palette, light surfaces and shared rounded widget treatment.
- Compact desktop header and large usable canvas area.
- Consistent creation-menu SVG stroke icons and a recognizable library affordance.
- Selection accents, focus-visible styling on DOM controls, native modal dialogs, and explicit input labels in many forms.

### P2 — Important controls are visually and physically too small

Measured header actions are approximately 33px high; notebook toggle itself is only 18px high, section tabs approximately 27px. Canvas widget controls use 24px, diagram toolbar buttons 22px, and some pin targets start at 22×16px. This asks for precision on a finger-first surface.

Use a roughly 44–48px touch hit area even where the visible icon stays small. Keep adequate separation around destructive actions. This is a proposed product target, not an assertion that the audit measured standards compliance.

### P2 — Content identity disappears with hover/selection

Shared widget titles appear mainly when selected/focused or hovered. Unselected notes become nearly anonymous rounded boxes; this undermines finding material in a dense workspace and makes touch users inspect items serially. Even the PDF title can sit above its frame and be clipped near the viewport/header edge, as in the restored-PDF screenshot.

Keep a small persistent title/type label; hide secondary controls instead. Clamp floating labels inside safe viewport bounds. Add a visible zoom/reset/fit control and a searchable section outline so minimap recognition is not the only navigation aid.

Source: `src/features/widget-system/widget-theme.js:44`; [restored PDF](ui-audit-2026-09-26/pdf-restored.jpg).

### P2 — Hierarchy is weak because nearly everything is a pill

Notebook selection, section tabs, actions, settings, hint actions and library entries look similar. Borders, small text and pale fills create a uniform level of emphasis. The workspace grid is large and prominent, while controls and instructional text are small. Unicode header glyphs render differently from the custom SVG/canvas icons.

Use distinct treatments for navigation, primary action, tool selection and content cards. Standardize icons; reduce grid contrast/density or provide paper/grid choices. Prefer flat surfaces with one consistent elevation scale over multiple strong shadows and translucent gradients. Keep decorative radial styling subordinate to labels.

### P3 — Theme implementation is only partly unified

CSS references `--theme-radius-card-md` and `--theme-text-subtle`, but neither is defined. CSS and `WIDGET_THEME` duplicate related palette/font values, and older selectors hardcode colors. The named primary font is not bundled by this app, so fallback appearance varies by platform.

Define missing tokens, share one palette/typography source where practical, and explicitly choose a bundled or system-font strategy. Do not add themes before the current one is consistent.

### P2 — Canvas accessibility is not established by a clean DOM scan

The automated initial-DOM scan reported one moderate issue: no visible level-one heading in production. More important manual/source concerns are outside that scan: widget contents, diagram nodes and canvas action buttons have no parallel semantic DOM representation, and selection is primarily pointer-driven. Some keyboard actions exist, but they are not equivalent to keyboard discovery and navigation of canvas objects. Search loses useful keyboard behavior while typing; library drag is not exposed as an ordinary button action.

Add an accessible object list and contextual DOM toolbar, keyboard selection/focus movement, clear action names, and announcements for creation/deletion/save failures. Preserve native modal behavior. Add reduced-motion styling for radial/library animations and safe-area padding for touch devices; those CSS accommodations were not found.

## 4. Feature implementation assessment

| Feature | Current evidence | Improvement needed |
| --- | --- | --- |
| Canvas / zoom / rendering | Working basic navigation; culling, LOD and raster infrastructure exist | Explicit fit/reset/zoom UI; profile dense PDFs/ink on real tablets; minimap does not replace a content list |
| Notes / ink | Note creation and persistence work; pen/eraser/lasso infrastructure exists | Notes are essentially ink surfaces: `metadata.note` is not rendered as editable body text in `ExpandedAreaWidget`. Add typing or name this clearly as an ink note |
| Notebooks / sections | Persistent stores; section tab keyboard handling exists | Narrow-screen navigation fix, clearer default naming (“Default Context” leaks an internal term), scalable section management |
| PDFs | Generated document imported, displayed, survived reload, and exported | Actual PDF body search, large-document progress/cancel, device/quota tests; do not equate one-page success with full reliability |
| Library / reference reuse | Save and preview work; linking and drag-spawn exist | Repair touch scrolling, explicit Add/Open, filtering, visible link semantics and safe delete/undo |
| Snips / citations | Snip and citation models/rendering/source controls exist | Audit complete capture flow on device; differentiate snippet copy, linked reference and original document |
| Research panel | Feature module exists | Current `index.html` has neither research panel nor its toggle; this is dormant UI infrastructure. Live product docs defer a full default browser workflow, so do not present it as a completed user-facing feature |
| Suggestions | Engine/store/UI and persisted ghost lifecycle exist | No full suggestion-generation/restore UX acceptance in this audit; verify discovery, duplicate suppression and anchor validity with real PDFs |
| Search | Title matches and result focus UI work | Several confirmed correctness/scope/content defects listed above; not reliable notebook-wide retrieval yet |
| Diagrams | Flowchart shapes, connections, internal pan/zoom and label editing exist | Destructive X fix, undo, labeled controls, discoverable double-tap rename; this is not a full circuit/logic/ML authoring tool |
| Docking / pinning | Dedicated controllers and visible feedback exist | Stable meanings, visible entry/exit actions, consistent context menu, gesture conflict testing |
| Sharing | Sample section PDF download succeeded | Raster JPEG-page export, no editable notebook backup; add preview, scope/orientation/scale/page-break controls and honest naming |
| Storage / migrations | References, budget handling, migrations and quota tests exist | Small persistent Saved / Saving / Not saved feedback; actionable recovery; full notebook backup/restore |
| PWA / offline | Service worker shell and runtime cache exist | Shell caching does not establish offline availability of every lazy module/PDF dependency. Test cold/warm offline feature use and communicate availability |

The old FINAL_DESIGN is broader than the current product. Graphing has been removed, and calculator/domain-specific STEM features are not delivered by the diagram widget. Treat these as scope decisions to record, not as reasons to pile more UI into the current release. Collaboration/accounts/cloud sync/OCR remain deferred.

### Export scaling deserves a separate design pass

`section-pdf-share-runtime.js` fits the entire horizontal workspace extent onto one A4 page width and slices vertically. A distant widget or stray content can shrink the whole export; splits are geometric rather than content-aware. The output consists of JPEG page images at a fixed 150 DPI. It is useful for visual sharing, but not a searchable/vector-preserving document or editable backup. Generation occurs before the filename dialog, with only “Preparing PDF…” feedback and no page preview/cancel control in that path.

Add export preview with selected-content/current-section choices, fit-width versus tiled pages, orientation/margins, page count, and cancellation. Validate collapsed widgets, offscreen PDF tiles, attached ink and widely separated content before claiming fidelity.

## 5. Recommended implementation order

| Order | Outcome | Concrete completion check |
| --- | --- | --- |
| 1 | Safe, usable basic editing | Widget deletion recoverable; Ctrl+C copies; diagram clear separate from delete; touch library scroll never creates content |
| 2 | Reliable tablet shell | Compact two-row narrow header; Add Section visible; search/menu fit short viewports; usable touch hit areas |
| 3 | Discoverable creation and library | Persistent Add, labeled choices, library Add/Open and filters, visible close and linked/copy distinction |
| 4 | Trustworthy retrieval | Full-text indexing, retained notebook scope, PDF extraction, correct counts/snippets and keyboard navigation |
| 5 | Coherent visual hierarchy | Persistent content labels, unified icons/tokens, subdued grid, simplified radial/menu styling |
| 6 | Delivery confidence | Automated responsive/input/search/deletion regression flows; real pen/tablet tests; large-PDF/offline/storage/export acceptance |

Avoid starting with a cosmetic redesign alone. Several visual complaints originate in missing information architecture and conflicting interaction rules; new colors will not resolve them.

## Evidence files

Screenshots are under `docs/reviews/ui-audit-2026-09-26/`, linked above. They use only synthetic audit content. Temporary browser scripts, metrics and sample/exported PDFs were kept under `/tmp/notes-ui-audit/`; they are not application dependencies or a committed regression suite.
