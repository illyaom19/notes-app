import * as pdfjsLoader from "../../widgets/pdf/pdfjs-loader.js";

const LONG_PRESS_MS = 430;
const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 152;
const PREVIEW_MARGIN = 12;
const PREVIEW_HIDE_DELAY_MS = 760;
const DRAG_THRESHOLD_PX = 7;
const MAX_VISIBLE_CHIPS = 6;
const MAX_RECENT = 3;
const MAX_PDF_PREVIEW_CACHE = 12;
const LAUNCHER_SIZE = 48;
const FLOATING_INSET = 10;
const OVERLAY_GAP = 10;

function isWorkerBootstrapError(error) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("setting up fake worker failed") ||
    message.includes("pdf.worker") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

async function loadPdfDocumentCompat(bytes) {
  if (typeof pdfjsLoader.loadPdfDocumentFromBytes === "function") {
    return pdfjsLoader.loadPdfDocumentFromBytes(bytes);
  }
  const pdfjs = await pdfjsLoader.loadPdfJs();
  const open = async (disableWorker) => {
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      ...(disableWorker ? { disableWorker: true } : {}),
    });
    const pdfDocument = await loadingTask.promise;
    return { pdfDocument, loadingTask };
  };
  try {
    return await open(false);
  } catch (error) {
    if (!isWorkerBootstrapError(error)) {
      throw error;
    }
    return open(true);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timestamp(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return 0;
  }
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function strokeWidth(baseWidth, pressure) {
  const normalized = Math.max(0.05, Math.min(1, pressure || 0.5));
  return Math.max(0.6, baseWidth * (0.35 + normalized * 0.95));
}

function drawInkStrokes(canvas, strokes, { width, height } = {}) {
  if (!(canvas instanceof HTMLCanvasElement) || !Array.isArray(strokes) || strokes.length < 1) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const targetWidth = Math.max(1, Number(width) || canvas.width);
  const targetHeight = Math.max(1, Number(height) || canvas.height);

  for (const stroke of strokes) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) {
      continue;
    }

    const color = typeof stroke.color === "string" && stroke.color.trim() ? stroke.color : "#103f78";
    const baseWidth = Number.isFinite(stroke.baseWidth) ? stroke.baseWidth : 3;
    const anchorWidth = Math.max(1, Number(stroke.anchorBounds?.width) || targetWidth);
    const anchorHeight = Math.max(1, Number(stroke.anchorBounds?.height) || targetHeight);

    const mapped = stroke.points
      .map((point) => {
        if (stroke.anchorMode === "local") {
          const lx = Number(point?.lx);
          const ly = Number(point?.ly);
          if (!Number.isFinite(lx) || !Number.isFinite(ly)) {
            return null;
          }
          return {
            x: (lx / anchorWidth) * targetWidth,
            y: (ly / anchorHeight) * targetHeight,
            p: point?.p,
          };
        }

        if (Number.isFinite(point?.u) && Number.isFinite(point?.v)) {
          return {
            x: clamp(point.u, 0, 1) * targetWidth,
            y: clamp(point.v, 0, 1) * targetHeight,
            p: point?.p,
          };
        }

        return null;
      })
      .filter(Boolean);

    if (mapped.length < 1) {
      continue;
    }

    if (mapped.length === 1) {
      const dot = mapped[0];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, strokeWidth(baseWidth, dot.p) * 0.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let index = 1; index < mapped.length; index += 1) {
      const prev = mapped[index - 1];
      const current = mapped[index];
      ctx.lineWidth = strokeWidth(baseWidth, current.p);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
  }
}

function kindLabel(item) {
  if (item.kind === "document") {
    return "PDF";
  }
  if (item.kind === "note") {
    return "Notes";
  }
  if (item.contentType === "image") {
    return "Snip";
  }
  return "Reference";
}

function toShelfItems({ references = [], notes = [], documents = [] } = {}) {
  const merged = [];

  for (const entry of asArray(documents)) {
    merged.push({
      key: `document:${entry.id}`,
      id: entry.id,
      kind: "document",
      title: text(entry.title, "Document"),
      fileName: text(entry.fileName, "document.pdf"),
      updatedAt: timestamp(entry.updatedAt || entry.createdAt),
      lastUsedAt: timestamp(entry.lastUsedAt),
      contentType: "pdf",
      raw: entry,
    });
  }

  for (const entry of asArray(notes)) {
    merged.push({
      key: `note:${entry.id}`,
      id: entry.id,
      kind: "note",
      title: text(entry.title, "Notes"),
      updatedAt: timestamp(entry.updatedAt || entry.createdAt),
      lastUsedAt: timestamp(entry.lastUsedAt),
      contentType: "note",
      raw: entry,
    });
  }

  for (const entry of asArray(references)) {
    merged.push({
      key: `reference:${entry.id}`,
      id: entry.id,
      kind: "reference",
      title: text(entry.title, "Reference"),
      updatedAt: timestamp(entry.updatedAt || entry.createdAt),
      lastUsedAt: timestamp(entry.lastUsedAt),
      contentType: entry.contentType === "image" ? "image" : "text",
      raw: entry,
    });
  }

  merged.sort((a, b) => {
    const diff = b.updatedAt - a.updatedAt;
    if (Math.abs(diff) > 0) {
      return diff;
    }
    return a.key.localeCompare(b.key);
  });
  return merged;
}

function listRecent(items) {
  return items
    .filter((entry) => entry.lastUsedAt > 0)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_RECENT);
}

function setMenuOpen(row, open) {
  if (!(row instanceof HTMLElement)) {
    return;
  }
  row.dataset.menuOpen = open ? "true" : "false";
}

function setActiveRow(row, active) {
  if (!(row instanceof HTMLElement)) {
    return;
  }
  row.dataset.active = active ? "true" : "false";
}

function resolveRasterPreviewLevel(rasterDocument) {
  if (!rasterDocument || typeof rasterDocument !== "object" || !Array.isArray(rasterDocument.pages)) {
    return null;
  }
  const firstPage = rasterDocument.pages[0];
  if (!firstPage || !Array.isArray(firstPage.levels) || firstPage.levels.length < 1) {
    return null;
  }
  return firstPage.levels[firstPage.levels.length - 1] ?? null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load raster preview image."));
    image.src = src;
  });
}

export function createReferenceManagerUi({
  launcherButton,
  overlayElement,
  panelElement,
  canvasElement,
  referencesListElement,
  notesListElement,
  documentsListElement,
  onImportReference,
  onImportNote,
  onImportDocument,
  onRenameReference,
  onDeleteReference,
  onRenameNote,
  onDeleteNote,
  onRenameDocument,
  onDeleteDocument,
  onShowReferenceInfo,
  onShowNoteInfo,
  onShowDocumentInfo,
  onTouchReference,
  onTouchNote,
  onTouchDocument,
  onLoadDocumentBytes,
  onLoadDocumentRaster,
}) {
  if (!(launcherButton instanceof HTMLButtonElement)) {
    return {
      render: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
      isOpen: () => false,
      dispose: () => {},
    };
  }

  let open = false;
  let shelfItems = [];
  let rowMap = new Map();
  let activeRowKey = null;
  let menuRowKey = null;
  let previewKey = null;
  let previewHideTimer = null;
  let longPressState = null;
  let draggingState = null;
  let previewHovered = false;
  let listHovered = false;
  let previewAbortController = null;
  let feedbackTimer = null;
  let bodyTouchActionBeforeDrag = null;
  let htmlTouchActionBeforeDrag = null;
  const pdfPreviewCache = new Map();
  const pdfPreviewPending = new Map();
  let pdfPreviewQueue = Promise.resolve();

  const eventDisposers = [];
  const allListElement = referencesListElement instanceof HTMLElement ? referencesListElement : null;
  const recentListElement = notesListElement instanceof HTMLElement ? notesListElement : null;
  const shellElement = overlayElement instanceof HTMLElement ? overlayElement : panelElement instanceof HTMLElement ? panelElement : null;
  const panelRoot = panelElement instanceof HTMLElement ? panelElement : shellElement;

  const previewElement = document.createElement("aside");
  previewElement.className = "library-chip-preview";
  previewElement.hidden = true;
  previewElement.innerHTML = `
    <header class="library-chip-preview-header">
      <strong data-role="preview-title"></strong>
      <span data-role="preview-kind"></span>
    </header>
    <div class="library-chip-preview-body" data-role="preview-body"></div>
  `;

  const dragGhost = document.createElement("article");
  dragGhost.className = "library-widget-drag-ghost";
  dragGhost.hidden = true;
  dragGhost.innerHTML = `
    <header>Library Widget</header>
    <div class="library-widget-drag-ghost-body"></div>
  `;

  const dropFeedback = document.createElement("div");
  dropFeedback.className = "library-drop-feedback";
  dropFeedback.hidden = true;

  function bind(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    target.addEventListener(type, handler, options);
    eventDisposers.push(() => target.removeEventListener(type, handler, options));
  }

  function appendFloatingElements() {
    if (!(shellElement instanceof HTMLElement)) {
      return;
    }
    if (!previewElement.isConnected) {
      shellElement.append(previewElement);
    }
    if (!dragGhost.isConnected) {
      shellElement.append(dragGhost);
    }
    if (!dropFeedback.isConnected) {
      shellElement.append(dropFeedback);
    }
  }

  function hasPreviewOwner() {
    return Boolean(menuRowKey) || Boolean(previewHovered) || Boolean(listHovered) || Boolean(draggingState);
  }

  function resolveViewportRect() {
    if (canvasElement instanceof HTMLElement) {
      const rect = canvasElement.getBoundingClientRect();
      if (rect && rect.width > 1 && rect.height > 1) {
        return rect;
      }
    }

    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function pointInRect(clientX, clientY, rect) {
    if (!rect) {
      return false;
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function syncFloatingPlacement() {
    const viewportRect = resolveViewportRect();
    if (!viewportRect) {
      return;
    }

    const minLauncherLeft = viewportRect.left + FLOATING_INSET;
    const minLauncherTop = viewportRect.top + FLOATING_INSET;
    const maxLauncherLeft = Math.max(minLauncherLeft, viewportRect.right - FLOATING_INSET - LAUNCHER_SIZE);
    const maxLauncherTop = Math.max(minLauncherTop, viewportRect.bottom - FLOATING_INSET - LAUNCHER_SIZE);
    const launcherLeft = clamp(maxLauncherLeft, minLauncherLeft, maxLauncherLeft);
    const launcherTop = clamp(maxLauncherTop, minLauncherTop, maxLauncherTop);

    launcherButton.style.right = "auto";
    launcherButton.style.bottom = "auto";
    launcherButton.style.left = `${Math.round(launcherLeft)}px`;
    launcherButton.style.top = `${Math.round(launcherTop)}px`;

    if (!(shellElement instanceof HTMLElement)) {
      return;
    }

    const overlayWidth = Math.max(200, Math.min(276, viewportRect.width - FLOATING_INSET * 2));
    shellElement.style.right = "auto";
    shellElement.style.bottom = "auto";
    shellElement.style.width = `${Math.round(overlayWidth)}px`;

    const preferredLeft = launcherLeft + LAUNCHER_SIZE - overlayWidth;
    const minLeft = viewportRect.left + FLOATING_INSET;
    const maxLeft = Math.max(minLeft, viewportRect.right - FLOATING_INSET - overlayWidth);
    const overlayLeft = clamp(preferredLeft, minLeft, maxLeft);

    const panelHeightEstimate = panelRoot instanceof HTMLElement
      ? Math.max(180, panelRoot.getBoundingClientRect().height || panelRoot.scrollHeight || 0)
      : 320;
    const preferredTop = launcherTop - OVERLAY_GAP - panelHeightEstimate;
    const minTop = viewportRect.top + FLOATING_INSET;
    const maxTop = Math.max(minTop, viewportRect.bottom - FLOATING_INSET - panelHeightEstimate);
    const overlayTop = clamp(preferredTop, minTop, maxTop);

    shellElement.style.left = `${Math.round(overlayLeft)}px`;
    shellElement.style.top = `${Math.round(overlayTop)}px`;

    if (panelRoot instanceof HTMLElement) {
      panelRoot.style.maxHeight = `${Math.max(180, Math.floor(viewportRect.height - FLOATING_INSET * 2))}px`;
    }
  }

  function setOpen(nextOpen) {
    open = Boolean(nextOpen);
    launcherButton.dataset.open = open ? "true" : "false";
    launcherButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (shellElement) {
      shellElement.hidden = !open;
      shellElement.dataset.open = open ? "true" : "false";
      shellElement.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (!open) {
      hidePreviewNow();
      setMenuRowKey(null);
      setActiveRowKey(null);
    } else {
      syncFloatingPlacement();
      window.requestAnimationFrame(() => {
        syncFloatingPlacement();
      });
    }
  }

  function findItem(key) {
    if (!key) {
      return null;
    }
    return shelfItems.find((entry) => entry.key === key) ?? null;
  }

  function clearList(container) {
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.replaceChildren();
  }

  function makeChipRow(item) {
    const row = document.createElement("article");
    row.className = "library-chip-row";
    row.dataset.key = item.key;
    row.innerHTML = `
      <button type="button" class="library-chip" data-action="focus-chip">${item.title}</button>
      <div class="library-chip-menu" data-role="chip-menu">
        <button type="button" data-action="chip-info">Info</button>
        <button type="button" data-action="chip-rename">Rename</button>
        <button type="button" data-action="chip-delete">Delete</button>
      </div>
    `;
    return row;
  }

  function renderLists() {
    rowMap = new Map();
    listHovered = false;
    clearList(allListElement);
    clearList(recentListElement);
    clearList(documentsListElement);

    if (!(allListElement instanceof HTMLElement)) {
      return;
    }

    if (shelfItems.length < 1) {
      const empty = document.createElement("p");
      empty.className = "library-chip-empty";
      empty.textContent = "No library items yet.";
      allListElement.append(empty);
    } else {
      for (const item of shelfItems) {
        const row = makeChipRow(item);
        rowMap.set(item.key, row);
        allListElement.append(row);
      }
    }

    const recentItems = listRecent(shelfItems);
    if (recentListElement instanceof HTMLElement) {
      if (recentItems.length < 1) {
        const empty = document.createElement("p");
        empty.className = "library-chip-empty";
        empty.textContent = "No recent imports.";
        recentListElement.append(empty);
      } else {
        for (const item of recentItems) {
          const row = makeChipRow(item);
          rowMap.set(`recent:${item.key}`, row);
          recentListElement.append(row);
        }
      }
    }

    const chipHeight = 38;
    const chipGap = 6;
    const stackHeight = MAX_VISIBLE_CHIPS * chipHeight + (MAX_VISIBLE_CHIPS - 1) * chipGap;
    allListElement.style.maxHeight = `${stackHeight}px`;
    if (recentListElement instanceof HTMLElement) {
      recentListElement.style.maxHeight = `${Math.min(stackHeight, MAX_RECENT * chipHeight + 2 * chipGap)}px`;
    }

    setActiveRowKey(activeRowKey);
    setMenuRowKey(menuRowKey);
  }

  function setActiveRowKey(nextKey) {
    activeRowKey = nextKey;
    for (const [key, row] of rowMap.entries()) {
      setActiveRow(row, key === activeRowKey);
    }
  }

  function setMenuRowKey(nextKey) {
    menuRowKey = nextKey;
    for (const [key, row] of rowMap.entries()) {
      setMenuOpen(row, key === menuRowKey);
    }
  }

  function positionPreviewForRow(row) {
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const rect = row.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left - PREVIEW_WIDTH - PREVIEW_MARGIN;
    if (left < PREVIEW_MARGIN) {
      left = rect.right + PREVIEW_MARGIN;
    }
    left = clamp(left, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, viewportWidth - PREVIEW_WIDTH - PREVIEW_MARGIN));

    const top = clamp(
      rect.top - 6,
      PREVIEW_MARGIN,
      Math.max(PREVIEW_MARGIN, viewportHeight - PREVIEW_HEIGHT - PREVIEW_MARGIN),
    );

    previewElement.style.left = `${Math.round(left)}px`;
    previewElement.style.top = `${Math.round(top)}px`;
  }

  function clearPreviewBody() {
    const body = previewElement.querySelector('[data-role="preview-body"]');
    if (body instanceof HTMLElement) {
      body.replaceChildren();
    }
  }

  function hidePreviewNow() {
    if (previewHideTimer) {
      window.clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
    previewKey = null;
    previewHovered = false;
    listHovered = false;
    previewElement.hidden = true;
    clearPreviewBody();
    if (previewAbortController) {
      previewAbortController.abort();
      previewAbortController = null;
    }
  }

  function hidePreviewLater() {
    if (hasPreviewOwner()) {
      return;
    }
    if (previewHideTimer) {
      window.clearTimeout(previewHideTimer);
    }
    previewHideTimer = window.setTimeout(() => {
      previewHideTimer = null;
      if (!hasPreviewOwner()) {
        hidePreviewNow();
        setActiveRowKey(null);
      }
    }, PREVIEW_HIDE_DELAY_MS);
  }

  function cancelPendingHide() {
    if (previewHideTimer) {
      window.clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
  }

  function makeThumbCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    return canvas;
  }

  function cachePdfPreview(itemKey, version, canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || !itemKey) {
      return;
    }
    if (pdfPreviewCache.has(itemKey)) {
      pdfPreviewCache.delete(itemKey);
    }
    pdfPreviewCache.set(itemKey, {
      version,
      canvas,
      lastUsedAt: Date.now(),
    });
    while (pdfPreviewCache.size > MAX_PDF_PREVIEW_CACHE) {
      const oldestKey = pdfPreviewCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      pdfPreviewCache.delete(oldestKey);
    }
  }

  function getCachedPdfPreview(item) {
    if (!item?.key) {
      return null;
    }
    const cached = pdfPreviewCache.get(item.key);
    if (!cached) {
      return null;
    }
    if (cached.version !== item.updatedAt || !(cached.canvas instanceof HTMLCanvasElement)) {
      pdfPreviewCache.delete(item.key);
      return null;
    }
    cached.lastUsedAt = Date.now();
    return cached.canvas;
  }

  async function buildPdfPreviewCanvas(item) {
    if (typeof onLoadDocumentRaster === "function") {
      const raster = onLoadDocumentRaster(item.raw);
      const level = resolveRasterPreviewLevel(raster);
      if (typeof level?.dataUrl === "string" && level.dataUrl) {
        const image = await loadImage(level.dataUrl);
        const previewCanvas = makeThumbCanvas(196, 118);
        previewCanvas.width = Math.max(1, Number(level.width) || image.naturalWidth || 1);
        previewCanvas.height = Math.max(1, Number(level.height) || image.naturalHeight || 1);
        const ctx = previewCanvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          ctx.drawImage(image, 0, 0, previewCanvas.width, previewCanvas.height);
        }
        return previewCanvas;
      }
    }

    if (typeof onLoadDocumentBytes !== "function") {
      return null;
    }
    const bytes = onLoadDocumentBytes(item.raw);
    if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
      return null;
    }

    const { pdfDocument: doc } = await loadPdfDocumentCompat(bytes);
    const page = await doc.getPage(1);
    const previewCanvas = makeThumbCanvas(196, 118);
    const base = page.getViewport({ scale: 1 });
    const scale = previewCanvas.width / Math.max(1, base.width);
    const viewport = page.getViewport({ scale });
    previewCanvas.width = Math.max(1, Math.floor(viewport.width));
    previewCanvas.height = Math.max(1, Math.floor(Math.min(viewport.height, 220)));
    const ctx = previewCanvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return null;
    }
    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
      background: "white",
    }).promise;
    return previewCanvas;
  }

  function queuePdfPreviewBuild(item) {
    if (!item?.key) {
      return Promise.resolve(null);
    }

    const pending = pdfPreviewPending.get(item.key);
    if (pending && pending.version === item.updatedAt) {
      return pending.promise;
    }

    const buildPromise = (pdfPreviewQueue = pdfPreviewQueue
      .catch(() => null)
      .then(async () => {
        const nextCanvas = await buildPdfPreviewCanvas(item);
        if (nextCanvas) {
          cachePdfPreview(item.key, item.updatedAt, nextCanvas);
        }
        return nextCanvas;
      }));

    pdfPreviewPending.set(item.key, {
      version: item.updatedAt,
      promise: buildPromise,
    });

    return buildPromise.finally(() => {
      const latest = pdfPreviewPending.get(item.key);
      if (latest?.promise === buildPromise) {
        pdfPreviewPending.delete(item.key);
      }
    });
  }

  function renderNoteThumbnail(container, item) {
    const previewWrap = document.createElement("div");
    previewWrap.className = "library-thumbnail library-thumbnail--note";
    const width = 196;
    const height = 118;
    const page = makeThumbCanvas(width, height);
    const ctx = page.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    drawInkStrokes(page, item.raw?.inkStrokes ?? [], {
      width: item.raw?.size?.width ?? width,
      height: item.raw?.size?.height ?? height,
    });
    previewWrap.append(page);
    container.append(previewWrap);
  }

  function renderReferenceThumbnail(container, item) {
    const width = 196;
    const height = 118;
    const wrap = document.createElement("div");
    wrap.className = "library-thumbnail library-thumbnail--snip";

    const imageDataUrl =
      typeof item.raw?.imageDataUrl === "string" && item.raw.imageDataUrl.trim() ? item.raw.imageDataUrl : null;
    if (imageDataUrl) {
      const image = document.createElement("img");
      image.src = imageDataUrl;
      image.alt = "Reference preview";
      image.loading = "eager";
      wrap.append(image);
    } else {
      const textPreview = document.createElement("p");
      textPreview.className = "library-thumbnail-text";
      textPreview.textContent = text(item.raw?.textContent, "No snip image");
      wrap.append(textPreview);
    }

    const inkLayer = makeThumbCanvas(width, height);
    inkLayer.className = "library-thumbnail-ink";
    const rawSnipWidth = Number(item.raw?.popupMetadata?.snipDimensions?.widthPx ?? item.raw?.snipDimensions?.widthPx);
    const rawSnipHeight = Number(item.raw?.popupMetadata?.snipDimensions?.heightPx ?? item.raw?.snipDimensions?.heightPx);
    drawInkStrokes(inkLayer, item.raw?.inkStrokes ?? [], {
      width: Number.isFinite(rawSnipWidth) && rawSnipWidth > 0 ? rawSnipWidth : width,
      height: Number.isFinite(rawSnipHeight) && rawSnipHeight > 0 ? rawSnipHeight : height,
    });
    wrap.append(inkLayer);
    container.append(wrap);
  }

  async function renderPdfThumbnail(container, item, signal) {
    const wrap = document.createElement("div");
    wrap.className = "library-thumbnail library-thumbnail--pdf";

    if (typeof onLoadDocumentBytes !== "function") {
      wrap.textContent = "PDF preview unavailable";
      container.append(wrap);
      return;
    }

    const pageCanvas = makeThumbCanvas(196, 118);
    wrap.append(pageCanvas);
    container.append(wrap);

    try {
      if (signal.aborted) {
        return;
      }
      let sourceCanvas = getCachedPdfPreview(item);
      if (!(sourceCanvas instanceof HTMLCanvasElement)) {
        sourceCanvas = await queuePdfPreviewBuild(item);
      }
      if (signal.aborted) {
        return;
      }
      if (!(sourceCanvas instanceof HTMLCanvasElement)) {
        wrap.textContent = `Missing PDF. Reupload "${item.title}".`;
        return;
      }
      pageCanvas.width = Math.max(1, sourceCanvas.width);
      pageCanvas.height = Math.max(1, sourceCanvas.height);
      const ctx = pageCanvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(sourceCanvas, 0, 0, pageCanvas.width, pageCanvas.height);
      }
    } catch (_error) {
      wrap.textContent = `Unable to render "${item.title}"`;
    }
  }

  async function renderPreviewForItem(item) {
    const titleElement = previewElement.querySelector('[data-role="preview-title"]');
    const kindElement = previewElement.querySelector('[data-role="preview-kind"]');
    const body = previewElement.querySelector('[data-role="preview-body"]');
    if (!(titleElement instanceof HTMLElement) || !(kindElement instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      return;
    }

    titleElement.textContent = item.title;
    kindElement.textContent = kindLabel(item);
    body.replaceChildren();

    if (previewAbortController) {
      previewAbortController.abort();
    }
    previewAbortController = new AbortController();
    const signal = previewAbortController.signal;

    if (item.kind === "note") {
      renderNoteThumbnail(body, item);
      return;
    }
    if (item.kind === "reference") {
      renderReferenceThumbnail(body, item);
      return;
    }
    await renderPdfThumbnail(body, item, signal);
  }

  async function showPreviewForKey(itemKey, row) {
    cancelPendingHide();
    const item = findItem(itemKey);
    if (!item || !(row instanceof HTMLElement)) {
      return;
    }
    setActiveRowKey(row.dataset.key ?? null);
    previewKey = itemKey;
    positionPreviewForRow(row);
    previewElement.hidden = false;
    await renderPreviewForItem(item);
  }

  async function runChipAction(item, action) {
    if (!item || typeof action !== "string") {
      return;
    }

    if (action === "chip-info") {
      if (item.kind === "document") {
        await onShowDocumentInfo?.(item.raw);
      } else if (item.kind === "note") {
        await onShowNoteInfo?.(item.raw);
      } else {
        await onShowReferenceInfo?.(item.raw);
      }
      return;
    }

    if (action === "chip-rename") {
      if (item.kind === "document") {
        await onRenameDocument?.(item.raw);
      } else if (item.kind === "note") {
        await onRenameNote?.(item.raw);
      } else {
        await onRenameReference?.(item.raw);
      }
      return;
    }

    if (action === "chip-delete") {
      if (item.kind === "document") {
        await onDeleteDocument?.(item.raw);
      } else if (item.kind === "note") {
        await onDeleteNote?.(item.raw);
      } else {
        await onDeleteReference?.(item.raw);
      }
    }
  }

  async function importAtPointer(item, clientX, clientY) {
    if (!item) {
      return false;
    }

    const viewportRect = resolveViewportRect();
    if (!pointInRect(clientX, clientY, viewportRect)) {
      triggerDropFeedback({ kind: "deny", message: "Drop on canvas to add" });
      return false;
    }

    const screenPoint = { x: clientX, y: clientY };
    const canvasPoint = {
      x: clientX - viewportRect.left,
      y: clientY - viewportRect.top,
    };
    const dropMeta = {
      screenPoint,
      canvasPoint,
      droppedInsideCanvas: true,
    };
    if (item.kind === "document") {
      const imported = await onImportDocument?.(item.raw, {
        screenPoint,
        canvasPoint,
        dropMeta,
        linkStatus: "linked",
      });
      if (!imported) {
        triggerDropFeedback({ kind: "deny", message: "Could not add to canvas" });
        return false;
      }
      await onTouchDocument?.(item.raw);
      return true;
    }
    if (item.kind === "note") {
      const imported = await onImportNote?.(item.raw, { screenPoint, canvasPoint, dropMeta });
      if (!imported) {
        triggerDropFeedback({ kind: "deny", message: "Could not add to canvas" });
        return false;
      }
      await onTouchNote?.(item.raw);
      return true;
    }
    const imported = await onImportReference?.(item.raw, {
      screenPoint,
      canvasPoint,
      dropMeta,
      linkStatus: "linked",
    });
    if (!imported) {
      triggerDropFeedback({ kind: "deny", message: "Could not add to canvas" });
      return false;
    }
    await onTouchReference?.(item.raw);
    return true;
  }

  function setDragTouchGuard(enabled) {
    const root = document.documentElement;
    const body = document.body;
    if (!(root instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      return;
    }
    if (enabled) {
      if (htmlTouchActionBeforeDrag === null) {
        htmlTouchActionBeforeDrag = root.style.touchAction ?? "";
      }
      if (bodyTouchActionBeforeDrag === null) {
        bodyTouchActionBeforeDrag = body.style.touchAction ?? "";
      }
      root.style.touchAction = "none";
      body.style.touchAction = "none";
      return;
    }
    if (htmlTouchActionBeforeDrag !== null) {
      root.style.touchAction = htmlTouchActionBeforeDrag;
      htmlTouchActionBeforeDrag = null;
    }
    if (bodyTouchActionBeforeDrag !== null) {
      body.style.touchAction = bodyTouchActionBeforeDrag;
      bodyTouchActionBeforeDrag = null;
    }
  }

  function beginDrag(item, event, captureTarget = previewElement) {
    if (draggingState && draggingState.pointerId !== event.pointerId) {
      stopDrag();
    }
    cancelPendingHide();
    draggingState = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      captureTarget: captureTarget instanceof HTMLElement ? captureTarget : previewElement,
    };
    try {
      draggingState.captureTarget?.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Ignore unsupported pointer capture paths.
    }
    setDragTouchGuard(true);
  }

  function updateDragGhostPosition(clientX, clientY) {
    const left = clamp(clientX + 14, 8, Math.max(8, window.innerWidth - 170));
    const top = clamp(clientY + 14, 8, Math.max(8, window.innerHeight - 90));
    dragGhost.style.left = `${Math.round(left)}px`;
    dragGhost.style.top = `${Math.round(top)}px`;
  }

  function stopDrag(pointerId = null) {
    if (!draggingState) {
      return;
    }
    if (pointerId !== null && draggingState.pointerId !== pointerId) {
      return;
    }
    try {
      draggingState.captureTarget?.releasePointerCapture?.(draggingState.pointerId);
    } catch (_error) {
      // Ignore unsupported pointer capture paths.
    }
    draggingState = null;
    setDragTouchGuard(false);
    dragGhost.hidden = true;
    if (!previewHovered && !menuRowKey) {
      hidePreviewLater();
    }
  }

  function onPreviewPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const item = findItem(previewKey);
    if (!item) {
      return;
    }
    cancelPendingHide();
    beginDrag(item, event, previewElement);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPreviewPointerMove(event) {
    if (!draggingState || draggingState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - draggingState.startX;
    const dy = event.clientY - draggingState.startY;
    const distance = Math.hypot(dx, dy);
    if (!draggingState.active && distance >= DRAG_THRESHOLD_PX) {
      draggingState.active = true;
      dragGhost.hidden = false;
      const header = dragGhost.querySelector("header");
      if (header instanceof HTMLElement) {
        header.textContent = draggingState.item.title;
      }
    }
    if (!draggingState.active) {
      return;
    }
    updateDragGhostPosition(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPreviewPointerUp(event) {
    if (!draggingState || draggingState.pointerId !== event.pointerId) {
      return;
    }
    const committed = draggingState.active;
    const item = draggingState.item;
    stopDrag(event.pointerId);
    if (committed) {
      void importAtPointer(item, event.clientX, event.clientY).then((imported) => {
        if (!imported) {
          return;
        }
        if (typeof nowIso === "function") {
          item.lastUsedAt = timestamp(nowIso());
        }
        hidePreviewNow();
        setActiveRowKey(null);
        setMenuRowKey(null);
      }).catch((error) => {
        console.error("Library drag import failed:", error);
        triggerDropFeedback({ kind: "deny", message: "Could not add to canvas" });
      });
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onPreviewPointerCancel(event) {
    if (!draggingState || draggingState.pointerId !== event.pointerId) {
      return;
    }
    stopDrag(event.pointerId);
    clearLongPress();
    event.preventDefault();
    event.stopPropagation();
  }

  function clearLongPress() {
    if (!longPressState) {
      return;
    }
    if (longPressState.timer) {
      window.clearTimeout(longPressState.timer);
    }
    longPressState = null;
  }

  function onListPointerDown(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const chip = target.closest("button[data-action='focus-chip']");
    if (!(chip instanceof HTMLButtonElement)) {
      return;
    }
    const row = chip.closest(".library-chip-row");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const rowKey = row.dataset.key;
    if (!rowKey) {
      return;
    }
    const itemKey = rowKey.startsWith("recent:") ? rowKey.slice("recent:".length) : rowKey;

    clearLongPress();
    longPressState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      itemKey,
      row,
      opened: false,
      timer: window.setTimeout(() => {
        if (!longPressState || longPressState.itemKey !== itemKey) {
          return;
        }
        longPressState.opened = true;
        setMenuRowKey(row.dataset.key ?? null);
        void showPreviewForKey(itemKey, row);
      }, LONG_PRESS_MS),
    };
    const item = findItem(itemKey);
    if (item) {
      beginDrag(item, event, row);
    }
  }

  function onListPointerMove(event) {
    onPreviewPointerMove(event);
    if (draggingState && draggingState.pointerId === event.pointerId && draggingState.active) {
      clearLongPress();
      return;
    }
    if (!longPressState || longPressState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - longPressState.startX;
    const dy = event.clientY - longPressState.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX && !longPressState.opened) {
      clearLongPress();
    }
  }

  function onListPointerUp(event) {
    if (draggingState && draggingState.pointerId === event.pointerId) {
      if (draggingState.active) {
        onPreviewPointerUp(event);
        clearLongPress();
        return;
      }
      stopDrag(event.pointerId);
    }
    if (!longPressState || longPressState.pointerId !== event.pointerId) {
      return;
    }
    const opened = longPressState.opened;
    clearLongPress();
    if (opened) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onListPointerCancel(event) {
    if (draggingState && draggingState.pointerId === event.pointerId) {
      stopDrag(event.pointerId);
    }
    if (longPressState && longPressState.pointerId === event.pointerId) {
      clearLongPress();
    }
  }

  function onListPointerEnter(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest(".library-chip-row");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const rowKey = row.dataset.key;
    if (!rowKey) {
      return;
    }
    listHovered = true;
    const itemKey = rowKey.startsWith("recent:") ? rowKey.slice("recent:".length) : rowKey;
    void showPreviewForKey(itemKey, row);
  }

function onListPointerLeave(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const row = target.closest(".library-chip-row");
  if (!(row instanceof HTMLElement)) {
    return;
  }
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && row.contains(nextTarget)) {
    return;
  }
  listHovered = false;
  if (nextTarget instanceof Node && previewElement.contains(nextTarget)) {
    return;
  }
  hidePreviewLater();
}

  function updateDropFeedbackPosition() {
    if (!(launcherButton instanceof HTMLElement)) {
      return;
    }
    const rect = launcherButton.getBoundingClientRect();
    dropFeedback.style.left = `${Math.round(rect.left - 8)}px`;
    dropFeedback.style.top = `${Math.round(rect.top - 34)}px`;
  }

  function syncFloatingArtifacts() {
    syncFloatingPlacement();
    if (previewKey) {
      const row = rowMap.get(previewKey) ?? rowMap.get(`recent:${previewKey}`);
      if (row instanceof HTMLElement) {
        positionPreviewForRow(row);
      }
    }
    updateDropFeedbackPosition();
  }

  function applyDropTargetState({ active = false, over = false } = {}) {
    launcherButton.dataset.dropActive = active ? "true" : "false";
    launcherButton.dataset.dropOver = active && over ? "true" : "false";
    if (!active) {
      launcherButton.dataset.dropOver = "false";
    }
  }

  function triggerDropFeedback({ kind = "deny", message = "" } = {}) {
    if (!(launcherButton instanceof HTMLElement)) {
      return;
    }
    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }

    launcherButton.dataset.dropFeedback = kind === "success" ? "success" : "deny";
    dropFeedback.dataset.kind = kind === "success" ? "success" : "deny";
    dropFeedback.textContent = text(message, kind === "success" ? "Added to Library" : "Already in Library");
    updateDropFeedbackPosition();
    dropFeedback.hidden = false;

    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      dropFeedback.hidden = true;
      launcherButton.dataset.dropFeedback = "none";
    }, 980);
  }

  function onListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest("button[data-action]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }
    const action = actionButton.dataset.action;

    const row = actionButton.closest(".library-chip-row");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const rowKey = row.dataset.key;
    if (!rowKey) {
      return;
    }
    const itemKey = rowKey.startsWith("recent:") ? rowKey.slice("recent:".length) : rowKey;
    const item = findItem(itemKey);
    if (!item) {
      return;
    }

    if (action === "focus-chip") {
      void showPreviewForKey(itemKey, row);
      setMenuRowKey(null);
      return;
    }

    if (action === "chip-info" || action === "chip-rename" || action === "chip-delete") {
      void runChipAction(item, action).then(() => {
        setMenuRowKey(null);
      });
    }
  }

  function onListContextMenu(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest(".library-chip-row");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const rowKey = row.dataset.key;
    if (!rowKey) {
      return;
    }
    const itemKey = rowKey.startsWith("recent:") ? rowKey.slice("recent:".length) : rowKey;
    setMenuRowKey(rowKey);
    void showPreviewForKey(itemKey, row);
    event.preventDefault();
  }

  function onWindowPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (previewElement.contains(target)) {
      return;
    }
    if (panelRoot instanceof HTMLElement && panelRoot.contains(target)) {
      return;
    }
    setMenuRowKey(null);
    hidePreviewNow();
    setActiveRowKey(null);
  }

  function onWindowKeyDown(event) {
    if (event.key === "Escape") {
      setMenuRowKey(null);
      hidePreviewNow();
      setActiveRowKey(null);
      if (open) {
        setOpen(false);
      }
    }
  }

  function wireEvents() {
    appendFloatingElements();

    bind(launcherButton, "click", () => {
      setOpen(!open);
    });

    bind(previewElement, "pointerenter", () => {
      previewHovered = true;
      cancelPendingHide();
    });
    bind(previewElement, "pointerleave", () => {
      previewHovered = false;
      hidePreviewLater();
    });
    bind(previewElement, "pointerdown", onPreviewPointerDown);
    bind(previewElement, "pointermove", onPreviewPointerMove);
    bind(previewElement, "pointerup", onPreviewPointerUp);
    bind(previewElement, "pointercancel", onPreviewPointerCancel);
    bind(window, "pointermove", onPreviewPointerMove, true);
    bind(window, "pointerup", onPreviewPointerUp, true);
    bind(window, "pointercancel", onPreviewPointerCancel, true);

    bind(allListElement, "pointerdown", onListPointerDown);
    bind(allListElement, "pointermove", onListPointerMove);
    bind(allListElement, "pointerup", onListPointerUp);
    bind(allListElement, "pointercancel", onListPointerCancel);
    bind(allListElement, "pointerover", onListPointerEnter);
    bind(allListElement, "pointerout", onListPointerLeave);
    bind(allListElement, "click", onListClick);
    bind(allListElement, "contextmenu", onListContextMenu);

    bind(recentListElement, "pointerdown", onListPointerDown);
    bind(recentListElement, "pointermove", onListPointerMove);
    bind(recentListElement, "pointerup", onListPointerUp);
    bind(recentListElement, "pointercancel", onListPointerCancel);
    bind(recentListElement, "pointerover", onListPointerEnter);
    bind(recentListElement, "pointerout", onListPointerLeave);
    bind(recentListElement, "click", onListClick);
    bind(recentListElement, "contextmenu", onListContextMenu);

    bind(window, "pointerdown", onWindowPointerDown, true);
    bind(window, "keydown", onWindowKeyDown);
    bind(
      window,
      "resize",
      () => {
        syncFloatingArtifacts();
      },
      { passive: true },
    );
    bind(
      window,
      "scroll",
      () => {
        syncFloatingArtifacts();
      },
      { passive: true, capture: true },
    );
  }

  wireEvents();
  applyDropTargetState({ active: false, over: false });
  launcherButton.dataset.dropFeedback = "none";
  syncFloatingPlacement();
  setOpen(false);

  return {
    render({ references = [], notes = [], documents = [] } = {}) {
      shelfItems = toShelfItems({ references, notes, documents });
      renderLists();
    },

    open() {
      setOpen(true);
    },

    close() {
      setOpen(false);
    },

    toggle() {
      setOpen(!open);
    },

    setDropTargetState({ active = false, over = false } = {}) {
      applyDropTargetState({ active, over });
    },

    showDropFeedback({ kind = "deny", message = "" } = {}) {
      triggerDropFeedback({ kind, message });
    },

    syncPlacement() {
      syncFloatingArtifacts();
    },

    isOpen() {
      return open;
    },

    dispose() {
      clearLongPress();
      hidePreviewNow();
      stopDrag();
      applyDropTargetState({ active: false, over: false });
      if (feedbackTimer) {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      pdfPreviewCache.clear();
      pdfPreviewPending.clear();
      for (const disposeEvent of eventDisposers.splice(0, eventDisposers.length)) {
        disposeEvent();
      }
      previewElement.remove();
      dragGhost.remove();
      dropFeedback.remove();
    },
  };
}
