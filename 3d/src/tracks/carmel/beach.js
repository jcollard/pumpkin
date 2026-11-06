// Carmel Beach: brilliant white sand, turquoise shallows with rolling foam,
// dune grass and ice plant, wind-shaped cypress on the dunes, and the runout.
import * as THREE from 'three';
import {rng, vnoise, smooth} from '../../noise.js';
import {mesh, slopeAt} from '../../env/geom.js';
import * as flora from '../../env/flora.js';
import * as props from '../../env/props.js';
import * as CT from './tex.js';
import * as plants from './plants.js';

// A strip that follows the shoreline: rows at offsets (m, toward the sea) with RGBA per row.
function shoreStrip(course, z0, z1, step, rows, {uLen = 8} = {}) {
  const pos = [], col = [], uv = [], idx = [], nr = rows.length;
  let k = 0;
  for (let z = z0; z <= z1; z += step, k++) {
    const x0 = course.shoreX(z);
    // Local normal toward the sea from the distance field gradient.
    const e = 3, gx = course.coastDist(x0 + e, z) - course.coastDist(x0 - e, z), gz = course.coastDist(x0, z + e) - course.coastDist(x0, z - e);
    const len = Math.hypot(gx, gz) || 1, nx = -gx / len, nz = -gz / len;
    rows.forEach((row, j) => {
      pos.push(x0 + nx * row.o, row.y ?? 0.03, z + nz * row.o);
      col.push(...row.c);
      uv.push(z / uLen, j / (nr - 1));
    });
    if (k) for (let j = 0; j < nr - 1; j++) { const a = (k - 1) * nr + j, b = k * nr + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildBeach(group, course, mats, {low, ground}) {
  const {terrainH, coastDist, roadHalf: H, RUNOUT_END, FINISH = course.length} = course;
  const r = rng(77);
  // Turquoise shallows over the sandy bottom.
  const tq = [0.25, 0.72, 0.70], deep = [0.06, 0.36, 0.42];
  const shallows = shoreStrip(course, -760, 900, 5, [
    {o: -3, c: [...tq, 0]}, {o: 0, c: [...tq, 0.9]}, {o: 8, c: [...tq, 0.85]}, {o: 22, c: [0.17, 0.6, 0.62, 0.7]},
    {o: 45, c: [0.1, 0.47, 0.52, 0.45]}, {o: 80, c: [...deep, 0.18]}, {o: 120, c: [...deep, 0]},
  ], {});
  const shallowMat = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, fog: true});
  const sh = new THREE.Mesh(shallows, shallowMat); sh.renderOrder = 1; group.add(sh);
  // Foam lines rolling in.
  const foamTex = CT.foamTexture(); foamTex.repeat.set(1, 1.6);
  const foam = shoreStrip(course, -760, 900, 5, [
    {o: -1.5, y: 0.05, c: [1, 1, 1, 0]}, {o: 0.5, y: 0.05, c: [1, 1, 1, 0.95]}, {o: 6, y: 0.05, c: [1, 1, 1, 0.8]}, {o: 16, y: 0.05, c: [1, 1, 1, 0.55]}, {o: 28, y: 0.05, c: [1, 1, 1, 0]},
  ], {uLen: 14});
  const foamMat = new THREE.MeshBasicMaterial({map: foamTex, vertexColors: true, transparent: true, depthWrite: false, fog: true});
  const fm = new THREE.Mesh(foam, foamMat); fm.renderOrder = 2; group.add(fm);
  // Wet sheen where the waves wash up the sand.
  const swash = shoreStrip(course, -760, 900, 5, [{o: -9, y: 0.0, c: [0.75, 0.72, 0.66, 0]}, {o: -4, y: 0.0, c: [0.7, 0.68, 0.63, 0.45]}, {o: 0.3, y: 0.0, c: [0.85, 0.85, 0.82, 0.6]}], {});
  swash.attributes.position.array.forEach((v, i, a) => { if (i % 3 === 1) { const x = a[i - 1], z = a[i + 1]; a[i] = Math.max(0.02, terrainH(x, z) + 0.03); } });
  const sw = new THREE.Mesh(swash, new THREE.MeshStandardMaterial({vertexColors: true, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1}));
  sw.renderOrder = 1; group.add(sw);

  // Dune grass and ice plant on the dunes.
  const dune = (x, z) => { const d = coastDist(x, z); return d > course.BEACH_W + 2 && d < 190; };
  const tufts = flora.scatter({count: low ? 700 : 1800, x0: 150, x1: 470, z0: -200, z1: 200, seed: 51, accept: (x, z, rr) => {
    if (!dune(x, z) || Math.abs(z) < H + 1.6 || (x > FINISH - 6 && x < FINISH + 12 && Math.abs(z) < 14)) return false;
    if (vnoise(x / 9, z / 9) < 0.45 && rr() < 0.7) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 0.8 + p.r * 0.9, rot: p.r * 6.28}));
  plants.grassTufts(group, tufts, {color: '#8f8c5a'});
  const ice = flora.scatter({count: low ? 160 : 420, x0: 150, x1: 470, z0: -200, z1: 200, seed: 52, accept: (x, z) => {
    if (!dune(x, z) || Math.abs(z) < H + 1.8) return false;
    if (vnoise(x / 13 + 7, z / 13) < 0.5) return false;
    return terrainH(x, z);
  }});
  const iceCols = ['#4c6a2c', '#5a7a32', '#5a5a2c', '#6a5a32', '#466226'].map(h => new THREE.Color(h));
  plants.mounds(group, ice.map(p => ({x: p.x, y: p.y - 0.08, z: p.z, sx: 0.7 + p.r * 0.9, sy: 0.22 + p.r * 0.12, c: iceCols[(p.r * 5) | 0], rot: p.r * 6})), {cast: false, detail: 0});

  // Wind-shaped Monterey cypress on the dunes and the bluff (clear of camera paths).
  const cyp = flora.scatter({count: low ? 25 : 50, x0: 170, x1: 460, z0: -200, z1: 200, seed: 53, accept: (x, z) => {
    const d = coastDist(x, z);
    if (d < course.BEACH_W + 8 || d > 210 || Math.abs(z) < 12) return false;
    if (z > 0 && z < 36) return false;                         // TV / drone side
    if (x > FINISH - 20 && x < FINISH + 40 && Math.abs(z) < 30) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 0.9 + p.r * 0.5, rot: p.r * 6.28}));
  flora.trees(group, 'cypress', cyp, {low, variants: 2, cell: 400});

  // Weathered post-and-rail fence along the sand lane through the dunes.
  for (const zf of [-(H + 1.5), H + 1.5]) props.fence(group, course, mats, {ranges: [[course.VILLAGE_END + 8, FINISH - 6], [FINISH + 34, RUNOUT_END - 6]], z: zf, seed: zf > 0 ? 7 : 8});

  // Runout: a wall of straw bales on the beach at the end of the sand lane.
  const bl = [];
  for (let z = -H - 0.6; z <= H + 0.6; z += 1.2) for (let k = 0; k < 2; k++) bl.push({x: RUNOUT_END - 1 + k * 0.62, z, rot: Math.PI / 2, stack: 0});
  for (let z = -H; z <= H; z += 1.2) bl.push({x: RUNOUT_END - 0.7, z, rot: Math.PI / 2, stack: 1});
  bl.push(...props.baleRows(course, FINISH + 13, FINISH + 30, {stackEvery: 4}).filter(b => b.z < 0));
  props.bales(group, course, mats, bl);

  return {shallowMat, foamTex, update(wall) { foamTex.offset.y = -((wall * 0.045) % 1); foamTex.offset.x = Math.sin(wall * 0.2) * 0.02; }};
}
