const DOMAINS = ['AI', 'Energy', 'Biotech', 'Macro'];

const state = {
  data: null,
  domain: 'ALL',
  search: '',
  sort: 'edge',
  selectedMarketId: null,
  sandboxMarketId: null,
  sandboxProb: 0.5,
  showMarketCurve: true,
  showTailZones: true,
};

function fmtPct(p, digits = 1) {
  return `${(p * 100).toFixed(digits)}%`;
}

function fmtSignedPP(delta) {
  const pp = (delta * 100).toFixed(1);
  return delta >= 0 ? `+${pp} pp` : `${pp} pp`;
}

function fmtCompact(n) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function clampProb(p) {
  return Math.max(0.01, Math.min(0.99, p));
}

function brierYes(p) {
  return (p - 1) ** 2;
}

function brierNo(p) {
  return p ** 2;
}

function logLossYes(p) {
  return -Math.log(clampProb(p));
}

function logLossNo(p) {
  return -Math.log(1 - clampProb(p));
}

function expectedBrier(q, pTrue) {
  return pTrue * brierYes(q) + (1 - pTrue) * brierNo(q);
}

function expectedLogLoss(q, pTrue) {
  return pTrue * logLossYes(q) + (1 - pTrue) * logLossNo(q);
}

function klDivergence(pTrue, q) {
  const p = clampProb(pTrue);
  const qq = clampProb(q);
  return p * Math.log(p / qq) + (1 - p) * Math.log((1 - p) / (1 - qq));
}

function getActiveBenchmark() {
  const { benchmarks } = state.data;
  if (state.domain === 'ALL') {
    return {
      ...benchmarks.overall,
      resolvedCount: benchmarks.resolvedCount,
      label: 'All Domains',
    };
  }
  return {
    ...benchmarks.byDomain[state.domain],
    label: state.domain,
  };
}

function getFilteredMarkets() {
  const term = state.search.trim().toLowerCase();
  let list = state.data.markets.filter((m) => {
    if (state.domain !== 'ALL' && m.domain !== state.domain) return false;
    if (term && !m.question.toLowerCase().includes(term) && !m.domain.toLowerCase().includes(term)) {
      return false;
    }
    return true;
  });

  if (state.sort === 'edge') {
    list = [...list].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  } else if (state.sort === 'liquidity') {
    list = [...list].sort((a, b) => b.liquidity - a.liquidity);
  } else if (state.sort === 'tail') {
    list = [...list].sort((a, b) => Number(b.tailEvent) - Number(a.tailEvent) || Math.abs(b.edge) - Math.abs(a.edge));
  } else if (state.sort === 'marketProb') {
    list = [...list].sort((a, b) => b.marketProb - a.marketProb);
  }
  return list;
}

function renderMasthead() {
  const { meta } = state.data;
  const feedEl = document.getElementById('feed-status');
  if (meta.dataMode === 'live') {
    feedEl.textContent = `LIVE MANIFOLD (${meta.liveMarketsCount}/${meta.totalMarkets})`;
    feedEl.classList.remove('fallback');
  } else if (meta.dataMode === 'hybrid') {
    feedEl.textContent = `HYBRID LIVE (${meta.liveMarketsCount}/${meta.totalMarkets})`;
    feedEl.classList.remove('fallback');
  } else {
    feedEl.textContent = 'VERIFIED SNAPSHOT';
    feedEl.classList.add('fallback');
  }

  const syncTs = state.data.updated_at || meta.updated_at || meta.generatedAt || '--';
  const formattedTs = syncTs === '--' ? '--' : `${syncTs.replace('T', ' ').replace('Z', '')} UTC`;
  document.getElementById('snapshot-time').textContent = formattedTs;

  const syncTextEl = document.getElementById('market-sync-text');
  if (syncTextEl) {
    syncTextEl.textContent = `Market Sync: ${formattedTs} (weekly automated refresh)`;
  }

  const visible = state.domain === 'ALL'
    ? state.data.markets
    : state.data.markets.filter((m) => m.domain === state.domain);
  const liq = visible.reduce((acc, m) => acc + m.liquidity, 0);
  const tails = visible.filter((m) => m.tailEvent).length;

  document.getElementById('stat-active-count').textContent = String(visible.length);
  document.getElementById('stat-liquidity').textContent = fmtCompact(liq);
  document.getElementById('stat-tail-count').textContent = `${tails} contracts`;
}

function renderScoreboard() {
  const b = getActiveBenchmark();
  const { benchmarks } = state.data;
  const visible = state.domain === 'ALL'
    ? state.data.markets
    : state.data.markets.filter((m) => m.domain === state.domain);

  const avgAbsEdge = visible.length
    ? visible.reduce((acc, m) => acc + Math.abs(m.edge), 0) / visible.length
    : 0;

  document.getElementById('scoreboard-context').textContent =
    `Scope: ${b.label} (${b.resolvedCount} resolved binary contracts, ${benchmarks.window}). Lower Brier, Log-Loss, and Tail-Risk scores indicate superior calibration.`;

  const brierDiff = b.brierScore - b.marketBrierScore;
  const logDiff = b.logLoss - b.marketLogLoss;
  const tailDiff = b.talebTailScore - b.marketTailScore;

  document.getElementById('kpi-brier').textContent = b.brierScore.toFixed(3);
  document.getElementById('kpi-brier-delta').textContent = `${brierDiff.toFixed(3)} vs mkt`;
  document.getElementById('kpi-brier-mkt').textContent = b.marketBrierScore.toFixed(3);

  document.getElementById('kpi-logloss').textContent = b.logLoss.toFixed(3);
  document.getElementById('kpi-logloss-delta').textContent = `${logDiff.toFixed(3)} vs mkt`;
  document.getElementById('kpi-logloss-mkt').textContent = b.marketLogLoss.toFixed(3);

  document.getElementById('kpi-edge').textContent = `+${b.marketEdgePct.toFixed(1)}%`;
  document.getElementById('kpi-edge-active').textContent = `${b.resolvedCount} resolved`;
  document.getElementById('kpi-avg-abs-edge').textContent = `${(avgAbsEdge * 100).toFixed(1)} pp`;

  document.getElementById('kpi-tail').textContent = b.talebTailScore.toFixed(3);
  document.getElementById('kpi-tail-delta').textContent = `${tailDiff.toFixed(3)} vs mkt`;
  document.getElementById('kpi-tail-mkt').textContent = b.marketTailScore.toFixed(3);
  document.getElementById('kpi-tail-n').textContent = String(b.tailEventCount);
}

function renderDomainBreakdown() {
  const tbody = document.getElementById('domain-breakdown-body');
  const { byDomain, overall, resolvedCount } = state.data.benchmarks;

  const rows = [
    { key: 'ALL', label: 'All Domains', ...overall, resolvedCount },
    ...DOMAINS.map((d) => ({ key: d, label: d, ...byDomain[d] })),
  ];

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr data-domain-row="${r.key}" class="${state.domain === r.key ? 'active-row' : ''}">
        <td style="font-family:var(--font-sans);font-weight:500;color:var(--text)">${r.label}</td>
        <td class="num">${r.resolvedCount}</td>
        <td class="num">${r.brierScore.toFixed(3)}</td>
        <td class="num">${r.logLoss.toFixed(3)}</td>
        <td class="num amber">${r.talebTailScore.toFixed(3)}</td>
        <td class="num green">+${r.marketEdgePct.toFixed(1)}%</td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      setDomain(tr.dataset.domainRow);
    });
  });
}

function renderCalibrationCurve() {
  const svg = document.getElementById('calibration-svg');
  const b = getActiveBenchmark();
  const bins = b.calibrationBins;

  const W = 640;
  const H = 400;
  const pad = { top: 24, right: 28, bottom: 52, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const x = (p) => pad.left + p * plotW;
  const y = (p) => pad.top + (1 - p) * plotH;

  let parts = [];

  // Background grid
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  if (state.showTailZones) {
    parts.push(`
      <rect x="${x(0)}" y="${pad.top}" width="${x(0.1) - x(0)}" height="${plotH}" fill="rgba(226,168,86,0.09)" />
      <rect x="${x(0.9)}" y="${pad.top}" width="${x(1.0) - x(0.9)}" height="${plotH}" fill="rgba(226,168,86,0.09)" />
      <text x="${x(0.05)}" y="${pad.top + 15}" text-anchor="middle" fill="#e2a856" font-family="JetBrains Mono" font-size="10.5">TAIL</text>
      <text x="${x(0.95)}" y="${pad.top + 15}" text-anchor="middle" fill="#e2a856" font-family="JetBrains Mono" font-size="10.5">TAIL</text>
    `);
  }

  ticks.forEach((t) => {
    const gx = x(t);
    const gy = y(t);
    parts.push(`<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="#1c2432" stroke-width="1" />`);
    parts.push(`<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="#1c2432" stroke-width="1" />`);
    parts.push(`<text x="${gx}" y="${H - pad.bottom + 18}" text-anchor="middle" fill="#7c8aa0" font-family="JetBrains Mono" font-size="11.5">${Math.round(t * 100)}%</text>`);
    parts.push(`<text x="${pad.left - 10}" y="${gy + 4}" text-anchor="end" fill="#7c8aa0" font-family="JetBrains Mono" font-size="11.5">${Math.round(t * 100)}%</text>`);
  });

  // Axes labels
  parts.push(`<text x="${pad.left + plotW / 2}" y="${H - 12}" text-anchor="middle" fill="#93a0b4" font-family="Inter" font-size="12.5">Predicted Probability</text>`);
  parts.push(`<text x="16" y="${pad.top + plotH / 2}" text-anchor="middle" fill="#93a0b4" font-family="Inter" font-size="12.5" transform="rotate(-90 16 ${pad.top + plotH / 2})">Empirical Frequency</text>`);

  // Perfect calibration diagonal
  parts.push(`<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#4c5a70" stroke-width="1.4" stroke-dasharray="4 4" />`);

  // Market baseline polyline
  if (state.showMarketCurve) {
    const mktPts = bins.map((d) => `${x(d.predicted).toFixed(1)},${y(d.marketEmpirical).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${mktPts}" fill="none" stroke="#7d8a9f" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85" />`);
    bins.forEach((d) => {
      parts.push(`<circle cx="${x(d.predicted).toFixed(1)}" cy="${y(d.marketEmpirical).toFixed(1)}" r="3.2" fill="#7d8a9f" opacity="0.75" />`);
    });
  }

  // Model calibration polyline
  const modPts = bins.map((d) => `${x(d.predicted).toFixed(1)},${y(d.empirical).toFixed(1)}`).join(' ');
  parts.push(`<polyline points="${modPts}" fill="none" stroke="#58c4dc" stroke-width="2.4" />`);

  // Model points (interactive)
  bins.forEach((d, idx) => {
    const cx = x(d.predicted).toFixed(1);
    const cy = y(d.empirical).toFixed(1);
    const r = Math.max(4.5, Math.min(8, 3.5 + d.n / 8));
    const fill = d.isTail ? '#e2a856' : '#58c4dc';
    parts.push(`
      <g class="cal-point" data-bin-index="${idx}" tabindex="0" style="cursor:pointer">
        <circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="transparent" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#0a0c10" stroke-width="1.8" />
      </g>
    `);
  });

  svg.innerHTML = parts.join('');

  const inspector = document.getElementById('bin-inspector');
  const showBin = (d) => {
    const err = ((d.empirical - d.predicted) * 100).toFixed(1);
    const mktErr = ((d.marketEmpirical - d.predicted) * 100).toFixed(1);
    inspector.innerHTML = `
      <span>BIN <strong>${d.bin}</strong> ${d.isTail ? '<span class="amber">[TAIL]</span>' : ''}</span>
      <span>PRED <strong>${fmtPct(d.predicted)}</strong></span>
      <span>MODEL EMP <strong class="cyan">${fmtPct(d.empirical)}</strong> (${err >= 0 ? '+' : ''}${err} pp)</span>
      <span>CROWD EMP <strong>${fmtPct(d.marketEmpirical)}</strong> (${mktErr >= 0 ? '+' : ''}${mktErr} pp)</span>
      <span>SAMPLE <strong>n=${d.n}</strong></span>
    `;
  };

  svg.querySelectorAll('.cal-point').forEach((g) => {
    const idx = Number(g.dataset.binIndex);
    g.addEventListener('mouseenter', () => showBin(bins[idx]));
    g.addEventListener('focus', () => showBin(bins[idx]));
    g.addEventListener('click', () => showBin(bins[idx]));
  });
}

function renderMarketsTable() {
  const tbody = document.getElementById('markets-table-body');
  const list = getFilteredMarkets();

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px;">No markets match the current filter.</td></tr>`;
    return;
  }

  if (!list.some((m) => m.id === state.selectedMarketId)) {
    state.selectedMarketId = list[0].id;
  }

  tbody.innerHTML = list
    .map((m) => {
      const selected = m.id === state.selectedMarketId ? 'selected' : '';
      const edgeCls = m.edge >= 0 ? 'edge-pos' : 'edge-neg';
      return `
        <tr data-market-id="${m.id}" class="${selected}">
          <td class="q-cell">
            <a
              class="q-title-link"
              href="${escapeHtml(m.url)}"
              target="_blank"
              rel="noopener noreferrer"
              title="Open market question on Manifold Markets"
            >${escapeHtml(m.question)}</a>
            <span class="q-meta">
              <span>Liq ${fmtCompact(m.liquidity)}</span>
              <span>&middot;</span>
              <span>Closes ${m.closeDate}</span>
              <span>&middot;</span>
              <a
                class="q-ext-link"
                href="${escapeHtml(m.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >Manifold &rarr;</a>
              ${m.tailEvent ? '<span class="tail-pill">TAIL</span>' : ''}
            </span>
          </td>
          <td><span class="domain-pill">${m.domain}</span></td>
          <td class="num mono-cell">${fmtPct(m.marketProb)}</td>
          <td class="num mono-cell" style="color:var(--text-muted)">${fmtPct(m.baseRate)}</td>
          <td class="num mono-cell cyan" style="font-weight:600">${fmtPct(m.modelProb)}</td>
          <td class="num mono-cell"><span class="edge-badge ${edgeCls}">${fmtSignedPP(m.edge)}</span></td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('tr[data-market-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      state.selectedMarketId = tr.dataset.marketId;
      renderMarketsTable();
      renderTracePanel();
    });
  });

  renderTracePanel();
}

function renderTracePanel() {
  const m = state.data.markets.find((x) => x.id === state.selectedMarketId) || state.data.markets[0];
  if (!m) return;

  document.getElementById('trace-domain-badge').textContent = m.domain;
  document.getElementById('trace-tail-badge').classList.toggle('hidden', !m.tailEvent);
  document.getElementById('trace-source-badge').textContent = m.source === 'live' ? 'LIVE MANIFOLD' : 'SNAPSHOT';
  document.getElementById('trace-question').textContent = m.question;
  document.getElementById('trace-liquidity').textContent = `Liquidity: ${fmtCompact(m.liquidity)}`;
  document.getElementById('trace-traders').textContent = `Traders: ${m.traderCount}`;
  document.getElementById('trace-close').textContent = `Closes: ${m.closeDate}`;
  document.getElementById('trace-link').href = m.url;

  document.getElementById('trace-base').textContent = fmtPct(m.baseRate);
  document.getElementById('trace-market').textContent = fmtPct(m.marketProb);
  document.getElementById('trace-model').textContent = fmtPct(m.modelProb);

  const edgeEl = document.getElementById('trace-edge');
  edgeEl.textContent = fmtSignedPP(m.edge);
  edgeEl.className = `pb-val ${m.edge >= 0 ? 'green' : 'red'}`;

  document.getElementById('marker-base').style.left = `${(m.baseRate * 100).toFixed(1)}%`;
  document.getElementById('marker-market').style.left = `${(m.marketProb * 100).toFixed(1)}%`;
  document.getElementById('marker-model').style.left = `${(m.modelProb * 100).toFixed(1)}%`;

  document.getElementById('trace-conjecture').textContent = m.trace.conjecture;
  document.getElementById('trace-critique').textContent = m.trace.critique;
  document.getElementById('trace-synthesis').textContent = m.trace.synthesis;

  document.getElementById('trace-falsifiers').innerHTML = m.trace.falsifiers
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join('');
}

function populateSandboxSelect() {
  const select = document.getElementById('sandbox-market-select');
  select.innerHTML = state.data.markets
    .map(
      (m) =>
        `<option value="${m.id}">[${m.domain}] ${escapeHtml(m.question)} (Mkt ${fmtPct(m.marketProb, 0)})</option>`
    )
    .join('');

  if (!state.sandboxMarketId) {
    state.sandboxMarketId = state.data.markets[0].id;
    state.sandboxProb = state.data.markets[0].marketProb;
  }
  select.value = state.sandboxMarketId;
}

function syncSandboxInputs() {
  const pct = Math.round(clampProb(state.sandboxProb) * 100);
  document.getElementById('sandbox-slider').value = String(pct);
  document.getElementById('sandbox-number').value = String(pct);
}

function renderSandbox() {
  const m = state.data.markets.find((x) => x.id === state.sandboxMarketId) || state.data.markets[0];
  if (!m) return;

  const pUser = clampProb(state.sandboxProb);
  const pMkt = clampProb(m.marketProb);
  const pMod = clampProb(m.modelProb);

  document.getElementById('sb-mkt-prob').textContent = fmtPct(pMkt);
  document.getElementById('sb-mod-prob').textContent = fmtPct(pMod);
  document.getElementById('sb-base-prob').textContent = fmtPct(m.baseRate);

  const expBUser = expectedBrier(pUser, pMod);
  const expBMod = expectedBrier(pMod, pMod);
  const expBMkt = expectedBrier(pMkt, pMod);

  const expLLUser = expectedLogLoss(pUser, pMod);
  const expLLMod = expectedLogLoss(pMod, pMod);
  const expLLMkt = expectedLogLoss(pMkt, pMod);

  const kl = klDivergence(pMod, pUser);
  const brierExcess = expBUser - expBMod;

  const tbody = document.getElementById('sandbox-score-body');
  tbody.innerHTML = `
    <tr>
      <td>If YES: Brier Score</td>
      <td class="num">${brierYes(pUser).toFixed(3)}</td>
      <td class="num cyan">${brierYes(pMod).toFixed(3)}</td>
      <td class="num">${brierYes(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If NO: Brier Score</td>
      <td class="num">${brierNo(pUser).toFixed(3)}</td>
      <td class="num cyan">${brierNo(pMod).toFixed(3)}</td>
      <td class="num">${brierNo(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If YES: Log-Loss (nats)</td>
      <td class="num">${logLossYes(pUser).toFixed(3)}</td>
      <td class="num cyan">${logLossYes(pMod).toFixed(3)}</td>
      <td class="num">${logLossYes(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If NO: Log-Loss (nats)</td>
      <td class="num">${logLossNo(pUser).toFixed(3)}</td>
      <td class="num cyan">${logLossNo(pMod).toFixed(3)}</td>
      <td class="num">${logLossNo(pMkt).toFixed(3)}</td>
    </tr>
    <tr style="background:var(--surface-2);font-weight:600">
      <td style="color:var(--text)">Expected Brier (under Model p*)</td>
      <td class="num">${expBUser.toFixed(4)}</td>
      <td class="num cyan">${expBMod.toFixed(4)}</td>
      <td class="num">${expBMkt.toFixed(4)}</td>
    </tr>
    <tr style="background:var(--surface-2);font-weight:600">
      <td style="color:var(--text)">Expected Log-Loss (under Model p*)</td>
      <td class="num">${expLLUser.toFixed(4)}</td>
      <td class="num cyan">${expLLMod.toFixed(4)}</td>
      <td class="num">${expLLMkt.toFixed(4)}</td>
    </tr>
  `;

  document.getElementById('sb-exp-brier').textContent = expBUser.toFixed(4);
  document.getElementById('sb-exp-brier-diff').textContent =
    brierExcess < 0.0005
      ? 'Optimal: matches calibrated expectation'
      : `+${brierExcess.toFixed(4)} excess Brier penalty vs. Model`;
  document.getElementById('sb-kl-div').textContent = `${kl.toFixed(4)} nats`;

  const verdict = document.getElementById('sandbox-verdict');
  const dist = Math.abs(pUser - pMod);
  if (kl < 0.01) {
    verdict.className = 'verdict-banner good';
    verdict.textContent = `Well-calibrated regime: your estimate (${fmtPct(pUser, 0)}) stays within ${(dist * 100).toFixed(1)} pp of the calibrated expectation, minimizing expected Brier and Log-Loss.`;
  } else if (kl < 0.12) {
    verdict.className = 'verdict-banner warn';
    verdict.textContent = `Moderate divergence (${(dist * 100).toFixed(1)} pp from Model p*): you incur +${kl.toFixed(3)} nats of expected Log-Loss penalty unless you hold private falsifying evidence.`;
  } else {
    verdict.className = 'verdict-banner danger';
    verdict.textContent = `Severe overconfidence penalty: at ${fmtPct(pUser, 0)}, a single contrary outcome triggers a steep Log-Loss cliff (${Math.max(logLossYes(pUser), logLossNo(pUser)).toFixed(2)} nats) and +${kl.toFixed(3)} nats of expected KL loss.`;
  }

  renderSandboxSvg(pUser, pMod, pMkt);
}

function renderSandboxSvg(pUser, pMod, pMkt) {
  const svg = document.getElementById('sandbox-svg');
  const W = 560;
  const H = 320;
  const pad = { top: 22, right: 24, bottom: 44, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxY = 3.5;
  const x = (p) => pad.left + p * plotW;
  const y = (loss) => pad.top + (1 - Math.min(loss, maxY) / maxY) * plotH;

  let parts = [];

  // Gridlines
  [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].forEach((val) => {
    const gy = y(val);
    parts.push(`<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="#1c2432" stroke-width="1" />`);
    parts.push(`<text x="${pad.left - 8}" y="${gy + 4}" text-anchor="end" fill="#7c8aa0" font-family="JetBrains Mono" font-size="11">${val.toFixed(1)}</text>`);
  });

  [0, 0.25, 0.5, 0.75, 1.0].forEach((t) => {
    const gx = x(t);
    parts.push(`<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="#1c2432" stroke-width="1" />`);
    parts.push(`<text x="${gx}" y="${H - pad.bottom + 16}" text-anchor="middle" fill="#7c8aa0" font-family="JetBrains Mono" font-size="11">${Math.round(t * 100)}%</text>`);
  });

  parts.push(`<text x="${pad.left + plotW / 2}" y="${H - 10}" text-anchor="middle" fill="#93a0b4" font-family="Inter" font-size="12">Forecast Probability</text>`);
  parts.push(`<text x="14" y="${pad.top + plotH / 2}" text-anchor="middle" fill="#93a0b4" font-family="Inter" font-size="12" transform="rotate(-90 14 ${pad.top + plotH / 2})">Log-Loss (nats)</text>`);

  // Curves: Loss if YES, Loss if NO, Expected Loss under Model p*
  const yesPts = [];
  const noPts = [];
  const expPts = [];
  for (let i = 2; i <= 98; i += 2) {
    const p = i / 100;
    yesPts.push(`${x(p).toFixed(1)},${y(logLossYes(p)).toFixed(1)}`);
    noPts.push(`${x(p).toFixed(1)},${y(logLossNo(p)).toFixed(1)}`);
    expPts.push(`${x(p).toFixed(1)},${y(expectedLogLoss(p, pMod)).toFixed(1)}`);
  }

  parts.push(`<polyline points="${yesPts.join(' ')}" fill="none" stroke="#45c486" stroke-width="1.5" opacity="0.55" stroke-dasharray="4 3" />`);
  parts.push(`<polyline points="${noPts.join(' ')}" fill="none" stroke="#e56b6f" stroke-width="1.5" opacity="0.55" stroke-dasharray="4 3" />`);
  parts.push(`<polyline points="${expPts.join(' ')}" fill="none" stroke="#58c4dc" stroke-width="2.4" />`);

  // Labels for YES / NO cliffs
  parts.push(`<text x="${x(0.11)}" y="${pad.top + 16}" fill="#45c486" font-family="JetBrains Mono" font-size="9.5">LOSS IF YES</text>`);
  parts.push(`<text x="${x(0.89)}" y="${pad.top + 16}" text-anchor="end" fill="#e56b6f" font-family="JetBrains Mono" font-size="9.5">LOSS IF NO</text>`);

  // Model minimum marker
  const modExp = expectedLogLoss(pMod, pMod);
  parts.push(`<line x1="${x(pMod).toFixed(1)}" y1="${pad.top}" x2="${x(pMod).toFixed(1)}" y2="${H - pad.bottom}" stroke="#58c4dc" stroke-width="1" stroke-dasharray="2 3" opacity="0.6" />`);
  parts.push(`<circle cx="${x(pMod).toFixed(1)}" cy="${y(modExp).toFixed(1)}" r="4.5" fill="#58c4dc" stroke="#0a0c10" stroke-width="1.5" />`);

  // Market marker
  const mktExp = expectedLogLoss(pMkt, pMod);
  parts.push(`<circle cx="${x(pMkt).toFixed(1)}" cy="${y(mktExp).toFixed(1)}" r="4" fill="#93a0b4" stroke="#0a0c10" stroke-width="1.5" />`);

  // User marker
  const userExp = expectedLogLoss(pUser, pMod);
  parts.push(`<line x1="${x(pUser).toFixed(1)}" y1="${y(userExp).toFixed(1)}" x2="${x(pUser).toFixed(1)}" y2="${H - pad.bottom}" stroke="#e2a856" stroke-width="1.4" />`);
  parts.push(`<circle cx="${x(pUser).toFixed(1)}" cy="${y(userExp).toFixed(1)}" r="6" fill="#e2a856" stroke="#0a0c10" stroke-width="2" />`);
  parts.push(`<text x="${Math.min(W - pad.right - 28, Math.max(pad.left + 28, x(pUser)))}" y="${Math.max(pad.top + 28, y(userExp) - 10)}" text-anchor="middle" fill="#e2a856" font-family="JetBrains Mono" font-size="10.5" font-weight="600">YOU (${Math.round(pUser * 100)}%)</text>`);

  svg.innerHTML = parts.join('');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setDomain(domain) {
  state.domain = domain;
  document.querySelectorAll('.domain-btn').forEach((btn) => {
    const active = btn.dataset.domain === domain;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  renderMasthead();
  renderScoreboard();
  renderDomainBreakdown();
  renderCalibrationCurve();
  renderMarketsTable();
}

function bindEvents() {
  document.querySelectorAll('.domain-btn').forEach((btn) => {
    btn.addEventListener('click', () => setDomain(btn.dataset.domain));
  });

  document.getElementById('toggle-market-curve').addEventListener('change', (e) => {
    state.showMarketCurve = e.target.checked;
    renderCalibrationCurve();
  });

  document.getElementById('toggle-tail-zones').addEventListener('change', (e) => {
    state.showTailZones = e.target.checked;
    renderCalibrationCurve();
  });

  document.getElementById('market-search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderMarketsTable();
  });

  document.getElementById('market-sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderMarketsTable();
  });

  document.getElementById('btn-load-sandbox').addEventListener('click', () => {
    const m = state.data.markets.find((x) => x.id === state.selectedMarketId);
    if (!m) return;
    state.sandboxMarketId = m.id;
    state.sandboxProb = m.marketProb;
    document.getElementById('sandbox-market-select').value = m.id;
    syncSandboxInputs();
    renderSandbox();
    document.getElementById('sandbox-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('sandbox-market-select').addEventListener('change', (e) => {
    state.sandboxMarketId = e.target.value;
    const m = state.data.markets.find((x) => x.id === state.sandboxMarketId);
    if (m) {
      state.sandboxProb = m.marketProb;
      syncSandboxInputs();
      renderSandbox();
    }
  });

  document.getElementById('sandbox-slider').addEventListener('input', (e) => {
    state.sandboxProb = Number(e.target.value) / 100;
    document.getElementById('sandbox-number').value = e.target.value;
    renderSandbox();
  });

  document.getElementById('sandbox-number').addEventListener('input', (e) => {
    const val = Math.max(1, Math.min(99, Number(e.target.value) || 50));
    state.sandboxProb = val / 100;
    document.getElementById('sandbox-slider').value = String(val);
    renderSandbox();
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = state.data.markets.find((x) => x.id === state.sandboxMarketId);
      if (!m) return;
      const preset = btn.dataset.preset;
      if (preset === 'market') state.sandboxProb = m.marketProb;
      else if (preset === 'model') state.sandboxProb = m.modelProb;
      else state.sandboxProb = Number(preset) / 100;
      syncSandboxInputs();
      renderSandbox();
    });
  });
}

async function init() {
  try {
    const resp = await fetch('./data/markets.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.data = await resp.json();
    state.selectedMarketId = state.data.markets[0]?.id || null;
    state.sandboxMarketId = state.data.markets[0]?.id || null;
    state.sandboxProb = state.data.markets[0]?.marketProb ?? 0.5;

    bindEvents();
    renderMasthead();
    renderScoreboard();
    renderDomainBreakdown();
    renderCalibrationCurve();
    renderMarketsTable();
    populateSandboxSelect();
    syncSandboxInputs();
    renderSandbox();
  } catch (err) {
    document.getElementById('feed-status').textContent = 'DATA LOAD ERROR';
    console.error('Failed to load markets.json:', err);
  }
}

init();
