// Spatialised rolling sound for the nearest/loudest pumpkins. A fixed pool of
// voices (default 4) is built once; each frame the loudest pumpkins are
// assigned to voices and the voice parameters follow speed, surface, distance
// and Doppler. Everything is filtered noise, so there are no files to load.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Per-surface recipe. grit = crackle band (crunch), body = low rumble,
// hollow = resonant band (wooden deck), hiss = high band (sand), wob = depth of
// the lumpy rotation/plank modulation.
export const SURFACES = {
  dirt:     {grit: 1.7, gritF: 2100, gritQ: 0.8, body: 0.42, bodyF: 240, hollow: 0.0, hollowF: 150, hiss: 0.12, hissF: 3800, wob: 0.35, crack: 1.0, plank: 0},
  wood:     {grit: 0.22, gritF: 1100, gritQ: 1.1, body: 0.45, bodyF: 420, hollow: 1.25, hollowF: 118, hiss: 0.05, hissF: 2600, wob: 0.6, crack: 0.55, plank: 0.55},
  concrete: {grit: 0.16, gritF: 2800, gritQ: 0.7, body: 0.7, bodyF: 560, hollow: 0.18, hollowF: 230, hiss: 0.3, hissF: 1900, wob: 0.18, crack: 0.45, plank: 3.2},
  sand:     {grit: 0.1, gritF: 3400, gritQ: 0.6, body: 0.18, bodyF: 150, hollow: 0.0, hollowF: 120, hiss: 0.95, hissF: 4600, wob: 0.12, crack: 0.35, plank: 0},
};

// Distance gain for rolling voices (custom so voice priority uses the same curve).
export function rollDistanceGain(d) { return 1 / (1 + Math.max(0, d - 3) / 4); }

class RollVoice {
  constructor(E, dest, k) {
    const ctx = E.ctx;
    this.E = E; this.k = k; this.id = null; this.level = 0;
    this.prev = null; this.dop = 1; this.cache = {};
    const N = E.noise;
    const mk = (buf, rate, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(ctx.currentTime, off); return s; };
    const bq = (type, f, Q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
    const gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };

    this.crack = mk(N.crackle, 1, (k * 0.37) % 1.5);
    this.brown = mk(N.brown, 1, (k * 0.61) % 2);
    this.white = mk(N.white, 1, (k * 0.29) % 2);

    this.gritF = bq('bandpass', 1500, 0.8); this.gritG = gn(0);
    this.bodyF = bq('lowpass', 250, 0.7); this.bodyG = gn(0);
    this.hollowF = bq('bandpass', 120, 5); this.hollowG = gn(0);
    this.hissF = bq('bandpass', 4000, 0.9); this.hissG = gn(0);
    this.airF = bq('bandpass', 600, 0.8); this.airG = gn(0);
    this.roll = gn(1);          // amplitude-modulated by the wobble LFO
    this.distF = bq('lowpass', 18000, 0.5);
    this.out = gn(0);           // overall voice level (speed x distance x active)

    this.crack.connect(this.gritF); this.gritF.connect(this.gritG); this.gritG.connect(this.roll);
    this.brown.connect(this.bodyF); this.bodyF.connect(this.bodyG); this.bodyG.connect(this.roll);
    this.brown.connect(this.hollowF); this.hollowF.connect(this.hollowG); this.hollowG.connect(this.roll);
    this.white.connect(this.hissF); this.hissF.connect(this.hissG); this.hissG.connect(this.roll);
    this.white.connect(this.airF); this.airF.connect(this.airG); this.airG.connect(this.distF);
    this.roll.connect(this.distF);
    this.distF.connect(this.out);

    // Lumpy pumpkin rotation (or plank joints on the wooden deck).
    this.wob = ctx.createOscillator(); this.wob.type = 'sine'; this.wob.frequency.value = 5;
    this.wobG = gn(0);
    this.wob.connect(this.wobG); this.wobG.connect(this.roll.gain);
    this.wob.start();

    this.pan = E.makePanner(true);
    this.out.connect(this.pan); this.pan.connect(dest);
    this.nodes = [this.crack, this.brown, this.white, this.gritF, this.gritG, this.bodyF, this.bodyG, this.hollowF, this.hollowG,
      this.hissF, this.hissG, this.airF, this.airG, this.roll, this.distF, this.out, this.wob, this.wobG, this.pan];
  }

  // Set an AudioParam smoothly, skipping tiny changes to keep the automation list short.
  set(name, param, v, tc = 0.06, rel = 0.015) {
    const c = this.cache[name];
    if (c != null && Math.abs(v - c) <= Math.abs(c) * rel + 1e-5) return;
    this.cache[name] = v;
    param.setTargetAtTime(v, this.E.ctx.currentTime, tc);
  }

  silence(tc = 0.05) { this.set('out', this.out.gain, 0, tc, 0); this.level = 0; }

  // p: pumpkin {position, speed, airborne, surface, active}; L: listener state; s: global state
  update(p, L, s, dt) {
    const E = this.E;
    const pos = p.position;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz) || 0.001;

    // Doppler from on-screen motion (real time), ignoring jumps from scrubbing.
    let dop = 1;
    if (this.prev && dt > 0 && s.playing) {
      const vx = (pos.x - this.prev.x) / dt, vy = (pos.y - this.prev.y) / dt, vz = (pos.z - this.prev.z) / dt;
      const vs = Math.hypot(vx, vy, vz);
      if (vs < 160) {
        const ux = dx / d, uy = dy / d, uz = dz / d;
        const vSrc = vx * ux + vy * uy + vz * uz;               // + = moving away
        const vLis = L.vx * ux + L.vy * uy + L.vz * uz;          // + = moving toward the source
        dop = clamp((343 + vLis) / (343 + vSrc), 0.72, 1.35);
      }
    }
    this.prev = {x: pos.x, y: pos.y, z: pos.z};
    this.dop += (dop - this.dop) * clamp(dt * 8, 0, 1);

    E.setPannerPos(this.pan, pos.x, pos.y, pos.z);

    const sf = SURFACES[p.surface] || SURFACES.dirt;
    const speed = clamp(p.speed || 0, 0, 40);
    const sn = clamp(speed / 35, 0, 1.15);
    const pitch = s.pitch * this.dop;
    const air = !!p.airborne;
    const alive = p.active !== false;

    // Rolling layers (zero in the air).
    const r = air ? 0 : 1;
    this.set('gritG', this.gritG.gain, r * sf.grit * 0.9 * Math.pow(sn, 0.9));
    this.set('bodyG', this.bodyG.gain, r * sf.body * 1.6 * Math.pow(sn, 0.7));
    this.set('hollowG', this.hollowG.gain, r * sf.hollow * 2.2 * Math.pow(sn, 0.8));
    this.set('hissG', this.hissG.gain, r * sf.hiss * 0.7 * Math.pow(sn, 1.2));
    this.set('gritF', this.gritF.frequency, sf.gritF * (0.55 + 0.75 * sn) * pitch);
    this.set('gritQ', this.gritF.Q, sf.gritQ, 0.2);
    this.set('bodyF', this.bodyF.frequency, sf.bodyF * (0.5 + 1.1 * sn) * pitch);
    this.set('hollowF', this.hollowF.frequency, sf.hollowF * (0.9 + 0.25 * sn) * pitch);
    this.set('hissF', this.hissF.frequency, sf.hissF * (0.7 + 0.4 * sn) * pitch);
    this.set('crackRate', this.crack.playbackRate, Math.max(0.05, (0.3 + 1.25 * sn) * sf.crack * pitch));
    this.set('brownRate', this.brown.playbackRate, Math.max(0.2, (0.6 + 0.6 * sn) * pitch));

    // Lumpy rotation: once per turn of a ~0.35 m radius pumpkin, or per plank joint.
    const wobHz = sf.plank ? speed / sf.plank : speed / (2 * Math.PI * 0.35);
    this.set('wobF', this.wob.frequency, Math.max(0.1, wobHz * pitch));
    this.set('wobG', this.wobG.gain, r * sf.wob * 0.8);
    this.set('roll', this.roll.gain, 1 - sf.wob * 0.4, 0.1);

    // Air: a faint rush while rolling fast, a full whoosh when airborne.
    const airLevel = air ? 0.85 * Math.pow(sn, 1.3) : 0.12 * sn * sn;
    this.set('airG', this.airG.gain, airLevel, air ? 0.04 : 0.08);
    this.set('airF', this.airF.frequency, (260 + 1300 * sn) * pitch);

    // Distance: level and air absorption.
    const dg = rollDistanceGain(d);
    this.set('distF', this.distF.frequency, clamp(19000 / (1 + d / 45), 900, 19000) * (s.slow ? 0.7 : 1), 0.1);

    // Overall loudness rises with speed; fades out when the pumpkin stops racing.
    const loud = speed < 0.15 ? 0 : Math.min(1, 0.08 + 0.92 * Math.pow(sn, 0.85));
    const target = (alive ? 1 : 0) * loud * dg * 0.9;
    this.level = target;
    this.set('out', this.out.gain, target, alive ? 0.05 : 0.45, 0.01);
    return target;
  }

  dispose() {
    for (const n of this.nodes) { try { if (n.stop) n.stop(); } catch (e) { /* */ } try { n.disconnect(); } catch (e) { /* */ } }
  }
}

export class Rolling {
  constructor(E, dest, opts = {}) {
    this.E = E;
    this.max = opts.rollVoices || 4;
    this.voices = Array.from({length: this.max}, (_, k) => new RollVoice(E, dest, k));
    this.pending = new Map(); // voice -> {id, until} switching after a short fade
  }

  update(frame, L, s) {
    const pumpkins = frame.pumpkins || [];
    const now = this.E.ctx.currentTime;
    // Score every pumpkin by how loud it would be here.
    const scored = [];
    for (const p of pumpkins) {
      if (!p || !p.position) continue;
      const d = Math.hypot(p.position.x - L.x, p.position.y - L.y, p.position.z - L.z);
      const sn = clamp((p.speed || 0) / 35, 0, 1);
      let score = (p.active === false ? 0.15 : 1) * (0.05 + sn) * rollDistanceGain(d);
      if (this.voices.some(v => v.id === p.id)) score *= 1.6; // stickiness
      scored.push({p, score});
    }
    scored.sort((a, b) => b.score - a.score);
    const want = scored.slice(0, this.max);
    const wantIds = new Set(want.map(w => w.p.id));

    // Free voices whose pumpkin is no longer wanted.
    for (const v of this.voices) {
      if (v.id != null && !wantIds.has(v.id)) { v.silence(0.04); v.id = null; v.prev = null; v.freeAt = now + 0.12; }
    }
    // Update kept voices, assign new pumpkins to free voices (after their fade-out).
    for (const w of want) {
      let v = this.voices.find(x => x.id === w.p.id);
      if (!v) {
        v = this.voices.find(x => x.id == null && (x.freeAt || 0) <= now);
        if (!v) continue;
        v.id = w.p.id; v.prev = null; v.dop = 1; v.cache.out = 0;
        v.out.gain.cancelScheduledValues(now); v.out.gain.setValueAtTime(0, now);
      }
      v.update(w.p, L, s, frame.dt || 0);
    }
    for (const v of this.voices) if (v.id == null) v.silence(0.05);
  }

  stopAll() {
    for (const v of this.voices) { v.silence(0.03); v.id = null; v.prev = null; }
  }
}
