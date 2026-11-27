import { simulateMarket, buildMarketCsv } from './math/fractal.js';
import { drawPricePaths, drawDrawdownChart, drawKdeChart } from './charts/fractalCharts.js';

const DEFAULTS = { alpha: 1.65, hurst: 0.65, halfLife: 60, seed: 42 };

export function mountFatTails(root) {
  const state = { ...DEFAULTS, logDensity: false, hoverIndex: null, sim: null, priceLayout: null };
  const $ = (id) => root.querySelector(`#${id}`);

  root.innerHTML = `
    <div class="lab-shell">
      <h2 class="mod-h2">Fat tails vs the bell curve</h2>
      <p class="mod-lead">Same daily volatility, two worlds: a Mandelbrot α-stable process with Hurst memory and mean reversion against a matched Gaussian random walk. Paths are simulated with a fixed seed so every slider move is a like-for-like comparison.</p>
      <div class="kpi-strip kpi-strip--4" id="ft-kpis" style="margin-bottom:18px;"></div>

      <div class="workspace-grid workspace-grid--sidebar">
        <aside class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Market parameters</h3>
              <p class="card-desc">Dial from mild Gaussian walks to wild fractal markets.</p>
            </div>
          </div>

          <div class="control-group">
            <div class="control-row">
              <label class="control-label" for="ft-alpha">Mandelbrot tail exponent (&alpha;)</label>
              <span class="control-readout" id="ft-val-alpha">1.65</span>
            </div>
            <input id="ft-alpha" type="range" min="1.30" max="2.00" step="0.05" value="1.65" />
            <p class="control-hint">2.00 = Gaussian bell curve; lower &alpha; produces sudden crashes.</p>
          </div>

          <div class="control-group">
            <div class="control-row">
              <label class="control-label" for="ft-hurst">Hurst persistence (H)</label>
              <span class="control-readout" id="ft-val-hurst">0.65</span>
            </div>
            <input id="ft-hurst" type="range" min="0.15" max="0.85" step="0.05" value="0.65" />
            <p class="control-hint">&gt;0.50 trends smoothly; &lt;0.50 snaps back nervously.</p>
          </div>

          <div class="control-group">
            <div class="control-row">
              <label class="control-label" for="ft-halflife">Mean-reversion half-life</label>
              <span class="control-readout" id="ft-val-halflife">60d</span>
            </div>
            <input id="ft-halflife" type="range" min="5" max="250" step="5" value="60" />
            <p class="control-hint">Time for drift to decay by half (250 = off).</p>
          </div>

          <div class="btn-row">
            <button type="button" class="btn btn--primary" id="ft-seed">New seed</button>
            <button type="button" class="btn" id="ft-reset">Reset</button>
            <button type="button" class="btn" id="ft-csv">Export CSV</button>
          </div>
          <p class="control-hint" id="ft-seed-label" style="margin-top:10px;"></p>
        </aside>

        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title">Simulated price paths (252 trading days)</h3>
                <p class="card-desc">Fractal path against a matched Gaussian random walk. Hover to inspect.</p>
              </div>
              <div class="legend-row">
                <span class="legend-item"><span class="swatch swatch--cobalt"></span>Fractal path</span>
                <span class="legend-item"><span class="swatch swatch--dashed"></span>Gaussian walk</span>
              </div>
            </div>
            <div class="chart-box">
              <canvas id="ft-canvas-price" class="chart-canvas" aria-label="Simulated fractal versus Gaussian price paths"></canvas>
              <div id="ft-tooltip" class="chart-tooltip"></div>
            </div>
          </div>

          <div class="workspace-grid workspace-grid--two">
            <div class="card">
              <div class="card-head">
                <div>
                  <h3 class="card-title">Return density vs Normal fit</h3>
                  <p class="card-desc">Kernel density reveals fat tails missed by the bell curve.</p>
                </div>
                <button type="button" class="chip-btn" id="ft-log">Log density</button>
              </div>
              <div class="chart-box">
                <canvas id="ft-canvas-kde" class="chart-canvas chart-canvas--kde" aria-label="Kernel density estimate versus normal distribution fit"></canvas>
              </div>
            </div>

            <div class="card">
              <div class="card-head">
                <div>
                  <h3 class="card-title">Tail-drawdown risk</h3>
                  <p class="card-desc">Peak-to-trough underwater loss across the year.</p>
                </div>
              </div>
              <div class="chart-box">
                <canvas id="ft-canvas-dd" class="chart-canvas chart-canvas--kde" aria-label="Underwater drawdown profile"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      <details class="formula-box">
        <summary>Model equations</summary>
        <div class="formula-content">
          <div class="formula-grid">
            <div class="formula-item">
              <code>P(|r| &gt; x) &prop; x^(-&alpha;)</code>
              <p>Symmetric &alpha;-stable innovations via Chambers-Mallows-Stuck sampling (Noah effect).</p>
            </div>
            <div class="formula-item">
              <code>D = 2 - H, &gamma;(k) = 0.5(|k+1|^(2H) - 2|k|^(2H) + |k-1|^(2H))</code>
              <p>Exact fractional Gaussian noise Cholesky filter linking Hurst memory to fractal dimension (Joseph effect).</p>
            </div>
            <div class="formula-item">
              <code>x_t = x_(t-1) - &theta; x_(t-1) + &sigma; &epsilon;_t, &theta; = 1 - 2^(-1/t_half)</code>
              <p>Discrete Ornstein-Uhlenbeck mean reversion.</p>
            </div>
            <div class="formula-item">
              <code>f_hat(x) = (1 / (n h)) &Sigma; K((x - r_i) / h)</code>
              <p>Gaussian kernel density estimate with robust Silverman bandwidth against the matched Normal PDF.</p>
            </div>
          </div>
        </div>
      </details>
    </div>
  `;

  function redraw() {
    if (!state.sim) return;
    const price = $('ft-canvas-price');
    if (!price || price.getBoundingClientRect().width === 0) return; // hidden tab
    state.priceLayout = drawPricePaths(price, state.sim, state.hoverIndex);
    drawKdeChart($('ft-canvas-kde'), state.sim, state.logDensity);
    drawDrawdownChart($('ft-canvas-dd'), state.sim);
  }

  function update() {
    state.sim = simulateMarket({ alpha: state.alpha, hurst: state.hurst, halfLife: state.halfLife, seed: state.seed });
    const sim = state.sim;
    $('ft-val-alpha').textContent = state.alpha.toFixed(2);
    $('ft-val-hurst').textContent = state.hurst.toFixed(2);
    $('ft-val-halflife').textContent = state.halfLife >= 250 ? 'Off' : `${state.halfLife}d`;
    $('ft-seed-label').textContent = `Seed ${state.seed}`;
    const regime = state.hurst > 0.54 ? 'Trending' : state.hurst < 0.46 ? 'Anti-persistent' : 'Random walk';
    $('ft-kpis').innerHTML = `
      <div class="kpi-card">
        <p class="kpi-label">Fractal dimension D</p>
        <p class="kpi-value kpi-value--accent">${sim.fractalDimension.toFixed(2)}</p>
        <p class="kpi-sub">${regime} (D = 2 - H)</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Max drawdown</p>
        <p class="kpi-value">${(sim.maxDdF * 100).toFixed(1)}%</p>
        <p class="kpi-sub">Gaussian: ${(sim.maxDdG * 100).toFixed(1)}%</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">&gt;3&sigma; shock days</p>
        <p class="kpi-value">${sim.statsF.tail3Sigma}</p>
        <p class="kpi-sub">Gaussian: ${sim.statsG.tail3Sigma} days</p>
      </div>
      <div class="kpi-card">
        <p class="kpi-label">Excess kurtosis</p>
        <p class="kpi-value">${sim.statsF.excessKurtosis.toFixed(2)}</p>
        <p class="kpi-sub">Gaussian path: ${sim.statsG.excessKurtosis.toFixed(2)}</p>
      </div>
    `;
    redraw();
  }

  const syncSliders = () => {
    $('ft-alpha').value = String(state.alpha);
    $('ft-hurst').value = String(state.hurst);
    $('ft-halflife').value = String(state.halfLife);
  };

  $('ft-alpha').addEventListener('input', (e) => { state.alpha = parseFloat(e.target.value); update(); });
  $('ft-hurst').addEventListener('input', (e) => { state.hurst = parseFloat(e.target.value); update(); });
  $('ft-halflife').addEventListener('input', (e) => { state.halfLife = parseInt(e.target.value, 10); update(); });
  $('ft-seed').addEventListener('click', () => { state.seed = (state.seed * 1664525 + 1013904223) >>> 0; update(); });
  $('ft-reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS, { logDensity: false });
    $('ft-log').classList.remove('is-active');
    syncSliders();
    update();
  });
  $('ft-log').addEventListener('click', (e) => {
    state.logDensity = !state.logDensity;
    e.currentTarget.classList.toggle('is-active', state.logDensity);
    redraw();
  });
  $('ft-csv').addEventListener('click', () => {
    if (!state.sim) return;
    const blob = new Blob([buildMarketCsv(state.sim)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fat-tail-sim-a${state.alpha.toFixed(2)}-H${state.hurst.toFixed(2)}-hl${state.halfLife}-seed${state.seed}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  const priceCanvas = $('ft-canvas-price');
  const tooltip = $('ft-tooltip');
  const hover = (clientX) => {
    const layout = state.priceLayout;
    const sim = state.sim;
    if (!layout || !sim) return;
    const rect = priceCanvas.getBoundingClientRect();
    const frac = (clientX - rect.left - layout.pad.left) / layout.plotW;
    if (frac < 0 || frac > 1) {
      state.hoverIndex = null;
      tooltip.classList.remove('is-visible');
      redraw();
      return;
    }
    const idx = Math.max(0, Math.min(layout.n - 1, Math.round(frac * (layout.n - 1))));
    state.hoverIndex = idx;
    tooltip.innerHTML = `Day ${idx}<br/>Fractal: ${sim.fractalPrices[idx].toFixed(2)}<br/>Gaussian: ${sim.gaussPrices[idx].toFixed(2)}<br/>DD: ${(sim.fractalDD[idx] * 100).toFixed(1)}%`;
    tooltip.classList.add('is-visible');
    drawPricePaths(priceCanvas, sim, idx);
  };
  priceCanvas.addEventListener('mousemove', (e) => hover(e.clientX));
  priceCanvas.addEventListener('touchmove', (e) => { if (e.touches[0]) hover(e.touches[0].clientX); }, { passive: true });
  priceCanvas.addEventListener('mouseleave', () => {
    state.hoverIndex = null;
    tooltip.classList.remove('is-visible');
    redraw();
  });

  const ro = new ResizeObserver(() => redraw());
  ro.observe(root);
  update();
  return () => ro.disconnect();
}
