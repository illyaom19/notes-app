const CACHE_NAME = "notes-app-pwa-v2";
const RUNTIME_CACHE_NAME = "notes-app-runtime-v1";
const PDFJS_PROXY_PREFIX = "/pdfjs/";
const PDFJS_PRIMARY_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/";
const PDFJS_FALLBACK_BASE = "https://unpkg.com/pdfjs-dist@4.6.82/build/";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles/app.css",
  "./src/main.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
];

function shouldHandle(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isPdfJsProxyRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(PDFJS_PROXY_PREFIX);
}

function resolvePdfJsRemoteUrls(url) {
  const suffix = url.pathname.slice(PDFJS_PROXY_PREFIX.length);
  if (!suffix || suffix.includes("..")) {
    return [];
  }
  return [`${PDFJS_PRIMARY_BASE}${suffix}`, `${PDFJS_FALLBACK_BASE}${suffix}`];
}

async function tryFetchWithFallback(urls) {
  for (const candidate of urls) {
    try {
      const response = await fetch(candidate, { mode: "cors", credentials: "omit", cache: "no-store" });
      if (response.ok) {
        return response;
      }
    } catch (_error) {
      // Try next source.
    }
  }
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, RUNTIME_CACHE_NAME]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!keep.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve(true);
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (isPdfJsProxyRequest(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkResponse = await tryFetchWithFallback(resolvePdfJsRemoteUrls(url));
        if (networkResponse) {
          cache.put(request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        }
        if (cached) {
          return cached;
        }
        return new Response("PDF.js module unavailable.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }),
    );
    return;
  }

  if (!shouldHandle(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("./index.html", copy).catch(() => {});
          });
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return cache.match("./index.html");
        }),
    );
    return;
  }

  const isStaticAsset = /\.(?:js|css|json|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);
  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    }),
  );
});
