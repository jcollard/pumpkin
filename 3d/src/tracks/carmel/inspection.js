// Pre-race inspection at the Carmel start: a striped tent beside the gate,
// an inspector with clipboard and magnifying glass walking the line of
// pumpkins, green flags for the cleared ones, and the guilty pumpkin rolled
// aside into a roped DQ pen. Everything is a pure function of race time t
// (negative during the pre-roll), so scrubbing is always consistent.
import * as THREE from 'three';
import * as P from '../../physics.js';
import {clamp, smooth} from '../../noise.js';
import {box, rod, merge, mesh} from '../../env/geom.js';
import * as CT from './tex.js';
import {rigged} from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const PREROLL = 8.5;
export const TENT = {x: -5.2, z: -7.9, w: 4.2, d: 3.0};
export const PEN = {x: -2.15, z: -7.55};
const ease = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

// --- Figures ---------------------------------------------------------------
// Simple people built from capsules. Local +X is forward. Returns {root, parts}.
function figure({coat, trousers = 0x2b3038, skin = 0xe0b08a, hat = 'boater', hatColor = 0xe6d3a0, band = 0x2b2b2b, long = false}) {
  const M = c => new THREE.MeshStandardMaterial({color: c, roughness: 0.8});
  const root = new THREE.Group(), hips = new THREE.Group(), torso = new THREE.Group();
  hips.position.y = 0.9; root.add(hips); hips.add(torso);
  const leg = s => {
    const g = new THREE.Group(); g.position.z = s * 0.1;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.72, 3, 8), M(trousers)); m.position.y = -0.44; g.add(m);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.11), M(0x2a211b)); shoe.position.set(0.05, -0.86, 0); g.add(shoe);
    hips.add(g); return g;
  };
  const legL = leg(-1), legR = leg(1);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, long ? 0.62 : 0.4, 4, 10), M(coat));
  body.scale.set(0.82, 1, 1.05); body.position.y = long ? 0.2 : 0.3; torso.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), M(skin)); head.position.y = 0.76; torso.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), M(skin)); nose.position.set(0.105, 0.75, 0); torso.add(nose);
  if (hat === 'boater') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 18), M(hatColor)); brim.position.y = 0.84;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.09, 18), M(hatColor)); crown.position.y = 0.89;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.03, 18), M(band)); b.position.y = 0.865;
    torso.add(brim, crown, b);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(hatColor)); cap.position.y = 0.8;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.16), M(hatColor)); peak.position.set(0.12, 0.81, 0);
    torso.add(cap, peak);
  }
  const arm = s => {
    const g = new THREE.Group(); g.position.set(0, 0.56, s * 0.24);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.5, 3, 8), M(coat)); m.position.y = -0.3; g.add(m);
    const hand = new THREE.Group(); hand.position.y = -0.6; g.add(hand);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(skin)); hand.add(h);
    torso.add(g); return {g, hand};
  };
  const armL = arm(-1), armR = arm(1);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {root, hips, torso, legL, legR, armL, armR, head};
}

function magnifier() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 8), new THREE.MeshStandardMaterial({color: 0x3a2618, roughness: 0.6}));
  handle.position.y = -0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20), new THREE.MeshStandardMaterial({color: 0xc9a54a, metalness: 0.8, roughness: 0.3}));
  ring.position.y = -0.19; ring.rotation.y = Math.PI / 2;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.066, 20), new THREE.MeshStandardMaterial({color: 0xcfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide}));
  glass.position.y = -0.19; glass.rotation.y = Math.PI / 2;
  g.add(handle, ring, glass);
  return g;
}

function clipboard() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.31, 0.012), new THREE.MeshStandardMaterial({color: 0x8a5a32, roughness: 0.7}));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshStandardMaterial({color: 0xf6f3ea, roughness: 0.9}));
  paper.position.set(0, -0.015, 0.0065);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.02), new THREE.MeshStandardMaterial({color: 0xb0b0b0, metalness: 0.8, roughness: 0.3}));
  clip.position.set(0, 0.145, 0.01);
  g.add(b, paper, clip);
  return g;
}

function paddle(text, bg) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6), new THREE.MeshStandardMaterial({color: 0x5a4030}));
  stick.position.y = 0.2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), new THREE.MeshStandardMaterial({map: CT.placardTexture(text, bg), roughness: 0.6, side: THREE.DoubleSide}));
  face.position.y = 0.55; face.rotation.y = Math.PI / 2;
  g.add(stick, face);
  return g;
}

// Pose: walk phase w (radians), lean (rad), arms: {l, r} rotation about z (negative = forward/up).
function pose(f, {walk = 0, stride = 0, lean = 0, armL = 0, armR = 0}) {
  const s = Math.sin(walk) * stride;
  f.legL.rotation.z = s; f.legR.rotation.z = -s;
  f.torso.rotation.z = -lean;
  f.armL.g.rotation.z = armL - s * 0.8; f.armR.g.rotation.z = armR + s * 0.8;
  f.hips.position.y = 0.9 - Math.abs(Math.sin(walk)) * stride * 0.06 - lean * 0.1;
}

// One official: rigged catalogue character or capsule fallback, with props in the hands.
// apply(st): st.walk = metres travelled (null when standing), st.exam/up 0..1 blend weights.
function official(g, look, {right = [], left = [], wave = []}) {
  const R = g ? rigged(g) : null;
  if (!R) {
    const f = figure(look);
    for (const o of right) f.armR.hand.add(o);
    for (const o of [...left, ...wave]) f.armL.hand.add(o);
    return {root: f.root, apply(st) {
      pose(f, {walk: st.walk != null ? st.walk / 0.32 * Math.PI : 0, stride: st.walk != null ? st.stride ?? 0.45 : 0, lean: st.lean ?? 0, armL: st.armL ?? 0, armR: st.armR ?? 0});
      f.head.rotation.z = -0.3 * (st.exam ?? 0);
    }};
  }
  const B = R.bones, has = n => R.actions[n];
  R.root.rotation.order = 'YXZ';
  const inner = new THREE.Group(); inner.add(R.root); inner.rotation.y = Math.PI / 2; // catalogue characters face +Z; ours face +X
  const outer = new THREE.Group(); outer.add(inner);
  // Props: counter the armature scale so they keep their real size.
  const attach = (bone, o, pos, rot) => {
    if (!bone) return;
    R.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);
    o.scale.setScalar(1 / ws.x); o.position.copy(pos).multiplyScalar(1 / ws.x); o.rotation.copy(rot);
    bone.add(o);
  };
  // Which hand waves? Pose the wave and compare wrist heights.
  let waveHand = B.WristL;
  if (has('Wave') && B.WristL && B.WristR) {
    R.pose([['Wave', R.duration('Wave') * 0.35]]); R.root.updateMatrixWorld(true);
    const l = new THREE.Vector3(), r = new THREE.Vector3(); B.WristL.getWorldPosition(l); B.WristR.getWorldPosition(r);
    waveHand = r.y > l.y ? B.WristR : B.WristL;
  }
  const other = waveHand === B.WristL ? B.WristR : B.WristL;
  for (const o of right) attach(other, o, V(0, 0.1, 0.03), new THREE.Euler(0, 0, Math.PI));
  for (const o of left) attach(waveHand, o, V(0, 0.12, 0.05), new THREE.Euler(Math.PI / 2, 0, 0));
  for (const o of wave) attach(waveHand, o, V(0, 0.05, 0), new THREE.Euler(0, 0, 0));
  const idleClip = has('Idle_Neutral') ? 'Idle_Neutral' : has('Standing') ? 'Standing' : 'Idle';
  return {root: outer, rigged: true, apply(st) {
    const exam = has('Interact') ? st.exam ?? 0 : 0, up = has('Wave') ? st.up ?? 0 : 0;
    const base = st.walk != null && has('Walk') ? ['Walk', st.walk / 1.35] : [st.still && has(st.still) ? st.still : idleClip, st.idle ?? 0];
    const wBase = (1 - exam) * (1 - up);
    const list = [[base[0], base[1], wBase]];
    if (exam > 0) list.push(['Interact', 0.35 + 0.25 * Math.sin((st.examT ?? 0) * 2.2), exam * (1 - up)]);
    if (up > 0) list.push(['Wave', Math.min(R.duration('Wave') * 0.42, 0.25 + (st.upT ?? 0) * 0.5), up]);
    R.pose(list);
    if (B.Chest && st.lean) B.Chest.rotation.x += st.lean * 0.6;
    if (B.Abdomen && st.lean) B.Abdomen.rotation.x += st.lean * 0.5;
  }};
}

// --- The script ------------------------------------------------------------
// The shared timeline (main.js shows the game's 2D inspector in a pop-up):
// inspector reaches the lineup by start + 2/7 D, scans the guilty pumpkin until
// the verdict at start + 5.5/7 D. Afterwards the guilty pumpkin is rolled to
// the DQ pen and the cleared ones roll down from the lineup to the gate.
export const LINEUP_X = -2.4;     // pumpkins wait here for inspection (uphill of the gate)
const INSP_X = LINEUP_X - 0.95;   // the inspector works from the uphill side, facing the sea
export function inspectionTiming(course) {
  if (course._inspTiming) return course._inspTiming;
  const start = -PREROLL + 0.4, duration = clamp(PREROLL - 2.6, 4, 7);
  return {start, duration, verdict: start + duration * 5.5 / 7};
}

// Built once per race from the views (deterministic), then sampled by time.
// All times inside are tv = t + PREROLL (seconds into the pre-roll).
export function makeScript(views, course) {
  const n = views.length, order = views.map((v, i) => i).sort((a, b) => views[a].lane - views[b].lane);
  const dq = views.findIndex(v => v.result.status === 'DQ');
  const T = inspectionTiming(course), t0 = T.start + PREROLL, arrive = T.start + T.duration * 2 / 7 + PREROLL, verdict = T.verdict + PREROLL;
  const tentMouth = {x: TENT.x + TENT.w / 2 + 0.2, z: -course.roadHalf - 1.1};
  const wp = [{t: 0, x: tentMouth.x, z: tentMouth.z}, {t: t0, x: tentMouth.x, z: tentMouth.z}];
  const clearAt = new Array(n).fill(Infinity);
  let scan = null;
  const zFirst = views[order[0]].lane;
  wp.push({t: t0 + (arrive - t0) * 0.45, x: INSP_X, z: zFirst - 0.9});
  if (dq >= 0) {
    // Same route as the 2D inspector: a short look at every pumpkin along the line,
    // then back to the guilty one to examine it until the verdict.
    const g = x => t0 + T.duration * x / 7, per = (3.7 - 0.9) / n, stops = [];
    order.forEach((i, j) => {
      const z = views[i].lane, a = g(0.9 + j * per), b = g(0.9 + (j + 0.55) * per);
      if (a > wp.at(-1).t + 0.01) wp.push({t: a, x: INSP_X, z});
      wp.push({t: b, x: INSP_X, z});
      stops.push({a, b});
    });
    const zk = views[dq].lane, back = g(4.5), v = verdict;
    wp.push({t: back, x: INSP_X, z: zk});
    wp.push({t: v + 0.35, x: INSP_X - 0.1, z: zk + 0.8}, {t: v + 1.2, x: INSP_X - 0.1, z: zk + 0.8}); // steps aside, paddle up
    scan = {a: back, b: v, zk, stops};
    order.forEach((i, j) => { if (i !== dq) clearAt[i] = v + 0.3 + 0.13 * j; });
    clearAt[dq] = v;
  } else {
    // Nobody to disqualify: a brisk walk along the line, clearing each pumpkin.
    const zLast = views[order.at(-1)].lane, span = Math.max(0.5, verdict - 0.3 - arrive);
    wp.push({t: arrive, x: INSP_X, z: zFirst});
    order.forEach((i, j) => {
      const tt = arrive + span * (n > 1 ? j / (n - 1) : 1);
      if (j) wp.push({t: tt, x: INSP_X, z: views[i].lane});
      clearAt[i] = tt + 0.15;
    });
    wp.push({t: verdict + 1.2, x: INSP_X, z: zLast});
  }
  const exit = {x: INSP_X - 0.5, z: course.roadHalf + 1.3};
  const tLast = wp.at(-1).t;
  wp.push({t: tLast + 1.6, x: exit.x, z: exit.z});
  // The DQ pumpkin is rolled to the pen by a helper.
  const y0 = course.roadY(0);
  let roll = null;
  if (dq >= 0) {
    const v = views[dq], spot = course.dqSpot(dq);
    roll = {i: dq, t0: verdict + 0.4, t1: verdict + 1.6, p0: V(LINEUP_X, 0, v.lane), c: V(LINEUP_X - 2.0, 0, v.lane), p2: V(spot.x, 0, spot.z), r: v.radius};
  }
  // The cleared pumpkins roll from the lineup down to the gate.
  const g1 = Math.min(PREROLL - 1.0, verdict + 2.7), g0 = g1 - 1.5;
  const artificial = views.map(v => P.properties(v.p).artificial), maxA = Math.max(0, ...artificial);
  return {n, order, dq, wp, roll, scan, clearAt, verdict, arrive, t0, preroll: PREROLL, zMax: Math.max(...views.map(v => v.lane)), zMin: Math.min(...views.map(v => v.lane)), gate: {t0: g0, t1: g1}, tie: dq < 0 && maxA > 0, y0,
    opener: Math.min(PREROLL - 1.3, g1 - 0.25), popEnd: inspectionTiming(course).start + inspectionTiming(course).duration + PREROLL, tentMouth};
}

function inspectorAt(S, tv) {
  const wp = S.wp;
  if (tv <= wp[0].t) return {x: wp[0].x, z: wp[0].z, moving: false, dir: 0, travelled: 0};
  for (let i = 1; i < wp.length; i++) if (tv <= wp[i].t) {
    const a = wp[i - 1], b = wp[i], u = (tv - a.t) / Math.max(1e-6, b.t - a.t), e = ease(u);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    return {x: lerp(a.x, b.x, e), z: lerp(a.z, b.z, e), moving: dist > 0.05 && u > 0.02 && u < 0.98, dir: Math.atan2(-(b.z - a.z), b.x - a.x), travelled: dist * e + i * 3.1};
  }
  const l = wp.at(-1);
  return {x: l.x, z: l.z, moving: false, dir: 0, travelled: 0};
}

// Lineup position of a racing pumpkin during the pre-roll (x along the lane).
export function lineupX(S, tv) {
  return lerp(LINEUP_X, 0, ease((tv - S.gate.t0) / (S.gate.t1 - S.gate.t0)));
}

// Quadratic Bezier on the ground plane.
function bez(p0, c, p2, s) {
  const a = (1 - s) * (1 - s), b = 2 * s * (1 - s), d = s * s;
  return {x: a * p0.x + b * c.x + d * p2.x, z: a * p0.z + b * c.z + d * p2.z};
}

// --- Scenery + animation -----------------------------------------------------
export function buildInspection(group, course, mats, {ground, lib = null}) {
  const g = new THREE.Group(); group.add(g);
  const T = TENT, gy = (x, z) => ground(x, z);
  // Tent: four poles, striped pitched roof, valances, INSPECTION banner facing the lane.
  const stripes = CT.stripeTexture('#f4efe2', '#2f6d8c', 10);
  const canvasMat = new THREE.MeshStandardMaterial({map: stripes, roughness: 0.9, side: THREE.DoubleSide});
  const x0 = T.x - T.w / 2, x1 = T.x + T.w / 2, z0 = T.z - T.d / 2, z1 = T.z + T.d / 2;
  const base = Math.max(gy(x0, z0), gy(x1, z0), gy(x0, z1), gy(x1, z1));
  const eave = base + 2.3, ridge = base + 3.1;
  const poles = [];
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) poles.push(rod(V(x, gy(x, z) - 0.2, z), V(x, eave + 0.02, z), 0.035, 6));
  poles.push(rod(V(T.x, gy(T.x, z0) - 0.2, z0), V(T.x, ridge, z0), 0.03, 6), rod(V(T.x, gy(T.x, z1) - 0.2, z1), V(T.x, ridge, z1), 0.03, 6));
  g.add(mesh(merge(poles), new THREE.MeshStandardMaterial({color: 0xdedbd4, metalness: 0.6, roughness: 0.4})));
  const roof = new THREE.BufferGeometry();
  const rp = [x0 - 0.1, eave, z1 + 0.1, x1 + 0.1, eave, z1 + 0.1, x1 + 0.1, ridge, T.z, x0 - 0.1, ridge, T.z,
    x1 + 0.1, eave, z0 - 0.1, x0 - 0.1, eave, z0 - 0.1, x0 - 0.1, ridge, T.z, x1 + 0.1, ridge, T.z];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 2, 1, 0, 1, 0, 0, 2, 0, 2, 1, 0, 1], 2));
  roof.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); roof.computeVertexNormals();
  g.add(mesh(roof, canvasMat));
  const valance = new THREE.MeshStandardMaterial({map: CT.bannerTexture('INSPECTION', {bg: '#f4efe2', stripe: '#2f6d8c', font: 'bold 92px'}), roughness: 0.9, side: THREE.DoubleSide});
  const front = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 0.2, 0.42), valance); front.position.set(T.x, eave - 0.2, z1 + 0.11); g.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 0.2, 0.42), canvasMat); back.position.set(T.x, eave - 0.2, z0 - 0.11); g.add(back);
  for (const x of [x0 - 0.11, x1 + 0.11]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(T.d + 0.2, 0.42), canvasMat); s.rotation.y = Math.PI / 2; s.position.set(x, eave - 0.2, T.z); g.add(s); }
  // Back wall canvas so the tent reads as a booth.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(T.w, 2.1), new THREE.MeshStandardMaterial({color: 0xe9e3d3, roughness: 0.95, side: THREE.DoubleSide}));
  wall.position.set(T.x, base + 1.05, z0 + 0.02); g.add(wall);
  // Table with a platform scale, tape measure, tag box.
  const tz = T.z - 0.35, ty = gy(T.x, tz) + 0.78, wood = mats.wood;
  const tparts = [box(T.x, ty, tz, 2.3, 0.05, 0.85)];
  for (const [dx, dz] of [[-1.05, -0.35], [1.05, -0.35], [-1.05, 0.35], [1.05, 0.35]]) tparts.push(box(T.x + dx, ty - 0.4, tz + dz, 0.05, 0.78, 0.05));
  g.add(mesh(merge(tparts), wood));
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.4, 0.9), new THREE.MeshStandardMaterial({color: 0x2f6d8c, roughness: 0.9}));
  cloth.position.set(T.x, ty - 0.18, tz); g.add(cloth);
  const metal = new THREE.MeshStandardMaterial({color: 0xb9bcbf, metalness: 0.7, roughness: 0.35});
  const scale = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), metal); scale.position.set(T.x - 0.5, ty + 0.06, tz); g.add(scale);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 18), new THREE.MeshStandardMaterial({color: 0xf6f3ea}));
  dial.rotation.z = Math.PI / 2; dial.position.set(T.x - 0.24, ty + 0.15, tz); g.add(dial);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.05), metal); caliper.position.set(T.x + 0.3, ty + 0.035, tz + 0.15); caliper.rotation.y = 0.4; g.add(caliper);
  const tags = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), new THREE.MeshStandardMaterial({color: 0x8a5a32})); tags.position.set(T.x + 0.75, ty + 0.08, tz - 0.1); g.add(tags);
  const sheet = clipboard(); sheet.rotation.x = -Math.PI / 2; sheet.position.set(T.x + 0.1, ty + 0.035, tz - 0.05); g.add(sheet);
  // Chalkboard easel: what the inspection checks.
  const ex = T.x + T.w / 2 + 0.2, ez = T.z + T.d / 2 + 0.35;
  const easel = makeChalkboard(); easel.position.set(ex, gy(ex, ez), ez); easel.rotation.y = -0.25; g.add(easel);

  // DQ pen: four posts, red rope, placard and flag.
  const pg = gy(PEN.x, PEN.z), posts = [], rope = [];
  const pc = [[-0.8, -0.75], [0.8, -0.75], [0.8, 0.75], [-0.8, 0.75]].map(([dx, dz]) => V(PEN.x + dx, gy(PEN.x + dx, PEN.z + dz), PEN.z + dz));
  for (const p of pc) posts.push(rod(V(p.x, p.y - 0.1, p.z), V(p.x, p.y + 0.62, p.z), 0.035, 6));
  for (let i = 0; i < 4; i++) { const a = pc[i], b = pc[(i + 1) % 4]; if (i === 3) continue; rope.push(rod(V(a.x, a.y + 0.55, a.z), V(b.x, b.y + 0.55, b.z), 0.015, 4)); }
  g.add(mesh(merge(posts), mats.wood), mesh(merge(rope), new THREE.MeshStandardMaterial({color: 0xc0281e, roughness: 0.6})));
  const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), new THREE.MeshStandardMaterial({map: CT.placardTexture('DQ', '#c0281e'), roughness: 0.6, side: THREE.DoubleSide}));
  const plx = PEN.x - 0.2, plz = PEN.z - 0.95;
  placard.position.set(plx, gy(plx, plz) + 1.05, plz); placard.rotation.y = 0.15; g.add(placard);
  g.add(mesh(rod(V(plx, gy(plx, plz) - 0.1, plz - 0.02), V(plx, gy(plx, plz) + 0.86, plz - 0.02), 0.025, 6), mats.wood));
  const flagPole = V(PEN.x + 0.95, gy(PEN.x + 0.95, PEN.z - 0.8), PEN.z - 0.8);
  g.add(mesh(rod(V(flagPole.x, flagPole.y - 0.1, flagPole.z), V(flagPole.x, flagPole.y + 1.9, flagPole.z), 0.022, 6), new THREE.MeshStandardMaterial({color: 0xdedbd4, metalness: 0.5})));
  const redFlag = flagMesh(0xd0261c, 0.55, 0.36); redFlag.position.set(flagPole.x, flagPole.y + 1.62, flagPole.z); g.add(redFlag);

  // Officials: catalogue characters when available (Quaternius farmer as the inspector, a man in a suit
  // as his helper, a scorekeeper at the table), simple capsule figures otherwise.
  const mag = magnifier(), clip = clipboard(), red = paddle('DQ', '#c0281e'), green = paddle('OK', '#2f8a46');
  const insp = official(lib?.farmer, {coat: 0xf2efe6, trousers: 0x2b3038, hat: 'boater', long: true}, {right: [mag], left: [clip], wave: [red, green]});
  const helper = official(lib?.suit, {coat: 0xe8742a, trousers: 0x3a3f4a, hat: 'cap', hatColor: 0x2f6d8c}, {});
  const keeper = official(lib?.woman, {coat: 0x2f4a6d, trousers: 0x2b2b2b, hat: 'boater', hatColor: 0xd9c690}, {left: [clipboard()]});
  keeper.root.position.set(T.x - 0.2, gy(T.x, T.z - 1.0), T.z - 1.0); keeper.root.rotation.y = -Math.PI / 2;
  g.add(insp.root, helper.root, keeper.root);

  // Flags: one per entrant slot (green = cleared, red = disqualified). Created on race.
  const flagGroup = new THREE.Group(); g.add(flagGroup);
  let S = null, flags = [], views = [];

  function onRace(vs, timing) {
    views = vs;
    if (timing) course._inspTiming = timing;
    S = makeScript(vs, course);
    course._insp = S;
    for (const f of flags) flagGroup.remove(f.mesh);
    flags = vs.map((v, i) => {
      const m = flagStake(i === S.dq ? 0xd0261c : 0x2f9a4a), x = LINEUP_X - 0.62, z = v.lane - Math.min(0.42, v.radius + 0.1);
      m.position.set(x, course.roadY(x), z); flagGroup.add(m);
      return {mesh: m, at: S.clearAt[i]};
    });
  }

  const tmpQ = new THREE.Quaternion(), axis = new THREE.Vector3(), ID = new THREE.Quaternion();
  function update(t, wall) {
    const tv = t + PREROLL;
    keeper.apply({idle: wall, lean: 0.1, armL: -0.7, armR: -0.9 + 0.12 * Math.sin(wall * 3), still: 'Standing'});
    if (!S) { // idle (before a race): the officials wait by the tent
      const ix = TENT.x + TENT.w / 2 + 0.2, iz = -course.roadHalf - 1.1;
      insp.root.position.set(ix, gy(ix, iz), iz); insp.root.rotation.y = -Math.PI / 2;
      helper.root.position.set(PEN.x + 1.1, gy(PEN.x + 1.1, PEN.z + 0.35), PEN.z + 0.35);
      insp.apply({idle: wall}); helper.apply({idle: wall + 1});
      red.visible = green.visible = false; mag.visible = true;
      return;
    }
    // Racing pumpkins: waiting at the lineup, then rolling down to the gate (pre-roll only).
    if (tv < S.gate.t1 + 0.05 && t < 0) {
      const x = lineupX(S, tv);
      for (const v of views) if (v.result.status !== 'DQ') {
        const c0 = v.frames[0];
        v.root.position.set(x, course.roadY(x) + c0.centerY + course.H0 - course.roadY(0), v.lane);
        v.spin.rotation.z = -(x - c0.centerX) / v.radius;
      }
    }
    // Inspector.
    const p = inspectorAt(S, tv), sc = S.scan;
    insp.root.position.set(p.x, gy(p.x, p.z), p.z);
    // A calm inspector: a steady look at each stop, a longer one at the guilty pumpkin, nothing while walking.
    let exam = 0;
    if (sc) {
      for (const st of sc.stops || []) if (tv >= st.a && tv <= st.b) exam = 0.4 * clamp(Math.min((tv - st.a) / 0.15, (st.b - tv) / 0.15), 0, 1);
      exam = Math.max(exam, 0.6 * ease((tv - sc.a) / 0.3) * (1 - ease((tv - sc.b + 0.15) / 0.2)));
    } else if (tv > S.arrive && tv < S.verdict && !p.moving) exam = 0.35;
    const dqUp = S.dq >= 0 ? ease((tv - S.verdict) / 0.22) * (1 - ease((tv - S.verdict - 1.15) / 0.3)) : 0;
    const okUp = S.dq < 0 ? ease((tv - S.verdict) / 0.25) * (1 - ease((tv - S.verdict - 1.15) / 0.3)) : 0;
    const up = Math.max(dqUp, okUp);
    let yaw = p.moving && exam < 0.5 ? p.dir : 0;
    if (!p.moving && tv > S.wp.at(-1).t) yaw = -0.4; // watches the start from the side
    if (!p.moving && tv < S.t0) yaw = -Math.PI / 2;
    insp.root.rotation.y = yaw;
    insp.apply({walk: p.moving ? p.travelled : null, idle: wall, exam, examT: tv, up, upT: tv - S.verdict, lean: 0.3 * exam, armR: -1.0 * exam - 0.1, armL: -0.75 * (1 - up) - 2.75 * up, stride: 0.45 * (1 - exam * 0.6)});
    mag.visible = up < 0.5; red.visible = dqUp > 0.02; green.visible = okUp > 0.02;
    mag.rotation.z = 1.2 * exam;
    // Flags pop up when each pumpkin is cleared (green) or disqualified (red).
    for (const f of flags) { const k = clamp((tv - f.at) / 0.25, 0, 1); f.mesh.visible = k > 0; f.mesh.scale.set(1, Math.max(0.01, k), 1); }
    // Helper and the DQ pumpkin.
    const R = S.roll;
    if (R) {
      const v = views[R.i], s = ease((tv - R.t0) / (R.t1 - R.t0)), q = bez(R.p0, R.c, R.p2, s);
      const ahead = bez(R.p0, R.c, R.p2, Math.min(1, s + 0.03)), back = bez(R.p0, R.c, R.p2, Math.max(0, s - 0.03));
      let tx = ahead.x - back.x, tz = ahead.z - back.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (tv < R.t1 + 0.01) v.root.position.set(q.x, gy(q.x, q.z) + R.r, q.z); // after that its view parks it at dqSpot
      const dist = arcLen(R, s);
      tmpQ.setFromAxisAngle(axis.set(-0.85, 0, -0.5).normalize(), dist / R.r);
      v.spin.quaternion.copy(s > 0 ? tmpQ : ID);
      const guard = {x: PEN.x + 1.1, z: PEN.z + 0.35};
      let hx = guard.x, hz = guard.z, hyaw = Math.PI / 2 - 0.4, hlean = 0, hstride = 0, hwalk = 0, harms = 0;
      const tw = R.t0 - 0.9;
      if (tv >= tw && tv < R.t0) { // walks over, stopping uphill of the pumpkin
        const u = ease((tv - tw) / 0.9), to = {x: R.p0.x + R.r + 0.42, z: R.p0.z};
        hx = lerp(guard.x, to.x, u); hz = lerp(guard.z, to.z, u); hstride = u > 0 && u < 1 ? 0.45 : 0; hwalk = u * Math.hypot(to.x - guard.x, to.z - guard.z);
        hyaw = u < 0.92 ? Math.atan2(-(to.z - guard.z), to.x - guard.x) : Math.PI;
      } else if (tv >= R.t0 && tv < R.t1) { // pulls it back and rolls it to the pen
        hx = q.x - tx * (R.r + 0.42); hz = q.z - tz * (R.r + 0.42); hyaw = Math.atan2(-tz, tx); hlean = 0.22; hstride = 0.35; hwalk = dist; harms = -1.25;
      } else if (tv >= R.t1) {
        const u = ease((tv - R.t1) / 0.9), end = bez(R.p0, R.c, R.p2, 1), from = {x: end.x - tx * (R.r + 0.42), z: end.z - tz * (R.r + 0.42)}, to = {x: R.p2.x + 1.0, z: R.p2.z + 0.55};
        hx = lerp(from.x, to.x, u); hz = lerp(from.z, to.z, u); hstride = u > 0 && u < 1 ? 0.4 : 0; hwalk = u * Math.hypot(to.x - from.x, to.z - from.z);
        hyaw = u < 1 ? Math.atan2(-(to.z - from.z), to.x - from.x) : Math.PI / 2 + 0.3;
      }
      helper.root.position.set(hx, gy(hx, hz), hz); helper.root.rotation.y = hyaw;
      helper.apply({walk: hstride ? hwalk : null, idle: wall + 1, lean: hlean, armL: harms, armR: harms, stride: hstride});
    } else {
      helper.root.position.set(PEN.x + 1.1, gy(PEN.x + 1.1, PEN.z + 0.35), PEN.z + 0.35); helper.root.rotation.y = Math.PI / 2 - 0.4;
      helper.apply({idle: wall + 1});
    }
  }
  return {onRace, update, inspector: insp};
}

function arcLen(R, s) { // length along the Bezier up to s (few samples)
  let L = 0, prev = bez(R.p0, R.c, R.p2, 0);
  for (let k = 1; k <= 12; k++) { const q = bez(R.p0, R.c, R.p2, s * k / 12); L += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
  return L;
}

function flagMesh(color, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 6, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + w / 2; p.setXYZ(i, x, p.getY(i), Math.sin(x * 9) * 0.04 * x / w); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color, roughness: 0.8, side: THREE.DoubleSide}));
  m.castShadow = true;
  return m;
}

function flagStake(color) {
  const g = new THREE.Group();
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 5), new THREE.MeshStandardMaterial({color: 0xe8e2d2}));
  stake.position.y = 0.47; g.add(stake);
  const f = flagMesh(color, 0.3, 0.2); f.position.y = 0.84; f.rotation.y = -Math.PI / 2; g.add(f);
  return g;
}

function makeChalkboard() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2d3a33'; ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 16; ctx.strokeRect(0, 0, 256, 320);
  ctx.fillStyle = '#efeadc'; ctx.textAlign = 'center'; ctx.font = 'bold 30px Georgia, serif'; ctx.fillText('INSPECTION', 128, 52);
  ctx.font = 'italic 25px Georgia, serif'; ctx.textAlign = 'left';
  ['coat', 'core', 'grooves'].forEach((s, i) => { ctx.fillText('· artificial ' + s, 26, 112 + i * 44); });
  ctx.font = '22px Georgia, serif'; ctx.fillText('highest score: DQ', 26, 262); ctx.fillText('ties: all clear', 26, 294);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({color: 0x7a5232, roughness: 0.8});
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.82), new THREE.MeshStandardMaterial({map: t, roughness: 0.9}));
  board.position.set(0, 1.12, 0.03); board.rotation.x = -0.12; g.add(board);
  for (const [x, z, rz, rx] of [[-0.3, 0.06, 0.08, -0.12], [0.3, 0.06, -0.08, -0.12], [0, -0.35, 0, 0.35]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.04), wood); leg.position.set(x, 0.78, z); leg.rotation.set(rx, 0, rz); g.add(leg);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// --- Camera ---------------------------------------------------------------
// Scripted inspection camera. While the 2D pop-up covers the lower centre of the
// screen the action sits in the upper half; afterwards a clean wide shot shows
// the DQ pumpkin in the pen and the others rolling to the gate.
// After the pop-up: low on the lane above the start, the cleared field rolls down to the gate, the DQ
// pumpkin parked in its pen on the left, the beach and the bay beyond.
export function gateRig({t, course}) {
  const rY = course.roadY, S = course._insp, tv = clamp(t + PREROLL, 0, PREROLL);
  const u = S ? ease((tv - S.gate.t0 + 0.6) / (S.gate.t1 - S.gate.t0 + 0.8)) : 0;
  const x = -10.0 - 1.0 * u;
  return {pos: V(x, rY(x) + 1.5 - 0.1 * u, -1.2 - 0.2 * u), look: V(30, rY(30) + 0.9 - 0.2 * u, -5.6)};
}
export const START_ARCH_X = 4;     // the start banner arch stands a few metres past the line
export function inspectionRig({t, course}) {
  const S = course._insp, y0 = course.roadY(0), tv = clamp(t + PREROLL, 0, PREROLL);
  // While the game's 2D inspector pop-up covers the lower centre of the screen, the 3D view is a
  // stage shot from the north green: lineup, inspector, tent and DQ pen in the upper-middle of the
  // frame (look target below their feet, in proportion to distance), cottages behind.
  const aim = (pos, x, y, z, k = 0.08) => V(x, y - k * Math.hypot(x - pos.x, z - pos.z), z);
  if (!S) { const pos = V(-9.4, y0 + 3.4, 17); return {pos, look: aim(pos, -3.2, y0, -3.4)}; }
  const T = inspectionTiming(course), popEnd = T.start + T.duration + PREROLL;
  const zMid = (S.zMin + S.zMax) / 2, zk = S.dq >= 0 ? S.roll.p0.z : zMid;
  const keys = [], k = (tt, pos, look) => keys.push({t: tt, pos, look});
  let c = V(-10.0, y0 + 3.6, 18.0); k(0, c, aim(c, -3.3, y0, -3.6));
  c = V(-9.0, y0 + 3.2, 16.4); k(S.arrive, c, aim(c, -3.0, y0, zk - 2.4));
  c = V(-7.6, y0 + 2.8, 14.4); k(S.verdict, c, aim(c, -2.9, y0, zk - 1.9));               // slow push in through the scan
  c = V(-7.4, y0 + 2.75, 14.1); k(S.verdict + 0.9, c, aim(c, -2.9, y0 + 0.1, zk - 1.9));
  c = V(-8.4, y0 + 3.1, 15.6); k(Math.max(S.verdict + 1.0, (S.roll?.t1 ?? S.verdict + 2) + 0.1), c, aim(c, -2.6, y0, -4.0)); // the pen
  k(PREROLL, c, aim(c, -2.4, y0, -4.2));
  void popEnd;
  let a = keys[0], b = keys.at(-1);
  for (let i = 1; i < keys.length; i++) if (tv <= keys[i].t) { a = keys[i - 1]; b = keys[i]; break; }
  const u = ease((tv - a.t) / Math.max(1e-6, b.t - a.t));
  return {pos: a.pos.clone().lerp(b.pos, u), look: a.look.clone().lerp(b.look, u)};
}
