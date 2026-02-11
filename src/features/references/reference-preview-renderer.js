import * as pdfjsLoader from "../../widgets/pdf/pdfjs-loader.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

function strokeWidth(baseWidth, pressure) {
  const normalized = Math.max(0.05, Math.min(1, pressure || 0.5));
  return Math.max(0.6, baseWidth * (0.35 + normalized * 0.95));
}

function clearElement(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.replaceChildren();
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
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

function messageCard(text) {
  const message = document.createElement("p");
  message.className = "reference-preview-message";
  message.textContent = text;
  return message;
}

function clampPan(scale, tx, ty, viewportWidth, viewportHeight, contentWidth, contentHeight) {
  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;

  const minTx = scaledWidth <= viewportWidth ? (viewportWidth - scaledWidth) * 0.5 : viewportWidth - scaledWidth;
  const maxTx = scaledWidth <= viewportWidth ? minTx : 0;
  const minTy = scaledHeight <= viewportHeight ? (viewportHeight - scaledHeight) * 0.5 : viewportHeight - scaledHeight;
  const maxTy = scaledHeight <= viewportHeight ? minTy : 0;

  return {
    tx: clamp(tx, minTx, maxTx),
    ty: clamp(ty, minTy, maxTy),
  };
}

function attachPanZoomInteraction(viewport, stage, {
  contentWidth,
  contentHeight,
  minScale = 0.6,
  maxScale = 4,
  initialScale = 1,
} = {}) {
  if (!(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
    return;
  }

  let scale = clamp(initialScale, minScale, maxScale);
  let tx = 0;
  let ty = 0;
  let drag = null;
  const pointers = new Map();
  let pinchState = null;
  const abortController = new AbortController();

  const apply = () => {
    const viewportRect = viewport.getBoundingClientRect();
    const clamped = clampPan(
      scale,
      tx,
      ty,
      Math.max(1, viewportRect.width),
      Math.max(1, viewportRect.height),
      Math.max(1, contentWidth),
      Math.max(1, contentHeight),
    );
    tx = clamped.tx;
    ty = clamped.ty;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const zoomTo = (targetScale, pivotClientX, pivotClientY) => {
    const nextScale = clamp(targetScale, minScale, maxScale);
    if (Math.abs(nextScale - scale) < 0.0001) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pivotX = pivotClientX - rect.left;
    const pivotY = pivotClientY - rect.top;
    const worldX = (pivotX - tx) / Math.max(0.0001, scale);
    const worldY = (pivotY - ty) / Math.max(0.0001, scale);

    scale = nextScale;
    tx = pivotX - worldX * scale;
    ty = pivotY - worldY * scale;
    apply();
  };

  viewport.dataset.panzoom = "true";
  apply();

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      pinchState = {
        distance: Math.max(1, distance),
        scale,
      };
      drag = null;
    } else {
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTx: tx,
        startTy: ty,
      };
    }
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const centerX = (a.x + b.x) * 0.5;
      const centerY = (a.y + b.y) * 0.5;
      if (!pinchState) {
        pinchState = { distance: Math.max(1, distance), scale };
      }
      const ratio = Math.max(0.01, distance) / Math.max(1, pinchState.distance);
      zoomTo(pinchState.scale * ratio, centerX, centerY);
      return;
    }

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    tx = drag.startTx + (event.clientX - drag.startX);
    ty = drag.startTy + (event.clientY - drag.startY);
    apply();
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    pointers.delete(event.pointerId);
    if (drag?.pointerId === event.pointerId) {
      drag = null;
    }
    if (pointers.size < 2) {
      pinchState = null;
    }
    viewport.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = (event) => {
    if (event.ctrlKey || event.metaKey) {
      const nextScale = scale * Math.exp(-event.deltaY * 0.0015);
      zoomTo(nextScale, event.clientX, event.clientY);
      event.preventDefault();
      return;
    }

    ty -= event.deltaY * 0.9;
    tx -= event.deltaX * 0.9;
    apply();
    event.preventDefault();
  };

  viewport.addEventListener("pointerdown", onPointerDown, { signal: abortController.signal });
  viewport.addEventListener("pointermove", onPointerMove, { signal: abortController.signal });
  viewport.addEventListener("pointerup", onPointerUp, { signal: abortController.signal });
  viewport.addEventListener("pointercancel", onPointerUp, { signal: abortController.signal });
  viewport.addEventListener("wheel", onWheel, { passive: false, signal: abortController.signal });
  window.addEventListener("resize", apply, { passive: true, signal: abortController.signal });

  const observer = new MutationObserver(() => {
    if (viewport.isConnected) {
      return;
    }
    abortController.abort();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function renderNotePreview(container, entry) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "reference-preview-viewport";
  const stage = document.createElement("div");
  stage.className = "reference-preview-panzoom-stage";
  const width = 320;
  const height = 180;
  const paper = makeCanvas(width, height);
  paper.className = "reference-preview-canvas";
  const paperCtx = paper.getContext("2d");
  if (paperCtx) {
    paperCtx.fillStyle = "#ffffff";
    paperCtx.fillRect(0, 0, width, height);
  }
  drawInkStrokes(paper, entry?.inkStrokes ?? [], {
    width: entry?.size?.width ?? width,
    height: entry?.size?.height ?? height,
  });
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.append(paper);
  viewport.append(stage);
  container.append(viewport);
  attachPanZoomInteraction(viewport, stage, {
    contentWidth: width,
    contentHeight: height,
    minScale: 0.7,
    maxScale: 4,
    initialScale: 1,
  });
}

export function renderReferencePreview(container, entry) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "reference-preview-viewport";
  const stage = document.createElement("div");
  stage.className = "reference-preview-panzoom-stage";
  const rawSnipWidth = Number(entry?.popupMetadata?.snipDimensions?.widthPx ?? entry?.snipDimensions?.widthPx);
  const rawSnipHeight = Number(entry?.popupMetadata?.snipDimensions?.heightPx ?? entry?.snipDimensions?.heightPx);
  const hasNativeSnipSize =
    Number.isFinite(rawSnipWidth) &&
    rawSnipWidth > 0 &&
    Number.isFinite(rawSnipHeight) &&
    rawSnipHeight > 0;
  const width = 320;
  const height = hasNativeSnipSize
    ? clamp((rawSnipHeight / rawSnipWidth) * width, 140, 340)
    : 180;

  const imageDataUrl =
    typeof entry?.imageDataUrl === "string" && entry.imageDataUrl.trim() ? entry.imageDataUrl : null;
  if (imageDataUrl) {
    const image = document.createElement("img");
    image.className = "reference-preview-image";
    image.alt = "Reference snip";
    image.src = imageDataUrl;
    stage.append(image);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "reference-preview-text";
    fallback.textContent =
      typeof entry?.textContent === "string" && entry.textContent.trim()
        ? entry.textContent.trim()
        : "No snip image available for this reference.";
    stage.append(fallback);
  }

  const overlay = makeCanvas(width, height);
  overlay.className = "reference-preview-ink";
  drawInkStrokes(overlay, entry?.inkStrokes ?? [], {
    width,
    height,
  });
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.append(overlay);
  viewport.append(stage);
  container.append(viewport);
  attachPanZoomInteraction(viewport, stage, {
    contentWidth: width,
    contentHeight: height,
    minScale: 0.7,
    maxScale: 4,
    initialScale: 1,
  });
}

export async function renderPdfPreview(container, entry, { loadDocumentBytes, loadDocumentRaster, signal } = {}) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const loadRaster = typeof loadDocumentRaster === "function" ? loadDocumentRaster : null;
  if (typeof loadDocumentBytes !== "function" && !loadRaster) {
    container.append(messageCard("PDF preview unavailable."));
    return;
  }

  const rasterDocument = loadRaster ? loadRaster(entry) : null;
  const bytes = typeof loadDocumentBytes === "function" ? loadDocumentBytes(entry) : null;
  if (signal?.aborted) {
    return;
  }
  const rasterPages = Array.isArray(rasterDocument?.pages) ? rasterDocument.pages : [];
  if ((!rasterPages || rasterPages.length < 1) && (!(bytes instanceof Uint8Array) || bytes.length < 1)) {
    const title = typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : "document.pdf";
    container.append(messageCard(`PDF bytes missing. Reupload "${title}".`));
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "reference-preview-viewport reference-preview-viewport--pdf";
  const stage = document.createElement("div");
  stage.className = "reference-preview-panzoom-stage";
  viewport.append(stage);
  container.append(viewport);

  const pageWidth = 290;
  const gap = 12;
  const pageHeights = [];
  let pdfDocument = null;
  let renderFromRaster = rasterPages.length > 0;
  if (renderFromRaster) {
    for (const pageEntry of rasterPages) {
      const width = Math.max(1, Number(pageEntry?.width) || 1);
      const height = Math.max(1, Number(pageEntry?.height) || 1);
      pageHeights.push((height / width) * pageWidth);
    }
  } else {
    try {
      if (signal?.aborted) {
        return;
      }
      const loaded = await loadPdfDocumentCompat(bytes);
      pdfDocument = loaded.pdfDocument;
    } catch (_error) {
      const title = typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : "document.pdf";
      container.append(messageCard(`Unable to render PDF preview. Reupload "${title}".`));
      return;
    }
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      if (signal?.aborted) {
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const scale = pageWidth / Math.max(1, base.width);
      const viewport = page.getViewport({ scale });
      pageHeights.push(viewport.height);
    }
  }

  const totalHeight = pageHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, pageHeights.length - 1) * gap;
  const inkOverlay = makeCanvas(pageWidth, totalHeight);
  inkOverlay.className = "reference-preview-pdf-ink";
  drawInkStrokes(inkOverlay, entry?.inkStrokes ?? [], {
    width: pageWidth,
    height: totalHeight,
  });

  const pdfContent = document.createElement("div");
  pdfContent.className = "reference-preview-pdf-content";
  pdfContent.style.width = `${pageWidth}px`;
  pdfContent.style.height = `${Math.max(1, Math.ceil(totalHeight))}px`;
  stage.append(pdfContent);

  let yOffset = 0;
  if (renderFromRaster) {
    for (const pageEntry of rasterPages) {
      const levels = Array.isArray(pageEntry?.levels) ? pageEntry.levels : [];
      const level = levels[levels.length - 1] ?? null;
      if (!level || typeof level.dataUrl !== "string" || !level.dataUrl) {
        continue;
      }
      const img = new Image();
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      img.src = level.dataUrl;
      if (typeof img.decode === "function") {
        await img.decode().catch(() => null);
      } else {
        await loaded.catch(() => null);
      }
      if (signal?.aborted) {
        return;
      }
      const sourceWidth = Math.max(1, Number(pageEntry?.width) || img.naturalWidth || 1);
      const sourceHeight = Math.max(1, Number(pageEntry?.height) || img.naturalHeight || 1);
      const drawHeight = (sourceHeight / sourceWidth) * pageWidth;
      const pageWrap = document.createElement("div");
      pageWrap.className = "reference-preview-pdf-page";
      pageWrap.style.top = `${Math.round(yOffset)}px`;
      pageWrap.style.height = `${Math.round(drawHeight)}px`;
      const canvas = makeCanvas(pageWidth, drawHeight);
      canvas.className = "reference-preview-pdf-canvas";
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      pageWrap.append(canvas);
      pdfContent.append(pageWrap);
      yOffset += drawHeight + gap;
    }
  } else {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      if (signal?.aborted) {
        return;
      }

      const base = page.getViewport({ scale: 1 });
      const scale = pageWidth / Math.max(1, base.width);
      const viewport = page.getViewport({ scale });

      const pageWrap = document.createElement("div");
      pageWrap.className = "reference-preview-pdf-page";
      pageWrap.style.top = `${Math.round(yOffset)}px`;
      pageWrap.style.height = `${Math.round(viewport.height)}px`;

      const canvas = makeCanvas(viewport.width, viewport.height);
      canvas.className = "reference-preview-pdf-canvas";
      pageWrap.append(canvas);
      pdfContent.append(pageWrap);

      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        await page.render({
          canvasContext: ctx,
          viewport,
          intent: "display",
          background: "white",
        }).promise;
      }
      yOffset += viewport.height + gap;
    }
  }
  pdfContent.append(inkOverlay);
  stage.style.width = `${pageWidth + 20}px`;
  stage.style.height = `${Math.max(1, Math.ceil(totalHeight))}px`;
  stage.style.padding = "0 10px 10px 10px";
  attachPanZoomInteraction(viewport, stage, {
    contentWidth: pageWidth + 20,
    contentHeight: Math.max(1, Math.ceil(totalHeight)),
    minScale: 0.45,
    maxScale: 3,
    initialScale: 1,
  });
}
