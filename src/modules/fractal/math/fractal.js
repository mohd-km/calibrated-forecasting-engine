// Seeded PRNG (Mulberry32) for reproducible comparisons across slider tweaks
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller standard normal draw
function sampleNormal(rng) {
  let u1 = rng();
  let u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Chambers-Mallows-Stuck symmetric alpha-stable draw, normalized so alpha=2 -> N(0,1)
function sampleSymmetricStable(alpha, rng) {
  if (alpha >= 1.999) {
    return sampleNormal(rng);
  }
  const u = (rng() - 0.5) * Math.PI; // (-pi/2, pi/2)
  let w = -Math.log(Math.max(rng(), 1e-12)); // Exp(1)
  const cosU = Math.cos(u);
  const sinAlphaU = Math.sin(alpha * u);
  const factor = sinAlphaU / Math.pow(Math.max(cosU, 1e-12), 1 / alpha);
  const tail = Math.pow(
    Math.max(Math.cos(u - alpha * u), 1e-12) / w,
    (1 - alpha) / alpha
  );
  // Scale by 1/sqrt(2) so alpha -> 2 converges smoothly to unit variance Gaussian
  const raw = (factor * tail) / Math.SQRT2;
  // Soft guard against numerical overflow while preserving genuine 10-15 sigma shocks
  return Math.max(-18, Math.min(18, raw));
}

// Cache Cholesky lower-triangular factor of fGn covariance matrix by H
const choleskyCache = new Map();

function getFgnCholesky(n, H) {
  const key = `${n}_${H.toFixed(2)}`;
  if (choleskyCache.has(key)) return choleskyCache.get(key);

  // If H is effectively 0.5 (random walk), return null as fast identity path
  if (Math.abs(H - 0.5) < 0.005) {
    choleskyCache.set(key, null);
    return null;
  }

  const twoH = 2 * H;
  const gamma = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    if (k === 0) {
      gamma[k] = 1;
    } else {
      gamma[k] =
        0.5 *
        (Math.pow(k + 1, twoH) - 2 * Math.pow(k, twoH) + Math.pow(k - 1, twoH));
    }
  }

  // Lower triangular Cholesky stored flat
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = gamma[i - j];
      const rowI = i * n;
      const rowJ = j * n;
      for (let k = 0; k < j; k++) {
        sum -= L[rowI + k] * L[rowJ + k];
      }
      if (i === j) {
        L[rowI + j] = Math.sqrt(Math.max(sum, 1e-10));
      } else {
        L[rowI + j] = sum / L[rowJ + j];
      }
    }
  }

  choleskyCache.set(key, L);
  return L;
}

export function simulateMarket({
  alpha = 1.65,
  hurst = 0.65,
  halfLife = 60,
  steps = 252,
  seed = 42,
  dailyVol = 0.0115
}) {
  const rngFractal = createRng(seed);
  const rngGauss = createRng(seed + 104729);

  // Raw innovations
  const zStable = new Float64Array(steps);
  const zGauss = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    zStable[i] = sampleSymmetricStable(alpha, rngFractal);
    zGauss[i] = sampleNormal(rngGauss);
  }

  // Apply Hurst long-memory filter via exact fGn Cholesky
  const L = getFgnCholesky(steps, hurst);
  const epsFractal = new Float64Array(steps);
  if (!L) {
    for (let i = 0; i < steps; i++) epsFractal[i] = zStable[i];
  } else {
    for (let i = 0; i < steps; i++) {
      let sum = 0;
      const row = i * steps;
      for (let j = 0; j <= i; j++) {
        sum += L[row + j] * zStable[j];
      }
      epsFractal[i] = sum;
    }
  }

  // Ornstein-Uhlenbeck mean-reversion rate (halfLife >= 250 treated as Off / pure walk)
  const theta = halfLife >= 250 ? 0 : 1 - Math.pow(2, -1 / halfLife);

  const fractalPrices = new Float64Array(steps + 1);
  const gaussPrices = new Float64Array(steps + 1);
  const fractalReturns = new Float64Array(steps);
  const gaussReturns = new Float64Array(steps);
  const fractalDD = new Float64Array(steps + 1);
  const gaussDD = new Float64Array(steps + 1);

  fractalPrices[0] = 100;
  gaussPrices[0] = 100;

  let logF = 0;
  let logG = 0;
  let peakF = 100;
  let peakG = 100;
  let maxDdF = 0;
  let maxDdG = 0;

  for (let t = 0; t < steps; t++) {
    const rF = -theta * logF + dailyVol * epsFractal[t];
    const rG = dailyVol * zGauss[t];

    // Clamp extreme single-day log return so price remains strictly positive and plottable
    const clampedRF = Math.max(-0.45, Math.min(0.45, rF));
    logF += clampedRF;
    logG += rG;

    const pF = 100 * Math.exp(logF);
    const pG = 100 * Math.exp(logG);

    fractalReturns[t] = clampedRF;
    gaussReturns[t] = rG;
    fractalPrices[t + 1] = pF;
    gaussPrices[t + 1] = pG;

    if (pF > peakF) peakF = pF;
    if (pG > peakG) peakG = pG;

    const ddF = (pF - peakF) / peakF;
    const ddG = (pG - peakG) / peakG;
    fractalDD[t + 1] = ddF;
    gaussDD[t + 1] = ddG;

    if (ddF < maxDdF) maxDdF = ddF;
    if (ddG < maxDdG) maxDdG = ddG;
  }

  const statsF = computeReturnStats(fractalReturns);
  const statsG = computeReturnStats(gaussReturns);
  const kde = computeKdeAndNormal(fractalReturns, statsF);

  return {
    params: { alpha, hurst, halfLife, steps, seed },
    fractalDimension: 2 - hurst,
    fractalPrices,
    gaussPrices,
    fractalReturns,
    gaussReturns,
    fractalDD,
    gaussDD,
    maxDdF,
    maxDdG,
    statsF,
    statsG,
    kde
  };
}

function computeReturnStats(arr) {
  const n = arr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;

  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
  }
  const variance = m2 / Math.max(n - 1, 1);
  const std = Math.sqrt(Math.max(variance, 1e-12));
  const excessKurtosis = m2 > 0 ? (m4 / n) / Math.pow(m2 / n, 2) - 3 : 0;

  let tail3Sigma = 0;
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const absZ = Math.abs(arr[i] - mean) / std;
    if (absZ > 3) tail3Sigma++;
    if (Math.abs(arr[i]) > maxAbs) maxAbs = Math.abs(arr[i]);
  }

  return { mean, std, excessKurtosis, tail3Sigma, maxAbs };
}

// Gaussian Kernel Density Estimate (Silverman bandwidth) vs matched Normal PDF
function computeKdeAndNormal(returns, stats) {
  const n = returns.length;
  const sorted = Float64Array.from(returns).sort();
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const robustSigma = iqr > 0 ? Math.min(stats.std, iqr / 1.34) : stats.std;
  const bandwidth = Math.max(0.9 * robustSigma * Math.pow(n, -0.2), 0.0025);

  const bound = Math.max(4.5 * stats.std, stats.maxAbs * 1.08, 0.04);
  const points = 120;
  const xs = new Float64Array(points);
  const kdeY = new Float64Array(points);
  const normY = new Float64Array(points);

  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  const normDenom = n * bandwidth;
  let maxY = 0;

  for (let i = 0; i < points; i++) {
    const x = -bound + (2 * bound * i) / (points - 1);
    xs[i] = x;

    let sumK = 0;
    for (let j = 0; j < n; j++) {
      const u = (x - returns[j]) / bandwidth;
      if (Math.abs(u) < 5) {
        sumK += Math.exp(-0.5 * u * u);
      }
    }
    const ky = (sumK * invSqrt2Pi) / normDenom;
    const z = (x - stats.mean) / stats.std;
    const ny = (invSqrt2Pi / stats.std) * Math.exp(-0.5 * z * z);

    kdeY[i] = ky;
    normY[i] = ny;
    if (ky > maxY) maxY = ky;
    if (ny > maxY) maxY = ny;
  }

  return { xs, kdeY, normY, maxY, bound, bandwidth };
}

export function buildMarketCsv(sim) {
  const rows = [
    'day,fractal_price,gaussian_price,fractal_return_pct,gaussian_return_pct,fractal_drawdown_pct,gaussian_drawdown_pct'
  ];
  const steps = sim.params.steps;
  for (let t = 0; t <= steps; t++) {
    const fRet = t === 0 ? 0 : sim.fractalReturns[t - 1] * 100;
    const gRet = t === 0 ? 0 : sim.gaussReturns[t - 1] * 100;
    rows.push(
      [
        t,
        sim.fractalPrices[t].toFixed(4),
        sim.gaussPrices[t].toFixed(4),
        fRet.toFixed(4),
        gRet.toFixed(4),
        (sim.fractalDD[t] * 100).toFixed(4),
        (sim.gaussDD[t] * 100).toFixed(4)
      ].join(',')
    );
  }
  return rows.join('\n');
}
