// One-shot sound effects: recorded samples where we have them, synthesis for
// the rest and as a fallback when a file is missing. Each call builds a short
// "voice" (a handful of nodes) that is disposed when it finishes. Polyphony is
// capped and per-name gaps stop stacking at high playback speeds.

const NAMES = ['countdown', 'go', 'gate', 'land', 'shatter', 'netSnap', 'netCatch', 'finish', 'win', 'dq',
  'whistle', 'cheer', 'gasp', 'whoosh', 'splash'];

// Minimum real seconds between two plays of the same name (scaled up when fast-forwarding),
// how many may ring at once, priority for voice stealing, and whether a position is honoured.
const RULES = {
  countdown: {gap: 0.2, max: 1, prio: 9, ui: true, level: 0.85},
  go:        {gap: 0.5, max: 1, prio: 9, ui: true, level: 0.7},
  gate:      {gap: 0.05, max: 2, prio: 6, spatial: true, level: 0.45},
  land:      {gap: 0.09, max: 3, prio: 5, spatial: true, level: 1.1},
  shatter:   {gap: 0.25, max: 2, prio: 8, spatial: true, level: 1.4},
  netSnap:   {gap: 0.25, max: 2, prio: 7, spatial: true, level: 1.45},
  netCatch:  {gap: 0.25, max: 2, prio: 6, spatial: true, level: 1.05},
  finish:    {gap: 0.14, max: 3, prio: 7, level: 0.8},
  win:       {gap: 3, max: 1, prio: 9, level: 1},
  dq:        {gap: 2, max: 1, prio: 9, level: 1},
  whistle:   {gap: 0.5, max: 1, prio: 7, level: 1},
  cheer:     {gap: 1.2, max: 2, prio: 4, level: 1},
  gasp:      {gap: 1.5, max: 1, prio: 4, level: 0.72},
  whoosh:    {gap: 0.18, max: 3, prio: 3, spatial: true, level: 1.1},
  splash:    {gap: 0.4, max: 2, prio: 5, spatial: true, level: 0.88},
  slowIn:    {gap: 0.6, max: 1, prio: 6, ui: true, level: 1},
  slowOut:   {gap: 0.6, max: 1, prio: 3, ui: true, level: 1},
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

class Voice {
  constructor(E, name, dest, t) {
    this.E = E; this.name = name; this.t = t; this.end = t + 0.05;
    this.out = E.ctx.createGain();
    this.out.connect(dest);
    this.nodes = [this.out]; this.sources = [];
    this.prio = (RULES[name] || {}).prio || 5;
    this.born = t;
  }
  keep(n) { this.nodes.push(n); return n; }
  addSource(s, t, dur) {
    this.sources.push(s); this.nodes.push(s);
    this.end = Math.max(this.end, t + dur + 0.05);
    s.onended = null;
  }
  stop(fade = 0.04) {
    const ctx = this.E.ctx, t = ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(0, t + fade);
    } catch (e) { /* ignore */ }
    for (const s of this.sources) { try { s.stop(t + fade + 0.01); } catch (e) { /* not started */ } }
    this.end = Math.min(this.end, t + fade + 0.03);
  }
  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    this.nodes.length = 0; this.sources.length = 0;
  }
}

// --- Building blocks -------------------------------------------------------

// Gain envelope: attack to peak, optional hold, exponential-ish release.
function envelope(param, t, a, peak, hold, rel) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  if (hold > 0) param.setValueAtTime(peak, t + a + hold);
  param.setTargetAtTime(0, t + a + hold, Math.max(0.005, rel / 4));
}

// Play an AudioBuffer (or a sprite region of it) into the voice.
function sample(v, key, o = {}) {
  const E = v.E, ctx = E.ctx;
  const buf = E.buffer(key);
  if (!buf) return false;
  const spr = E.sprite(key, o.sprite);
  const t = o.t ?? v.t;
  const rate = (o.rate ?? 1) * (o.pitch ?? 1);
  const off = spr ? spr[0] : 0;
  const len = spr ? spr[1] : buf.duration;
  const dur = Math.min(len, o.dur ?? len);
  const s = ctx.createBufferSource();
  s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain();
  const gain = o.gain ?? 1;
  const realDur = dur / rate;
  const fadeOut = Math.min(o.fadeOut ?? 0.03, realDur * 0.5);
  g.gain.setValueAtTime(o.fadeIn ? 0 : gain, t);
  if (o.fadeIn) g.gain.linearRampToValueAtTime(gain, t + o.fadeIn);
  g.gain.setValueAtTime(gain, t + Math.max(o.fadeIn || 0, realDur - fadeOut));
  g.gain.linearRampToValueAtTime(0, t + realDur);
  s.connect(g); g.connect(o.dest || v.out);
  v.keep(g);
  s.start(t, off, dur + 0.01);
  v.addSource(s, t, realDur);
  return true;
}

function tone(v, o) {
  const ctx = v.E.ctx, t = o.t ?? v.t;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  const p = o.pitch ?? 1;
  const total = (o.a ?? 0.005) + (o.hold ?? 0) + (o.rel ?? 0.1);
  osc.frequency.setValueAtTime(o.f * p, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * p, t + Math.max(0.005, o.glide ?? o.dur ?? total));
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  envelope(g.gain, t, o.a ?? 0.005, o.gain ?? 0.3, o.hold ?? 0, o.rel ?? 0.1);
  let last = osc;
  if (o.lp) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.lpQ ?? 0.7;
    if (o.lpEnv) { f.frequency.setValueAtTime(o.lp, t); f.frequency.linearRampToValueAtTime(o.lpEnv, t + (o.a ?? 0.005) + 0.08); f.frequency.setTargetAtTime(o.lp, t + 0.12, 0.25); }
    osc.connect(f); last = f; v.keep(f);
  }
  last.connect(g); g.connect(o.dest || v.out); v.keep(g);
  const end = t + (o.a ?? 0.005) + (o.hold ?? 0) + (o.rel ?? 0.1) * 1.6;
  osc.start(t); osc.stop(end);
  v.addSource(osc, t, end - t);
  return osc;
}

// Filtered noise burst. color: white|pink|brown|crackle.
function noise(v, o) {
  const E = v.E, ctx = E.ctx, t = o.t ?? v.t;
  const s = ctx.createBufferSource();
  s.buffer = E.noise[o.color || 'white'];
  s.loop = true;
  s.playbackRate.value = (o.rate ?? 1) * (o.pitch ?? 1);
  let last = s;
  const p = o.pitch ?? 1;
  const dur0 = Math.max(0.01, o.dur ?? ((o.a ?? 0.003) + (o.hold ?? 0) + (o.rel ?? 0.15)));
  for (const flt of (o.filters || (o.filter ? [o.filter] : []))) {
    const f = ctx.createBiquadFilter();
    f.type = flt.type || 'bandpass';
    f.frequency.setValueAtTime(flt.f * p, t);
    if (flt.f2) {
      if (flt.f3) {
        f.frequency.exponentialRampToValueAtTime(flt.f2 * p, t + (flt.t2 ?? dur0 * 0.5));
        f.frequency.exponentialRampToValueAtTime(flt.f3 * p, t + (flt.t3 ?? dur0));
      } else f.frequency.exponentialRampToValueAtTime(flt.f2 * p, t + (flt.glide ?? dur0));
    }
    f.Q.value = flt.Q ?? 0.8;
    if (flt.gain != null) f.gain.value = flt.gain;
    last.connect(f); last = f; v.keep(f);
  }
  const g = ctx.createGain();
  envelope(g.gain, t, o.a ?? 0.003, o.gain ?? 0.3, o.hold ?? 0, o.rel ?? 0.15);
  last.connect(g); g.connect(o.dest || v.out); v.keep(g);
  const dur = (o.a ?? 0.003) + (o.hold ?? 0) + (o.rel ?? 0.15) * 1.6;
  s.start(t, Math.random() * 1.5); s.stop(t + dur);
  v.addSource(s, t, dur);
  return g;
}

function stereo(v, pan) {
  const ctx = v.E.ctx;
  if (!ctx.createStereoPanner) return v.out;
  const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
  p.connect(v.out); v.keep(p);
  return p;
}

// --- Synthesised fallbacks for recorded material ---------------------------

// Crowd vowel: noise through formant band-passes with a swelling envelope.
// Used for cheer/gasp/ohh when the recordings are unavailable.
function synthCrowd(v, o) {
  const formants = o.vowel === 'oh' ? [[400, 5], [800, 6], [2600, 8]] : o.vowel === 'ah' ? [[750, 5], [1200, 6], [2600, 8]] : [[600, 3], [1500, 3], [3200, 4]];
  const dur = o.dur ?? 2.5;
  for (let k = 0; k < 6; k++) {
    const t = (o.t ?? v.t) + Math.random() * 0.25;
    const f = formants[k % formants.length];
    const det = 0.85 + Math.random() * 0.3;
    noise(v, {t, color: 'pink', dur, a: o.a ?? 0.25, hold: dur * 0.4, rel: dur * 0.5, gain: (o.gain ?? 0.3) * 2.6 * (k < 3 ? 1 : 0.6),
      filters: [{type: 'bandpass', f: f[0] * det, f2: f[0] * det * (o.fall ?? 0.9), Q: f[1]}], pitch: o.pitch, dest: o.dest});
  }
}

function synthWhistle(v, o) {
  const ctx = v.E.ctx, t = o.t ?? v.t, p = o.pitch ?? 1;
  const blasts = o.blasts || [[0, 0.32], [0.42, 0.75]];
  for (const [st, len] of blasts) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.value = 2900 * p;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const lg = ctx.createGain(); lg.gain.value = 140 * p;
    lfo.connect(lg); lg.connect(osc.frequency);
    const g = ctx.createGain();
    envelope(g.gain, t + st, 0.015, (o.gain ?? 0.25), len, 0.05);
    osc.connect(g); g.connect(o.dest || v.out);
    v.keep(lg); v.keep(g);
    osc.start(t + st); lfo.start(t + st); osc.stop(t + st + len + 0.2); lfo.stop(t + st + len + 0.2);
    v.addSource(osc, t + st, len + 0.2); v.addSource(lfo, t + st, len + 0.2);
    noise(v, {t: t + st, dur: len, a: 0.01, hold: len, rel: 0.05, gain: (o.gain ?? 0.25) * 0.15, filter: {type: 'bandpass', f: 3000, Q: 2}, pitch: p, dest: o.dest});
  }
}

function synthSplash(v, o) {
  const g = o.gain ?? 0.5;
  noise(v, {t: o.t, color: 'white', dur: 0.9, a: 0.004, hold: 0.05, rel: 0.7, gain: g, filter: {type: 'lowpass', f: 5000, f2: 900, Q: 0.5}, pitch: o.pitch, dest: o.dest});
  noise(v, {t: o.t, color: 'brown', dur: 0.5, a: 0.002, rel: 0.3, gain: g * 0.9, filter: {type: 'lowpass', f: 400, Q: 0.7}, pitch: o.pitch, dest: o.dest});
  for (let k = 0; k < 6; k++) {
    tone(v, {t: (o.t ?? v.t) + 0.08 + Math.random() * 0.5, f: 900 + Math.random() * 1200, f2: 1800 + Math.random() * 1500, dur: 0.04, a: 0.002, rel: 0.05, gain: g * 0.08, pitch: o.pitch, dest: o.dest});
  }
}

function thump(v, o) {
  // Low body thump: pitched-down sine plus a short noise "dirt" layer.
  tone(v, {t: o.t, f: o.f ?? 95, f2: o.f2 ?? 42, glide: 0.12, a: 0.002, hold: 0.01, rel: o.rel ?? 0.18, gain: o.gain ?? 0.5, pitch: o.pitch, dest: o.dest});
  noise(v, {t: o.t, color: 'brown', a: 0.001, rel: (o.rel ?? 0.18) * 0.8, gain: (o.gain ?? 0.5) * 0.9, filter: {type: 'lowpass', f: o.lp ?? 900, Q: 0.6}, pitch: o.pitch, dest: o.dest});
}

// --- The sounds ------------------------------------------------------------

const SOUNDS = {
  countdown(v, o) {
    // Two-tone start-light beep.
    tone(v, {f: 880, a: 0.004, hold: 0.13, rel: 0.06, gain: 0.32, pitch: 1});
    tone(v, {f: 1760, a: 0.004, hold: 0.13, rel: 0.05, gain: 0.07, pitch: 1});
  },
  go(v, o) {
    tone(v, {f: 1760, a: 0.004, hold: 0.42, rel: 0.12, gain: 0.3, pitch: 1});
    tone(v, {f: 3520, a: 0.004, hold: 0.42, rel: 0.1, gain: 0.05, pitch: 1});
    // Starter's air horn: recorded if available, otherwise a brassy synth chord.
    if (!sample(v, 'horn', {t: v.t + 0.02, gain: 0.45, dur: 1.1, fadeOut: 0.2})) {
      for (const [f, gg] of [[233, 0.11], [294, 0.09], [350, 0.07]]) {
        tone(v, {t: v.t + 0.02, type: 'sawtooth', f, a: 0.03, hold: 0.8, rel: 0.2, gain: gg, lp: 2200, lpQ: 1.5});
      }
    }
  },
  gate(v, o) {
    const i = o.intensity, p = o.pitch;
    // Gate latch/slam, a crisp wood-on-wood clack on top, and a little weight underneath.
    if (sample(v, 'wood', {sprite: 'gate', gain: 0.75 + 0.25 * i, rate: 0.95 + Math.random() * 0.1, pitch: p})) {
      sample(v, 'wood', {sprite: 'clack', gain: 0.35 * i, rate: 0.9 + Math.random() * 0.2, pitch: p});
      sample(v, 'wood', {sprite: 'heavy', gain: 0.35 * i, pitch: p});
    } else {
      noise(v, {color: 'white', a: 0.001, rel: 0.07, gain: 2.6 * i, filter: {type: 'bandpass', f: 1500, Q: 2.5}, pitch: p});
      tone(v, {f: 210, f2: 150, a: 0.001, rel: 0.16, gain: 1.8 * i, pitch: p});
      noise(v, {color: 'white', a: 0.0008, rel: 0.025, gain: 0.7 * i, filter: {type: 'highpass', f: 2500, Q: 0.7}, pitch: p});
    }
    // The gate bouncing against its stop a moment later.
    sample(v, 'wood', {t: v.t + 0.11 + Math.random() * 0.04, sprite: 'clack', gain: 0.18 * i, rate: 1.1, pitch: p});
  },
  land(v, o) {
    const i = o.intensity, p = o.pitch;
    const g = 0.25 + 0.75 * i;
    const hit = sample(v, 'thud', {gain: 0.85 * g, rate: 0.85 + 0.2 * (1 - i) + Math.random() * 0.06, pitch: p});
    thump(v, {gain: (hit ? 0.45 : 0.75) * g, f: 85, f2: 38, rel: 0.12 + 0.2 * i, lp: 600 + 900 * i, pitch: p});
    // Dirt spray after the impact.
    noise(v, {t: v.t + 0.01, color: 'crackle', a: 0.01, hold: 0.05, rel: 0.25 + 0.2 * i, gain: 0.22 * g * i, rate: 0.7, filter: {type: 'bandpass', f: 1600, Q: 0.6}, pitch: p});
  },
  shatter(v, o) {
    const i = Math.max(0.6, o.intensity), p = o.pitch;
    thump(v, {gain: 0.55 * i, f: 110, f2: 45, rel: 0.25, lp: 1200, pitch: p});
    if (!sample(v, 'crunch', {gain: 1.2 * i, rate: 0.95 + Math.random() * 0.1, pitch: p})) {
      noise(v, {color: 'crackle', a: 0.002, hold: 0.06, rel: 0.25, gain: 0.7 * i, rate: 1.4, filter: {type: 'bandpass', f: 1400, Q: 0.8}, pitch: p});
    }
    if (!sample(v, 'splat', {t: v.t + 0.025, gain: 1.1 * i, rate: 0.9 + Math.random() * 0.15, pitch: p})) {
      noise(v, {t: v.t + 0.02, color: 'pink', a: 0.004, rel: 0.3, gain: 0.5 * i, filters: [{type: 'lowpass', f: 2500, f2: 500, Q: 2.5}], pitch: p});
    }
    // Debris: pieces of pumpkin raining down and bouncing.
    const n = 6 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t = v.t + 0.15 + Math.pow(Math.random(), 1.4) * 1.1;
      const dest = stereo(v, Math.random() * 1.6 - 0.8);
      const gg = (0.12 + Math.random() * 0.22) * i * (1 - (t - v.t) / 1.8);
      if (!sample(v, 'debris', {t, gain: gg, rate: 0.9 + Math.random() * 0.6, pitch: p, dest})) {
        noise(v, {t, color: 'crackle', a: 0.001, rel: 0.05 + Math.random() * 0.06, gain: gg * 1.6, filter: {type: 'bandpass', f: 500 + Math.random() * 1500, Q: 1.5}, pitch: p, dest});
      }
    }
  },
  netSnap(v, o) {
    const i = Math.max(0.5, o.intensity), p = o.pitch, E = v.E, ctx = E.ctx;
    // Rope crack.
    noise(v, {color: 'white', a: 0.0005, rel: 0.035, gain: 0.55 * i, filter: {type: 'highpass', f: 1800, Q: 0.7}, pitch: p});
    // Karplus-Strong twang with a falling pitch as the tension goes.
    for (const [f, gg, d] of [[1, 0.5, 0], [1.51, 0.28, 0.012]]) {
      const s = ctx.createBufferSource(); s.buffer = E.gen.rope;
      s.playbackRate.setValueAtTime(1.08 * f * p, v.t + d);
      s.playbackRate.exponentialRampToValueAtTime(0.82 * f * p, v.t + d + 0.6);
      const g = ctx.createGain(); g.gain.value = gg * i;
      s.connect(g); g.connect(v.out); v.keep(g);
      s.start(v.t + d); v.addSource(s, v.t + d, E.gen.rope.duration / (0.82 * f * p));
    }
    // Ripping mesh.
    if (!sample(v, 'rip', {t: v.t + 0.03, gain: 0.7 * i, rate: 1.05, pitch: p})) {
      noise(v, {t: v.t + 0.03, color: 'crackle', a: 0.02, hold: 0.25, rel: 0.2, gain: 0.45 * i, rate: 2.2, filter: {type: 'bandpass', f: 2500, Q: 0.9}, pitch: p});
    }
  },
  netCatch(v, o) {
    const i = Math.max(0.4, o.intensity), p = o.pitch, E = v.E, ctx = E.ctx;
    if (!sample(v, 'thud', {gain: 0.45 * i, rate: 1.25, pitch: p, sprite: 'soft'})) thump(v, {gain: 0.4 * i, f: 120, f2: 60, rel: 0.12, lp: 700, pitch: p});
    // Mesh rustle as the net stretches.
    noise(v, {color: 'crackle', a: 0.05, hold: 0.1, rel: 0.35, gain: 0.14 * i, rate: 1.4, filter: {type: 'bandpass', f: 3000, Q: 0.8}, pitch: p});
    // Rope/post creak (generated stick-slip buffer).
    const s = ctx.createBufferSource(); s.buffer = E.gen.creak;
    s.playbackRate.value = (0.9 + Math.random() * 0.2) * p;
    const g = ctx.createGain(); g.gain.value = 0.42 * i;
    s.connect(g); g.connect(v.out); v.keep(g);
    s.start(v.t + 0.06); v.addSource(s, v.t + 0.06, E.gen.creak.duration / s.playbackRate.value);
  },
  finish(v, o) {
    const place = o.place || 0, p = o.pitch;
    const rings = place === 1 ? 3 : place > 0 && place <= 3 ? 2 : 1;
    const f0 = place === 1 ? 1046 : place <= 3 ? 880 : 740;
    const gain = place === 1 ? 0.3 : place <= 3 ? 0.24 : 0.17;
    for (let r = 0; r < rings; r++) {
      const t = v.t + r * 0.2;
      // Inharmonic partials of a hand bell.
      for (const [m, gg, rel] of [[1, 1, 1.1], [2.0, 0.5, 0.8], [2.76, 0.35, 0.55], [5.4, 0.18, 0.3], [8.93, 0.08, 0.18]]) {
        tone(v, {t, f: f0 * m, a: 0.002, rel: rel * (rings > 1 && r < rings - 1 ? 0.6 : 1), gain: gain * gg * (r ? 0.85 : 1), pitch: p});
      }
    }
  },
  win(v, o) {
    const p = o.pitch;
    if (!sample(v, 'cheerBig', {gain: 0.95, pitch: p, fadeOut: 1.2})) synthCrowd(v, {gain: 0.4, dur: 4, vowel: 'ay', pitch: p});
    // Fanfare sting: quick brass arpeggio into a held major chord.
    const notes = [392, 523.3, 659.3];
    notes.forEach((f, k) => {
      for (const det of [-6, 6]) tone(v, {t: v.t + 0.05 + k * 0.11, type: 'sawtooth', f, detune: det, a: 0.02, hold: 0.07, rel: 0.08, gain: 0.05, lp: 1400, lpEnv: 3200, lpQ: 1.2, pitch: p});
    });
    for (const f of [523.3, 659.3, 784, 1046.5]) {
      for (const det of [-7, 7]) tone(v, {t: v.t + 0.4, type: 'sawtooth', f, detune: det, a: 0.03, hold: 0.75, rel: 0.45, gain: 0.04, lp: 1600, lpEnv: 3800, lpQ: 1.2, pitch: p});
    }
    tone(v, {t: v.t + 0.4, type: 'triangle', f: 130.8, a: 0.03, hold: 0.75, rel: 0.4, gain: 0.12, pitch: p});
  },
  dq(v, o) {
    const p = o.pitch;
    if (!sample(v, 'whistle', {gain: 0.27, pitch: p})) synthWhistle(v, {gain: 0.13, pitch: p});
    if (!sample(v, 'ohh', {t: v.t + 0.55, gain: 0.8, pitch: p, fadeOut: 0.6})) synthCrowd(v, {t: v.t + 0.55, gain: 0.32, dur: 1.8, vowel: 'oh', fall: 0.75, pitch: p});
  },
  whistle(v, o) {
    if (!sample(v, 'whistle', {gain: 0.27 * (0.5 + 0.5 * o.intensity), pitch: o.pitch})) synthWhistle(v, {gain: 0.13, pitch: o.pitch});
  },
  cheer(v, o) {
    const i = o.intensity, p = o.pitch;
    const dur = 2.2 + 4 * i;
    if (!sample(v, 'cheer', {gain: 0.3 + 0.6 * i, dur, fadeIn: 0.08, fadeOut: Math.min(1.5, dur * 0.4), pitch: p})) {
      synthCrowd(v, {gain: 0.2 + 0.4 * i, dur: dur * 0.7, vowel: 'ay', pitch: p});
    }
  },
  gasp(v, o) {
    const i = o.intensity, p = o.pitch;
    if (!sample(v, 'gasp', {gain: 0.45 + 0.45 * i, fadeOut: 0.5, pitch: p})) synthCrowd(v, {gain: 0.5 * (0.5 + i), dur: 1.4, vowel: 'oh', a: 0.08, fall: 1.15, pitch: p});
  },
  whoosh(v, o) {
    const i = o.intensity, p = o.pitch;
    const dur = 0.55 + 0.35 * (1 - i);
    noise(v, {color: 'white', dur, a: dur * 0.45, hold: 0.02, rel: dur * 0.5, gain: 0.3 + 0.35 * i,
      filters: [{type: 'bandpass', f: 380, f2: 1500 + 1200 * i, f3: 420, t2: dur * 0.45, t3: dur, Q: 1.1}], pitch: p});
    noise(v, {color: 'pink', dur, a: dur * 0.5, rel: dur * 0.5, gain: 0.25 * i, filters: [{type: 'lowpass', f: 300, f2: 700, f3: 250, t2: dur * 0.5, t3: dur, Q: 0.6}], pitch: p});
  },
  splash(v, o) {
    const i = o.intensity, p = o.pitch;
    if (!sample(v, 'splash', {gain: 0.5 + 0.5 * i, pitch: p})) synthSplash(v, {gain: 0.35 + 0.35 * i, pitch: p});
  },
  // Internal: entering and leaving slow motion.
  slowIn(v, o) {
    noise(v, {color: 'pink', dur: 1.4, a: 0.12, hold: 0.2, rel: 1.0, gain: 0.32, filters: [{type: 'bandpass', f: 2600, f2: 160, glide: 1.2, Q: 1.4}]});
    tone(v, {f: 70, f2: 34, glide: 0.9, a: 0.02, hold: 0.15, rel: 0.7, gain: 0.32});
    tone(v, {f: 140, f2: 55, glide: 0.9, a: 0.02, hold: 0.05, rel: 0.5, gain: 0.08});
  },
  slowOut(v, o) {
    noise(v, {color: 'pink', dur: 0.5, a: 0.3, rel: 0.12, gain: 0.16, filters: [{type: 'bandpass', f: 300, f2: 2800, glide: 0.4, Q: 1.2}]});
  },
};

export class OneShots {
  constructor(E, opts = {}) {
    this.E = E;
    this.voices = [];
    this.last = Object.create(null);
    this.max = opts.maxOneShots || 14;
  }

  // name, opts {position, intensity, place}, state {rate, slow, playing}
  play(name, opts = {}, state = {}) {
    const E = this.E, ctx = E.ctx;
    const fn = SOUNDS[name];
    if (!fn) return false;
    const rule = RULES[name] || {gap: 0.1, max: 2, prio: 5};
    const now = ctx.currentTime;
    const rate = state.rate || 1;
    const fast = rate > 1.5;
    const gap = rule.gap * (fast ? rate : 1);
    if (this.last[name] != null && now - this.last[name] < gap && !opts.force) return false;
    // At high speed, drop the minor stuff entirely.
    if (fast && rate >= 3 && (name === 'whoosh' || name === 'gasp' || (name === 'land' && (opts.intensity ?? 0.7) < 0.35))) return false;
    this.last[name] = now;

    // Concurrency per name: stop the oldest of the same name.
    const maxSame = fast ? Math.max(1, rule.max - 1) : rule.max;
    const same = this.voices.filter(v => v.name === name && v.end > now);
    while (same.length >= maxSame) same.shift().stop(0.06);
    // Global polyphony: steal the lowest-priority, oldest voice.
    const live = this.voices.filter(v => v.end > now);
    if (live.length >= this.max) {
      live.sort((a, b) => a.prio - b.prio || a.born - b.born);
      if (live[0].prio > rule.prio) return false;
      live[0].stop(0.04);
    }

    let dest = rule.ui ? E.bus.ui : E.bus.sfx;
    const t = now + 0.005;
    const v = new Voice(E, name, dest, t);
    let gain = 1;
    if (rule.spatial && opts.position && E.listenerPos) {
      const pan = E.makePanner();
      const p = opts.position;
      E.setPannerPos(pan, p.x, p.y, p.z);
      // Direction from the panner; distance attenuation done here so far events stay audible.
      const lp = E.listenerPos;
      const d = Math.hypot(p.x - lp.x, p.y - lp.y, p.z - lp.z);
      gain = Math.max(0.2, 1 / (1 + Math.max(0, d - 8) / 14));
      v.out.disconnect();
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass'; air.frequency.value = clamp(20000 / (1 + d / 60), 1500, 20000); air.Q.value = 0.5;
      v.out.connect(air); air.connect(pan); pan.connect(dest);
      v.keep(air); v.keep(pan);
    }
    if (fast) gain *= 0.8;
    v.out.gain.value = gain * (rule.level ?? 1);
    const o = {intensity: clamp(opts.intensity ?? 0.8, 0, 1), place: opts.place, pitch: state.slow ? 0.72 : 1};
    if (rule.ui) o.pitch = 1;
    try { fn(v, o); } catch (e) { v.stop(0.01); if (E.debug || !this.warned) console.warn('[audio] sound failed', name, e); this.warned = true; }
    this.voices.push(v);
    return true;
  }

  update(now) {
    if (!this.voices.length) return;
    let w = 0;
    for (const v of this.voices) {
      if (v.end + 0.1 < now) v.dispose();
      else this.voices[w++] = v;
    }
    this.voices.length = w;
  }

  stopAll() {
    for (const v of this.voices) v.stop(0.05);
  }

  get active() { return this.voices.filter(v => v.end > this.E.ctx.currentTime).length; }
}

export {NAMES as ONE_SHOT_NAMES, Voice, envelope, noise, tone, sample, synthCrowd};
