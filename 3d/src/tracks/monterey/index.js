// Monterey: 1 km from the pine hills above Pacific Grove down the shoreline to
// Cannery Row and the wharf. Eight rolling hills, three sand traps and three
// fishing nets across the track: the first pumpkin to reach a net must break it.
import * as THREE from 'three';
import * as P from '../../physics.js';
import * as T from '../../textures.js';
import {rng, fbm} from '../../noise.js';
import {merge, mesh, rod, slopeAt} from '../../env/geom.js';
import * as props from '../../env/props.js';
import * as flora from '../../env/flora.js';
import {spectators} from '../../env/people.js';
import {crowdDressing} from '../../env/dressing.js';
import {createCourse} from './course.js';
import {buildNets, PLANE_BACK} from './nets.js';
import {sandTraps} from './sand.js';
import {cannery, INLAND_FACE, BAY_FACE, CONVEYORS} from './cannery.js';
import {coast, instanceModel} from './coast.js';
import {town} from './town.js';
import {farPine, monarchs} from './trees.js';
import {consolidate} from './consolidate.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(s, s, s));

async function build(scene, renderer, course, {low = false} = {}) {
  const group = new THREE.Group(), L = course.length, half = course.roadHalf;
  const {terrainH, roadY, coastZ, NETS, ROW} = course;
  const mats = props.sharedMaterials();
  const updates = [];

  // --- The course itself ---
  props.dirtTrack(group, course, mats, {ranges: [[-150, L + 86]]});
  sandTraps(group, course, {low});
  const {board, updateGate} = props.startFinish(group, course, mats, {startText: 'MONTEREY · START', startBack: 'MIND THE NETS'});
  const nets = buildNets(group, course, {low});
  const netGap = (x, pad = 14) => NETS.every(n => Math.abs(x - n) > pad);
  props.fence(group, course, mats, {ranges: [[-100, NETS[0] - 9], [NETS[0] + 9, NETS[1] - 9], [NETS[1] + 9, ROW.x0 - 4]], z: half + 1.6});
  // Inland side: a second rail fence, broken where the net crowds stand (it gives TV shots a foreground line).
  props.fence(group, course, mats, {ranges: [[-60, -25], [60, NETS[0] - 28], [NETS[0] + 8, NETS[1] - 48], [NETS[1] - 40, NETS[1] - 28], [NETS[1] + 8, ROW.x0 - 4]], z: -half - 1.9, seed: 9});
  const baleList = [...props.baleRows(course, -18, -2), ...props.baleRows(course, L + 13, L + 22, {stackEvery: 3})];
  for (let z = -half; z <= half; z += 1.2) for (let k = 0; k < 2; k++) baleList.push({x: L + 84 + k * 0.6, z, rot: Math.PI / 2, stack: k});
  for (const n of NETS) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) baleList.push({x: n - 5 - k * 1.2, z: s * (half + 1.0)});
  props.bales(group, course, mats, baleList);
  // Signs: distance boards, net warnings, place names (their boards and posts are merged afterwards).
  const outer = group;
  {
  const group = new THREE.Group(); outer.add(group);
  for (let d = 100; d < L; d += 100) if (netGap(d, 30)) props.sign(group, course, mats, T.signTexture([`${d} m`], {w: 256, h: 128, font: 'bold 60px'}), {x: d, z: -half - 1.4, w: 1.0, h: 0.5, post: 0.8});
  course.track.nets.forEach((n, k) => {
    props.sign(group, course, mats, T.signTexture([`NET ${k + 1}`, {text: `${n.energy} J to break`, font: 'italic bold 38px'}], {bg: ['#3f6b45', '#2f5a85', '#a8432a'][k]}),
      {x: n.x - 45, z: -half - 2.4, w: 2.6, h: 1.3, post: 1.4, posts: 2});
  });
  for (const [a, b] of course.SAND) props.sign(group, course, mats, T.signTexture(['SAND'], {bg: '#c9a85e', fg: '#3a2a1b', w: 256, h: 128, font: 'bold 66px'}), {x: a - 22, z: half + 2.2, w: 1.4, h: 0.7, post: 1.0});
  props.sign(group, course, mats, T.signTexture(['MONTEREY', {text: 'Pumpkin Grand Prix', font: 'italic bold 40px'}]), {x: -40, z: -half - 3.2, w: 4.6, h: 2.3, post: 1.8, posts: 2});
  props.sign(group, course, mats, T.signTexture(['MONARCH GROVE', {text: 'Please do not disturb', font: 'italic 38px'}], {bg: '#4a3a2a'}), {x: 46, z: -half - 3.0, w: 3.2, h: 1.6, post: 1.4, posts: 2});
  props.sign(group, course, mats, T.signTexture(['PACIFIC GROVE', {text: 'Butterfly Town', font: 'italic bold 40px'}], {bg: '#2f4a5a'}), {x: 318, z: -half - 3.0, w: 3.6, h: 1.8, post: 1.5, posts: 2});
  props.sign(group, course, mats, T.signTexture(['CANNERY ROW'], {bg: '#1f3340', fg: '#f2e7c8', font: 'bold 72px'}), {x: ROW.x0 - 6, z: -half - 2.6, w: 3.6, h: 1.0, post: 2.2, posts: 2});
  consolidate(group, outer);
  }

  // --- Cannery Row and the waterfront ---
  cannery(group, course, {low});
  const shore = await coast(group, course, {low});
  updates.push(shore.update);
  // Old street lamps along the Row's inland sidewalk.
  const lamps = [];
  for (let x = ROW.x0 + 4; x < L + 50; x += 16) {
    const y = roadY(x), z = -half - 2.4;
    lamps.push(rod(V(x, y - 0.3, z), V(x, y + 4.2, z), 0.07, 6), rod(V(x, y + 4.1, z), V(x, y + 4.1, z + 0.9), 0.04, 4));
    const glass = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 6); glass.translate(x, y + 3.8, z + 0.9); lamps.push(glass);
  }
  group.add(mesh(merge(lamps), new THREE.MeshStandardMaterial({color: 0x23362d, roughness: 0.5, metalness: 0.5})));
  // Catalogue buildings filling gaps on the Row: a brick cannery and two shopfronts.
  (await instanceModel(group, 'assets/models/harbor/cannery_brick.glb', [M(861.5, roadY(866) - 0.4, INLAND_FACE - 5.4, Math.PI)]))?.done();
  (await instanceModel(group, 'assets/models/harbor/shopfront_building.glb', [M(974, roadY(979) - 0.3, INLAND_FACE - 5, Math.PI), M(986, roadY(991) - 0.3, INLAND_FACE - 5, Math.PI)]))?.done();
  (await instanceModel(group, 'assets/models/farm/water_tower.glb', [M(1000, roadY(1000) + 0.2, -34, 0.3), M(905, terrainH(905, 58) - 0.5, 58, 1.0)]))?.done();
  const gear = [], crates = [];
  const r = rng(808);
  for (const n of NETS) for (let i = 0; i < 4; i++) {
    const x = n - 2 - r() * 6, z = -half - 2.2 - r() * 2.4;
    (i % 2 ? crates : gear).push(M(x, Math.max(terrainH(x, z), roadY(x) - 0.3), z, r() * 6));
  }
  for (let i = 0; i < 10; i++) { const x = ROW.x0 + 10 + r() * 170, z = INLAND_FACE + 1 + r() * 1.5; (i % 2 ? crates : gear).push(M(x, roadY(x) - 0.25, z, r() * 6)); }
  (await instanceModel(group, 'assets/models/props/barrel.glb', gear))?.done();
  (await instanceModel(group, 'assets/models/props/crate.glb', crates))?.done();

  // --- Pacific Grove cottages ---
  const homes = town(group, course, {low});
  const nearHome = (x, z) => homes.some(h => Math.abs(h.x - x) < 7.5 && Math.abs(h.z - z) < 8.5);

  // --- Trees ---
  const clearOfRoad = (x, z) => Math.abs(z) > half + 5;
  const clearOfCameras = (x, z) => !(x > -45 && x < L + 95 && ((z > 0 && z < 40) || (z < 0 && z > -8.5)));
  const clearOfNets = (x, z) => NETS.slice(0, 2).every(n => !(Math.abs(x - n) < 24 && z > -42));
  const inRow = (x, z) => x > ROW.x0 - 15 && x < ROW.x1 + 120 && z > -60 && z < coastZ(x) + 10;
  const ok = (x, z) => clearOfRoad(x, z) && clearOfCameras(x, z) && clearOfNets(x, z) && !inRow(x, z) && !nearHome(x, z) && !(x > L - 10 && x < L + 70 && Math.abs(z) < 16);
  // Monterey pines: dense on the hills at the start, thinning through Pacific Grove.
  const pinePts = flora.scatter({count: low ? 260 : 560, x0: -170, x1: 900, z0: -200, z1: 160, seed: 21, accept: (x, z, rr) => {
    const h = terrainH(x, z);
    if (!ok(x, z) || h < 4 || (z > 0 && z > coastZ(x) - 30) || slopeAt(terrainH, x, z) > 0.8) return false;
    const dens = x < 240 ? 0.95 : x < 520 ? 0.45 : 0.25;
    if (rr() > dens * (z < 0 ? 1 : 0.6)) return false;
    if (fbm(x / 70 + 3, z / 70, 2) < -0.2 && rr() < 0.7) return false;
    return h;
  }}).map(p => ({...p, s: 0.75 + p.r * 0.55, rot: p.r * 6}));
  flora.trees(group, flora.pine, pinePts, {low, cell: 2000, variants: 2});
  // Cypress on the bluffs above the shore and along the shoreline trail.
  const cyPts = flora.scatter({count: low ? 90 : 200, x0: -150, x1: 1000, z0: 30, z1: 360, seed: 22, accept: (x, z, rr) => {
    const h = terrainH(x, z), cz = coastZ(x);
    if (!ok(x, z) || h < 2.2 || z > cz - 3 || z < cz - 75 || slopeAt(terrainH, x, z) > 0.9) return false;
    if (Math.abs(z - shore.trailZ(x)) < 3.5) return false;
    return rr() < 0.85 ? h : false;
  }}).map(p => ({...p, s: 0.7 + p.r * 0.6, rot: (p.r - 0.5) * 0.8}));
  flora.trees(group, flora.cypress, cyPts, {low, cell: 2000, variants: 2});
  // The eucalyptus grove where the monarchs overwinter.
  const grovePts = flora.scatter({count: low ? 10 : 18, x0: 52, x1: 165, z0: -78, z1: -16, seed: 23, accept: (x, z) => clearOfCameras(x, z) && clearOfRoad(x, z) ? terrainH(x, z) : false})
    .map(p => ({...p, s: 0.75 + p.r * 0.35, rot: p.r * 6}));
  flora.trees(group, flora.eucalyptus, grovePts, {low, cell: 2000, variants: 2});
  // Distant forest on the hills (one cheap blob each).
  const farPts = flora.scatter({count: low ? 400 : 1100, x0: -900, x1: 1600, z0: -900, z1: -150, seed: 24, accept: (x, z, rr) => {
    const h = terrainH(x, z);
    if (h < 8 || slopeAt(terrainH, x, z, 6) > 0.9 || fbm(x / 160, z / 160, 3) < -0.15) return false;
    return x > 1100 && rr() < 0.6 ? false : h;
  }}).map(p => ({...p, s: 0.9 + p.r * 0.8, rot: p.r * 6}));
  flora.trees(group, farPine, farPts, {cast: false});
  // Coastal scrub and verge grass.
  const shrubPts = flora.scatter({count: low ? 600 : 1500, x0: -160, x1: 1000, z0: -190, z1: 230, seed: 25, accept: (x, z) => {
    const h = terrainH(x, z);
    if (h < 1.5 || !clearOfRoad(x, z) || inRow(x, z) || nearHome(x, z) || slopeAt(terrainH, x, z) > 1.0) return false;
    if (z > 0 && z < 40 && x > -45 && x < L + 95 && Math.abs(z - 12) < 3) return false;
    return h;
  }});
  flora.shrubs(group, shrubPts, {cast: false, low, cell: 2000, kind: 'sage', palette: ['#4f5e34', '#5d6638', '#6b6a42', '#43502e', '#6f6844', '#565c40']});
  flora.grass(group, course, {x0: -70, x1: ROW.x0 - 6, far: 22, palette: 'coastal', low, flowers: 0.06,
    accept: (x, z) => !course.inSand(x, 6) && NETS.every(n => Math.abs(x - n + PLANE_BACK) > 0.6),
    zones: [{x0: -24, x1: -2, z0: half + 1, z1: half + 9, density: 3}]});

  // --- Monarch butterflies ---
  const updMonarchs = monarchs(group, course, {grove: {x: 108, z: -46, w: 110, d: 60, trees: grovePts}, crossings: [{x: 95, w: 150}], low});
  updates.push(updMonarchs);

  // --- Spectators ---
  const zones = [
    {x0: -22, x1: -3, z0: half + 1.8, z1: half + 7, n: 34},
    {x0: NETS[0] - 27, x1: NETS[0] - 1.5, z0: -half - 8, z1: -half - 1.9, n: low ? 30 : 56, look: 30},
    {x0: NETS[1] - 27, x1: NETS[1] - 1.5, z0: -half - 8, z1: -half - 1.9, n: low ? 30 : 56, look: 30},
    {x0: NETS[2] - 24, x1: NETS[2] - 1.5, z0: INLAND_FACE + 0.8, z1: -half - 1.4, n: low ? 22 : 40, look: 30},
    {x0: L + 6, x1: L + 44, z0: -half - 7, z1: -half - 1.6, n: 90},
    {x0: L + 6, x1: L + 44, z0: half + 1.8, z1: half + 6.5, n: 64},
  ];
  const crowd = spectators(group, course, zones, {low});
  crowdDressing(group, course, zones[1], {low, seed: 41, text: 'NET 1'});
  crowdDressing(group, course, zones[2], {low, seed: 42, text: 'NET 2'});
  crowdDressing(group, course, zones[4], {low, seed: 43, tents: 2, text: 'FINISH'});

  // --- Sky ---
  flora.cloudBank(group, {count: low ? 10 : 18, z0: 2600, z1: 9000, y0: 20, y1: 160, opacity: 0.75});
  // The far shore of the bay on the horizon (Santa Cruz mountains).
  const far = new THREE.Mesh(new THREE.CylinderGeometry(20000, 20000, 1, 64, 1, true, -0.25, 1.9), new THREE.MeshBasicMaterial({color: 0x8d9aa3, fog: true, side: THREE.BackSide}));
  const fp = far.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) if (fp.getY(i) > 0) { const a = Math.atan2(fp.getZ(i), fp.getX(i)); fp.setY(i, 380 + 420 * (0.5 + fbm(a * 6, 1.3, 4))); } else fp.setY(i, -5);
  far.position.set(600, 0, 0); far.renderOrder = -1;
  group.add(far);

  scene.add(group);
  return {
    group, board, updateGate, crowdZones: crowd.zones,
    onRace: data => nets.onRace(data),
    update(t, wall, ctx) {
      nets.update(t, ctx.camera);
      crowd.update(wall, ctx.excitement);
      for (const u of updates) u(wall);
    },
  };
}

// --- Cameras ---
// The net a camera should show for a pumpkin at x: the next one ahead, or one just passed.
const netFor = (course, x) => {
  const xs = course.NETS;
  for (let k = 0; k < xs.length; k++) if (x < xs[k] + 22) return k;
  return xs.length - 1;
};
const cameras = {
  // Downstream of the net on the side where the focus pumpkin hits it, looking across the track along the mesh.
  NETCAM: {label: 'NET CAM', fov: 36, key: '7', rig: ({F, course}) => {
    const k = netFor(course, F.x), x = course.NETS[k] - PLANE_BACK, g = course.roadY(x), s = F.z < -0.1 ? -1 : 1;
    return {pos: V(x + 4.3, g + 1.25, s * (course.roadHalf + 3.3)), look: V(x - 0.9, g + 0.55, -s * 1.5)};
  }},
  NETVIEW: {label: 'NET VIEW', fov: 26, rig: ({F, course}) => {
    const k = netFor(course, F.x - 4), x = course.NETS[k] + 11, g = course.roadY(x);
    return {pos: V(x, g + 1.0, 1.9), look: V(Math.min(F.x, x - 14), F.y + 0.25, F.z * 0.5), smoothing: 5};
  }},
  CAUGHT: {label: 'CAUGHT!', fov: 30, rig: ({F, course, t}) => {
    // Three-quarters behind the caught pumpkin, from the middle of the track, so the pocket wraps round it.
    const k = netFor(course, F.x - 1), x = course.NETS[k] - PLANE_BACK, g = course.roadY(x), s = F.z < 0 ? 1 : -1, sw = Math.sin(t * 0.3) * 0.5;
    return {pos: V(x - 3.3 + sw, g + 1.35, F.z + s * (2.8 - sw)), look: V(x + 0.3, g + 0.35, F.z - s * 0.2)};
  }},
  // Wide from the bay side, downstream: the pumpkin waiting in the net and the course behind it.
  NETSIDE: {label: 'NET 2-SHOT', fov: 34, rig: ({F, course}) => {
    const k = netFor(course, F.x - 1), x = course.NETS[k], g = course.roadY(x);
    return {pos: V(x + 6.5, course.roadY(x + 6.5) + 2.4, course.roadHalf + 5.8), look: V(x - 5, g + 0.3, F.z * 0.4), smoothing: 3};
  }},
  ROW: {label: 'CANNERY ROW', fov: 40, rig: ({F, course, cut, self}) => {
    if (cut || self.row === undefined || F.x > self.row - 6) self.row = Math.min(course.length + 30, F.x + 30);
    const x = self.row;
    return {pos: V(x, course.roadY(x) + 4.6, -2.2), look: V(F.x - 2, F.y + 1.4, F.z * 0.5), smoothing: 0};
  }},
  // From the bay-side verge, ahead of the pumpkins, looking back up into the eucalyptus grove and its butterflies.
  GROVE: {label: 'MONARCH GROVE', fov: 44, rig: ({F, course}) => {
    const x = F.x + 11;
    return {pos: V(x, course.roadY(x) + 0.9, course.roadHalf + 0.5), look: V(F.x - 3, F.y + 2.6, -5), smoothing: 4};
  }},
  VISTA: {label: 'MONTEREY BAY', fov: 38, rig: ({t, course}) => {
    const k = Math.max(0, t + course.preroll);
    return {pos: V(-46 + k * 2.2, course.H0 + 18 - k * 0.6, 34), look: V(230, course.roadY(230) - 8, 46)};
  }},
};

// Highlights: the charge at each net, the moment it gives (slow motion), and anyone caught.
function planShots(views, {add, preroll}) {
  const nets = views[0].course.track.nets, out = {nets: []};
  add(-preroll, -preroll + 2.6, 'VISTA', -1);
  nets.forEach((n, k) => {
    const catches = [];
    views.forEach((v, i) => v.result.events.forEach(e => { if (e.type === 'CAUGHT' && e.net === k) catches.push({i, t: e.t, rel: v.result.events.find(r => r.type === 'RELEASED' && r.net === k)?.t}); }));
    let open = null;
    views.forEach((v, i) => v.result.events.forEach(e => { if (e.type === 'NET OPEN' && e.net === k) open = {i, t: e.t, before: e.before, after: e.after}; }));
    catches.sort((a, b) => a.t - b.t);
    out.nets.push({k, catches, open});
    const caught = catches.length && (!open || catches[0].t < open.t) ? catches[0] : null;
    if (caught) {
      const tc = caught.t;
      add(tc - 3.4, tc - 0.5, 'NETVIEW', caught.i);
      add(tc - 0.5, tc + 0.8, 'NETCAM', caught.i, 0.35);
      // The wait: close on the trapped pumpkin, then the wide two-shot, until the opener's run-in.
      const end = open ? open.t - 3.2 : tc + 9;
      if (end - (tc + 0.8) > 1.5) add(tc + 0.8, Math.min(tc + 3.8, end), 'CAUGHT', caught.i);
      if (end - (tc + 3.8) > 2) add(tc + 3.8, Math.min(tc + 7.5, end), 'NETSIDE', caught.i);
      if (open) add(Math.max(tc + 0.8, open.t - 3.2), open.t - 0.45, 'NETVIEW', open.i);
    } else if (open) add(open.t - 3.4, open.t - 0.45, 'NETVIEW', open.i);
    if (open) add(open.t - 0.45, open.t + 1.4, 'NETCAM', open.i, 0.22);
  });
  return out;
}

// Is the leading pumpkin sitting in a net right now? (No tracking shots through the posts then.)
const leaderCaught = ({sit, course}) => !!sit.lead && sit.lead.speed < 0.05 && course.NETS.some(x => Math.abs(sit.lead.x - x) < 1.2);

function tickerEvents(views, extra) {
  const out = [];
  for (const n of extra.nets || []) {
    if (n.open) {
      const v = views[n.open.i], f = P.sampleSimulation(v.result, Math.max(0, n.open.t - 0.02));
      out.push({t: n.open.t - 1.4, text: `${v.name} charges net ${n.k + 1} at ${Math.round(f.v * 3.6)} km/h`});
      out.push({t: n.open.t + 0.7, text: `Net ${n.k + 1} costs ${v.name} ${Math.round((1 - n.open.after / n.open.before) * 100)}% of its energy`});
    }
    for (const c of n.catches) {
      if (c.rel !== undefined) out.push({t: c.rel + 0.4, text: `${views[c.i].name} is free and rolling again`});
      else out.push({t: c.t + 2.5, text: `Nobody is coming to free ${views[c.i].name}`});
    }
  }
  return out;
}

export default {
  id: 'monterey', name: 'Monterey', label: '1 km · NETS & HILLS',
  blurb: 'Down the shoreline to Cannery Row: eight hills, sand, and three fishing nets the leader has to break.',
  createCourse, build, cameras, planShots, tickerEvents, heroCam: 'NETCAM', preroll: 5,
  cyclePool: {
    TV: {min: 3.5, max: 5.5, when: c => !leaderCaught(c)},
    ROADSIDE: {min: 2.8, max: 4.2, when: c => !leaderCaught(c)},
    CAUGHT: {min: 3, max: 4.5, weight: 4, when: leaderCaught},
    NETSIDE: {min: 3.5, max: 5, weight: 4, when: leaderCaught},
    ROW: {min: 3.4, max: 5, weight: 3, when: ({sit}) => sit.lead && sit.lead.x > 800 && sit.lead.x < 975},
    GROVE: {min: 3, max: 4.2, weight: 2.5, when: ({sit}) => sit.lead && sit.lead.x > 25 && sit.lead.x < 150},
  },
  establishing: course => ({pos: V(1010, 14, 118), look: V(895, 16, 0)}),
  ambience: {sea: 0.8, wind: 0.4, gulls: 0.8, sealions: 0.6, crowd: 0.5, birds: 0.3},
};
