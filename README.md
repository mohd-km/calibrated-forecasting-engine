# Calibrated World-Model & Forecasting Engine

**Author:** Mohammed KM

An editorial quantitative forecasting dashboard that benchmarks a calibrated world-model against live open binary prediction markets from Manifold Markets across **AI**, **Energy**, **Biotech**, and **Macro** domains.

## Architecture & Features

1. **Live Market Ingestion (`scripts/fetch_markets.py`)**
   - Queries `https://api.manifold.markets/v0/markets?limit=60` (and high-liquidity domain search endpoints when needed) to extract 20 clean, open binary markets across AI, Energy, Biotech, and Macro.
   - Includes a verified fallback snapshot if the upstream API is unreachable or slow.
   - Computes structured reference-class base rates, calibrated model probabilities, edge-vs-market deltas, Popperian reasoning traces, and historical calibration benchmarks into `public/data/markets.json`.

2. **Calibration Scoreboard**
   - Tracks **Brier Score**, **Log-Loss**, **Market Edge**, and an independent **Taleb Tail-Risk Score** for rare events (`<10%` or `>90%`) so fat-tail misses never hide behind bulk averages.

3. **Interactive Calibration Curve + Domain Filter**
   - Crisp SVG reliability diagram plotting Predicted Probability vs. Empirical Frequency against the perfect-calibration diagonal and Manifold crowd baseline.
   - Filterable across **All Domains**, **AI**, **Energy**, **Biotech**, and **Macro**, with highlighted tail zones (`<10%` and `>90%`) and interactive bin tooltips.

4. **Live Market Table & Popperian Trace Inspector**
   - Sortable and filterable table of 20 live binary contracts showing Manifold price, reference base rate, model probability, and edge delta.
   - Clicking any row opens the full **Popperian Conjecture -> Adversarial Critique -> Final Probability** trace alongside falsification criteria.

5. **Interactive Brier & Log-Loss Sandbox**
   - Pick any live contract, enter your own probability estimate (`1%` to `99%`), and compare expected Brier Score and Log-Loss under YES vs. NO outcomes against both the Market and Model probabilities—demonstrating quantitatively how proper scoring rules reward calibration and penalize overconfidence.

## Local Usage

```bash
# Refresh live market snapshot
python3 scripts/fetch_markets.py

# Install dependencies and build production bundle
npm install
npm run build

# Run local dev server
npm run dev
```

Production assets are emitted to `dist/` with `dist/index.html`.
