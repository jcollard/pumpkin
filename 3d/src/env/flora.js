// Plants, rocks, clouds and birds that any track can scatter around.
//
// Trees and shrubs are built from a trunk/limb mesh plus "leaf cards": small
// alpha-tested quads painted with leaf clusters (textures.foliageAtlas) and lit
// with normals pointing out of the crown, so canopies read soft and volumetric.
// Everything is instanced and split into cells so the camera and the sun's
// shadow camera can cull whole groups.
//
// API (all backward compatible):
//   scatter({count, x0, x1, z0, z1, seed, tries, accept}) -> [{x, y, z, r}]
//   trees(group, kind, points, {cast, low, variants, cell})   kind: flora.cypress | redwood | oak | pine |
//        eucalyptus (or the name as a string); points [{x, y, z, s?, rot?}]
//   shrubs(group, points, {palette, cast, seed, low, kind: 'scrub'|'sage'|'broad'})
//   grass(group, course, opts)     dense verge grass + wildflowers + pebbles (see below)
//   rocks(group, list, {color, wet, detail}) · rockGeometry() · pebbles(group, list)
//   cloudBank(group, opts) · soaringBirds(group, list)
import * as THREE from 'three';
import {mergeGeometries, mergeVertices} from 'three/addons/BufferGeometryUtils.js';
import {rng, fbm, vnoise} from '../noise.js';
import {cloudTexture, foliageAtlas, foliageCellMean, FOLIAGE_CELLS} from '../textures.js';
import {instanced, instancedChunks, mat4, taperedTube} from './geom.js';
import {pbr, worldDetail} from './surface.js';
import {clock, noReflect} from './world.js';

export const leafMaterial = () => new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.95, flatShading: true});
export const barkMaterial = (color = 0x5a4636) => new THREE.MeshStandardMaterial({color, roughness: 0.95});

// Pick up to `count` points in a box that pass `accept(x, z)`. Deterministic.
export function scatter({count, x0, x1, z0, z1, seed = 1, tries = count * 40, accept}) {
  const r = rng(seed), out = [];
  for (let i = 0; out.length < count && i < tries; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    const a = accept(x, z, r);
    if (a !== false && a !== undefined && a !== null) out.push({x, z, y: typeof a === 'number' ? a : 0, r: r()});
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materials
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const matCache = new Map();

// Wind sway + "no back-face flip" for foliage cards and grass.
function windy(mat, {amp = 0.012, grass = false, thin = 0} = {}) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.vqTime = clock.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float vqTime;\nfloat vqHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float ph = ip.x * 0.37 + ip.z * 0.21;
          float h = max(0.0, position.y);
          float sway = sin(vqTime * 1.1 + ph) * 0.6 + sin(vqTime * 2.7 + ph * 1.7 + position.x * 0.5) * 0.3;
          ${grass ? 'h = h * h * 2.2;' : ''}
          transformed.x += sway * ${amp.toFixed(4)} * h;
          transformed.z += sway * ${(amp * 0.7).toFixed(4)} * h;
          ${thin ? `
          // Thin out with distance from the camera (keeps far verges cheap and calm).
          vec4 wp = modelMatrix * vec4(ip, 1.0);
          float d = distance(wp.xyz, cameraPosition);
          float keep = 1.0 - smoothstep(${(thin * 0.35).toFixed(1)}, ${thin.toFixed(1)}, d);
          float hsh = vqHash(ip.xz);
          float k = smoothstep(hsh - 0.08, hsh + 0.08, keep);
          transformed *= k;` : ''}
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifndef FLAT_SHADED\nnormal = normalize(vNormal);\n#endif');
  };
  mat.customProgramCacheKey = () => `vq-windy-${amp}-${grass}-${thin}`;
  return mat;
}

export function foliageMaterial() {
  if (matCache.has('foliage')) return matCache.get('foliage');
  const m = windy(new THREE.MeshStandardMaterial({map: foliageAtlas(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0}), {amp: 0.01});
  m.shadowSide = THREE.DoubleSide;
  matCache.set('foliage', m);
  return m;
}

function barkMat(tint, setName = 'bark_redwood', useMap = true) {
  const key = 'bark-' + tint + setName + useMap;
  if (matCache.has(key)) return matCache.get(key);
  const set = pbr(setName);
  const m = new THREE.MeshStandardMaterial({color: tint, map: useMap ? set.map : null, normalMap: set.normalMap, roughness: 0.92});
  m.normalScale.set(1.2, 1.2);
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// Leaf cards
function cellUV(cell) {
  const u0 = cell % 2 ? 0.5 : 0, v0 = cell < 2 ? 0.5 : 0;
  return [u0 + 0.004, v0 + 0.004, u0 + 0.496, v0 + 0.496];
}

// cards: [{p: [x,y,z], s, f: [fx,fy,fz] facing, roll, up?: bias to keep texture top up, flip}]
// centre: point normals radiate from (array or fn(p) -> [x,y,z]). R: crown radius for AO.
function cardGeometry(cards, cell, {centre = [0, 0, 0], R = 3, aoBottom = 0, normalUp = 0.35, colorJitter = 0.12, seed = 1} = {}) {
  const r = rng(seed), [u0, v0, u1, v1] = cellUV(cell);
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const f = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const k of cards) {
    f.set(...k.f).normalize();
    tmp.set(0, 1, 0);
    if (Math.abs(f.y) > 0.95) tmp.set(1, 0, 0);
    right.crossVectors(tmp, f).normalize(); up.crossVectors(f, right).normalize();
    const roll = k.roll ?? 0;
    if (roll) { right.applyAxisAngle(f, roll); up.applyAxisAngle(f, roll); }
    const h = k.s / 2, w = h * (k.aspect ?? 1);
    const base = pos.length / 3;
    const ctr = typeof centre === 'function' ? centre(k.p) : centre;
    const flip = k.flip ? -1 : 1;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const tint = 1 + (r() - 0.5) * colorJitter * 2;
    for (const [a, b] of corners) {
      c.set(...k.p).addScaledVector(right, a * w * flip).addScaledVector(up, b * h);
      pos.push(c.x, c.y, c.z);
      n.set(c.x - ctr[0], (c.y - ctr[1]) * 0.8, c.z - ctr[2]).normalize();
      n.y += normalUp; n.normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(a < 0 ? u0 : u1, b < 0 ? v0 : v1);
      const d = Math.min(1, Math.hypot(c.x - ctr[0], c.z - ctr[2], (c.y - ctr[1]) * 1.2) / R);
      const ao = Math.min(1.08, (0.42 + 0.62 * d) * (1 - aoBottom * Math.max(0, (ctr[1] - c.y) / R)) * tint);
      col.push(ao, ao, ao);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Cards scattered over an ellipsoidal clump, facing outward.
function clumpCards(out, r, {c, rx, ry, rz = rx, n, s, upper = 0.3, droop = 0, cellUp = false}) {
  for (let i = 0; i < n; i++) {
    let x, y, z;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    y = y * (1 - upper) + upper * Math.abs(y);
    const d = 0.55 + 0.45 * Math.hypot(x, y, z);
    const p = [c[0] + x * rx * d, c[1] + y * ry * d, c[2] + z * rz * d];
    const f = [x + (r() - 0.5) * 0.8, y + 0.3 + (r() - 0.5) * 0.6 - droop, z + (r() - 0.5) * 0.8];
    out.push({p, s: s * (0.75 + r() * 0.5), f, roll: cellUp ? (r() - 0.5) * 0.5 : r() * Math.PI * 2, flip: r() < 0.5});
  }
}

// ---------------------------------------------------------------------------
// Tree kinds. Each returns {trunk, crown (=canopy), bark, barkSet, tint, cards: true}.

// Monterey cypress: gnarled forked trunk, flat wind-shaped pads leaning inland (-Z).
export function cypress(seed = 0) {
  const r = rng(101 + seed * 17);
  const fork = [0.25 + (r() - 0.5) * 0.3, 2.0 + r() * 0.8, -0.35 - r() * 0.3];
  const limbs = [taperedTube([[0, -0.4, 0], [0.05, 1, -0.05], fork], [0.5, 0.42, 0.34], {radial: 7, flare: 0.5})];
  const cards = [], pads = 4 + Math.floor(r() * 3);
  for (let i = 0; i < pads; i++) {
    const a = (i / pads) * Math.PI * 2 + r() * 0.8, rad = 1.2 + r() * 2.6, hgt = 4.8 + r() * 3.4 + (i === 0 ? 1.4 : 0);
    const c = [Math.cos(a) * rad + 0.4, hgt, Math.sin(a) * rad * 0.8 - 1.1 - r() * 0.8];
    limbs.push(taperedTube([fork, [(fork[0] + c[0]) * 0.5, (fork[1] + c[1]) * 0.5 + 0.3, (fork[2] + c[2]) * 0.5], [c[0], c[1] - 0.4, c[2]]], [0.28, 0.18, 0.08], {radial: 4, segs: 1}));
    clumpCards(cards, r, {c, rx: 2.1 + r() * 1.2, ry: 0.75 + r() * 0.45, n: 13, s: 2.0, upper: 0.55});
  }
  clumpCards(cards, r, {c: [0.3, 8.6 + r(), -1.4], rx: 3.4, ry: 0.8, n: 14, s: 2.3, upper: 0.7});
  const crown = cardGeometry(cards, FOLIAGE_CELLS.scale, {centre: [0.3, 6.2, -1.2], R: 4.2, aoBottom: 0.35, seed});
  return {trunk: mergeGeometries(limbs), crown, canopy: crown, bark: 0xb0a090, barkSet: 'bark_redwood', tint: '#2f4a2c', cell: FOLIAGE_CELLS.scale, cards: true};
}

// Coast redwood: tall straight trunk with flared base, narrow crown of drooping sprays.
export function redwood(seed = 0) {
  const r = rng(201 + seed * 13), H = 46 + r() * 8;
  const trunk = taperedTube([[0, -1, 0], [0, H * 0.3, 0], [0.2, H * 0.7, 0.1], [0.3, H, 0.2]], [1.05, 0.75, 0.38, 0.06], {radial: 9, flare: 0.7, uWrap: 3});
  const cards = [], base = H * 0.28;
  for (let y = base; y < H - 0.5; y += 1.25) {
    const t = (y - base) / (H - base), R = 4.6 * Math.pow(1 - t, 0.8) + 0.9, n = 3;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = R * (0.45 + r() * 0.35);
      cards.push({p: [Math.cos(a) * d, y - 0.3, Math.sin(a) * d], s: R * 0.8 + 1.4, f: [Math.cos(a) * 0.6, 0.25 + r() * 0.3, Math.sin(a) * 0.6], roll: (r() - 0.5) * 0.4, flip: r() < 0.5});
    }
  }
  const crown = cardGeometry(cards, FOLIAGE_CELLS.needle, {centre: p => [0, p[1] + 1.5, 0], R: 4.5, normalUp: 0.25, seed});
  return {trunk, crown, canopy: crown, bark: 0xe0b090, barkSet: 'bark_redwood', tint: '#2c4628', cell: FOLIAGE_CELLS.needle, cards: true};
}

// Coast live oak: short trunk forking into spreading limbs, broad rounded crown.
export function oak(seed = 0) {
  const r = rng(301 + seed * 11);
  const fork = [(r() - 0.5) * 0.4, 1.8 + r() * 0.7, (r() - 0.5) * 0.4];
  const limbs = [taperedTube([[0, -0.4, 0], [0, 1, 0], fork], [0.5, 0.42, 0.36], {radial: 7, flare: 0.4})];
  const cards = [], n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6, rad = 2.2 + r() * 2.8, hgt = 4.6 + r() * 2.6 - rad * 0.15;
    const c = [Math.cos(a) * rad, hgt, Math.sin(a) * rad];
    limbs.push(taperedTube([fork, [c[0] * 0.5, (fork[1] + c[1]) * 0.5 + 0.6, c[2] * 0.5], [c[0] * 0.9, c[1] - 0.6, c[2] * 0.9]], [0.26, 0.17, 0.07], {radial: 4, segs: 1}));
    clumpCards(cards, r, {c, rx: 2.3 + r() * 0.8, ry: 1.5 + r() * 0.5, n: 11, s: 2.1, upper: 0.35});
  }
  clumpCards(cards, r, {c: [0, 6.6 + r(), 0], rx: 3.2, ry: 1.6, n: 12, s: 2.4, upper: 0.5});
  const crown = cardGeometry(cards, FOLIAGE_CELLS.broad, {centre: [0, 5.2, 0], R: 5, aoBottom: 0.3, seed});
  return {trunk: mergeGeometries(limbs), crown, canopy: crown, bark: 0x8a8278, barkSet: 'bark_redwood', tint: '#4a5a30', cell: FOLIAGE_CELLS.broad, cards: true};
}

// Monterey pine: tall trunk, irregular rounded crown of needle clumps.
export function pine(seed = 0) {
  const r = rng(401 + seed * 7), H = 17 + r() * 6, lean = (r() - 0.5) * 1.2;
  const top = [lean, H, (r() - 0.5) * 0.8];
  const limbs = [taperedTube([[0, -0.5, 0], [lean * 0.3, H * 0.5, 0], top], [0.55, 0.36, 0.1], {radial: 8, flare: 0.4})];
  const cards = [], n = 7 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, y = H * (0.5 + r() * 0.45), rad = (1 - (y / H - 0.5) * 1.2) * (2.2 + r() * 2.2);
    const c = [Math.cos(a) * rad + lean * y / H, y, Math.sin(a) * rad];
    limbs.push(taperedTube([[lean * y / H * 0.9, y - 1.2, 0], [c[0] * 0.6, y - 0.4, c[2] * 0.6], [c[0], c[1] - 0.5, c[2]]], [0.16, 0.1, 0.05], {radial: 4, segs: 1}));
    clumpCards(cards, r, {c, rx: 2.0 + r() * 0.8, ry: 1.3 + r() * 0.4, n: 9, s: 2.2, upper: 0.4, cellUp: true});
  }
  const crown = cardGeometry(cards, FOLIAGE_CELLS.needle, {centre: [lean * 0.8, H * 0.75, 0], R: 4.5, aoBottom: 0.3, seed});
  return {trunk: mergeGeometries(limbs), crown, canopy: crown, bark: 0x9a8070, barkSet: 'bark_redwood', tint: '#35502c', cell: FOLIAGE_CELLS.needle, cards: true};
}

// Blue gum eucalyptus: tall pale trunk, sparse drooping crown.
export function eucalyptus(seed = 0) {
  const r = rng(501 + seed * 5), H = 26 + r() * 8;
  const mid = [(r() - 0.5) * 1.6, H * 0.55, (r() - 0.5) * 1.6];
  const limbs = [taperedTube([[0, -0.5, 0], [0.3, H * 0.25, 0.2], mid], [0.7, 0.5, 0.36], {radial: 8, flare: 0.3})];
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + r(), end = [mid[0] + Math.cos(a) * (2.5 + r() * 2.5), H * (0.82 + r() * 0.18), mid[2] + Math.sin(a) * (2.5 + r() * 2.5)];
    limbs.push(taperedTube([mid, [(mid[0] + end[0]) / 2, (mid[1] + end[1]) / 2 + 1, (mid[2] + end[2]) / 2], end], [0.3, 0.2, 0.06], {radial: 4, segs: 1}));
    clumpCards(cards, r, {c: [end[0], end[1] - 1.5, end[2]], rx: 2.6, ry: 2.2, n: 8, s: 3.0, upper: 0, cellUp: true});
    clumpCards(cards, r, {c: [(mid[0] + end[0]) * 0.5, (mid[1] + end[1]) * 0.5, (mid[2] + end[2]) * 0.5], rx: 1.8, ry: 1.8, n: 4, s: 2.6, upper: 0, cellUp: true});
  }
  const crown = cardGeometry(cards, FOLIAGE_CELLS.euc, {centre: [mid[0], H * 0.78, mid[2]], R: 5, normalUp: 0.2, seed});
  return {trunk: mergeGeometries(limbs), crown, canopy: crown, bark: 0xcfc6b2, barkSet: 'bark_redwood', barkMap: false, tint: '#6f8a78', cell: FOLIAGE_CELLS.euc, cards: true};
}

export const TREE_KINDS = {cypress, redwood, oak, pine, eucalyptus};

// Place a tree kind at points: [{x, y, z, s?, rot?}].
// opts: {cast = true, low = false, variants = 3, cell = 220 (culling cell in m), tint (override leaf colour)}
export function trees(group, kind, points, {cast = true, low = false, variants = low ? 2 : 3, cell = 300, tint} = {}) {
  if (!points.length) return [];
  const fn = typeof kind === 'string' ? TREE_KINDS[kind] : kind;
  const probe = fn(0);
  if (!probe.cards) { // a custom old-style kind: blob canopy with vertex colours
    const m = points.map(p => mat4(p.x, p.y - 0.3, p.z, p.s ?? 1, p.rot ?? 0));
    const meshes = [instanced(probe.trunk, barkMaterial(probe.bark), m, {cast}), instanced(probe.canopy, leafMaterial(), m, {cast})];
    group.add(...meshes);
    return meshes;
  }
  const out = [], kinds = [probe, ...Array.from({length: variants - 1}, (_, i) => fn(i + 1))];
  const r = rng(points.length * 7 + 3), leafTint = new THREE.Color(tint ?? probe.tint), hsl = {};
  leafTint.getHSL(hsl);
  const norm = foliageCellMean(probe.cell ?? 0);
  kinds.forEach((t, vi) => {
    const pts = points.filter((p, i) => (((i * 7 + Math.floor((p.x + p.z) * 3)) % kinds.length) + kinds.length) % kinds.length === vi);
    if (!pts.length) return;
    const m = pts.map(p => mat4(p.x, p.y - 0.15, p.z, p.s ?? 1, p.rot ?? 0));
    const cols = pts.map(() => { const c = new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.04, hsl.s * (0.85 + r() * 0.3), hsl.l * (0.82 + r() * 0.36)); c.r /= norm.r; c.g /= norm.g; c.b /= norm.b; return c; });
    out.push(...instancedChunks(group, t.trunk, barkMat(t.bark, t.barkSet, t.barkMap !== false), m, {cell, cast}));
    out.push(...instancedChunks(group, t.crown, foliageMaterial(), m, {cell, cast, colors: cols}));
  });
  noReflect(out);
  return out;
}

// ---------------------------------------------------------------------------
// Shrubs: low mounds of leaf cards with per-instance colour.
const shrubGeos = {};
function shrubGeometry(variant, cell) {
  const key = variant + '-' + cell;
  if (shrubGeos[key]) return shrubGeos[key];
  const r = rng(601 + variant * 31), cards = [];
  const lobes = 2 + variant % 3;
  for (let i = 0; i < lobes; i++) {
    const a = r() * Math.PI * 2, d = i ? 0.45 + r() * 0.35 : 0;
    clumpCards(cards, r, {c: [Math.cos(a) * d, 0.55 + r() * 0.2, Math.sin(a) * d], rx: 0.85 + r() * 0.3, ry: 0.55 + r() * 0.2, n: 7, s: 0.95, upper: 0.5});
  }
  shrubGeos[key] = cardGeometry(cards, cell, {centre: [0, 0.15, 0], R: 1.3, normalUp: 0.5, seed: variant});
  return shrubGeos[key];
}

export function shrubs(group, points, {palette = ['#556b3c', '#6c7a47', '#7c7a4e', '#4e5f37', '#8a7f55', '#9a8a5a'], cast = true, seed = 3, low = false, kind = 'scrub', cell = 260} = {}) {
  if (!points.length) return [];
  const r = rng(seed), cols = palette.map(h => new THREE.Color(h));
  const leafCell = kind === 'sage' ? FOLIAGE_CELLS.scale : kind === 'needle' ? FOLIAGE_CELLS.needle : FOLIAGE_CELLS.broad;
  const nv = low ? 2 : 4, out = [];
  for (let v = 0; v < nv; v++) {
    const pts = points.filter((p, i) => i % nv === v);
    if (!pts.length) continue;
    const m = pts.map(p => mat4(p.x, p.y - 0.12, p.z, p.s ?? 0.5 + r() * 1.6, r() * 6, (p.sy ?? 0.4 + r()) * 1.15));
    const norm = foliageCellMean(leafCell);
    const c = pts.map(() => { const k = cols[(r() * cols.length) | 0].clone().multiplyScalar(0.9 + r() * 0.25); k.r /= norm.r; k.g /= norm.g; k.b /= norm.b; return k; });
    out.push(...instancedChunks(group, shrubGeometry(v, leafCell), foliageMaterial(), m, {cell, cast, colors: c}));
  }
  noReflect(out);
  return out;
}

// ---------------------------------------------------------------------------
// Grass, wildflowers and pebbles along the track verges.
let tuftGeo = null;
function grassTuft() {
  if (tuftGeo) return tuftGeo;
  const r = rng(77), pos = [], nrm = [], col = [], idx = [];
  const blades = 9;
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.13, h = 0.16 + r() * r() * 0.42, w = 0.018 + r() * 0.018;
    const lean = 0.15 + r() * 0.35, la = a + (r() - 0.5) * 1.2;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad, dirx = Math.cos(la), dirz = Math.sin(la);
    const px = -dirz, pz = dirx; // blade width direction
    const segs = 2, base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, bend = lean * t * t * h, ww = w * (1 - t * 0.85);
      const cx = bx + dirx * bend, cy = h * t * (1 - lean * 0.25 * t), cz = bz + dirz * bend;
      pos.push(cx - px * ww, cy, cz - pz * ww, cx + px * ww, cy, cz + pz * ww);
      for (let k = 0; k < 2; k++) nrm.push(dirx * 0.3, 1, dirz * 0.3);
      const c = 0.42 + 0.58 * t + (r() - 0.5) * 0.08;
      col.push(c, c, c, c, c, c);
      if (s) { const k = base + (s - 1) * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
  }
  tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tuftGeo.setIndex(idx);
  return tuftGeo;
}

let flowerGeo = null;
function flowerGeometry() {
  if (flowerGeo) return flowerGeo;
  const stalk = new THREE.CylinderGeometry(0.006, 0.008, 0.36, 3, 1, true); stalk.translate(0, 0.18, 0);
  const head = new THREE.IcosahedronGeometry(0.035, 0); head.scale(1, 0.55, 1); head.translate(0, 0.37, 0);
  const s = stalk.toNonIndexed(), h = head.toNonIndexed();
  const paint = (g, c) => g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length: g.attributes.position.count}, () => c).flat(), 3));
  paint(s, [0.25, 0.35, 0.15]); paint(h, [1, 1, 1]);
  s.deleteAttribute('uv'); h.deleteAttribute('uv');
  flowerGeo = mergeGeometries([s, h]);
  return flowerGeo;
}

export const GRASS_PALETTES = {
  dry: ['#c9ad6a', '#b89a5a', '#d6bf82', '#a8925a', '#9c9a5c', '#c2a764'],
  golden: ['#d2b46e', '#c4a35e', '#dcc48a', '#b8995a', '#a69a62'],
  green: ['#7d9a4a', '#6c8c3e', '#8fa856', '#5e7c38', '#9aa85c'],
  coastal: ['#a7a160', '#8e9a52', '#b9a86a', '#7f8c4c', '#c2ad70'],
};
const FLOWERS = ['#f28c28', '#ef7b1a', '#f6c23e', '#8a6fd1', '#f1ede2', '#e0533d', '#f4d35e'];

// Dense instanced grass along the verges, thinning with distance from the
// track and from the camera. opts:
//   x0, x1          range along the course (default -60 .. length + 80)
//   near, far       |z| band (default roadHalf + 0.15 .. 26)
//   density         tufts per m² at the edge of the track (default 6), falling off over `falloff` m (5)
//   sides           [-1, 1]  which sides of the track
//   zones           extra patches [{x0, x1, z0, z1, density}] (e.g. around a camera or crowd)
//   accept(x, z)    return false to skip a spot (bridges, buildings, water)
//   palette         'dry' | 'golden' | 'green' | 'coastal' | [hex...]
//   height          tuft height scale (1)
//   flowers         fraction of tufts that get a wildflower (0.05), flowerColors [hex]
//   pebbles         pebbles per m² near the edge (0.5)
//   thin            camera distance (m) beyond which tufts vanish (70; low 40)
//   maxSlope        skip steeper ground (1.2)
//   low             fewer tufts
// Returns {meshes, count}.
export function grass(group, course, opts = {}) {
  const half = course.roadHalf;
  const o = {x0: -60, x1: course.length + 80, near: half + 0.15, far: 26, density: 4.5, falloff: 4, sides: [-1, 1], zones: [],
    palette: 'dry', height: 1, flowers: 0.05, flowerColors: FLOWERS, pebbles: 0.5, thin: 55, maxSlope: 1.2, low: false, seed: 31, cell: 64, ...opts};
  if (o.low) { o.density *= 0.4; o.thin = Math.min(o.thin, 40); o.pebbles *= 0.4; }
  const r = rng(o.seed);
  const pal = (Array.isArray(o.palette) ? o.palette : GRASS_PALETTES[o.palette] || GRASS_PALETTES.dry).map(h => new THREE.Color(h));
  const ground = (x, z) => {
    let y = course.terrainH(x, z);
    if (Math.abs(z) < half + 0.95 && x > -500) y = Math.max(y, course.roadY(x) + 0.03); // on the berm
    return y;
  };
  const ok = (x, z) => {
    if (Math.abs(z) < half + 0.12 && course.hasSurface?.(x) !== false && x > -1e4) return false; // on the racing surface
    const y = course.terrainH(x, z);
    if (Math.abs(z) < half + 4 && Math.abs(y - course.roadY(x)) > 2.5) return false; // no verge here (bridge, cutting wall)
    if (course.sea && y < (course.seaLevel ?? 0) + 0.8) return false;
    if (o.accept && o.accept(x, z) === false) return false;
    const e = 0.6, dx = (course.terrainH(x + e, z) - course.terrainH(x - e, z)) / (2 * e), dz = (course.terrainH(x, z + e) - course.terrainH(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz) < o.maxSlope;
  };
  const tufts = [], flowers = [], stones = [];
  const place = (x, z, scale) => {
    if (!ok(x, z)) return;
    const y = ground(x, z), s = (0.7 + r() * 0.7) * o.height * scale;
    tufts.push({x, y, z, s, rot: r() * 6.28, c: pal[(r() * pal.length) | 0]});
    if (r() < o.flowers) flowers.push({x: x + (r() - 0.5) * 0.2, y, z: z + (r() - 0.5) * 0.2, s: 0.8 + r() * 0.6, c: new THREE.Color(o.flowerColors[(r() * o.flowerColors.length) | 0])});
  };
  // Verge bands: exponential falloff away from the track edge.
  for (let x = o.x0; x < o.x1; x += 1) for (const side of o.sides) {
    const expected = o.density * o.falloff * (1 - Math.exp(-(o.far - o.near) / o.falloff));
    const n = Math.floor(expected + r());
    for (let i = 0; i < n; i++) {
      const d = -o.falloff * Math.log(1 - r() * (1 - Math.exp(-(o.far - o.near) / o.falloff)));
      const clump = vnoise((x + r()) / 3.1, d / 3.1 + side * 50); // patchy growth
      if (clump < 0.32 && r() < 0.7) continue;
      place(x + r(), side * (o.near + d), d < 1.2 ? 0.85 : 1);
    }
    const np = Math.floor(o.pebbles * 2.5 + r());
    for (let i = 0; i < np; i++) {
      const z = side * (half - 0.2 + r() * 3), xx = x + r();
      if (Math.abs(z) < half - 0.05 || !ok(xx, z)) continue;
      stones.push({x: xx, y: ground(xx, z), z, s: 0.03 + r() * r() * 0.16});
    }
  }
  for (const zn of o.zones) {
    const n = Math.floor((zn.x1 - zn.x0) * (zn.z1 - zn.z0) * (zn.density ?? o.density) * (o.low ? 0.4 : 1));
    for (let i = 0; i < n; i++) place(zn.x0 + r() * (zn.x1 - zn.x0), zn.z0 + r() * (zn.z1 - zn.z0), 1);
  }
  const meshes = [];
  if (tufts.length) {
    const mat = windy(new THREE.MeshStandardMaterial({vertexColors: true, side: THREE.DoubleSide, roughness: 0.92}), {amp: 0.08, grass: true, thin: o.thin});
    meshes.push(...instancedChunks(group, grassTuft(), mat, tufts.map(t => mat4(t.x, t.y - 0.02, t.z, t.s, t.rot)), {cell: o.cell, cast: false, colors: tufts.map(t => t.c)}));
  }
  if (flowers.length) {
    const mat = windy(new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.7}), {amp: 0.08, grass: true, thin: o.thin * 0.7});
    meshes.push(...instancedChunks(group, flowerGeometry(), mat, flowers.map(f => mat4(f.x, f.y - 0.02, f.z, f.s, r() * 6)), {cell: o.cell * 2, cast: false, colors: flowers.map(f => f.c)}));
  }
  if (stones.length) meshes.push(...pebbles(group, stones, {thin: o.thin * 0.6, cell: o.cell * 2}));
  for (const m of meshes) distanceCull(m, o.thin * 1.05);
  noReflect(meshes);
  return {meshes, count: tufts.length, flowers: flowers.length, pebbles: stones.length};
}

// Skip a whole instanced chunk when the camera is farther than `range` from it
// (its instances would be thinned to nothing by the shader anyway).
const _sph = new THREE.Sphere();
export function distanceCull(mesh, range) {
  const full = mesh.count;
  if (!mesh.boundingSphere) mesh.computeBoundingSphere();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    _sph.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
    mesh.count = _sph.center.distanceTo(camera.position) - _sph.radius < range ? full : 0;
  };
  return mesh;
}

// Small stones: [{x, y, z, s}]. Half-buried, instanced.
let pebbleGeo = null;
export function pebbles(group, list, {color = 0x8a8072, thin = 50, cell = 40} = {}) {
  if (!list.length) return [];
  if (!pebbleGeo) {
    pebbleGeo = new THREE.IcosahedronGeometry(1, 1);
    pebbleGeo.deleteAttribute('normal'); pebbleGeo.deleteAttribute('uv');
    pebbleGeo = mergeVertices(pebbleGeo);
    const p = pebbleGeo.attributes.position, r = rng(5);
    for (let i = 0; i < p.count; i++) { const k = 0.8 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.6, p.getZ(i) * k); }
    pebbleGeo.computeVertexNormals();
  }
  const r = rng(list.length + 9), base = new THREE.Color(color);
  const mat = windy(new THREE.MeshStandardMaterial({roughness: 0.9}), {amp: 0, thin});
  return instancedChunks(group, pebbleGeo, mat, list.map(k => new THREE.Matrix4().compose(V3(k.x, k.y - k.s * 0.25, k.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.5, r() * 6, r() * 0.5)), V3(k.s * (0.8 + r() * 0.5), k.s, k.s * (0.8 + r() * 0.5)))),
    {cell, cast: false, colors: list.map(() => base.clone().offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.1, (r() - 0.5) * 0.18))});
}

// ---------------------------------------------------------------------------
// Rocks
let rockGeo = null;
export function rockGeometry() {
  if (rockGeo) return rockGeo;
  rockGeo = new THREE.IcosahedronGeometry(1, 3);
  rockGeo.deleteAttribute('normal'); rockGeo.deleteAttribute('uv');
  // (1280 triangles: used for the few big rocks; craggy rocks are 320)
  rockGeo = mergeVertices(rockGeo);
  const p = rockGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Broad lumps, then sharper fractured facets and horizontal strata.
    let k = 0.8 + 0.42 * (fbm(v.x * 1.5 + 4, v.z * 1.5 + v.y * 1.3, 3) + 0.5) * 0.7;
    k += 0.07 * Math.abs(fbm(v.x * 4.1 + v.y * 2, v.z * 4.1 - v.y, 2));
    k *= 1 - 0.035 * Math.abs(Math.sin(v.y * 9 + fbm(v.x * 2, v.z * 2, 2) * 3));
    v.multiplyScalar(k);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.6; // flatter base
    p.setXYZ(i, v.x, v.y, v.z);
  }
  rockGeo.computeVertexNormals();
  return rockGeo;
}

// Fractured, blocky rock: a sphere cut by random planes (flat faces, sharp-ish edges)
// plus a little noise. ~320 triangles. variant 0..3.
const craggyGeos = [];
export function craggyRockGeometry(variant = 0) {
  if (craggyGeos[variant]) return craggyGeos[variant];
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const r = rng(700 + variant * 13), planes = [];
  for (let i = 0; i < 9; i++) {
    const n = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
    planes.push({n, d: 0.62 + r() * 0.3});
  }
  planes.push({n: new THREE.Vector3(0, -1, 0), d: 0.35}); // flat base
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const {n, d} of planes) { const k = v.dot(n); if (k > d) v.addScaledVector(n, d - k); }
    v.multiplyScalar(1 + 0.05 * fbm(v.x * 3 + variant, v.z * 3 + v.y * 2, 2));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  craggyGeos[variant] = g;
  return g;
}

// Rocks: [{x, y, z, s, sy?, sz?, rx?, ry?}]. opts: {color, wet: darken below this world y (sea stacks),
// texture: PBR rock set name ('rock_cliff'), flat: faceted look, shape: 'round' (default) | 'craggy'}
export function rocks(group, list, {color = 0x6f6458, wet = null, texture = 'rock_cliff', flat = false, cast = true, shape = 'round'} = {}) {
  if (!list.length) return [];
  if (shape === 'craggy') {
    const out = [];
    for (let v = 0; v < 4; v++) {
      const sub = list.filter((_, i) => i % 4 === v);
      if (sub.length) out.push(...rocks(group, sub, {color, wet, texture, flat, cast, shape: v}));
    }
    return out;
  }
  const geo = typeof shape === 'number' ? craggyRockGeometry(shape) : rockGeometry();
  const mats = list.map(k => new THREE.Matrix4().compose(new THREE.Vector3(k.x, k.y, k.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(k.rx ?? 0, k.ry ?? 0, 0)), new THREE.Vector3(k.s, k.sy ?? k.s, k.sz ?? k.s)));
  const mat = new THREE.MeshStandardMaterial({color, roughness: 0.92, flatShading: flat});
  if (texture) worldDetail(mat, {set: texture, mode: 'triplanar', scale: 7, macro: 26, strength: 1, colorMix: 0.25, normalScale: 1.2, fade: 400});
  if (wet !== null) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float wetK = 1.0 - smoothstep(${(wet - 0.6).toFixed(2)}, ${(wet + 1.4).toFixed(2)}, vqW.y);
          diffuseColor.rgb *= 1.0 - 0.45 * wetK; roughnessFactor = mix(roughnessFactor, 0.35, wetK);
          float top = smoothstep(0.55, 0.9, vqWN.y) * smoothstep(6.0, 14.0, vqW.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.7), top * 0.55); }`);
    };
    const pk = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => pk() + '-wet' + wet;
  }
  const out = instancedChunks(group, geo, mat, mats, {cell: 400, cast});
  return out;
}

// Sea stacks: steep-sided columns with ledges, fissures and a rounded, vegetated cap.
const stackGeos = [];
export function seaStackGeometry(variant = 0) {
  if (stackGeos[variant]) return stackGeos[variant];
  const R = 24, H = 20, pos = [], idx = [], r = rng(900 + variant * 37), ph = [r() * 9, r() * 9, r() * 9, r() * 9];
  const lean = (r() - 0.5) * 0.35, squash = 0.6 + r() * 0.45, slant = (r() - 0.5) * 0.5, notch = r() * 6.28;
  for (let j = 0; j <= H; j++) {
    const t = j / H, y = -0.25 + t * 1.25;
    for (let i = 0; i <= R; i++) {
      const a = i / R * Math.PI * 2;
      // Broad apron at the waterline, irregular buttresses, narrowing shoulders, rounded crown.
      let rad = 1.25 - 0.55 * t - 0.3 * Math.max(0, t - 0.75) * 4 + 0.35 * Math.max(0, 0.25 - t) * 4;
      rad *= 1 + 0.22 * Math.sin(2 * a + ph[0] + t * 3) + 0.14 * Math.sin(3 * a + ph[1] - t * 2) + 0.07 * Math.sin(7 * a + ph[2]);
      rad *= 1 + 0.16 * fbm(a * 1.3 + variant * 3, y * 2.6, 3) - 0.18 * Math.exp(-((Math.cos(a - notch) - 1) ** 2) * 40) * (0.4 + t);
      rad -= 0.045 * Math.abs(Math.sin(y * 11 + ph[3] + 0.6 * Math.sin(a * 2)));          // ledges
      rad = Math.max(0.04, rad) * (t > 0.97 ? 0.08 : 1);
      const top = t > 0.8 ? slant * Math.cos(a) * (t - 0.8) * 2 : 0;
      pos.push(Math.cos(a) * rad + lean * t * t, Math.min(y, 0.99) + top + (t > 0.85 ? 0.05 * fbm(a * 2, 1.3, 2) : 0), Math.sin(a) * rad * squash);
    }
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < R; i++) {
    const a = j * (R + 1) + i, b = a + R + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  stackGeos[variant] = g;
  return g;
}

// Sea stacks: [{x, z, s (base radius m), h (height above water m), ry?}]. Rock texture, dark wet
// band at the waterline, pale bird-whitened tops. Returns the meshes.
export function seaStacks(group, list, {color = 0x857b6e, seaLevel = 0, variants = 3, cast = true} = {}) {
  if (!list.length) return [];
  const mat = new THREE.MeshStandardMaterial({color, roughness: 0.9});
  worldDetail(mat, {set: 'rock_cliff', mode: 'triplanar', scale: 6, macro: 22, strength: 1, colorMix: 0.3, normalScale: 1.3, fade: 500});
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, rr) => {
    prev(sh, rr);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float wetK = 1.0 - smoothstep(${(seaLevel + 0.3).toFixed(2)}, ${(seaLevel + 2.6).toFixed(2)}, vqW.y);
        diffuseColor.rgb *= 1.0 - 0.5 * wetK; roughnessFactor = mix(roughnessFactor, 0.3, wetK);
        float top = smoothstep(0.5, 0.85, vqWN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.44, 0.3), top * 0.55);
        float guano = smoothstep(0.62, 0.7, texture2D(vqNoise, vqW.xz * 0.05).r) * smoothstep(0.2, 0.6, vqWN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.8), guano * 0.6); }`);
  };
  const pk = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => pk() + '-stack';
  const out = [];
  for (let v = 0; v < variants; v++) {
    const pts = list.filter((_, i) => i % variants === v);
    if (!pts.length) continue;
    const m = pts.map(k => new THREE.Matrix4().compose(V3(k.x, seaLevel - 0.5, k.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k.ry ?? (k.x * 0.37) % 6.28, 0)), V3(k.s, k.h, k.s)));
    out.push(...instancedChunks(group, seaStackGeometry(v), mat, m, {cell: 600, cast}));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fog bank / cloud sprites sitting on the horizon.
export function cloudBank(group, {count = 60, x0 = -4000, x1 = 7000, z0 = 1600, z1 = 6800, y0 = 30, y1 = 210, seed = 8, opacity = 0.85} = {}) {
  const r = rng(seed);
  const mats = [cloudTexture(5), cloudTexture(9), cloudTexture(14)].map(t => new THREE.SpriteMaterial({map: t, transparent: true, opacity, depthWrite: false, fog: true}));
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mats[i % 3]), far = r();
    s.position.set(x0 + r() * (x1 - x0), y0 + far * (y1 - y0) * 0.75 + r() * (y1 - y0) * 0.25, z0 + far * (z1 - z0));
    s.scale.set(700 + r() * 1300, 160 + r() * 260, 1);
    group.add(s);
  }
}

// Large soaring birds (condors, hawks) circling a point. Returns update(wall).
export function soaringBirds(group, list) {
  const dark = new THREE.MeshStandardMaterial({color: 0x1d1b1a, roughness: 0.8, side: THREE.DoubleSide});
  const patch = new THREE.MeshStandardMaterial({color: 0xe9e4d9, roughness: 0.8, side: THREE.DoubleSide});
  const birds = list.map((b, k) => {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), dark); body.rotation.z = Math.PI / 2; bird.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({color: b.head ?? 0xd9826a})); head.position.x = 0.85; bird.add(head);
    const wings = [-1, 1].map(s => {
      const shape = new THREE.Shape(); shape.moveTo(0.3, 0); shape.lineTo(-0.2, 0); shape.lineTo(-0.5, 1.4); shape.lineTo(-0.3, 2.9); shape.lineTo(0.15, 2.7); shape.lineTo(0.35, 1.2); shape.closePath();
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), dark);
      if (b.patches !== false) { const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.6), patch); pm.position.set(-0.1, 1.4, -0.01); wing.add(pm); }
      wing.rotation.x = s * Math.PI / 2; const pivot = new THREE.Group(); pivot.add(wing); pivot.userData.side = s; bird.add(pivot);
      return pivot;
    });
    bird.scale.setScalar(b.scale ?? 2.2);
    group.add(bird);
    return {bird, wings, ...b, phase: b.phase ?? k * 2.4};
  });
  return wall => {
    for (const c of birds) {
      const a = wall * c.speed + c.phase;
      c.bird.position.set(c.cx + Math.cos(a) * c.radius, c.height + Math.sin(a * 0.7) * 12, c.cz + Math.sin(a) * c.radius);
      c.bird.rotation.set(0.35, -a, 0.35);
      const flap = Math.sin(wall * 1.3 + c.phase) * 0.08;
      c.wings.forEach(w => { w.rotation.x = w.userData.side * flap; });
    }
  };
}
