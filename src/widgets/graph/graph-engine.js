function compileEquation(equation) {
  const normalized = String(equation || "sin(x)").trim().replace(/\^/g, "**");
  const safePattern = /^[0-9x+\-*/().,\sA-Za-z_]*$/;
  if (!safePattern.test(normalized)) {
    return () => Number.NaN;
  }

  try {
    // Allow simple math expressions with x and common Math helpers.
    return new Function(
      "x",
      `const {sin,cos,tan,log,exp,sqrt,abs,pow,PI,E,min,max}=Math; return ${normalized};`,
    );
  } catch (_error) {
    return () => Number.NaN;
  }
}

function drawGrid(ctx, rect, view) {
  const xStep = (view.maxX - view.minX) / 8;
  const yStep = (view.maxY - view.minY) / 8;

  ctx.strokeStyle = "#d8e1ea";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 8; i += 1) {
    const x = rect.x + (rect.width / 8) * i;
    const y = rect.y + (rect.height / 8) * i;

    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.width, y);
    ctx.stroke();
  }

  const zeroX = rect.x + ((0 - view.minX) / (view.maxX - view.minX)) * rect.width;
  const zeroY = rect.y + ((view.maxY - 0) / (view.maxY - view.minY)) * rect.height;

  ctx.strokeStyle = "#8ea2b4";
  ctx.lineWidth = 1.4;

  if (zeroX >= rect.x && zeroX <= rect.x + rect.width) {
    ctx.beginPath();
    ctx.moveTo(zeroX, rect.y);
    ctx.lineTo(zeroX, rect.y + rect.height);
    ctx.stroke();
  }

  if (zeroY >= rect.y && zeroY <= rect.y + rect.height) {
    ctx.beginPath();
    ctx.moveTo(rect.x, zeroY);
    ctx.lineTo(rect.x + rect.width, zeroY);
    ctx.stroke();
  }

  ctx.fillStyle = "#4d6275";
  ctx.font = "10px IBM Plex Sans, sans-serif";
  ctx.fillText(`x:[${view.minX.toFixed(1)}, ${view.maxX.toFixed(1)}]`, rect.x + 8, rect.y + 12);
  ctx.fillText(`y:[${view.minY.toFixed(1)}, ${view.maxY.toFixed(1)}]`, rect.x + 8, rect.y + 24);

  void xStep;
  void yStep;
}

export class GraphEngine {
  draw(ctx, rect, state) {
    ctx.fillStyle = "#f9fcff";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    drawGrid(ctx, rect, state.view);

    const evaluate = compileEquation(state.equation);
    const samples = Math.max(160, Math.floor(rect.width));
    const xRange = state.view.maxX - state.view.minX;
    const yRange = state.view.maxY - state.view.minY;

    ctx.strokeStyle = "#0a6aad";
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    let hasStarted = false;
    for (let i = 0; i <= samples; i += 1) {
      const xValue = state.view.minX + (i / samples) * xRange;
      const yValue = Number(evaluate(xValue));
      if (!Number.isFinite(yValue)) {
        hasStarted = false;
        continue;
      }

      const px = rect.x + (i / samples) * rect.width;
      const py = rect.y + ((state.view.maxY - yValue) / yRange) * rect.height;

      if (!Number.isFinite(py)) {
        hasStarted = false;
        continue;
      }

      if (!hasStarted) {
        ctx.moveTo(px, py);
        hasStarted = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
  }
}
