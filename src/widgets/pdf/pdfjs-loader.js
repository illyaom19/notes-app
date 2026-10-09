const PRIMARY_URL = new URL("../../../vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
const PRIMARY_WORKER_URL = new URL("../../../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const FALLBACK_URL = PRIMARY_URL;
const FALLBACK_WORKER_URL = PRIMARY_WORKER_URL;

let loadPromise = null;

async function importPdfJs(url) {
  return import(/* @vite-ignore */ url);
}

export async function loadPdfJs() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const pdfjs = await importPdfJs(PRIMARY_URL);
        pdfjs.GlobalWorkerOptions.workerSrc = PRIMARY_WORKER_URL;
        return pdfjs;
      } catch (_error) {
        const pdfjs = await importPdfJs(FALLBACK_URL);
        pdfjs.GlobalWorkerOptions.workerSrc = FALLBACK_WORKER_URL;
        return pdfjs;
      }
    })();
  }

  return loadPromise;
}

function isWorkerBootstrapError(error) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    message.includes("setting up fake worker failed") ||
    message.includes("pdf.worker") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

export async function loadPdfDocumentFromBytes(bytes, { forceDisableWorker = false } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1) {
    throw new Error("PDF bytes are unavailable.");
  }

  const pdfjs = await loadPdfJs();
  const openDocument = async (disableWorker) => {
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      cMapUrl: new URL("../../../vendor/pdfjs/cmaps/", import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("../../../vendor/pdfjs/standard_fonts/", import.meta.url).href,
      ...(disableWorker ? { disableWorker: true } : {}),
    });
    try {
      const pdfDocument = await loadingTask.promise;
      return {
        pdfDocument,
        loadingTask,
      };
    } catch (error) {
      try {
        loadingTask.destroy?.();
      } catch (_error) {
        // Ignore cleanup failure and rethrow original.
      }
      throw error;
    }
  };

  if (forceDisableWorker) {
    return openDocument(true);
  }

  try {
    return await openDocument(false);
  } catch (error) {
    if (!isWorkerBootstrapError(error)) {
      throw error;
    }
    return openDocument(true);
  }
}
