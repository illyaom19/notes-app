const PDFJS_VERSION = "4.6.82";
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
