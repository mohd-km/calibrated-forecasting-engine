import React from 'react';
import ReactDOM from 'react-dom/client';
import './shell/shell.css';
import { Shell, type ShellConfig } from './shell/Shell';
import DefaultTab from './modules/calibration/Calibration';

const config: ShellConfig = {
  pillar: 'quant & science',
  title: 'Calibrated Forecasting & Risk Lab',
  subtitle:
    'Three tools for thinking clearly about chance: check whether crowd forecasts are honest against real outcomes, see how often rare crashes really happen, and update a belief correctly when new evidence arrives.',
  footer: 'Calibrated Forecasting & Risk Lab · runs entirely in your browser · Mohammed KM',
  tabs: [
    {
      id: 'calibration', label: 'Market calibration', sub: 'Is the crowd honest about chance?', scope: 'calibration',
      story: {
        problem:
          'On prediction markets, people bet on questions like "Will this AI model launch by June?" and the price becomes a probability. But are those probabilities honest? When the crowd says 70%, it should happen about 7 times in 10.',
        how:
          'We took real, finished yes/no questions from Manifold Markets, recorded the crowd\'s price one week before each one closed, and scored it against what actually happened. A boldness dial (k) then pushes every forecast toward or away from 50%, so you can test whether a bolder or more cautious crowd would have scored better.',
        tryThis:
          'Click "Bold 1.50" under the dial: the average error (Brier score) in the first card goes up, meaning worse. Then press "Best fit k*" to jump to the setting that would have scored best on this history.',
      },
      provenance: [{ kind: 'real', label: 'finished Manifold Markets questions' }, { kind: 'model', label: 'boldness dial applied to crowd prices' }],
      component: DefaultTab,
      load: () => import('./modules/calibration/Calibration'),
    },
    {
      id: 'fat-tails', label: 'Fat tails vs Gaussian', sub: 'Rare crashes vs the bell curve', scope: 'fractal',
      story: {
        problem:
          'Many risk models assume market moves follow a bell curve, where huge crashes are almost impossible. Real markets crash far more often than that. This tab shows how big the gap is.',
        how:
          'Two markets are simulated side by side with the same everyday wobble: a bell-curve market, and a fat-tailed one where rare huge moves happen far more often and trends can persist. A fixed random seed makes every slider change a fair, like-for-like comparison.',
        tryThis:
          'Drag "How wild the tails are (α)" down to 1.30: shock days jump from 0 to 4 and the worst fall from a peak deepens to about 43%, against about 33% for the bell-curve market.',
      },
      provenance: [{ kind: 'model', label: 'simulated price paths, not real prices' }],
      load: () => import('./modules/fractal/FatTails'),
    },
    {
      id: 'bayes', label: 'Bayes & statistical traps', sub: 'Updating beliefs, avoiding traps', scope: 'fractal',
      story: {
        problem:
          'A test that is "99% accurate" says you have a rare condition. How worried should you be? Most people guess 99%. The real answer is often closer to a coin toss.',
        how:
          'Bayes\' rule updates a belief step by step: start with how common something is (the prior), weigh how much more likely the evidence is if it is true (the likelihood), and get an updated belief (the posterior). The grid shows the same sum as 1,000 people tested.',
        tryThis:
          'With "Medical test" selected, the big number reads 50%. Press "Add another positive result" and it jumps to 99%: a second independent positive changes everything.',
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
