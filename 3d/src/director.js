// Cameras and the automatic director.
// The shot list is planned once from the race results, so the edit is the same
// every time you watch (and when you scrub). Slow motion only changes playback
// speed; it never changes the race. Tracks add their own cameras and highlight
// shots through track.cameras and track.planShots.
import * as THREE from 'three';
import * as P from './physics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Cameras every track has. rig({F, r, st, t, course, cut, self}) -> {pos, look, smoothing?}
export const COMMON_CAMS = {
  START: {label: 'START GATE', fov: 42, rig: ({t, course}) => {
    const k = Math.min(1, Math.max(0, (t + course.preroll) / (course.preroll + 1.6)));
    return {pos: V(11 - 2 * k, course.roadY(11) + 1.3 + 2.2 * (1 - k), 3.4 - 1.2 * k), look: V(-1, course.roadY(-1) + 0.9, 0)};
  }},
  // Pre-race: a low dolly past the pumpkins lined up at the gate.
  LINEUP: {label: 'THE LINEUP', fov: 36, rig: ({t, course, views, shot}) => {
    const lanes = views.filter(v => v.result.status !== 'DQ').map(v => v.lane), lo = Math.min(...lanes) - 0.9, hi = Math.max(...lanes) + 0.9;
    const u = Math.min(1, Math.max(0, (t - shot.start) / Math.max(0.1, shot.end - shot.start)));
    const z = hi + (lo - hi) * (u * u * (3 - 2 * u));
    // From above and behind the start chutes, centred over each stall in turn, looking down into it.
    return {pos: V(-4.6, course.roadY(-4.6) + 2.7, z), look: V(0.1, course.roadY(0.1) + 0.1, z)};
  }},
  CHASE: {label: 'CHASE', fov: 55, key: '1', rig: ({F, r, st, course}) => {
    const ahead = 8, behind = 6.5 + Math.min(3, st.v * 0.08);
    return {pos: V(F.x - behind, Math.max(course.roadY(F.x - behind), F.y) + 2.0 + r, F.z + 1.4),
      look: V(F.x + ahead, F.y + (course.roadY(F.x + ahead) - course.roadY(F.x)) * 0.6 + 0.2, F.z), smoothing: 7};
  }},
  TV: {label: 'TRACKING', fov: 30, key: '2', rig: ({F, r}) => ({pos: V(F.x + 1, F.y + 3.4, F.z + 15 + r * 6), look: V(F.x + 1.6, F.y - 0.2, F.z), smoothing: 9})},
  DRONE: {label: 'DRONE', fov: 50, key: '3', rig: ({F, t}) => {
    const a = t * 0.12 + 0.6;
    return {pos: V(F.x - 14 + Math.sin(a) * 8, F.y + 15, F.z + 22 + Math.cos(a) * 6), look: V(F.x + 4, F.y, F.z), smoothing: 4};
  }},
  HELI: {label: 'HELICOPTER', fov: 42, key: '4', rig: ({F}) => ({pos: V(F.x - 45, F.y + 55, F.z + 110), look: V(F.x + 25, F.y - 8, F.z), smoothing: 2.5})},
  ONBOARD: {label: 'PUMPKIN CAM', fov: 78, key: '5', rig: ({F, r, course}) => ({pos: V(F.x - r * 1.6 - 0.25, F.y + r + 0.32, F.z),
    look: V(F.x + 12, F.y + r + (course.roadY(F.x + 12) - course.roadY(F.x)) * 0.8, F.z), smoothing: 18})},
  ROADSIDE: {label: 'ROADSIDE', fov: 38, key: '6', rig: ({F, st, course, cut, self}) => {
    if (cut || self.station === undefined || F.x > self.station + 6) self.station = F.x + Math.max(14, Math.min(60, st.v * 2.2));
    const x = Math.min(self.station, course.length + 20);
    return {pos: V(x, course.roadY(x) + 0.75, course.roadHalf + 0.45), look: V(F.x, F.y + 0.15, F.z)};
  }},
  FINISH: {label: 'FINISH LINE', fov: 36, key: '8', ground: false, rig: ({course}) => {
    const L = course.length, x = L + 9;
    return {pos: V(x, course.roadY(x) + 0.8, -course.roadHalf + 0.35), look: V(L - 14, course.roadY(L - 14) + 0.6, 0.6)};
  }},
  ORBIT: {label: 'VICTORY LAP', fov: 45, rig: ({F, t}) => {
    const a = t * 0.25;
    return {pos: V(F.x + Math.cos(a) * 4.2, F.y + 1.5, F.z + Math.sin(a) * 4.2), look: F.clone(), smoothing: 6};
  }},
  FREE: {label: 'FREE CAMERA', fov: 50, key: '9'},
};
// Cameras the auto director chooses from between highlight shots, with typical shot lengths.
const POOL = {
  CHASE: {min: 3.2, max: 5.2}, TV: {min: 3.5, max: 5.5}, ROADSIDE: {min: 2.8, max: 4.2},
  HELI: {min: 4.5, max: 6.5}, ONBOARD: {min: 2.4, max: 3.6}, DRONE: {min: 3.8, max: 5.8},
};

export function timeAtX(result, x) {
  const f = result.frames;
  for (let i = 1; i < f.length; i++) if (f[i].centerX >= x) {
    const a = f[i - 1], b = f[i];
    return a.t + (b.t - a.t) * (x - a.centerX) / Math.max(1e-9, b.centerX - a.centerX);
  }
  return Infinity;
}

// Small deterministic random generator, seeded from the race so the edit never changes between viewings.
function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return (a >>> 0) / 4294967296; };
}

// What is happening at time t: positions in race order, the gap at the front, the closest battle.
function situation(views, t) {
  const live = views.map((v, i) => ({i, v})).filter(({v}) => v.result.status !== 'DQ' && t < v.result.time);
  const at = live.map(({i, v}) => {
    const f = P.sampleSimulation(v.result, Math.max(0, t));
    return {i, x: f.centerX, speed: f.v, air: !f.contact && f.height > 0.1};
  }).sort((a, b) => b.x - a.x);
  let battle = null;
  for (let k = 1; k < at.length; k++) {
    const gap = at[k - 1].x - at[k].x;
    if (!battle || gap < battle.gap) battle = {gap, ahead: at[k - 1].i, behind: at[k].i};
  }
  return {order: at, lead: at[0], gap: at.length > 1 ? at[0].x - at[1].x : Infinity, battle};
}

// Plan the whole edit.
export function planShots(views, preroll, track) {
  const racing = views.filter(v => v.result.status !== 'DQ');
  const results = views.map(v => v.result);
  const allDone = Math.max(0, ...racing.map(v => v.result.time));
  const finishers = views.map((v, i) => ({i, t: v.result.time, ok: v.result.status === 'FINISHED'})).filter(f => f.ok).sort((a, b) => a.t - b.t);
  const breaks = views.map((v, i) => ({i, t: v.result.time, ok: !['FINISHED', 'DQ'].includes(v.result.status)})).filter(b => b.ok);

  const fixed = [];
  const add = (start, end, cam, focus, rate = 1) => { if (end - start > 0.3) fixed.push({start, end, cam, focus, rate}); };
  // Track highlights first; a track may claim the pre-roll (e.g. Carmel's inspection).
  const extra = track.planShots ? track.planShots(views, {timeAtX, add, preroll, finishers, breaks}) || {} : {};
  const opener = fixed.filter(s => s.start <= -preroll + 0.01);
  if (opener.length) add(Math.max(...opener.map(s => s.end)), 1.6, 'START', -1);
  else if (preroll >= 4) { add(-preroll, -1.6, 'LINEUP', -1); add(-1.6, 1.6, 'START', -1); }
  else add(-preroll, 1.6, 'START', -1);
  if (finishers.length) {
    const win = finishers[0], close = finishers[1] && finishers[1].t - win.t < 0.6;
    add(win.t - 1.5, win.t + (close ? finishers[1].t - win.t + 0.8 : 1.4), 'FINISH', win.i, close ? 0.4 : 1);
  }
  for (const b of breaks) if (!fixed.some(s => b.t > s.start - 0.5 && b.t < s.end)) add(b.t - 1.2, b.t + 2.4, 'BREAK', b.i);
  const winner = finishers.length ? finishers[0].i : Math.max(0, views.findIndex(v => v.result.status !== 'DQ'));
  add(allDone + 1.2, allDone + 1e6, 'ORBIT', winner);

  // Resolve overlaps: earlier start wins; a later shot is trimmed to start when the earlier one ends.
  fixed.sort((a, b) => a.start - b.start);
  const resolved = [];
  let edge = -preroll;
  for (const s of fixed) {
    if (s.end <= edge) continue;
    resolved.push({...s, start: Math.max(s.start, edge)});
    edge = s.end;
  }

  const rand = seeded(Math.round(results.reduce((n, r) => n + r.time * 1000, 7)));
  const pool = {...POOL, ...(track.cyclePool || {})};
  const recent = [];
  const shots = [];
  const leader = t => { const i = P.leaderAt(results, Math.max(0, t)); return i < 0 ? winner : i; };

  // Score each candidate camera for the moment; never the previous camera, rarely a recent one.
  function pickCam(t, prevCam, nextCam, room) {
    const sit = situation(views, t), lead = sit.lead;
    const weights = Object.entries(pool).map(([cam, spec]) => {
      if (cam === prevCam || cam === nextCam) return [cam, 0];
      if (spec.when && !spec.when({t, sit, course: views[0].course})) return [cam, 0];
      let w = spec.weight ?? 1;
      if (recent.includes(cam)) w *= recent.at(-1) === cam ? 0 : 0.25;
      if (room < (spec.min ?? 2.5) * 0.8) w *= 0.3;                            // would be cut short
      if (t < 3) w *= {CHASE: 2.2, TV: 1.8, ONBOARD: 0.2, HELI: 0.5}[cam] ?? 1;   // the getaway
      if (sit.gap < 2.5) w *= {CHASE: 1.8, TV: 1.6, ROADSIDE: 1.3}[cam] ?? 1;    // wheel to wheel
      if (sit.gap > 12) w *= {HELI: 2, DRONE: 1.6, ONBOARD: 1.3}[cam] ?? 1;      // show the gap / the view
      if (lead?.speed > 20) w *= {ONBOARD: 1.5, ROADSIDE: 1.4}[cam] ?? 1;       // sense of speed
      if (lead?.air) w *= {TV: 2, CHASE: 1.4, ONBOARD: 0.4}[cam] ?? 1;
      return [cam, w];
    });
    const total = weights.reduce((n, [, w]) => n + w, 0);
    if (total <= 0) return Object.keys(pool).find(c => c !== prevCam && c !== nextCam) || 'CHASE';
    let r = rand() * total;
    for (const [cam, w] of weights) if ((r -= w) <= 0) return cam;
    return weights.at(-1)[0];
  }
  function pickFocus(t) {
    const sit = situation(views, t);
    // Now and then, show the closest battle further back instead of the leader.
    if (sit.battle && sit.battle.gap < 3 && sit.battle.ahead !== sit.lead?.i && rand() < 0.35) return sit.battle.behind;
    return leader(t + 0.5);
  }
  function fill(a, b, nextCam) {
    let t = a;
    while (b - t > 0.05) {
      const prev = shots.at(-1);
      const room = b - t;
      // Leftover too short for a real shot: let the previous shot run on instead of flashing a new one.
      if (room < 1.6 && prev && prev.cam !== 'START' && (prev.rate ?? 1) === 1) { prev.end = b; break; }
      const cam = pickCam(t, prev?.cam, room < 7 ? nextCam : null, room);
      const spec = pool[cam] || {min: 3, max: 5};
      let len = spec.min + rand() * (spec.max - spec.min);
      if (room - len < 1.6) len = room;          // don't leave a sliver before the next highlight
      shots.push({start: t, end: t + len, cam, focus: pickFocus(t), rate: 1});
      recent.push(cam); if (recent.length > 3) recent.shift();
      t += len;
    }
  }
  let cursor = -preroll;
  resolved.forEach((s, k) => {
    // A sliver before this highlight that the previous shot can't absorb: start the highlight early.
    const prev = shots.at(-1);
    if (s.start > cursor && s.start - cursor < 1.6 && prev && ((prev.rate ?? 1) !== 1 || prev.cam === 'START')) s = {...s, start: cursor};
    if (s.start > cursor) fill(cursor, s.start, s.cam);
    // A highlight that would repeat the camera just used switches to a fitting alternative.
    let cam = s.cam;
    if (cam === 'BREAK') cam = shots.at(-1)?.cam === 'TV' ? 'DRONE' : 'TV';
    if (shots.at(-1)?.cam === cam && POOL[cam]) cam = Object.keys(POOL).find(c => c !== cam && c !== resolved[k + 1]?.cam) || cam;
    shots.push({...s, cam});
    cursor = s.end;
  });
  // No flash cuts: a shot shorter than 1.2 s on screen (slow motion counts at its real length)
  // is folded into the shot before it.
  // Merge into the neighbour with the same camera if there is one, otherwise into a normal-speed
  // neighbour, so a sliver of normal time doesn't stretch a slow-motion shot.
  for (let i = 1; i < shots.length - 1; i++) {
    const s = shots[i], prev = shots[i - 1], next = shots[i + 1];
    if ((s.end - s.start) / (s.rate || 1) >= 1.2) continue;
    const same = n => n.cam === s.cam && n.focus === s.focus;
    const intoNext = next.cam !== 'ORBIT' && (same(next) || (!same(prev) && (next.rate ?? 1) > (prev.rate ?? 1)));
    if (intoNext) next.start = s.start; else prev.end = s.end;
    shots.splice(i, 1); i--;
  }
  return {shots, finishers, breaks, allDone, extra};
}

export class Director {
  constructor(camera, views, controls, course, track) {
    this.camera = camera; this.views = views; this.controls = controls; this.course = course; this.track = track;
    this.cams = {...COMMON_CAMS, ...(track.cameras || {})};
    this.mode = 'AUTO'; this.manualFocus = 0; this.lastShot = null; this.self = {};
    this.smoothPos = new THREE.Vector3(); this.smoothLook = new THREE.Vector3();
    this.cutPending = true;
  }

  setPlan(plan) { this.plan = plan; this.cutPending = true; this.lastShot = null; }

  shotAt(t) {
    if (this.mode !== 'AUTO') {
      const m = this.manual;
      if (!m || m.cam !== this.mode || m.focus !== this.manualFocus) this.manual = {cam: this.mode, focus: this.manualFocus, rate: 1, start: 0, end: Infinity, manual: true};
      return this.manual;
    }
    const s = this.plan.shots;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return s[i];
    return s[0];
  }

  // Place the camera for time t. dt is real seconds since the last frame.
  update(t, dt) {
    const shot = this.shotAt(t);
    // Consecutive segments of the same camera on the same pumpkin (e.g. a slow-motion speed ramp) are one shot.
    const continues = this.lastShot && shot !== this.lastShot && shot.cam === this.lastShot.cam && shot.focus === this.lastShot.focus;
    const cut = (shot !== this.lastShot && !continues) || this.cutPending;
    this.lastShot = shot; this.cutPending = false;
    const def = this.cams[shot.cam] || this.cams.CHASE;
    let fi = shot.focus >= 0 ? shot.focus : 0;
    if (this.views[fi]?.result.status === 'DQ' && !def.allowDQ) fi = Math.max(0, this.views.findIndex(v => v.result.status !== 'DQ'));
    const focus = this.views[Math.min(this.views.length - 1, fi)];
    const F = focus.root.position, r = focus.radius, st = focus.state || {v: 0};

    this.controls.enabled = shot.cam === 'FREE';
    if (shot.cam === 'FREE') {
      if (cut) { this.controls.target.copy(F); this.camera.position.copy(F).add(V(-8, 4, 10)); }
      this.controls.target.lerp(F, 1 - Math.exp(-dt * 4));
      this.controls.update();
      this.setFov(def.fov);
      return {shot, focus, label: def.label, cut};
    }
    const {pos, look, smoothing = 0} = def.rig({F, r, st, t, course: this.course, cut, self: this.self, views: this.views, focus, shot});
    if (def.ground !== false) { // never underground
      const floor = Math.max(this.course.terrainH(pos.x, pos.z), this.course.sea === false ? -1e9 : 0.5) + 0.4;
      if (pos.y < floor) pos.y = floor;
    }
    if (cut || !smoothing) { this.smoothPos.copy(pos); this.smoothLook.copy(look); }
    else {
      this.smoothPos.lerp(pos, 1 - Math.exp(-dt * smoothing));
      this.smoothLook.lerp(look, 1 - Math.exp(-dt * smoothing * 1.6));
    }
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
    this.setFov(def.fov);
    return {shot, focus, label: def.label, cut};
  }

  setFov(f) {
    if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
  }
}
