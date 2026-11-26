const DOMAINS = ['AI', 'Energy', 'Biotech', 'Macro'];
const DEFAULT_K = 1.15;
const K_MIN = 0.5;
const K_MAX = 2.0;

const state = {
  data: null,
  view: 'lab',
  domain: 'ALL',
  k: DEFAULT_K,
  search: '',
  sort: 'edge',
  selectedMarketId: null,
  sandboxMarketId: null,
  sandboxProb: 0.5,
  showMarketCurve: true,
  showTailZones: true,
};

function clampProb(p, lo = 0.01, hi = 0.99) {
  return Math.max(lo, Math.min(hi, p));
}

function logit(p) {
  const c = clampProb(p, 0.005, 0.995);
  return Math.log(c / (1 - c));
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function applyRule(pMarket, k = state.k) {
  const c = clampProb(Number(pMarket), 0.01, 0.99);
  return clampProb(sigmoid(k * logit(c)), 0.01, 0.99);
}

function fmtPct(p, digits = 1) {
  if (p === null || p === undefined || Number.isNaN(p)) return '--';
  return `${(p * 100).toFixed(digits)}%`;
}

function fmtSignedPP(delta) {
  const pp = (delta * 100).toFixed(1);
  return delta >= 0 ? `+${pp} pp` : `${pp} pp`;
}

function fmtSignedPct(val, digits = 1) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}%`;
}

function fmtSignedDelta(val, digits = 4) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}`;
}

function fmtCompact(n) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
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

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* =========================================================================
   Client-side Backtest Engine over Committed Resolved Manifold JSON
   ========================================================================= */

function getExactDomainBacktest(domainKey) {
  const { backtest } = state.data;
  if (domainKey === 'ALL') {
    return {
      ...backtest.overall,
      resolvedCount: backtest.resolvedCount,
      label: 'All Domains',
    };
  }
  return {
    ...backtest.byDomain[domainKey],
    label: domainKey,
  };
}

function getResolvedBinAtoms(domainKey) {
  const keys = domainKey === 'ALL' ? DOMAINS : [domainKey];
  const atoms = [];
  for (const dk of keys) {
    const domData = state.data.backtest.byDomain[dk];
    if (!domData || !domData.calibrationBins) continue;
    for (const bin of domData.calibrationBins) {
      if (!bin.marketN || bin.marketEmpirical === null || bin.marketEmpirical === undefined) continue;
      const n = bin.marketN;
      const yes = Math.round(bin.marketEmpirical * n);
      const no = n - yes;
      const pMkt = clampProb(bin.marketPredicted, 0.01, 0.99);
      atoms.push({
        domain: dk,
        pMkt,
        n,
        yes,
        no,
        isTailMkt: pMkt < 0.15 || pMkt > 0.85,
      });
    }
  }
  return atoms;
}

function rawStatsAtK(atoms, k) {
  let n = 0;
  let brierSum = 0;
  let llSum = 0;
  let tailBrierSum = 0;
  let tailMktN = 0;
  let tailPredN = 0;
  let tailPredCorrect = 0;

  for (const a of atoms) {
    const p = Math.abs(k - 1.0) < 1e-6 ? a.pMkt : applyRule(a.pMkt, k);
    n += a.n;
    const b = a.yes * (p - 1) ** 2 + a.no * p ** 2;
    const ll = a.yes * -Math.log(p) + a.no * -Math.log(1 - p);
    brierSum += b;
    llSum += ll;

    if (a.isTailMkt) {
      tailBrierSum += b;
      tailMktN += a.n;
    }
    if (p < 0.15 || p > 0.85) {
      tailPredN += a.n;
      tailPredCorrect += p < 0.5 ? a.no : a.yes;
    }
  }

  return {
    n,
    brier: n > 0 ? brierSum / n : 0,
    logLoss: n > 0 ? llSum / n : 0,
    tailBrier: tailMktN > 0 ? tailBrierSum / tailMktN : null,
    tailAccPct: tailPredN > 0 ? (tailPredCorrect / tailPredN) * 100 : null,
    tailPredN,
  };
}

function computeCalibrationBinsAtK(atoms, exact, k) {
  // At exact pre-registered k = 1.15, return committed exact bins
  if (Math.abs(k - DEFAULT_K) < 1e-4) {
    return exact.calibrationBins || [];
  }

  const mktMap = new Map();
  for (const b of exact.calibrationBins || []) {
    mktMap.set(b.bin, b);
  }

  const buckets = Array.from({ length: 10 }, (_, i) => ({
    bin: `${i * 10}-${(i + 1) * 10}%`,
    n: 0,
    predSum: 0,
    yesSum: 0,
    isTail: i === 0 || i === 9,
  }));

  for (const a of atoms) {
    const p = Math.abs(k - 1.0) < 1e-6 ? a.pMkt : applyRule(a.pMkt, k);
    const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
    buckets[idx].n += a.n;
    buckets[idx].predSum += p * a.n;
    buckets[idx].yesSum += a.yes;
  }

  const result = [];
  for (let i = 0; i < 10; i++) {
    const b = buckets[i];
    const mkt = mktMap.get(b.bin);
    const mktN = mkt ? mkt.marketN : 0;
    if (b.n === 0 && mktN === 0) continue;
    result.push({
      bin: b.bin,
      predicted: b.n > 0 ? b.predSum / b.n : (i + 0.5) / 10,
      empirical: b.n > 0 ? b.yesSum / b.n : null,
      marketPredicted: mkt ? mkt.marketPredicted : (i + 0.5) / 10,
      marketEmpirical: mkt ? mkt.marketEmpirical : null,
      n: b.n,
      marketN: mktN,
      isTail: b.isTail,
    });
  }
  return result;
}

function evaluateBacktestAtK(domainKey, k) {
  const exact = getExactDomainBacktest(domainKey);
  const atoms = getResolvedBinAtoms(domainKey);
  const rawAt1 = rawStatsAtK(atoms, 1.0);
  const rawAtK = rawStatsAtK(atoms, k);

  // Within-bin variance offset (exact crowd score minus bin-centroid crowd score)
  const brierOffset = exact.marketBrierScore - rawAt1.brier;
  const llOffset = exact.marketLogLoss - rawAt1.logLoss;
  const tailOffset =
    exact.marketTailBrierScore !== null && rawAt1.tailBrier !== null
      ? exact.marketTailBrierScore - rawAt1.tailBrier
      : 0;

  let brierScore;
  let logLoss;
  let tailBrierScore;

  if (Math.abs(k - DEFAULT_K) < 1e-4) {
    brierScore = exact.brierScore;
    logLoss = exact.logLoss;
    tailBrierScore = exact.tailBrierScore;
  } else if (Math.abs(k - 1.0) < 1e-4) {
    brierScore = exact.marketBrierScore;
    logLoss = exact.marketLogLoss;
    tailBrierScore = exact.marketTailBrierScore;
  } else {
    brierScore = Math.max(0.0001, rawAtK.brier + brierOffset);
    logLoss = Math.max(0.0001, rawAtK.logLoss + llOffset);
    tailBrierScore =
      rawAtK.tailBrier !== null ? Math.max(0.0001, rawAtK.tailBrier + tailOffset) : null;
  }

  const brierSkillPct =
    exact.marketBrierScore > 0 ? (1 - brierScore / exact.marketBrierScore) * 100 : 0;

  return {
    label: exact.label,
    resolvedCount: exact.resolvedCount,
    brierScore,
    marketBrierScore: exact.marketBrierScore,
    logLoss,
    marketLogLoss: exact.marketLogLoss,
    brierSkillPct,
    tailBrierScore,
    marketTailBrierScore: exact.marketTailBrierScore,
    tailEventCount: exact.tailEventCount,
    tailAccPct: rawAtK.tailAccPct,
    tailPredN: rawAtK.tailPredN,
    calibrationBins: computeCalibrationBinsAtK(atoms, exact, k),
  };
}

function computeKSweep(domainKey) {
  const points = [];
  let best = null;
  for (let step = 50; step <= 200; step += 2) {
    const kVal = step / 100;
    const ev = evaluateBacktestAtK(domainKey, kVal);
    const pt = { k: kVal, brier: ev.brierScore, logLoss: ev.logLoss, skill: ev.brierSkillPct };
    points.push(pt);
    if (!best || pt.brier < best.brier) {
      best = pt;
    }
  }
  return { points, best };
}

/* =========================================================================
   Live Market Computation with Current k
   ========================================================================= */

function withLiveK(m) {
  const modelProb =
    Math.abs(state.k - DEFAULT_K) < 1e-4 ? m.modelProb : applyRule(m.marketProb, state.k);
  const edge = modelProb - m.marketProb;
  const tailEvent =
    m.marketProb < 0.15 || m.marketProb > 0.85 || modelProb < 0.15 || modelProb > 0.85;
  return { ...m, modelProb, edge, tailEvent };
}

function getFilteredMarkets() {
  const term = state.search.trim().toLowerCase();
  let list = state.data.markets
    .map(withLiveK)
    .filter((m) => {
      if (state.domain !== 'ALL' && m.domain !== state.domain) return false;
      if (
        term &&
        !m.question.toLowerCase().includes(term) &&
        !m.domain.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });

  if (state.sort === 'edge') {
    list.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  } else if (state.sort === 'liquidity') {
    list.sort((a, b) => b.liquidity - a.liquidity);
  } else if (state.sort === 'tail') {
    list.sort(
      (a, b) => Number(b.tailEvent) - Number(a.tailEvent) || Math.abs(b.edge) - Math.abs(a.edge)
    );
  } else if (state.sort === 'marketProb') {
    list.sort((a, b) => b.marketProb - a.marketProb);
  }
  return list;
}

/* =========================================================================
   Renderers
   ========================================================================= */

function renderMasthead() {
  const { meta, forwardLedger } = state.data;
  const feedEl = document.getElementById('feed-status');
  if (meta.dataMode === 'live') {
    feedEl.textContent = `${state.data.backtest.resolvedCount} resolved · ${meta.liveMarketsCount} live`;
    feedEl.classList.remove('fallback');
  } else {
    feedEl.textContent = 'Offline snapshot';
    feedEl.classList.add('fallback');
  }

  document.getElementById('tab-live-count').textContent = String(meta.liveMarketsCount);

  const syncTs = state.data.updated_at || meta.updated_at || meta.generatedAt || '--';
  const formattedTs = syncTs === '--' ? '--' : `${syncTs.replace('T', ' ').replace('Z', '')} UTC`;

  const syncTextEl = document.getElementById('market-sync-text');
  if (syncTextEl) syncTextEl.textContent = `Synced ${formattedTs}`;

  const ledgerEl = document.getElementById('forward-ledger-text');
  if (ledgerEl && forwardLedger) {
    ledgerEl.textContent = `Forward ledger: ${forwardLedger.summary} (${forwardLedger.openCount} open)`;
  }

  const visible = (
    state.domain === 'ALL'
      ? state.data.markets
      : state.data.markets.filter((m) => m.domain === state.domain)
  ).map(withLiveK);
  const liq = visible.reduce((acc, m) => acc + m.liquidity, 0);
  const tails = visible.filter((m) => m.tailEvent).length;

  document.getElementById('stat-active-count').textContent = String(visible.length);
  document.getElementById('stat-liquidity').textContent = fmtCompact(liq);
  document.getElementById('stat-tail-count').textContent = String(tails);
}

function setDeltaClass(el, diff, lowerIsBetter = true) {
  el.classList.remove('positive', 'negative', 'neutral');
  if (diff === null || diff === undefined || Math.abs(diff) < 1e-6) {
    el.classList.add('neutral');
    return;
  }
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  el.classList.add(good ? 'positive' : 'negative');
}

function renderKControls(sweep) {
  const kStr = state.k.toFixed(2);
  document.getElementById('k-slider').value = kStr;
  document.getElementById('k-readout').textContent = `k = ${kStr}`;
  document.getElementById('formula-k').textContent = kStr;
  document.getElementById('legend-k').textContent = `k=${kStr}`;

  const marketsKBadge = document.getElementById('markets-k-badge');
  if (marketsKBadge) marketsKBadge.textContent = `k = ${kStr}`;

  const regimeEl = document.getElementById('k-regime-tag');
  regimeEl.classList.remove('shrink', 'crowd');
  if (Math.abs(state.k - 1.0) < 0.005) {
    regimeEl.textContent = 'Crowd Baseline';
    regimeEl.classList.add('crowd');
  } else if (state.k < 1.0) {
    regimeEl.textContent = 'Shrinkage';
    regimeEl.classList.add('shrink');
  } else {
    regimeEl.textContent = 'Extremization';
  }

  const optBtn = document.getElementById('btn-k-optimal');
  if (optBtn && sweep?.best) {
    optBtn.textContent = `Best k* (${sweep.best.k.toFixed(2)})`;
    optBtn.dataset.kVal = sweep.best.k.toFixed(2);
  }

  document.querySelectorAll('.k-presets .chip-btn').forEach((btn) => {
    const target = btn.dataset.k === 'optimal' ? Number(btn.dataset.kVal) : Number(btn.dataset.k);
    btn.classList.toggle('active', Math.abs(state.k - target) < 0.005);
  });
}

function renderScoreboard(ev, sweep) {
  const { backtest } = state.data;

  document.getElementById('scoreboard-context').textContent =
    `${ev.label} · n = ${ev.resolvedCount} resolved Manifold markets (${backtest.window}), priced T−${backtest.horizonDays}d.`;

  const brierDiff = ev.brierScore - ev.marketBrierScore;
  const logDiff = ev.logLoss - ev.marketLogLoss;
  const tailDiff =
    ev.tailBrierScore !== null && ev.marketTailBrierScore !== null
      ? ev.tailBrierScore - ev.marketTailBrierScore
      : null;

  document.getElementById('kpi-brier').textContent = ev.brierScore.toFixed(4);
  const brierDeltaEl = document.getElementById('kpi-brier-delta');
  brierDeltaEl.textContent = `${fmtSignedDelta(brierDiff, 4)}`;
  setDeltaClass(brierDeltaEl, brierDiff, true);
  document.getElementById('kpi-brier-mkt').textContent = ev.marketBrierScore.toFixed(4);

  document.getElementById('kpi-logloss').textContent = ev.logLoss.toFixed(4);
  const logDeltaEl = document.getElementById('kpi-logloss-delta');
  logDeltaEl.textContent = `${fmtSignedDelta(logDiff, 4)}`;
  setDeltaClass(logDeltaEl, logDiff, true);
  document.getElementById('kpi-logloss-mkt').textContent = ev.marketLogLoss.toFixed(4);

  const edgeValEl = document.getElementById('kpi-edge');
  edgeValEl.textContent = fmtSignedPct(ev.brierSkillPct, 2);
  edgeValEl.className = `kpi-value ${ev.brierSkillPct > 0.005 ? 'good' : ev.brierSkillPct < -0.005 ? 'bad' : ''}`;
  document.getElementById('kpi-edge-active').textContent = `n = ${ev.resolvedCount}`;
  document.getElementById('kpi-opt-k').textContent = sweep?.best
    ? `k* = ${sweep.best.k.toFixed(2)} (${fmtSignedPct(sweep.best.skill, 1)})`
    : '--';

  document.getElementById('kpi-tail-acc').textContent =
    ev.tailAccPct !== null ? `${ev.tailAccPct.toFixed(1)}%` : '--';
  document.getElementById('kpi-tail').textContent =
    ev.tailBrierScore !== null ? ev.tailBrierScore.toFixed(4) : '--';
  const tailDeltaEl = document.getElementById('kpi-tail-delta');
  tailDeltaEl.textContent = tailDiff !== null ? fmtSignedDelta(tailDiff, 4) : 'n/a';
  setDeltaClass(tailDeltaEl, tailDiff, true);
  document.getElementById('kpi-tail-mkt').textContent =
    ev.marketTailBrierScore !== null ? ev.marketTailBrierScore.toFixed(4) : '--';
  document.getElementById('kpi-tail-n').textContent = String(ev.tailEventCount);
}

function renderCalibrationCurve(ev) {
  const svg = document.getElementById('calibration-svg');
  const bins = ev.calibrationBins || [];

  const W = 640;
  const H = 390;
  const pad = { top: 22, right: 24, bottom: 50, left: 54 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const x = (p) => pad.left + p * plotW;
  const y = (p) => pad.top + (1 - p) * plotH;

  const parts = [];

  if (state.showTailZones) {
    parts.push(`
      <rect x="${x(0)}" y="${pad.top}" width="${x(0.15) - x(0)}" height="${plotH}" fill="rgba(180,83,9,0.07)" />
      <rect x="${x(0.85)}" y="${pad.top}" width="${x(1.0) - x(0.85)}" height="${plotH}" fill="rgba(180,83,9,0.07)" />
      <text x="${x(0.075)}" y="${pad.top + 15}" text-anchor="middle" fill="#b45309" font-family="JetBrains Mono" font-size="11">TAIL &lt;15%</text>
      <text x="${x(0.925)}" y="${pad.top + 15}" text-anchor="middle" fill="#b45309" font-family="JetBrains Mono" font-size="11">TAIL &gt;85%</text>
    `);
  }

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  ticks.forEach((t) => {
    const gx = x(t);
    const gy = y(t);
    parts.push(`<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<text x="${gx}" y="${H - pad.bottom + 18}" text-anchor="middle" fill="#555555" font-family="JetBrains Mono" font-size="12">${Math.round(t * 100)}%</text>`);
    parts.push(`<text x="${pad.left - 10}" y="${gy + 4}" text-anchor="end" fill="#555555" font-family="JetBrains Mono" font-size="12">${Math.round(t * 100)}%</text>`);
  });

  parts.push(`<rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#d4d4d0" stroke-width="1" />`);
  parts.push(`<text x="${pad.left + plotW / 2}" y="${H - 10}" text-anchor="middle" fill="#555555" font-family="Inter" font-size="12.5">Predicted Probability</text>`);
  parts.push(`<text x="16" y="${pad.top + plotH / 2}" text-anchor="middle" fill="#555555" font-family="Inter" font-size="12.5" transform="rotate(-90 16 ${pad.top + plotH / 2})">Empirical Frequency</text>`);

  // Perfect calibration diagonal
  parts.push(`<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#a3a39e" stroke-width="1.4" stroke-dasharray="4 4" />`);

  // Market baseline polyline
  const validMktBins = bins.filter((d) => d.marketEmpirical !== null && d.marketEmpirical !== undefined && d.marketN > 0);
  if (state.showMarketCurve && validMktBins.length) {
    const mktPts = validMktBins.map((d) => `${x(d.marketPredicted).toFixed(1)},${y(d.marketEmpirical).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${mktPts}" fill="none" stroke="#737370" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85" />`);
    validMktBins.forEach((d) => {
      parts.push(`<circle cx="${x(d.marketPredicted).toFixed(1)}" cy="${y(d.marketEmpirical).toFixed(1)}" r="3.2" fill="#737370" opacity="0.75" />`);
    });
  }

  // Rule calibration polyline
  const validModBins = bins.filter((d) => d.empirical !== null && d.empirical !== undefined && d.n > 0);
  if (validModBins.length) {
    const modPts = validModBins.map((d) => `${x(d.predicted).toFixed(1)},${y(d.empirical).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${modPts}" fill="none" stroke="#1d4ed8" stroke-width="2.5" />`);
  }

  // Interactive model bubbles
  bins.forEach((d, idx) => {
    if (d.empirical === null || d.empirical === undefined || d.n <= 0) return;
    const cx = x(d.predicted).toFixed(1);
    const cy = y(d.empirical).toFixed(1);
    const r = Math.max(4.5, Math.min(9, 3.8 + Math.sqrt(d.n) * 0.6));
    const fill = d.isTail ? '#b45309' : '#1d4ed8';
    parts.push(`
      <g class="cal-point" data-bin-index="${idx}" tabindex="0" style="cursor:pointer">
        <circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="transparent" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#ffffff" stroke-width="2" />
      </g>
    `);
  });

  svg.innerHTML = parts.join('');

  const inspector = document.getElementById('bin-inspector');
  const showBin = (d) => {
    const err = d.empirical !== null ? ((d.empirical - d.predicted) * 100).toFixed(1) : null;
    const mktErr =
      d.marketEmpirical !== null ? ((d.marketEmpirical - d.marketPredicted) * 100).toFixed(1) : null;
    inspector.innerHTML = `
      <span>Bin <strong>${d.bin}</strong> ${d.isTail ? '<span class="ochre">[Tail]</span>' : ''}</span>
      <span>Rule Pred <strong>${fmtPct(d.predicted)}</strong></span>
      <span>Rule Emp <strong class="accent">${fmtPct(d.empirical)}</strong>${err !== null ? ` (${Number(err) >= 0 ? '+' : ''}${err} pp)` : ''}</span>
      <span>Crowd Emp <strong>${fmtPct(d.marketEmpirical)}</strong>${mktErr !== null ? ` (${Number(mktErr) >= 0 ? '+' : ''}${mktErr} pp)` : ''}</span>
      <span>n = <strong>${d.n}</strong></span>
    `;
  };

  svg.querySelectorAll('.cal-point').forEach((g) => {
    const idx = Number(g.dataset.binIndex);
    g.addEventListener('mouseenter', () => showBin(bins[idx]));
    g.addEventListener('focus', () => showBin(bins[idx]));
    g.addEventListener('click', () => showBin(bins[idx]));
  });
}

function renderSweepChart(sweep, currentEv) {
  const svg = document.getElementById('sweep-svg');
  const { points, best } = sweep;
  if (!points.length) return;

  const W = 460;
  const H = 210;
  const pad = { top: 18, right: 44, bottom: 34, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const briers = points.map((p) => p.brier);
  const bMin = Math.min(...briers) * 0.94;
  const bMax = Math.max(...briers) * 1.04;
  const bSpan = Math.max(0.002, bMax - bMin);

  const lls = points.map((p) => p.logLoss);
  const lMin = Math.min(...lls) * 0.94;
  const lMax = Math.max(...lls) * 1.04;
  const lSpan = Math.max(0.005, lMax - lMin);

  const x = (kVal) => pad.left + ((kVal - K_MIN) / (K_MAX - K_MIN)) * plotW;
  const yB = (val) => pad.top + (1 - (val - bMin) / bSpan) * plotH;
  const yL = (val) => pad.top + (1 - (val - lMin) / lSpan) * plotH;

  const parts = [];

  // Grid & axes
  [0, 0.5, 1].forEach((f) => {
    const gy = pad.top + (1 - f) * plotH;
    const bTick = bMin + f * bSpan;
    const lTick = lMin + f * lSpan;
    parts.push(`<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<text x="${pad.left - 6}" y="${gy + 4}" text-anchor="end" fill="#1d4ed8" font-family="JetBrains Mono" font-size="10.5">${bTick.toFixed(3)}</text>`);
    parts.push(`<text x="${W - pad.right + 6}" y="${gy + 4}" text-anchor="start" fill="#64748b" font-family="JetBrains Mono" font-size="10.5">${lTick.toFixed(2)}</text>`);
  });

  [0.5, 1.0, 1.5, 2.0].forEach((kv) => {
    const gx = x(kv);
    parts.push(`<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<text x="${gx}" y="${H - pad.bottom + 15}" text-anchor="middle" fill="#555555" font-family="JetBrains Mono" font-size="11">${kv.toFixed(1)}</text>`);
  });

  parts.push(`<rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#d4d4d0" stroke-width="1" />`);
  parts.push(`<text x="${pad.left + plotW / 2}" y="${H - 4}" text-anchor="middle" fill="#555555" font-family="Inter" font-size="11.5">Calibration Parameter k</text>`);

  // Crowd k=1.0 reference line
  const x1 = x(1.0);
  parts.push(`<line x1="${x1}" y1="${pad.top}" x2="${x1}" y2="${H - pad.bottom}" stroke="#a3a39e" stroke-width="1.2" stroke-dasharray="3 3" />`);
  parts.push(`<text x="${x1 + 3}" y="${pad.top + 11}" fill="#737370" font-family="JetBrains Mono" font-size="10">k=1</text>`);

  // Curves
  const bPts = points.map((p) => `${x(p.k).toFixed(1)},${yB(p.brier).toFixed(1)}`).join(' ');
  const lPts = points.map((p) => `${x(p.k).toFixed(1)},${yL(p.logLoss).toFixed(1)}`).join(' ');
  parts.push(`<polyline points="${lPts}" fill="none" stroke="#64748b" stroke-width="1.7" stroke-dasharray="4 3" />`);
  parts.push(`<polyline points="${bPts}" fill="none" stroke="#1d4ed8" stroke-width="2.3" />`);

  // Optimal k* star dot
  if (best) {
    parts.push(`<circle cx="${x(best.k).toFixed(1)}" cy="${yB(best.brier).toFixed(1)}" r="4" fill="#15803d" stroke="#ffffff" stroke-width="1.5" />`);
  }

  // Active k cursor
  const cx = x(state.k);
  const cy = yB(currentEv.brierScore);
  parts.push(`<line x1="${cx.toFixed(1)}" y1="${pad.top}" x2="${cx.toFixed(1)}" y2="${H - pad.bottom}" stroke="#1d4ed8" stroke-width="1.4" opacity="0.55" />`);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="2" />`);

  svg.innerHTML = parts.join('');
}

function renderDomainBreakdown() {
  const tbody = document.getElementById('domain-breakdown-body');
  const keys = ['ALL', ...DOMAINS];
  const rows = keys.map((key) => ({ key, ...evaluateBacktestAtK(key, state.k) }));

  tbody.innerHTML = rows
    .map((r) => {
      const skillCls = r.brierSkillPct > 0.05 ? 'good' : r.brierSkillPct < -0.05 ? 'bad' : '';
      const tailStr = r.tailBrierScore !== null ? r.tailBrierScore.toFixed(4) : '--';
      return `
      <tr data-domain-row="${r.key}" class="${state.domain === r.key ? 'active-row' : ''}" tabindex="0">
        <td class="domain-row-name" data-label="Domain">${r.label}</td>
        <td class="num" data-label="n">${r.resolvedCount}</td>
        <td class="num" data-label="Brier">${r.brierScore.toFixed(4)}</td>
        <td class="num" data-label="Log-Loss">${r.logLoss.toFixed(4)}</td>
        <td class="num ochre" data-label="Tail Brier">${tailStr}</td>
        <td class="num ${skillCls}" data-label="Skill">${fmtSignedPct(r.brierSkillPct, 1)}</td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const activate = () => setDomain(tr.dataset.domainRow);
    tr.addEventListener('click', activate);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
}

function renderMarketsTable() {
  const tbody = document.getElementById('markets-table-body');
  const list = getFilteredMarkets();

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);padding:24px;">No markets match the current filter.</td></tr>`;
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
          <td class="q-cell" data-label="Contract">
            <a
              class="q-title-link"
              href="${escapeHtml(m.url)}"
              target="_blank"
              rel="noopener noreferrer"
              title="Open market on Manifold Markets"
            >${escapeHtml(m.question)}</a>
            <div class="q-meta">
              <span>Liq ${fmtCompact(m.liquidity)}</span>
              <span>&middot;</span>
              <span>Closes ${m.closeDate}</span>
              ${m.tailEvent ? '<span class="tail-pill">Tail</span>' : ''}
              <a
                class="q-ext-link"
                href="${escapeHtml(m.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >Manifold &rarr;</a>
            </div>
          </td>
          <td class="domain-cell" data-label="Domain"><span class="domain-pill">${m.domain}</span></td>
          <td class="num mono-cell" data-label="Market">${fmtPct(m.marketProb)}</td>
          <td class="num mono-cell" data-label="Dom. YES" style="color:var(--ink-secondary)">${fmtPct(m.domainBaseRate)}</td>
          <td class="num mono-cell accent" data-label="Rule" style="font-weight:600">${fmtPct(m.modelProb)}</td>
          <td class="num mono-cell" data-label="Shift"><span class="edge-badge ${edgeCls}">${fmtSignedPP(m.edge)}</span></td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('a.q-ext-link, a.q-title-link').forEach((link) => {
    link.addEventListener('click', (e) => e.stopPropagation());
  });

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
  const raw = state.data.markets.find((x) => x.id === state.selectedMarketId) || state.data.markets[0];
  if (!raw) return;
  const m = withLiveK(raw);

  document.getElementById('trace-domain-badge').textContent = m.domain;
  document.getElementById('trace-tail-badge').classList.toggle('hidden', !m.tailEvent);
  document.getElementById('trace-question').textContent = m.question;
  document.getElementById('trace-liquidity').textContent = `Liquidity: ${fmtCompact(m.liquidity)}`;
  document.getElementById('trace-traders').textContent = `Traders: ${m.traderCount}`;
  document.getElementById('trace-close').textContent = `Closes: ${m.closeDate}`;
  document.getElementById('trace-link').href = m.url;

  document.getElementById('trace-rule-label').textContent = `Rule (k=${state.k.toFixed(2)})`;
  document.getElementById('trace-base').textContent = fmtPct(m.domainBaseRate);
  document.getElementById('trace-market').textContent = fmtPct(m.marketProb);
  document.getElementById('trace-model').textContent = fmtPct(m.modelProb);

  const edgeEl = document.getElementById('trace-edge');
  edgeEl.textContent = fmtSignedPP(m.edge);
  edgeEl.className = `pb-val ${m.edge >= 0 ? 'good' : 'bad'}`;

  document.getElementById('marker-base').style.left = `${(m.domainBaseRate * 100).toFixed(1)}%`;
  document.getElementById('marker-market').style.left = `${(m.marketProb * 100).toFixed(1)}%`;
  document.getElementById('marker-model').style.left = `${(m.modelProb * 100).toFixed(1)}%`;

  const loMkt = logit(m.marketProb);
  const loMod = state.k * loMkt;
  const dir = m.edge >= 0 ? 'above' : 'below';
  document.getElementById('trace-rule-comp').textContent =
    `Market p = ${fmtPct(m.marketProb)} -> logit ${loMkt >= 0 ? '+' : ''}${loMkt.toFixed(3)} x k=${state.k.toFixed(2)} = ${loMod >= 0 ? '+' : ''}${loMod.toFixed(3)} -> sigmoid = ${fmtPct(m.modelProb)} (${Math.abs(m.edge * 100).toFixed(1)} pp ${dir} crowd).`;

  document.getElementById('trace-base-ctx').textContent = m.trace.baseRateContext;
  document.getElementById('trace-template').textContent = m.trace.qualitativeTemplate;
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

  if (!state.sandboxMarketId && state.data.markets.length) {
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
  const raw = state.data.markets.find((x) => x.id === state.sandboxMarketId) || state.data.markets[0];
  if (!raw) return;
  const m = withLiveK(raw);

  const pUser = clampProb(state.sandboxProb);
  const pMkt = clampProb(m.marketProb);
  const pMod = clampProb(m.modelProb);

  document.getElementById('sb-rule-label').textContent = `Rule (k=${state.k.toFixed(2)})`;
  document.getElementById('sb-mkt-prob').textContent = fmtPct(pMkt);
  document.getElementById('sb-mod-prob').textContent = fmtPct(pMod);
  document.getElementById('sb-base-prob').textContent = fmtPct(m.domainBaseRate);

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
      <td>If YES: Brier</td>
      <td class="num">${brierYes(pUser).toFixed(3)}</td>
      <td class="num accent">${brierYes(pMod).toFixed(3)}</td>
      <td class="num">${brierYes(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If NO: Brier</td>
      <td class="num">${brierNo(pUser).toFixed(3)}</td>
      <td class="num accent">${brierNo(pMod).toFixed(3)}</td>
      <td class="num">${brierNo(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If YES: Log-Loss</td>
      <td class="num">${logLossYes(pUser).toFixed(3)}</td>
      <td class="num accent">${logLossYes(pMod).toFixed(3)}</td>
      <td class="num">${logLossYes(pMkt).toFixed(3)}</td>
    </tr>
    <tr>
      <td>If NO: Log-Loss</td>
      <td class="num">${logLossNo(pUser).toFixed(3)}</td>
      <td class="num accent">${logLossNo(pMod).toFixed(3)}</td>
      <td class="num">${logLossNo(pMkt).toFixed(3)}</td>
    </tr>
    <tr class="summary-row">
      <td>Expected Brier (p*)</td>
      <td class="num">${expBUser.toFixed(4)}</td>
      <td class="num accent">${expBMod.toFixed(4)}</td>
      <td class="num">${expBMkt.toFixed(4)}</td>
    </tr>
    <tr class="summary-row">
      <td>Expected Log-Loss (p*)</td>
      <td class="num">${expLLUser.toFixed(4)}</td>
      <td class="num accent">${expLLMod.toFixed(4)}</td>
      <td class="num">${expLLMkt.toFixed(4)}</td>
    </tr>
  `;

  document.getElementById('sb-exp-brier').textContent = expBUser.toFixed(4);
  document.getElementById('sb-exp-brier-diff').textContent =
    brierExcess < 0.0005
      ? 'Matches Rule p* expectation'
      : `+${brierExcess.toFixed(4)} excess Brier vs. p*`;
  document.getElementById('sb-kl-div').textContent = `${kl.toFixed(4)} nats`;

  const verdict = document.getElementById('sandbox-verdict');
  const dist = Math.abs(pUser - pMod);
  if (kl < 0.01) {
    verdict.className = 'verdict-banner good';
    verdict.textContent = `Aligned with p*: ${fmtPct(pUser, 0)} sits within ${(dist * 100).toFixed(1)} pp, keeping excess loss near zero.`;
  } else if (kl < 0.12) {
    verdict.className = 'verdict-banner warn';
    verdict.textContent = `Moderate divergence (${(dist * 100).toFixed(1)} pp): +${kl.toFixed(3)} nats expected Log-Loss penalty.`;
  } else {
    verdict.className = 'verdict-banner danger';
    verdict.textContent = `High overconfidence risk: a contrary outcome costs ${Math.max(logLossYes(pUser), logLossNo(pUser)).toFixed(2)} nats (+${kl.toFixed(3)} expected KL).`;
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

  const parts = [];

  [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].forEach((val) => {
    const gy = y(val);
    parts.push(`<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<text x="${pad.left - 8}" y="${gy + 4}" text-anchor="end" fill="#555555" font-family="JetBrains Mono" font-size="11.5">${val.toFixed(1)}</text>`);
  });

  [0, 0.25, 0.5, 0.75, 1.0].forEach((t) => {
    const gx = x(t);
    parts.push(`<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="#ecece9" stroke-width="1" />`);
    parts.push(`<text x="${gx}" y="${H - pad.bottom + 16}" text-anchor="middle" fill="#555555" font-family="JetBrains Mono" font-size="11.5">${Math.round(t * 100)}%</text>`);
  });

  parts.push(`<rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="none" stroke="#d4d4d0" stroke-width="1" />`);
  parts.push(`<text x="${pad.left + plotW / 2}" y="${H - 10}" text-anchor="middle" fill="#555555" font-family="Inter" font-size="12">Forecast Probability</text>`);
  parts.push(`<text x="14" y="${pad.top + plotH / 2}" text-anchor="middle" fill="#555555" font-family="Inter" font-size="12" transform="rotate(-90 14 ${pad.top + plotH / 2})">Log-Loss (nats)</text>`);

  const yesPts = [];
  const noPts = [];
  const expPts = [];
  for (let i = 2; i <= 98; i += 2) {
    const p = i / 100;
    yesPts.push(`${x(p).toFixed(1)},${y(logLossYes(p)).toFixed(1)}`);
    noPts.push(`${x(p).toFixed(1)},${y(logLossNo(p)).toFixed(1)}`);
    expPts.push(`${x(p).toFixed(1)},${y(expectedLogLoss(p, pMod)).toFixed(1)}`);
  }

  parts.push(`<polyline points="${yesPts.join(' ')}" fill="none" stroke="#15803d" stroke-width="1.5" opacity="0.55" stroke-dasharray="4 3" />`);
  parts.push(`<polyline points="${noPts.join(' ')}" fill="none" stroke="#b91c1c" stroke-width="1.5" opacity="0.55" stroke-dasharray="4 3" />`);
  parts.push(`<polyline points="${expPts.join(' ')}" fill="none" stroke="#1d4ed8" stroke-width="2.5" />`);

  parts.push(`<text x="${x(0.11)}" y="${pad.top + 16}" fill="#15803d" font-family="JetBrains Mono" font-size="10.5">LOSS IF YES</text>`);
  parts.push(`<text x="${x(0.89)}" y="${pad.top + 16}" text-anchor="end" fill="#b91c1c" font-family="JetBrains Mono" font-size="10.5">LOSS IF NO</text>`);

  const modExp = expectedLogLoss(pMod, pMod);
  parts.push(`<line x1="${x(pMod).toFixed(1)}" y1="${pad.top}" x2="${x(pMod).toFixed(1)}" y2="${H - pad.bottom}" stroke="#1d4ed8" stroke-width="1" stroke-dasharray="2 3" opacity="0.55" />`);
  parts.push(`<circle cx="${x(pMod).toFixed(1)}" cy="${y(modExp).toFixed(1)}" r="4.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5" />`);

  const mktExp = expectedLogLoss(pMkt, pMod);
  parts.push(`<circle cx="${x(pMkt).toFixed(1)}" cy="${y(mktExp).toFixed(1)}" r="4" fill="#737370" stroke="#ffffff" stroke-width="1.5" />`);

  const userExp = expectedLogLoss(pUser, pMod);
  parts.push(`<line x1="${x(pUser).toFixed(1)}" y1="${y(userExp).toFixed(1)}" x2="${x(pUser).toFixed(1)}" y2="${H - pad.bottom}" stroke="#b45309" stroke-width="1.5" />`);
  parts.push(`<circle cx="${x(pUser).toFixed(1)}" cy="${y(userExp).toFixed(1)}" r="6" fill="#b45309" stroke="#ffffff" stroke-width="2" />`);
  parts.push(`<text x="${Math.min(W - pad.right - 36, Math.max(pad.left + 36, x(pUser)))}" y="${Math.max(pad.top + 28, y(userExp) - 10)}" text-anchor="middle" fill="#b45309" font-family="JetBrains Mono" font-size="11" font-weight="600">YOU (${Math.round(pUser * 100)}%)</text>`);

  svg.innerHTML = parts.join('');
}

/* =========================================================================
   State Controllers & Events
   ========================================================================= */

function renderAll() {
  const ev = evaluateBacktestAtK(state.domain, state.k);
  const sweep = computeKSweep(state.domain);

  renderMasthead();
  renderKControls(sweep);
  renderScoreboard(ev, sweep);
  renderCalibrationCurve(ev);
  renderSweepChart(sweep, ev);
  renderDomainBreakdown();
  renderMarketsTable();
  renderSandbox();
}

function setView(viewName) {
  state.view = viewName;
  document.querySelectorAll('.view-tab').forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.view-panel').forEach((sec) => {
    sec.classList.toggle('hidden', sec.id !== `view-${viewName}`);
  });
}

function setDomain(domain) {
  state.domain = domain;
  document.querySelectorAll('.domain-btn').forEach((btn) => {
    const active = btn.dataset.domain === domain;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderAll();
}

function setK(val) {
  state.k = Math.max(K_MIN, Math.min(K_MAX, Math.round(val * 100) / 100));
  renderAll();
}

function bindEvents() {
  document.querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.querySelectorAll('.domain-btn').forEach((btn) => {
    btn.addEventListener('click', () => setDomain(btn.dataset.domain));
  });

  document.getElementById('k-slider').addEventListener('input', (e) => {
    setK(Number(e.target.value));
  });

  document.querySelectorAll('.k-presets .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.k === 'optimal') {
        const val = Number(btn.dataset.kVal);
        if (!Number.isNaN(val)) setK(val);
      } else {
        setK(Number(btn.dataset.k));
      }
    });
  });

  // Allow clicking directly on the k-sweep chart to scrub k
  const sweepSvg = document.getElementById('sweep-svg');
  sweepSvg.addEventListener('click', (e) => {
    const rect = sweepSvg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 460;
    const padLeft = 48;
    const plotW = 460 - 48 - 44;
    const frac = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
    setK(K_MIN + frac * (K_MAX - K_MIN));
  });

  document.getElementById('toggle-market-curve').addEventListener('change', (e) => {
    state.showMarketCurve = e.target.checked;
    renderCalibrationCurve(evaluateBacktestAtK(state.domain, state.k));
  });

  document.getElementById('toggle-tail-zones').addEventListener('change', (e) => {
    state.showTailZones = e.target.checked;
    renderCalibrationCurve(evaluateBacktestAtK(state.domain, state.k));
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
    setView('sandbox');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = state.data.markets.find((x) => x.id === state.sandboxMarketId);
      if (!raw) return;
      const m = withLiveK(raw);
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
    populateSandboxSelect();
    syncSandboxInputs();
    renderAll();
  } catch (err) {
    document.getElementById('feed-status').textContent = 'Data load error';
    console.error('Failed to load markets.json:', err);
  }
}

init();
