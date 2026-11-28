import React from 'react';
import ReactDOM from 'react-dom/client';
import './shell/shell.css';
import { Shell, type ShellConfig } from './shell/Shell';
import DefaultTab from './modules/calibration/Calibration';

const config: ShellConfig = {
  pillar: 'quant & science',
  title: 'Calibrated Forecasting & Risk Lab',
  subtitle:
    'Three tools about chance. One scores real crowd forecasts against what actually happened. The other two show how much more often crashes come when markets have fat tails, and how a belief should move when new evidence arrives.',
  footer: 'Calibrated Forecasting & Risk Lab · runs entirely in your browser · Mohammed KM',
  tabs: [
    {
      id: 'calibration', label: 'Market calibration', sub: 'Is the crowd honest about chance?', scope: 'calibration',
      story: {
        problem:
          'On a prediction market people bet on questions like "Will this AI model launch by June?", and the price works as a probability. A 70% price is honest only if such events happen about 7 times in 10. Most people never check.',
        how:
          'Every question here is a real, finished yes/no market on Manifold Markets. The crowd\'s price one week before close is scored against the actual outcome. A boldness dial (k) then pushes each forecast toward 50% or away from it, hence you can see whether a more cautious or a bolder crowd would have done better.',
        tryThis:
          'Click "Bold 1.50" under the dial. The average error (Brier score) in the first card goes up, so bolder was worse here. Then press "Best fit k*" to jump to the setting that scored best on this history.',
      },
      provenance: [{ kind: 'real', label: 'finished Manifold Markets questions' }, { kind: 'model', label: 'boldness dial applied to crowd prices' }],
      component: DefaultTab,
      load: () => import('./modules/calibration/Calibration'),
    },
    {
      id: 'fat-tails', label: 'Fat tails vs Gaussian', sub: 'Rare crashes vs the bell curve', scope: 'fractal',
      story: {
        problem:
          'Many risk models assume daily market moves follow a bell curve, where a huge crash is close to impossible. Real markets crash far more often. This tab puts a number on that gap.',
        how:
          'Two simulated markets run side by side with the same typical daily move. One follows the bell curve. The other has fat tails (rare huge moves come far more often) and some trend memory. Both use the same random seed, so every slider change is a like-for-like comparison.',
        tryThis:
          'Drag "How wild the tails are (α)" down to 1.30. Shock days go from 0 to 4, and the worst fall from a peak deepens to about 43%, as compared to about 33% for the bell-curve market.',
      },
      provenance: [{ kind: 'model', label: 'simulated price paths, not real prices' }],
      load: () => import('./modules/fractal/FatTails'),
    },
    {
      id: 'bayes', label: 'Bayes & statistical traps', sub: 'Updating beliefs, avoiding traps', scope: 'fractal',
      story: {
        problem:
          'A test that is "99% accurate" says you have a rare condition. Most people would then put their chances at 99%. For a condition 1 in 100 people have, the real answer is 50%, a coin toss.',
        how:
          'Bayes\' rule starts from how common something is (the prior). It then weighs how much more likely the evidence is if the thing is true (the likelihood) and gives the updated belief (the posterior). The grid shows the same sum as 1,000 people tested.',
        tryThis:
          'With "Medical test" selected the big number reads 50%. Press "Add another positive result" and it jumps to 99%, because a second independent positive multiplies the odds by 99 again.',
      },
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
