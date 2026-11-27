export const SIMPSON_SCENARIOS = {
  quant: {
    id: 'quant',
    label: 'Quant strategy alpha',
    actorA: 'Model A',
    actorB: 'Model B',
    metricLabel: 'Win rate',
    easyLabel: 'Calm regime',
    hardLabel: 'Stress regime',
    // Model A beats Model B in BOTH regimes
    aEasy: 0.9,
    bEasy: 0.84,
    aHard: 0.45,
    bHard: 0.35,
    defaultWeightA: 0.82, // Model A tested mostly in stress regime
    defaultWeightB: 0.22 // Model B tested mostly in calm regime
  },
  clinical: {
    id: 'clinical',
    label: 'Clinical treatment',
    actorA: 'Treatment A',
    actorB: 'Treatment B',
    metricLabel: 'Recovery rate',
    easyLabel: 'Mild cases',
    hardLabel: 'Severe cases',
    aEasy: 0.93,
    bEasy: 0.87,
    aHard: 0.73,
    bHard: 0.69,
    defaultWeightA: 0.78,
    defaultWeightB: 0.24
  }
};

export function computeSimpson({ scenarioId = 'quant', weightA, weightB }) {
  const s = SIMPSON_SCENARIOS[scenarioId] || SIMPSON_SCENARIOS.quant;
  const wA = Math.max(0, Math.min(1, weightA));
  const wB = Math.max(0, Math.min(1, weightB));

  const aggA = (1 - wA) * s.aEasy + wA * s.aHard;
  const aggB = (1 - wB) * s.bEasy + wB * s.bHard;

  // In both subgroups A > B; paradox occurs when aggregate A < B
  const paradoxActive = aggA < aggB;
  const gap = aggA - aggB;

  return {
    scenario: s,
    weightA: wA,
    weightB: wB,
    aggA,
    aggB,
    paradoxActive,
    gap
  };
}

export function computeBaseRateTrap({ baseRate = 0.01, errorRate = 0.01 }) {
  const p = Math.max(0.001, Math.min(0.5, baseRate));
  const e = Math.max(0.005, Math.min(0.25, errorRate));
  const sensitivity = 1 - e;
  const fpr = e;

  const tpArea = p * sensitivity;
  const fnArea = p * (1 - sensitivity);
  const fpArea = (1 - p) * fpr;
  const tnArea = (1 - p) * (1 - fpr);

  const totalPositives = tpArea + fpArea;
  const truePositiveShare = tpArea / totalPositives;
  const falseAlarmShare = fpArea / totalPositives;

  return {
    baseRate: p,
    errorRate: e,
    accuracy: 1 - e,
    tpArea,
    fnArea,
    fpArea,
    tnArea,
    truePositiveShare,
    falseAlarmShare,
    per10k: {
      tp: Math.round(tpArea * 10000),
      fp: Math.round(fpArea * 10000),
      fn: Math.round(fnArea * 10000),
      tn: Math.round(tnArea * 10000)
    }
  };
}
