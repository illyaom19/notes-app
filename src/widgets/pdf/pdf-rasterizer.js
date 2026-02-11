import { loadPdfJs } from "./pdfjs-loader.js";

const DEFAULT_TARGET_WIDTHS = Object.freeze([640, 1024, 1536]);
const DEFAULT_IMAGE_TYPE = "image/webp";
const DEFAULT_IMAGE_QUALITY = 0.82;
const RASTER_SCHEMA_VERSION = 1;

function normalizeTargetWidths(targetWidths) {
  const fallback = [...DEFAULT_TARGET_WIDTHS];
  if (!Array.isArray(targetWidths)) {
    return fallback;
  }
  const values = [];
  for (const value of targetWidths) {
    const width = Math.round(Number(value) || 0);
    if (!Number.isFinite(width) || width < 220) {
      continue;
    }
    values.push(width);
  }
  values.sort((a, b) => a - b);
  return values.length > 0 ? values : fallback;
}

function pageLevelId(pageNumber, levelIndex, width) {
  return `p${pageNumber}-l${levelIndex + 1}-${width}`;
}

function drawFallbackBitmap(canvas, width, height) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function canvasToDataUrl(canvas, imageType, imageQuality) {
  try {
    return canvas.toDataURL(imageType, imageQuality);
  } catch (_error) {
    return canvas.toDataURL("image/png");
  }
}

export async function createPdfRasterDocumentFromBytes(
  pdfBytes,
  {
    targetWidths = DEFAULT_TARGET_WIDTHS,
    imageType = DEFAULT_IMAGE_TYPE,
    imageQuality = DEFAULT_IMAGE_QUALITY,
    maxScale = 3,
  } = {},
) {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.length < 1) {
    throw new Error("Cannot rasterize PDF without source bytes.");
  }

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const pdfDocument = await loadingTask.promise;

  const widths = normalizeTargetWidths(targetWidths);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const baseWidth = Math.max(1, Math.round(baseViewport.width));
    const baseHeight = Math.max(1, Math.round(baseViewport.height));

    const levels = [];
    for (let index = 0; index < widths.length; index += 1) {
      const targetWidth = widths[index];
      const scale = Math.max(0.1, Math.min(maxScale, targetWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.round(viewport.width));
      const height = Math.max(1, Math.round(viewport.height));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        drawFallbackBitmap(canvas, width, height);
      } else {
        await page.render({
          canvasContext: ctx,
          viewport,
          intent: "display",
          background: "white",
        }).promise;
      }
      const dataUrl = canvasToDataUrl(canvas, imageType, imageQuality);
      levels.push({
        id: pageLevelId(pageNumber, index, width),
        width,
        height,
        dataUrl,
      });
    }

    pages.push({
      pageNumber,
      width: baseWidth,
      height: baseHeight,
      levels,
    });
  }

  if (typeof loadingTask.destroy === "function") {
    loadingTask.destroy();
  }

  return {
    schemaVersion: RASTER_SCHEMA_VERSION,
    pageCount: pages.length,
    pages,
  };
}

export function selectRasterLevelForZoom(pageEntry, cameraZoom = 1) {
  const levels = Array.isArray(pageEntry?.levels) ? pageEntry.levels : [];
  if (levels.length < 1) {
    return null;
  }

  const targetZoom = Math.max(0.05, Number(cameraZoom) || 1);
  const targetWidth = Math.max(1, (Number(pageEntry?.width) || levels[0].width || 1) * targetZoom);

  let best = levels[0];
  let bestDistance = Math.abs((levels[0]?.width || 1) - targetWidth);
  for (let index = 1; index < levels.length; index += 1) {
    const level = levels[index];
    const distance = Math.abs((level?.width || 1) - targetWidth);
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best ?? null;
}
