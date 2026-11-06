// Small DSP helpers for the sound system: shared noise buffers, impulse
// responses and a Karplus-Strong string. Everything here is generated once per
// AudioContext and reused; nothing allocates per frame.

// Deterministic PRNG so generated buffers are identical between runs (tests).
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function makeBuffer(ctx, seconds, channels = 1) {
  const len = Math.max(1, Math.round(seconds * ctx.sampleRate));
  return ctx.createBuffer(channels, len, ctx.sampleRate);
}

export function whiteNoise(ctx, seconds = 2.5, channels = 1, seed = 7) {
  const b = makeBuffer(ctx, seconds, channels);
  for (let c = 0; c < channels; c++) {
    const r = rng(seed + c * 101), d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }
  return b;
}

// Pink-ish noise (Paul Kellet's economy filter), normalised to ~0.5 peak.
export function pinkNoise(ctx, seconds = 3, channels = 1, seed = 11) {
  const b = makeBuffer(ctx, seconds, channels);
  for (let c = 0; c < channels; c++) {
    const r = rng(seed + c * 77), d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, peak = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < d.length; i++) d[i] *= 0.5 / peak;
  }
  return b;
}

// Brown (red) noise: integrated white noise with a leak, normalised.
export function brownNoise(ctx, seconds = 3, channels = 1, seed = 23) {
  const b = makeBuffer(ctx, seconds, channels);
  for (let c = 0; c < channels; c++) {
    const r = rng(seed + c * 53), d = b.getChannelData(c);
    let y = 0, peak = 0, mean = 0;
    for (let i = 0; i < d.length; i++) {
      y = (y + 0.02 * (r() * 2 - 1)) * 0.998;
      d[i] = y; mean += y;
    }
    mean /= d.length;
    for (let i = 0; i < d.length; i++) { d[i] -= mean; peak = Math.max(peak, Math.abs(d[i])); }
    for (let i = 0; i < d.length; i++) d[i] *= 0.6 / peak;
  }
  return b;
}

// Gritty crackle: sparse random clicks of random size with short decays,
// the raw material for dirt crunch and gravel. Played back faster at speed.
export function crackle(ctx, seconds = 2, density = 900, seed = 31) {
  const b = makeBuffer(ctx, seconds, 1);
  const r = rng(seed), d = b.getChannelData(0), sr = ctx.sampleRate;
  const n = Math.round(seconds * density);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(r() * d.length);
    const amp = Math.pow(r(), 2.2) * (r() < 0.5 ? -1 : 1);
    const len = Math.floor(sr * (0.0004 + r() * 0.003));
    const decay = 1 / (len * 0.35);
    for (let i = 0; i < len; i++) {
      const j = (at + i) % d.length;
      d[j] += amp * Math.exp(-i * decay) * (r() * 2 - 1);
    }
  }
  // Light background grain.
  for (let i = 0; i < d.length; i++) d[i] += (r() * 2 - 1) * 0.04;
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < d.length; i++) d[i] *= 0.9 / peak;
  return b;
}

// Exponentially decaying stereo noise with darkening tail: a cheap hall.
export function impulseResponse(ctx, seconds = 2.4, decay = 2.6, seed = 41) {
  const b = makeBuffer(ctx, seconds, 2);
  const sr = ctx.sampleRate;
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 13), d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.pow(1 - t / seconds, decay) * (t < 0.012 ? t / 0.012 : 1);
      const k = 0.85 - 0.75 * (t / seconds); // one-pole coefficient: darker later
      lp = lp + k * ((r() * 2 - 1) - lp);
      d[i] = lp * env;
    }
  }
  // Normalise energy so wet level is predictable.
  let e = 0;
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; }
  const g = 1 / Math.sqrt(e / 2 + 1e-9) * 0.9;
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return b;
}

// Karplus-Strong plucked string: a thick rope twang.
export function ksString(ctx, f0 = 98, seconds = 1.4, damp = 0.994, bright = 0.5, seed = 59) {
  const b = makeBuffer(ctx, seconds, 1);
  const r = rng(seed), d = b.getChannelData(0), sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / f0));
  const line = new Float32Array(N);
  // Excite with filtered noise (less bright = thicker rope).
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += (1 - bright * 0.8) * ((r() * 2 - 1) - lp); line[i] = lp; }
  let idx = 0, prev = 0;
  for (let i = 0; i < d.length; i++) {
    const cur = line[idx];
    const next = line[(idx + 1) % N];
    const avg = damp * (0.5 * (cur + next) * (1 - bright * 0.3) + cur * bright * 0.3);
    line[idx] = avg;
    d[i] = cur;
    idx = (idx + 1) % N;
    prev = cur;
  }
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const fadeStart = Math.floor(d.length * 0.8);
  for (let i = 0; i < d.length; i++) {
    d[i] *= 0.9 / (peak || 1);
    if (i > fadeStart) d[i] *= 1 - (i - fadeStart) / (d.length - fadeStart);
  }
  return b;
}

// Seamless looping white/pink noise is not needed (noise has no seam), but
// filtered "gust" control curves should loop smoothly: a slow random curve.
export function slowCurve(ctx, seconds = 20, points = 14, seed = 71) {
  const b = ctx.createBuffer(1, Math.round(seconds * 3000), 3000);
  const r = rng(seed), d = b.getChannelData(0);
  const pts = Array.from({length: points}, () => r());
  for (let i = 0; i < d.length; i++) {
    const x = (i / d.length) * points;
    const k = Math.floor(x), f = x - k;
    const a = pts[k % points], c = pts[(k + 1) % points];
    const s = f * f * (3 - 2 * f);
    d[i] = (a + (c - a) * s) * 2 - 1;
  }
  return b;
}


// Ocean swell envelope (0..1): irregular waves with a quick rise and a slow
// wash, looping seamlessly. Stored at a low sample rate (control signal).
export function swellCurve(ctx, seconds = 48, meanPeriod = 8, seed = 83) {
  const sr = 3000;
  const b = ctx.createBuffer(1, Math.round(seconds * sr), sr);
  const d = b.getChannelData(0), r = rng(seed), n = d.length;
  let t = 0.5;
  while (t < seconds - 1) {
    const amp = 0.45 + 0.55 * r(), rise = 0.7 + r() * 0.9, fall = 1.3 + r() * 1.7;
    for (let i = 0; i < n; i++) {
      let tt = i / sr - t;
      if (tt < 0) tt += seconds;
      const e = tt < rise ? Math.sin((tt / rise) * Math.PI / 2) : Math.exp(-(tt - rise) / fall);
      if (amp * e > d[i]) d[i] = amp * e;
    }
    t += meanPeriod * (0.6 + 0.8 * r());
  }
  return b;
}

// Wood/rope creak: stick-slip pulses at a wandering rate driving a few
// resonators. Used for the net catching a pumpkin.
export function creak(ctx, seconds = 0.95, seed = 97) {
  const b = makeBuffer(ctx, seconds, 1);
  const sr = ctx.sampleRate, d = b.getChannelData(0), r = rng(seed), n = d.length;
  const x = new Float32Array(n);
  let t = 0.005;
  while (t < seconds * 0.92) {
    const u = t / seconds;
    const rate = 28 + 90 * Math.sin(Math.PI * Math.min(1, u * 1.3)); // slow, faster, slow
    const env = Math.sin(Math.PI * Math.min(1, u / 0.92)) ** 0.6;
    const i = Math.floor(t * sr);
    if (i < n) x[i] = (0.5 + 0.5 * r()) * env * (r() < 0.5 ? -1 : 1);
    t += (1 / rate) * (0.8 + 0.4 * r());
  }
  for (const [f, Q, g] of [[380, 14, 1], [1020, 10, 0.7], [2450, 7, 0.35]]) {
    const rr = Math.exp(-Math.PI * f / Q / sr), a1 = 2 * rr * Math.cos(2 * Math.PI * f / sr), a2 = -rr * rr;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = (1 - rr) * x[i] + a1 * y1 + a2 * y2;
      y2 = y1; y1 = y; d[i] += y * g;
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] *= 0.9 / (peak || 1);
  return b;
}
