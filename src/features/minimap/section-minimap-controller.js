import { Camera2D } from "../../core/canvas/camera.js";

function rectRight(rect) {
  return rect.x + rect.width;
}

function rectBottom(rect) {
  return rect.y + rect.height;
}

function isRectFullyContained(inner, outer) {
  return (
    inner.x >= outer.minX &&
    rectRight(inner) <= outer.maxX &&
    inner.y >= outer.minY &&
    rectBottom(inner) <= outer.maxY
  );
}

function minimapSizePx() {
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  if (shortEdge < 420) {
    return 84;
  }
  if (shortEdge < 700) {
    return 92;
  }
  return 100;
}

function sectionLayout({ sectionBounds, width, height, inset = 5 }) {
  const availableWidth = Math.max(1, width - inset * 2);
  const availableHeight = Math.max(1, height - inset * 2);
  const scale = Math.min(
    availableWidth / Math.max(1, sectionBounds.width),
    availableHeight / Math.max(1, sectionBounds.height),
  );
  const contentWidth = sectionBounds.width * scale;
  const contentHeight = sectionBounds.height * scale;
  const offsetX = (width - contentWidth) / 2 - sectionBounds.x * scale;
  const offsetY = (height - contentHeight) / 2 - sectionBounds.y * scale;
  return { scale, offsetX, offsetY };
}

export function createSectionMinimapController({
  runtime,
  rootElement,
  canvasElement,
  onFocusFromMinimap,
}) {
  if (!(rootElement instanceof HTMLElement) || !(canvasElement instanceof HTMLCanvasElement) || !runtime) {
    return {
      render: () => {},
      dispose: () => {},
    };
  }

  const ctx = canvasElement.getContext("2d");
  if (!ctx) {
    return {
      render: () => {},
      dispose: () => {},
    };
  }

  const snapshotCamera = new Camera2D();
  let hovered = false;
  let lastLayout = null;

  function setHovered(nextHovered) {
    hovered = Boolean(nextHovered);
    rootElement.dataset.hovered = hovered ? "true" : "false";
  }

  function hide() {
    lastLayout = null;
    rootElement.hidden = true;
    rootElement.setAttribute("aria-hidden", "true");
    return false;
  }

  function show() {
    rootElement.hidden = false;
    rootElement.setAttribute("aria-hidden", "false");
  }

  function syncPlacementAndCanvasSize() {
    const runtimeCanvasRect = runtime.canvas?.getBoundingClientRect?.();
    if (!runtimeCanvasRect || runtimeCanvasRect.width < 1 || runtimeCanvasRect.height < 1) {
      return null;
    }

    const desired = minimapSizePx();
    const maxByCanvas = Math.max(72, Math.floor(Math.min(runtimeCanvasRect.width, runtimeCanvasRect.height) * 0.36));
    const size = Math.max(72, Math.min(desired, maxByCanvas));
    rootElement.style.setProperty("--minimap-size", `${size}px`);
    rootElement.style.right = "auto";
    const leftMin = runtimeCanvasRect.left + 8;
    const leftMax = runtimeCanvasRect.right - size - 8;
    const left = leftMax >= leftMin ? leftMax : leftMin;
    rootElement.style.left = `${Math.max(0, left)}px`;
    rootElement.style.top = `${Math.max(0, runtimeCanvasRect.top + 10)}px`;

    const width = Math.max(1, Math.floor(size));
    const height = Math.max(1, Math.floor(size));
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(width * dpr));
    const targetHeight = Math.max(1, Math.floor(height * dpr));
    if (canvasElement.width !== targetWidth || canvasElement.height !== targetHeight) {
      canvasElement.width = targetWidth;
      canvasElement.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, canvasRect: runtimeCanvasRect };
  }

  function render() {
    const widgets = runtime.listWidgets();
    if (!Array.isArray(widgets) || widgets.length < 1) {
      return hide();
    }

    const visibleWorld = runtime.getVisibleWorldBounds?.();
    const sectionBounds = runtime.getSectionWorldBounds?.();
    if (!visibleWorld || !sectionBounds) {
      return hide();
    }

    const widgetRects = widgets
      .map((widget) => runtime.getWidgetWorldRect?.(widget))
      .filter((rect) => rect && Number.isFinite(rect.x) && Number.isFinite(rect.y));
    if (widgetRects.length < 1) {
      return hide();
    }

    const hasOffscreenWidgets = widgetRects.some((rect) => !isRectFullyContained(rect, visibleWorld));
    if (!hasOffscreenWidgets) {
      return hide();
    }

    show();
    const sizing = syncPlacementAndCanvasSize();
    if (!sizing) {
      return hide();
    }
    const { width, height } = sizing;
    const layout = sectionLayout({ sectionBounds, width, height });
    lastLayout = layout;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
    ctx.fillRect(0, 0, width, height);

    snapshotCamera.zoom = layout.scale;
    snapshotCamera.offsetX = layout.offsetX;
    snapshotCamera.offsetY = layout.offsetY;

    const renderContext = {
      width,
      height,
      canvas: canvasElement,
      dpr: window.devicePixelRatio || 1,
      viewMode: "peek",
      lod: "peek",
      zoom: snapshotCamera.zoom,
      interaction: {
        selectedWidgetId: null,
        focusedWidgetId: null,
        hoverWidgetId: null,
        isTouchPrimary: false,
      },
      theme: null,
    };

    for (const widget of widgets) {
      if (!widget) {
        continue;
      }
      if (typeof widget.renderSnapshot === "function") {
        widget.renderSnapshot(ctx, snapshotCamera, renderContext);
      } else if (typeof widget.render === "function") {
        widget.render(ctx, snapshotCamera, renderContext);
      }
    }

    const viewportX = visibleWorld.minX * layout.scale + layout.offsetX;
    const viewportY = visibleWorld.minY * layout.scale + layout.offsetY;
    const viewportWidth = Math.max(1, (visibleWorld.maxX - visibleWorld.minX) * layout.scale);
    const viewportHeight = Math.max(1, (visibleWorld.maxY - visibleWorld.minY) * layout.scale);
    ctx.strokeStyle = "rgba(21, 68, 97, 0.72)";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    return true;
  }

  function onPointerDown(event) {
    if (event.pointerType !== "touch" && event.button !== 0) {
      return;
    }
    if (!lastLayout) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = canvasElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldX = (x - lastLayout.offsetX) / lastLayout.scale;
    const worldY = (y - lastLayout.offsetY) / lastLayout.scale;
    const focused = runtime.focusWidgetAtWorldPoint(worldX, worldY, { fitRatio: 0.75 });
    if (focused) {
      onFocusFromMinimap?.();
    }
  }

  function onPointerEnter(event) {
    if (event.pointerType === "mouse" || event.pointerType === "pen") {
      setHovered(true);
    }
  }

  function onPointerMove(event) {
    if (event.pointerType === "mouse" || event.pointerType === "pen") {
      setHovered(true);
    }
  }

  function onPointerLeave() {
    setHovered(false);
  }

  function onWindowResize() {
    render();
  }

  rootElement.addEventListener("pointerdown", onPointerDown);
  rootElement.addEventListener("pointerenter", onPointerEnter);
  rootElement.addEventListener("pointermove", onPointerMove);
  rootElement.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("resize", onWindowResize);

  return {
    render,
    dispose() {
      rootElement.removeEventListener("pointerdown", onPointerDown);
      rootElement.removeEventListener("pointerenter", onPointerEnter);
      rootElement.removeEventListener("pointermove", onPointerMove);
      rootElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", onWindowResize);
    },
  };
}
