import { fillStrokeRoundedRect, strokeRoundedRect } from "../../core/canvas/rounded.js";
import { WidgetBase } from "../../core/widgets/widget-base.js";
import { widgetTypeTitle } from "../../features/widget-system/widget-lod.js";
import {
  drawFloatingWidgetTitle,
  drawUnifiedWidgetFrame,
  interactionStateForWidget,
  WIDGET_THEME,
} from "../../features/widget-system/widget-theme.js";

const HEADER_WORLD_HEIGHT = 34;
const GRID_STEP_WORLD = 28;
const TOOLBAR_BUTTON_SIZE_PX = 22;
const TOOLBAR_GAP_PX = 6;
const TOOLBAR_INSET_PX = 10;
const DIAGRAM_VIEW_MIN_ZOOM = 0.3;
const DIAGRAM_VIEW_MAX_ZOOM = 4.5;

const DEFAULT_NODE_WIDTH = 120;
const DEFAULT_NODE_HEIGHT = 62;
const DEFAULT_DECISION_SIZE = 90;
const DEFAULT_TERMINATOR_WIDTH = 132;
const DEFAULT_TERMINATOR_HEIGHT = 56;
const DEFAULT_IO_WIDTH = 126;
const DEFAULT_IO_HEIGHT = 58;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function worldFromPixels(camera, px) {
  return px / Math.max(0.25, camera?.zoom ?? 1);
}

function text(value, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function asObject(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  return candidate;
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function nowId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function normalizeNode(candidate) {
  const source = asObject(candidate);
  const shape = source.shape === "decision" || source.shape === "terminator" || source.shape === "io"
    ? source.shape
    : "process";
  const labelFallback = shape === "decision" ? "Decision" : shape === "terminator" ? "Start / End" : shape === "io" ? "Input / Output" : "Step";
  const widthFallback = shape === "decision" ? DEFAULT_DECISION_SIZE : shape === "terminator" ? DEFAULT_TERMINATOR_WIDTH : shape === "io" ? DEFAULT_IO_WIDTH : DEFAULT_NODE_WIDTH;
  const heightFallback = shape === "decision" ? DEFAULT_DECISION_SIZE : shape === "terminator" ? DEFAULT_TERMINATOR_HEIGHT : shape === "io" ? DEFAULT_IO_HEIGHT : DEFAULT_NODE_HEIGHT;

  return {
    id: text(source.id, nowId("diagram-node")),
    shape,
    label: text(source.label, labelFallback),
    x: Number.isFinite(source.x) ? source.x : 32,
    y: Number.isFinite(source.y) ? source.y : 32,
    width: Math.max(44, Number.isFinite(source.width) ? source.width : widthFallback),
    height: Math.max(28, Number.isFinite(source.height) ? source.height : heightFallback),
  };
}

function normalizeEdge(candidate, nodeIds) {
  const source = asObject(candidate);
  const fromId = text(source.fromId, "");
  const toId = text(source.toId, "");
  if (!fromId || !toId || !nodeIds.has(fromId) || !nodeIds.has(toId) || fromId === toId) {
    return null;
  }
  return {
    id: text(source.id, nowId("diagram-edge")),
    fromId,
    toId,
    label: text(source.label, ""),
  };
}

function normalizeDiagramDoc(candidate) {
  const source = asObject(candidate);
  const nodes = Array.isArray(source.nodes) ? source.nodes.map((entry) => normalizeNode(entry)) : [];
  const seenNodeIds = new Set();
  const dedupedNodes = [];
  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      continue;
    }
    seenNodeIds.add(node.id);
    dedupedNodes.push(node);
  }

  const edgesRaw = Array.isArray(source.edges) ? source.edges : [];
  const nodeIds = new Set(dedupedNodes.map((node) => node.id));
  const seenEdgeIds = new Set();
  const edges = [];
  for (const edgeCandidate of edgesRaw) {
    const edge = normalizeEdge(edgeCandidate, nodeIds);
    if (!edge || seenEdgeIds.has(edge.id)) {
      continue;
    }
    seenEdgeIds.add(edge.id);
    edges.push(edge);
  }

  const selectedNodeId = text(source.selectedNodeId, "");
  const connectSourceId = text(source.connectSourceId, "");
  const viewSource = asObject(source.view);
  const view = {
    zoom: clamp(
      Number.isFinite(Number(viewSource.zoom)) ? Number(viewSource.zoom) : 1,
      DIAGRAM_VIEW_MIN_ZOOM,
      DIAGRAM_VIEW_MAX_ZOOM,
    ),
    offsetXWorld: Number.isFinite(Number(viewSource.offsetXWorld)) ? Number(viewSource.offsetXWorld) : 0,
    offsetYWorld: Number.isFinite(Number(viewSource.offsetYWorld)) ? Number(viewSource.offsetYWorld) : 0,
  };

  return {
    version: 1,
    nodes: dedupedNodes,
    edges,
    selectedNodeId: nodeIds.has(selectedNodeId) ? selectedNodeId : null,
    connectMode: Boolean(source.connectMode),
    connectSourceId: nodeIds.has(connectSourceId) ? connectSourceId : null,
    view,
  };
}

function nodeCenter(node) {
  return {
    x: node.x + node.width * 0.5,
    y: node.y + node.height * 0.5,
  };
}

function pointInRect(pointX, pointY, rect) {
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

function drawArrowHead(ctx, fromX, fromY, toX, toY, size = 8) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) {
    return;
  }
  const nx = dx / length;
  const ny = dy / length;
  const backX = toX - nx * size;
  const backY = toY - ny * size;
  const perpX = -ny * (size * 0.5);
  const perpY = nx * (size * 0.5);

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(backX + perpX, backY + perpY);
  ctx.lineTo(backX - perpX, backY - perpY);
  ctx.closePath();
  ctx.fill();
}

function drawNodeShape(ctx, shape, x, y, width, height) {
  if (shape === "decision") {
    ctx.beginPath();
    ctx.moveTo(x + width * 0.5, y);
    ctx.lineTo(x + width, y + height * 0.5);
    ctx.lineTo(x + width * 0.5, y + height);
    ctx.lineTo(x, y + height * 0.5);
    ctx.closePath();
    return;
  }

  if (shape === "terminator") {
    const radiusX = width * 0.5;
    const radiusY = height * 0.5;
    ctx.beginPath();
    ctx.ellipse(x + radiusX, y + radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
    return;
  }

  if (shape === "io") {
    const slant = Math.max(8, width * 0.14);
    ctx.beginPath();
    ctx.moveTo(x + slant, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width - slant, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    return;
  }

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
}

export class DiagramWidget extends WidgetBase {
  constructor(definition) {
    const normalizedDiagramDoc = normalizeDiagramDoc(definition?.dataPayload?.diagramDoc);
    super({
      ...definition,
      size: definition.size ?? { width: 520, height: 340 },
      metadata: {
        title: definition.metadata?.title ?? "Diagram",
        ...(definition.metadata ?? {}),
      },
      dataPayload: {
        diagramDoc: normalizedDiagramDoc,
      },
    });

    this.diagramDoc = normalizedDiagramDoc;
    this._toolbarLayout = [];
  }

  _bodyWorldRect(camera) {
    const bounds = this.getInteractionBounds(camera);
    const headerHeight = Math.min(bounds.height, HEADER_WORLD_HEIGHT);
    return {
      x: this.position.x,
      y: this.position.y + headerHeight,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height - headerHeight),
    };
  }

  _bodyRectFromSize() {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, this.size.width),
      height: Math.max(1, this.size.height - HEADER_WORLD_HEIGHT),
    };
  }

  _bodyLocalFromWorld(worldX, worldY, camera) {
    const body = this._bodyWorldRect(camera);
    const view = this._resolveView();
    const zoom = this._viewWorldZoom(camera, view);
    return {
      x: (worldX - body.x) / zoom - view.offsetXWorld,
      y: (worldY - body.y) / zoom - view.offsetYWorld,
    };
  }

  _viewWorldZoom(camera, view = this._resolveView()) {
    const baseZoom = clamp(Number(view?.zoom) || 1, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM);
    if (this._isViewportDocked()) {
      return baseZoom / Math.max(0.25, camera?.zoom ?? 1);
    }
    return baseZoom;
  }

  _isViewportDocked() {
    const dock = this.metadata?.viewportDock;
    return Boolean(dock && typeof dock === "object" && (dock.side === "left" || dock.side === "right"));
  }

  _resolveView() {
    if (this._isViewportDocked()) {
      const dockView = this.metadata?.viewportDock?.view;
      return {
        zoom: clamp(Number(dockView?.zoom) || 1, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM),
        offsetXWorld: Number.isFinite(Number(dockView?.offsetXWorld)) ? Number(dockView.offsetXWorld) : 0,
        offsetYWorld: Number.isFinite(Number(dockView?.offsetYWorld)) ? Number(dockView.offsetYWorld) : 0,
      };
    }
    const view = this.diagramDoc?.view;
    return {
      zoom: clamp(Number(view?.zoom) || 1, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM),
      offsetXWorld: Number.isFinite(Number(view?.offsetXWorld)) ? Number(view.offsetXWorld) : 0,
      offsetYWorld: Number.isFinite(Number(view?.offsetYWorld)) ? Number(view.offsetYWorld) : 0,
    };
  }

  _setView(nextView) {
    const normalized = {
      zoom: clamp(Number(nextView?.zoom) || 1, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM),
      offsetXWorld: Number.isFinite(Number(nextView?.offsetXWorld)) ? Number(nextView.offsetXWorld) : 0,
      offsetYWorld: Number.isFinite(Number(nextView?.offsetYWorld)) ? Number(nextView.offsetYWorld) : 0,
    };
    if (this._isViewportDocked()) {
      const metadata = this.metadata && typeof this.metadata === "object" ? { ...this.metadata } : {};
      const dock = metadata.viewportDock && typeof metadata.viewportDock === "object"
        ? { ...metadata.viewportDock }
        : { side: "right" };
      dock.view = normalized;
      metadata.viewportDock = dock;
      this.metadata = metadata;
      return;
    }
    this.diagramDoc.view = normalized;
  }

  panViewByWorld(dxWorld, dyWorld, camera) {
    if (!Number.isFinite(dxWorld) || !Number.isFinite(dyWorld)) {
      return false;
    }
    if (Math.abs(dxWorld) < 0.0001 && Math.abs(dyWorld) < 0.0001) {
      return false;
    }
    const view = this._resolveView();
    const zoom = this._viewWorldZoom(camera, view);
    view.offsetXWorld += dxWorld / Math.max(0.01, zoom);
    view.offsetYWorld += dyWorld / Math.max(0.01, zoom);
    this._setView(view);
    return true;
  }

  zoomViewAtWorld(worldX, worldY, factor, camera) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(factor) || factor <= 0) {
      return false;
    }
    const body = this._bodyWorldRect(camera);
    if (!pointInRect(worldX, worldY, body)) {
      return false;
    }
    const view = this._resolveView();
    const oldBaseZoom = clamp(Number(view.zoom) || 1, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM);
    const nextBaseZoom = clamp(oldBaseZoom * factor, DIAGRAM_VIEW_MIN_ZOOM, DIAGRAM_VIEW_MAX_ZOOM);
    if (Math.abs(nextBaseZoom - oldBaseZoom) < 0.0001) {
      return false;
    }
    const cameraZoom = Math.max(0.25, camera?.zoom ?? 1);
    const oldWorldZoom = this._isViewportDocked() ? oldBaseZoom / cameraZoom : oldBaseZoom;
    const nextWorldZoom = this._isViewportDocked() ? nextBaseZoom / cameraZoom : nextBaseZoom;
    view.offsetXWorld += (worldX - body.x) * (1 / nextWorldZoom - 1 / oldWorldZoom);
    view.offsetYWorld += (worldY - body.y) * (1 / nextWorldZoom - 1 / oldWorldZoom);
    view.zoom = nextBaseZoom;
    this._setView(view);
    return true;
  }

  _clampNodeToBody(node) {
    const body = this._bodyRectFromSize();
    const maxX = Math.max(10, body.width - node.width - 10);
    const maxY = Math.max(10, body.height - node.height - 10);
    node.x = clamp(node.x, 10, maxX);
    node.y = clamp(node.y, 10, maxY);
    return node;
  }

  getDiagramDoc() {
    return cloneJson(this.diagramDoc, normalizeDiagramDoc({}));
  }

  setDiagramDoc(nextDoc) {
    this.diagramDoc = normalizeDiagramDoc(nextDoc);
  }

  getRasterRevision() {
    const payload = {
      collapsed: this.collapsed,
      title: this.metadata?.title ?? "",
      diagram: this.diagramDoc,
    };
    const serialized = JSON.stringify(payload);
    return `${serialized.length}:${serialized}`;
  }

  toSerializableState() {
    return {
      ...super.toSerializableState(),
      dataPayload: {
        diagramDoc: this.getDiagramDoc(),
      },
    };
  }

  isPointInBody(worldX, worldY, camera) {
    const body = this._bodyWorldRect(camera);
    return pointInRect(worldX, worldY, body);
  }

  _nodeAtBodyPoint(localX, localY) {
    for (let index = this.diagramDoc.nodes.length - 1; index >= 0; index -= 1) {
      const node = this.diagramDoc.nodes[index];
      if (node.shape === "decision") {
        const center = nodeCenter(node);
        const nx = Math.abs(localX - center.x) / Math.max(1, node.width * 0.5);
        const ny = Math.abs(localY - center.y) / Math.max(1, node.height * 0.5);
        if (nx + ny <= 1) {
          return node;
        }
        continue;
      }
      if (node.shape === "terminator") {
        const center = nodeCenter(node);
        const nx = (localX - center.x) / Math.max(1, node.width * 0.5);
        const ny = (localY - center.y) / Math.max(1, node.height * 0.5);
        if (nx * nx + ny * ny <= 1) {
          return node;
        }
        continue;
      }
      if (
        localX >= node.x &&
        localX <= node.x + node.width &&
        localY >= node.y &&
        localY <= node.y + node.height
      ) {
        return node;
      }
    }
    return null;
  }

  hitNodeAt(worldX, worldY, camera) {
    const local = this._bodyLocalFromWorld(worldX, worldY, camera);
    return this._nodeAtBodyPoint(local.x, local.y);
  }

  _makeNode(shape, localX, localY) {
    const shapeKey = shape === "decision" || shape === "terminator" || shape === "io" ? shape : "process";
    const width = shapeKey === "decision"
      ? DEFAULT_DECISION_SIZE
      : shapeKey === "terminator"
        ? DEFAULT_TERMINATOR_WIDTH
        : shapeKey === "io"
          ? DEFAULT_IO_WIDTH
          : DEFAULT_NODE_WIDTH;
    const height = shapeKey === "decision"
      ? DEFAULT_DECISION_SIZE
      : shapeKey === "terminator"
        ? DEFAULT_TERMINATOR_HEIGHT
        : shapeKey === "io"
          ? DEFAULT_IO_HEIGHT
          : DEFAULT_NODE_HEIGHT;
    const label = shapeKey === "decision"
      ? "Decision"
      : shapeKey === "terminator"
        ? "Start / End"
        : shapeKey === "io"
          ? "Input / Output"
          : "Step";

    const node = normalizeNode({
      id: nowId("diagram-node"),
      shape: shapeKey,
      label,
      x: localX - width * 0.5,
      y: localY - height * 0.5,
      width,
      height,
    });
    return this._clampNodeToBody(node);
  }

  addNode(shape = "process", { worldX = null, worldY = null, camera = null } = {}) {
    const body = camera ? this._bodyWorldRect(camera) : this._bodyRectFromSize();
    const localX = Number.isFinite(worldX) ? worldX - body.x : body.width * 0.5;
    const localY = Number.isFinite(worldY) ? worldY - body.y : body.height * 0.5;
    const node = this._makeNode(shape, localX, localY);
    this.diagramDoc.nodes.push(node);
    this.diagramDoc.selectedNodeId = node.id;
    this.diagramDoc.connectSourceId = this.diagramDoc.connectMode ? node.id : null;
    return node;
  }

  moveNodeBy(nodeId, dx, dy) {
    const node = this.diagramDoc.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return false;
    }
    node.x += dx;
    node.y += dy;
    this._clampNodeToBody(node);
    return true;
  }

  renameNode(nodeId, label) {
    const node = this.diagramDoc.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return false;
    }
    const next = text(label, "");
    if (!next) {
      return false;
    }
    if (node.label === next) {
      return false;
    }
    node.label = next;
    return true;
  }

  removeSelectedNode() {
    const selectedId = this.diagramDoc.selectedNodeId;
    if (!selectedId) {
      return false;
    }
    const before = this.diagramDoc.nodes.length;
    this.diagramDoc.nodes = this.diagramDoc.nodes.filter((node) => node.id !== selectedId);
    if (before === this.diagramDoc.nodes.length) {
      return false;
    }
    this.diagramDoc.edges = this.diagramDoc.edges.filter(
      (edge) => edge.fromId !== selectedId && edge.toId !== selectedId,
    );
    this.diagramDoc.selectedNodeId = null;
    if (this.diagramDoc.connectSourceId === selectedId) {
      this.diagramDoc.connectSourceId = null;
    }
    return true;
  }

  addEdge(fromId, toId) {
    if (!fromId || !toId || fromId === toId) {
      return false;
    }
    const fromExists = this.diagramDoc.nodes.some((node) => node.id === fromId);
    const toExists = this.diagramDoc.nodes.some((node) => node.id === toId);
    if (!fromExists || !toExists) {
      return false;
    }
    const duplicate = this.diagramDoc.edges.some((edge) => edge.fromId === fromId && edge.toId === toId);
    if (duplicate) {
      return false;
    }
    this.diagramDoc.edges.push({
      id: nowId("diagram-edge"),
      fromId,
      toId,
      label: "",
    });
    return true;
  }

  handleConnectTap(nodeId) {
    if (!this.diagramDoc.connectMode) {
      return false;
    }
    if (!nodeId) {
      this.diagramDoc.connectSourceId = null;
      return true;
    }
    if (!this.diagramDoc.connectSourceId) {
      this.diagramDoc.connectSourceId = nodeId;
      this.diagramDoc.selectedNodeId = nodeId;
      return true;
    }
    if (this.diagramDoc.connectSourceId === nodeId) {
      this.diagramDoc.connectSourceId = null;
      return true;
    }
    const created = this.addEdge(this.diagramDoc.connectSourceId, nodeId);
    this.diagramDoc.selectedNodeId = nodeId;
    this.diagramDoc.connectSourceId = created ? nodeId : this.diagramDoc.connectSourceId;
    return created;
  }

  toggleConnectMode() {
    const next = !this.diagramDoc.connectMode;
    this.diagramDoc.connectMode = next;
    this.diagramDoc.connectSourceId = next ? this.diagramDoc.selectedNodeId : null;
    return next;
  }

  applyToolbarAction(action, { worldX = null, worldY = null, camera = null } = {}) {
    if (action === "add-process") {
      this.addNode("process", { worldX, worldY, camera });
      return true;
    }
    if (action === "add-decision") {
      this.addNode("decision", { worldX, worldY, camera });
      return true;
    }
    if (action === "add-terminator") {
      this.addNode("terminator", { worldX, worldY, camera });
      return true;
    }
    if (action === "toggle-connect") {
      this.toggleConnectMode();
      return true;
    }
    if (action === "clear-selection") {
      if (this.diagramDoc.selectedNodeId) {
        return this.removeSelectedNode();
      }
      if (this.diagramDoc.nodes.length > 0 || this.diagramDoc.edges.length > 0) {
        this.diagramDoc.nodes = [];
        this.diagramDoc.edges = [];
        this.diagramDoc.connectSourceId = null;
        this.diagramDoc.selectedNodeId = null;
        return true;
      }
    }
    return false;
  }

  _toolbarItems(camera) {
    if (this.collapsed) {
      return [];
    }
    const body = this._bodyWorldRect(camera);
    const buttonSize = worldFromPixels(camera, TOOLBAR_BUTTON_SIZE_PX);
    const gap = worldFromPixels(camera, TOOLBAR_GAP_PX);
    const inset = worldFromPixels(camera, TOOLBAR_INSET_PX);
    const actions = [
      "add-process",
      "add-decision",
      "add-terminator",
      "toggle-connect",
      "clear-selection",
    ];
    const totalWidth = actions.length * buttonSize + (actions.length - 1) * gap;
    const startX = body.x + Math.max(inset, body.width - totalWidth - inset);
    const y = body.y + inset;
    return actions.map((action, index) => ({
      action,
      x: startX + index * (buttonSize + gap),
      y,
      width: buttonSize,
      height: buttonSize,
    }));
  }

  getToolbarActionAt(worldX, worldY, camera) {
    const layout = this._toolbarLayout.length > 0 ? this._toolbarLayout : this._toolbarItems(camera);
    for (const entry of layout) {
      if (pointInRect(worldX, worldY, entry)) {
        return entry.action;
      }
    }
    return null;
  }

  _drawToolbarGlyph(ctx, action, rect, selected = false) {
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = selected ? "#f4fbff" : WIDGET_THEME.palette.headerAccent;
    ctx.fillStyle = selected ? "#f4fbff" : WIDGET_THEME.palette.headerAccent;
    const x = rect.x;
    const y = rect.y;
    const w = rect.width;
    const h = rect.height;

    if (action === "add-process") {
      ctx.beginPath();
      ctx.roundRect(x + w * 0.2, y + h * 0.28, w * 0.6, h * 0.44, 4);
      ctx.stroke();
    } else if (action === "add-decision") {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.18);
      ctx.lineTo(x + w * 0.82, y + h * 0.5);
      ctx.lineTo(x + w * 0.5, y + h * 0.82);
      ctx.lineTo(x + w * 0.18, y + h * 0.5);
      ctx.closePath();
      ctx.stroke();
    } else if (action === "add-terminator") {
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.34, h * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (action === "toggle-connect") {
      ctx.beginPath();
      ctx.arc(x + w * 0.28, y + h * 0.36, Math.max(1.8, w * 0.09), 0, Math.PI * 2);
      ctx.arc(x + w * 0.72, y + h * 0.64, Math.max(1.8, w * 0.09), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, y + h * 0.42);
      ctx.lineTo(x + w * 0.65, y + h * 0.58);
      ctx.stroke();
    } else if (action === "clear-selection") {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h * 0.28);
      ctx.lineTo(x + w * 0.72, y + h * 0.72);
      ctx.moveTo(x + w * 0.72, y + h * 0.28);
      ctx.lineTo(x + w * 0.28, y + h * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }

  render(ctx, camera, renderContext) {
    const interaction = interactionStateForWidget(this, renderContext);
    const exportMode = renderContext?.exportMode === "content-only";
    const frame = drawUnifiedWidgetFrame(ctx, camera, this, {
      interaction,
      exportMode: renderContext?.exportMode,
      borderRadius: 18,
    });

    drawFloatingWidgetTitle(ctx, camera, {
      title: this.metadata.title || widgetTypeTitle(this.type),
      frame,
      focused: interaction.focused,
      visible: interaction.showTitle,
      widget: this,
      exportMode: renderContext?.exportMode,
    });

    if (this.collapsed) {
      return;
    }

    const body = this._bodyWorldRect(camera);
    const view = this._resolveView();
    const viewZoomWorld = this._viewWorldZoom(camera, view);
    const viewScaleScreen = Math.max(0.01, viewZoomWorld * Math.max(0.25, camera.zoom));
    const bodyScreen = camera.worldToScreen(body.x, body.y);
    const bodyWidthPx = body.width * camera.zoom;
    const bodyHeightPx = body.height * camera.zoom;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bodyScreen.x, bodyScreen.y, bodyWidthPx, bodyHeightPx);
    ctx.clip();

    ctx.fillStyle = "#fdfefe";
    ctx.fillRect(bodyScreen.x, bodyScreen.y, bodyWidthPx, bodyHeightPx);

    const gridStepPx = GRID_STEP_WORLD * viewScaleScreen;
    if (!exportMode && gridStepPx >= 14 && gridStepPx <= 84) {
      ctx.strokeStyle = "rgba(34, 79, 92, 0.07)";
      ctx.lineWidth = 1;
      const minLocalX = -view.offsetXWorld;
      const maxLocalX = minLocalX + body.width / Math.max(0.01, viewZoomWorld);
      const minLocalY = -view.offsetYWorld;
      const maxLocalY = minLocalY + body.height / Math.max(0.01, viewZoomWorld);
      for (
        let localX = Math.floor(minLocalX / GRID_STEP_WORLD) * GRID_STEP_WORLD;
        localX <= maxLocalX + GRID_STEP_WORLD;
        localX += GRID_STEP_WORLD
      ) {
        const worldX = body.x + (localX + view.offsetXWorld) * viewZoomWorld;
        const x = camera.worldToScreen(worldX, body.y).x;
        ctx.beginPath();
        ctx.moveTo(x, bodyScreen.y);
        ctx.lineTo(x, bodyScreen.y + bodyHeightPx);
        ctx.stroke();
      }
      for (
        let localY = Math.floor(minLocalY / GRID_STEP_WORLD) * GRID_STEP_WORLD;
        localY <= maxLocalY + GRID_STEP_WORLD;
        localY += GRID_STEP_WORLD
      ) {
        const worldY = body.y + (localY + view.offsetYWorld) * viewZoomWorld;
        const y = camera.worldToScreen(body.x, worldY).y;
        ctx.beginPath();
        ctx.moveTo(bodyScreen.x, y);
        ctx.lineTo(bodyScreen.x + bodyWidthPx, y);
        ctx.stroke();
      }
    }

    const nodesById = new Map(this.diagramDoc.nodes.map((node) => [node.id, node]));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#2f7f88";
    ctx.fillStyle = "#2f7f88";
    for (const edge of this.diagramDoc.edges) {
      const fromNode = nodesById.get(edge.fromId);
      const toNode = nodesById.get(edge.toId);
      if (!fromNode || !toNode) {
        continue;
      }
      const fromCenter = nodeCenter(fromNode);
      const toCenter = nodeCenter(toNode);
      const fromWorld = camera.worldToScreen(
        body.x + (fromCenter.x + view.offsetXWorld) * viewZoomWorld,
        body.y + (fromCenter.y + view.offsetYWorld) * viewZoomWorld,
      );
      const toWorld = camera.worldToScreen(
        body.x + (toCenter.x + view.offsetXWorld) * viewZoomWorld,
        body.y + (toCenter.y + view.offsetYWorld) * viewZoomWorld,
      );

      ctx.beginPath();
      ctx.moveTo(fromWorld.x, fromWorld.y);
      ctx.lineTo(toWorld.x, toWorld.y);
      ctx.stroke();
      drawArrowHead(ctx, fromWorld.x, fromWorld.y, toWorld.x, toWorld.y, Math.max(5, 7 * viewScaleScreen));
    }

    for (const node of this.diagramDoc.nodes) {
      const nodeWorldX = body.x + (node.x + view.offsetXWorld) * viewZoomWorld;
      const nodeWorldY = body.y + (node.y + view.offsetYWorld) * viewZoomWorld;
      const nodeScreen = camera.worldToScreen(nodeWorldX, nodeWorldY);
      const x = nodeScreen.x;
      const y = nodeScreen.y;
      const width = node.width * viewScaleScreen;
      const height = node.height * viewScaleScreen;
      const selected = this.diagramDoc.selectedNodeId === node.id;
      const connectSource = this.diagramDoc.connectMode && this.diagramDoc.connectSourceId === node.id;

      ctx.save();
      drawNodeShape(ctx, node.shape, x, y, width, height);
      ctx.fillStyle = selected ? "rgba(223, 244, 247, 0.96)" : "rgba(243, 249, 251, 0.96)";
      ctx.strokeStyle = connectSource ? "#18535a" : "#2f7f88";
      ctx.lineWidth = connectSource ? 2.2 : 1.7;
      ctx.fill();
      ctx.stroke();
      if (selected) {
        strokeRoundedRect(
          ctx,
          x - 1.5,
          y - 1.5,
          width + 3,
          height + 3,
          12,
          "rgba(31, 103, 113, 0.34)",
          1.1,
        );
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = WIDGET_THEME.palette.title;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontPx = clamp(10 * Math.max(0.85, viewScaleScreen), 9, 15);
      ctx.font = `${fontPx}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.fillText(text(node.label, "Node"), x + width * 0.5, y + height * 0.5, Math.max(24, width - 10));
      ctx.restore();
    }

    if (!exportMode && this.diagramDoc.nodes.length < 1) {
      ctx.save();
      ctx.fillStyle = "rgba(26, 59, 71, 0.5)";
      ctx.font = `${clamp(11 * Math.max(0.85, viewScaleScreen), 10, 14)}px ${WIDGET_THEME.typography.uiFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(
        "Use the toolbar to add steps and connect them.",
        bodyScreen.x + 14,
        bodyScreen.y + 14,
      );
      ctx.restore();
    }

    ctx.restore();

    const toolbarVisible = !exportMode && (interaction.revealActions || interaction.focused);
    this._toolbarLayout = toolbarVisible ? this._toolbarItems(camera) : [];
    if (!toolbarVisible || this._toolbarLayout.length < 1) {
      return;
    }

    for (const item of this._toolbarLayout) {
      const screen = camera.worldToScreen(item.x, item.y);
      const width = item.width * camera.zoom;
      const height = item.height * camera.zoom;
      const active = item.action === "toggle-connect" && this.diagramDoc.connectMode;
      fillStrokeRoundedRect(
        ctx,
        screen.x,
        screen.y,
        width,
        height,
        8,
        active ? WIDGET_THEME.palette.headerAccent : "#f0f6f8",
        active ? WIDGET_THEME.palette.headerAccent : "rgba(42, 93, 105, 0.24)",
        1,
      );
      this._drawToolbarGlyph(
        ctx,
        item.action,
        { x: screen.x, y: screen.y, width, height },
        active,
      );
    }
  }

  renderSnapshot(ctx, camera, renderContext) {
    this.render(ctx, camera, renderContext);
  }
}
