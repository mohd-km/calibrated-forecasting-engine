# Calibrated Forecasting Engine

**Author:** Mohammed KM

An editorial quantitative forecasting dashboard that evaluates a single pre-registered rule — **logistic extremization (`k = 1.15`)** — on resolved binary markets from Manifold Markets at a fixed 7-day horizon before close/resolution, and tracks 20 active, non-expired live markets across **AI**, **Energy**, **Biotech**, and **Macro** domains.

## Architecture & Methodology

1. **Build-Time Resolved Backtest (`scripts/fetch_markets.py`)**
   - Queries resolved binary markets (`YES`/`NO`) from `https://api.manifold.markets/v0/markets` and `/v0/search-markets`.
   - Fetches each market's actual traded probability 7 days before close/resolution via `/v0/bets?contractId=<id>&beforeTime=<T-7d>&limit=1`.
   - Applies the single pre-registered rule `p_model = sigmoid(1.15 * logit(p_market))` (clamped to `[1%, 99%]`) and computes exact **Brier Score**, **Log-Loss**, **Brier Skill Score vs. Crowd**, and **Tail-Bin Brier Score (`<15% / >85%`)** into `public/data/markets.json`.
   - Reports exact computed results honestly, including negative skill when the crowd outperforms the mechanical rule.

2. **Append-Only Forward Ledger (`data/forward_ledger.json`)**
   - Forward track record starts **26 Nov 2026**. Live contracts are logged at snapshot time and scored only upon Manifold resolution.

3. **Live Binary Markets & Transparent Rule Trace**
   - Fetches 20 active, non-expired binary markets (strictly filtering out closed contracts and past-year deadlines).
   - Computes model probabilities using the exact same `k = 1.15` logistic extremization rule and shows exact log-odds arithmetic alongside domain backtest base rates and an explicitly labeled illustrative domain checklist template.

4. **Interactive Brier & Log-Loss Sandbox**
   - Compare expected Brier Score, Log-Loss, and KL divergence penalty for any probability from `1%` to `99%`.

## Local Usage

```bash
# Refresh build-time backtest, live markets, and forward ledger
python3 scripts/fetch_markets.py

# Install dependencies and build production bundle
npm install
npm run build

# Run local dev server
npm run dev
```

Production assets are emitted to `dist/` with `dist/index.html`.
