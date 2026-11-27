const COLORS = {
  ink: '#111111',
  muted: '#6b7280',
  grid: '#ecece9',
  axis: '#d4d4d0',
  cobalt: '#1d4ed8',
  cobaltFill: 'rgba(29, 78, 216, 0.10)',
  cobaltTail: 'rgba(29, 78, 216, 0.08)',
  gaussian: '#6b7280'
};

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 280);
  const height = Math.max(rect.height, 150);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function drawPricePaths(canvas, sim, hoverIndex = null) {
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 16, right: 16, bottom: 28, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const fP = sim.fractalPrices;
  const gP = sim.gaussPrices;
  const n = fP.length;

  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    if (fP[i] < minV) minV = fP[i];
    if (gP[i] < minV) minV = gP[i];
    if (fP[i] > maxV) maxV = fP[i];
    if (gP[i] > maxV) maxV = gP[i];
  }
  const span = Math.max(maxV - minV, 10);
  minV -= span * 0.08;
  maxV += span * 0.08;

  const xOf = (i) => pad.left + (i / (n - 1)) * plotW;
  const yOf = (v) => pad.top + (1 - (v - minV) / (maxV - minV)) * plotH;

  // Horizontal grid + Y labels
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = 4;
  for (let k = 0; k <= yTicks; k++) {
    const val = minV + ((maxV - minV) * k) / yTicks;
    const y = yOf(val);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.fillText(val.toFixed(0), pad.left - 8, y);
  }

  // Baseline 100 reference
  if (100 > minV && 100 < maxV) {
    const y100 = yOf(100);
    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y100);
    ctx.lineTo(width - pad.right, y100);
    ctx.stroke();
    ctx.restore();
  }

  // X ticks (trading days)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.muted;
  const xStops = [0, 63, 126, 189, 252];
  for (const day of xStops) {
    if (day >= n) continue;
    const x = xOf(day);
    ctx.fillText(`D${day}`, x, height - pad.bottom + 8);
  }

  // Gaussian reference path (dashed)
  ctx.save();
  ctx.strokeStyle = COLORS.gaussian;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const y = yOf(gP[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Fractal path (solid cobalt)
  ctx.strokeStyle = COLORS.cobalt;
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const y = yOf(fP[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Hover crosshair
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < n) {
    const hx = xOf(hoverIndex);
    ctx.save();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(hx, pad.top);
    ctx.lineTo(hx, height - pad.bottom);
    ctx.stroke();
    ctx.restore();

    // Dots
    ctx.fillStyle = COLORS.gaussian;
    ctx.beginPath();
    ctx.arc(hx, yOf(gP[hoverIndex]), 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.cobalt;
    ctx.beginPath();
    ctx.arc(hx, yOf(fP[hoverIndex]), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return { pad, plotW, n };
}

export function drawDrawdownChart(canvas, sim) {
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 12, right: 16, bottom: 26, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const fDD = sim.fractalDD;
  const gDD = sim.gaussDD;
  const n = fDD.length;

  const minDD = Math.min(sim.maxDdF, sim.maxDdG, -0.05) * 1.12;
  const xOf = (i) => pad.left + (i / (n - 1)) * plotW;
  const yOf = (v) => pad.top + (v / minDD) * plotH;

  // Grid lines
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = 3;
  for (let k = 0; k <= yTicks; k++) {
    const val = (minDD * k) / yTicks;
    const y = yOf(val);
    ctx.strokeStyle = k === 0 ? COLORS.axis : COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${(val * 100).toFixed(0)}%`, pad.left - 8, y);
  }

  // X labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const day of [0, 63, 126, 189, 252]) {
    if (day >= n) continue;
    ctx.fillText(`D${day}`, xOf(day), height - pad.bottom + 7);
  }

  // Fractal drawdown filled area
  ctx.fillStyle = COLORS.cobaltFill;
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(0));
  for (let i = 0; i < n; i++) {
    ctx.lineTo(xOf(i), yOf(fDD[i]));
  }
  ctx.lineTo(xOf(n - 1), yOf(0));
  ctx.closePath();
  ctx.fill();

  // Gaussian drawdown dashed line
  ctx.save();
  ctx.strokeStyle = COLORS.gaussian;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const y = yOf(gDD[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // Fractal drawdown stroke
  ctx.strokeStyle = COLORS.cobalt;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const y = yOf(fDD[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawKdeChart(canvas, sim, logScale = false) {
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 16, right: 16, bottom: 28, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const { xs, kdeY, normY, maxY, bound } = sim.kde;
  const n = xs.length;
  const minLog = -3.2;
  const maxLog = Math.log10(Math.max(maxY * 1.15, 1));

  const xOf = (x) => pad.left + ((x + bound) / (2 * bound)) * plotW;
  const yOf = (y) => {
    if (!logScale) {
      return pad.top + (1 - y / (maxY * 1.12)) * plotH;
    }
    const lv = Math.max(minLog, Math.log10(Math.max(y, 1e-6)));
    return pad.top + (1 - (lv - minLog) / (maxLog - minLog)) * plotH;
  };

  // Shaded +/- 3 sigma tail zones
  const s3Neg = sim.statsF.mean - 3 * sim.statsF.std;
  const s3Pos = sim.statsF.mean + 3 * sim.statsF.std;
  ctx.fillStyle = COLORS.cobaltTail;
  if (s3Neg > -bound) {
    ctx.fillRect(pad.left, pad.top, xOf(s3Neg) - pad.left, plotH);
  }
  if (s3Pos < bound) {
    ctx.fillRect(xOf(s3Pos), pad.top, width - pad.right - xOf(s3Pos), plotH);
  }

  // Horizontal grid
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTicks = 4;
  for (let k = 0; k <= yTicks; k++) {
    const frac = k / yTicks;
    const y = pad.top + (1 - frac) * plotH;
    ctx.strokeStyle = k === 0 ? COLORS.axis : COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    const label = logScale
      ? `1e${(minLog + frac * (maxLog - minLog)).toFixed(0)}`
      : (maxY * 1.12 * frac).toFixed(0);
    ctx.fillText(label, pad.left - 8, y);
  }

  // X ticks (% daily return)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.muted;
  const xTicks = [-bound, -bound / 2, 0, bound / 2, bound];
  for (const xv of xTicks) {
    ctx.fillText(`${(xv * 100).toFixed(1)}%`, xOf(xv), height - pad.bottom + 8);
  }

  // KDE filled curve
  ctx.fillStyle = COLORS.cobaltFill;
  ctx.beginPath();
  ctx.moveTo(xOf(xs[0]), height - pad.bottom);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(xOf(xs[i]), yOf(kdeY[i]));
  }
  ctx.lineTo(xOf(xs[n - 1]), height - pad.bottom);
  ctx.closePath();
  ctx.fill();

  // Normal fit (dashed)
  ctx.save();
  ctx.strokeStyle = COLORS.gaussian;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(xs[i]);
    const y = yOf(normY[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // KDE line (solid cobalt)
  ctx.strokeStyle = COLORS.cobalt;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xOf(xs[i]);
    const y = yOf(kdeY[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Subtle 3-sigma label
  ctx.fillStyle = COLORS.cobalt;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('Shaded: >3 sigma tails', width - pad.right - 4, pad.top + 4);
}
