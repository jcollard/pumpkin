// Salinas: a 100 m sprint out of rodeo chutes, down a golden Gabilan foothill
// into the Salad Bowl of the World. A summer morning: lettuce, strawberries and
// artichokes run to the hazy Santa Lucia Range, eucalyptus windbreaks line the
// farm roads, and a small rodeo grandstand watches the photo finish.
import * as THREE from 'three';
import * as P from '../../physics.js';
import * as T from '../../textures.js';
import * as props from '../../env/props.js';
import * as flora from '../../env/flora.js';
import {box, merge, mesh} from '../../env/geom.js';
import {createCourse} from './course.js';
import {buildFields, maskCanvas} from './fields.js';
import * as rodeo from './rodeo.js';
import {windbreaks, hillOaks, farmstead, paintMask} from './farm.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

async function build(scene, renderer, course, {low = false} = {}) {
  const group = new THREE.Group(), L = course.length, half = course.roadHalf, FY = course.FIELD_Y;
  const mats = props.sharedMaterials(), rm = rodeo.rodeoMaterials();

  // --- Valley floor: crop fields with yards and lots painted around the course ---
  const mask = maskCanvas([-200, -300, 400, 300], 0.5);
  paintMask(mask, course);
  buildFields(group, {mask, low});

  // --- The dirt chute and its dressing ---
  props.dirtTrack(group, course, mats, {ranges: [[-14.4, course.RUN_END + 12]], coarseBeyond: [-20, course.RUN_END + 14]});
  const start = rodeo.startArea(group, course, rm, mats);
  const fin = rodeo.finishLine(group, course, mats);
  props.chalkLine(group, course, 0.62); props.chalkLine(group, course, L);
  for (const d of [25, 50, 75]) props.sign(group, course, mats, T.signTexture([`${d} m`], {w: 256, h: 128, font: 'bold 60px'}), {x: d, z: -half - 1.5, w: 1.0, h: 0.5, post: 0.8});
  props.gantry(group, course, mats, 50, props.clothTexture('SALAD BOWL SPRINT', '#e9dcc0'), props.clothTexture('HALFWAY', '#e58b37'));
  props.fence(group, course, mats, {ranges: [[10, 80]], z: half + 1.6});
  props.fence(group, course, mats, {ranges: [[10, 80]], z: -half - 1.6, seed: 9});
  const rails = [];
  for (const s of [-1, 1]) rodeo.arenaRails(rails, course, [[-14, 10]], s * (half + 1.6));
  rodeo.arenaRails(rails, course, [[80, 96.6], [103.6, course.RUN_END + 4]], half + 1.6);
  rodeo.arenaRails(rails, course, [[80, course.RUN_END + 4]], -half - 1.6);
  group.add(mesh(merge(rails), rm.white, {cast: !low}));
  const baleList = [...props.baleRows(course, 111.5, course.RUN_END - 4, {stackEvery: 4})];
  for (let z = -half - 0.6; z <= half + 0.6; z += 1.2) for (let k = 0; k < 3; k++) baleList.push({x: course.RUN_END + k * 0.6, z, rot: Math.PI / 2, stack: k === 1 ? 1 : 0});
  for (const [x, z] of [[-6, half + 2.6], [-4.6, half + 2.6], [-6, -half - 2.6], [12, -half - 2.6], [13.2, -half - 2.6], [88, half + 2.6]]) baleList.push({x, z}, {x, z, stack: 1});
  props.bales(group, course, mats, baleList);
  props.sign(group, course, mats, T.signTexture(['SLOW', {text: 'run-out', font: 'italic 44px'}], {bg: '#a8432a', w: 256, h: 200}), {x: 128, z: half + 2.4, w: 1.3, h: 1.0, post: 1.0, face: -1});
  props.sign(group, course, mats, rodeo.boardTexture([{text: 'WELCOME TO THE', font: 'bold 64px'}, {text: 'SALAD BOWL', font: 'bold 120px', color: '#3d6b3e'}], {h: 300}),
    {x: 181.5, z: -9.5, w: 4.4, h: 1.6, post: 1.6, posts: 2});
  props.sign(group, course, mats, rodeo.boardTexture([{text: 'FRESH STRAWBERRIES', font: 'bold 76px', color: '#a3352a'}, {text: 'ARTICHOKES · LETTUCE · PUMPKINS', font: 'bold 50px', color: '#3d6b3e'}], {h: 260}),
    {x: 172, z: 16.6, w: 3.6, h: 1.2, post: 1.4, posts: 2});

  billboard(group, course, mats, {x: 197, z: -17, w: 9.2, h: 5.12, lift: 2.8});

  // --- Chutes (rebuilt for each race's lane count), finish stands, flags and bunting ---
  let chute = rodeo.chutes(course, [-2.4, -0.8, 0.8, 2.4], rm, mats);
  group.add(chute.group);
  const mast = rodeo.photoMast(group, course, rm, {x: L, z: half + 4.7});
  course.photoLens = mast.lens;
  const stand = rodeo.grandstand(group, course, rm, mats, course.STAND, {low});
  const flagList = [
    {x: start.arch.x, y: start.arch.top + 1.1, z: -start.arch.span, h: 2.6, w: 1.5, fh: 0.9, color: '#a3352a', stripe: '#f1ead8'},
    {x: start.arch.x, y: start.arch.top + 1.1, z: start.arch.span, h: 2.6, w: 1.5, fh: 0.9, color: '#2f5a86', star: '#f1ead8'},
    ...stand.flagsAt.map((p, i) => ({...p, h: 3.2, w: 1.4, fh: 0.85, color: ['#a3352a', '#2f5a86', '#e9b23c', '#f1ead8', '#3d6b3e', '#a3352a'][i % 6], stripe: i % 3 === 0 ? '#f1ead8' : null, star: i % 3 === 1 ? '#f1ead8' : null})),
    {x: -13.6, y: course.roadY(-13.6), z: half + 2.2, h: 6, w: 1.6, fh: 1.0, color: '#3d6b3e', stripe: '#e9b23c'},
    {x: -13.6, y: course.roadY(-13.6), z: -half - 2.2, h: 6, w: 1.6, fh: 1.0, color: '#a3352a', star: '#e9b23c'},
  ];
  const updateFlags = rodeo.flags(group, flagList, {wind: V(-0.45, 0, -1).normalize()});
  const top = start.arch.top + 0.65, sp = start.arch.span;
  const strands = [];
  for (const s of [-1, 1]) {
    strands.push([V(start.arch.x, top, s * sp), V(9.6, course.roadY(9.6) + 1.35, s * (half + 1.6))]);
    strands.push([V(start.arch.x, top, s * sp), V(-13.6, course.roadY(-13.6) + 4.5, s * (half + 2.2))]);
  }
  strands.push([V(start.arch.x, top - 0.15, -sp), V(start.arch.x, top - 0.15, sp)]);
  const rf = stand.roof;
  for (let x = rf.x0; x < rf.x1 - 0.1; x += 7.5) strands.push([V(x, rf.y - 0.6, rf.z + 0.1), V(Math.min(rf.x1, x + 7.5), rf.y - 0.6, rf.z + 0.1)]);
  strands.push([V(fin.gx, fin.top + 0.3, fin.span), V(L, mast.top + 0.25, half + 5.0)]);
  strands.push([V(fin.gx, fin.top + 0.3, -fin.span), V(course.STAND.x0 + 0.3, rf.y - 0.8, rf.z)]);
  rodeo.bunting(group, strands, {cast: !low});

  // --- Valley: windbreaks, oaks, farmstead, fruit stand, crews, cattle ---
  windbreaks(group, course, {low});
  hillOaks(group, course, {low});
  flora.grass(group, course, {x0: -16, x1: 98, far: 11, palette: 'golden', low, flowers: 0.012, density: 2.0, thin: 48});
  const farmReady = farmstead(group, course, mats, rm, {low});

  // --- Spectators: on the hill, the catwalk, the booth, the grandstand tiers and along the run-out ---
  const plats = [...start.platforms, ...stand.tiers, stand.apron];
  const crowdCourse = Object.assign(Object.create(course), {terrainH: (x, z) => {
    for (const p of plats) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p.y;
    return course.terrainH(x, z);
  }});
  const zones = [
    {x0: -16, x1: -3, z0: half + 2.0, z1: half + 6.5, n: 26, look: -4, sit: 0.08},
    {x0: -15, x1: -10.2, z0: -half - 5, z1: -half - 2.0, n: 12, look: -4},
    {x0: -5.6, x1: -2.5, z0: -half - 5, z1: -half - 2.0, n: 9, look: -2},
    {...start.platforms[0], z0: -start.arch.span + 0.4, z1: -2.7, n: 2, look: -6},
    {...start.platforms[0], z0: 2.7, z1: start.arch.span - 0.4, n: 2, look: -6},
    {...start.platforms[1], n: 2, look: -10},
    {x0: 22, x1: 78, z0: -half - 9, z1: -half - 2.3, n: 24, look: 2, sit: 0.12},
    ...stand.tiers.map(t => ({...t, n: 11, look: 14, sit: 0, kids: 0.06, pack: 1})),
    {...stand.apron, n: 14, look: 10, pack: 1},
    {x0: 114, x1: 146, z0: half + 2.2, z1: half + 7.5, n: 30, look: 12, sit: 0.1},
    {x0: 127, x1: 160, z0: -half - 7.5, z1: -half - 2.2, n: 16, look: 16},
  ];
  const crowd = props.crowd(group, crowdCourse, zones, {low, seed: 1911});

  flora.cloudBank(group, {count: low ? 14 : 30, x0: 3800, x1: 9000, z0: -6000, z1: 6000, y0: 200, y1: 900, opacity: 0.55, seed: 4});
  const updateBirds = flora.soaringBirds(group, [
    {cx: 60, cz: -40, radius: 70, height: 75, speed: 0.07, head: 0x7a4a2c, patches: false, scale: 1.4},
    {cx: 240, cz: 60, radius: 110, height: 95, speed: 0.055, head: 0x7a4a2c, patches: false, scale: 1.4},
  ]);

  scene.add(group);
  await Promise.all([farmReady, crowd.ready]);
  return {
    group, board: fin.board, crowdZones: zones,
    updateGate(t) { chute.update(t); },
    update(t, wall, ctx) { crowd.update(wall, ctx.excitement); updateFlags(wall); updateBirds(wall); },
    onRace({views}) {
      chute.dispose();
      chute = rodeo.chutes(course, views.map(v => v.lane), rm, mats);
      group.add(chute.group);
    },
  };
}

// Vintage crate-label billboard (generated artwork) across the county road, angled toward the course.
function billboard(group, course, mats, {x, z, w, h, lift}) {
  const g = new THREE.Group(), FY = course.FIELD_Y;
  const tex = new THREE.TextureLoader().load('assets/tracks/salinas/billboard.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: tex, roughness: 0.8}));
  face.position.set(0, FY + lift + h / 2, 0.09); face.castShadow = true;
  const parts = [box(0, FY + lift + h / 2, 0, w + 0.3, h + 0.3, 0.14), box(0, FY + lift - 0.25, 0.35, w + 0.6, 0.08, 0.9)];
  for (const px of [-w * 0.36, 0, w * 0.36]) parts.push(box(px, (FY + lift + h - 0.6) / 2, -0.2, 0.28, FY + lift + h - 0.6 + 0.6, 0.28));
  for (const px of [-w * 0.36, w * 0.36]) parts.push(box(px, FY + lift / 2, -1.0, 0.16, lift * 1.2, 0.16, 0));
  g.add(face, mesh(merge(parts), mats.timber));
  for (let i = 0; i < 3; i++) { // lamps
    const lamp = mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.25, 8), new THREE.MeshStandardMaterial({color: 0x2f4f3a, roughness: 0.5, metalness: 0.5}));
    lamp.position.set((i - 1) * w * 0.33, FY + lift + h + 0.35, 0.7); lamp.rotation.x = 0.5; g.add(lamp);
  }
  g.position.set(x, 0, z); g.rotation.y = Math.atan2(100 - x, 0 - z);
  group.add(g);
}

// --- Cameras ---------------------------------------------------------------
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = k => k * k * (3 - 2 * k);
// The gap between lanes next to the focus pumpkin (for the camera buried in the dirt).
function laneGap(views, focus) {
  const lanes = [...new Set(views.map(v => v.lane))].sort((a, b) => a - b);
  if (lanes.length < 2) return focus.lane + 0.7;
  const mids = lanes.slice(1).map((l, i) => (l + lanes[i]) / 2);
  return mids.reduce((b, m) => Math.abs(m - focus.lane) < Math.abs(b - focus.lane) ? m : b, mids[0]);
}

const cameras = {
  VALLEY: {label: 'VALLEY VIEW', fov: 40, key: '7', rig: ({course, t, F}) => {
    const H = course.H0;
    if (t < -0.4) { // crane down from over the hilltop to the chutes
      const k = ease(clamp01((t + course.preroll) / 2.8));
      return {pos: V(-62 + 34 * k, H + 26 - 16 * k, 30 - 18 * k), look: V(150 - 145 * k, 0 + (H - 0.5) * k, -8 + 8 * k)};
    }
    return {pos: V(-30, H + 10, 13), look: V(F.x * 0.7 + 20, F.y * 0.7 + 0, F.z * 0.4), smoothing: 3};
  }},
  CHUTE: {label: 'IN THE CHUTES', fov: 50, rig: ({course, t, F}) => {
    const k = ease(clamp01((t + 3) / 3)), z = Math.max(-1.6, Math.min(1.6, F.z * 0.55 + 0.4));
    return {pos: V(-3.5 + 0.5 * k, course.H0 + 2.4 - 0.25 * k, z), look: V(14, course.roadY(14) - 1.0, F.z * 0.25)};
  }},
  DIRT: {label: 'TRACK CAM', fov: 64, ground: false, rig: ({course, views, focus, self, cut}) => {
    if (cut || self.dirtZ === undefined) self.dirtZ = laneGap(views, focus);
    const X0 = 36, z = self.dirtZ;
    return {pos: V(X0, course.roadY(X0) + 0.13, z), look: V(X0 - 22, course.roadY(X0 - 22) + 0.45, z * 0.6)};
  }},
  RAIL: {label: 'SPEED CAM', fov: 50, rig: ({F, course}) => {
    const x = F.x - 2.0, z = course.roadHalf + 0.7;
    return {pos: V(x, course.roadY(x) + 0.5, z), look: V(F.x + 1.6, F.y + 0.05, F.z), smoothing: 16};
  }},
  GRANDSTAND: {label: 'GRANDSTAND', fov: 24, rig: ({course, F}) => {
    const S = course.STAND; // over the shoulders of the front row
    return {pos: V(course.length + 3.2, S.y + 2.05, -8.45), look: V(F.x, F.y + 0.3, F.z), smoothing: 4};
  }},
  PHOTO: {label: 'PHOTO FINISH', fov: 28, key: 'f', rig: ({course, F, focus, t}) => {
    const L = course.length, y = course.roadY(L);
    if (F.x < L - 3.2 && t < focus.result.time - 0.1) { // low alongside the leader, inside the rail
      const x = F.x - 3.0;
      return {pos: V(x, course.roadY(x) + 0.6, course.roadHalf + 0.75), look: V(F.x + 1.6, F.y - 0.3, F.z * 0.6)};
    }
    // Then the mast camera, square to the line, lanes mid-frame against the grandstand.
    const lens = course.photoLens ?? V(L, y + 2.0, course.roadHalf + 4.3);
    return {pos: lens.clone(), look: V(L, y + 0.15, 0.8)};
  }},
};

// --- Highlights for the auto director ----------------------------------------
function planShots(views, {timeAtX, add, preroll, finishers}) {
  const racing = views.map((v, i) => ({v, i})).filter(o => o.v.result.status !== 'DQ');
  if (!racing.length) return {};
  const at = x => racing.map(o => ({i: o.i, t: timeAtX(o.v.result, x)})).filter(o => isFinite(o.t)).sort((a, b) => a.t - b.t);
  const lead = at(1)[0]?.i ?? racing[0].i;
  // Start: crane down to the chutes, then look over the pumpkins down the plunge.
  add(-preroll, -preroll + 2.6, 'VALLEY', lead);
  add(-preroll + 2.6, -0.6, 'CHUTE', lead);
  // The plunge: slow motion as the pack thunders over the camera in the dirt.
  const a = at(16), b = at(38);
  let cursor = 1.6;
  if (a.length && b.length) {
    const pack = b.filter(o => o.t < b[0].t + 1.0);
    const s = Math.max(cursor + 1.8, a[0].t), e = Math.min(s + 2.6, pack.at(-1).t + 0.3);
    add(s, e, 'DIRT', b[0].i, 0.5);
    cursor = e;
  }
  const allDone = Math.max(...racing.map(o => o.v.result.time));
  if (!finishers.length) return {lead};
  const win = finishers[0];
  // Speed cam alongside the leader, then over the grandstand crowd's shoulders for the charge to the line.
  const g0 = win.t - 3.0;
  const leaderAt = t => { let best = racing[0].i, bx = -1; for (const o of racing) { const f = P.sampleSimulation(o.v.result, Math.max(0, t)); if (f.centerX > bx) { bx = f.centerX; best = o.i; } } return best; };
  if (g0 - cursor > 3.2) add(cursor + 1.5, g0, 'RAIL', leaderAt(cursor + 1.5));
  // The common FINISH shot claims [win - 1.5, dirEnd]. Our PHOTO segments all carry that same nominal start and
  // are added first, so they sort ahead of it; the director clips each to the previous one's end ("earlier start
  // wins"), which gives a gentle slow-motion run-up, deep slow motion across the line, then a gentle wind-down.
  const close = finishers[1] && finishers[1].t - win.t < 0.6;
  const dirEnd = win.t + (close ? finishers[1].t - win.t + 0.8 : 1.4);
  const bunch = finishers.filter(f => f.t - win.t < 0.65);
  const bunchEnd = bunch.at(-1).t + 0.25, photoEnd = Math.max(dirEnd, bunchEnd + 0.35), p0 = win.t - 1.5;
  add(g0, p0, 'GRANDSTAND', win.i);
  add(p0, win.t - 0.3, 'PHOTO', win.i, 0.6);
  add(p0, bunchEnd, 'PHOTO', win.i, 0.28);
  add(p0, photoEnd, 'PHOTO', win.i, 0.65);
  // Anyone still to come home, head-on at the line; then the director's victory lap.
  const orbit = allDone + 1.2, last = finishers.filter(f => f.t > photoEnd - 0.2).at(-1);
  if (orbit - photoEnd > 0.3) add(photoEnd, orbit, last ? 'FINISH' : 'GRANDSTAND', last ? last.i : win.i);
  return {lead, dirt: a.length ? {i: b[0].i, t: b[0].t} : null, finishers, half: at(50)};
}

function tickerEvents(views, extra) {
  const out = [{t: 0.18, text: "The gates swing open: they're out of the chutes!"}];
  if (extra.dirt) {
    const v = views[extra.dirt.i], f = P.sampleSimulation(v.result, extra.dirt.t);
    out.push({t: extra.dirt.t, text: `${v.name} leads the plunge at ${Math.round(f.v * 3.6)} km/h`, sound: 'whoosh'});
  }
  if (extra.half?.length > 1) {
    const [a, b] = extra.half;
    out.push({t: a.t, text: `Halfway: ${views[a.i].name} by ${(b.t - a.t).toFixed(2)} s`});
  }
  const fs = extra.finishers || [];
  if (fs.length) {
    const w = views[fs[0].i], f = P.sampleSimulation(w.result, fs[0].t);
    out.push({t: fs[0].t + 0.25, text: `${w.name} hits the line at ${Math.round(f.v * 3.6)} km/h`});
    if (fs[1]) {
      const m = fs[1].t - fs[0].t;
      out.push({t: fs[1].t + 0.1, text: m < 0.05 ? `Photo finish! ${w.name} by ${Math.round(m * 1000)} thousandths` : `Winning margin ${m.toFixed(2)} s over ${views[fs[1].i].name}`, big: m < 0.05});
    }
  }
  return out;
}

export default {
  id: 'salinas', name: 'Salinas', label: '100 m · SPRINT',
  blurb: 'Out of the rodeo chutes and down a golden foothill into the Salad Bowl of the World.',
  createCourse, build, cameras, planShots, tickerEvents, heroCam: 'VALLEY', preroll: 5,
  establishing: course => ({pos: V(-50, course.H0 + 20, 25), look: V(140, 0, -6)}),
  ambience: {wind: 0.5, birds: 0.8, insects: 0.45, crowd: 0.65},
};
