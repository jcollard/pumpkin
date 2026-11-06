// Pumpkin models posed from the game's precomputed race frames.
// The 3D view never changes a result: every position and rotation comes from
// physics.js frames. Effects after a pumpkin's race ends (coasting past the
// finish, shattering, falling) are decoration only.
//
// Model frame: the pumpkin rolls about +Z (across the track), the stem points
// to +Y. The outline in the rolling plane (XY) is exactly the game's shape: a
// circle, or P.shapeRadius() for lumpy builds. Lobes, dimples and bumps only
// indent the surface away from z = 0, and the width across the track (Z) is
// free, so each variety can be squat or round without changing the physics.
import * as THREE from 'three';
import * as P from './physics.js';
import {rng} from './noise.js';

export const TEAM_COLORS = ['#ff9a3c', '#4fb3ff', '#8fe388', '#ff6b6b', '#c79bff', '#ffd84d', '#4ee6d0', '#ff8fd8'];

// --- Variety looks (visual only) ---
// ribs must be even so a lobe crest lies on both halves of the rolling plane.
const LOOKS = [
  { // Howden: classic orange jack-o'-lantern, deep regular ribs.
    ribs: 10, depth: 0.085, round: 0.55, sz: 1.02, shoulder: 0.06, dimple: 0.085,
    albedo: '#cf5a10', crest: '#e87a20', crease: '#7a2c06', tint: '#7a6a1c', tintAmt: 0.1, stemTint: 0.22, mottle: 0.06,
    fleck: [255, 236, 190], scab: 0, rough: 0.55, flesh: '#d8650c',
    stem: ['#3f4a22', '#62592f', '#a39270'],
  },
  { // Jarrahdale: slate blue-grey, fat lobes, a little squat.
    ribs: 10, depth: 0.12, round: 0.42, sz: 1.1, shoulder: 0.12, dimple: 0.11,
    albedo: '#57676e', crest: '#71838b', crease: '#2a363c', tint: '#67745c', tintAmt: 0.14, stemTint: 0.25, mottle: 0.08,
    fleck: [235, 245, 240], scab: 0.15, rough: 0.7, flesh: '#dc7410',
    stem: ['#8a8461', '#aa9f7c', '#c9bd9a'],
  },
  { // Provence (Musquee de Provence): ochre-tan, deeply lobed and squat.
    ribs: 12, depth: 0.15, round: 0.45, sz: 1.24, shoulder: 0.16, dimple: 0.12,
    albedo: '#8e6838', crest: '#ab8450', crease: '#4a3418', tint: '#625c32', tintAmt: 0.42, stemTint: 0.45, mottle: 0.08,
    fleck: [250, 230, 196], scab: 0.5, rough: 0.66, flesh: '#d46a0e',
    stem: ['#4e5228', '#6e6038', '#a8946c'],
  },
];
const lookOf = p => LOOKS[p.v] ?? LOOKS[0];
const lin = hex => new THREE.Color(hex); // Color.set converts sRGB hex to the linear working space

// --- Small deterministic 3D value noise for colour and bumps ---
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm3 = (x, y, z, o = 3) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * noise3(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / n; };
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Surface of a pumpkin along a unit direction (x, y, z) of the base sphere.
// Returns the radial scale k (applied to x, y, z) and the Z stretch, plus
// shading terms. k <= R(theta) everywhere and k == R(theta) on z = 0.
function surfaceAt(p, L, x, y, z, seed) {
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = Math.atan2(z, x);
  const gn = (p.gn || 0) / 16;
  const depth = L.depth + 0.09 * gn;
  // Round lobes with narrow, U-shaped creases (the small epsilon blunts the cusp so creases don't read as black seams).
  const cr = Math.abs(Math.cos(L.ribs * phi / 2)), e = 0.07, cu = (Math.sqrt(cr * cr + e * e) - e) / (Math.sqrt(1 + e * e) - e);
  const crest = Math.pow(cu, L.round * (1 - 0.35 * gn)); // 1 on a crest, 0 in a crease
  const crease = 1 - crest;
  let k = 1 - depth * crease * Math.pow(ring, 0.6);
  // Stem and blossom dimples: narrow along X (under the stem), wide across Z. Never on the rolling plane.
  const off = smoothstep(0, 0.22, Math.abs(Math.sin(phi)));
  const dTop = y > 0 ? L.dimple * Math.exp(-(x * x) / 0.026 - (z * z) / 0.13) : 0;
  const dBot = y < 0 ? 0.45 * L.dimple * Math.exp(-(x * x) / 0.016 - (z * z) / 0.07) : 0;
  k *= 1 - (dTop + dBot) * off;
  // Gentle bumps, fading to nothing at the rolling plane.
  const bump = fbm3(x * 2.6 + seed * 0.013, y * 2.6, z * 2.6 + 3.1, 2);
  k *= 1 - 0.022 * bump * smoothstep(0.02, 0.3, Math.abs(z));
  // Lumpy builds: the game's own outline in the rolling plane.
  if (p.s < 99.999) k *= P.shapeRadius(p.s, Math.atan2(-y, x), p.seed);
  const sz = L.sz * (1 + L.shoulder * y * y);
  return {k, sz, crease, crest, ring, dTop, dBot};
}

const geoCache = new Map();
function pumpkinGeometry(p, half = false) {
  const L = lookOf(p);
  const key = [p.v, p.s, p.seed, p.gn || 0, half].join('|');
  if (geoCache.has(key)) return geoCache.get(key);
  const W = L.ribs * 10, H = 64, seed = p.seed * 31 + p.v * 977;
  // The half model keeps the far side (z <= 0); its cut edge is the rolling-plane outline.
  const g = half ? new THREE.SphereGeometry(1, W / 2, H, Math.PI, Math.PI) : new THREE.SphereGeometry(1, W, H);
  if (half) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + uv.getX(i) * 0.5); }
  const pos = g.attributes.position, n = pos.count, colors = new Float32Array(n * 3);
  const base = lin(L.albedo), crestC = lin(L.crest), creaseC = lin(L.crease), tintC = lin(L.tint), scarC = lin('#5a4428');
  const c = new THREE.Color(), r = rng(seed + 5);
  const tintSeed = r() * 100, greenStem = r() < 0.5 ? 1 : 0.4;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = surfaceAt(p, L, x, y, z, seed);
    pos.setXYZ(i, x * s.k, y * s.k, z * s.k * s.sz);
    // Colour: lighter lobe tops, dark creases, patchy tints, mottling, darker dimple.
    c.copy(base).lerp(crestC, Math.pow(s.crest, 2.5) * 0.55 * Math.min(1, s.ring * 1.4));
    c.lerp(creaseC, Math.pow(s.crease, 2) * (0.5 + 0.35 * (p.gn || 0) / 16) * Math.min(1, s.ring * 2 + 0.3));
    const patch = smoothstep(0.46, 0.74, fbm3(x * 1.8 + tintSeed, y * 1.8, z * 1.8, 3));
    const nearStem = Math.max(0, y) ** 6;
    c.lerp(tintC, Math.min(0.85, L.tintAmt * patch + L.stemTint * nearStem * greenStem + L.tintAmt * 0.4 * Math.pow(s.crease, 2)));
    c.multiplyScalar(1 + L.mottle * (fbm3(x * 5 + 11, y * 5, z * 5, 2) * 2 - 1));
    c.multiplyScalar(1 - 0.35 * Math.min(1, s.dTop / L.dimple) * smoothstep(0.85, 1, y));
    if (y < 0) c.lerp(scarC, 0.85 * Math.exp(-(x * x + z * z) / 0.0035));
    colors[i * 3] = c.r * 1.18; colors[i * 3 + 1] = c.g * 1.18; colors[i * 3 + 2] = c.b * 1.18; // map averages ~0.85
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  weldNormals(g);
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// Average the normals of vertices that share a position (UV seam, poles).
function weldNormals(g) {
  const pos = g.attributes.position, nrm = g.attributes.normal, groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let a = groups.get(k); if (!a) groups.set(k, a = []); a.push(i);
  }
  const v = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.x += nrm.getX(i), v.y += nrm.getY(i), v.z += nrm.getZ(i);
    v.normalize();
    for (const i of list) nrm.setXYZ(i, v.x, v.y, v.z);
  }
}

// --- Skin detail maps (colour multiplier + normal map), cached per variety and seed ---
function periodicGrid(pu, pv, seed) {
  const r = rng(seed), grid = new Float32Array(pu * (pv + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  return (u, v) => { // u wraps with period pu, v is clamped
    const x = u, y = Math.min(pv - 1e-6, Math.max(0, v)), xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const i0 = ((xi % pu) + pu) % pu, i1 = (i0 + 1) % pu;
    const a = grid[yi * pu + i0], b = grid[yi * pu + i1], c = grid[(yi + 1) * pu + i0], d = grid[(yi + 1) * pu + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const mapCache = new Map();
function skinMaps(p, L) {
  const key = `${p.v}|${p.seed}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const Wd = 1024, Ht = 512, seed = p.seed * 13 + p.v * 101 + 7;
  const streakA = periodicGrid(140, 3, seed), streakB = periodicGrid(300, 6, seed + 1);
  const bumpA = periodicGrid(48, 24, seed + 2), bumpB = periodicGrid(110, 55, seed + 3);
  const scabN = periodicGrid(36, 18, seed + 4), netN = periodicGrid(70, 35, seed + 5), fleckN = periodicGrid(420, 210, seed + 6);
  const h = new Float32Array(Wd * Ht);
  const col = document.createElement('canvas'); col.width = Wd; col.height = Ht;
  const cctx = col.getContext('2d'), cimg = cctx.createImageData(Wd, Ht), cd = cimg.data;
  for (let y = 0; y < Ht; y++) {
    const v = y / Ht, pole = smoothstep(0, 0.07, v) * smoothstep(1, 0.93, v);
    for (let x = 0; x < Wd; x++) {
      const u = x / Wd;
      const st = 0.65 * streakA(u * 140, v * 3) + 0.35 * streakB(u * 300, v * 6);           // fine ribbing along the lobes
      const bm = 0.65 * bumpA(u * 48, v * 24) + 0.35 * bumpB(u * 110, v * 55);
      const sc = L.scab ? smoothstep(0.62, 0.72, scabN(u * 36, v * 18)) * L.scab : 0;      // corky scabs (Provence)
      const net = L.scab ? Math.max(0, 1 - Math.abs(netN(u * 70, v * 35) - 0.5) / 0.03) * L.scab * 0.7 : 0;
      const fl = fleckN(u * 420, v * 210);
      h[y * Wd + x] = pole * (0.25 * st + 0.75 * bm + 0.25 * sc);
      // Colour multiplier (linear data, ~0.85 average): pale streaks and flecks, corky buff scabs.
      let m = 0.84 + 0.035 * (st - 0.5) * pole + 0.06 * (bm - 0.5);
      let rr = m, gg = m, bb = m;
      const fleck = pole * smoothstep(0.78, 0.86, fl) * 0.18;
      rr += (L.fleck[0] / 255 - rr) * fleck; gg += (L.fleck[1] / 255 - gg) * fleck; bb += (L.fleck[2] / 255 - bb) * fleck;
      const cork = pole * Math.min(1, sc * 0.45 + net * 0.25);
      rr += (0.98 - rr) * cork; gg += (0.9 - gg) * cork; bb += (0.78 - bb) * cork;
      const i = (y * Wd + x) * 4;
      cd[i] = Math.min(255, rr * 255); cd[i + 1] = Math.min(255, gg * 255); cd[i + 2] = Math.min(255, bb * 255); cd[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  const nrm = document.createElement('canvas'); nrm.width = Wd; nrm.height = Ht;
  const nctx = nrm.getContext('2d'), nimg = nctx.createImageData(Wd, Ht), nd = nimg.data, S = 5;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
    const xl = (x + Wd - 1) % Wd, xr = (x + 1) % Wd, yu = Math.max(0, y - 1), ydn = Math.min(Ht - 1, y + 1);
    const dx = (h[y * Wd + xr] - h[y * Wd + xl]) * S, dy = (h[ydn * Wd + x] - h[yu * Wd + x]) * S;
    const len = Math.hypot(dx, dy, 1), i = (y * Wd + x) * 4;
    nd[i] = (-dx / len * 0.5 + 0.5) * 255; nd[i + 1] = (dy / len * 0.5 + 0.5) * 255; nd[i + 2] = (1 / len * 0.5 + 0.5) * 255; nd[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0);
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; return t; };
  const out = {map: mk(col), normalMap: mk(nrm)};
  mapCache.set(key, out);
  return out;
}

// --- Stem: woody, curved, ribbed, with a flared base that hugs the dimple ---
function stemGeometry(p = {seed: 0, v: 0}) {
  const L = lookOf(p), r = rng(p.seed * 7 + p.v * 3 + 11);
  const bend = r() * Math.PI * 2, lean = 0.6 + r() * 0.6, len = 0.9 + r() * 0.35;
  const bx = Math.cos(bend), bz = Math.sin(bend);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.84, 0), new THREE.Vector3(0, 0.98, 0),
    new THREE.Vector3(0.025 * lean * bx, 1.0 + 0.12 * len, 0.025 * lean * bz),
    new THREE.Vector3(0.08 * lean * bx, 1.0 + 0.22 * len, 0.08 * lean * bz),
    new THREE.Vector3(0.16 * lean * bx, 1.0 + 0.27 * len, 0.16 * lean * bz),
  ]);
  const NS = 30, NA = 36, ridges = 5 + (r() < 0.5 ? 1 : 0), twist = (r() - 0.5) * 1.2;
  let Nv = new THREE.Vector3(1, 0, 0), prevT = curve.getTangentAt(0); // parallel-transported frame: no twist jumps
  const pos = [], col = [], idx = [];
  const c0 = lin(L.stem[0]), c1 = lin(L.stem[1]), c2 = lin(L.stem[2]), cc = new THREE.Color(), dark = lin('#2e2414');
  const zStretch = L.sz * (1 + L.shoulder);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, ctr = curve.getPointAt(t), T = curve.getTangentAt(t);
    Nv.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(prevT, T)).normalize(); prevT = T;
    const flare = 1 - smoothstep(0.08, 0.42, t);
    const rad = 0.062 + 0.17 * flare * flare + 0.012 * smoothstep(0.85, 1, t);
    const amp = 0.1 + 0.28 * flare;
    const N = Nv, B = new THREE.Vector3().crossVectors(Nv, T).normalize();
    for (let j = 0; j <= NA; j++) {
      const a = j / NA * Math.PI * 2;
      const rib = Math.pow(0.5 + 0.5 * Math.cos(ridges * a + twist * t * 6), 1.6);
      const knob = 1 + 0.05 * (hash3(i, j % NA, p.seed) - 0.5) * flare;
      const rr = rad * (1 - amp * 0.5 + amp * rib) * knob;
      const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
      let px = ctr.x + N.x * ox + B.x * oz, py = ctr.y + N.y * ox + B.y * oz, pz = ctr.z + N.z * ox + B.z * oz;
      pz *= 1 + (zStretch - 1) * flare * flare; // follow the wider dimple across the track
      py -= 0.05 * flare * flare * Math.min(1, (px * px + pz * pz) / 0.04); // flare spreads down onto the skin
      pos.push(px, py, pz);
      cc.copy(c0).lerp(c1, smoothstep(0.1, 0.6, t)).lerp(c2, smoothstep(0.75, 1, t));
      cc.multiplyScalar(0.72 + 0.4 * rib).lerp(dark, 0.25 * (1 - rib) * (1 - flare * 0.5));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + NA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Cut end: a slightly domed, pale, dry cap.
  const tip = curve.getPointAt(1), tan = curve.getTangentAt(1), capC = lin('#c9b48a'), base0 = NS * (NA + 1);
  const centre = pos.length / 3;
  pos.push(tip.x + tan.x * 0.012, tip.y + tan.y * 0.012, tip.z + tan.z * 0.012); col.push(capC.r * 0.9, capC.g * 0.9, capC.b * 0.9);
  for (let j = 0; j < NA; j++) idx.push(base0 + j, base0 + j + 1, centre);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- Materials ---
function treadRings(p, L) {
  if (!p.ga) return null;
  const k = Math.min(1, p.ga / 16), n = Math.min(4, Math.max(1, Math.ceil(p.ga / 4))), list = [];
  for (let i = 0; i < n; i++) { const z = (0.15 + i * 0.14) * L.sz; list.push(z, -z); }
  while (list.length < 8) list.push(99);
  return {rings: list, depth: 0.012 + 0.03 * k, width: (0.018 + 0.014 * k) * L.sz, dark: 0.62 - 0.32 * k};
}

function materialFor(p, variety) {
  const L = lookOf(p), {map, normalMap} = skinMaps(p, L);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: L.rough, metalness: 0, sheen: 0.12, sheenRoughness: 0.7, sheenColor: lin(L.crest).multiplyScalar(0.5), envMapIntensity: 1.1,
  });
  if (p.en) { // natural coat: a waxy satin sheen that grows with the level
    const k = Math.min(1, p.en / 16);
    m.roughness = L.rough - 0.3 * k; m.clearcoat = 0.12 + 0.55 * k; m.clearcoatRoughness = 0.5 - 0.22 * k;
    m.sheen = 0.15 + 0.25 * k; m.sheenRoughness = 0.45; m.sheenColor = lin('#fff1d6').multiplyScalar(0.35);
  }
  if (p.ea) { // artificial coat: glossy lacquer, iridescence grows with the level
    const k = Math.min(1, p.ea / 16);
    m.roughness = 0.5 - 0.22 * k; m.clearcoat = 0.4 + 0.6 * k; m.clearcoatRoughness = 0.16 - 0.13 * k; m.sheen = 0;
    // Thin films below ~300 nm shift reflections towards cool blue-green without tinting the skin itself.
    m.iridescence = 0.1 + 0.55 * k; m.iridescenceIOR = 1.35; m.iridescenceThicknessMinimum = 120; m.iridescenceThicknessMaximum = 260 + 160 * k;
    m.envMapIntensity = 1.15 + 0.9 * k;
    m.sheen = 0.1 + 0.4 * k; m.sheenRoughness = 0.3; m.sheenColor = lin('#a8c4ff').multiplyScalar(0.25 + 0.35 * k); // cool lacquer rim
  }
  const tread = treadRings(p, L);
  if (tread) {
    m.onBeforeCompile = sh => {
      sh.uniforms.pkRings = {value: tread.rings}; sh.uniforms.pkRingW = {value: tread.width}; sh.uniforms.pkRingD = {value: tread.depth}; sh.uniforms.pkDark = {value: tread.dark};
      sh.vertexShader = 'varying vec3 vPkObj;\nvarying vec3 vPkAxis;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvPkObj = position;\nvPkAxis = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);');
      sh.fragmentShader = `uniform float pkRings[8];\nuniform float pkRingW;\nuniform float pkRingD;\nuniform float pkDark;\nvarying vec3 vPkObj;\nvarying vec3 vPkAxis;
float pkTread(float z, out float slope) {
  float g = 0.0; slope = 0.0;
  for (int i = 0; i < 8; i++) {
    float d = (z - pkRings[i]) / pkRingW, d2 = d * d, e = exp(-d2 * d2);
    g += e; slope += -4.0 * d2 * d * e / pkRingW;
  }
  return min(g, 1.0);
}\n` + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat pkSlope;\nfloat pkG = pkTread(vPkObj.z, pkSlope);\ndiffuseColor.rgb *= mix(1.0, pkDark, pkG);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.78, pkG);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 pkAx = vPkAxis - normal * dot(normal, vPkAxis); normal = normalize(normal + pkAx * pkSlope * pkRingD); }');
    };
    m.customProgramCacheKey = () => 'pumpkin-tread';
  }
  return m;
}

// --- Name tag ---
function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.font = '600 38px "IBM Plex Mono", ui-monospace, monospace';
  const w = Math.min(504, ctx.measureText(name).width + 62), x0 = (512 - w) / 2;
  ctx.fillStyle = 'rgba(16,20,19,.74)'; ctx.beginPath(); ctx.roundRect(x0, 12, w, 56, 28); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + 29, 40, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(name, x0 + 48, 42, w - 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const _n = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion();
const LABEL_W = 0.1728, LABEL_H = 0.027, TAN25 = Math.tan(25 * Math.PI / 180), _camPos = new THREE.Vector3();

// --- Reusable model: the pumpkin at real size, centred on the origin, stem up (+Y), rolling about +Z ---
// cutaway: remove the near (+Z) half to show the shell at its true thickness, the cavity and the core.
export function buildPumpkinModel(p, {cutaway = false} = {}) {
  const L = lookOf(p), radius = p.d / 200, group = new THREE.Group(), unit = new THREE.Group();
  group.name = 'pumpkin'; unit.name = 'pumpkin-unit';
  unit.scale.setScalar(radius); group.add(unit);
  const material = materialFor(p, P.varietyOf(p));
  const body = new THREE.Mesh(pumpkinGeometry(p, cutaway), material);
  body.castShadow = body.receiveShadow = true;
  const tipY = p.s < 99.999 ? P.shapeRadius(p.s, -Math.PI / 2, p.seed) : 1;
  const stem = new THREE.Mesh(stemGeometry(p), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.88, metalness: 0}));
  stem.position.y = tipY - 1; stem.castShadow = true; stem.receiveShadow = true;
  unit.add(body, stem);
  if (cutaway) unit.add(...cutawayParts(p, L));
  group.userData = {body, stem, material, radius, variety: P.varietyOf(p)};
  return group;
}

// Inside of the cutaway (unit radius = 1): inner wall, cut face ring, core.
function cutawayParts(p, L) {
  const pr = P.properties(p), R = pr.radius, seed = p.seed * 31 + p.v * 977, r = rng(seed + 99);
  const tu = Math.min(0.97, (p.t / 100) / R), innerU = pr.innerRadius / R, parts = [];
  const flesh = lin(L.flesh), fleshCut = lin(L.flesh).lerp(lin('#f09a2a'), 0.35), rind = lin(L.crease), skin = lin(L.albedo), cavity = lin('#b8661c');
  // Inner wall of the cavity (seen from inside: BackSide of an outward-facing surface).
  const W = L.ribs * 5, H = 40, g = new THREE.SphereGeometry(1, W, H, Math.PI, Math.PI), pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), s = surfaceAt(p, L, x, y, z, seed);
    const k = Math.max(0.01, s.k - tu);
    pos.setXYZ(i, x * k, y * k, z * k * s.sz);
    c.copy(cavity).lerp(flesh, 0.5 + 0.5 * fbm3(x * 6, y * 6, z * 6, 2)).multiplyScalar(0.8 + 0.25 * noise3(x * 14, y * 40, z * 14));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.75, side: THREE.BackSide}));
  wall.receiveShadow = true; parts.push(wall);
  // Cut face: the shell ring in the rolling plane at the true thickness, a thin rind on the outside.
  const N = 160, rp = [], rc = [], ri = [], rindW = Math.min(0.025, tu * 0.25);
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, x = Math.cos(a), y = Math.sin(a), k = surfaceAt(p, L, x, y, 0, seed).k;
    for (const [rr, cc] of [[k, rind], [k - rindW, skin.clone().lerp(fleshCut, 0.7)], [k - rindW * 1.6, fleshCut], [Math.max(0.01, k - tu), flesh]]) {
      rp.push(x * rr, y * rr, 0.0005); rc.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) {
    const a = i * 4 + j, b = a + 4;
    ri.push(a + 1, a, b, a + 1, b, b + 1);
  }
  const ring = new THREE.BufferGeometry();
  ring.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); ring.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  ring.setIndex(ri); ring.computeVertexNormals();
  parts.push(new THREE.Mesh(ring, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.7, side: THREE.DoubleSide})));
  // Core, as the game models it: a centred ball of radius coreRadius (seeds + pulp for natural levels, steel for artificial).
  const coreU = pr.coreRadius / R, steelU = p.ca ? innerU * Math.cbrt(p.ca / 16) : 0;
  if (steelU > 0) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(steelU, 40, 28), new THREE.MeshStandardMaterial({color: 0xd5d9de, metalness: 1, roughness: 0.12, envMapIntensity: 1.4}));
    ball.castShadow = ball.receiveShadow = true; parts.push(ball);
  }
  if (p.cn) {
    // Pulp: a fibrous half ball (flat on the cut plane) wrapping any steel, with seeds on and in it.
    const pg = new THREE.IcosahedronGeometry(1, 4), pp = pg.attributes.position, pc = new Float32Array(pp.count * 3), pulpC = lin(L.flesh).lerp(lin('#e8902a'), 0.3);
    for (let i = 0; i < pp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pp, i), k = coreU * (0.88 + 0.22 * fbm3(v.x * 3 + 7, v.y * 3, v.z * 3, 3));
      const zz = Math.min(0, v.z * k);
      pp.setXYZ(i, v.x * k, v.y * k, zz);
      c.copy(pulpC).multiplyScalar(0.7 + 0.45 * noise3(v.x * 9, v.y * 22, v.z * 9));
      pc.set([c.r, c.g, c.b], i * 3);
    }
    pg.setAttribute('color', new THREE.BufferAttribute(pc, 3)); pg.computeVertexNormals();
    const pulp = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.45}));
    pulp.castShadow = pulp.receiveShadow = true; parts.push(pulp);
    // Fibrous strands from the pulp to the cavity wall.
    const strands = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, z = -r() * coreU * 0.6, from = new THREE.Vector3(Math.cos(a) * coreU * 0.8, Math.sin(a) * coreU * 0.8, z);
      const to = new THREE.Vector3(Math.cos(a + (r() - 0.5) * 0.5), Math.sin(a + (r() - 0.5) * 0.5), 0).multiplyScalar(Math.max(coreU, innerU * 0.97)).setZ(z * 1.4);
      const d = to.clone().sub(from), len = d.length();
      if (len < 0.02) continue;
      const cg = new THREE.CylinderGeometry(0.006 + r() * 0.008, 0.012 + r() * 0.01, len, 5, 1, true);
      cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      cg.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      strands.push(cg);
    }
    if (strands.length) parts.push(new THREE.Mesh(mergeGeos(strands), new THREE.MeshStandardMaterial({color: pulpC, roughness: 0.5})));
    // Seeds: on the cut face of the pulp (outside the steel) and around its back.
    const n = 24 + p.cn * 7, seedS = 0.011 / R, list = [];
    for (let i = 0; i < n && list.length < n; i++) {
      const face = i % 3 !== 2, m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(seedS, seedS, seedS);
      if (face) {
        const rr = steelU + 0.01 + Math.sqrt(r()) * Math.max(0.01, coreU * 0.95 - steelU - 0.01), a = r() * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + (r() - 0.5)));
        m.compose(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.002 + seedS * 0.15), q, sc);
      } else {
        const v = new THREE.Vector3(r() - 0.5, r() - 0.5, -r()).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6));
        m.compose(v.multiplyScalar(coreU * 1.0), q, sc);
      }
      list.push(m);
    }
    const seeds = new THREE.InstancedMesh(seedGeometry(), new THREE.MeshStandardMaterial({color: lin('#dcc897'), roughness: 0.45}), list.length);
    list.forEach((m, i) => seeds.setMatrixAt(i, m));
    seeds.castShadow = true; parts.push(seeds);
  }
  return parts;
}

function mergeGeos(list) { // small local merge (non-indexed, position + normal)
  const flat = list.map(g => g.index ? g.toNonIndexed() : g);
  const count = flat.reduce((n, g) => n + g.attributes.position.count, 0), pos = new Float32Array(count * 3);
  let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
  return out;
}

// --- Shattered shell pieces ---
// A curved patch of the pumpkin's own shell: skin outside, flesh inside and on the broken edges.
function shardGeometry(p, L, rand, thick) {
  const c = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  const t1 = new THREE.Vector3().crossVectors(c, Math.abs(c.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(c, t1);
  const nv = 5 + Math.floor(rand() * 3), size = 0.26 + rand() * 0.26;
  const outline = Array.from({length: nv}, (_, k) => ({a: (k + 0.2 + rand() * 0.6) / nv * Math.PI * 2, r: size * (0.55 + rand() * 0.6)}));
  const skin = lin(L.albedo), creaseC = lin(L.crease), flesh = lin(L.flesh), edge = lin(L.flesh).lerp(lin('#ffd08a'), 0.35);
  const seed = p.seed * 31 + p.v * 977, pos = [], col = [], idx = [];
  const point = (dir, inner) => {
    const s = surfaceAt(p, L, dir.x, dir.y, dir.z, seed), k = s.k * (inner ? 1 - thick : 1);
    return {v: new THREE.Vector3(dir.x * k, dir.y * k, dir.z * k * s.sz), s};
  };
  const dirAt = (o, f) => new THREE.Vector3().copy(c).addScaledVector(t1, Math.cos(o.a) * o.r * f).addScaledVector(t2, Math.sin(o.a) * o.r * f).normalize();
  const rings = [0, 0.5, 1];
  for (const inner of [false, true]) { // two surfaces: centre + 2 rings
    const start = pos.length / 3;
    for (const f of rings) {
      const list = f === 0 ? [outline[0]] : outline;
      for (const o of list) {
        const {v, s} = point(dirAt(o, f), inner);
        pos.push(v.x, v.y, v.z);
        const cc = inner ? flesh.clone().multiplyScalar(0.9 + 0.2 * rand()) : skin.clone().lerp(creaseC, Math.pow(s.crease, 1.6) * 0.7);
        col.push(cc.r, cc.g, cc.b);
      }
    }
    const tri = (a, b, d) => inner ? idx.push(start + a, start + d, start + b) : idx.push(start + a, start + b, start + d);
    for (let k = 0; k < nv; k++) tri(0, 1 + k, 1 + (k + 1) % nv);
    for (let k = 0; k < nv; k++) {
      const a = 1 + k, b = 1 + (k + 1) % nv, a2 = 1 + nv + k, b2 = 1 + nv + (k + 1) % nv;
      tri(a, a2, b2); tri(a, b2, b);
    }
  }
  // Broken edges: separate vertices so they shade flat.
  const outerRim = k => 1 + nv + k, innerRim = k => 2 + 2 * nv + nv + k;
  const P3 = i => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let k = 0; k < nv; k++) {
    const k2 = (k + 1) % nv, quad = [P3(outerRim(k)), P3(outerRim(k2)), P3(innerRim(k2)), P3(innerRim(k))], s = pos.length / 3;
    for (const q of quad) { pos.push(q.x, q.y, q.z); col.push(edge.r, edge.g, edge.b); }
    idx.push(s, s + 2, s + 1, s, s + 3, s + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const centroid = new THREE.Vector3(pos[0], pos[1], pos[2]);
  g.translate(-centroid.x, -centroid.y, -centroid.z);
  g.computeVertexNormals();
  return {g, centroid, normal: c};
}

function seedGeometry() {
  const g = new THREE.SphereGeometry(1, 10, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // flat teardrop
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x * 0.55 * (1 - 0.3 * z), y * 0.16, z);
  }
  g.computeVertexNormals();
  return g;
}

function pulpGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), k = 0.7 + 0.5 * noise3(v.x * 2.2 + 5, v.y * 2.2, v.z * 2.2);
    p.setXYZ(i, v.x * k, v.y * k * 0.55, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

function splatTexture(seed, flesh) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'), r = rng(seed), col = flesh.clone().convertLinearToSRGB();
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 1.6) * 92, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, s = 10 + r() * 34 * (1 - d / 140);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(${rgb},${0.55 + r() * 0.3})`); gr.addColorStop(0.7, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,60,10,.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) { // stringy fibres
    const a = r() * Math.PI * 2, d0 = r() * 30, d1 = d0 + 20 + r() * 50;
    ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * d0, 128 + Math.sin(a) * d0);
    ctx.quadraticCurveTo(128 + Math.cos(a + 0.3) * (d0 + d1) / 2, 128 + Math.sin(a + 0.3) * (d0 + d1) / 2, 128 + Math.cos(a) * d1, 128 + Math.sin(a) * d1); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PumpkinView {
  constructor(scene, course, p, result, team, lane) {
    this.course = course; this.p = p; this.result = result; this.team = team; this.lane = lane;
    this.name = p.name.trim() || `Pumpkin ${team + 1}`;
    this.color = TEAM_COLORS[team % TEAM_COLORS.length];
    this.variety = P.varietyOf(p);
    this.look = lookOf(p);
    this.props = P.properties(p);
    this.radius = p.d / 200;
    this.frames = result.frames;
    this.last = this.frames.at(-1);
    this.end = result.time;

    // Scene graph: root (position) > squash (landing squish) > spin (rotation).
    this.root = new THREE.Group();
    this.squash = new THREE.Group();
    this.spin = new THREE.Group();
    this.root.add(this.squash); this.squash.add(this.spin);
    this.model = buildPumpkinModel(p);
    this.material = this.model.userData.material;
    this.spin.add(this.model);

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({map: nameTag(this.name, this.color), depthTest: false, transparent: true, sizeAttenuation: false}));
    this.label.scale.set(LABEL_W, LABEL_H, 1); this.label.renderOrder = 10; this.label.center.set(0.5, 0);
    this.label.onBeforeRender = (renderer, scene, cam) => { this.fitLabel(cam); this.label.updateMatrixWorld(); };
    this.root.add(this.label);
    scene.add(this.root);

    this.buildAfterlife(scene);
  }

  // What happens after the physics run ends.
  buildAfterlife(scene) {
    const last = this.last, r = this.result;
    this.after = {kind: 'stay'};
    const start = new THREE.Vector3(last.centerX, this.course.H0 + last.centerY, this.lane);
    if (r.status === 'DQ') {
      const spot = this.course.dqSpot ? this.course.dqSpot(this.team) : {x: -4 - this.team * 0.9, z: this.course.roadHalf + 2.2};
      const y = Math.max(this.course.terrainH(spot.x, spot.z), Math.abs(spot.z) <= this.course.roadHalf ? this.course.roadY(spot.x) : -1e9) + this.radius;
      this.after = {kind: 'dq', start: new THREE.Vector3(spot.x, y, spot.z)};
      this.end = -Infinity;
      return;
    }
    if (r.status === 'FINISHED') {
      this.after = {kind: 'coast', start, vx: Math.max(0.5, last.vx ?? last.v), lift: start.y - this.course.roadY(start.x), angle: last.angle};
    } else if (r.reason === 'MISSED BRIDGE') {
      // Ballistic fall into the canyon, then shatter where it hits.
      let t = 0, x = start.x, y = start.y;
      const vx = last.vx ?? last.v, vy = last.vy ?? 0;
      while (t < 12) { t += 0.01; x = start.x + vx * t; y = start.y + vy * t - 4.905 * t * t; if (y <= this.course.terrainH(x, this.lane) + this.radius) break; }
      this.after = {kind: 'fall', start, vx, vy, impactT: t, impact: new THREE.Vector3(x, y, this.lane), angle: last.angle};
      this.shards = this.makeShards(scene, new THREE.Vector3(vx * 0.4, 2, 0), last.angle + t * 6);
    } else if (r.status === 'BROKEN') {
      this.after = {kind: 'shatter', start};
      this.shards = this.makeShards(scene, new THREE.Vector3((last.vx ?? last.v) * 0.85, Math.max(0, last.vy ?? 0) * 0.3 + 1, 0), last.angle);
    }
  }

  // Broken shell pieces, pulp, seeds and a wet splat. Positions are a pure function of time since impact.
  makeShards(scene, baseV, angle = this.last.angle ?? 0) {
    const rand = rng(this.p.seed + 77 + this.team * 13), group = new THREE.Group(), pieces = [], L = this.look, R = this.radius;
    const g = 9.81, q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle);
    const thick = 0.09 + 0.05 * (this.p.t ?? 5) / 10;
    const shellMat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.55, side: THREE.DoubleSide});
    const landTime = (vy, y0) => (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * Math.max(0, y0)))) / g;
    for (let i = 0; i < 16; i++) {
      const {g: geo, centroid, normal} = shardGeometry(this.p, L, rand, thick);
      const m = new THREE.Mesh(geo, shellMat); m.castShadow = true; m.receiveShadow = true;
      m.scale.setScalar(R);
      const off = centroid.clone().applyQuaternion(q0).multiplyScalar(R), dir = normal.clone().applyQuaternion(q0);
      const v = baseV.clone().multiplyScalar(0.12 + 0.88 * rand() ** 1.5).addScaledVector(dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), 1.2 + rand() * 3.8);
      // Resting pose: lying on its back or its face, with a random heading.
      const up = rand() < 0.6 ? 1 : -1;
      const qRest = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, up, 0))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28));
      const pa = geo.attributes.position, tmp = new THREE.Vector3();
      let minY = 0;
      for (let k = 0; k < pa.count; k++) minY = Math.min(minY, tmp.fromBufferAttribute(pa, k).applyQuaternion(qRest).y);
      const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      pieces.push({m, off, v, q0, qRest, axis, w: 8 + rand() * 14, rest: -minY * R + 0.004, land: landTime(v.y, off.y + R)});
      group.add(m);
    }
    // Pulp: stringy wet chunks of flesh.
    const pulpN = 12, pulp = new THREE.InstancedMesh(pulpGeometry(), new THREE.MeshStandardMaterial({color: lin(L.flesh), roughness: 0.35}), pulpN);
    pulp.castShadow = true; pulp.receiveShadow = true; pulp.frustumCulled = false;
    const pulpBits = Array.from({length: pulpN}, () => {
      const dir = new THREE.Vector3(rand() - 0.5, rand() * 0.8 + 0.1, rand() - 0.5).normalize(), s = R * (0.08 + rand() * 0.12);
      return {s, off: dir.clone().multiplyScalar(R * 0.4), v: baseV.clone().multiplyScalar(0.1 + 0.6 * rand() ** 2).addScaledVector(dir, 1 + rand() * 3),
        rot: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6), yaw: rand() * 6.28};
    });
    group.add(pulp);
    // Seeds: flat cream teardrops. A natural core sprays lots of them.
    const seedN = this.p.cn ? 150 : 50;
    const seeds = new THREE.InstancedMesh(seedGeometry(), new THREE.MeshStandardMaterial({color: lin('#dcc897'), roughness: 0.5}), seedN);
    seeds.frustumCulled = false; seeds.receiveShadow = true;
    const seedBits = Array.from({length: seedN}, () => ({
      d: new THREE.Vector3(rand() - 0.5, rand() * 0.9, rand() - 0.5).normalize().multiplyScalar(this.p.cn ? 1 + rand() * 5 : 0.5 + rand() * 2.5),
      s: 0.011 + rand() * 0.005, yaw: rand() * 6.28, tilt: new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)}));
    group.add(seeds);
    this.seedsInst = {mesh: seeds, bits: seedBits};
    this.pulp = {mesh: pulp, bits: pulpBits};
    // Wet splat where it burst.
    const splat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({map: splatTexture(this.p.seed + this.team, lin(L.flesh)),
      transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4}));
    splat.receiveShadow = true; splat.renderOrder = 1;
    group.add(splat);
    this.splat = splat;
    // Core: steel ball keeps rolling.
    if (this.p.ca) {
      const rc = Math.max(0.03, this.props.coreRadius);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(rc, 24, 16), new THREE.MeshStandardMaterial({color: 0xc9ced3, metalness: 1, roughness: 0.18}));
      ball.castShadow = true; group.add(ball);
      this.ball = {m: ball, r: rc, v: Math.max(1, baseV.x)};
    }
    group.visible = false;
    scene.add(group);
    return {group, pieces};
  }

  // Pose for sim time t (seconds since the start; negative = waiting at the gate).
  update(t, camera) {
    const a = this.after;
    this.spin.visible = true; this.label.visible = true;
    if (t <= this.end) {
      const f = P.sampleSimulation(this.result, Math.max(0, t));
      this.root.position.set(f.centerX, this.course.H0 + f.centerY, this.lane);
      this.spin.rotation.z = -f.angle;
      const age = f.landingAt >= 0 ? f.t - f.landingAt : Infinity;
      const sq = age >= 0 && age < 1 ? this.variety.compression * Math.min(1, (f.landingSpeed || 0) / 2) * Math.exp(-age / (this.variety.contactDuration * 3)) : 0;
      this.squash.scale.set(1 / Math.sqrt(1 - sq), 1 - sq, 1 / Math.sqrt(1 - sq));
      this.squash.position.y = -this.radius * sq;
      this.state = {x: f.centerX, v: f.v, air: !f.contact && f.height > 0.05, dur: f.dur, done: false};
      if (this.shards) this.shards.group.visible = false;
    } else {
      const dt = t - this.end;
      this.squash.scale.set(1, 1, 1); this.squash.position.y = 0;
      if (a.kind === 'coast') {
        const tau = 2.6, x = a.start.x + a.vx * tau * (1 - Math.exp(-dt / tau));
        this.root.position.set(x, this.course.roadY(x) + a.lift, this.lane);
        this.spin.rotation.z = -(a.angle + (x - a.start.x) / this.radius);
        this.state = {x, v: a.vx * Math.exp(-dt / tau), air: false, dur: this.last.dur, done: true};
      } else if (a.kind === 'dq') {
        this.root.position.copy(a.start); this.spin.rotation.z = 0;
        this.state = {x: 0, v: 0, air: false, dur: 100, done: true, dq: true};
      } else if (a.kind === 'fall' && dt < a.impactT) {
        this.root.position.set(a.start.x + a.vx * dt, a.start.y + a.vy * dt - 4.905 * dt * dt, this.lane);
        this.spin.rotation.z = -(a.angle + dt * 6);
        this.state = {x: this.root.position.x, v: Math.hypot(a.vx, a.vy - 9.81 * dt), air: true, dur: this.last.dur, done: true};
      } else if (a.kind === 'fall' || a.kind === 'shatter') {
        const at = a.kind === 'fall' ? a.impact : a.start, since = a.kind === 'fall' ? dt - a.impactT : dt;
        this.root.position.copy(at); this.spin.visible = false; this.label.visible = since < 2.5;
        this.updateShards(at, since);
        this.state = {x: at.x, v: 0, air: false, dur: 0, done: true};
      } else {
        this.root.position.set(this.last.centerX, this.course.H0 + this.last.centerY, this.lane);
        this.state = {x: this.last.centerX, v: 0, air: false, dur: this.last.dur, done: true};
      }
    }
    if (camera) this.fitLabel(camera);
  }

  // Labels: constant on-screen size whatever the lens, fading with distance so the far field stays clean.
  // Runs again just before each render, so every view (main camera, picture-in-picture) gets its own fit.
  fitLabel(camera) {
    const d = _camPos.setFromMatrixPosition(camera.matrixWorld).distanceTo(this.root.position);
    this.label.material.opacity = this.labelsOn ? Math.max(0, Math.min(1, (115 - d) / 50)) : 0;
    this.label.position.y = this.radius * (this.look.sz > 1.1 ? 1.05 : 1) + 0.22 + d * 0.004;
    const lens = camera.isPerspectiveCamera ? Math.tan(camera.fov * Math.PI / 360) / TAN25 : 1;
    this.label.scale.set(LABEL_W * lens, LABEL_H * lens, 1);
  }

  updateShards(origin, s) {
    const {group, pieces} = this.shards, c = this.course;
    group.visible = true;
    const tau = 0.9, g = 9.81, drift = tau * (1 - Math.exp(-s / tau));
    const qa = new THREE.Quaternion(), qf = new THREE.Quaternion();
    for (const p of pieces) {
      const x = origin.x + p.off.x + p.v.x * drift, z = origin.z + p.off.z + p.v.z * drift;
      const ground = c.surfaceY(x, z) + p.rest;
      const y = Math.max(ground, origin.y + p.off.y + p.v.y * s - 0.5 * g * s * s);
      const tf = Math.min(s, p.land);
      qf.copy(p.q0).premultiply(qa.setFromAxisAngle(p.axis, p.w * tf));
      const b = smoothstep(p.land - 0.1, p.land + 0.3, s);
      p.m.quaternion.slerpQuaternions(qf, p.qRest, b);
      p.m.position.set(x, y, z);
    }
    const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
    if (this.pulp) {
      const {mesh, bits} = this.pulp;
      bits.forEach((b, i) => {
        const x = origin.x + b.off.x + b.v.x * drift, z = origin.z + b.off.z + b.v.z * drift;
        const ground = c.surfaceY(x, z) + b.s * 0.3, fly = origin.y + b.off.y + b.v.y * s - 0.5 * g * s * s;
        const landed = fly <= ground, k = landed ? 1 : 0;
        e.set(b.rot.x * (1 - k) + 0, b.yaw, b.rot.z * (1 - k) * Math.min(1, s * 3));
        q.setFromEuler(e); sc.set(b.s, b.s * (landed ? 0.6 : 1), b.s);
        mesh.setMatrixAt(i, m4.compose(v3.set(x, Math.max(ground, fly), z), q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.seedsInst) {
      const {mesh, bits} = this.seedsInst, speed = (this.result.speed || 0) * 0.2;
      bits.forEach((b, i) => {
        const k = 0.8 * (1 - Math.exp(-s / 0.8));
        const x = origin.x + b.d.x * k + speed * k / 0.8, z = origin.z + b.d.z * k;
        const ground = c.surfaceY(x, z) + 0.004, fly = origin.y + b.d.y * s - 4.9 * s * s;
        const landed = fly <= ground;
        if (landed) e.set(0, b.yaw, 0); else e.set(b.tilt.x + s * 9, b.yaw, b.tilt.z + s * 7);
        q.setFromEuler(e); sc.setScalar(b.s);
        mesh.setMatrixAt(i, m4.compose(v3.set(x, Math.max(ground, fly), z), q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.splat) {
      const R = this.radius, grow = smoothstep(0, 0.25, s);
      const slope = Math.atan2(c.surfaceY(origin.x + 0.5, origin.z) - c.surfaceY(origin.x - 0.5, origin.z), 1);
      this.splat.visible = s > 0.02;
      this.splat.position.set(origin.x + 0.3 * R, c.surfaceY(origin.x + 0.3 * R, origin.z) + 0.015, origin.z);
      _n.set(-Math.sin(slope), Math.cos(slope), 0);
      this.splat.quaternion.setFromUnitVectors(_zAxis, _n).multiply(_q.setFromAxisAngle(_zAxis, this.p.seed % 6));
      this.splat.scale.setScalar(R * (1.2 + 1.8 * grow));
    }
    if (this.ball) {
      const tau2 = 2.4, x = origin.x + this.ball.v * tau2 * (1 - Math.exp(-s / tau2));
      this.ball.m.position.set(x, c.surfaceY(x, origin.z) + this.ball.r, origin.z);
      this.ball.m.rotation.z = -(x - origin.x) / this.ball.r;
    }
  }

  // Remove this pumpkin (and its debris) from the scene and free GPU memory.
  dispose() {
    for (const obj of [this.root, this.shards?.group].filter(Boolean)) {
      obj.parent?.remove(obj);
      obj.traverse(o => {
        o.geometry?.dispose();
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
    }
  }

  // Simple status text for the standings list.
  statusAt(t) {
    const r = this.result;
    if (r.status === 'DQ') return {kind: 'dq', text: 'DQ'};
    if (t < this.end) return null;
    if (r.status === 'FINISHED') return {kind: 'finished', text: r.time.toFixed(2) + ' s'};
    if (r.status === 'BROKEN') return {kind: 'broken', text: 'BROKEN'};
    return {kind: 'out', text: r.reason || 'DNF'};
  }
}
