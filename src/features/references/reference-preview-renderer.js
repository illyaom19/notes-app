import { loadPdfJs } from "../../widgets/pdf/pdfjs-loader.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export function renderNotePreview(container, entry) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "reference-preview-viewport";
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
  viewport.append(paper);
  container.append(viewport);
}

export function renderReferencePreview(container, entry) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "reference-preview-viewport";
  const width = 320;
  const height = 180;

  const imageDataUrl =
    typeof entry?.imageDataUrl === "string" && entry.imageDataUrl.trim() ? entry.imageDataUrl : null;
  if (imageDataUrl) {
    const image = document.createElement("img");
    image.className = "reference-preview-image";
    image.alt = "Reference snip";
    image.src = imageDataUrl;
    viewport.append(image);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "reference-preview-text";
    fallback.textContent =
      typeof entry?.textContent === "string" && entry.textContent.trim()
        ? entry.textContent.trim()
        : "No snip image available for this reference.";
    viewport.append(fallback);
  }

  const overlay = makeCanvas(width, height);
  overlay.className = "reference-preview-ink";
  drawInkStrokes(overlay, entry?.inkStrokes ?? [], {
    width,
    height,
  });
  viewport.append(overlay);
  container.append(viewport);
}

export async function renderPdfPreview(container, entry, { loadDocumentBytes, signal } = {}) {
  clearElement(container);
  if (!(container instanceof HTMLElement)) {
    return;
  }

  if (typeof loadDocumentBytes !== "function") {
    container.append(messageCard("PDF preview unavailable."));
    return;
  }

  const bytes = loadDocumentBytes(entry);
  if (signal?.aborted) {
    return;
  }
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    const title = typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : "document.pdf";
    container.append(messageCard(`PDF bytes missing. Reupload "${title}".`));
    return;
  }

  const scroller = document.createElement("div");
  scroller.className = "reference-preview-pdf-scroll";
  scroller.style.position = "relative";
  container.append(scroller);

  let pdfDocument = null;
  try {
    const pdfjs = await loadPdfJs();
    if (signal?.aborted) {
      return;
    }
    pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
  } catch (_error) {
    const title = typeof entry?.title === "string" && entry.title.trim() ? entry.title.trim() : "document.pdf";
    container.append(messageCard(`Unable to render PDF preview. Reupload "${title}".`));
    return;
  }

  const pageWidth = 290;
  const gap = 12;
  const pageHeights = [];
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

  const totalHeight = pageHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, pageHeights.length - 1) * gap;
  const inkOverlay = makeCanvas(pageWidth, totalHeight);
  inkOverlay.className = "reference-preview-pdf-ink";
  drawInkStrokes(inkOverlay, entry?.inkStrokes ?? [], {
    width: pageWidth,
    height: totalHeight,
  });

  let yOffset = 0;
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
    scroller.append(pageWrap);

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

  scroller.style.height = "220px";
  scroller.style.minHeight = "220px";
  scroller.style.paddingBottom = `${Math.max(0, Math.ceil(totalHeight + 12))}px`;
  scroller.append(inkOverlay);
}
