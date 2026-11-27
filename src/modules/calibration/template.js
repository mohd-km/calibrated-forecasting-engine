export const TEMPLATE = `
<div class="app-shell">
      <div class="mod-head">
        <div>
          <h2 class="mod-title">Calibration lab</h2>
          <p class="subtitle">Real, finished yes/no questions from <a href="https://manifold.markets" target="_blank" rel="noopener noreferrer">Manifold Markets</a>, using the crowd's price one week before each closed. Move the boldness dial <code>k</code> and every question is re-scored instantly.</p>
        </div>
        <span id="feed-status" class="feed-status">Loading dataset...</span>
      </div>
      <div class="toolbar">
          <nav class="view-tabs" role="tablist" aria-label="Workspace Views">
            <button class="view-tab active" data-view="lab" role="tab" aria-selected="true" type="button">
              Replay the past
            </button>
            <button class="view-tab" data-view="markets" role="tab" aria-selected="false" type="button">
              Open questions <span class="tab-count" id="tab-live-count">--</span>
            </button>
            <button class="view-tab" data-view="ledger" role="tab" aria-selected="false" type="button">
              Locked-in forecasts <span class="tab-count" id="tab-ledger-count">--</span>
            </button>
            <button class="view-tab" data-view="sandbox" role="tab" aria-selected="false" type="button">
              Score your own guess
            </button>
          </nav>

          <div class="domain-filter" role="group" aria-label="Topic filter">
            <button class="domain-btn active" data-domain="ALL" aria-pressed="true" type="button">All</button>
            <button class="domain-btn" data-domain="AI" aria-pressed="false" type="button">AI</button>
            <button class="domain-btn" data-domain="Energy" aria-pressed="false" type="button">Energy</button>
            <button class="domain-btn" data-domain="Biotech" aria-pressed="false" type="button">Biotech</button>
            <button class="domain-btn" data-domain="Macro" aria-pressed="false" type="button">Macro</button>
          </div>
        </div>
      <main class="dashboard-main">
        <!-- VIEW 1: CALIBRATION CURVE + LIVE BACKTEST RULE LAB (HERO) -->
        <section id="view-lab" class="view-panel" aria-labelledby="sec-lab">
          <!-- Interactive k Parameter Bar -->
          <div class="rule-lab-bar">
            <div class="rule-lab-head">
              <div>
                <h3 id="sec-lab" class="lab-h3">Replay the past with a boldness dial</h3>
                <p class="section-note" id="scoreboard-context">
                  Loading resolved Manifold binary backtest...
                </p>
              </div>
              <div class="rule-head-actions">
                <div class="rule-equation-pill" id="rule-formula-pill">
                  <code>p = sigmoid(<span id="formula-k">1.15</span> &middot; logit(p<sub>mkt</sub>))</code>
                </div>
                <button type="button" class="chip-btn" id="btn-export-backtest">Export CSV</button>
              </div>
            </div>

            <div class="k-control-row">
              <div class="k-slider-group">
                <div class="k-label-row">
                  <label for="k-slider" class="k-label">
                    Boldness dial <code>k</code>
                    <span id="k-regime-tag" class="regime-tag">Bolder</span>
                  </label>
                  <span class="k-readout" id="k-readout">k = 1.15</span>
                </div>
                <input
                  type="range"
                  id="k-slider"
                  class="editorial-slider"
                  min="0.50"
                  max="2.00"
                  step="0.01"
                  value="1.15"
                  aria-label="Calibration parameter k"
                />
                <div class="k-scale-ticks" aria-hidden="true">
                  <span>0.50 (cautious)</span>
                  <span>1.00 (raw crowd)</span>
                  <span>1.15 (set in advance)</span>
                  <span>1.50</span>
                  <span>2.00 (very bold)</span>
                </div>
                <p class="k-hint">Below 1 pulls every forecast toward 50% (more cautious). Above 1 pushes it toward 0% or 100% (bolder). Pushing outward is called extremising: averaging many people's guesses tends to make a crowd too timid, so a bolder version can sometimes score better. 1.15 was chosen before looking at results.</p>
              </div>

              <div class="k-presets" aria-label="Parameter k presets">
                <button type="button" class="chip-btn" data-k="0.80">Cautious 0.80</button>
                <button type="button" class="chip-btn" data-k="1.00">Crowd 1.00</button>
                <button type="button" class="chip-btn active" data-k="1.15">Set in advance 1.15</button>
                <button type="button" class="chip-btn" id="btn-k-optimal" data-k="optimal">Best fit k*</button>
                <button type="button" class="chip-btn" data-k="1.50">Bold 1.50</button>
              </div>
            </div>
          </div>

          <!-- 4 Compact Live KPIs -->
          <div class="kpi-grid">
            <article class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">Average error (Brier score)</span>
                <span id="kpi-brier-delta" class="kpi-delta neutral">--</span>
              </div>
              <div id="kpi-brier" class="kpi-value">--</div>
              <div class="kpi-compare">Raw crowd: <strong id="kpi-brier-mkt">--</strong></div>
              <div class="kpi-hint">0 is perfect, 0.25 is coin-flip guessing. Lower is better.</div>
            </article>

            <article class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">Surprise penalty (log-loss)</span>
                <span id="kpi-logloss-delta" class="kpi-delta neutral">--</span>
              </div>
              <div id="kpi-logloss" class="kpi-value">--</div>
              <div class="kpi-compare">Raw crowd: <strong id="kpi-logloss-mkt">--</strong></div>
              <div class="kpi-hint">Punishes confident misses much harder. 0.69 is coin-flip guessing. Lower is better.</div>
            </article>

            <article class="kpi-card">
              <div class="kpi-top">
                <span class="kpi-title">Better than the crowd? (Brier skill)</span>
                <span id="kpi-edge-active" class="kpi-delta neutral">--</span>
              </div>
              <div id="kpi-edge" class="kpi-value">--</div>
              <div class="kpi-compare">Best possible: <strong id="kpi-opt-k">--</strong></div>
              <div class="kpi-hint">Positive means the dial beat the raw crowd; negative means it did worse.</div>
            </article>

            <article class="kpi-card kpi-card-tail">
              <div class="kpi-top">
                <span class="kpi-title">Confident calls right (below 15% or above 85%)</span>
                <span id="kpi-tail-delta" class="kpi-delta neutral">--</span>
              </div>
              <div class="kpi-value-pair">
                <span id="kpi-tail-acc" class="kpi-value">--</span>
                <span class="kpi-sub-val">error <strong id="kpi-tail">--</strong></span>
              </div>
              <div class="kpi-compare">
                Crowd error: <strong id="kpi-tail-mkt">--</strong> &middot; <strong id="kpi-tail-n">--</strong> questions
              </div>
            </article>
          </div>

          <!-- Visual Centerpiece: Reliability Diagram + Live k-Sweep Curve -->
          <div class="calibration-grid">
            <div class="panel chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Does 70% really mean 70%? (reliability diagram)</h3>
                  <span class="panel-sub">Forecasts grouped into 10% buckets. Across: what was forecast. Up: how often it really happened. Dots on the dashed line mean honest forecasts.</span>
                </div>
                <div class="chart-toggles">
                  <label class="toggle-chip">
                    <input type="checkbox" id="toggle-market-curve" checked />
                    <span>Crowd</span>
                  </label>
                  <label class="toggle-chip">
                    <input type="checkbox" id="toggle-tail-zones" checked />
                    <span>Confident zone</span>
                  </label>
                </div>
              </div>

              <div class="chart-legend">
                <span class="legend-item"><i class="swatch swatch-model"></i>With dial <span id="legend-k">k=1.15</span></span>
                <span class="legend-item"><i class="swatch swatch-market"></i>Raw crowd, 1 week out</span>
                <span class="legend-item"><i class="swatch swatch-ideal"></i>Perfectly honest</span>
                <span class="legend-item"><i class="swatch swatch-tail"></i>Confident zone (&lt;15% / &gt;85%)</span>
              </div>

              <div class="svg-wrapper">
                <svg id="calibration-svg" viewBox="0 0 640 390" role="img" aria-label="Calibration Reliability Diagram"></svg>
              </div>

              <div id="bin-inspector" class="bin-inspector">
                Hover or tap any dot to see the forecast, what really happened, and how many questions are in it.
              </div>
            </div>

            <div class="side-stack">
              <div class="panel sweep-panel">
                <div class="panel-header">
                  <div>
                    <h3>Error at every dial setting</h3>
                    <span class="panel-sub">The lowest point is the best <code>k</code>. Click the chart to jump there.</span>
                  </div>
                  <div class="mini-legend">
                    <span><i class="swatch swatch-model"></i>Average error</span>
                    <span><i class="swatch swatch-logloss"></i>Surprise penalty</span>
                  </div>
                </div>
                <div class="svg-wrapper">
                  <svg id="sweep-svg" viewBox="0 0 460 210" role="img" aria-label="Brier Score and Log-Loss across parameter k"></svg>
                </div>
              </div>

              <div class="panel domain-panel">
                <div class="panel-header">
                  <h3>By topic</h3>
                  <span class="panel-sub">n = questions. Confident = error on confident calls. Skill = beat the crowd by. Tap a row to filter.</span>
                </div>
                <div class="domain-table-wrap">
                  <table class="mini-table" id="domain-breakdown-table">
                    <thead>
                      <tr>
                        <th>Topic</th>
                        <th class="num">n</th>
                        <th class="num">Error</th>
                        <th class="num">Surprise</th>
                        <th class="num">Confident</th>
                        <th class="num">Skill</th>
                      </tr>
                    </thead>
                    <tbody id="domain-breakdown-body"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Collapsible Methodology & Forward Ledger Drawer -->
          <details class="methodology-drawer">
            <summary>How the scoring works (formulas)</summary>
            <div class="drawer-body">
              <div class="drawer-grid">
                <div>
                  <h4>The dial, chosen in advance</h4>
                  <p>
                    The dial converts each crowd price to log-odds (a scale where 50% sits at 0), multiplies by <code>k</code>, and converts back. This is logistic extremisation:
                    <code>p_model = sigmoid(k &middot; logit(p_market))</code> with default <code>k = 1.15</code>
                    (clamped to <code>[1%, 99%]</code>). Values <code>k &lt; 1</code> shrink crowd prices toward 50%;
                    values <code>k &gt; 1</code> push probabilities toward the tails.
                  </p>
                  <p>
                    Every <code>k</code> re-scores each finished question exactly from its price one week before close
                    and its real outcome; nothing is estimated. The best fit <code>k*</code> is found by trying every step of 0.01
                    on this same history, so it flatters itself: treat it as a clue, not a promise.
                  </p>
                </div>
                <div>
                  <h4>Data and honest reporting</h4>
                  <p>
                    Scores come from real finished Manifold yes/no questions, each priced exactly 7 days before it
                    closed. When the dial does worse than the raw crowd, the negative skill is shown as is.
                  </p>
                  <p class="ledger-note">
                    <span id="forward-ledger-text">Forward ledger: loading...</span> &middot;
                    <span id="market-sync-text">Synced: --</span> &middot;
                    <span id="stat-active-count">--</span> open questions (<span id="stat-liquidity">--</span> of bets placed,
                    <span id="stat-tail-count">--</span> in the confident zone).
                  </p>
                </div>
              </div>
            </div>
          </details>
        </section>

        <!-- VIEW 2: LIVE BINARY MARKETS + RULE TRACE -->
        <section id="view-markets" class="view-panel hidden" aria-labelledby="sec-markets">
          <div class="section-header">
            <div>
              <h3 id="sec-markets" class="lab-h3">Open yes/no questions right now</h3>
              <p class="section-note">
                Questions still being traded on Manifold. Each row shows the crowd's price and the same price after your dial
                (<code id="markets-k-badge">k = 1.15</code>). Topic YES rate is how often past questions in that topic resolved YES.
              </p>
            </div>
            <div class="table-controls">
              <input
                type="search"
                id="market-search"
                class="search-input"
                placeholder="Search questions..."
                aria-label="Filter market questions"
              />
              <select id="market-sort" class="sort-select" aria-label="Sort markets">
                <option value="edge">Sort: biggest dial shift</option>
                <option value="liquidity">Sort: most money bet</option>
                <option value="tail">Sort: confident ones first</option>
                <option value="marketProb">Sort: crowd price</option>
              </select>
            </div>
          </div>

          <div class="markets-split">
            <div class="panel table-panel">
              <div class="table-scroll">
                <table class="markets-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Topic</th>
                      <th class="num">Crowd</th>
                      <th class="num">Topic YES rate</th>
                      <th class="num">After dial</th>
                      <th class="num">Shift</th>
                    </tr>
                  </thead>
                  <tbody id="markets-table-body"></tbody>
                </table>
              </div>
            </div>

            <aside class="panel trace-panel" id="trace-panel" aria-live="polite">
              <div class="trace-header">
                <div class="trace-badges">
                  <span id="trace-domain-badge" class="domain-pill">--</span>
                  <span id="trace-tail-badge" class="tail-pill hidden">Confident (&lt;15% / &gt;85%)</span>
                </div>
                <h3 id="trace-question">Pick a question</h3>
                <div class="trace-meta-row">
                  <span id="trace-liquidity">Money bet: --</span>
                  <span id="trace-traders">Traders: --</span>
                  <span id="trace-close">Closes: --</span>
                </div>
                <div class="trace-link-row">
                  <a id="trace-link" href="#" target="_blank" rel="noopener noreferrer" class="ext-link">
                    Open on Manifold &rarr;
                  </a>
                </div>
              </div>

              <div class="prob-compare-strip">
                <div class="prob-box">
                  <span class="pb-label">Topic YES rate</span>
                  <span id="trace-base" class="pb-val">--</span>
                </div>
                <div class="prob-box">
                  <span class="pb-label">Crowd</span>
                  <span id="trace-market" class="pb-val">--</span>
                </div>
                <div class="prob-box highlight-box">
                  <span class="pb-label" id="trace-rule-label">After dial (k=1.15)</span>
                  <span id="trace-model" class="pb-val accent">--</span>
                </div>
                <div class="prob-box">
                  <span class="pb-label">Shift</span>
                  <span id="trace-edge" class="pb-val">--</span>
                </div>
              </div>

              <div class="prob-track-visual" id="prob-track-visual">
                <div class="track-legend">
                  <span><i class="dot dot-base"></i>Topic YES rate</span>
                  <span><i class="dot dot-market"></i>Crowd</span>
                  <span><i class="dot dot-model"></i>After dial</span>
                </div>
                <div class="track-line-wrap">
                  <div class="track-line"></div>
                  <div id="marker-base" class="track-marker marker-base" title="Share of past questions in this topic that resolved YES"></div>
                  <div id="marker-market" class="track-marker marker-market" title="Crowd price on Manifold"></div>
                  <div id="marker-model" class="track-marker marker-model" title="Forecast after the boldness dial"></div>
                </div>
                <div class="track-scale">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>

              <div class="trace-calc-box">
                <div class="step-label">Step by step: how the dial changed this forecast</div>
                <p id="trace-rule-comp">--</p>
              </div>

              <details class="compact-drawer">
                <summary>Background, checklist and what would prove it wrong</summary>
                <div class="compact-drawer-body">
                  <p id="trace-base-ctx">--</p>
                  <p id="trace-template">--</p>
                  <ul id="trace-falsifiers"></ul>
                </div>
              </details>

              <div class="trace-actions">
                <button id="btn-load-sandbox" class="primary-btn" type="button">
                  Try your own guess on this &rarr;
                </button>
              </div>
            </aside>
          </div>
        </section>

        <!-- VIEW: FORWARD LEDGER -->
        <section id="view-ledger" class="view-panel hidden" aria-labelledby="sec-ledger">
          <div class="section-header">
            <div>
              <h3 id="sec-ledger" class="lab-h3">Locked-in forecasts (forward ledger)</h3>
              <p class="section-note" id="ledger-note">Loading ledger...</p>
            </div>
            <div class="table-controls">
              <select id="ledger-filter" class="sort-select" aria-label="Filter ledger by status">
                <option value="all">All entries</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
              <button type="button" class="chip-btn" id="btn-export-ledger">Export CSV</button>
            </div>
          </div>
          <div class="kpi-grid ledger-kpis" id="ledger-kpis"></div>
          <div class="panel table-panel">
            <div class="table-scroll">
              <table class="markets-table ledger-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Logged</th>
                    <th class="num">Crowd at log</th>
                    <th class="num">Dial at log</th>
                    <th>Status</th>
                    <th class="num">Error: dial / crowd</th>
                  </tr>
                </thead>
                <tbody id="ledger-body"></tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- VIEW 3: INTERACTIVE BRIER & LOG-LOSS SANDBOX -->
        <section id="view-sandbox" class="view-panel hidden" aria-labelledby="sec-sandbox">
          <div class="section-header">
            <div>
              <h3 id="sec-sandbox" class="lab-h3">Score your own guess</h3>
              <p class="section-note">
                Pick an open question and slide your forecast. The table shows your penalty if the answer turns out YES or NO.
                Here the dial's forecast, called p*, stands in for the true chance. Confident wrong answers cost far more than cautious ones.
              </p>
            </div>
          </div>

          <div class="sandbox-grid">
            <div class="panel sandbox-chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Penalty for every possible forecast</h3>
                  <span class="panel-sub">Green dashed: penalty if YES. Red dashed: penalty if NO. Blue: average penalty if p* is the true chance. Its lowest point is p* itself.</span>
                </div>
              </div>
              <div class="svg-wrapper">
                <svg id="sandbox-svg" viewBox="0 0 560 320" role="img" aria-label="Proper Scoring Rule Penalty Curve"></svg>
              </div>
              <div class="sandbox-insight-grid">
                <div class="insight-card">
                  <span class="ic-label">Your expected error (Brier), if p* is right</span>
                  <span id="sb-exp-brier" class="ic-val">--</span>
                  <span id="sb-exp-brier-diff" class="ic-sub">--</span>
                </div>
                <div class="insight-card">
                  <span class="ic-label">Extra penalty for disagreeing (KL divergence)</span>
                  <span id="sb-kl-div" class="ic-val ochre">--</span>
                  <span class="ic-sub">Measured in nats, a unit of surprise. 0 means you match p*.</span>
                </div>
              </div>
            </div>

            <div class="panel sandbox-controls-panel">
              <div class="field-group">
                <label for="sandbox-market-select" class="field-label">Open question</label>
                <select id="sandbox-market-select" class="sandbox-select"></select>
              </div>

              <div class="sandbox-anchors">
                <div class="anchor-chip">
                  <span class="ac-label">Crowd</span>
                  <span id="sb-mkt-prob" class="ac-val">--</span>
                </div>
                <div class="anchor-chip">
                  <span class="ac-label" id="sb-rule-label">After dial, p* (k=1.15)</span>
                  <span id="sb-mod-prob" class="ac-val accent">--</span>
                </div>
                <div class="anchor-chip">
                  <span class="ac-label">Topic YES rate</span>
                  <span id="sb-base-prob" class="ac-val">--</span>
                </div>
              </div>

              <div class="slider-block">
                <div class="slider-header">
                  <label for="sandbox-slider" class="field-label">Your Forecast</label>
                  <div class="prob-input-wrap">
                    <input
                      type="number"
                      id="sandbox-number"
                      min="1"
                      max="99"
                      step="1"
                      value="50"
                      aria-label="Your probability percentage"
                    />
                    <span class="pct-unit">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  id="sandbox-slider"
                  min="1"
                  max="99"
                  step="1"
                  value="50"
                  class="editorial-slider"
                />
                <div class="preset-row">
                  <button type="button" class="chip-btn" data-preset="market">Match crowd</button>
                  <button type="button" class="chip-btn" data-preset="model">Match dial</button>
                  <button type="button" class="chip-btn" data-preset="95">95%</button>
                  <button type="button" class="chip-btn" data-preset="5">5%</button>
                  <button type="button" class="chip-btn" data-preset="50">50%</button>
                </div>
              </div>

              <div id="sandbox-verdict" class="verdict-banner">
                Move the slider to see how overconfidence is punished.
              </div>

              <div class="score-table-wrap">
                <table class="score-table">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th class="num">You</th>
                      <th class="num">Dial</th>
                      <th class="num">Crowd</th>
                    </tr>
                  </thead>
                  <tbody id="sandbox-score-body"></tbody>
                </table>
              </div>
            </div>
          </div>

          <details class="methodology-drawer">
            <summary>Why these scores punish overconfidence (formulas)</summary>
            <div class="drawer-body">
              <p>In plain words: both scores are built so that your best long-run strategy is to say exactly what you believe. Exaggerating in either direction always costs you on average.</p>
              <p>
                Both <strong>Brier Score</strong> <code>(p &minus; y)&sup2;</code> and <strong>Log-Loss</strong>
                <code>&minus;[y ln(p) + (1 &minus; y) ln(1 &minus; p)]</code> are strictly proper: your expected loss is
                uniquely minimized when your reported probability equals the true event probability <code>p*</code>.
                Log-loss diverges toward infinity as a confident forecast misses, with excess expected loss equal to the
                Kullback&ndash;Leibler divergence <code>D_KL(p* || q)</code>.
              </p>
            </div>
          </details>
        </section>
      </main>
    </div>
`;
