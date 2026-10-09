# UI implementation verification

## Commands

```sh
npm ci
npx playwright install chromium
npm test
npm run offline:build
npm run test:browser
node tests/performance/workloads.mjs
```

Chromium requires its platform runtime libraries. On a standard supported Linux setup, `npx playwright install --with-deps chromium` installs them using the platform package manager. In the current restricted environment, downloaded browser binaries and extracted libraries were isolated under `/tmp` and the browser command used:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/notes-app-browsers LD_LIBRARY_PATH=/tmp/notes-app-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:browser
```

Those temporary paths are environment-specific and are not application requirements. The browser runner serves the repository on 127.0.0.1:4174, uses fresh isolated browser contexts, and writes diagnostic screenshots/downloads to `/tmp/notes-app-check-*`. Keep port 4174 free.

## Verified in Chromium automation

- Native section history: widget creation, pen stroke, chronological undo/redo, reload, deletion notification, Recently Deleted restore.
- Independent library Add; source change hint; confirmed link replacement and Undo back to independent content.
- Notebook search results, PDF text search and library-result preview navigation.
- Portrait PDF preview/download; editable archive roundtrip, damaged archive rejection and interrupted settings restore rollback.
- Cold offline reload, PDF import/render/search/reload with original bytes retained, PDF export and editable backup.
- 390×844, 768×1024, 1024×600 and 1440×900 layouts; 100-item library touch swipe scroll without spawning.

## Outstanding acceptance matrix

- Galaxy Tab/S Pen: pressure/barrel actions, palm rejection, long writing session, drag/dock and accidental gesture resistance.
- iPad/Apple Pencil: equivalent workflows in Safari, install/offline/update lifecycle and memory pressure.
- Heavy notebooks: original PDF recovery across repeated section switches, large tiled export and cancellation, sustained frame times and cache pressure.
- Storage: browser quota exhaustion, closing mid-save, cross-tab editing/restoring, backup larger than available quota.
- Suggestions: real extractable-PDF proposals, offscreen dismissal tray and persisted recovery under long navigation sessions.

Desktop emulation and CPU fixtures do not establish these device/runtime outcomes. No hardware sign-off or complete optimization claim is made.
