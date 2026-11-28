# Calibrated Forecasting & Risk Lab

Live: https://forecast.mohammed-km.in

When a prediction market says 70%, the event should happen about 7 times in 10. This lab checks that on real, finished Manifold Markets questions, then shows two other ways chance fools people: fat-tailed crashes and rare-event tests.

It merges the calibrated forecasting engine and the fractal markets and Bayesian lab. The old quant.mohammed-km.in address redirects to #fat-tails.

## Modules

- **#calibration**: backtest on real finished Manifold questions, each priced 7 days before close. Drag the boldness dial k (extremising) and the Brier score (average error), log-loss (surprise penalty), accuracy on confident calls and the reliability curve all update. A forward ledger logs open questions once and scores them only after they settle.
- **#fat-tails**: a Mandelbrot fat-tailed market next to a Gaussian (bell-curve) one. Tail index alpha, Hurst H (trend memory) and a half-life drive the price paths, a smoothed histogram (KDE) against the normal curve, and a drawdown chart. CSV export included.
- **#bayes**: a Bayes' rule updater with medical-test, trading-signal and startup-filter presets, plus small playgrounds for Simpson's paradox and the base-rate fallacy.

Tabs are deep-linkable, e.g. `https://forecast.mohammed-km.in/#bayes`.

## Real vs modelled

Finished market outcomes and prices come from the public Manifold Markets API. The fat-tail price paths and the Bayes presets are modelled with illustrative inputs.

## Run locally

```bash
npm install
npm run dev
npm run build
```

Built by [Mohammed KM](https://mohammed-km.in).
