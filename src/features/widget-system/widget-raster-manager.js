const DEFAULT_IDLE_DELAY_MS = 300;
const DEFAULT_MAX_CACHE_BYTES = 96 * 1024 * 1024;
const DEFAULT_MAX_BUCKETS_PER_WIDGET = 2;
const DEFAULT_MAX_QUEUE_SIZE = 120;
const DEFAULT_ZOOM_BUCKETS = Object.freeze([0.75, 1, 1.5, 2.25]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function nearestBucket(value, buckets) {
  if (!Array.isArray(buckets) || buckets.length < 1) {
    return Math.max(0.25, value || 1);
  }
  let best = buckets[0];
  let bestDist = Math.abs(value - best);
  for (let index = 1; index < buckets.length; index += 1) {
    const candidate = buckets[index];
    const dist = Math.abs(value - candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return Math.max(0.25, best);
}

function dprBucket(value) {
  const dpr = Number.isFinite(value) ? value : 1;
  if (dpr >= 2.5) {
    return 3;
  }
  if (dpr >= 1.5) {
    return 2;
  }
  return 1;
}

function estimateBytes(canvas) {
  if (!canvas) {
    return 0;
  }
  const width = Number(canvas.width) || 0;
  const height = Number(canvas.height) || 0;
  return Math.max(0, width * height * 4);
}

function localCameraForWidget(widget, zoom) {
  const baseX = widget?.position?.x ?? 0;
  const baseY = widget?.position?.y ?? 0;
  return {
    zoom,
    offsetX: -baseX * zoom,
    offsetY: -baseY * zoom,
    worldToScreen(x, y) {
      return {
        x: (x - baseX) * zoom,
        y: (y - baseY) * zoom,
      };
    },
    screenToWorld(x, y) {
      return {
        x: x / zoom + baseX,
        y: y / zoom + baseY,
      };
    },
  };
}

function inactiveInteractionState() {
  return {
    selectedWidgetId: null,
    focusedWidgetId: null,
    hoverWidgetId: null,
    isTouchPrimary: false,
  };
}

function widgetBoundsWorld(widget, camera) {
  const bounds =
    typeof widget.getInteractionBounds === "function"
      ? widget.getInteractionBounds(camera)
      : { width: widget?.size?.width ?? 0, height: widget?.size?.height ?? 0 };
  return {
    width: Math.max(1, Number(bounds?.width) || 1),
    height: Math.max(1, Number(bounds?.height) || 1),
  };
}

function isWidgetInteractionActive(widget, renderContext) {
  const interaction = renderContext?.interaction ?? {};
  const widgetId = widget?.id ?? null;
  if (!widgetId) {
    return true;
  }
  const selected = interaction.selectedWidgetId === widgetId;
  const focused = interaction.focusedWidgetId === widgetId;
  const hovered = interaction.hoverWidgetId === widgetId && interaction.isTouchPrimary !== true;
  return selected || focused || hovered;
}

function defaultRevisionForWidget(widget, runtimeEpoch = 0) {
  const custom =
    typeof widget?.getRasterRevision === "function"
      ? String(widget.getRasterRevision() ?? "")
      : "";
  const width = Number.isFinite(widget?.size?.width) ? widget.size.width.toFixed(2) : "0";
  const height = Number.isFinite(widget?.size?.height) ? widget.size.height.toFixed(2) : "0";
  return [
    runtimeEpoch,
    widget?.type ?? "",
    widget?.renderMode ?? "",
    widget?.collapsed ? "1" : "0",
    width,
    height,
    custom,
  ].join("|");
}

function extraRevisionKey(widget, renderContext, getWidgetRuntimeRevision) {
  if (typeof getWidgetRuntimeRevision !== "function") {
    return "";
  }
  try {
    const value = getWidgetRuntimeRevision(widget, renderContext);
    if (value === null || typeof value === "undefined") {
      return "";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : "";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value);
  } catch (_error) {
    return "";
  }
}

function computeRevisionKey(widget, runtime, getWidgetRuntimeRevision, renderContext) {
  const runtimeEpoch = typeof runtime.getWidgetRasterEpoch === "function" ? runtime.getWidgetRasterEpoch() : 0;
  const base = defaultRevisionForWidget(widget, runtimeEpoch);
  const extra = extraRevisionKey(widget, renderContext, getWidgetRuntimeRevision);
  return `${base}|${extra}`;
}

export function createWidgetRasterManager({
  runtime,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
  maxBucketsPerWidget = DEFAULT_MAX_BUCKETS_PER_WIDGET,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
  zoomBuckets = DEFAULT_ZOOM_BUCKETS,
  isWidgetActive = null,
  getWidgetRuntimeRevision = null,
  drawContributors = [],
} = {}) {
  if (!runtime) {
    return {
      renderWidget({ drawVector, ctx, camera, widget, renderContext }) {
        drawVector?.(ctx, camera, renderContext);
        return false;
      },
      dispose() {},
      getStats() {
        return {
          enabled: false,
          totalBytes: 0,
          widgetCount: 0,
          snapshotCount: 0,
          queueSize: 0,
        };
      },
    };
  }

  const entriesByWidgetId = new Map();
  const queue = [];
  let totalBytes = 0;
  let processing = false;
  let disposed = false;
  const detachWidgetRemoved =
    typeof runtime.registerWidgetRemovedListener === "function"
      ? runtime.registerWidgetRemovedListener((payload) => {
          const widgetId = payload?.widget?.id;
          if (!widgetId) {
            return;
          }
          const entry = entriesByWidgetId.get(widgetId);
          if (!entry) {
            return;
          }
          for (const bucketKey of entry.snapshots.keys()) {
            removeSnapshot(entry, bucketKey);
          }
          entriesByWidgetId.delete(widgetId);
        })
      : () => {};

  function getEntry(widgetId) {
    const key = String(widgetId ?? "");
    let entry = entriesByWidgetId.get(key);
    if (entry) {
      return entry;
    }
    entry = {
      widgetId: key,
      lastInteractionAt: nowMs(),
      snapshots: new Map(),
      pendingKeys: new Set(),
      lastUsedAt: 0,
    };
    entriesByWidgetId.set(key, entry);
    return entry;
  }

  function removeSnapshot(entry, bucketKey) {
    const snapshot = entry.snapshots.get(bucketKey);
    if (!snapshot) {
      return;
    }
    entry.snapshots.delete(bucketKey);
    totalBytes = Math.max(0, totalBytes - (snapshot.bytes || 0));
  }

  function enforcePerWidgetBucketLimit(entry) {
    if (entry.snapshots.size <= maxBucketsPerWidget) {
      return;
    }
    const snapshots = Array.from(entry.snapshots.values()).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const toRemove = snapshots.length - maxBucketsPerWidget;
    for (let index = 0; index < toRemove; index += 1) {
      removeSnapshot(entry, snapshots[index].bucketKey);
    }
  }

  function enforceGlobalBudget() {
    if (totalBytes <= maxCacheBytes) {
      return;
    }
    const allSnapshots = [];
    for (const entry of entriesByWidgetId.values()) {
      for (const snapshot of entry.snapshots.values()) {
        allSnapshots.push({ entry, snapshot });
      }
    }
    allSnapshots.sort((a, b) => a.snapshot.lastUsedAt - b.snapshot.lastUsedAt);
    for (const item of allSnapshots) {
      if (totalBytes <= maxCacheBytes) {
        break;
      }
      removeSnapshot(item.entry, item.snapshot.bucketKey);
    }
  }

  function makeBucketKey(zoomBucketValue, dprBucketValue) {
    return `${zoomBucketValue.toFixed(2)}@${dprBucketValue.toFixed(1)}`;
  }

  function renderWidget({
    ctx,
    camera,
    widget,
    renderContext,
    drawVector,
  }) {
    if (disposed || typeof drawVector !== "function" || !widget) {
      drawVector?.(ctx, camera, renderContext);
      return false;
    }
    if (renderContext?.viewMode === "peek") {
      drawVector(ctx, camera, renderContext);
      return false;
    }

    const interactionActive =
      isWidgetInteractionActive(widget, renderContext) ||
      (typeof isWidgetActive === "function" && isWidgetActive(widget, renderContext) === true);
    const entry = getEntry(widget.id);
    const now = nowMs();
    if (interactionActive) {
      entry.lastInteractionAt = now;
      drawVector(ctx, camera, renderContext);
      return false;
    }
    if (now - entry.lastInteractionAt < idleDelayMs) {
      drawVector(ctx, camera, renderContext);
      return false;
    }

    const zoomBucketValue = nearestBucket(camera?.zoom ?? 1, zoomBuckets);
    const dprBucketValue = dprBucket(renderContext?.dpr ?? 1);
    const bucketKey = makeBucketKey(zoomBucketValue, dprBucketValue);
    const revisionKey = computeRevisionKey(widget, runtime, getWidgetRuntimeRevision, renderContext);
    const snapshot = entry.snapshots.get(bucketKey);

    if (snapshot && snapshot.revisionKey === revisionKey && snapshot.canvas) {
      const bounds = widgetBoundsWorld(widget, camera);
      const screen = camera.worldToScreen(widget.position.x, widget.position.y);
      ctx.drawImage(
        snapshot.canvas,
        screen.x,
        screen.y,
        Math.max(1, bounds.width * camera.zoom),
        Math.max(1, bounds.height * camera.zoom),
      );
      snapshot.lastUsedAt = now;
      entry.lastUsedAt = now;
      return true;
    }

    drawVector(ctx, camera, renderContext);
    scheduleBuild({
      widget,
      renderContext,
      drawVector,
      zoomBucketValue,
      dprBucketValue,
      bucketKey,
      revisionKey,
    });
    return false;
  }

  function scheduleBuild(job) {
    const entry = getEntry(job.widget.id);
    const pendingToken = `${job.bucketKey}::${job.revisionKey}`;
    if (entry.pendingKeys.has(pendingToken)) {
      return;
    }
    if (queue.length >= maxQueueSize) {
      return;
    }
    entry.pendingKeys.add(pendingToken);
    queue.push({
      ...job,
      pendingToken,
    });
    void drainQueue();
  }

  async function drainQueue() {
    if (processing || disposed) {
      return;
    }
    processing = true;
    while (queue.length > 0 && !disposed) {
      const job = queue.shift();
      if (!job) {
        continue;
      }
      const entry = getEntry(job.widget.id);
      try {
        await buildSnapshot(job);
      } catch (_error) {
        // Keep vector fallback when build fails.
      } finally {
        entry.pendingKeys.delete(job.pendingToken);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    processing = false;
  }

  async function buildSnapshot(job) {
    if (typeof document === "undefined") {
      return;
    }
    const widget = runtime.getWidgetById(job.widget.id);
    if (!widget) {
      return;
    }
    const nextRevisionKey = computeRevisionKey(widget, runtime, getWidgetRuntimeRevision, job.renderContext);
    if (nextRevisionKey !== job.revisionKey) {
      return;
    }

    const localCamera = localCameraForWidget(widget, job.zoomBucketValue);
    const worldBounds = widgetBoundsWorld(widget, localCamera);
    const logicalWidth = Math.max(1, Math.ceil(worldBounds.width * job.zoomBucketValue));
    const logicalHeight = Math.max(1, Math.ceil(worldBounds.height * job.zoomBucketValue));
    const pixelWidth = Math.max(1, Math.floor(logicalWidth * job.dprBucketValue));
    const pixelHeight = Math.max(1, Math.floor(logicalHeight * job.dprBucketValue));
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const rasterCtx = canvas.getContext("2d", { alpha: true });
    if (!rasterCtx) {
      return;
    }

    rasterCtx.setTransform(job.dprBucketValue, 0, 0, job.dprBucketValue, 0, 0);
    rasterCtx.clearRect(0, 0, logicalWidth, logicalHeight);
    const localRenderContext = {
      ...job.renderContext,
      width: logicalWidth,
      height: logicalHeight,
      dpr: job.dprBucketValue,
      zoom: job.zoomBucketValue,
      interaction: inactiveInteractionState(),
      rasterizing: true,
    };

    job.drawVector(rasterCtx, localCamera, localRenderContext);
    for (const drawContribution of drawContributors) {
      if (typeof drawContribution !== "function") {
        continue;
      }
      try {
        drawContribution({
          ctx: rasterCtx,
          camera: localCamera,
          widget,
          renderContext: localRenderContext,
        });
      } catch (_error) {
        // Contributor failures should not block base raster generation.
      }
    }

    const entry = getEntry(widget.id);
    const snapshot = {
      bucketKey: job.bucketKey,
      revisionKey: job.revisionKey,
      canvas,
      bytes: estimateBytes(canvas),
      createdAt: nowMs(),
      lastUsedAt: nowMs(),
    };
    const previous = entry.snapshots.get(job.bucketKey);
    if (previous) {
      totalBytes = Math.max(0, totalBytes - (previous.bytes || 0));
    }
    entry.snapshots.set(job.bucketKey, snapshot);
    totalBytes += snapshot.bytes;
    enforcePerWidgetBucketLimit(entry);
    enforceGlobalBudget();
  }

  function dispose() {
    disposed = true;
    queue.length = 0;
    entriesByWidgetId.clear();
    totalBytes = 0;
    detachWidgetRemoved();
  }

  function getStats() {
    let snapshotCount = 0;
    for (const entry of entriesByWidgetId.values()) {
      snapshotCount += entry.snapshots.size;
    }
    return {
      enabled: true,
      totalBytes,
      widgetCount: entriesByWidgetId.size,
      snapshotCount,
      queueSize: queue.length,
    };
  }

  return {
    renderWidget,
    dispose,
    getStats,
  };
}
