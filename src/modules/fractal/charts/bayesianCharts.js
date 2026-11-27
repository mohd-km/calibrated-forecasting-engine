export function renderFrequencyMatrixSvg(bayes) {
  const { tp, fp, fn, tn } = bayes.counts;
  // 20x10 = 200 cells, each cell represents 5 cases out of 1,000
  const cols = 20;
  const rows = 10;
  const totalCells = cols * rows;

  const tpCells = Math.min(totalCells, Math.round((tp / 1000) * totalCells));
  const fpCells = Math.min(totalCells - tpCells, Math.round((fp / 1000) * totalCells));
  const fnCells = Math.min(totalCells - tpCells - fpCells, Math.round((fn / 1000) * totalCells));
  // Ensure at least 1 cell for TP if tp >= 0.5 so rare events remain visible
  const adjTp = tp >= 0.5 && tpCells === 0 ? 1 : tpCells;
  const adjFp = fp >= 0.5 && fpCells === 0 ? 1 : fpCells;
  const adjFn = fn >= 0.5 && fnCells === 0 ? 1 : fnCells;

  const cellSize = 16;
  const gap = 4;
  const pad = 4;
  const width = pad * 2 + cols * (cellSize + gap) - gap;
  const height = pad * 2 + rows * (cellSize + gap) - gap;

  const rects = [];
  for (let i = 0; i < totalCells; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellSize + gap);
    const y = pad + row * (cellSize + gap);

    let fill = '#ecece9';
    let stroke = '#e5e5e3';
    if (i < adjTp) {
      fill = '#1d4ed8';
      stroke = '#1d4ed8';
    } else if (i < adjTp + adjFp) {
      fill = '#bfdbfe';
      stroke = '#60a5fa';
    } else if (i < adjTp + adjFp + adjFn) {
      fill = '#52525b';
      stroke = '#52525b';
    }

    rects.push(
      `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1" />`
    );
  }

  return `
    <svg class="svg-fluid" viewBox="0 0 ${width} ${height}" role="img" aria-label="Natural frequency grid of 1,000 cases showing true positives, false positives, false negatives, and true negatives">
      ${rects.join('')}
    </svg>
  `;
}

export function renderPositiveSplitBar(bayes) {
  const { tp, fp } = bayes.counts;
  const totalPos = Math.max(tp + fp, 1e-6);
  const tpPct = (tp / totalPos) * 100;
  const fpPct = 100 - tpPct;

  return `
    <div style="margin-top:14px;">
      <div class="control-row" style="margin-bottom:6px;">
        <span class="control-label">Among everyone who tested positive</span>
        <span class="control-readout">${tpPct.toFixed(1)}% true / ${fpPct.toFixed(1)}% false alarm</span>
      </div>
      <div style="display:flex;height:18px;border-radius:6px;overflow:hidden;border:1px solid #e5e5e3;background:#fafaf9;">
        <div style="width:${tpPct.toFixed(2)}%;background:#1d4ed8;transition:width 180ms ease;" title="True Positives"></div>
        <div style="width:${fpPct.toFixed(2)}%;background:#bfdbfe;transition:width 180ms ease;" title="False Positives"></div>
      </div>
      <div class="legend-row" style="margin-top:8px;">
        <span class="legend-item"><span class="swatch swatch--box" style="background:#1d4ed8;"></span>Real positives (TP): ${tp.toFixed(1)}</span>
        <span class="legend-item"><span class="swatch swatch--box" style="background:#bfdbfe;border:1px solid #60a5fa;"></span>False alarms (FP): ${fp.toFixed(1)}</span>
        <span class="legend-item"><span class="swatch swatch--box" style="background:#52525b;"></span>Missed (FN): ${bayes.counts.fn.toFixed(1)}</span>
        <span class="legend-item"><span class="swatch swatch--box" style="background:#ecece9;border:1px solid #d4d4d0;"></span>Correct all-clear (TN): ${bayes.counts.tn.toFixed(1)}</span>
      </div>
    </div>
  `;
}

export function renderBayesianCurveSvg(bayes) {
  const width = 460;
  const height = 220;
  const pad = { top: 16, right: 18, bottom: 34, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xOf = (p) => pad.left + p * plotW;
  const yOf = (p) => pad.top + (1 - p) * plotH;

  const pathD = bayes.curve
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${xOf(pt.prior).toFixed(1)} ${yOf(pt.posterior).toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${xOf(1).toFixed(1)} ${yOf(0).toFixed(1)} L ${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)} Z`;

  const cx = xOf(bayes.prior);
  const cy = yOf(bayes.posterior);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = ticks
    .map((t) => {
      const y = yOf(t).toFixed(1);
      const x = xOf(t).toFixed(1);
      return `
        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#ecece9" stroke-width="1" />
        <text x="${pad.left - 8}" y="${Number(y) + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="#6b7280">${Math.round(t * 100)}%</text>
        <text x="${x}" y="${height - 12}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" fill="#6b7280">${Math.round(t * 100)}%</text>
      `;
    })
    .join('');

  return `
    <svg class="svg-fluid" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prior to posterior probability curve">
      ${gridLines}
      <line x1="${pad.left}" y1="${yOf(0)}" x2="${xOf(1)}" y2="${yOf(1)}" stroke="#9ca3af" stroke-width="1.2" stroke-dasharray="4 4" />
      <path d="${areaD}" fill="rgba(29, 78, 216, 0.08)" />
      <path d="${pathD}" fill="none" stroke="#1d4ed8" stroke-width="2.2" />
      <line x1="${cx.toFixed(1)}" y1="${yOf(0)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#1d4ed8" stroke-width="1" stroke-dasharray="2 2" />
      <line x1="${pad.left}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#1d4ed8" stroke-width="1" stroke-dasharray="2 2" />
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="2" />
      <text x="${pad.left + plotW / 2}" y="${height - 1}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#575754">How common it is (prior)</text>
    </svg>
  `;
}
