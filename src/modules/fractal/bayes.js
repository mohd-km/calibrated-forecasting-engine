import { BAYESIAN_PRESETS, computeBayes } from './math/bayesian.js';
import { SIMPSON_SCENARIOS, computeSimpson, computeBaseRateTrap } from './math/traps.js';
import { renderFrequencyMatrixSvg, renderPositiveSplitBar, renderBayesianCurveSvg } from './charts/bayesianCharts.js';
import { renderSimpsonChartSvg, renderBaseRateMosaicSvg } from './charts/trapsCharts.js';

export function mountBayes(root) {
  const state = {
    bayesian: { preset: 'medical', prior: 0.01, sensitivity: 0.99, fpr: 0.01, signals: 1 },
    traps: { scenarioId: 'quant', weightA: 0.82, weightB: 0.22, baseRate: 0.01, errorRate: 0.01 },
  };
  const $ = (id) => root.querySelector(`#${id}`);

  root.innerHTML = `
    <div class="lab-shell">
      <section class="mod-section">
        <h2 class="mod-h2">Bayesian posterior updater</h2>
        <p class="mod-lead">Pick an example or move the sliders. The updated belief (posterior), the grid of 1,000 people and the curve are all recomputed from Bayes' rule. The example numbers are illustrative, not measured.</p>
        <div class="workspace-grid workspace-grid--sidebar">
          <aside class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title">Your test</h3>
                <p class="card-desc">A medical screen, a trading signal or a startup filter: same maths.</p>
              </div>
            </div>

            <div class="chip-group" id="by-presets" style="margin-bottom:14px;"></div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="by-prior">How common it is to begin with (prior, P(H))</label>
                <span class="control-readout" id="by-val-prior">1.0%</span>
              </div>
              <input id="by-prior" type="range" min="0.1" max="95" step="0.1" value="1.0" />
              <p class="control-hint">Your starting belief, before any test result.</p>
            </div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="by-sens">Catch rate when it is true (sensitivity)</label>
                <span class="control-readout" id="by-val-sens">99.0%</span>
              </div>
              <input id="by-sens" type="range" min="5" max="99.9" step="0.1" value="99.0" />
              <p class="control-hint">How often the test says yes when the thing really is there, P(E | H). This is the likelihood of the evidence.</p>
            </div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="by-fpr">False alarm rate, P(E | not H)</label>
                <span class="control-readout" id="by-val-fpr">1.0%</span>
              </div>
              <input id="by-fpr" type="range" min="0.1" max="80" step="0.1" value="1.0" />
              <p class="control-hint">How often the test says yes when the thing is not there.</p>
            </div>

            <div class="btn-row">
              <button type="button" class="btn btn--primary" id="by-add">Add another positive result</button>
              <button type="button" class="btn" id="by-reset">Back to 1 result</button>
            </div>
          </aside>

          <div class="stack">
            <div class="card">
              <div class="posterior-hero">
                <div>
                  <p class="kpi-label" id="by-hero-label">Chance it is really true after a positive result (posterior)</p>
                  <div class="posterior-number" id="by-posterior">50.0%</div>
                </div>
                <p class="card-desc" id="by-summary" style="max-width:38ch;margin:0;"></p>
              </div>
              <div class="kpi-strip kpi-strip--4" id="by-kpis"></div>
            </div>

            <div class="workspace-grid workspace-grid--two">
              <div class="card">
                <div class="card-head">
                  <div>
                    <h3 class="card-title">The same sum, as 1,000 people</h3>
                    <p class="card-desc">Each tile is 5 of 1,000 people tested.</p>
                  </div>
                </div>
                <div id="by-matrix"></div>
                <div id="by-split"></div>
              </div>

              <div class="card">
                <div class="card-head">
                  <div>
                    <h3 class="card-title">Same test, different starting points</h3>
                    <p class="card-desc">Across: how common the thing is (prior). Up: belief after a positive result (posterior).</p>
                  </div>
                </div>
                <div id="by-curve"></div>
              </div>
            </div>
          </div>
        </div>

        <details class="formula-box">
          <summary>Bayes' rule, written out (formulas)</summary>
          <div class="formula-content">
            <div class="formula-grid">
              <div class="formula-item">
                <code>P(H | E) = [P(E | H) P(H)] / [P(E | H) P(H) + P(E | &not;H) P(&not;H)]</code>
                <p>Updated belief = starting belief &times; how likely the evidence is if true, divided by how likely the evidence is overall.</p>
              </div>
              <div class="formula-item">
                <code>Bayes factor (LR+) = P(E | H) / P(E | &not;H)</code>
                <p>Each independent positive result multiplies the odds by this factor. A rare starting point needs very strong evidence.</p>
              </div>
            </div>
          </div>
        </details>
      </section>

      <section class="mod-section">
        <h2 class="mod-h2">Statistical traps playground</h2>
        <p class="mod-lead">Correct numbers can still mislead. Below are two cases: an option that wins in every group yet loses overall, and a very accurate test for something rare.</p>
        <div class="workspace-grid workspace-grid--two">
          <div class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title">Simpson's paradox</h3>
                <p class="card-desc">A beats B in every group, yet loses overall, because A was tested mostly on the hard cases.</p>
              </div>
              <span class="status-pill" id="sp-status">PARADOX ACTIVE</span>
            </div>

            <div class="chip-group" id="sp-scenarios" style="margin-bottom:14px;"></div>
            <div id="sp-chart" style="margin-bottom:12px;"></div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="sp-wa" id="sp-label-wa">Model A share in stress regime</label>
                <span class="control-readout" id="sp-val-wa">82%</span>
              </div>
              <input id="sp-wa" type="range" min="0" max="100" step="1" value="82" />
            </div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="sp-wb" id="sp-label-wb">Model B share in stress regime</label>
                <span class="control-readout" id="sp-val-wb">22%</span>
              </div>
              <input id="sp-wb" type="range" min="0" max="100" step="1" value="22" />
            </div>

            <div class="btn-row">
              <button type="button" class="btn btn--primary" id="sp-trigger">Trigger paradox</button>
              <button type="button" class="btn" id="sp-balance">Balance weights (50/50)</button>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title">Base-rate fallacy</h3>
                <p class="card-desc">A 99% accurate test still produces mostly false alarms on rare events.</p>
              </div>
              <span class="status-pill" id="br-status">50.0% FALSE ALARMS</span>
            </div>

            <div class="chip-group" id="br-presets" style="margin-bottom:14px;">
              <button type="button" class="chip-btn" data-br="0.001">0.1% rare</button>
              <button type="button" class="chip-btn is-active" data-br="0.01">1% base rate</button>
              <button type="button" class="chip-btn" data-br="0.05">5% base rate</button>
              <button type="button" class="chip-btn" data-br="0.20">20% common</button>
            </div>

            <div id="br-chart" style="margin-bottom:12px;"></div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="br-rate">How common it really is (base rate)</label>
                <span class="control-readout" id="br-val-rate">1.0%</span>
              </div>
              <input id="br-rate" type="range" min="0.1" max="40" step="0.1" value="1.0" />
            </div>

            <div class="control-group">
              <div class="control-row">
                <label class="control-label" for="br-err">Test error rate (false positive &amp; miss)</label>
                <span class="control-readout" id="br-val-err">1.0%</span>
              </div>
              <input id="br-err" type="range" min="0.5" max="15" step="0.5" value="1.0" />
            </div>
          </div>
        </div>

        <details class="formula-box">
          <summary>Why intuition fails on weighted averages &amp; base rates</summary>
          <div class="formula-content">
            <div class="formula-grid">
              <div class="formula-item">
                <code>A_agg = (1 - w_A) A_easy + w_A A_hard &lt; (1 - w_B) B_easy + w_B B_hard</code>
                <p>Simpson's paradox happens when a hidden factor (calm or stressed market, mild or severe illness) affects both who gets which option and how well it goes.</p>
              </div>
              <div class="formula-item">
                <code>P(H | +) &ne; 1 - P(+ | &not;H)</code>
                <p>"The test rarely gives false alarms" is not the same as "a positive result is almost surely right". Mixing them up is the base-rate (or prosecutor's) fallacy.</p>
              </div>
            </div>
          </div>
        </details>
      </section>
    </div>
  `;

  function updateBayesian() {
    const b = state.bayesian;
    const res = computeBayes({ prior: b.prior, sensitivity: b.sensitivity, fpr: b.fpr, signals: b.signals });
    $('by-presets').innerHTML = Object.values(BAYESIAN_PRESETS)
      .map((p) => `<button type="button" class="chip-btn ${b.preset === p.id ? 'is-active' : ''}" data-preset="${p.id}">${p.label}</button>`)
      .join('');
    $('by-val-prior').textContent = `${(b.prior * 100).toFixed(1)}%`;
    $('by-val-sens').textContent = `${(b.sensitivity * 100).toFixed(1)}%`;
    $('by-val-fpr').textContent = `${(b.fpr * 100).toFixed(1)}%`;
    $('by-prior').value = (b.prior * 100).toFixed(1);
    $('by-sens').value = (b.sensitivity * 100).toFixed(1);
    $('by-fpr').value = (b.fpr * 100).toFixed(1);
    $('by-add').textContent = b.signals < 3 ? `Add another positive result (${b.signals} so far)` : 'Maximum 3 results, start again';
    $('by-hero-label').textContent =
      b.signals === 1 ? 'Chance it is really true after a positive result (posterior)' : `Chance it is really true after ${b.signals} independent positive results`;
    $('by-posterior').textContent = `${(res.posterior * 100).toFixed(1)}%`;
    const preset = BAYESIAN_PRESETS[b.preset];
    $('by-summary').textContent = preset
      ? preset.summary
      : 'Your own numbers: notice how much the starting point and the false alarm rate decide the answer.';
    $('by-kpis').innerHTML = `
      <div class="kpi-card"><p class="kpi-label">Starting belief (prior)</p><p class="kpi-value">${(res.prior * 100).toFixed(1)}%</p><p class="kpi-sub">Before any result</p></div>
      <div class="kpi-card"><p class="kpi-label">Evidence strength (Bayes factor)</p><p class="kpi-value">${res.bayesFactor.toFixed(1)}x</p><p class="kpi-sub">How much likelier a positive is if true</p></div>
      <div class="kpi-card"><p class="kpi-label">Belief lift</p><p class="kpi-value kpi-value--accent">${res.lift.toFixed(1)}x</p><p class="kpi-sub">Updated belief divided by starting belief</p></div>
      <div class="kpi-card"><p class="kpi-label">If the result is negative</p><p class="kpi-value">${(res.posteriorNegative * 100).toFixed(2)}%</p><p class="kpi-sub">Chance it is still true</p></div>
    `;
    $('by-matrix').innerHTML = renderFrequencyMatrixSvg(res);
    $('by-split').innerHTML = renderPositiveSplitBar(res);
    $('by-curve').innerHTML = renderBayesianCurveSvg(res);
  }

  function updateTraps() {
    const t = state.traps;
    const simpson = computeSimpson({ scenarioId: t.scenarioId, weightA: t.weightA, weightB: t.weightB });
    $('sp-scenarios').innerHTML = Object.values(SIMPSON_SCENARIOS)
      .map((s) => `<button type="button" class="chip-btn ${t.scenarioId === s.id ? 'is-active' : ''}" data-scenario="${s.id}">${s.label}</button>`)
      .join('');
    const st = $('sp-status');
    st.textContent = simpson.paradoxActive ? 'PARADOX ACTIVE' : 'TREND ALIGNED';
    st.classList.toggle('status-pill--alert', simpson.paradoxActive);
    $('sp-label-wa').textContent = `${simpson.scenario.actorA} share in ${simpson.scenario.hardLabel.toLowerCase()}`;
    $('sp-label-wb').textContent = `${simpson.scenario.actorB} share in ${simpson.scenario.hardLabel.toLowerCase()}`;
    $('sp-val-wa').textContent = `${Math.round(t.weightA * 100)}%`;
    $('sp-val-wb').textContent = `${Math.round(t.weightB * 100)}%`;
    $('sp-wa').value = String(Math.round(t.weightA * 100));
    $('sp-wb').value = String(Math.round(t.weightB * 100));
    $('sp-chart').innerHTML = renderSimpsonChartSvg(simpson);

    const br = computeBaseRateTrap({ baseRate: t.baseRate, errorRate: t.errorRate });
    const bs = $('br-status');
    bs.textContent = `${(br.falseAlarmShare * 100).toFixed(1)}% FALSE ALARMS`;
    bs.classList.toggle('status-pill--alert', br.falseAlarmShare >= 0.5);
    $('br-val-rate').textContent = `${(t.baseRate * 100).toFixed(1)}%`;
    $('br-val-err').textContent = `${(t.errorRate * 100).toFixed(1)}%`;
    $('br-rate').value = (t.baseRate * 100).toFixed(1);
    $('br-err').value = (t.errorRate * 100).toFixed(1);
    $('br-chart').innerHTML = renderBaseRateMosaicSvg(br);
    root.querySelectorAll('#br-presets .chip-btn').forEach((btn) => {
      btn.classList.toggle('is-active', Math.abs(parseFloat(btn.dataset.br) - t.baseRate) < 0.0005);
    });
  }

  $('by-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    const p = btn && BAYESIAN_PRESETS[btn.dataset.preset];
    if (!p) return;
    Object.assign(state.bayesian, { preset: p.id, prior: p.prior, sensitivity: p.sensitivity, fpr: p.fpr, signals: 1 });
    updateBayesian();
  });
  const bySlider = (id, key) =>
    $(id).addEventListener('input', (e) => {
      state.bayesian.preset = 'custom';
      state.bayesian[key] = parseFloat(e.target.value) / 100;
      updateBayesian();
    });
  bySlider('by-prior', 'prior');
  bySlider('by-sens', 'sensitivity');
  bySlider('by-fpr', 'fpr');
  $('by-add').addEventListener('click', () => {
    state.bayesian.signals = state.bayesian.signals < 3 ? state.bayesian.signals + 1 : 1;
    updateBayesian();
  });
  $('by-reset').addEventListener('click', () => { state.bayesian.signals = 1; updateBayesian(); });

  $('sp-scenarios').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-scenario]');
    const sc = btn && SIMPSON_SCENARIOS[btn.dataset.scenario];
    if (!sc) return;
    Object.assign(state.traps, { scenarioId: sc.id, weightA: sc.defaultWeightA, weightB: sc.defaultWeightB });
    updateTraps();
  });
  $('sp-wa').addEventListener('input', (e) => { state.traps.weightA = parseInt(e.target.value, 10) / 100; updateTraps(); });
  $('sp-wb').addEventListener('input', (e) => { state.traps.weightB = parseInt(e.target.value, 10) / 100; updateTraps(); });
  $('sp-trigger').addEventListener('click', () => {
    const sc = SIMPSON_SCENARIOS[state.traps.scenarioId];
    Object.assign(state.traps, { weightA: sc.defaultWeightA, weightB: sc.defaultWeightB });
    updateTraps();
  });
  $('sp-balance').addEventListener('click', () => { Object.assign(state.traps, { weightA: 0.5, weightB: 0.5 }); updateTraps(); });
  $('br-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-br]');
    if (!btn) return;
    state.traps.baseRate = parseFloat(btn.dataset.br);
    updateTraps();
  });
  $('br-rate').addEventListener('input', (e) => { state.traps.baseRate = parseFloat(e.target.value) / 100; updateTraps(); });
  $('br-err').addEventListener('input', (e) => { state.traps.errorRate = parseFloat(e.target.value) / 100; updateTraps(); });

  updateBayesian();
  updateTraps();
}
