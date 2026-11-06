// PUMPKIN 3D sound system (Web Audio, no dependencies).
//
//   const audio = createAudio();   // options: {hrtf: false} for equal-power panning on slow machines,
//                                  //          {volume}, {baseUrl}, {debug}, {files: false} (synth only)
//   audio.start();                 // from the RACE button (user gesture); safe to call again. No need to await:
//                                  // synthesized stand-ins play until the files arrive.
//   audio.setTrack('big-sur', track.ambience);   // ambience bed, crossfaded (2.5 s)
//   audio.update(frame);           // every animation frame, also while paused (playing: false)
//   audio.play('land', {position, intensity: 0.7});
//   audio.stopAll(); audio.setTrack(nextId);     // when the scene changes
//
// frame = {dt, simT, playing, rate, slowmo, listener: {position, forward, up},
//          pumpkins: [{id, position, speed, airborne, surface, active}], crowdExcitement,
//          cut?}   // optional: true on the frame of a camera cut (otherwise jumps > 150 m/s are treated as cuts)
//
// Recorded CC0 sounds live in assets/audio/ (see LICENSES.md); everything else
// is synthesized, and every recording has a synthesized fallback so the
// system still works offline or if a file fails to load.

import {AUDIO_FILES} from './audio/manifest.js';
import {whiteNoise, pinkNoise, brownNoise, crackle, impulseResponse, ksString, slowCurve, swellCurve, creak} from './audio/dsp.js';
import {OneShots, ONE_SHOT_NAMES} from './audio/sfx.js';
import {Rolling} from './audio/rolling.js';
import {Scene, Crowd, TRACK_AMBIENCE} from './audio/ambience.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const BUFFER_CACHE = new Map(); // url@rate -> Promise<AudioBuffer>
const MASTER = 0.9;             // overall loudness at volume 1

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && p.catch) p.catch(reject);
    } catch (e) { reject(e); }
  });
}

class AudioSystem {
  constructor(options = {}) {
    this.options = options;
    this.ctx = null;
    this._muted = false;
    this._volume = options.volume ?? 1;
    this.track = null;
    this.scene = null;
    this.oldScenes = [];
    this.slow = false;
    this.playing = true;
    this.listener = {x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, valid: false};
    this._loadPromise = null;
    this.baseUrl = options.baseUrl || new URL('../assets/audio/', import.meta.url).href;
  }

  // --- Contract -------------------------------------------------------------

  async start() {
    if (!this.ctx) {
      if (!this._init()) return;
    }
    const ctx = this.ctx;
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    let resumed = Promise.resolve();
    if (!offline && ctx.state !== 'running') {
      try { resumed = Promise.resolve(ctx.resume()).catch(() => {}); } catch (e) { /* ignore */ }
      // iOS unlock: start a silent buffer inside the gesture.
      try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
    }
    if (!this._loadPromise) this._loadPromise = this._load();
    // Do not hold the caller up forever on a slow network; loading continues in the background.
    const timeout = new Promise(r => setTimeout(r, this.options.loadTimeout ?? 12000));
    await Promise.race([Promise.all([resumed, this._loadPromise]), offline ? this._loadPromise : timeout]);
  }

  setTrack(trackId, ambience) {
    const levels = {...(TRACK_AMBIENCE[trackId] || {sea: 0.5, wind: 0.5, gulls: 0.3, crowd: 0.5}), ...(ambience || {})};
    this.track = {id: trackId, levels};
    if (!this.ctx) return;
    this.crowd.setLevel(levels.crowd ?? 0.5);
    this.crowd.start();
    if (this.scene && this.scene.trackId === trackId) { this.scene.setLevels(levels); return; }
    const first = !this.scene;
    if (this.scene) { this.scene.fadeOut(2.5); this.oldScenes.push(this.scene); }
    this.scene = new Scene(this.E, trackId, levels, this.bus.amb);
    this.scene.fadeIn(first ? 1.5 : 2.5);
    this.scene.setRate(this.slow ? 0.8 : 1);
  }

  update(frame) {
    if (!this.ctx || !frame) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const dt = clamp(frame.dt ?? 1 / 60, 0, 0.25);
    const rate = frame.rate ?? 1;
    const playing = frame.playing !== false;
    this.rate = rate;

    // Slow motion (with a little hysteresis on the rate threshold).
    const slow = !!frame.slowmo || rate < (this.slow ? 0.7 : 0.6);
    if (slow !== this.slow) { this.slow = slow; this._applySlow(playing); }

    // Pause: rolling ducks out, ambience sits lower.
    if (playing !== this.playing) {
      this.playing = playing;
      this.bus.roll.gain.setTargetAtTime(playing ? 1 : 0, now, playing ? 0.05 : 0.03);
      this.bus.amb.gain.setTargetAtTime(playing ? 1 : 0.5, now, 0.3);
    }

    if (frame.listener && frame.listener.position) this._setListener(frame.listener, frame.cut ? 0 : dt, !!frame.cut);
    const L = this.listener;
    const pitch = slow ? 0.62 : rate > 1 ? 1 + 0.12 * Math.log2(rate) : 1;
    const s = {playing, slow, rate, pitch};

    if (L.valid) this.rolling.update(frame, L, s);
    const burst = this.crowd.update(frame.crowdExcitement ?? 0, playing ? dt : 0, now, s);
    if (burst > 0) this.sfx.play('cheer', {intensity: burst}, s);
    if (this.scene) this.scene.update(now, s);
    if (this.oldScenes.length) {
      this.oldScenes = this.oldScenes.filter(sc => { if (now >= sc.disposeAt) { sc.dispose(); return false; } return true; });
    }
    this.sfx.update(now);
  }

  play(name, opts = {}) {
    if (!this.ctx || this._muted && this.options.skipWhenMuted) return false;
    return this.sfx.play(name, opts || {}, {rate: this.rate || 1, slow: this.slow, playing: this.playing});
  }

  setMuted(m) {
    this._muted = !!m;
    this._applyVolume();
  }

  get muted() { return this._muted; }

  setVolume(v) {
    this._volume = clamp(+v || 0, 0, 1);
    this._applyVolume();
  }

  stopAll() {
    if (!this.ctx) return;
    this.sfx.stopAll();
    this.rolling.stopAll();
    if (this.scene) { this.scene.fadeOut(0.3); this.oldScenes.push(this.scene); this.scene = null; }
    this.crowd.stop(0.3);
    if (this.slow) { this.slow = false; this._applySlow(false); }
  }

  // --- Extras (not needed by the app; handy for tests and debugging) --------

  get context() { return this.ctx; }   // the AudioContext, or null before start()

  // A MediaStream of the final mix (after compressor and limiter), e.g. for MediaRecorder.
  // Created once; the speakers keep playing. Returns null before start() or on an OfflineAudioContext.
  captureStream() {
    if (!this.ctx || !this.ctx.createMediaStreamDestination) return null;
    if (!this._capture) {
      this._capture = this.ctx.createMediaStreamDestination();
      this.output.connect(this._capture);
    }
    return this._capture.stream;
  }
  get volume() { return this._volume; }
  get ready() { return this._loadPromise || Promise.resolve(); }
  stats() {
    const E = this.E;
    return {
      state: this.ctx?.state, track: this.track?.id, slow: this.slow, playing: this.playing,
      oneShots: this.sfx?.active ?? 0, rollingVoices: this.rolling?.voices.filter(v => v.id != null).map(v => ({id: v.id, level: +v.level.toFixed(3)})),
      loaded: E ? [...E.buffers.keys()] : [], missing: E ? [...E.missing] : [],
      sceneFallback: this.scene?.usedFallback ?? null, crowdFallback: this.crowd?.usedFallback ?? null,
    };
  }

  // --- Internals ----------------------------------------------------------------

  _init() {
    let ctx = this.options.context;
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      try { ctx = new AC({latencyHint: 'interactive'}); } catch (e) { try { ctx = new AC(); } catch (e2) { return false; } }
    }
    this.ctx = ctx;
    const opts = this.options;

    // Shared generated material (made once, reused by every voice).
    const noise = {
      white: whiteNoise(ctx, 2.5), pink: pinkNoise(ctx, 3), brown: brownNoise(ctx, 3),
      crackle: crackle(ctx, 2), curve: slowCurve(ctx, 20), swell: swellCurve(ctx, 48),
    };
    const gen = {rope: ksString(ctx, 92, 1.5, 0.9965, 0.35), creak: creak(ctx, 0.95)};

    // Buses and master chain.
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const bus = {ui: g(0.9), sfx: g(1), roll: g(1), amb: g(1)};
    this.bus = bus;
    this.worldIn = g(1);
    bus.sfx.connect(this.worldIn); bus.roll.connect(this.worldIn); bus.amb.connect(this.worldIn);
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.6;
    this.worldIn.connect(this.muffle);
    this.revSend = g(0);
    this.reverb = ctx.createConvolver(); this.reverb.normalize = false; this.reverb.buffer = impulseResponse(ctx, 2.4);
    this.worldIn.connect(this.revSend); this.revSend.connect(this.reverb); this.reverb.connect(this.muffle);

    // Low "time-stretch" drone under slow motion.
    this.slowPad = g(0);
    const pad = ctx.createBufferSource(); pad.buffer = noise.brown; pad.loop = true; pad.playbackRate.value = 0.5; pad.start();
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 160; padLp.Q.value = 0.9;
    pad.connect(padLp); padLp.connect(this.slowPad); this.slowPad.connect(this.muffle);

    this.master = g(0);
    this.muffle.connect(this.master);
    bus.ui.connect(this.master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const trim = g(0.92);
    this.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
    this.comp = comp; this.limiter = lim; this.output = trim;

    const panModel = opts.hrtf === false ? 'equalpower' : 'HRTF';
    this.E = {
      ctx, noise, gen, bus, debug: !!opts.debug,
      buffers: new Map(), missing: new Set(), loading: opts.files !== false,
      listenerPos: null,
      buffer(key) { return this.buffers.get(key) || null; },
      loopInfo(key) { const m = AUDIO_FILES[key]; return m && m.loop ? {start: m.loop[0], length: m.loop[1]} : null; },
      sprite(key, sel) {
        const m = AUDIO_FILES[key];
        if (!m || !m.sprites || !m.sprites.length) return null;
        let list = m.sprites;
        if (typeof sel === 'number') return list[sel % list.length];
        if (typeof sel === 'string') { const f = list.filter(s => s[2] === sel); if (f.length) list = f; }
        // Random, avoiding an immediate repeat.
        let i = Math.floor(Math.random() * list.length);
        if (list.length > 1 && list[i] === m._last) i = (i + 1) % list.length;
        m._last = list[i];
        return list[i];
      },
      makePanner() {
        const p = ctx.createPanner();
        p.panningModel = panModel;
        p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0; p.maxDistance = 10000;
        return p;
      },
      setPannerPos(p, x, y, z) {
        if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
      },
    };

    this.sfx = new OneShots(this.E, opts);
    this.rolling = new Rolling(this.E, bus.roll, opts);
    this.crowd = new Crowd(this.E, bus.amb);
    this._applyVolume(true);
    if (this.track) this.setTrack(this.track.id, this.track.levels);
    return true;
  }

  async _load() {
    const E = this.E, ctx = this.ctx;
    if (this.options.files === false) { E.loading = false; return; }
    const base = this.baseUrl;
    await Promise.all(Object.entries(AUDIO_FILES).map(async ([key, m]) => {
      try {
        const url = new URL(m.file, base).href;
        const ck = url + '@' + ctx.sampleRate;
        let p = BUFFER_CACHE.get(ck);
        if (!p) {
          p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); }).then(ab => decode(ctx, ab));
          BUFFER_CACHE.set(ck, p);
          p.catch(() => BUFFER_CACHE.delete(ck));
        }
        E.buffers.set(key, await p);
      } catch (e) {
        E.missing.add(key);
        if (E.debug) console.warn('[audio] using synth fallback for', key, e && e.message);
      }
    }));
    E.loading = false;
    // Swap synthesized stand-ins for the recordings that just arrived.
    if (this.crowd.usedFallback && E.buffers.size) this.crowd.build();
    if (this.scene && this.scene.usedFallback && E.buffers.size) {
      const old = this.scene;
      old.fadeOut(1.2); this.oldScenes.push(old);
      this.scene = new Scene(E, old.trackId, old.levels, this.bus.amb);
      this.scene.fadeIn(1.2);
      this.scene.setRate(this.slow ? 0.8 : 1);
    }
  }

  _applyVolume(instant) {
    if (!this.ctx) return;
    const v = this._muted ? 0 : this._volume * this._volume * MASTER;
    const t = this.ctx.currentTime;
    if (instant) this.master.gain.setValueAtTime(v, t);
    else this.master.gain.setTargetAtTime(v, t, 0.05);
  }

  _applySlow(playing) {
    const t = this.ctx.currentTime, slow = this.slow;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(slow ? 900 : 20000, t, slow ? 0.15 : 0.3);
    this.revSend.gain.setTargetAtTime(slow ? 0.24 : 0, t, slow ? 0.15 : 0.4);
    this.slowPad.gain.setTargetAtTime(slow ? 0.08 : 0, t, slow ? 0.3 : 0.2);
    if (this.scene) this.scene.setRate(slow ? 0.8 : 1);
    this.crowd.setRate(slow ? 0.8 : 1);
    if (playing) this.sfx.play(slow ? 'slowIn' : 'slowOut', {}, {rate: 1, slow: false});
  }

  _setListener(l, dt, cut) {
    const p = l.position, f = l.forward || {x: 0, y: 0, z: -1}, u = l.up || {x: 0, y: 1, z: 0};
    const L = this.listener, AL = this.ctx.listener;
    if (cut) { L.vx = L.vy = L.vz = 0; }
    if (L.valid && dt > 0) {
      let vx = (p.x - L.x) / dt, vy = (p.y - L.y) / dt, vz = (p.z - L.z) / dt;
      if (Math.hypot(vx, vy, vz) > 150) vx = vy = vz = 0; // camera cut
      const k = clamp(dt * 10, 0, 1);
      L.vx += (vx - L.vx) * k; L.vy += (vy - L.vy) * k; L.vz += (vz - L.vz) * k;
    }
    L.x = p.x; L.y = p.y; L.z = p.z; L.valid = true;
    this.E.listenerPos = L;
    if (AL.positionX) {
      AL.positionX.value = p.x; AL.positionY.value = p.y; AL.positionZ.value = p.z;
      AL.forwardX.value = f.x; AL.forwardY.value = f.y; AL.forwardZ.value = f.z;
      AL.upX.value = u.x; AL.upY.value = u.y; AL.upZ.value = u.z;
    } else {
      AL.setPosition(p.x, p.y, p.z);
      AL.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }
}

export function createAudio(options = {}) {
  return new AudioSystem(options);
}

export {ONE_SHOT_NAMES, TRACK_AMBIENCE};
