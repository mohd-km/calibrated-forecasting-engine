# Calibrated Forecasting & Risk Lab

Live: https://forecast.mohammed-km.in

A quantitative probabilistic-reasoning workbench: calibrate forecasts against real resolved prediction markets, stress-test risk for fat tails, and update beliefs correctly with Bayes.

Merges the calibrated forecasting engine and the fractal markets & Bayesian lab. Old quant.mohammed-km.in redirects to #fat-tails.

## Modules

- **#calibration**: Live backtest on real resolved Manifold markets: drag the k (extremising) slider and watch Brier score, log-loss, tail-bin accuracy and the reliability curve update; forward-only forecast ledger.
- **#fat-tails**: Mandelbrot fat-tail vs Gaussian simulator: tail index alpha, Hurst H and half-life drive live price paths and a KDE vs Normal drawdown comparison, with CSV export.
- **#bayes**: Bayesian posterior updater with medical-test, trading-signal and VC deal-filter presets, plus Simpson's paradox and base-rate fallacy playgrounds.

Tabs are deep-linkable, e.g. `https://forecast.mohammed-km.in/#bayes`.

## Real vs modelled

Resolved market outcomes and probabilities come from the public Manifold Markets API; fat-tail paths and Bayesian presets are modelled with illustrative inputs.

## Run locally

```bash
npm install
npm run dev
npm run build
```

Built by [Mohammed KM](https://mohammed-km.in).
