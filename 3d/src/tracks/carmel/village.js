// The village: the dirt lane down "Ocean Avenue", stone curbs and flagstone
// sidewalks, storybook cottages and galleries on both sides, front gardens with
// flowers, and cypress, pines and oaks. No street lights (Carmel has none).
import * as THREE from 'three';
import {rng, fbm, vnoise, smooth} from '../../noise.js';
import {samples, ribbon, beam, box, merge, mesh, mat4, instanced, slopeAt} from '../../env/geom.js';
import * as flora from '../../env/flora.js';
import * as CT from './tex.js';
import {Builder, designCottage, buildCottage, uvBox} from './cottages.js';
import {instances} from './models.js';
import * as plants from './plants.js';
import {TENT} from './inspection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SIDEWALK = {curb: 0.22, outerN: 5.6, outerS: 6.4, top: 0.12};

// Ground under loose objects: lane, sidewalks, else terrain.
export function makeGround(course) {
  const {roadY, terrainH, roadHalf: H, VILLAGE_END, RUNOUT_END} = course;
  return (x, z) => {
    const az = Math.abs(z);
    if (az <= H && x > -260 && x < RUNOUT_END) return roadY(x);
    if (x > -260 && x < VILLAGE_END + 6 && az <= (z < 0 ? SIDEWALK.outerS : SIDEWALK.outerN)) return roadY(x) + SIDEWALK.top + (az < H + SIDEWALK.curb ? 0.02 : 0);
    return terrainH(x, z);
  };
}

function hedgeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#3d5a2c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const l = 40 + r() * 70; g.fillStyle = `rgba(${l * 0.7},${l * 1.15},${l * 0.5},0.8)`; g.beginPath(); g.ellipse(r() * 128, r() * 128, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Lane ribbon with vertex colours: dirt through the village, white packed sand in the dunes.
function laneRibbon(xs, course, z0, z1) {
  const g = ribbon(xs, course.roadY, z0, z1, 12);
  return g;
}

export function buildLane(group, course, mats, {low}) {
  const {roadY, roadHalf: H, VILLAGE_END, RUNOUT_END} = course;
  const coarse = x => (x >= -70 && x <= RUNOUT_END) || Math.round(x) % 3 === 0;
  // Dirt lane through the village.
  const dirtXs = samples(-200, VILLAGE_END + 16, 0.5).filter(coarse);
  group.add(mesh(laneRibbon(dirtXs, course, -H, H), mats.track, {cast: false}));
  // Packed white sand through the dunes, fading in over the dirt.
  const sand = CT.sandTexture();
  const sandXs = samples(VILLAGE_END + 2, RUNOUT_END + 1, 0.5);
  const g = ribbon(sandXs, x => roadY(x) + 0.004, -H, H, 6);
  const col = [], a0 = VILLAGE_END + 2, a1 = VILLAGE_END + 14;
  sandXs.forEach(x => { const k = smooth(a0, a1, x), t = 0.56 + 0.06 * vnoise(x / 5, 1); col.push(t, t * 0.97, t * 0.93, k, t, t * 0.97, t * 0.93, k); });
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const sandMat = new THREE.MeshStandardMaterial({map: sand, vertexColors: true, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: true});
  group.add(mesh(g, sandMat, {cast: false}));

  // Stone curbs and flagstone sidewalks through the village.
  const stone = new THREE.MeshStandardMaterial({map: CT.stoneTexture(), color: 0xd8d0c2, roughness: 0.9});
  const flag = CT.stoneTexture(131); flag.repeat.set(1, 1);
  const walk = new THREE.MeshStandardMaterial({map: flag, color: 0xc9bfae, roughness: 0.95});
  const xs = samples(-200, VILLAGE_END + 4, 1).filter(coarse);
  const curbs = [], walks = [];
  for (const s of [-1, 1]) {
    const za = s * H, zb = s * (H + SIDEWALK.curb), zo = s * (s < 0 ? SIDEWALK.outerS : SIDEWALK.outerN);
    curbs.push(beam(xs, x => roadY(x) + 0.14, x => roadY(x) - 0.3, Math.min(za, zb), Math.max(za, zb), 1.2));
    walks.push(beam(xs, x => roadY(x) + SIDEWALK.top, x => roadY(x) - 0.55, Math.min(zb, zo), Math.max(zb, zo), 2.4));
  }
  group.add(mesh(merge(curbs), stone, {cast: false}), mesh(merge(walks), walk, {cast: false}));

  // Low sand berms through the dunes.
  const berms = [], bx = samples(VILLAGE_END + 6, RUNOUT_END, 1);
  for (const s of [-1, 1]) berms.push(beam(bx, x => roadY(x) + 0.12 + 0.05 * Math.sin(x * 0.7), x => roadY(x) - 0.35, s < 0 ? -H - 1.1 : H, s < 0 ? -H : H + 1.1, 3));
  const bermMat = new THREE.MeshStandardMaterial({map: sand, color: 0xb9b09e, roughness: 1});
  group.add(mesh(merge(berms), bermMat, {cast: false}));
  return {stone, walk, sand};
}

// ---------------------------------------------------------------------------
export function buildVillage(group, course, mats, {low, ground, lib = null}) {
  const {terrainH, roadY, VILLAGE_END, coastDist} = course;
  const r = rng(1903); // Carmel-by-the-Sea was founded in 1902-03
  const B = new Builder(), lowB = new Builder();
  const flowers = [], lots = [];
  const inNear = (x, z) => x > -192 && x < 474 && Math.abs(z) < 202;

  // Lots along the lane and in rows behind it. side -1 = south (faces +Z), +1 = north (faces -Z).
  const rowsS = [{z: -9.6, j: 1.4, detail: true, gallery: 0.3}, {z: -28, j: 3, gallery: 0.05}, {z: -48, j: 4}, {z: -68, j: 4}, {z: -90, j: 5}];
  const rowsN = [{z: 23.5, j: 2.5, detail: true, gallery: 0.25}, {z: 43, j: 3, gallery: 0.05}, {z: 63, j: 4}, {z: 85, j: 5}];
  if (low) { rowsS.length = 3; rowsN.length = 3; }
  const blocked = (x, z) => (x > -14 && x < 3 && z < 0 && z > -16) || (x > -5 && x < 6 && z > 0 && z < 30);
  for (const [side, rows] of [[-1, rowsS], [1, rowsN]]) rows.forEach((row, ri) => {
    for (let x = -186 + r() * 6; x < VILLAGE_END - (ri ? 12 : 0); ) {
      const kind = r() < (row.gallery ?? 0) ? 'gallery' : row.detail || ri < 2 ? 'cottage' : r() < 0.3 ? 'simple' : 'cottage';
      const d = designCottage(Math.floor(r() * 1e6), {kind});
      let model = null; // a few catalogue storybook houses and an inn among the procedural cottages
      if (lib && ri < 2 && kind !== 'gallery') { const u = r(); if (u < (ri ? 0.12 : 0.2)) model = u < (ri ? 0.04 : 0.07) && lib.inn ? 'inn' : lib.house ? 'house' : null; }
      if (model) Object.assign(d, model === 'inn' ? {W: 9.8, D: 9.8} : {W: 5.4, D: 6.7}, {gable: null, nb: 1});
      const cx = x + d.W / 2, z = row.z + side * r() * row.j;
      x += d.W + (row.detail ? 2.6 + r() * 3.6 : 4 + r() * 9);
      if (!inNear(cx, z) || blocked(cx, z)) continue;
      if (ri > 0 && r() < 0.18) continue; // gardens and trees between
      lots.push({x: cx, z, rot: side < 0 ? 0 : Math.PI, d, detail: !!row.detail || ri === 1, row: ri, side, model});
    }
  });
  // Scenic-road houses along the top of the beach bluff, facing the bay (+X).
  for (const side of [-1, 1]) for (let z = 46 + r() * 6; z < 200; ) {
    const d = designCottage(Math.floor(r() * 1e6), {kind: r() < 0.2 ? 'simple' : 'cottage'});
    const zz = side * (z + d.W / 2);
    z += d.W + 5 + r() * 8;
    let x = 230; for (let k = 0; k < 4; k++) x += coastDist(x, zz) - (126 + r() * 8);
    if (!inNear(x, zz)) continue;
    lots.push({x, z: zz, rot: Math.PI / 2, d, detail: Math.abs(zz) < 110, row: 0, side: 2});
  }
  const modelPts = {house: [], inn: []};
  for (const lot of lots) {
    if (lot.model) { // catalogue house on a stone plinth (the model's front faces +Z)
      const {W, D} = lot.d, c = Math.cos(lot.rot), sn = Math.sin(lot.rot), at = (lx, lz) => [lot.x + lx * c + lz * sn, lot.z - lx * sn + lz * c];
      let hi = -Infinity, lo = Infinity;
      for (const [lx, lz] of [[-W / 2, 0], [W / 2, 0], [-W / 2, -D], [W / 2, -D], [0, -D / 2]]) { const h = terrainH(...at(lx, lz)); hi = Math.max(hi, h); lo = Math.min(lo, h); }
      const [mx, mz] = at(0, -D / 2), y = hi + 0.08;
      modelPts[lot.model].push({x: mx, y, z: mz, rotY: lot.rot});
      B.setMatrix(new THREE.Matrix4().makeRotationY(lot.rot).setPosition(mx, y, mz));
      const pl = uvBox(W * 0.92, y - lo + 0.5, D * 0.92); pl.translate(0, -(y - lo + 0.5) / 2 + 0.06, 0); B.add('stone', pl);
      continue;
    }
    const f = buildCottage(lot.detail ? B : lowB, lot.d, lot, terrainH, {detail: lot.detail && !low});
    if (lot.detail) flowers.push(...f);
  }
  if (lib?.house) instances(group, lib.house, modelPts.house, {recolor: {RoofTiles: '#5b4a3e'}});
  if (lib?.inn) instances(group, lib.inn, modelPts.inn);
  // Materials: one per kind, all cottages share them.
  const atlas = CT.bayAtlas();
  const wallMat = new THREE.MeshStandardMaterial({map: atlas, vertexColors: true, roughness: 0.92});
  const roofMat = new THREE.MeshStandardMaterial({map: CT.shingleTexture(), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide});
  const stoneMat = new THREE.MeshStandardMaterial({map: CT.stoneTexture(141), roughness: 0.92});
  const paintMat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8});
  const signMat = new THREE.MeshStandardMaterial({map: CT.signAtlas(), roughness: 0.7});
  const ironMat = new THREE.MeshStandardMaterial({color: 0x26221f, roughness: 0.6, metalness: 0.5});
  const matFor = {wall: wallMat, roof: roofMat, stone: stoneMat, paint: paintMat, sign: signMat, iron: ironMat};
  for (const b of [B, lowB]) for (const key of Object.keys(matFor)) {
    const geo = b.geometry(key); if (!geo) continue;
    const m = mesh(geo, matFor[key], {cast: true});
    group.add(m);
  }

  // --- Front gardens: low stone walls, white picket fences, flower beds, shrubs ---
  const walls = [], pickets = [], mounds = [], beds = [];
  const flowerCols = ['#d9343f', '#ef6f8f', '#f2c230', '#9b5fc0', '#f5f0f0', '#e8562a', '#ff8fb0', '#6f5fd0'].map(h => new THREE.Color(h));
  const greens = ['#4f6b35', '#5d7a3c', '#3f5a30', '#6b7d45'].map(h => new THREE.Color(h));
  const blooms = ['#c9567a', '#9a6cc0', '#d9b23a', '#e07a8f', '#b04a4a', '#e8e2f0', '#7f6fd0', '#d9783c'].map(h => new THREE.Color(h)); // geraniums, lavender, roses
  for (const lot of lots.filter(l => l.row === 0 && l.side !== 2)) {
    const {d} = lot, s = lot.side, zf = lot.z, xa = lot.x - d.W / 2 - 1, xb = lot.x + d.W / 2 + 1;
    const zLine = s < 0 ? -(SIDEWALK.outerS + 0.25) : zf - 1.2; // garden edge toward the lane
    const useWall = (d.seed % 3) !== 0;
    for (let x = xa; x < xb - 0.2; x += 1.0) {
      const x2 = Math.min(xb, x + 1.0), y1 = ground(x, zLine + s * 0.4), y2 = ground(x2, zLine + s * 0.4);
      const gate = Math.abs((x + x2) / 2 - lot.x - (d.gable ? (d.gable.at + 0.5) * d.W / d.nb - d.W / 2 : 0) * (s < 0 ? 1 : -1)) < 0.7;
      if (gate) continue;
      if (useWall) walls.push(box((x + x2) / 2, (y1 + y2) / 2 + 0.2, zLine, x2 - x + 0.02, 0.62, 0.42, Math.atan2(y2 - y1, x2 - x)));
      else for (let k = 0; k < 6; k++) { const px = x + k / 6, py = ground(px, zLine); pickets.push(box(px, py + 0.42, zLine, 0.07, 0.84, 0.03)); }
      if (!useWall) pickets.push(box((x + x2) / 2, (y1 + y2) / 2 + 0.6, zLine - s * 0.03, x2 - x, 0.06, 0.03, Math.atan2(y2 - y1, x2 - x)), box((x + x2) / 2, (y1 + y2) / 2 + 0.25, zLine - s * 0.03, x2 - x, 0.06, 0.03, Math.atan2(y2 - y1, x2 - x)));
    }
    // Flower beds (leafy mounds topped with flowers) inside the fence and under the windows.
    for (const [zb, step] of [[zLine + s * 0.75, 0.8], [zf - s * 0.75, 1.1]]) for (let x = xa + 0.5; x < xb - 0.4; x += step * (0.8 + r() * 0.4)) {
      if (r() < 0.15) continue;
      const z = zb + (r() - 0.5) * 0.3, sx = 0.38 + r() * 0.2, sy = 0.25 + r() * 0.2, y = ground(x, z);
      const bloom = r() < 0.55;
      mounds.push({x, y, z, sx, sy, sz: sx * 0.8, c: bloom ? blooms[(r() * blooms.length) | 0] : greens[(r() * 4) | 0], rot: r() * 6});
    }
    for (const x of [xa + 0.6, xb - 0.6]) if (r() < 0.8) { const z = zf - s * 0.9; mounds.push({x, y: ground(x, z), z, sx: 0.6 + r() * 0.5, sy: 0.7 + r() * 0.6, c: greens[(r() * 4) | 0], rot: r() * 6}); }
  }
  const wallMesh = walls.length ? mesh(merge(walls), stoneMat) : null;
  if (wallMesh) group.add(wallMesh);
  if (pickets.length) group.add(mesh(merge(pickets), new THREE.MeshStandardMaterial({color: 0xf3f0e8, roughness: 0.7})));

  // North side: a green like Ocean Avenue's park strip (the TV camera stands here): a clipped
  // hedge along the sidewalk, flower beds and benches on the lawn, a row of trees behind.
  const hedges = [], benches = [];
  for (let x = -186; x < VILLAGE_END - 2; ) {
    const len = 9 + r() * 10, x2 = Math.min(VILLAGE_END - 2, x + len);
    if (!(x2 > -9 && x < 9)) {
      const xs = samples(x, x2, 1);
      hedges.push(beam(xs, xx => ground(xx, 6.1) + 0.55 + 0.04 * Math.sin(xx * 2.1), xx => ground(xx, 6.1) - 0.2, SIDEWALK.outerN + 0.15, SIDEWALK.outerN + 0.8, 1));
      for (let xx = x + 0.3; xx < x2 - 0.3; xx += 0.55) if (r() < 0.5) beds.push({x: xx, y: ground(xx, 6.1) + 0.58, z: 6.0 + r() * 0.5, c: flowerCols[((x | 0) + 300) % flowerCols.length], s: 0.6 + r() * 0.3});
    }
    x = x2 + 2.2 + r() * 1.5;
  }
  for (let x = -176; x < VILLAGE_END - 6; x += 15 + r() * 10) {
    if (x > -10 && x < 10) continue;
    const cz = 9.4 + r() * 2.2, rx = 1.6 + r() * 1.2, rz = 0.7 + r() * 0.4, fc = flowerCols[(r() * 8) | 0];
    const bc = blooms[(r() * blooms.length) | 0];
    for (let k = 0; k < (low ? 6 : 13); k++) {
      const a = r() * 6.28, d = Math.sqrt(r()), x1 = x + Math.cos(a) * rx * d, z1 = cz + Math.sin(a) * rz * d, y = ground(x1, z1), sy = 0.25 + r() * 0.2;
      mounds.push({x: x1, y: y - 0.04, z: z1, sx: 0.4 + r() * 0.22, sy, c: r() < 0.7 ? bc : greens[(r() * 4) | 0], rot: r() * 6});
    }
    void fc;
    if (r() < 0.6) { // a bench facing the lane
      const bx = x + rx + 2.5, by = ground(bx, 7.3);
      benches.push(box(bx, by + 0.42, 7.3, 1.6, 0.06, 0.42), box(bx, by + 0.68, 7.52, 1.6, 0.3, 0.05));
      for (const dx of [-0.7, 0.7]) benches.push(box(bx + dx, by + 0.2, 7.3, 0.06, 0.42, 0.4));
    }
  }
  const hedgeMat = new THREE.MeshStandardMaterial({map: hedgeTexture(), color: 0x9fb48a, roughness: 1});
  if (hedges.length) group.add(mesh(merge(hedges), hedgeMat, {cast: true}));
  if (benches.length) group.add(mesh(merge(benches), mats.wood));
  // Garden shrubs and flowering beds as leaf-card shrubs (shared flora), one call per colour family.
  const asShrub = m => ({x: m.x, y: m.y, z: m.z, s: m.sx * 1.15, sy: m.sy * 1.1});
  const isBloom = m => blooms.includes(m.c);
  flora.shrubs(group, mounds.filter(m => !isBloom(m)).map(asShrub), {palette: ['#3f5a2c', '#4d6a32', '#36502a', '#566b38'], cast: !low, low, kind: 'broad', seed: 41});
  flora.shrubs(group, mounds.filter(isBloom).map(asShrub), {palette: ['#b84a6e', '#8a5cb0', '#c9a03a', '#d0607a', '#a83c3c', '#d8d0e4', '#6f60c0', '#c86a34'], cast: false, low, kind: 'broad', seed: 42});
  plants.flowers(group, [...flowers, ...beds]);

  // --- Trees: cypress and pines among the houses, oaks in gardens, a big forest on the hills ---
  const clearOfHouses = (x, z, pad = 1.5) => !lots.some(l => {
    const c = Math.cos(l.rot), s = Math.sin(l.rot), lx = (x - l.x) * c - (z - l.z) * s, lz = (x - l.x) * s + (z - l.z) * c;
    return lx > -l.d.W / 2 - pad && lx < l.d.W / 2 + pad && lz < 1.6 + pad && lz > -l.d.D - pad;
  });
  const camClear = (x, z) => !(z > 3 && z < 34 && x > -30 && x < 270) && !(x > -14 && x < 6 && z > -12 && z < 9);
  const nearLane = (x, z) => Math.abs(z) < 7.5;
  const cyp = flora.scatter({count: low ? 50 : 120, x0: -190, x1: 470, z0: -200, z1: 200, seed: 31, accept: (x, z, rr) => {
    if (nearLane(x, z) || !camClear(x, z) || !clearOfHouses(x, z, 1.2)) return false;
    const d = coastDist(x, z); if (d < 70) return false;
    if (d > 260 && rr() < 0.55) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 0.75 + p.r * 0.55, rot: p.r * 6.28}));
  flora.trees(group, 'cypress', cyp, {cast: true, low, variants: 2, cell: 400});
  const pines = flora.scatter({count: low ? 60 : 150, x0: -195, x1: 300, z0: -205, z1: 205, seed: 32, accept: (x, z) => {
    if (Math.abs(z) < 11 || !camClear(x, z) || (z > 0 && z < 42) || !clearOfHouses(x, z, 2)) return false;
    if (coastDist(x, z) < 150) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 0.8 + p.r * 0.5, rot: p.r * 6.28}));
  flora.trees(group, 'pine', pines, {cast: true, low, variants: 2, cell: 400});
  const oaks = flora.scatter({count: low ? 20 : 45, x0: -190, x1: 175, z0: -200, z1: 200, seed: 33, accept: (x, z) => {
    if (Math.abs(z) < 9 || !camClear(x, z) || !clearOfHouses(x, z, 1)) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 0.6 + p.r * 0.4, rot: p.r * 6.28}));
  flora.trees(group, 'oak', oaks, {cast: true, low, variants: 2, cell: 400});
  // Small garden trees right along the lane (between cottages on the south side; behind the TV lane on the north).
  const small = [];
  for (const lot of lots.filter(l => l.row === 0 && l.side === -1)) {
    const x = lot.x + lot.d.W / 2 + 1.4, z = -8.4 - r() * 1.5;
    if (clearOfHouses(x, z, 0.3) && r() < 0.7 && !(x > -16 && x < 5)) small.push({x, y: terrainH(x, z), z, s: 0.8 + r() * 0.4, rot: r() * 6});
  }
  flora.trees(group, 'oak', small.map(p => ({...p, s: p.s * 0.42})), {cast: true, low, variants: 2, cell: 400});
  // A row of trees on the green, just behind the TV camera's path.
  const rowOak = [], rowCyp = [];
  for (let x = -182; x < VILLAGE_END - 6; x += 10 + r() * 9) {
    if (x > -10 && x < 10) continue;
    const z = 21.4 + r() * 1.2, p = {x, y: terrainH(x, z), z, s: 0.45 + r() * 0.25, rot: r() * 6.28};
    (r() < 0.55 ? rowOak : rowCyp).push(p);
  }
  flora.trees(group, 'oak', rowOak, {cast: true, low, variants: 2, cell: 400});
  flora.trees(group, 'cypress', rowCyp.map(p => ({...p, s: p.s * 0.85})), {cast: true, low, variants: 2, cell: 400});

  // Hills: Monterey pine forest beyond the village (cheap far trees on the far terrain).
  const far = flora.scatter({count: low ? 900 : 2200, x0: -1800, x1: 1000, z0: -1900, z1: 1900, seed: 34, accept: (x, z, rr) => {
    if (x > -320 && Math.abs(z) < 360) return false;
    const d = coastDist(x, z); if (d < 120) return false;
    if (fbm(x / 300, z / 300, 2) < -0.15 && rr() < 0.8) return false;
    if (slopeAt(terrainH, x, z, 6) > 0.9) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 1.3 + p.r * 0.9, rot: p.r * 6.28}));
  flora.trees(group, plants.farTree, far, {cast: false});
  // Nearer hills: leaf-card Monterey pines between the village and the far forest.
  const ring = flora.scatter({count: low ? 60 : 150, x0: -330, x1: 330, z0: -370, z1: 370, seed: 35, accept: (x, z, rr) => {
    if (x > -200 && Math.abs(z) < 205) return false;
    if (coastDist(x, z) < 130 || rr() < 0.15) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 1.0 + p.r * 0.5, rot: p.r * 6.28}));
  flora.trees(group, 'pine', ring, {cast: false, low, variants: 2, cell: 500});

  return {lots, wallMat, roofMat, stoneMat, clearOfHouses};
}
