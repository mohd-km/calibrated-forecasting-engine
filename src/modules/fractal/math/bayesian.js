export const BAYESIAN_PRESETS = {
  medical: {
    id: 'medical',
    label: 'Medical test',
    prior: 0.01,
    sensitivity: 0.99,
    fpr: 0.01,
    hypothesisLabel: 'Condition present',
    evidenceLabel: 'Positive screen',
    summary: 'A 99% accurate test for something only 1 in 100 people have: half of all positive results are false alarms.'
  },
  trading: {
    id: 'trading',
    label: 'Trading signal',
    prior: 0.08,
    sensitivity: 0.72,
    fpr: 0.15,
    hypothesisLabel: 'True alpha regime',
    evidenceLabel: 'Indicator trigger',
    summary: 'When real opportunities are rare, most trading signals fire on noise.'
  },
  vc: {
    id: 'vc',
    label: 'Startup filter',
    prior: 0.02,
    sensitivity: 0.8,
    fpr: 0.1,
    hypothesisLabel: 'Outlier company',
    evidenceLabel: 'Top-tier signal',
    summary: 'Huge startup winners are so rare that even a strong filter mostly flags companies that will not be one.'
  }
};

export function computeBayes({ prior, sensitivity, fpr, signals = 1 }) {
  const p = Math.max(0.0005, Math.min(0.9995, prior));
  const sens = Math.max(0.001, Math.min(0.9999, sensitivity));
  const fp = Math.max(0.0005, Math.min(0.999, fpr));

  // Single positive signal
  const pEvidence = sens * p + fp * (1 - p);
  const posteriorSingle = (sens * p) / pEvidence;

  // Sequential independent positive signals
  let currentPrior = p;
  const trajectory = [p];
  for (let k = 0; k < signals; k++) {
    const num = sens * currentPrior;
    const den = num + fp * (1 - currentPrior);
    currentPrior = num / den;
    trajectory.push(currentPrior);
  }
  const posterior = currentPrior;

  // Posterior if single test is negative
  const fnRate = 1 - sens;
  const tnRate = 1 - fp;
  const pNegEvidence = fnRate * p + tnRate * (1 - p);
  const posteriorNegative = (fnRate * p) / Math.max(pNegEvidence, 1e-12);

  // Positive likelihood ratio (Bayes factor for one positive signal)
  const bayesFactor = sens / fp;
  const lift = posterior / p;

  // Natural frequency breakdown out of 1,000 cases (for 1 signal)
  const total = 1000;
  const tp = p * sens * total;
  const fn = p * (1 - sens) * total;
  const fpCount = (1 - p) * fp * total;
  const tn = (1 - p) * (1 - fp) * total;

  // Curve of P(H|E) across all priors 0..1
  const curve = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    let cur = x;
    for (let k = 0; k < signals; k++) {
      const n = sens * cur;
      const d = n + fp * (1 - cur);
      cur = d > 0 ? n / d : 0;
    }
    curve.push({ prior: x, posterior: cur });
  }

  return {
    prior: p,
    sensitivity: sens,
    fpr: fp,
    signals,
    posteriorSingle,
    posterior,
    posteriorNegative,
    pEvidence,
    bayesFactor,
    lift,
    trajectory,
    counts: {
      total,
      tp,
      fp: fpCount,
      fn,
      tn
    },
    curve
  };
}
