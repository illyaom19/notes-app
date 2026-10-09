# UI Improvement Plan

## Status and authority

- Created: 2026-09-26, based on the UI audit of `main` at `6151df2`.
- Source: `docs/reviews/UI_EASE_OF_USE_AND_FEATURE_AUDIT_2026-09-26.md`.
- User request: plan changes and ask for direction for each change.
- Status: implementation authorized on 2026-09-26; in progress.
- D01–D13 and D16–D35 are accepted product directions; D14–D15 are deferred with an accepted future canvas-content direction, recorded below. All current-pass direction questions are resolved; the user subsequently authorized implementation.
- Accepted decision IDs below govern implementation; deferred architecture details belong to their future milestone.

## Implementation stages and dependencies

Implementation spans stages 1–4 in the working tree; acceptance gates are tracked in `docs/CURRENT_STATE.md`. Stage 5 hardware/performance sign-off remains open. Optimization begins with baselines and continues through each stage; release validation closes the work. Paths below identify existing integration areas, not a mandate to concentrate new code in those files.

| Stage | Scope / decisions | Main integration areas | Exit evidence |
| --- | --- | --- | --- |
| 0. Baselines and contracts | D29/D30; inventory mutation paths, persistence boundaries, offline dependencies and representative workloads | `src/main.js`, `src/features/runtime/`, `src/core/canvas/`, `tests/`, `sw.js` | Reproducible audit regressions and performance fixtures; documented transaction boundaries, target devices and measured budgets |
| 1. Durable editing and recovery | D01–D03, D17, D26, D31–D33; per-section history, persistence, bin, safe diagram actions and modifier fix | `src/features/ink/`, `src/features/diagram/`, `src/features/widget-system/`, `src/features/contexts/context-workspace-store.js`, `src/features/storage/`, `src/features/runtime/workspace-persistence-controller.js` | Mixed-action undo/redo survives reload; section isolation, asset retention, expiry, redo invalidation and injected save failures verified |
| 2. Tablet shell and interactions | D04–D08, D10, D18–D24; compact rows, shared drawer foundation, gesture/radial teaching, touch targets and grouped menu | `index.html`, `src/styles/`, `src/features/references/`, `src/features/runtime/`, `src/features/onboarding/`, `src/features/minimap/` | Viewport regressions fixed; 100-item library scroll cannot spawn; pen/touch/mouse and keyboard routes work; local typography and reduced motion checked |
| 3. Sources, retrieval and suggestions | D09, D11–D13, D16, D34/D35; revisions, link preview, full notebook index and recovery tray | `src/features/notebooks/`, `src/features/search/`, `src/features/suggestions/`, `src/features/runtime/library-reference-runtime.js`, `src/widgets/pdf/` | Independent-copy lifecycle and undoable linking verified; unopened sections/PDF text searchable; true counts, navigation and suggestion recovery checked |
| 4. Portable data and offline delivery | D25, D27/D28; export preview, complete backup/restore, dependency bundling and offline shell | `src/features/share/section-pdf-share-runtime.js`, `src/features/storage/`, `src/features/contexts/`, `src/widgets/pdf/pdfjs-loader.js`, `sw.js` | Export matches preview and cancels; archive round trips preserve native data/assets; corrupt restore is nondestructive; cold offline workflows pass |
| 5. Complete optimization and release validation | D29/D30 across all stages; resolve remaining profiled costs and integration failures | Canvas/ink rendering, PDF workers/caches, storage/history, indexing, module/loading boundaries | Before/after workload results, bounded memory, failure recovery and physical Galaxy Tab/S Pen plus iPad/Apple Pencil evidence; outstanding release blockers explicitly recorded |

Dependencies:
- Stage 0 precedes architectural changes. Stage 1 establishes history/schema/asset contracts before source replacement or backup serialization.
- Stage 2 establishes the shared drawer before stage 3 integrates search. Local PDF dependencies can be bundled early to support stage 3 text extraction offline.
- Stage 4 archives must include persisted history, Recently Deleted, source provenance and suppression settings introduced earlier, as well as live workspace content. Derived indexes/raster caches may be rebuilt.
- Stage 5 compares the same workload/device configurations to stage 0. Performance work must not trade away durability or change accepted gestures.

### Recovery and transaction design

- One ordered history per section covers ink, widget changes and diagram edits. One completed gesture or user action is one undo step; canceled gestures create none. A new edit after undo invalidates that section's redo branch.
- Persist serializable, versioned transactions with bounded recent history. Measure byte/action budgets in stage 0 and document actual limits before shipping; avoid serializing entire PDF bytes per action.
- Cross-section/library operations, where supported, have one owning history and an atomic transaction across affected records. Verify preconditions and surface conflicts instead of applying a partial undo. Routine section navigation does not become an undo step.
- Persist live state, history references and deletion records coherently. Protect assets referenced by live content, history or Recently Deleted; release bytes only when all references expire. Never report Saved before required writes succeed.
- Recently Deleted retains deleted content for 30 days and supports restore/manual empty. Expiry/empty removes bin retention; still-valid history may retain recovery data until its own bound expires. Explain this distinction in storage management. Run expiry during startup/maintenance so closed-app time counts.
- Linking previews the exact source revision to be installed, including local content affected. If that revision changes before confirmation, refresh the preview. Confirmed replacement is one undoable transaction restoring content, provenance and link state together. Keep canvas placement stable; no silent merging.

### Verification strategy

- Add meaningful store/transaction tests for mixed histories, migration/reload, retention/GC, section isolation, source revisions and fault injection; extend the existing `tests/storage/` and `tests/ui/` suites.
- Add browser integration coverage for the audit's reproduced failures and the approved end-to-end flows. Check 1440×900, 1024×768, 768×1024, 390×844 and short viewports; phone expectations remain basic browsing/navigation.
- Exercise offline reload in a fresh installed profile with the network disabled, then import local PDFs, search, edit, export and back up/restore. Verify no core workflow depends on a successful network request.
- Use physical Galaxy Tab/S Pen and iPad/Apple Pencil to assess writing, palm/touch interaction, scrolling, gesture cancellation, docking, rotation and long-session memory behavior. Record hardware, OS and browser versions; automation alone cannot satisfy this gate.
- Run `node --test tests/storage/*.test.mjs tests/ui/*.test.mjs`, applicable browser checks, JavaScript syntax checks and `git diff --check` after implementation. Record actual outcomes and remaining blockers in `docs/CURRENT_STATE.md`; no release-ready claim without evidence.

## Batch 1 — accepted directions

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D01 | Undo and deletion recovery | Unified Undo/Redo for ink, widgets and diagram edits; deletion also shows an Undo notification | Plan one chronological action history; retain deleted data/assets while recovery remains possible. D31/D32 specify per-section history persisted across restarts with bounded retention. |
| D02 | Diagram destructive actions | Delete selected only; separate Clear diagram in a menu with confirmation | Disable Delete without selection; clearing is a distinct confirmed, undoable operation. |
| D03 | Keyboard shortcuts | Fix modifier conflict now; leave Copy in context menu; defer clipboard support | Ctrl/Cmd+C must not collapse widgets. Do not add clipboard copy/paste in this scope. Preserve existing unmodified collapse behavior unless later changed. |
| D04 | Responsive navigation/tool layout | Two compact top rows: notebook/sections above, writing tools below; preserve canvas space | Narrow layouts keep Add Section reachable; panels must fit available viewport height. |
| D05 | Library touch interaction | Swipe to scroll, tap to preview, explicit Add to section; drag using a dedicated handle | Whole-row swipes must never spawn widgets; offer an ordinary button action as well as handle dragging. |

D31–D33 finalize recovery: per-section unified history, bounded persistence across restarts, and a 30-day Recently Deleted bin with manual empty. Transaction and asset-retention rules appear in the implementation stages above.

## Batch 2 — accepted directions

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D06 | Creation entry | 6C: keep gesture-based creation only, with better hints and labels | Do not add a persistent toolbar Add button or floating creation +. Preserve the section-add control as section navigation. Teach existing creation gestures. |
| D07 | Radial creation | 7A: simpler, labeled options; support drag-and-release and opening then tapping | Opening and releasing without selecting must leave a usable tap-selection menu. Provide a clear cancel/dismiss path. |
| D08 | Library presentation | 8A: resizable side drawer with search, type filters, visible Close and optional recents | Apply the already accepted D05 scroll/preview/Add/drag-handle behavior in this drawer. |
| D09 | Library copies and source updates | 9A with source-version awareness: independent by default, explicit linked option; notify visible stale independent copies of newer source versions | Independent edits do not synchronize automatically. Keep source identity and version provenance. Show a small adjacent hint when a stale independent widget next appears on screen, with Link, Dismiss and Never show again for this widget. |
| D10 | Widget move/pin/dock mechanics | 10B: preserve current gesture-first mechanics; clarify Pin versus Dock with labels and hints | Do not introduce the proposed move-handle/explicit-docking redesign or remove docking. Keep the dedicated library drag handle agreed in D05; that is distinct from canvas widget gestures. |

### D09 behavior contract

Accepted requirements:
- Independent copies remain independent until the user explicitly chooses to link. Source changes must not silently replace local content or ink.
- Independent instances retain enough provenance to recognize a newer version of their source without requiring duplicate asset bytes.
- When a stale independent copy is next on screen, present a small hint beside that widget explaining that a new source version exists and offering to link. Do not open a blocking dialog merely to announce availability.
- Actions: **Link**, **Dismiss**, and **Never show again for this widget**. The last preference is per widget, persists across reload, and does not disable hints for other copies.
- A missing/deleted source must not break the independent copy or advertise an unavailable linking action.

D34/D35 finalize this behavior: Dismiss suppresses the announced source revision across sessions; a newer revision may prompt again. Link previews replacement and requires confirmation, with the old local content recoverable through Undo.

## Batch 3 — search accepted; typing/research deferred

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D11 | Search scope | 11A: current notebook, including all sections and library items, with narrowing scope controls | Retain/index unopened sections and library records; all-notebook search is not added by this choice. |
| D12 | Search content | 12A: full typed/captured text, titles, tags, diagram labels and extractable PDF text; no handwriting OCR | Search existing text fully without implementing new typing tools; keep display snippets separate from index content and batch background updates. |
| D13 | Search presentation | 13A: side drawer sharing the library panel space; switch between Library and Search | Include accurate counts, readable snippets and keyboard navigation; avoid concurrent competing drawers. |
| D14 | Typing and Note architecture | Deferred. Future content is drawable/typeable anywhere on the canvas; optional conversion into a Note and back to raw elements | Do not implement typing or a Note-only text editor in this pass. Preserve an architectural path to reversible grouping of raw content. |
| D15 | Research | Deferred | Do not expose a new research panel or embedded browser in this pass. Existing capture data must remain readable. |

### Future canvas-content and Note model (direction accepted; implementation deferred)

User intent:
- Drawing and eventually typing are available anywhere on the canvas, without first creating a Note widget. Adding typing remains deferred.
- A user can select/“Snip” raw canvas content into a Note to gain grouping, movement, library reuse and other Note features.
- A Note can be reconverted into raw canvas elements. The result must retain editable content, not only a screenshot.

Planning implications, to refine before that milestone:
- Treat a Note as an optional container for native elements. Ink retains its stroke data; future text retains text/style data. Rendering snapshots are derived caches, not the canonical contents.
- Preserve element identity, local/world geometry, ordering and styles across capture, move, storage, library reuse and unpack operations.
- Capture and unpack should be atomic operations in the accepted unified Undo/Redo model. Asset references must survive both operations and history retention.
- Distinguish lossless **Snip into Note** from existing raster/PDF reference snipping; final naming/selection mechanics remain open.
- Search should be able to address raw text/contained text consistently once typing exists, without requiring users to package content into Notes. This does not expand current implementation scope to typing.
- D09 independent-copy provenance and source-version hints must remain meaningful for packaged Notes; source changes must not silently replace native contents.

Unresolved details for the deferred milestone:
- Whether capture moves selected elements into the Note or duplicates them; handling partially selected strokes.
- Whether unpack places elements at the Note's current transformed location or their original capture positions.
- Treatment of PDF-attached ink, other widgets, nested Notes, and source-version provenance after unpacking.
- Whether blank Notes remain creatable directly in addition to packaging existing elements.

Do not implement this architectural migration during the current decision-gathering stage or silently require it before the approved usability fixes.

## Batch 4 — suggestions, diagrams and visual direction accepted

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D16 | Suggestions | 16A: small nonblocking inline suggestions with Accept/Dismiss and a recovery tray | Suggestions must not interrupt writing; dismissal is recoverable and anchored state survives reload. |
| D17 | Diagram scope | 17A: harden basic flowcharts with clear controls, rename/connect/delete behavior and unified undo | No new diagram families or expanded multi-select/alignment/styling scope from this choice. Include accepted D02 safety semantics. |
| D18 | Aesthetic direction | 18A: retain teal, simplify surfaces/shadows, standardize icons and strengthen hierarchy | Refine the existing visual identity rather than switching to paper or grayscale styling. |
| D19 | Titles and navigation | 19B: keep titles contextual and navigation gesture-first; improve existing minimap and hints | Do not add persistent widget labels, a section outline or persistent Fit/Reset/zoom controls under this decision. Keep contextual titles readable/unclipped. |
| D20 | Touch targets | 20A: finger-friendly hit areas throughout with compact visible icons and consistent spacing | Use sufficiently large hit regions across pointer types without changing density automatically; avoid overlapping hit regions in dense layouts. |

## Batch 5 — onboarding, settings, accessibility, theme and export accepted

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D21 | Onboarding | 21A: short contextual hints for creation gestures, library use and docking; reset/disable in Help | Preserve gesture-only creation and contextual navigation. No mandatory walkthrough or persistent starter buttons. |
| D22 | Settings and actions | 22A: one grouped menu for document actions, writing/gestures, appearance and Help; developer controls tucked away | Use consistent Notebook/Note language and clear cross-notebook import/export scope. |
| D23 | Accessibility and motion | 23B: fix labels, focus, keyboard actions and reduced motion now; defer the widget navigator | Do not add a new object navigator or claim comprehensive canvas screen-reader parity in this pass. Respect existing gesture-first defaults. |
| D24 | Typography and theme | 24B: bundle one font for consistent typography; defer dark mode | Fix missing tokens, align CSS/canvas colors and standardize icons. Serve the font locally/offline; use a stable fallback until loaded. Exact font selection is an implementation detail subject to local asset/license verification. |
| D25 | PDF export | 25A: preview, selected-content/section scope, orientation, fit/tiled pages and cancellation; initially retain image-based output | Clearly name PDF export; do not claim searchable/vector-preserving output or editable backup. Verify preview matches layout and keep generation cancellable. |

## Batch 6 — reliability, offline operation and optimization accepted

| ID | Change | User-selected direction | Implementation implications |
| --- | --- | --- | --- |
| D26 | Save feedback | 26A: compact Saving/Saved indicator; success fades, failures remain actionable | Distinguish pending writes from durable saves; retain recoverable data on failure. |
| D27 | Editable backup/restore | 27C: full-workspace backup and restore | Include all notebooks, settings, native ink/widget data and original assets. Keep this distinct from PDF sharing. |
| D28 | Offline operation | 28A: essentially nothing in the current feature set should require internet | After initial installation/setup, local editing, PDFs, search, suggestions, export and backup must work offline. Bundle required dependencies, workers and fonts. |
| D29 | Device support | 29A: tablet/desktop editing, basic phone access; primarily Galaxy Tab/S Pen and iPad/Apple Pencil | Prioritize physical pen/tablet validation, alongside Android Chrome/Samsung Internet, iPad Safari and desktop browser checks. Record tested hardware/browser versions. |
| D30 | Optimization | Custom: full optimization | Profile and improve input, rendering, PDFs, storage/history, memory, startup, indexing and architecture; retain approved behavior and deferred scope. |

### Reliability and offline acceptance contract

- Version editable archives, validate structure and asset integrity before applying a restore, stage changes safely, and explain any replacement of existing workspace data before confirming it. Handle incompatible/corrupt archives without damaging the workspace. Bound memory use for large archives.
- All current core functionality must work without network after installation, including cold offline launches. External source links and installation/update delivery may use network; opening a citation is distinct from using local captured content.
- Remove runtime CDN dependencies for required fonts, PDF tooling/workers and other core features. Cache installation assets without eagerly executing heavy feature modules; preserve lazy initialization.
- Verify interrupted saves, quota failures, reload recovery, full backup/restore round trips and offline PDF import/render/search/export. These are planned requirements, not claims about the current app.

### Full optimization workstream

- Establish repeatable baselines for pen writing, pan/zoom, dense sections, long PDFs, large libraries, notebook search, backup/restore and cold/warm startup. Document workload sizes and physical devices before setting numerical budgets.
- Measure input latency, frame-time distributions, long tasks, memory growth/cache bounds, load time and persistence durability. Compare identical workloads before/after; desktop emulation does not establish stylus performance.
- Optimize rendering/culling/detail levels, raster caches, PDF worker scheduling, background indexing, UI invalidation, storage/history/asset retention and startup/offline loading boundaries where profiles identify costs.
- Review module responsibilities and orchestration across the app; use `docs/plans/MAIN_ORCHESTRATION_SEGMENTATION_PLAN.md` as one input rather than treating splitting `main.js` as the entire optimization task.
- Deliver bounded, reviewable stages with regression checks and recorded results. Full optimization does not imply unlimited rewriting or a guarantee of zero remaining bottlenecks. Typing, research and the future reversible Note migration remain deferred.

## Final behavior decisions — accepted

| ID | User-selected direction | Acceptance |
| --- | --- | --- |
| D31 | 31A: per-section unified undo | Ink/widgets/diagrams share one chronological history; switching sections selects that section's history. |
| D32 | 32A: bounded recent history survives restart | Reload restores valid undo/redo state and required asset references within documented limits. |
| D33 | 33A: 30-day Recently Deleted bin with manual empty | Restore, expiry and empty respect live/history asset references and survive reload. |
| D34 | 34A: dismiss current source revision | No repeat hint for that revision across sessions; a newer revision may prompt unless this widget is permanently suppressed. |
| D35 | 35A: preview and confirm source replacement, old content recoverable through Undo | Confirmation applies the previewed source revision atomically; undo restores the prior independent content and state. |

## Acceptance checks

These are implementation exit criteria; they are not current passing results. Deferred D14 checks apply only to that future milestone.

- D01–D03: widget deletion recovery and diagram edits behave consistently; Ctrl/Cmd+C never collapses content; undo order/scope is explained and tested.
- D04: controls remain reachable at 768×1024 and 390×844; search fits a short viewport; section add action is not clipped.
- D05/D08: browse 100 library items by touch without spawning any; adding an item is intentional and keyboard-accessible.
- D06/D07: first-run/contextual hints teach gesture-only creation; labeled radial options support both drag-and-release and open-then-tap, with an obvious cancel path. No persistent creation Add control is introduced.
- D09: independent copies retain their content when the source changes; a visible stale instance gets its adjacent version hint; linking is explicit; per-widget suppression survives reload and does not suppress other widgets.
- D10: existing gesture-first move/pin/dock behavior remains, with accurate labels and contextual teaching; library dragging still uses its dedicated handle from D05.
- D11–D13: notebook-wide retained index including unopened sections/library; full existing text and PDF text coverage; truthful counts/readable snippets and query-field keyboard navigation in the shared Library/Search drawer. No new typing UI or OCR.
- Deferred D14 architecture: native content survives conversion into a Note and back, including transformations and history; confirm detailed capture/unpack semantics before that milestone.
- D16/D17: inline suggestions remain nonblocking and recoverable; basic diagram changes use unified history, with safe selected-node deletion and separate confirmed Clear.
- D18–D20: retain teal and simplify hierarchy; contextual titles stay readable without becoming persistent; improve minimap/hints and provide large nonoverlapping touch hit areas around compact icons.
- D21/D22: contextual gesture/library/docking hints can be disabled/reset from Help; one grouped menu separates document actions, writing/gestures, appearance, Help and developer options.
- D23/D24: visible labels/focus and existing keyboard actions work; reduced-motion preference is honored; one locally bundled font and unified tokens render consistently. Widget navigator and dark mode remain deferred.
- D25: image-based PDF preview represents chosen selection/section, orientation and fit/tiled layout; generation is cancellable; wide layouts, collapsed widgets, attached ink and PDF rendering have explicit tested behavior. Searchable/vector output is not in this scope.
- D26–D28: save success fades and failures persist; full-workspace archive round trips preserve native data/assets/settings; core workflows pass cold-launch offline checks after installation.
- D29/D30: browser regressions cover the known failures, and physical-device tests measure actual writing/navigation performance separately from desktop emulation.

## Execution rules

- Implement the accepted decisions; deferred features remain excluded.
- Preserve existing audit evidence and documentation edits.
- Finalize each behavior before implementation; do not mistake a recommendation or an unanswered question for the user's choice.
- D30 selects comprehensive measured optimization, including architecture; deliver it in bounded stages while preserving the accepted behavior and deferred features.
- Carry forward modular loading, local-first data safety and low-latency writing requirements.
- Update `docs/CURRENT_STATE.md` after decisions, changes, verification and handoff.

## Decision log

- 2026-09-26: plan drafted; D01–D05 presented to user.
- 2026-09-26: user selected unified history with deletion notification, separate diagram Clear, modifier-conflict fix with clipboard deferred, two-row compact header, and scroll/preview/Add/drag-handle library behavior. D01–D05 recorded as accepted; history lifetime/scope remains open.
- 2026-09-26: D06–D10 presented. D06–D30 remain unresolved; no application code changes.

- 2026-09-26: user selected 6C, 7A, 8A, 9A with per-widget source-version hints, and 10B. D01–D10 accepted; remaining direction questions and D01/D09 follow-ups stay pending.
- 2026-09-26: D11–D15 presented in the conversation as numbered lettered choices, covering search scope/content/presentation, typed notes and research. Planning only.

- 2026-09-26: user selected 11A, 12A and 13A; D14 and D15 deferred. Recorded future raw-canvas content → Note packaging → raw-content workflow, with typing deferred and conversion preserving native editability.
- 2026-09-26: D16–D20 presented directly as numbered lettered choices. No application implementation.

- 2026-09-26: user selected 16A, 17A, 18A, 19B, 20A. Recorded inline/recoverable suggestions, basic flowchart hardening, simpler teal visual identity, contextual gesture-first navigation, and finger-friendly hit areas.
- 2026-09-26: D21–D25 presented directly as numbered lettered choices, aligned with accepted gesture-only creation and contextual navigation. No application implementation.

- 2026-09-26: user selected 21A, 22A, 23B, 24B and 25A. Accepted contextual hints, grouped menu, basic accessibility/reduced motion, locally bundled font, and PDF export controls retaining image-based output. Widget navigator and dark mode deferred.
- 2026-09-26: D26–D30 presented directly as numbered lettered choices. Planning only; no application changes.

- 2026-09-26: user selected 26A, 27C, 28A with essentially no internet requirement, 29A emphasizing Galaxy Tab/S Pen and iPad/Apple Pencil, and full optimization for D30. Recorded reliability/offline acceptance and profiling scope; D31–D35 presented to settle history/recovery/linking behavior. No application changes.

- 2026-09-26: user selected 31A, 32A, 33A, 34A and 35A. All current-pass product directions resolved. Consolidated six implementation stages, dependencies, transaction/retention rules and verification gates. Planning complete; no application changes.

- 2026-10-08: implemented core behavior across stages 1–4 in the working tree; 67 unit/storage tests and seven browser scripts pass. Stage 5 remains open for physical-device acceptance, broader load profiling and storage fault scenarios. See `docs/CURRENT_STATE.md` and `docs/reviews/UI_OPTIMIZATION_RESULTS_2026-10-08.md` for precise evidence/limits.
