const HOLD_TO_OPEN_MS = 420;
const MOVE_THRESHOLD_PX = 8;
const RADIAL_MIN_DIAMETER_PX = 220;
const RADIAL_MAX_DIAMETER_PX = 320;
const RADIAL_SNAP_DISTANCE_PX = 60;
const RADIAL_LAYOUT_PRESET_ID = "default";
const RADIAL_LAYOUTS = {
  default: [
    { id: "notes", type: "expanded-area", label: "Notes", icon: "notes", angleDeg: -90 },
    { id: "snip", type: "snip", label: "Snip", icon: "snip", angleDeg: 30 },
    { id: "pdf", type: "pdf-document", label: "PDF", icon: "pdf", angleDeg: 150 },
  ],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngleDeg(value) {
  let angle = Number(value) || 0;
  while (angle > 180) {
    angle -= 360;
  }
  while (angle <= -180) {
    angle += 360;
  }
  return angle;
}

function angularDistanceDeg(a, b) {
  return Math.abs(normalizeAngleDeg(a - b));
}

function iconMarkup(iconId) {
  if (iconId === "snip") {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M6 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10H6z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
      '<path d="M8.5 11h7M8.5 14h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      '<path d="M10 5v2M14 5v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      "</svg>",
    ].join("");
  }
  if (iconId === "pdf") {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M7 4h7l4 4v12H7z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
      '<path d="M14 4v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
      '<path d="M9 14h6M9 17h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      "</svg>",
    ].join("");
  }
  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<path d="M6 5h12v14H6z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    '<path d="M9 9h6M9 12h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    "</svg>",
  ].join("");
}

export function createWidgetCreationController({
  runtime,
  canvas,
  menuElement,
  onCreateIntent,
  getActiveContextId,
}) {
  if (!menuElement) {
    return { dispose: () => {} };
  }

  let holdTimer = null;
  let pointerState = null;
  const activeTouchPointerIds = new Set();
  let menuPointerId = null;
  let pendingAnchor = null;
  let pendingSourceWidgetId = null;
  let activeCreateType = null;
  let radialGeometry = null;
  let lastPointerDown = {
    pointerType: null,
    pointerId: null,
    button: null,
    at: 0,
  };
  const radialLayoutEntries = Array.isArray(RADIAL_LAYOUTS[RADIAL_LAYOUT_PRESET_ID])
    ? RADIAL_LAYOUTS[RADIAL_LAYOUT_PRESET_ID]
    : [];
  const layoutByType = new Map(radialLayoutEntries.map((entry) => [entry.type, entry]));
  const menuButtons = Array.from(menuElement.querySelectorAll("button[data-create-type]"))
    .filter((button) => button instanceof HTMLButtonElement);
  let hubTitle = menuElement.querySelector('[data-role="radial-hub-title"]');
  let hubHint = menuElement.querySelector('[data-role="radial-hub-hint"]');

  if (!(hubTitle instanceof HTMLElement) || !(hubHint instanceof HTMLElement)) {
    const hub = document.createElement("div");
    hub.className = "creation-menu__hub";
    hub.setAttribute("aria-hidden", "true");
    const hubTitleNode = document.createElement("strong");
    hubTitleNode.className = "creation-menu__hub-title";
    hubTitleNode.dataset.role = "radial-hub-title";
    hubTitleNode.textContent = "Create Widget";
    const hubHintNode = document.createElement("span");
    hubHintNode.className = "creation-menu__hub-hint";
    hubHintNode.dataset.role = "radial-hub-hint";
    hubHintNode.textContent = "Slide to select";
    hub.append(hubTitleNode, hubHintNode);
    menuElement.append(hub);
    hubTitle = hubTitleNode;
    hubHint = hubHintNode;
  }

  const radialSegments = menuButtons.map((button, index) => {
    const createType = button.dataset.createType ?? "";
    const layoutEntry = layoutByType.get(createType);
    const fallbackAngle = -90 + index * (360 / Math.max(1, menuButtons.length));
    const label = layoutEntry?.label ?? button.textContent?.trim() ?? createType;
    const icon = layoutEntry?.icon ?? "notes";
    const id = layoutEntry?.id ?? createType;
    const angleDeg = Number.isFinite(layoutEntry?.angleDeg) ? layoutEntry.angleDeg : fallbackAngle;

    button.innerHTML = [
      `<span class="creation-menu__segment-icon">${iconMarkup(icon)}</span>`,
      `<span class="creation-menu__segment-label">${label}</span>`,
    ].join("");
    button.dataset.segmentId = id;
    button.ariaLabel = label;

    return {
      id,
      type: createType,
      label,
      icon,
      angleDeg,
      button,
    };
  });

  function clearHoldTimer() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function cancelPendingHoldForPointer(pointerId) {
    if (!pointerState || pointerState.pointerId !== pointerId) {
      return;
    }
    clearHoldTimer();
    pointerState = null;
  }

  function closeMenu() {
    clearHoldTimer();
    menuPointerId = null;
    pointerState = null;
    activeTouchPointerIds.clear();
    pendingAnchor = null;
    pendingSourceWidgetId = null;
    activeCreateType = null;
    radialGeometry = null;
    menuElement.dataset.open = "false";
    menuElement.dataset.interaction = "idle";
    menuElement.dataset.activeSegment = "";
    menuElement.style.left = "-9999px";
    menuElement.style.top = "-9999px";

    if (hubHint instanceof HTMLElement) {
      hubHint.textContent = "Slide to select";
    }

    for (const segment of radialSegments) {
      segment.button.dataset.active = "false";
    }
  }

  function computeMenuDiameterPx() {
    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(clamp(shortEdge * 0.34, RADIAL_MIN_DIAMETER_PX, RADIAL_MAX_DIAMETER_PX));
  }

  function computeRadialGeometry() {
    const rect = menuElement.getBoundingClientRect();
    const diameter = Math.max(1, Math.min(rect.width, rect.height));
    const centerX = rect.left + diameter * 0.5;
    const centerY = rect.top + diameter * 0.5;
    const outerRadius = diameter * 0.48;
    const innerRadius = diameter * 0.235;
    const midRadius = (outerRadius + innerRadius) * 0.5;
    return {
      centerX,
      centerY,
      diameter,
      outerRadius,
      innerRadius,
      midRadius,
      segmentHalfSweepDeg: 180 / Math.max(1, radialSegments.length),
    };
  }

  function layoutRadialSegments() {
    if (!radialGeometry) {
      radialGeometry = computeRadialGeometry();
    }
    const radius = radialGeometry.midRadius;
    const localCenter = radialGeometry.diameter * 0.5;
    for (const segment of radialSegments) {
      const angleRad = (segment.angleDeg * Math.PI) / 180;
      const x = localCenter + Math.cos(angleRad) * radius;
      const y = localCenter + Math.sin(angleRad) * radius;
      segment.button.style.left = `${x.toFixed(1)}px`;
      segment.button.style.top = `${y.toFixed(1)}px`;
      segment.button.style.setProperty("--segment-angle", `${segment.angleDeg}deg`);
    }
  }

  function resolveSegmentAtClientPoint(clientX, clientY, { allowSnap = false } = {}) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || radialSegments.length === 0) {
      return null;
    }
    if (!radialGeometry) {
      radialGeometry = computeRadialGeometry();
    }

    const dx = clientX - radialGeometry.centerX;
    const dy = clientY - radialGeometry.centerY;
    const distance = Math.hypot(dx, dy);
    const pointerAngleDeg = normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI);
    const nearest = radialSegments.reduce((best, segment) => {
      const nextDistance = angularDistanceDeg(pointerAngleDeg, segment.angleDeg);
      if (!best || nextDistance < best.distanceDeg) {
        return { segment, distanceDeg: nextDistance };
      }
      return best;
    }, null);
    if (!nearest) {
      return null;
    }

    const directInRing =
      distance >= radialGeometry.innerRadius &&
      distance <= radialGeometry.outerRadius &&
      nearest.distanceDeg <= radialGeometry.segmentHalfSweepDeg + 8;
    if (directInRing) {
      return { segment: nearest.segment, isSnap: false };
    }

    if (!allowSnap) {
      return null;
    }

    if (distance < radialGeometry.innerRadius - 20) {
      return null;
    }
    const ringDistance = Math.abs(distance - radialGeometry.midRadius);
    if (ringDistance > RADIAL_SNAP_DISTANCE_PX) {
      return null;
    }
    return { segment: nearest.segment, isSnap: true };
  }

  function setCenterHint(text) {
    if (!(hubHint instanceof HTMLElement)) {
      return;
    }
    hubHint.textContent = text;
  }

  function setActiveType(type, { isSnap = false } = {}) {
    activeCreateType = type ?? null;
    const activeSegment = radialSegments.find((segment) => segment.type === activeCreateType) ?? null;
    menuElement.dataset.activeSegment = activeSegment?.id ?? "";
    menuElement.dataset.interaction = activeSegment ? "dragging" : "idle";

    for (const segment of radialSegments) {
      segment.button.dataset.active = segment.type === activeCreateType ? "true" : "false";
    }

    if (activeSegment) {
      setCenterHint(`${isSnap ? "Snap: " : ""}Release to create ${activeSegment.label}`);
      return;
    }
    setCenterHint("Release to cancel");
  }

  function openMenuAt({ clientX, clientY, anchor, sourceWidgetId, pointerId }) {
    pendingAnchor = {
      x: anchor.x,
      y: anchor.y,
    };
    pendingSourceWidgetId = sourceWidgetId ?? null;
    menuPointerId = pointerId;
    radialGeometry = null;

    menuElement.dataset.mode = "radial";
    menuElement.dataset.layout = RADIAL_LAYOUT_PRESET_ID;
    menuElement.dataset.open = "true";
    menuElement.dataset.interaction = "idle";

    const diameter = computeMenuDiameterPx();
    const innerDiameter = Math.round(diameter * 0.47);
    menuElement.style.setProperty("--radial-diameter", `${diameter}px`);
    menuElement.style.setProperty("--radial-inner-diameter", `${innerDiameter}px`);

    const nextX = Math.max(12, Math.min(clientX - diameter / 2, window.innerWidth - diameter - 12));
    const nextY = Math.max(12, Math.min(clientY - diameter / 2, window.innerHeight - diameter - 12));
    menuElement.style.left = `${nextX}px`;
    menuElement.style.top = `${nextY}px`;
    window.requestAnimationFrame(() => {
      radialGeometry = computeRadialGeometry();
      layoutRadialSegments();
      const initial = resolveSegmentAtClientPoint(clientX, clientY, { allowSnap: true });
      setActiveType(initial?.segment?.type ?? null, { isSnap: Boolean(initial?.isSnap) });
    });
  }

  function openFromPointer(event, camera) {
    if (!pointerState) {
      return;
    }

    if (typeof runtime.captureTouchPointer === "function") {
      runtime.captureTouchPointer(event.pointerId);
    }

    const widget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
    const anchor = camera.screenToWorld(event.offsetX, event.offsetY);

    openMenuAt({
      clientX: event.clientX,
      clientY: event.clientY,
      anchor,
      sourceWidgetId: widget?.id ?? null,
      pointerId: event.pointerId,
    });
  }

  function openFromContextMenu(event, camera) {
    const rect = canvas.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const widget = runtime.pickWidgetAtScreenPoint(offsetX, offsetY);
    const anchor = camera.screenToWorld(offsetX, offsetY);

    openMenuAt({
      clientX: event.clientX,
      clientY: event.clientY,
      anchor,
      sourceWidgetId: widget?.id ?? null,
      pointerId: null,
    });
  }

  function focusedOrSelectedWidget() {
    const widgetId = runtime.getFocusedWidgetId?.() ?? runtime.getSelectedWidgetId?.() ?? null;
    return widgetId ? runtime.getWidgetById(widgetId) : null;
  }

  const inputManager = {
    onPointerDown(event, { camera }) {
      lastPointerDown = {
        pointerType: event.pointerType ?? null,
        pointerId: event.pointerId ?? null,
        button: typeof event.button === "number" ? event.button : null,
        at: Date.now(),
      };

      if (event.pointerType !== "touch") {
        return false;
      }

      activeTouchPointerIds.add(event.pointerId);
      if (activeTouchPointerIds.size > 1) {
        clearHoldTimer();
        pointerState = null;
        if (menuElement.dataset.open === "true") {
          closeMenu();
        }
        return false;
      }

      if (menuElement.dataset.open === "true") {
        return true;
      }

      const targetWidget = runtime.pickWidgetAtScreenPoint(event.offsetX, event.offsetY);
      if (targetWidget) {
        clearHoldTimer();
        pointerState = null;
        return false;
      }

      pointerState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        camera,
      };

      clearHoldTimer();
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        if (!pointerState || pointerState.pointerId !== event.pointerId) {
          return;
        }
        openFromPointer(event, camera);
      }, HOLD_TO_OPEN_MS);

      return false;
    },

    onPointerMove(event) {
      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      pointerState.lastClientX = event.clientX;
      pointerState.lastClientY = event.clientY;

      const moved = Math.hypot(
        pointerState.lastClientX - pointerState.startClientX,
        pointerState.lastClientY - pointerState.startClientY,
      );

      if (menuElement.dataset.open === "true") {
        const resolved = resolveSegmentAtClientPoint(event.clientX, event.clientY, { allowSnap: true });
        setActiveType(resolved?.segment?.type ?? null, { isSnap: Boolean(resolved?.isSnap) });
        return true;
      }

      if (moved >= MOVE_THRESHOLD_PX) {
        cancelPendingHoldForPointer(event.pointerId);
      }

      return false;
    },

    onPointerUp(event) {
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      clearHoldTimer();

      if (menuElement.dataset.open === "true") {
        const resolved = resolveSegmentAtClientPoint(event.clientX, event.clientY, { allowSnap: true });
        const type = resolved?.segment?.type ?? activeCreateType;

        if (type && pendingAnchor) {
          onCreateIntent?.({
            type,
            anchor: { ...pendingAnchor },
            sourceWidgetId: pendingSourceWidgetId,
            contextId: getActiveContextId?.() ?? null,
            createdFrom: "manual",
          });
        }

        closeMenu();
        return true;
      }

      pointerState = null;
      return false;
    },

    onPointerCancel(event) {
      if (event.pointerType === "touch") {
        activeTouchPointerIds.delete(event.pointerId);
      }

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return false;
      }

      closeMenu();
      return false;
    },
  };

  const detachInput = runtime.registerInputHandler(inputManager);

  const onMenuClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("button[data-create-type]");
    if (!button || !pendingAnchor) {
      return;
    }

    const type = button.dataset.createType;
    if (!type) {
      return;
    }

    onCreateIntent?.({
      type,
      anchor: { ...pendingAnchor },
      sourceWidgetId: pendingSourceWidgetId,
      contextId: getActiveContextId?.() ?? null,
      createdFrom: "manual",
    });

    closeMenu();
  };

  const onWindowPointerDown = (event) => {
    if (menuElement.dataset.open !== "true") {
      return;
    }

    if (menuPointerId === event.pointerId) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && menuElement.contains(target)) {
      return;
    }

    closeMenu();
  };

  // Touch pointers used for camera pan/pinch are handled directly by runtime and
  // do not pass through onPointerMove handlers. Watch raw moves so hold-open only
  // triggers when the touch point truly stays stationary.
  const onCanvasPointerMove = (event) => {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    const moved = Math.hypot(
      event.clientX - pointerState.startClientX,
      event.clientY - pointerState.startClientY,
    );
    if (moved >= MOVE_THRESHOLD_PX) {
      cancelPendingHoldForPointer(event.pointerId);
    }
  };

  const onCanvasPointerEnd = (event) => {
    if (event.pointerType !== "touch") {
      return;
    }
    activeTouchPointerIds.delete(event.pointerId);
    cancelPendingHoldForPointer(event.pointerId);
  };

  const onWindowKeyDown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };

  const onCanvasContextMenu = (event) => {
    const hasScreenPoint =
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      (event.clientX !== 0 || event.clientY !== 0);
    const recentMouseRightClick =
      Date.now() - lastPointerDown.at < 700 &&
      lastPointerDown.pointerType === "mouse" &&
      lastPointerDown.button === 2;
    const keyboardWidget = !hasScreenPoint ? focusedOrSelectedWidget() : null;

    // Always suppress native context menus (touch long-press, stylus press-hold, etc).
    event.preventDefault();

    if (!recentMouseRightClick && hasScreenPoint) {
      return;
    }

    if (keyboardWidget) {
      // Let the widget context-menu controller handle keyboard-triggered context menus.
      return;
    }

    if (!recentMouseRightClick && !hasScreenPoint) {
      const rect = canvas.getBoundingClientRect();
      const centerOffsetX = rect.width / 2;
      const centerOffsetY = rect.height / 2;
      const anchor = runtime.camera.screenToWorld(centerOffsetX, centerOffsetY);
      closeMenu();
      event.stopImmediatePropagation();
      openMenuAt({
        clientX: rect.left + centerOffsetX,
        clientY: rect.top + centerOffsetY,
        anchor,
        sourceWidgetId: null,
        pointerId: null,
      });
      setActiveType(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const targetWidget = runtime.pickWidgetAtScreenPoint(offsetX, offsetY);

    // Right-click on a widget should be handled by the widget context menu.
    if (targetWidget) {
      return;
    }

    event.stopImmediatePropagation();
    closeMenu();
    openFromContextMenu(event, runtime.camera);
  };

  menuElement.addEventListener("click", onMenuClick);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onCanvasPointerEnd, { passive: true });
  canvas.addEventListener("pointercancel", onCanvasPointerEnd, { passive: true });
  window.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("keydown", onWindowKeyDown);
  window.addEventListener("resize", closeMenu);

  closeMenu();

  return {
    dispose() {
      detachInput();
      menuElement.removeEventListener("click", onMenuClick);
      canvas.removeEventListener("contextmenu", onCanvasContextMenu);
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerup", onCanvasPointerEnd);
      canvas.removeEventListener("pointercancel", onCanvasPointerEnd);
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("resize", closeMenu);
      closeMenu();
    },
  };
}
