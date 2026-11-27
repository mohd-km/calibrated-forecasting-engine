export function renderSimpsonChartSvg(simpson) {
  const { scenario, aggA, aggB, paradoxActive } = simpson;
  const width = 500;
  const height = 244;
  const leftLabel = 112;
  const rightPad = 56;
  const barW = width - leftLabel - rightPad;

  const groups = [
    {
      title: scenario.easyLabel,
      a: scenario.aEasy,
      b: scenario.bEasy,
      y: 26,
      isAggregate: false
    },
    {
      title: scenario.hardLabel,
      a: scenario.aHard,
      b: scenario.bHard,
      y: 98,
      isAggregate: false
    },
    {
      title: 'All cases combined',
      a: aggA,
      b: aggB,
      y: 176,
      isAggregate: true
    }
  ];

  const rows = groups
    .map((g) => {
      const wA = Math.max(2, g.a * barW);
      const wB = Math.max(2, g.b * barW);
      const divider = g.isAggregate
        ? `<line x1="0" y1="${g.y - 16}" x2="${width}" y2="${g.y - 16}" stroke="#e5e5e3" stroke-width="1" stroke-dasharray="3 3" />`
        : '';
      const bgHighlight =
        g.isAggregate && paradoxActive
          ? `<rect x="0" y="${g.y - 10}" width="${width}" height="62" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1" />`
          : '';

      return `
        ${divider}
        ${bgHighlight}
        <text x="10" y="${g.y + 15}" font-family="Inter, sans-serif" font-size="12" font-weight="${g.isAggregate ? '600' : '500'}" fill="#111111">${g.title}</text>
        <text x="10" y="${g.y + 33}" font-family="JetBrains Mono, monospace" font-size="11" fill="${g.a >= g.b ? '#1d4ed8' : '#575754'}">${g.a >= g.b ? `${scenario.actorA} leads` : `${scenario.actorB} leads`}</text>

        <rect x="${leftLabel}" y="${g.y + 2}" width="${barW}" height="15" rx="3" fill="#f5f5f4" />
        <rect x="${leftLabel}" y="${g.y + 2}" width="${wA.toFixed(1)}" height="15" rx="3" fill="#1d4ed8" />
        <text x="${(leftLabel + wA + 6).toFixed(1)}" y="${g.y + 13}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" fill="#1d4ed8">${(g.a * 100).toFixed(1)}%</text>

        <rect x="${leftLabel}" y="${g.y + 23}" width="${barW}" height="15" rx="3" fill="#f5f5f4" />
        <rect x="${leftLabel}" y="${g.y + 23}" width="${wB.toFixed(1)}" height="15" rx="3" fill="#52525b" />
        <text x="${(leftLabel + wB + 6).toFixed(1)}" y="${g.y + 34}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="500" fill="#444444">${(g.b * 100).toFixed(1)}%</text>
      `;
    })
    .join('');

  return `
    <svg class="svg-fluid" viewBox="0 0 ${width} ${height}" role="img" aria-label="Simpson's Paradox comparison of subgroup rates versus aggregate rates">
      ${rows}
    </svg>
  `;
}

export function renderBaseRateMosaicSvg(trap) {
  const width = 480;
  const height = 220;
  const pad = { top: 24, right: 16, bottom: 30, left: 16 };
  const boxW = width - pad.left - pad.right;
  const boxH = height - pad.top - pad.bottom;

  // Give the positive base-rate column a readable minimum visual width of 6px when tiny
  const trueW = Math.max(6, trap.baseRate * boxW);
  const falseW = boxW - trueW;

  const tpH = trap.accuracy * boxH;
  const fnH = boxH - tpH;
  const fpH = trap.errorRate * boxH;
  const tnH = boxH - fpH;

  return `
    <svg class="svg-fluid" viewBox="0 0 ${width} ${height}" role="img" aria-label="Area mosaic showing true positives versus false positives as base rate changes">
      <defs>
        <pattern id="fpHatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#dbeafe" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#1d4ed8" stroke-width="1.4" opacity="0.45" />
        </pattern>
      </defs>

      <!-- Column headers -->
      <text x="${pad.left}" y="15" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600" fill="#1d4ed8">True cases (${(trap.baseRate * 100).toFixed(1)}%)</text>
      <text x="${width - pad.right}" y="15" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="#575754">Non-cases (${((1 - trap.baseRate) * 100).toFixed(1)}%)</text>

      <!-- Left column: True Condition (TP top, FN bottom) -->
      <rect x="${pad.left}" y="${pad.top}" width="${trueW.toFixed(1)}" height="${tpH.toFixed(1)}" fill="#1d4ed8" />
      <rect x="${pad.left}" y="${(pad.top + tpH).toFixed(1)}" width="${trueW.toFixed(1)}" height="${fnH.toFixed(1)}" fill="#52525b" />

      <!-- Right column: Non-Condition (FP top, TN bottom) -->
      <rect x="${(pad.left + trueW).toFixed(1)}" y="${pad.top}" width="${falseW.toFixed(1)}" height="${fpH.toFixed(1)}" fill="url(#fpHatch)" stroke="#93c5fd" stroke-width="1" />
      <rect x="${(pad.left + trueW).toFixed(1)}" y="${(pad.top + fpH).toFixed(1)}" width="${falseW.toFixed(1)}" height="${tnH.toFixed(1)}" fill="#f5f5f4" stroke="#e5e5e3" stroke-width="1" />

      <!-- Outer frame -->
      <rect x="${pad.left}" y="${pad.top}" width="${boxW}" height="${boxH}" fill="none" stroke="#111111" stroke-width="1.2" rx="4" />

      <!-- Area caption -->
      <text x="${pad.left}" y="${height - 8}" font-family="Inter, sans-serif" font-size="12" fill="#444444">
        Per 10,000 tested: <tspan font-family="JetBrains Mono, monospace" font-weight="600" fill="#1d4ed8">${trap.per10k.tp} real</tspan> vs <tspan font-family="JetBrains Mono, monospace" font-weight="600" fill="#111111">${trap.per10k.fp} false alarms</tspan> (${(trap.falseAlarmShare * 100).toFixed(1)}%)
      </text>
    </svg>
  `;
}
