import { TEMPLATE } from './template.js';

export function mountCalibration(root) {
const $ = (id) => root.querySelector(`#${id}`);

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
  ledger: null,
  ledgerFilter: 'all',
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

function getRecords(domainKey) {
  const recs = state.data.backtest.records || [];
  return domainKey === 'ALL' ? recs : recs.filter((r) => r.domain === domainKey);
}

function probAtK(pMarket, k) {
  const pm = clampProb(Number(pMarket), 0.01, 0.99);
  return Math.abs(k - 1.0) < 1e-6 ? pm : applyRule(pm, k);
}

const isTailP = (p) => p < 0.15 || p > 0.85;

// Exact re-scoring of every resolved market at parameter k (no approximation).
function evaluateBacktestAtK(domainKey, k) {
  const recs = getRecords(domainKey);
  const n = recs.length;
  let bSum = 0, llSum = 0, mbSum = 0, mllSum = 0;
  let tailN = 0, tailB = 0, tailMB = 0;
  let predTailN = 0, predTailHit = 0, mktTailN = 0, mktTailHit = 0;
  const modBins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  const mktBins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));

  for (const r of recs) {
    const pm = clampProb(Number(r.marketProb), 0.01, 0.99);
    const p = probAtK(pm, k);
    const y = r.y;
    const b = (p - y) ** 2;
    const mb = (pm - y) ** 2;
    bSum += b;
    mbSum += mb;
    llSum += y === 1 ? -Math.log(p) : -Math.log(1 - p);
    mllSum += y === 1 ? -Math.log(pm) : -Math.log(1 - pm);
    if (isTailP(pm)) {
      tailN += 1;
      tailB += b;
      tailMB += mb;
    }
    if (isTailP(p)) {
      predTailN += 1;
      predTailHit += (p < 0.5 ? 1 - y : y);
    }
    if (isTailP(pm)) {
      mktTailN += 1;
      mktTailHit += (pm < 0.5 ? 1 - y : y);
    }
    const mi = Math.min(9, Math.floor(p * 10));
    modBins[mi].n += 1; modBins[mi].p += p; modBins[mi].y += y;
    const ki = Math.min(9, Math.floor(pm * 10));
    mktBins[ki].n += 1; mktBins[ki].p += pm; mktBins[ki].y += y;
  }

  const calibrationBins = [];
  for (let i = 0; i < 10; i++) {
    const mb = modBins[i];
    const kb = mktBins[i];
    if (!mb.n && !kb.n) continue;
    calibrationBins.push({
      bin: `${i * 10}-${(i + 1) * 10}%`,
      predicted: mb.n ? mb.p / mb.n : (i + 0.5) / 10,
      empirical: mb.n ? mb.y / mb.n : null,
      marketPredicted: kb.n ? kb.p / kb.n : (i + 0.5) / 10,
      marketEmpirical: kb.n ? kb.y / kb.n : null,
      n: mb.n,
      marketN: kb.n,
      isTail: i === 0 || i === 9,
    });
  }

  const brierScore = n ? bSum / n : 0;
  const marketBrierScore = n ? mbSum / n : 0;
  return {
    label: domainKey === 'ALL' ? 'All domains' : domainKey,
    resolvedCount: n,
    brierScore,
    marketBrierScore,
    logLoss: n ? llSum / n : 0,
    marketLogLoss: n ? mllSum / n : 0,
    brierSkillPct: marketBrierScore > 0 ? (1 - brierScore / marketBrierScore) * 100 : 0,
    tailBrierScore: tailN ? tailB / tailN : null,
    marketTailBrierScore: tailN ? tailMB / tailN : null,
    tailEventCount: tailN,
    tailAccPct: predTailN ? (predTailHit / predTailN) * 100 : null,
    tailPredN: predTailN,
    marketTailAccPct: mktTailN ? (mktTailHit / mktTailN) * 100 : null,
    calibrationBins,
  };
}

function computeKSweep(domainKey) {
  const points = [];
  let best = null;
  for (let step = 50; step <= 200; step += 1) {
    const kVal = step / 100;
    const ev = evaluateBacktestAtK(domainKey, kVal);
    const pt = { k: kVal, brier: ev.brierScore, logLoss: ev.logLoss, skill: ev.brierSkillPct };
    points.push(pt);
    if (!best || pt.brier < best.brier - 1e-12) best = pt;
  }
  return { points, best };
}

function backtestCsv() {
  const rows = ['id,domain,resolved_at,question,url,market_prob_t7d,rule_prob,k,outcome_yes,brier_rule,brier_crowd,logloss_rule,logloss_crowd'];
  for (const r of getRecords(state.domain)) {
    const pm = clampProb(Number(r.marketProb), 0.01, 0.99);
    const p = probAtK(pm, state.k);
    const q = `"${String(r.question).replaceAll('"', '""')}"`;
    rows.push([
      r.id, r.domain, r.resolvedAt, q, r.url, pm.toFixed(4), p.toFixed(4), state.k.toFixed(2), r.y,
      ((p - r.y) ** 2).toFixed(5), ((pm - r.y) ** 2).toFixed(5),
      (r.y ? -Math.log(p) : -Math.log(1 - p)).toFixed(5), (r.y ? -Math.log(pm) : -Math.log(1 - pm)).toFixed(5),
    ].join(','));
  }
  return rows.join('\n');
}

function downloadText(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const feedEl = $('feed-status');
  if (meta.dataMode === 'live') {
    feedEl.textContent = `${state.data.backtest.resolvedCount} resolved · ${meta.liveMarketsCount} live`;
    feedEl.classList.remove('fallback');
  } else {
    feedEl.textContent = 'Offline snapshot';
    feedEl.classList.add('fallback');
  }

  $('tab-live-count').textContent = String(meta.liveMarketsCount);

  const syncTs = state.data.updated_at || meta.updated_at || meta.generatedAt || '--';
  const formattedTs = syncTs === '--' ? '--' : `${syncTs.replace('T', ' ').replace('Z', '')} UTC`;

  const syncTextEl = $('market-sync-text');
  if (syncTextEl) syncTextEl.textContent = `Synced ${formattedTs}`;

  const ledgerEl = $('forward-ledger-text');
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

  $('stat-active-count').textContent = String(visible.length);
  $('stat-liquidity').textContent = fmtCompact(liq);
  $('stat-tail-count').textContent = String(tails);
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
  $('k-slider').value = kStr;
  $('k-readout').textContent = `k = ${kStr}`;
  $('formula-k').textContent = kStr;
  $('legend-k').textContent = `k=${kStr}`;

  const marketsKBadge = $('markets-k-badge');
  if (marketsKBadge) marketsKBadge.textContent = `k = ${kStr}`;

  const regimeEl = $('k-regime-tag');
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

  const optBtn = $('btn-k-optimal');
  if (optBtn && sweep?.best) {
    optBtn.textContent = `Best k* (${sweep.best.k.toFixed(2)})`;
    optBtn.dataset.kVal = sweep.best.k.toFixed(2);
  }

  root.querySelectorAll('.k-presets .chip-btn').forEach((btn) => {
    const target = btn.dataset.k === 'optimal' ? Number(btn.dataset.kVal) : Number(btn.dataset.k);
    btn.classList.toggle('active', Math.abs(state.k - target) < 0.005);
  });
}

function renderScoreboard(ev, sweep) {
  const { backtest } = state.data;

  $('scoreboard-context').textContent =
    `${ev.label} · n = ${ev.resolvedCount} resolved Manifold markets (${backtest.window}), priced T−${backtest.horizonDays}d.`;

  const brierDiff = ev.brierScore - ev.marketBrierScore;
  const logDiff = ev.logLoss - ev.marketLogLoss;
  const tailDiff =
    ev.tailBrierScore !== null && ev.marketTailBrierScore !== null
      ? ev.tailBrierScore - ev.marketTailBrierScore
      : null;

  $('kpi-brier').textContent = ev.brierScore.toFixed(4);
  const brierDeltaEl = $('kpi-brier-delta');
  brierDeltaEl.textContent = `${fmtSignedDelta(brierDiff, 4)}`;
  setDeltaClass(brierDeltaEl, brierDiff, true);
  $('kpi-brier-mkt').textContent = ev.marketBrierScore.toFixed(4);

  $('kpi-logloss').textContent = ev.logLoss.toFixed(4);
  const logDeltaEl = $('kpi-logloss-delta');
  logDeltaEl.textContent = `${fmtSignedDelta(logDiff, 4)}`;
  setDeltaClass(logDeltaEl, logDiff, true);
  $('kpi-logloss-mkt').textContent = ev.marketLogLoss.toFixed(4);

  const edgeValEl = $('kpi-edge');
  edgeValEl.textContent = fmtSignedPct(ev.brierSkillPct, 2);
  edgeValEl.className = `kpi-value ${ev.brierSkillPct > 0.005 ? 'good' : ev.brierSkillPct < -0.005 ? 'bad' : ''}`;
  $('kpi-edge-active').textContent = `n = ${ev.resolvedCount}`;
  $('kpi-opt-k').textContent = sweep?.best
    ? `k* = ${sweep.best.k.toFixed(2)} (${fmtSignedPct(sweep.best.skill, 1)})`
    : '--';

  $('kpi-tail-acc').textContent =
    ev.tailAccPct !== null ? `${ev.tailAccPct.toFixed(1)}%` : '--';
  $('kpi-tail').textContent =
    ev.tailBrierScore !== null ? ev.tailBrierScore.toFixed(4) : '--';
  const tailDeltaEl = $('kpi-tail-delta');
  tailDeltaEl.textContent = tailDiff !== null ? fmtSignedDelta(tailDiff, 4) : 'n/a';
  setDeltaClass(tailDeltaEl, tailDiff, true);
  $('kpi-tail-mkt').textContent =
    ev.marketTailBrierScore !== null ? ev.marketTailBrierScore.toFixed(4) : '--';
  $('kpi-tail-n').textContent = String(ev.tailEventCount);
}

function renderCalibrationCurve(ev) {
  const svg = $('calibration-svg');
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

  const inspector = $('bin-inspector');
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
  const svg = $('sweep-svg');
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
  const tbody = $('domain-breakdown-body');
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
  const tbody = $('markets-table-body');
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

  $('trace-domain-badge').textContent = m.domain;
  $('trace-tail-badge').classList.toggle('hidden', !m.tailEvent);
  $('trace-question').textContent = m.question;
  $('trace-liquidity').textContent = `Liquidity: ${fmtCompact(m.liquidity)}`;
  $('trace-traders').textContent = `Traders: ${m.traderCount}`;
  $('trace-close').textContent = `Closes: ${m.closeDate}`;
  $('trace-link').href = m.url;

  $('trace-rule-label').textContent = `Rule (k=${state.k.toFixed(2)})`;
  $('trace-base').textContent = fmtPct(m.domainBaseRate);
  $('trace-market').textContent = fmtPct(m.marketProb);
  $('trace-model').textContent = fmtPct(m.modelProb);

  const edgeEl = $('trace-edge');
  edgeEl.textContent = fmtSignedPP(m.edge);
  edgeEl.className = `pb-val ${m.edge >= 0 ? 'good' : 'bad'}`;

  $('marker-base').style.left = `${(m.domainBaseRate * 100).toFixed(1)}%`;
  $('marker-market').style.left = `${(m.marketProb * 100).toFixed(1)}%`;
  $('marker-model').style.left = `${(m.modelProb * 100).toFixed(1)}%`;

  const loMkt = logit(m.marketProb);
  const loMod = state.k * loMkt;
  const dir = m.edge >= 0 ? 'above' : 'below';
  $('trace-rule-comp').textContent =
    `Market p = ${fmtPct(m.marketProb)} -> logit ${loMkt >= 0 ? '+' : ''}${loMkt.toFixed(3)} x k=${state.k.toFixed(2)} = ${loMod >= 0 ? '+' : ''}${loMod.toFixed(3)} -> sigmoid = ${fmtPct(m.modelProb)} (${Math.abs(m.edge * 100).toFixed(1)} pp ${dir} crowd).`;

  $('trace-base-ctx').textContent = m.trace.baseRateContext;
  $('trace-template').textContent = m.trace.qualitativeTemplate;
  $('trace-falsifiers').innerHTML = m.trace.falsifiers
    .map((f) => `<li>${escapeHtml(f)}</li>`)
    .join('');
}

function populateSandboxSelect() {
  const select = $('sandbox-market-select');
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
  $('sandbox-slider').value = String(pct);
  $('sandbox-number').value = String(pct);
}

function renderSandbox() {
  const raw = state.data.markets.find((x) => x.id === state.sandboxMarketId) || state.data.markets[0];
  if (!raw) return;
  const m = withLiveK(raw);

  const pUser = clampProb(state.sandboxProb);
  const pMkt = clampProb(m.marketProb);
  const pMod = clampProb(m.modelProb);

  $('sb-rule-label').textContent = `Rule (k=${state.k.toFixed(2)})`;
  $('sb-mkt-prob').textContent = fmtPct(pMkt);
  $('sb-mod-prob').textContent = fmtPct(pMod);
  $('sb-base-prob').textContent = fmtPct(m.domainBaseRate);

  const expBUser = expectedBrier(pUser, pMod);
  const expBMod = expectedBrier(pMod, pMod);
  const expBMkt = expectedBrier(pMkt, pMod);

  const expLLUser = expectedLogLoss(pUser, pMod);
  const expLLMod = expectedLogLoss(pMod, pMod);
  const expLLMkt = expectedLogLoss(pMkt, pMod);

  const kl = klDivergence(pMod, pUser);
  const brierExcess = expBUser - expBMod;

  const tbody = $('sandbox-score-body');
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

  $('sb-exp-brier').textContent = expBUser.toFixed(4);
  $('sb-exp-brier-diff').textContent =
    brierExcess < 0.0005
      ? 'Matches Rule p* expectation'
      : `+${brierExcess.toFixed(4)} excess Brier vs. p*`;
  $('sb-kl-div').textContent = `${kl.toFixed(4)} nats`;

  const verdict = $('sandbox-verdict');
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
  const svg = $('sandbox-svg');
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

function renderLedger() {
  const L = state.ledger;
  const note = $('ledger-note');
  const body = $('ledger-body');
  if (!L || !Array.isArray(L.entries)) {
    note.textContent = 'Ledger unavailable.';
    body.innerHTML = '';
    return;
  }
  const all = L.entries.filter((e) => state.domain === 'ALL' || e.domain === state.domain);
  const resolved = all.filter((e) => e.status === 'resolved');
  const open = all.filter((e) => e.status === 'open');
  $('tab-ledger-count').textContent = String(L.entries.length);
  note.textContent = `Append-only since ${L.startDateLabel}: each contract is logged once with the crowd price and the pre-registered rule (${L.ruleFormula}); entries are never edited, only scored when Manifold resolves them.`;

  const avg = (arr, f) => (arr.length ? arr.reduce((a, e) => a + f(e), 0) / arr.length : null);
  const bRule = avg(resolved, (e) => (e.modelProbAtLog - (e.resolution === 'YES' ? 1 : 0)) ** 2);
  const bCrowd = avg(resolved, (e) => (e.marketProbAtLog - (e.resolution === 'YES' ? 1 : 0)) ** 2);
  const nextClose = open.map((e) => e.closeDate).filter(Boolean).sort()[0] || '--';
  $('ledger-kpis').innerHTML = `
    <article class="kpi-card"><div class="kpi-top"><span class="kpi-title">Logged contracts</span></div>
      <div class="kpi-value">${all.length}</div><div class="kpi-compare">${state.domain === 'ALL' ? 'All domains' : state.domain}</div></article>
    <article class="kpi-card"><div class="kpi-top"><span class="kpi-title">Resolved / open</span></div>
      <div class="kpi-value">${resolved.length} / ${open.length}</div><div class="kpi-compare">Next close: <strong>${nextClose}</strong></div></article>
    <article class="kpi-card"><div class="kpi-top"><span class="kpi-title">Forward Brier (rule)</span></div>
      <div class="kpi-value">${bRule === null ? '--' : bRule.toFixed(4)}</div><div class="kpi-compare">Crowd: <strong>${bCrowd === null ? '--' : bCrowd.toFixed(4)}</strong></div></article>
    <article class="kpi-card"><div class="kpi-top"><span class="kpi-title">Track record</span></div>
      <div class="kpi-value">${resolved.length ? fmtSignedPct((1 - bRule / Math.max(bCrowd, 1e-9)) * 100, 1) : 'pending'}</div><div class="kpi-compare">${resolved.length ? 'Brier skill vs crowd' : 'Scored only after resolution'}</div></article>
  `;

  const rows = all.filter((e) => state.ledgerFilter === 'all' || e.status === state.ledgerFilter);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);padding:24px;">No ledger entries match this filter yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((e) => {
      const y = e.resolution === 'YES' ? 1 : 0;
      const scored = e.status === 'resolved';
      const status = scored
        ? `<span class="status-chip resolved">Resolved ${escapeHtml(e.resolution)}</span>`
        : e.status === 'void'
          ? `<span class="status-chip">Void</span>`
          : `<span class="status-chip open">Open · closes ${escapeHtml(e.closeDate || '--')}</span>`;
      const briers = scored
        ? `${((e.modelProbAtLog - y) ** 2).toFixed(4)} / ${((e.marketProbAtLog - y) ** 2).toFixed(4)}`
        : '<span style="color:var(--ink-muted)">pending</span>';
      return `
        <tr>
          <td class="q-cell" data-label="Contract">
            <a class="q-title-link" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.question)}</a>
            <div class="q-meta"><span class="domain-pill">${escapeHtml(e.domain)}</span></div>
          </td>
          <td class="mono-cell" data-label="Logged">${escapeHtml(String(e.loggedAt).slice(0, 10))}</td>
          <td class="num mono-cell" data-label="Crowd at log">${fmtPct(e.marketProbAtLog)}</td>
          <td class="num mono-cell accent" data-label="Rule at log" style="font-weight:600">${fmtPct(e.modelProbAtLog)}</td>
          <td data-label="Status">${status}</td>
          <td class="num mono-cell" data-label="Brier rule / crowd">${briers}</td>
        </tr>`;
    })
    .join('');
}

function ledgerCsv() {
  const rows = ['id,domain,logged_at,close_date,question,url,crowd_prob_at_log,rule_prob_at_log,status,resolution,resolved_at'];
  for (const e of (state.ledger?.entries || [])) {
    rows.push([
      e.id, e.domain, e.loggedAt, e.closeDate, `"${String(e.question).replaceAll('"', '""')}"`, e.url,
      e.marketProbAtLog, e.modelProbAtLog, e.status, e.resolution ?? '', e.resolvedAt ?? '',
    ].join(','));
  }
  return rows.join('\n');
}

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
  renderLedger();
}

function setView(viewName) {
  state.view = viewName;
  root.querySelectorAll('.view-tab').forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  root.querySelectorAll('.view-panel').forEach((sec) => {
    sec.classList.toggle('hidden', sec.id !== `view-${viewName}`);
  });
}

function setDomain(domain) {
  state.domain = domain;
  root.querySelectorAll('.domain-btn').forEach((btn) => {
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
  $('btn-export-backtest').addEventListener('click', () => {
    downloadText(`manifold-backtest-${state.domain.toLowerCase()}-k${state.k.toFixed(2)}.csv`, backtestCsv(), 'text/csv;charset=utf-8;');
  });
  $('btn-export-ledger').addEventListener('click', () => {
    downloadText('forward-ledger.csv', ledgerCsv(), 'text/csv;charset=utf-8;');
  });
  $('ledger-filter').addEventListener('change', (e) => {
    state.ledgerFilter = e.target.value;
    renderLedger();
  });

  root.querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  root.querySelectorAll('.domain-btn').forEach((btn) => {
    btn.addEventListener('click', () => setDomain(btn.dataset.domain));
  });

  $('k-slider').addEventListener('input', (e) => {
    setK(Number(e.target.value));
  });

  root.querySelectorAll('.k-presets .chip-btn').forEach((btn) => {
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
  const sweepSvg = $('sweep-svg');
  sweepSvg.addEventListener('click', (e) => {
    const rect = sweepSvg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * 460;
    const padLeft = 48;
    const plotW = 460 - 48 - 44;
    const frac = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
    setK(K_MIN + frac * (K_MAX - K_MIN));
  });

  $('toggle-market-curve').addEventListener('change', (e) => {
    state.showMarketCurve = e.target.checked;
    renderCalibrationCurve(evaluateBacktestAtK(state.domain, state.k));
  });

  $('toggle-tail-zones').addEventListener('change', (e) => {
    state.showTailZones = e.target.checked;
    renderCalibrationCurve(evaluateBacktestAtK(state.domain, state.k));
  });

  $('market-search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderMarketsTable();
  });

  $('market-sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderMarketsTable();
  });

  $('btn-load-sandbox').addEventListener('click', () => {
    const m = state.data.markets.find((x) => x.id === state.selectedMarketId);
    if (!m) return;
    state.sandboxMarketId = m.id;
    state.sandboxProb = m.marketProb;
    $('sandbox-market-select').value = m.id;
    syncSandboxInputs();
    renderSandbox();
    setView('sandbox');
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('sandbox-market-select').addEventListener('change', (e) => {
    state.sandboxMarketId = e.target.value;
    const m = state.data.markets.find((x) => x.id === state.sandboxMarketId);
    if (m) {
      state.sandboxProb = m.marketProb;
      syncSandboxInputs();
      renderSandbox();
    }
  });

  $('sandbox-slider').addEventListener('input', (e) => {
    state.sandboxProb = Number(e.target.value) / 100;
    $('sandbox-number').value = e.target.value;
    renderSandbox();
  });

  $('sandbox-number').addEventListener('input', (e) => {
    const val = Math.max(1, Math.min(99, Number(e.target.value) || 50));
    state.sandboxProb = val / 100;
    $('sandbox-slider').value = String(val);
    renderSandbox();
  });

  root.querySelectorAll('[data-preset]').forEach((btn) => {
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
    if (!Array.isArray(state.data?.backtest?.records) || !state.data.backtest.records.length) {
      throw new Error('markets.json has no per-market backtest records');
    }
    try {
      const lr = await fetch('./data/forward_ledger.json');
      if (lr.ok) state.ledger = await lr.json();
    } catch {
      state.ledger = null;
    }
    state.selectedMarketId = state.data.markets[0]?.id || null;
    state.sandboxMarketId = state.data.markets[0]?.id || null;
    state.sandboxProb = state.data.markets[0]?.marketProb ?? 0.5;

    bindEvents();
    populateSandboxSelect();
    syncSandboxInputs();
    renderAll();
  } catch (err) {
    $('feed-status').textContent = 'Data load error';
    console.error('Failed to load markets.json:', err);
  }
}


root.innerHTML = TEMPLATE;
init();
}
