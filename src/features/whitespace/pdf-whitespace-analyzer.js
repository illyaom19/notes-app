const MIN_WHITE_RUN_RATIO = 0.04;
const MAX_DARK_RATIO = 0.018;
const TARGET_RENDER_WIDTH = 240;
const MAX_ZONES_PER_PAGE = 4;

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getRowDarkRatios(imageData, width, height) {
  const ratios = new Array(height).fill(0);
  const { data } = imageData;

  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luma = luminance(data[index], data[index + 1], data[index + 2]);
      if (luma < 238) {
        darkPixels += 1;
      }
    }
    ratios[y] = darkPixels / width;
  }

  return ratios;
}

function detectWhitespaceRuns(rowDarkRatios) {
  const minRunRows = Math.max(8, Math.floor(rowDarkRatios.length * MIN_WHITE_RUN_RATIO));
  const zones = [];

  let runStart = null;
  for (let y = 0; y < rowDarkRatios.length; y += 1) {
    const isWhiteEnough = rowDarkRatios[y] <= MAX_DARK_RATIO;

    if (isWhiteEnough && runStart === null) {
      runStart = y;
      continue;
    }

    if (!isWhiteEnough && runStart !== null) {
      const runLength = y - runStart;
      if (runLength >= minRunRows) {
        zones.push({ startRow: runStart, rowCount: runLength });
      }
      runStart = null;
    }
  }

  if (runStart !== null) {
    const runLength = rowDarkRatios.length - runStart;
    if (runLength >= minRunRows) {
      zones.push({ startRow: runStart, rowCount: runLength });
    }
  }

  zones.sort((a, b) => b.rowCount - a.rowCount);
  return zones.slice(0, MAX_ZONES_PER_PAGE);
}

async function analyzePage(pageProxy, pageNumber) {
  const viewportAt1 = pageProxy.getViewport({ scale: 1 });
  const scale = TARGET_RENDER_WIDTH / viewportAt1.width;
  const viewport = pageProxy.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    return [];
  }

  const renderTask = pageProxy.render({
    canvasContext: ctx,
    viewport,
    intent: "display",
    background: "white",
  });
  await renderTask.promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rowDarkRatios = getRowDarkRatios(imageData, canvas.width, canvas.height);
  const runs = detectWhitespaceRuns(rowDarkRatios);

  return runs.map((zone, index) => {
    const normalizedY = zone.startRow / canvas.height;
    const normalizedHeight = zone.rowCount / canvas.height;
    return {
      id: `p${pageNumber}-w${index + 1}`,
      pageNumber,
      normalizedY,
      normalizedHeight,
      confidence: 1 - Math.min(1, zone.rowCount / canvas.height),
      collapsed: false,
      linkedWidgetId: null,
    };
  });
}

export async function analyzePdfWhitespaceZones(pdfWidget) {
  if (!pdfWidget?.pages?.length) {
    return [];
  }

  const zones = [];
  for (const pageEntry of pdfWidget.pages) {
    const pageZones = await analyzePage(pageEntry.pageProxy, pageEntry.pageNumber);
    zones.push(...pageZones);
  }

  return zones;
}
