import { fillPill, fillStrokeRoundedRect, strokeRoundedRect } from "../../core/canvas/rounded.js";

export const WIDGET_THEME = Object.freeze({
  palette: Object.freeze({
    canvasBg: "#eef2f5",
    canvasRadialInner: "#fbfdff",
    canvasRadialMid: "#edf2f6",
    canvasRadialOuter: "#e3e9ef",
    frameFill: "#f8fafc",
    frameStroke: "#8fa1af",
    frameStrokeSoft: "#a9b6c2",
    infoFill: "#edf4f7",
    infoStroke: "#cbd8e1",
    headerAccent: "#1f6f78",
    headerAccentSoft: "#d8ebed",
    title: "#1b2731",
    bodyText: "#2f3f4d",
    mutedText: "#5b6b79",
    line: "#d8e0e7",
    selectionAccent: "#1d6f79",
    controlBg: "rgba(23, 96, 106, 0.92)",
    controlFg: "#f4f9fb",
    controlBgSoft: "rgba(91, 112, 129, 0.9)",
    pageBadgeBg: "rgba(31, 56, 75, 0.8)",
    pageBadgeFg: "#f2f7fb",
    whitespaceDivider: "rgba(220, 232, 242, 0.95)",
    whitespaceChip: "#2f7f88",
    focusHalo: "rgba(31, 103, 113, 0.24)",
  }),
  typography: Object.freeze({
    uiFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    contentFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
  }),
  lod: Object.freeze({
    detailMinZoom: 1,
    peekMaxZoom: 0.5,
  }),
});

export function interactionStateForWidget(widget, renderContext) {
  const interaction = renderContext?.interaction ?? {};
  const widgetId = widget?.id ?? null;
  const selected = interaction.selectedWidgetId === widgetId;
  const focused = interaction.focusedWidgetId === widgetId || selected;
  const hovered = interaction.hoverWidgetId === widgetId;
  const touchPrimary = interaction.isTouchPrimary === true;
  const pinned = Boolean(widget?.metadata?.pinned);
  const interactiveVisible = focused || (!touchPrimary && hovered);
  return {
    selected,
    focused,
    hovered,
    touchPrimary,
    revealActions: pinned ? false : interactiveVisible,
    showTitle: pinned ? (focused || (!touchPrimary && hovered)) : interactiveVisible,
  };
}

export function drawUnifiedWidgetFrame(
  ctx,
  camera,
  widget,
  {
    interaction = null,
    borderRadius = 16,
    headerWorldHeight = 34,
    frameStrokeWidth = 1.05,
    collapsedScale = 0.24,
    collapsedMinWorldHeight = 44,
  } = {},
) {
  const screen = camera.worldToScreen(widget.position.x, widget.position.y);
  const defaultCollapsedHeightWorld = Math.max(collapsedMinWorldHeight, widget.size.height * collapsedScale);
  const bounds = typeof widget.getInteractionBounds === "function"
    ? widget.getInteractionBounds(camera)
    : {
      width: widget.size.width,
      height: widget.collapsed ? defaultCollapsedHeightWorld : widget.size.height,
    };
  const worldWidth = Math.max(1, bounds.width);
  const worldHeight = Math.max(1, bounds.height);
  const width = worldWidth * camera.zoom;
  const height = worldHeight * camera.zoom;
  const headerHeight = Math.max(8, Math.min(height, headerWorldHeight * camera.zoom));
  const focused = interaction?.focused === true;
  const pinned = Boolean(widget?.metadata?.pinned);

  if (pinned) {
    strokeRoundedRect(
      ctx,
      screen.x,
      screen.y,
      width,
      height,
      borderRadius,
      "rgba(31, 111, 120, 0.35)",
      Math.max(1, frameStrokeWidth),
    );
    return {
      screen,
      width,
      height,
      headerHeight,
    };
  }

  fillStrokeRoundedRect(
    ctx,
    screen.x,
    screen.y,
    width,
    height,
    borderRadius,
    WIDGET_THEME.palette.frameFill,
    WIDGET_THEME.palette.frameStrokeSoft,
    frameStrokeWidth,
  );

  if (focused) {
    ctx.save();
    ctx.shadowColor = WIDGET_THEME.palette.focusHalo;
    ctx.shadowBlur = Math.max(4, 12 * camera.zoom);
    strokeRoundedRect(
      ctx,
      screen.x,
      screen.y,
      width,
      height,
      borderRadius,
      WIDGET_THEME.palette.headerAccent,
      Math.max(1, 1.1 * camera.zoom),
    );
    ctx.restore();
  }

  fillPill(
    ctx,
    screen.x + 8,
    screen.y + 6,
    Math.max(12, width - 16),
    Math.max(6, Math.min(14, headerHeight * 0.28)),
    focused ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.headerAccentSoft,
  );

  return {
    screen,
    width,
    height,
    headerHeight,
  };
}

export function drawFloatingWidgetTitle(
  ctx,
  camera,
  { title = "", frame = null, focused = false, visible = false, widget = null } = {},
) {
  if (!visible || !frame || !title) {
    if (widget && typeof widget === "object") {
      widget._floatingTitleLayout = null;
    }
    return;
  }

  const effectiveZoom = Math.max(1, camera.zoom);
  ctx.save();
  ctx.font = `${Math.max(1, 10 * effectiveZoom)}px ${WIDGET_THEME.typography.uiFamily}`;
  const textWidth = ctx.measureText(title).width;
  const padX = 7 * effectiveZoom;
  const pillH = Math.max(14, 18 * effectiveZoom);
  const pillW = Math.min(Math.max(44 * effectiveZoom, textWidth + padX * 2), Math.max(64, frame.width - 18));
  const pillX = frame.screen.x + 10;
  const pillY = frame.screen.y - pillH - Math.max(4, 6 * effectiveZoom);

  if (widget && typeof widget === "object") {
    widget._floatingTitleLayout = {
      x: pillX,
      y: pillY,
      width: pillW,
      height: pillH,
      zoom: effectiveZoom,
    };
  }

  fillPill(
    ctx,
    pillX,
    pillY,
    pillW,
    pillH,
    focused ? WIDGET_THEME.palette.headerAccent : WIDGET_THEME.palette.headerAccentSoft,
  );

  ctx.fillStyle = focused ? WIDGET_THEME.palette.controlFg : WIDGET_THEME.palette.headerAccent;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title, pillX + padX, pillY + pillH / 2);
  ctx.restore();
}

export function drawControlGlyph(ctx, glyph, { x, y, size, color = "#ffffff", lineWidth = 1.6 } = {}) {
  if (!ctx || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) {
    return;
  }

  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const half = Math.max(2, size * 0.22);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (glyph === "plus") {
    ctx.beginPath();
    ctx.moveTo(centerX - half, centerY);
    ctx.lineTo(centerX + half, centerY);
    ctx.moveTo(centerX, centerY - half);
    ctx.lineTo(centerX, centerY + half);
    ctx.stroke();
  } else if (glyph === "minus") {
    ctx.beginPath();
    ctx.moveTo(centerX - half, centerY);
    ctx.lineTo(centerX + half, centerY);
    ctx.stroke();
  } else if (glyph === "close") {
    ctx.beginPath();
    ctx.moveTo(centerX - half, centerY - half);
    ctx.lineTo(centerX + half, centerY + half);
    ctx.moveTo(centerX + half, centerY - half);
    ctx.lineTo(centerX - half, centerY + half);
    ctx.stroke();
  } else if (glyph === "resize") {
    const edge = Math.max(2, size * 0.18);
    ctx.beginPath();
    ctx.moveTo(x + size - edge, y + size - half * 1.5);
    ctx.lineTo(x + size - edge, y + size - edge);
    ctx.lineTo(x + size - half * 1.5, y + size - edge);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + size - edge * 2.4, y + size - half * 2.1);
    ctx.lineTo(x + size - edge * 2.4, y + size - edge * 2.4);
    ctx.lineTo(x + size - half * 2.1, y + size - edge * 2.4);
    ctx.stroke();
  } else if (glyph === "chevron-up") {
    ctx.beginPath();
    ctx.moveTo(centerX - half, centerY + half * 0.55);
    ctx.lineTo(centerX, centerY - half * 0.55);
    ctx.lineTo(centerX + half, centerY + half * 0.55);
    ctx.stroke();
  } else if (glyph === "chevron-down") {
    ctx.beginPath();
    ctx.moveTo(centerX - half, centerY - half * 0.55);
    ctx.lineTo(centerX, centerY + half * 0.55);
    ctx.lineTo(centerX + half, centerY - half * 0.55);
    ctx.stroke();
  } else if (glyph === "pin") {
    const headR = Math.max(1, size * 0.12);
    const wingHalf = Math.max(2, size * 0.18);
    const wingY = centerY - size * 0.08;
    const tipY = centerY + size * 0.22;
    const tailY = y + size - Math.max(2, size * 0.12);

    ctx.beginPath();
    ctx.arc(centerX, y + size * 0.24, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX - wingHalf, wingY);
    ctx.lineTo(centerX, tipY);
    ctx.lineTo(centerX + wingHalf, wingY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, tipY);
    ctx.lineTo(centerX, tailY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(1, size * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
