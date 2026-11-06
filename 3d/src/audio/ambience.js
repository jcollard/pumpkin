// Ambience beds per track (surf, wind, insects, distant machinery), scattered
// "spot" calls (gulls, sea lions, birds, foghorn, dog, raven) and the crowd.
// Recorded loops are used when loaded; every layer has a synthesized fallback
// (or is simply left out, for the optional background details).

import {Voice, noise, tone, sample} from './sfx.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);

// Levels 0..1 per track; any keys passed to setTrack() override these.
export const TRACK_AMBIENCE = {
  'salinas':  {sea: 0, wind: 0.75, gulls: 0, crowd: 0.5, birds: 0.8, insects: 0.6, tractor: 0.45, sealions: 0},
  'monterey': {sea: 0.75, wind: 0.4, gulls: 0.8, crowd: 0.5, sealions: 0.85, boats: 0.6, birds: 0},
  'carmel':   {sea: 0.8, wind: 0.35, gulls: 0.5, crowd: 0.5, dog: 0.45, birds: 0.2},
  'big-sur':  {sea: 1, wind: 0.7, gulls: 0.6, crowd: 0.5, ravens: 0.45},
};

// Scene recipes. gain = base gain at level 1.
const SCENES = {
  'big-sur': {
    beds: [{key: 'surfCliff', level: 'sea', gain: 0.31, lp: 3200, synth: 'cliff'}],
    wind: {level: 'wind', kind: 'cliff'},
    spots: [
      {key: 'gulls', level: 'gulls', every: [3, 9], gain: [0.07, 0.2], lp: [2500, 7000], rate: [0.9, 1.08], burst: [1, 3], synth: 'gull'},
      {key: 'raven', level: 'ravens', every: [14, 32], first: [5, 12], gain: [0.14, 0.32], lp: [3000, 9000], rate: [0.92, 1.05], burst: [1, 2]},
    ],
  },
  'monterey': {
    beds: [
      {key: 'surfHarbour', level: 'sea', gain: 0.56, lp: 9000, synth: 'harbour'},
      {key: 'sealionBed', level: 'sealions', gain: 0.3, lp: 5000},
    ],
    wind: {level: 'wind', kind: 'bay'},
    spots: [
      {key: 'gulls', level: 'gulls', every: [2, 6], gain: [0.08, 0.26], lp: [3000, 10000], rate: [0.9, 1.1], burst: [1, 3], synth: 'gull'},
      {key: 'sealions', level: 'sealions', every: [2.5, 7], first: [0.5, 2], gain: [0.1, 0.32], lp: [2200, 9000], rate: [0.92, 1.06], burst: [1, 2], synth: 'sealion'},
      {key: 'foghorn', level: 'boats', every: [35, 70], first: [6, 16], gain: [0.07, 0.12], lp: [700, 1300], rate: [0.97, 1.02], pan: 0.5, synth: 'foghorn'},
    ],
  },
  'carmel': {
    beds: [{key: 'surfBeach', level: 'sea', gain: 0.43, lp: 12000, synth: 'beach'}],
    wind: {level: 'wind', kind: 'beach'},
    spots: [
      {key: 'gulls', level: 'gulls', every: [4, 10], gain: [0.06, 0.18], lp: [3000, 9000], rate: [0.9, 1.08], burst: [1, 2], synth: 'gull'},
      {key: 'dog', level: 'dog', every: [18, 45], first: [6, 14], gain: [0.07, 0.16], lp: [1800, 3500], rate: [0.95, 1.05], burst: [1, 2]},
      {key: 'birds', level: 'birds', every: [6, 14], gain: [0.05, 0.12], lp: [5000, 10000], rate: [0.95, 1.05], synth: 'bird'},
    ],
  },
  'salinas': {
    beds: [
      {key: 'prairie', level: 'birds', gain: 0.6, lp: 16000},
      {key: 'crickets', level: 'insects', gain: 0.22, lp: 14000, synth: 'crickets'},
      {key: 'tractor', level: 'tractor', gain: 0.15, lp: 1400, drift: 41},
    ],
    wind: {level: 'wind', kind: 'valley'},
    spots: [
      {key: 'birds', level: 'birds', every: [2.5, 7], first: [0.5, 2], gain: [0.08, 0.26], lp: [5000, 14000], rate: [0.95, 1.05], synth: 'bird'},
    ],
  },
};

const WIND = {
  cliff:  {f: 520, q: 0.55, lp: 2600, gain: 0.136, gust: 0.7, fmod: 280, rumble: 0.5, whistle: 0.06, speed: 1},
  valley: {f: 380, q: 0.6, lp: 1600, gain: 0.16, gust: 0.6, fmod: 160, rumble: 0.3, whistle: 0.025, speed: 0.7},
  bay:    {f: 460, q: 0.6, lp: 2000, gain: 0.11, gust: 0.55, fmod: 200, rumble: 0.25, whistle: 0, speed: 0.85},
  beach:  {f: 650, q: 0.5, lp: 2600, gain: 0.1, gust: 0.5, fmod: 220, rumble: 0.18, whistle: 0, speed: 0.8},
};

// --- Synthesized spot calls (fallbacks) ------------------------------------

const SPOT_SYNTH = {
  gull(v, o) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = v.t + k * rand(0.28, 0.4), f = rand(1500, 1900);
      const osc = tone(v, {t, f, f2: f * 0.62, glide: 0.3, a: 0.02, hold: 0.08, rel: 0.12, gain: o.gain * 0.5, pitch: o.pitch, type: 'sawtooth', lp: 3200});
      void osc;
    }
  },
  sealion(v, o) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = v.t + k * rand(0.3, 0.45);
      tone(v, {t, type: 'sawtooth', f: rand(170, 220), f2: rand(120, 150), glide: 0.22, a: 0.015, hold: 0.07, rel: 0.12, gain: o.gain * 0.7, lp: 900, lpQ: 4, pitch: o.pitch});
      noise(v, {t, color: 'pink', a: 0.01, hold: 0.06, rel: 0.1, gain: o.gain * 0.25, filter: {type: 'bandpass', f: 700, Q: 3}, pitch: o.pitch});
    }
  },
  bird(v, o) {
    // Meadowlark-ish: a few clear descending whistles then a quick warble.
    const notes = [rand(2400, 2800), rand(3200, 3600), rand(2600, 3000), rand(2000, 2300)];
    let t = v.t;
    notes.forEach((f, k) => {
      const len = k === 1 ? 0.22 : 0.12;
      tone(v, {t, f, f2: f * (k % 2 ? 0.82 : 1.06), glide: len, a: 0.01, hold: len * 0.6, rel: 0.05, gain: o.gain * 0.35, pitch: o.pitch});
      t += len + 0.04;
    });
    for (let k = 0; k < 5; k++) tone(v, {t: t + k * 0.045, f: rand(3800, 4600), f2: rand(3000, 3500), glide: 0.04, a: 0.004, rel: 0.03, gain: o.gain * 0.2, pitch: o.pitch});
  },
  foghorn(v, o) {
    for (const [f, g] of [[87, 1], [130.5, 0.6]]) tone(v, {type: 'sawtooth', f, a: 0.25, hold: 2.2, rel: 0.8, gain: o.gain * 0.35 * g, lp: 480, lpQ: 1.5, pitch: o.pitch});
  },
};

// --- Building blocks --------------------------------------------------------

function loopSource(E, key, rate = 1) {
  const buf = E.buffer(key);
  if (!buf) return null;
  const ctx = E.ctx, info = E.loopInfo(key);
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  let start = 0, len = buf.duration;
  if (info) { start = info.start; len = info.length; s.loopStart = start; s.loopEnd = start + len; }
  s.start(ctx.currentTime, start + Math.random() * len * 0.9);
  return s;
}

function filt(ctx, type, f, Q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
function gain(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
function panner(ctx, p) {
  if (!ctx.createStereoPanner) return gain(ctx, 1);
  const n = ctx.createStereoPanner(); n.pan.value = p; return n;
}

// A Layer owns a set of nodes and the looping sources whose rate follows slow motion.
class Layer {
  constructor(E, dest, base, levelKey) {
    this.E = E; this.base = base; this.levelKey = levelKey;
    this.out = gain(E.ctx, 0);
    this.out.connect(dest);
    this.nodes = [this.out]; this.sources = []; // {src, rate}
    this.synth = false;
  }
  add(...n) { this.nodes.push(...n); return n[0]; }
  src(s, rate = 1) { if (s) { this.sources.push({src: s, rate}); this.nodes.push(s); } return s; }
  setLevel(level, tc = 0.6) {
    const t = this.E.ctx.currentTime;
    this.level = level;
    this.out.gain.setTargetAtTime(this.base * level, t, tc);
  }
  setRate(r, tc) {
    const t = this.E.ctx.currentTime;
    for (const {src, rate} of this.sources) src.playbackRate.setTargetAtTime(rate * r, t, tc);
  }
  dispose() {
    for (const n of this.nodes) { try { if (n.stop) n.stop(); } catch (e) { /* */ } try { n.disconnect(); } catch (e) { /* */ } }
    this.nodes.length = 0; this.sources.length = 0;
  }
}

// Gusty stereo wind from filtered noise; gusts come from a looping control curve.
function buildWind(E, layer, kind) {
  const ctx = E.ctx, c = WIND[kind] || WIND.valley, N = E.noise;
  const mk = (buf, rate, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(ctx.currentTime, off); return layer.src(s, rate); };
  [-0.75, 0.75].forEach((side, k) => {
    const src = mk(N.white, 1, k * 0.9);
    const bp = layer.add(filt(ctx, 'bandpass', c.f * (k ? 1.12 : 0.9), c.q));
    const lp = layer.add(filt(ctx, 'lowpass', c.lp, 0.5));
    const g = layer.add(gain(ctx, c.gain));
    const pan = layer.add(panner(ctx, side));
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pan); pan.connect(layer.out);
    const gust = mk(N.curve, (0.55 + 0.2 * k) * c.speed, k * 7);
    const gg = layer.add(gain(ctx, c.gain * c.gust));
    const gf = layer.add(gain(ctx, c.fmod));
    gust.connect(gg); gg.connect(g.gain);
    gust.connect(gf); gf.connect(bp.frequency);
  });
  // Low buffeting rumble.
  const br = mk(N.brown, 1, 0.3);
  const rl = layer.add(filt(ctx, 'lowpass', 150, 0.6));
  const rg = layer.add(gain(ctx, c.gain * c.rumble));
  const rgust = mk(N.curve, 0.8 * c.speed, 3);
  const rgg = layer.add(gain(ctx, c.gain * c.rumble * 0.8));
  br.connect(rl); rl.connect(rg); rg.connect(layer.out);
  rgust.connect(rgg); rgg.connect(rg.gain);
  // Whistling edge for cliffs.
  if (c.whistle) {
    const ws = mk(N.white, 1, 1.7);
    const wb = layer.add(filt(ctx, 'bandpass', 880, 16));
    const wg = layer.add(gain(ctx, c.gain * c.whistle * 4));
    const wf = layer.add(gain(ctx, 160));
    const wgust = mk(N.curve, 0.4 * c.speed, 11);
    const wgg = layer.add(gain(ctx, c.gain * c.whistle * 3.6));
    ws.connect(wb); wb.connect(wg); wg.connect(layer.out);
    wgust.connect(wf); wf.connect(wb.frequency);
    wgust.connect(wgg); wgg.connect(wg.gain);
  }
}

// Synthetic surf: pink noise swelling with an irregular wave envelope plus foam hiss.
function buildSurfSynth(E, layer, kind) {
  const ctx = E.ctx, N = E.noise;
  const cfg = {cliff: {lp: 700, lpMod: 900, g: 0.2, foam: 0.05, period: 1}, harbour: {lp: 900, lpMod: 900, g: 0.14, foam: 0.05, period: 0.55},
    beach: {lp: 900, lpMod: 1800, g: 0.22, foam: 0.12, period: 0.85}}[kind] || {lp: 800, lpMod: 1200, g: 0.12, foam: 0.06, period: 1};
  const mk = (buf, rate, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(ctx.currentTime, off); return layer.src(s, rate); };
  [-0.6, 0.6].forEach((side, k) => {
    const swell = mk(N.swell, cfg.period * (k ? 1.07 : 1), k * 13);
    const src = mk(N.pink, 1, k * 1.3);
    const lp = layer.add(filt(ctx, 'lowpass', cfg.lp, 0.4));
    const g = layer.add(gain(ctx, cfg.g * 0.25));
    const pan = layer.add(panner(ctx, side));
    const sg = layer.add(gain(ctx, cfg.g));
    const sf = layer.add(gain(ctx, cfg.lpMod));
    src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(layer.out);
    swell.connect(sg); sg.connect(g.gain);
    swell.connect(sf); sf.connect(lp.frequency);
    const foam = mk(N.white, 1, k * 0.5);
    const hp = layer.add(filt(ctx, 'highpass', 2600, 0.5));
    const fg = layer.add(gain(ctx, 0));
    const fsg = layer.add(gain(ctx, cfg.foam));
    foam.connect(hp); hp.connect(fg); fg.connect(pan);
    swell.connect(fsg); fsg.connect(fg.gain);
  });
}

// Synthetic crickets: chirping sine carriers gated by two pulse trains.
function buildCricketsSynth(E, layer) {
  const ctx = E.ctx;
  [[4650, 0.7, 31, 1.6, -0.5], [4300, 0.5, 27, 1.15, 0.45], [5100, 0.35, 36, 2.3, 0.05]].forEach(([f, g0, chirp, pulse, pan]) => {
    const car = ctx.createOscillator(); car.frequency.value = f;
    const a = layer.add(gain(ctx, 0.5)), b = layer.add(gain(ctx, 0.5));
    const sq1 = ctx.createOscillator(); sq1.type = 'square'; sq1.frequency.value = chirp;
    const sq2 = ctx.createOscillator(); sq2.type = 'square'; sq2.frequency.value = pulse;
    const d1 = layer.add(gain(ctx, 0.5)), d2 = layer.add(gain(ctx, 0.5));
    sq1.connect(d1); d1.connect(a.gain); sq2.connect(d2); d2.connect(b.gain);
    const out = layer.add(gain(ctx, g0 * 0.05));
    const p = layer.add(panner(ctx, pan));
    car.connect(a); a.connect(b); b.connect(out); out.connect(p); p.connect(layer.out);
    for (const o of [car, sq1, sq2]) { o.start(); layer.src(o, 1); }
  });
  // Oscillator "playbackRate" does not exist; slow motion detunes them instead.
  layer.sources = layer.sources.filter(x => x.src.playbackRate);
}

// --- Scene ------------------------------------------------------------------

export class Scene {
  constructor(E, trackId, levels, dest) {
    this.E = E; this.trackId = trackId;
    const ctx = E.ctx, now = ctx.currentTime;
    this.out = gain(ctx, 0);
    this.out.connect(dest);
    this.layers = [];
    this.spots = [];
    this.voices = [];
    this.usedFallback = false;
    this.rate = 1;
    this.disposeAt = Infinity;
    const recipe = SCENES[trackId] || SCENES['big-sur'];

    for (const bed of recipe.beds || []) {
      const layer = new Layer(E, this.out, bed.gain, bed.level);
      const s = layer.src(loopSource(E, bed.key));
      let last = s;
      if (s) {
        if (bed.lp) { const f = layer.add(filt(ctx, 'lowpass', bed.lp, 0.5)); last.connect(f); last = f; }
        if (bed.hp) { const f = layer.add(filt(ctx, 'highpass', bed.hp, 0.5)); last.connect(f); last = f; }
        last.connect(layer.out);
      } else if (bed.synth === 'crickets') { buildCricketsSynth(E, layer); this.usedFallback = true; }
      else if (bed.synth) { buildSurfSynth(E, layer, bed.synth); this.usedFallback = true; }
      else { if (E.loading) this.usedFallback = true; layer.dispose(); continue; }
      if (bed.drift) { layer.drift = bed.drift; layer.phase = Math.random() * Math.PI * 2; }
      this.layers.push(layer);
    }
    if (recipe.wind) {
      const layer = new Layer(E, this.out, 1, recipe.wind.level);
      buildWind(E, layer, recipe.wind.kind);
      this.layers.push(layer);
    }
    for (const sp of recipe.spots || []) {
      const layer = new Layer(E, this.out, 1, sp.level);
      if (!E.buffer(sp.key) && !SPOT_SYNTH[sp.synth]) { if (E.loading) this.usedFallback = true; }
      else if (!E.buffer(sp.key)) this.usedFallback = true;
      const first = sp.first || [sp.every[0] * 0.3, sp.every[0]];
      this.spots.push({def: sp, layer, next: now + rand(first[0], first[1])});
      this.layers.push(layer);
    }
    this.setLevels(levels, 0.01);
  }

  setLevels(levels, tc = 0.6) {
    this.levels = levels;
    for (const l of this.layers) l.setLevel(clamp(levels[l.levelKey] ?? 0, 0, 1.5), tc);
  }

  fadeIn(sec = 2.5) {
    const t = this.E.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(1, t + sec);
  }

  fadeOut(sec = 2.5) {
    const t = this.E.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + sec);
    this.disposeAt = t + sec + 0.1;
    this.spots.length = 0;
  }

  setRate(r) {
    if (Math.abs(r - this.rate) < 1e-3) return;
    this.rate = r;
    for (const l of this.layers) l.setRate(r, 0.35);
  }

  update(now, s) {
    // Slow drift (e.g. a tractor working its way around a field).
    for (const l of this.layers) {
      if (!l.drift) continue;
      const x = 0.5 + 0.5 * Math.sin((now / l.drift) * Math.PI * 2 + l.phase);
      const target = l.base * (l.level ?? 0) * (0.15 + 0.85 * x * x);
      if (!l.lastDrift || Math.abs(now - l.lastDrift) > 0.5) { l.out.gain.setTargetAtTime(target, now, 1.5); l.lastDrift = now; }
    }
    for (const sp of this.spots) {
      if (now < sp.next) continue;
      const lvl = clamp(this.levels[sp.def.level] ?? 0, 0, 1.5);
      const ev = sp.def.every;
      sp.next = now + rand(ev[0], ev[1]) / Math.max(0.25, lvl);
      if (lvl <= 0.01) continue;
      const n = sp.def.burst ? Math.round(rand(sp.def.burst[0], sp.def.burst[1])) : 1;
      for (let k = 0; k < n; k++) this.fire(sp, now + k * rand(0.15, 0.9), s);
    }
    if (this.voices.length) {
      let w = 0;
      for (const v of this.voices) { if (v.end + 0.1 < now) v.dispose(); else this.voices[w++] = v; }
      this.voices.length = w;
    }
  }

  fire(sp, t, s) {
    const E = this.E, ctx = E.ctx, d = sp.def;
    if (this.voices.length > 10) return;
    const pan = panner(ctx, rand(-1, 1) * (d.pan ?? 0.9));
    const lp = filt(ctx, 'lowpass', rand(d.lp[0], d.lp[1]), 0.5);
    lp.connect(pan); pan.connect(sp.layer.out);
    const v = new Voice(E, 'spot', lp, t);
    v.keep(lp); v.keep(pan);
    const g = rand(d.gain[0], d.gain[1]);
    const pitch = rand(d.rate[0], d.rate[1]) * (s.slow ? 0.8 : 1);
    if (E.buffer(d.key)) sample(v, d.key, {gain: g, pitch, fadeIn: 0.01, fadeOut: 0.08});
    else if (SPOT_SYNTH[d.synth]) SPOT_SYNTH[d.synth](v, {gain: g, pitch});
    this.voices.push(v);
  }

  dispose() {
    for (const v of this.voices) v.dispose();
    for (const l of this.layers) l.dispose();
    try { this.out.disconnect(); } catch (e) { /* */ }
    this.layers.length = 0; this.voices.length = 0; this.spots.length = 0;
  }
}

// --- Crowd ------------------------------------------------------------------

export class Crowd {
  constructor(E, dest) {
    this.E = E;
    const ctx = E.ctx;
    this.out = gain(ctx, 0);
    this.lp = filt(ctx, 'lowpass', 3000, 0.5);
    this.lp.connect(this.out); this.out.connect(dest);
    this.level = 0.5; this.e = 0; this.eFast = 0; this.eSlow = 0; this.lastBurst = -99; this.rate = 1;
    this.build();
  }

  build() {
    const E = this.E, ctx = E.ctx;
    if (this.murmur) { this.murmur.dispose(); this.cheer.dispose(); }
    this.murmur = new Layer(E, this.lp, 1, 'crowd');
    this.cheer = new Layer(E, this.lp, 1, 'crowd');
    this.usedFallback = false;
    const m = this.murmur.src(loopSource(E, 'murmur'));
    if (m) m.connect(this.murmur.out); else { this.synthBabble(this.murmur, [[300, 3], [520, 4], [850, 4], [1300, 5], [2500, 3]], 0.09); this.usedFallback = true; }
    const c = this.cheer.src(loopSource(E, 'cheerLoop'));
    if (c) c.connect(this.cheer.out); else { this.synthBabble(this.cheer, [[700, 1.2], [1300, 1.5], [2600, 2], [3600, 2]], 0.07); this.usedFallback = true; }
    this.murmur.out.gain.value = 0; this.cheer.out.gain.value = 0;
  }

  synthBabble(layer, bands, g0) {
    const ctx = this.E.ctx, N = this.E.noise;
    bands.forEach(([f, Q], k) => {
      const s = ctx.createBufferSource(); s.buffer = N.pink; s.loop = true; s.start(ctx.currentTime, k * 0.4); layer.src(s, 1);
      const b = layer.add(filt(ctx, 'bandpass', f, Q));
      const g = layer.add(gain(ctx, g0));
      const m = ctx.createBufferSource(); m.buffer = N.curve; m.loop = true; m.playbackRate.value = 3 + k * 1.7; m.start(ctx.currentTime, k * 2.3); layer.src(m, 3 + k * 1.7);
      const mg = layer.add(gain(ctx, g0 * 0.8));
      const p = layer.add(panner(ctx, (k % 2 ? 1 : -1) * 0.4));
      s.connect(b); b.connect(g); g.connect(p); p.connect(layer.out); m.connect(mg); mg.connect(g.gain);
    });
  }

  setLevel(level) { this.level = clamp(level ?? 0.5, 0, 1.5); }

  start() { const t = this.E.ctx.currentTime; this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(1, t, 0.8); }
  stop(fade = 0.3) { const t = this.E.ctx.currentTime; this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0, t, fade / 3); }

  setRate(r) {
    if (Math.abs(r - this.rate) < 1e-3) return;
    this.rate = r;
    this.murmur.setRate(r, 0.35); this.cheer.setRate(r, 0.35);
  }

  // Returns a burst intensity (0 = none) when excitement jumps.
  update(excitement, dt, now, s) {
    const x = clamp(excitement || 0, 0, 1);
    const k = (tc) => 1 - Math.exp(-Math.max(0, dt) / tc);
    this.e += (x - this.e) * k(x > this.e ? 0.35 : 1.4);
    this.eFast += (x - this.eFast) * k(0.15);
    this.eSlow += (x - this.eSlow) * k(2.5);
    const e = this.e, L = this.level;
    const mg = L * (0.32 + 0.38 * e) * 0.55;
    const cg = L * Math.pow(e, 1.5) * 0.75;
    if (Math.abs(mg - (this.lastMg ?? -1)) > 0.003) { this.murmur.out.gain.setTargetAtTime(mg, now, 0.25); this.lastMg = mg; }
    if (Math.abs(cg - (this.lastCg ?? -1)) > 0.003) { this.cheer.out.gain.setTargetAtTime(cg, now, 0.25); this.lastCg = cg; }
    const f = 1800 + 9000 * e * e;
    if (Math.abs(f - (this.lastF ?? 0)) > 50) { this.lp.frequency.setTargetAtTime(f, now, 0.3); this.lastF = f; }
    // Bursts of cheering when the action suddenly gets close.
    const minGap = 4.5 * (s.rate > 1.5 ? s.rate : 1);
    if (s.playing && this.eFast - this.eSlow > 0.22 && this.eFast > 0.45 && now - this.lastBurst > minGap && L > 0.05) {
      this.lastBurst = now;
      return clamp(this.eFast * L * 1.4, 0.2, 1);
    }
    return 0;
  }
}
