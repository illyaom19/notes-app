function toLocalPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function captureSnipDataUrl(canvas, rect) {
  const dpr = window.devicePixelRatio || 1;
  const sourceX = Math.floor(rect.x * dpr);
  const sourceY = Math.floor(rect.y * dpr);
  const sourceW = Math.max(1, Math.floor(rect.width * dpr));
  const sourceH = Math.max(1, Math.floor(rect.height * dpr));

  const output = document.createElement("canvas");
  output.width = sourceW;
  output.height = sourceH;
  const ctx = output.getContext("2d", { alpha: false });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
  return output.toDataURL("image/png");
}

export function createSnipTool({ runtime, onSnipReady, onStateChange }) {
  const state = {
    armed: false,
    pointerId: null,
    start: null,
    current: null,
  };

  function emitState() {
    onStateChange({ armed: state.armed, dragging: Boolean(state.pointerId) });
  }

  function clearDrag() {
    state.pointerId = null;
    state.start = null;
    state.current = null;
  }

  const tool = {
    arm() {
      state.armed = true;
      emitState();
    },

    disarm() {
      state.armed = false;
      clearDrag();
      emitState();
    },

    onPointerDown(event, { canvas }) {
      if (!state.armed) {
        return false;
      }
      if (event.pointerType === "pen") {
        return false;
      }
      if (event.button !== 0) {
        return false;
      }

      state.pointerId = event.pointerId;
      state.start = toLocalPoint(event, canvas);
      state.current = state.start;
      emitState();
      return true;
    },

    onPointerMove(event, { canvas }) {
      if (!state.armed || state.pointerId !== event.pointerId || !state.start) {
        return false;
      }

      state.current = toLocalPoint(event, canvas);
      return true;
    },

    onPointerUp(event, { canvas }) {
      if (!state.armed || state.pointerId !== event.pointerId || !state.start || !state.current) {
        return false;
      }

      const rect = normalizeRect(state.start, state.current);
      clearDrag();
      if (rect.width < 20 || rect.height < 20) {
        emitState();
        return true;
      }

      const dataUrl = captureSnipDataUrl(canvas, rect);
      if (dataUrl) {
        onSnipReady({ dataUrl, width: rect.width, height: rect.height });
      }
      emitState();
      return true;
    },

    onPointerCancel(event) {
      if (state.pointerId !== event.pointerId) {
        return false;
      }
      clearDrag();
      emitState();
      return true;
    },

    render(ctx) {
      if (!state.armed) {
        return;
      }

      const canvasWidth = ctx.canvas.clientWidth;
      const canvasHeight = ctx.canvas.clientHeight;
      ctx.fillStyle = "rgba(16, 31, 45, 0.08)";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      if (!state.start || !state.current) {
        ctx.fillStyle = "rgba(21, 71, 109, 0.75)";
        ctx.fillRect(12, 12, 238, 32);
        ctx.fillStyle = "#f2f7fb";
        ctx.font = "12px IBM Plex Sans, sans-serif";
        ctx.fillText("Snip mode: drag to capture area", 22, 33);
        return;
      }

      const rect = normalizeRect(state.start, state.current);
      ctx.fillStyle = "rgba(8, 102, 168, 0.18)";
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeStyle = "#0866a8";
      ctx.lineWidth = 1.4;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    },
  };

  const detachInput = runtime.registerInputHandler(tool);
  const detachLayer = runtime.registerRenderLayer(tool);

  emitState();

  return {
    arm: () => tool.arm(),
    disarm: () => tool.disarm(),
    isArmed: () => state.armed,
    dispose() {
      detachInput();
      detachLayer();
      tool.disarm();
    },
  };
}
