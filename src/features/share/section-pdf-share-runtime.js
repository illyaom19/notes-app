import { Camera2D } from "../../core/canvas/camera.js";
import { resolveWidgetLod } from "../widget-system/widget-lod.js";
import { WIDGET_THEME } from "../widget-system/widget-theme.js";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const DEFAULT_DPI = 150;
const PAGE_WIDTH_IN = 8.27;
const PAGE_HEIGHT_IN = 11.69;
const DEFAULT_MARGIN_PX = 36;
const JPEG_QUALITY = 0.92;

function isFiniteRect(rect) {
  return (
    rect &&
    Number.isFinite(rect.minX) &&
    Number.isFinite(rect.minY) &&
    Number.isFinite(rect.maxX) &&
    Number.isFinite(rect.maxY) &&
    rect.maxX > rect.minX &&
    rect.maxY > rect.minY
  );
}

function unionRect(left, right) {
  if (!isFiniteRect(left)) {
    return isFiniteRect(right) ? { ...right } : null;
  }
  if (!isFiniteRect(right)) {
    return { ...left };
  }
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

function intersectsRect(rect, worldRect) {
  if (!rect || !worldRect) {
    return false;
  }
  return !(
    rect.maxX <= worldRect.minX ||
    rect.minX >= worldRect.maxX ||
    rect.maxY <= worldRect.minY ||
    rect.minY >= worldRect.maxY
  );
}

function strokeBounds(stroke) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of stroke.points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      continue;
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

function strokeIntersectsRect(stroke, worldRect) {
  const bounds = strokeBounds(stroke);
  return intersectsRect(bounds, worldRect);
}

function widgetBounds(runtime, widget) {
  if (!widget || !runtime) {
    return null;
  }
  const rect =
    typeof runtime.getWidgetWorldRect === "function"
      ? runtime.getWidgetWorldRect(widget)
      : null;
  if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
    return {
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + Math.max(1, rect.width),
      maxY: rect.y + Math.max(1, rect.height),
    };
  }
  if (
    Number.isFinite(widget.position?.x) &&
    Number.isFinite(widget.position?.y) &&
    Number.isFinite(widget.size?.width) &&
    Number.isFinite(widget.size?.height)
  ) {
    return {
      minX: widget.position.x,
      minY: widget.position.y,
      maxX: widget.position.x + Math.max(1, widget.size.width),
      maxY: widget.position.y + Math.max(1, widget.size.height),
    };
  }
  return null;
}

function sanitizeFileStem(value, fallback = "Section") {
  const clean = typeof value === "string" ? value.trim() : "";
  const stem = (clean || fallback).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return stem || fallback;
}

function ensurePdfFilename(name, fallback = "Section.pdf") {
  const stem = sanitizeFileStem(name, fallback.replace(/\.pdf$/i, ""));
  return stem.toLowerCase().endsWith(".pdf") ? stem : `${stem}.pdf`;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function canvasToJpegBytes(canvas, quality = JPEG_QUALITY) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (candidate) => {
        if (candidate instanceof Blob) {
          resolve(candidate);
          return;
        }
        reject(new Error("Failed to encode page image."));
      },
      "image/jpeg",
      quality,
    );
  });
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function buildPdfFromJpegPages(pages, { pageWidthPt = A4_WIDTH_PT, pageHeightPt = A4_HEIGHT_PT } = {}) {
  if (!Array.isArray(pages) || pages.length < 1) {
    throw new Error("No pages were rendered for PDF export.");
  }

  const encoder = new TextEncoder();
  const chunks = [];
  let byteLength = 0;
  const objectOffsets = [];

  const pushAscii = (value) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const pushBytes = (bytes) => {
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const beginObject = (objectNumber) => {
    objectOffsets[objectNumber] = byteLength;
    pushAscii(`${objectNumber} 0 obj\n`);
  };
  const endObject = () => {
    pushAscii("endobj\n");
  };

  pushAscii("%PDF-1.4\n");
  pushBytes(new Uint8Array([0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]));

  const totalObjects = 2 + pages.length * 3;
  const pageRefs = [];
  for (let index = 0; index < pages.length; index += 1) {
    pageRefs.push(5 + index * 3);
  }

  beginObject(1);
  pushAscii("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObject();

  beginObject(2);
  pushAscii(`<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] >>\n`);
  endObject();

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const imageObject = 3 + index * 3;
    const contentObject = 4 + index * 3;
    const pageObject = 5 + index * 3;
    const imageName = `Im${index + 1}`;
    const imageWidth = Math.max(1, Math.round(page.widthPx));
    const imageHeight = Math.max(1, Math.round(page.heightPx));
    const stream = `q\n${pageWidthPt.toFixed(3)} 0 0 ${pageHeightPt.toFixed(3)} 0 0 cm\n/${imageName} Do\nQ\n`;
    const streamBytes = encoder.encode(stream);

    beginObject(imageObject);
    pushAscii(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\n`,
    );
    pushAscii("stream\n");
    pushBytes(page.jpegBytes);
    pushAscii("\nendstream\n");
    endObject();

    beginObject(contentObject);
    pushAscii(`<< /Length ${streamBytes.length} >>\n`);
    pushAscii("stream\n");
    pushBytes(streamBytes);
    pushAscii("endstream\n");
    endObject();

    beginObject(pageObject);
    pushAscii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(3)} ${pageHeightPt.toFixed(3)}] /Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\n`,
    );
    endObject();
  }

  const startXref = byteLength;
  pushAscii(`xref\n0 ${totalObjects + 1}\n`);
  pushAscii("0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= totalObjects; objectNumber += 1) {
    const offset = objectOffsets[objectNumber] ?? 0;
    pushAscii(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  pushAscii(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`);
  pushAscii(`startxref\n${startXref}\n%%EOF`);
  return concatBytes(chunks);
}

function downloadBlob(blob, fileName, documentObj = document) {
  const url = URL.createObjectURL(blob);
  const anchor = documentObj.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  documentObj.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1200);
}

export function createSectionPdfShareRuntime({
  runtime,
  getInkFeature = null,
  getActiveScopeId = null,
  getActiveSectionName = null,
  showTextPromptDialog = null,
  showNoticeDialog = null,
  documentObj = document,
} = {}) {
  if (!runtime) {
    throw new Error("Section PDF share runtime requires a canvas runtime.");
  }

  const dpi = DEFAULT_DPI;
  const pageWidthPx = Math.max(640, Math.round(PAGE_WIDTH_IN * dpi));
  const pageHeightPx = Math.max(920, Math.round(PAGE_HEIGHT_IN * dpi));
  const marginPx = DEFAULT_MARGIN_PX;
  const printableWidthPx = Math.max(64, pageWidthPx - marginPx * 2);
  const printableHeightPx = Math.max(64, pageHeightPx - marginPx * 2);

  async function shareCurrentSectionAsPdf() {
    const widgets = runtime.listWidgets();
    const scopeId = typeof getActiveScopeId === "function" ? getActiveScopeId() : null;
    const ink = typeof getInkFeature === "function" ? getInkFeature() : null;
    const allStrokes =
      ink && typeof ink.getRenderableStrokesForExport === "function"
        ? ink.getRenderableStrokesForExport({
            contextId: scopeId,
            includeLayers: ["global", "pdf", "widget"],
          })
        : [];

    const globalStrokes = allStrokes.filter((stroke) => stroke.layer === "global");
    const attachedStrokes = allStrokes.filter((stroke) => stroke.layer === "pdf" || stroke.layer === "widget");

    let bounds = null;
    for (const widget of widgets) {
      bounds = unionRect(bounds, widgetBounds(runtime, widget));
    }
    for (const stroke of allStrokes) {
      bounds = unionRect(bounds, strokeBounds(stroke));
    }
    if (!isFiniteRect(bounds)) {
      await showNoticeDialog?.("Nothing to share in this section yet.", { title: "Share" });
      return { ok: false, reason: "empty" };
    }

    const contentWidthWorld = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeightWorld = Math.max(1, bounds.maxY - bounds.minY);
    const exportScale = printableWidthPx / contentWidthWorld;
    const pageWorldHeight = printableHeightPx / Math.max(0.0001, exportScale);
    const pageCount = Math.max(1, Math.ceil(contentHeightWorld / pageWorldHeight));

    const jpegPages = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageWorldMinY = bounds.minY + pageIndex * pageWorldHeight;
      const pageWorldMaxY = Math.min(bounds.maxY, pageWorldMinY + pageWorldHeight);
      const pageWorldRect = {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minY: pageWorldMinY,
        maxY: pageWorldMaxY,
      };

      const canvas = documentObj.createElement("canvas");
      canvas.width = pageWidthPx;
      canvas.height = pageHeightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D export context is unavailable.");
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

      const camera = new Camera2D();
      camera.zoom = exportScale;
      camera.offsetX = marginPx - bounds.minX * exportScale;
      camera.offsetY = marginPx - pageWorldMinY * exportScale;

      const renderContext = {
        width: pageWidthPx,
        height: pageHeightPx,
        canvas,
        dpr: 1,
        viewMode: "interactive",
        lod: resolveWidgetLod({
          cameraZoom: camera.zoom,
          viewMode: "interactive",
        }),
        zoom: camera.zoom,
        interaction: {
          selectedWidgetId: null,
          focusedWidgetId: null,
          hoverWidgetId: null,
          isTouchPrimary: false,
          transformingWidgetId: null,
          transformingWidgetMode: null,
        },
        theme: WIDGET_THEME,
        exportMode: "content-only",
      };

      if (ink && typeof ink.renderStrokesForExport === "function") {
        const visibleGlobal = globalStrokes.filter((stroke) => strokeIntersectsRect(stroke, pageWorldRect));
        ink.renderStrokesForExport(ctx, camera, visibleGlobal, { includeLayers: ["global"] });
      }

      for (const widget of widgets) {
        const rect = widgetBounds(runtime, widget);
        if (!intersectsRect(rect, pageWorldRect)) {
          continue;
        }
        widget.render(ctx, camera, renderContext);
      }

      if (ink && typeof ink.renderStrokesForExport === "function") {
        const visibleAttached = attachedStrokes.filter((stroke) => strokeIntersectsRect(stroke, pageWorldRect));
        ink.renderStrokesForExport(ctx, camera, visibleAttached, { includeLayers: ["pdf", "widget"] });
      }

      jpegPages.push({
        widthPx: pageWidthPx,
        heightPx: pageHeightPx,
        jpegBytes: await canvasToJpegBytes(canvas),
      });
    }

    const pdfBytes = buildPdfFromJpegPages(jpegPages, {
      pageWidthPt: A4_WIDTH_PT,
      pageHeightPt: A4_HEIGHT_PT,
    });
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    const defaultSectionName = sanitizeFileStem(
      typeof getActiveSectionName === "function" ? getActiveSectionName() : "",
      "Section",
    );
    const promptedName = await showTextPromptDialog?.({
      title: "Share Section",
      message: "Name this PDF file.",
      label: "File name",
      defaultValue: defaultSectionName,
      placeholder: "Section name",
      confirmLabel: "Continue",
    });
    if (promptedName === null) {
      return { ok: false, reason: "cancelled" };
    }

    const fileName = ensurePdfFilename(promptedName || defaultSectionName, `${defaultSectionName}.pdf`);
    const file =
      typeof File === "function"
        ? new File([blob], fileName, { type: "application/pdf" })
        : null;

    let canShareFiles = false;
    if (file && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      if (typeof navigator.canShare === "function") {
        try {
          canShareFiles = navigator.canShare({ files: [file] });
        } catch (_error) {
          canShareFiles = false;
        }
      } else {
        canShareFiles = true;
      }
    }

    if (canShareFiles && file) {
      await navigator.share({
        files: [file],
        title: fileName,
      });
      return { ok: true, method: "share", fileName };
    }

    downloadBlob(blob, fileName, documentObj);
    await showNoticeDialog?.("Native share is unavailable on this device. Downloaded PDF instead.", {
      title: "Share",
    });
    return { ok: true, method: "download", fileName };
  }

  return {
    shareCurrentSectionAsPdf,
  };
}
