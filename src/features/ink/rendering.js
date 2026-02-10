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

export function drawStroke(ctx, camera, stroke) {
  const points = stroke.points;
  if (!points.length) {
    return;
  }

  if (points.length === 1) {
    drawPointDot(ctx, camera, points[0], stroke.color, stroke.baseWidth);
    return;
  }

  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const from = camera.worldToScreen(prev.x, prev.y);
    const to = camera.worldToScreen(current.x, current.y);
    const width = strokeWidthOnScreen(camera, stroke.baseWidth, current.p);

    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}
