function strokeWidth(baseWidth, pressure) {
  const normalized = Math.max(0.05, Math.min(1, pressure || 0.5));
  return Math.max(0.6, baseWidth * (0.35 + normalized * 0.95));
}

function strokeWidthOnScreen(camera, baseWidth, pressure) {
  const zoom = Math.max(0.05, Number(camera?.zoom) || 1);
  return strokeWidth(baseWidth, pressure) * zoom;
}

function drawPointDot(ctx, camera, point, color, baseWidth) {
  const screen = camera.worldToScreen(point.x, point.y);
  const radius = strokeWidthOnScreen(camera, baseWidth, point.p) * 0.5;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function midpoint(from, to) {
  return {
    x: (from.x + to.x) * 0.5,
    y: (from.y + to.y) * 0.5,
  };
}

export function drawStroke(ctx, camera, stroke) {
  const points = stroke.points;
  if (!points.length) {
    return;
  }

  if (points.length === 1) {
    drawPointDot(ctx, camera, points[0], stroke.color, stroke.baseWidth);
    return;
  }

  const projected = points.map((point) => {
    const screen = camera.worldToScreen(point.x, point.y);
    return {
      x: screen.x,
      y: screen.y,
      p: point.p,
    };
  });

  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (projected.length === 2) {
    const width = strokeWidthOnScreen(camera, stroke.baseWidth, projected[1].p);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    ctx.lineTo(projected[1].x, projected[1].y);
    ctx.stroke();
    return;
  }

  const firstMid = midpoint(projected[0], projected[1]);
  ctx.lineWidth = strokeWidthOnScreen(camera, stroke.baseWidth, projected[0].p);
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  ctx.lineTo(firstMid.x, firstMid.y);
  ctx.stroke();

  for (let index = 1; index < projected.length - 1; index += 1) {
    const previous = projected[index - 1];
    const current = projected[index];
    const next = projected[index + 1];
    const fromMid = midpoint(previous, current);
    const toMid = midpoint(current, next);
    const width = strokeWidthOnScreen(camera, stroke.baseWidth, current.p);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(fromMid.x, fromMid.y);
    ctx.quadraticCurveTo(current.x, current.y, toMid.x, toMid.y);
    ctx.stroke();
  }

  const lastIndex = projected.length - 1;
  const lastMid = midpoint(projected[lastIndex - 1], projected[lastIndex]);
  ctx.lineWidth = strokeWidthOnScreen(camera, stroke.baseWidth, projected[lastIndex].p);
  ctx.beginPath();
  ctx.moveTo(lastMid.x, lastMid.y);
  ctx.lineTo(projected[lastIndex].x, projected[lastIndex].y);
  ctx.stroke();
}
