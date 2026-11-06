// Salinas Valley farm scenery: eucalyptus windbreaks along the field roads, a
// farmstead (barn, silo, water tower, farmhouse, equipment shed), a roadside
// fruit stand, a spectator parking lot, irrigation pipes, a harvest crew in the
// romaine, and a windpump with cattle on the foothill.
import * as THREE from 'three';
import * as flora from '../../env/flora.js';
import {loadModel} from '../../env/models.js';
import {rng, vnoise, fbm} from '../../noise.js';
import {box, rod, merge, mesh, samples} from '../../env/geom.js';
import {lineX, lineZ, hashCell} from './fields.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = 'assets/models/';

// Paint a geometry one colour (vertex colours) so many parts merge into one mesh.
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const vcMat = (o = {}) => new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.75, ...o});

// --- Windbreaks -------------------------------------------------------------
// Windbreak lines run along x (across the valley wind). Near ones are real trees,
// the rest are a continuous "hedge" of crowns that reads right from afar.
export const WINDBREAKS = [
  {z: lineZ(0) - 5.5, x0: 30, x1: 4600, near: 500, gaps: [[190, 268]]},
  {z: lineZ(1) + 5.5, x0: 70, x1: 4600, near: 500, gaps: [[175, 196]]},
  {z: lineZ(-1) - 5.5, x0: -250, x1: 4200},
  {z: lineZ(2) + 6.5, x0: -200, x1: 4400},
  {z: lineZ(-2) - 6.5, x0: 300, x1: 4400},
  {z: lineZ(4) + 5.5, x0: -300, x1: 4600},
  {z: lineZ(-4) - 5.5, x0: 600, x1: 4600},
  {z: lineZ(7) + 5.5, x0: 0, x1: 4600},
  {z: lineZ(-7) - 5.5, x0: 0, x1: 4600},
];
// Short cross lines, well away from the view down the course.
const CROSS = [
  {x: lineX(3) - 5.5, z0: lineZ(2), z1: lineZ(5)}, {x: lineX(5) + 5.5, z0: lineZ(-5), z1: lineZ(-2)},
  {x: lineX(8) - 5.5, z0: lineZ(3), z1: lineZ(8)}, {x: lineX(9) + 5.5, z0: lineZ(-8), z1: lineZ(-3)},
  {x: lineX(13) - 5.5, z0: lineZ(-12), z1: lineZ(-4)}, {x: lineX(12) + 5.5, z0: lineZ(4), z1: lineZ(12)},
];

function hedge(parts, {along, c, a, b, seed, step = 7}) {
  // A tent-shaped band of crowns: two sloping faces up to a ragged ridge, so it
  // reads as canopy from the side and from above.
  const r = rng(seed);
  const pt = (u, y, off) => along === 'x' ? [u, y, c + off] : [c + off, y, u];
  const pos = [], col = [], nrm = [];
  const dark = new THREE.Color('#2c3526'), light = new THREE.Color('#566249'), tmp = new THREE.Color();
  const ridge = [];
  for (let u = a; u <= b + 0.01; u += step) {
    const gap = vnoise(u / 23 + 5, seed) < 0.12;
    const hgt = 20 + 9 * vnoise(u / 17, seed) + 4 * vnoise(u / 6.5, seed + 3) + 3 * fbm(u / 90, seed, 2);
    ridge.push({u, top: gap ? 10 + 4 * r() : hgt, off: (r() - 0.5) * 1.2});
  }
  for (const side of [-1, 1]) {
    for (let i = 1; i < ridge.length; i++) {
      const p0 = ridge[i - 1], p1 = ridge[i], W = 3.6;
      const q = [pt(p0.u, 3.2, side * W + p0.off), pt(p1.u, 3.2, side * W + p1.off), pt(p1.u, p1.top, p1.off * 0.5), pt(p0.u, p0.top, p0.off * 0.5)];
      for (const j of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[j]);
        const hi = j === 2 || j === 3;
        tmp.copy(dark).lerp(light, (hi ? 0.75 : 0.05) + 0.25 * vnoise(q[j][0] / 25 + q[j][2] / 25, seed));
        col.push(tmp.r, tmp.g, tmp.b);
        nrm.push(...(along === 'x' ? [0, 0.55, 0.84 * side] : [0.84 * side, 0.55, 0]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  parts.push(g);
}

export function windbreaks(group, course, {low = false} = {}) {
  const r = rng(77), trees = [], parts = [];
  const free = (x, z) => course.terrainH(x, z) < course.FIELD_Y + 3;
  WINDBREAKS.forEach((w, wi) => {
    if (low && wi > 4) return;
    const nearEnd = low ? Math.min(w.near ?? 0, 330) : (w.near ?? 0);
    let hedgeStart = w.x0;
    if (nearEnd > w.x0) {
      for (let x = w.x0; x < nearEnd; x += 3.9 + r() * 1.8) {
        if (w.gaps?.some(([a, b]) => x > a && x < b)) continue;
        const z = w.z + (r() - 0.5) * 1.6;
        if (!free(x, z)) continue;
        trees.push({x, z, y: course.FIELD_Y, s: 0.8 + r() * 0.35, rot: r() * 6.28});
      }
      hedgeStart = nearEnd;
    }
    hedge(parts, {along: 'x', c: w.z, a: hedgeStart, b: w.x1, seed: 11 + wi * 7});
  });
  if (!low) CROSS.forEach((c, ci) => hedge(parts, {along: 'z', c: c.x, a: c.z0, b: c.z1, seed: 91 + ci * 5}));
  const meshes = flora.trees(group, 'eucalyptus', trees, {low, variants: low ? 2 : 3, cast: false, tint: '#5b6a4a', cell: 520});
  // Blue gum bark is pale but not white: tone the (shared, cached) bark material down on a private copy.
  const barks = new Map();
  for (const m of meshes || []) {
    if (m.material?.vertexColors || !m.material?.color || m.material.color.getHex() !== 0xcfc6b2) continue;
    if (!barks.has(m.material)) { const c = m.material.clone(); c.color.set('#a39a88'); barks.set(m.material, c); }
    m.material = barks.get(m.material);
  }
  const m = mesh(merge(parts), vcMat({roughness: 1, side: THREE.DoubleSide}), {cast: false, receive: false});
  m.name = 'hedges'; group.add(m);
  return {trees};
}

// Foothill oaks and some on the Gabilan foothills behind the start.
export function hillOaks(group, course, {low = false} = {}) {
  const pts = flora.scatter({count: low ? 50 : 110, x0: -390, x1: 100, z0: -190, z1: 190, seed: 21, accept: (x, z, r) => {
    const h = course.terrainH(x, z);
    if (h < course.FIELD_Y + 2.5) return false;
    if (Math.abs(z) < 16 && x > -40) return false;                 // keep the course and cameras clear
    if (x > -40 && z > 0 && z < 34) return false;                 // tracking camera side
    if (vnoise(x / 70 + 3, z / 70) < 0.48 && r() < 0.85) return false; // oaks gather in groves
    return h;
  }}).map(p => ({...p, s: 0.75 + p.r * 0.5, rot: p.r * 6.28}));
  flora.trees(group, 'oak', pts, {low, cell: 400});
  return pts;
}

// --- Vehicles (procedural, merged) -----------------------------------------
function wheel(parts, x, y, z, r = 0.4, w = 0.28) {
  const g = new THREE.CylinderGeometry(r, r, w, 12); g.rotateX(Math.PI / 2); g.translate(x, y, z); parts.push(paint(g, '#1d1d1d'));
  const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8); h.rotateX(Math.PI / 2); h.translate(x, y, z); parts.push(paint(h, '#b9b4aa'));
}
// A pickup truck facing +x, origin at the ground under its centre.
function pickupParts(color, glass = '#26313a') {
  const p = [];
  p.push(paint(box(0, 0.78, 0, 5.0, 0.62, 1.9), color));              // lower body
  p.push(paint(box(0.35, 1.42, 0, 1.55, 0.7, 1.8), color));          // cab
  p.push(paint(box(0.4, 1.45, 0, 1.4, 0.5, 1.84), glass));           // windows band
  p.push(paint(box(1.15, 1.43, 0, 0.05, 0.52, 1.6), glass));         // windscreen
  for (const s of [-1, 1]) p.push(paint(box(-1.45, 1.27, s * 0.9, 2.0, 0.42, 0.08), color)); // bed sides
  p.push(paint(box(-2.47, 1.27, 0, 0.08, 0.42, 1.88), color));
  p.push(paint(box(2.52, 0.75, 0, 0.06, 0.3, 1.7), '#bdb8ae'));      // grille / bumper
  for (const s of [-1, 1]) for (const x of [1.55, -1.6]) wheel(p, x, 0.42, s * 0.85);
  return p;
}
// Stake-bed farm truck with wooden harvest bins.
function stakeTruckParts(color) {
  const p = [];
  p.push(paint(box(2.6, 1.35, 0, 1.9, 1.5, 2.2), color), paint(box(2.75, 1.65, 0, 1.4, 0.6, 2.24), '#26313a'));
  p.push(paint(box(3.7, 1.0, 0, 0.5, 0.9, 2.0), color));
  p.push(paint(box(-1.2, 0.95, 0, 5.4, 0.25, 2.4), '#5b4a3a'));
  for (const s of [-1, 1]) for (let x = -3.7; x <= 1.3; x += 1.25) p.push(paint(box(x, 1.55, s * 1.17, 0.1, 1.0, 0.08), '#7a5c3e'));
  for (const x of [-3.0, -1.7, -0.4]) for (const z of [-0.6, 0.6]) p.push(paint(box(x, 1.5, z, 1.15, 0.85, 1.1), '#8f6e48'));
  for (const s of [-1, 1]) for (const x of [2.7, -2.4, -3.4]) wheel(p, x, 0.48, s * 1.0, 0.48, 0.34);
  return p;
}
// Tractor-drawn lettuce harvester rig: a wide wing platform with a canopy.
function harvesterParts() {
  const p = [];
  p.push(paint(box(0, 1.2, 0, 3.2, 0.3, 14), '#d9d6cc'));            // platform
  p.push(paint(box(0, 3.3, 0, 3.6, 0.12, 14.4), '#f2f0ea'));         // canopy
  for (const z of [-6.8, -2.3, 2.3, 6.8]) for (const x of [-1.5, 1.5]) p.push(paint(box(x, 2.2, z, 0.1, 2.1, 0.1), '#8d9296'));
  p.push(paint(box(1.9, 2.0, 7.5, 0.6, 0.3, 6.0, 0), '#3d6b3e'));   // conveyor boom
  p.push(paint(box(-0.4, 1.7, 0, 1.6, 0.8, 1.6), '#c8362e'));        // packing station
  for (const z of [-5, 5]) wheel(p, 0, 0.6, z, 0.6, 0.4);
  return p;
}

// Cow (Angus or Hereford), facing +x.
function cowParts(x, y, z, rot, coat, face) {
  const p = [], q = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  const add = (g, c) => { g.applyMatrix4(q); p.push(paint(g, c)); };
  const body = new THREE.CapsuleGeometry(0.42, 1.05, 3, 8); body.rotateZ(Math.PI / 2); body.scale(1, 1, 0.85); body.translate(0, 1.0, 0); add(body, coat);
  const head = new THREE.BoxGeometry(0.5, 0.42, 0.36); head.translate(1.02, 1.12, 0); head.rotateZ(-0.0); add(head, face);
  const muzzle = new THREE.BoxGeometry(0.2, 0.26, 0.3); muzzle.translate(1.32, 1.0, 0); add(muzzle, face);
  for (const lx of [-0.55, 0.5]) for (const lz of [-0.2, 0.2]) { const l = new THREE.CylinderGeometry(0.08, 0.07, 0.75, 5); l.translate(lx, 0.38, lz); add(l, coat); }
  return p;
}

// --- Everything placed on the valley floor ---------------------------------
export async function farmstead(group, course, mats, rm, {low = false} = {}) {
  const FY = course.FIELD_Y, ok = [];
  const place = async (file, x, z, rotY = 0, scale = 1, y = FY) => {
    const tpl = await loadModel(M + file);
    if (!tpl) return null;
    const o = tpl.clone(true);
    o.position.set(x, y, z); o.rotation.y = rotY; o.scale.setScalar(scale);
    group.add(o); ok.push(file);
    return o;
  };
  // Farmstead south of the farm road, across the county road from the finish.
  await Promise.all([
    place('farm/barn_big.glb', 228, -104, -Math.PI / 2),
    place('farm/silo.glb', 240, -121, 0),
    low ? null : place('farm/silo.glb', 247, -116, 1.1, 0.92),
    place('farm/water_tower.glb', 207, -93, 0.4),
    place('farm/farmhouse.glb', 206, -124, Math.PI / 2 * 0.0),
    place('farm/barn_open.glb', 256, -95, Math.PI / 2),
    place('farm/tractor.glb', 254, -95, Math.PI / 2 + 0.2),
    low ? null : place('farm/tractor.glb', 296, 30, -Math.PI / 2 + 0.05),
    low ? null : place('farm/barn_small.glb', -120, 70, 0.7, 1, course.terrainH(-120, 70) - 0.3),
    place('farm/windpump.glb', 22, -47, 0.5, 1, course.terrainH(22, -47) - 0.15),
    // Roadside fruit stand by the county road, facing the course.
    place('props/market_stand_a.glb', 176.5, 24, -Math.PI / 2),
    place('props/market_stand_b.glb', 176.5, 28.5, -Math.PI / 2),
    place('props/canopy_striped.glb', 175.5, 33.5, Math.PI / 2),
  ]);
  // Produce at the stand: crates of lettuce and tomatoes (strawberry season), a pile of pumpkins.
  const crates = [];
  const produce = [[174.4, 22.6, 'crate_lettuce', 0.1], [174.3, 33.6, 'crate_tomatoes', -0.1], [174.3, 23.6, 'crate_tomatoes', -0.1], [174.2, 32.6, 'crate_lettuce', 0.2]];
  for (const [x, z, f, r] of produce.slice(0, low ? 2 : 4)) crates.push(place('farm/' + f + '.glb', x, z, r));
  await Promise.all(crates);
  const pumpkinParts = [], pr = rng(5);
  for (let i = 0; i < 26; i++) {
    const a = pr() * 6.28, d = pr() * 1.3, s = 0.16 + pr() * 0.16;
    const g = new THREE.SphereGeometry(s, 10, 7); g.scale(1, 0.8, 1); g.translate(172.6 + Math.cos(a) * d * 0.6, FY + s * 0.8 + (d < 0.6 ? 0.15 : 0), 28.6 + Math.sin(a) * d);
    pumpkinParts.push(paint(g, ['#e8742a', '#d9661f', '#f0a03c', '#e9e2cf'][(pr() * 4) | 0]));
  }
  group.add(mesh(merge(pumpkinParts), vcMat({roughness: 0.6})));

  // Vehicles: spectator parking, the stand's pickup, the farm trucks, the harvest crew.
  const veh = [], pr2 = rng(9);
  const placeParts = (parts, x, z, rot) => { const mtx = new THREE.Matrix4().makeRotationY(rot).setPosition(x, FY, z); for (const g of parts) veh.push(g.applyMatrix4(mtx)); };
  const colours = ['#c8362e', '#efede6', '#2f4f7a', '#3a3c40', '#8d8f92', '#5d6b45', '#b8923e', '#efede6', '#6e2a33', '#2a6f86'];
  let k = 0;
  for (const row of [18.5, 27.5]) for (let x = 124; x < 166; x += 3.3) {
    if (pr2() < 0.18) continue;
    placeParts(pickupParts(colours[k++ % colours.length]), x, row + (pr2() - 0.5) * 0.5, (row < 20 ? Math.PI / 2 : -Math.PI / 2) + (pr2() - 0.5) * 0.12);
  }
  placeParts(pickupParts('#c8362e'), 170.5, 38.5, 0.15);
  placeParts(stakeTruckParts('#2f4f7a'), 216, -82.5, Math.PI);
  placeParts(stakeTruckParts('#efede6'), 300, 40.5, -Math.PI / 2);
  placeParts(harvesterParts(), 306.5, 22, 0);
  const vm = mesh(merge(veh), vcMat({roughness: 0.6, metalness: 0.15}), {cast: !low}); vm.name = 'vehicles'; group.add(vm);

  // Wooden harvest bins stacked by the barn and in the romaine.
  const bins = [];
  const binAt = (x, z, lvl = 0, rot = 0) => { const g = box(0, 0, 0, 1.2, 0.76, 1.2); g.rotateY(rot); g.translate(x, FY + 0.38 + lvl * 0.78, z); bins.push(g); };
  for (let i = 0; i < 6; i++) for (let l = 0; l < 1 + (i % 3); l++) binAt(210 + i * 1.3, -88, l);
  for (let i = 0; i < 8; i++) binAt(311 + (i % 4) * 1.3, 33 + Math.floor(i / 4) * 1.3, 0, 0.05);
  for (let i = 0; i < 4; i++) binAt(178.5, 18 + i * 1.3, 0, 0);
  group.add(mesh(merge(bins), mats.timber));

  // Irrigation: aluminium sprinkler lines along the lettuce beside the run-out.
  const pipes = [];
  for (const [z, x0, x1] of [[16.3, 110, 168], [30.3, 110, 168], [-28.3, 132, 178], [46.3, 102, 172]]) {
    pipes.push(rod(V(x0, FY + 0.07, z), V(x1, FY + 0.07, z), 0.065, 8));
    for (let x = x0 + 3; x < x1; x += 9.1) {
      pipes.push(rod(V(x, FY + 0.07, z), V(x, FY + 1.05, z), 0.016, 5));
      const head = new THREE.CylinderGeometry(0.035, 0.02, 0.12, 6); head.rotateZ(0.4); head.translate(x, FY + 1.1, z); pipes.push(head);
    }
  }
  for (let i = 0; i < 14; i++) pipes.push(rod(V(181, FY + 0.95 + (i % 4) * 0.13, -11.6 + Math.floor(i / 4) * 0.14), V(193, FY + 0.95 + (i % 4) * 0.13, -11.6 + Math.floor(i / 4) * 0.14), 0.065, 8));
  const trailer = [box(187, FY + 0.75, -11.4, 12.5, 0.15, 1.1)]; wheel(trailer, 187, FY + 0.32, -10.7); wheel(trailer, 187, FY + 0.32, -12.1);
  group.add(mesh(merge(pipes), new THREE.MeshStandardMaterial({color: 0xc9ccce, roughness: 0.35, metalness: 0.8})));
  group.add(mesh(merge(trailer.map(g => g.attributes.color ? g : paint(g, '#5d5a55'))), vcMat()));

  // A stock tank and cattle grazing under the windpump.
  const cows = [], cr = rng(31);
  const tank = new THREE.CylinderGeometry(1.5, 1.5, 0.6, 18, 1, true); tank.translate(25.5, course.terrainH(25.5, -45.5) + 0.25, -45.5);
  const water = new THREE.CircleGeometry(1.45, 18); water.rotateX(-Math.PI / 2); water.translate(25.5, course.terrainH(25.5, -45.5) + 0.45, -45.5);
  group.add(mesh(tank, new THREE.MeshStandardMaterial({color: 0x9aa0a3, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide})));
  group.add(mesh(water, new THREE.MeshStandardMaterial({color: 0x48606a, roughness: 0.1, metalness: 0.2}), {cast: false}));
  const herd = [[29, -50, 2.4], [18, -54, -0.6], [33, -44, 3.6], [12, -46, 0.9], [38, -56, 1.9], [-14, -60, -0.3], [-8, -66, 2.2], [46, -64, 3.0]];
  for (const [x, z, rot] of (low ? herd.slice(0, 4) : herd)) {
    const angus = cr() < 0.6;
    cows.push(...cowParts(x, course.terrainH(x, z) - 0.05, z, rot, angus ? '#1e1b19' : '#7a3b22', angus ? '#1e1b19' : '#ece4d4'));
  }
  group.add(mesh(merge(cows), vcMat({roughness: 0.85}), {cast: !low}));
  return {loaded: ok};
}

// Paint the near-field mask: dirt yards, verges and lots that replace the crop rows.
export function paintMask(mask, course) {
  const half = course.roadHalf, S = course.STAND;
  mask.poly([[88, -half - 2], [course.RUN_END + 14, -half - 3.5], [course.RUN_END + 14, half + 3.5], [88, half + 2]], 'yard', 1.2);
  mask.rect_(S.x0 - 6, S.z0 - 5, S.x1 + 8, -half, 'yard', 2);                                // grandstand surroundings
  mask.rect_(98, half, 172, 13.5, 'weeds', 1.5);                                             // spectators' verge
  mask.rect_(118, 13.5, 170, 34, 'yard', 2);                                                 // parking lot
  mask.rect_(166, 13.5, 182, 41, 'gravel', 1.2);                                            // fruit stand pull-out
  mask.rect_(192, -132, 268, -80, 'yard', 2.5);                                             // farmstead yard
  mask.rect_(199, -131, 214, -116, 'weeds', 2);                                             // farmhouse garden
  mask.rect_(176, -16, 198, -7, 'gravel', 1);                                               // pipe trailer
  mask.ellipse(25, -46, 7, 6, 'yard', 2);                                                    // trampled ground at the tank
  mask.rect_(303, 18, 318, 40, 'yard', 1.5);                                                 // harvest crew lane
  mask.rect_(190, -25, 203, -9, 'weeds', 1.5);                                              // under the billboard
}
