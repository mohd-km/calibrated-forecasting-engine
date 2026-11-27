import React from 'react';
import ReactDOM from 'react-dom/client';
import './shell/shell.css';
import { Shell, type ShellConfig } from './shell/Shell';
import DefaultTab from './modules/calibration/Calibration';

const config: ShellConfig = {
  pillar: 'quant & science',
  title: 'Calibrated Forecasting & Risk Lab',
  subtitle:
    'Quantitative probabilistic reasoning, end to end: calibrate forecasts against real resolved prediction markets, stress-test risk for Mandelbrot fat tails, and update beliefs correctly with Bayes.',
  footer: 'Calibrated Forecasting & Risk Lab · runs entirely in your browser · Mohammed KM',
  tabs: [
    {
      id: 'calibration', label: 'Market calibration', sub: 'Manifold backtest · k · Brier · ledger', scope: 'calibration',
      provenance: [{ kind: 'real', label: 'Manifold Markets resolved markets' }, { kind: 'model', label: 'logistic calibration transform' }],
      component: DefaultTab,
      load: () => import('./modules/calibration/Calibration'),
    },
    {
      id: 'fat-tails', label: 'Fat tails vs Gaussian', sub: 'α-stable · Hurst H · drawdowns', scope: 'fractal',
      provenance: [{ kind: 'model', label: 'stable & fractal processes, simulated paths' }],
      load: () => import('./modules/fractal/FatTails'),
    },
    {
      id: 'bayes', label: 'Bayes & statistical traps', sub: 'posterior · Simpson · base rates', scope: 'fractal',
      provenance: [{ kind: 'model', label: "Bayes' theorem; illustrative numbers" }],
      load: () => import('./modules/fractal/Bayes'),
    },
  ],
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Shell config={config} />
  </React.StrictMode>,
);
