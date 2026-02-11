const PDFJS_VERSION = "4.6.82";
const SW_PROXY_URL = `/pdfjs/pdf.min.mjs?v=${PDFJS_VERSION}`;
const SW_PROXY_WORKER_URL = `/pdfjs/pdf.worker.min.mjs?v=${PDFJS_VERSION}`;
const PRIMARY_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PRIMARY_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const FALLBACK_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const FALLBACK_WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

let loadPromise = null;

async function importPdfJs(url) {
  return import(/* @vite-ignore */ url);
}

export async function loadPdfJs() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const pdfjs = await importPdfJs(SW_PROXY_URL);
        pdfjs.GlobalWorkerOptions.workerSrc = SW_PROXY_WORKER_URL;
        return pdfjs;
      } catch (_error) {
        // Continue to direct CDN fallback when SW proxy is unavailable.
      }

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
      data: bytes,
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
