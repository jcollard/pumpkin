// Storybook cottages in the spirit of Carmel-by-the-Sea's fairy-tale houses:
// steep wavy shingle roofs with rolled eaves, stone chimneys, half-timbered
// stucco, arched doors, leaded windows and flower boxes. Small galleries get
// display windows and hanging signs. Everything merges into a handful of meshes.
import * as THREE from 'three';
import {rng, vnoise} from '../../noise.js';
import {BAY, BAY_H, SILL, SIGNS} from './tex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Collects transformed geometry per material key, then emits merged BufferGeometries.
export class Builder {
  constructor() { this.parts = {}; this.m = new THREE.Matrix4(); this.nm = new THREE.Matrix3(); }
  setMatrix(m) { this.m.copy(m); this.nm.getNormalMatrix(m); }
  bucket(key) { return (this.parts[key] ??= {pos: [], nrm: [], uv: [], col: []}); }
  // Append any geometry (indexed or not) with one colour.
  add(key, geo, color = WHITE) {
    const g = geo.index ? geo.toNonIndexed() : geo, b = this.bucket(key);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(this.m); b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(this.nm).normalize(); b.nrm.push(v.x, v.y, v.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      b.col.push(color.r, color.g, color.b);
    }
    geo.dispose(); if (g !== geo) g.dispose();
  }
  // Flat quad a-b-c-d (counter-clockwise seen from the front) with uv corners.
  quad(key, a, b, c, d, uv, color = WHITE) {
    const bk = this.bucket(key), n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const wn = n.clone().applyMatrix3(this.nm).normalize(), pts = [a, b, c, a, c, d], uvs = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
    pts.forEach((p, i) => {
      const w = p.clone().applyMatrix4(this.m);
      bk.pos.push(w.x, w.y, w.z); bk.nrm.push(wn.x, wn.y, wn.z); bk.uv.push(uvs[i][0], uvs[i][1]); bk.col.push(color.r, color.g, color.b);
    });
  }
  tri(key, a, b, c, uv, color = WHITE) {
    const bk = this.bucket(key), n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const wn = n.applyMatrix3(this.nm).normalize();
    [a, b, c].forEach((p, i) => {
      const w = p.clone().applyMatrix4(this.m);
      bk.pos.push(w.x, w.y, w.z); bk.nrm.push(wn.x, wn.y, wn.z); bk.uv.push(uv[i][0], uv[i][1]); bk.col.push(color.r, color.g, color.b);
    });
  }
  geometry(key) {
    const b = this.parts[key]; if (!b || !b.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}
const WHITE = new THREE.Color(1, 1, 1);

// UV rect of an atlas cell (4 x 2 cells; v = 0 at the bottom of the texture).
function cellUV(cell, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  const cx = cell % 4, cy = Math.floor(cell / 4);
  const U = u => (cx + u) / 4, Vv = v => 1 - (cy + 1 - v) / 2;
  return [[U(u0), Vv(v0)], [U(u1), Vv(v0)], [U(u1), Vv(v1)], [U(u0), Vv(v1)]];
}

// Box with world-scaled UVs (for stone and wood).
export function uvBox(sx, sy, sz, scale = 1.6) {
  const g = new THREE.BoxGeometry(sx, sy, sz), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / scale, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / scale);
  }
  return g;
}

// A wavy roof slope: grid between the eave line and the ridge, displaced for the storybook look.
function roofSlope({x0, x1, eaveZ, eaveY, ridgeZ, ridgeY, seed, wave = 0.12, sag = 0.14, curl = 0.22, nu = 10, nv = 6}) {
  const g = new THREE.PlaneGeometry(1, 1, nu, nv), p = g.attributes.position, uv = g.attributes.uv;
  const slopeLen = Math.hypot(ridgeZ - eaveZ, ridgeY - eaveY), flip = ridgeZ > eaveZ; // keep normals outward
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5; // u along x, v from eave (0) to ridge (1)
    const x = flip ? x1 + (x0 - x1) * u : x0 + (x1 - x0) * u;
    let y = eaveY + (ridgeY - eaveY) * v, z = eaveZ + (ridgeZ - eaveZ) * v;
    const edge = Math.min(x - x0, x1 - x);
    y += wave * Math.sin(x * 1.25 + seed) * (1 - v) * (1 - v);                 // undulating eave line
    y -= sag * Math.sin(Math.PI * (x - x0) / (x1 - x0)) * v;                                        // ridge sags in the middle
    y -= curl * Math.max(0, 1 - v / 0.16) ** 2;                                  // rolled eave
    y -= curl * 0.8 * Math.max(0, 1 - edge / 0.55) ** 2;                         // rolled gable edges
    y += 0.06 * (vnoise(x * 0.9 + seed, v * 3) - 0.5);
    p.setXYZ(i, x, y, z);
    uv.setXY(i, x / 2.2, v * slopeLen / 2.2);
  }
  g.computeVertexNormals();
  return g;
}

// The rolled edge along a roof: a tube through points.
function rolledEdge(points, r = 0.1) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(4, points.length * 2), r, 5, false);
}

const PALETTE = {
  stucco: ['#f6e9cf', '#f7f3ea', '#f3e2b0', '#f0d6cb', '#dfe3c8', '#dfe4e6', '#ecd3a8', '#f5efe0', '#e9dcc7'].map(h => new THREE.Color(h)),
  roof: ['#8a7a6c', '#6f5a4a', '#9a9088', '#5e5048', '#7d7a66', '#8f6e5a', '#60646a', '#4f5a4a'].map(h => new THREE.Color(h)),
  box: ['#5d7d6c', '#7a3b2e', '#3f5a75', '#f1ece0', '#6b4a33'].map(h => new THREE.Color(h)),
  flower: ['#d9343f', '#ef6f8f', '#f2c230', '#9b5fc0', '#f5f0f0', '#e8562a', '#ff8fb0', '#c2185b'].map(h => new THREE.Color(h)),
};

// Choose a cottage design for a lot. kind: 'cottage' | 'gallery' | 'simple'.
export function designCottage(seed, {kind = 'cottage', W, D} = {}) {
  const r = rng(seed);
  W = W ?? 6.8 + r() * 3.2; D = D ?? 6.0 + r() * 1.6;
  const nb = Math.max(2, Math.round(W / 2.4));
  const bays = [];
  for (let i = 0; i < nb; i++) bays.push(kind === 'gallery' ? (i === 1 ? BAY.shopDoor : BAY.shop) : r() < 0.35 ? BAY.winB : r() < 0.2 ? BAY.stone : BAY.winA);
  let gable = null;
  if (kind !== 'simple' && r() < 0.8) { // front cross-gable with the arched door
    const at = kind === 'gallery' ? nb - 1 : r() < 0.5 ? 0 : nb - 1;
    gable = {at, w: Math.min(3.2, W / nb + 0.5), p: 1.1 + r() * 0.8, pitch: 0.95 + r() * 0.25};
    if (kind !== 'gallery') bays[at] = BAY.door;
  } else if (kind !== 'gallery') bays[Math.floor(r() * nb)] = BAY.door;
  return {
    kind, W, D, nb, bays, gable, seed,
    Hw: 3.0 + r() * 0.35, pitch: 0.82 + r() * 0.2,   // roof angle (rad): 47..58 degrees
    tint: kind === 'gallery' && r() < 0.5 ? PALETTE.stucco[(r() * 3) | 0] : PALETTE.stucco[(r() * PALETTE.stucco.length) | 0],
    roofTint: PALETTE.roof[(r() * PALETTE.roof.length) | 0],
    chimney: r() < 0.85 ? (r() < 0.5 ? -1 : 1) : 0,
    boxTint: PALETTE.box[(r() * PALETTE.box.length) | 0],
    flowers: r(), sign: kind === 'gallery' ? (r() * SIGNS.length) | 0 : -1,
    wave: 0.08 + r() * 0.1, curl: 0.16 + r() * 0.12,
  };
}

// Build one cottage. lot: {x, z, rot (0 faces +Z, PI faces -Z, PI/2 faces +X)}, ground(x, z) -> height.
// Returns flower points (world) for instancing.
export function buildCottage(B, d, lot, ground, {detail = true} = {}) {
  const {W, D, Hw, nb, bays, pitch, tint, roofTint} = d;
  const cos = Math.cos(lot.rot), sin = Math.sin(lot.rot);
  const toWorld = (lx, lz) => [lot.x + lx * cos + lz * sin, lot.z - lx * sin + lz * cos];
  // Floor level: highest ground under the footprint (+ a little), foundation down to the lowest.
  let gMax = -Infinity, gMin = Infinity;
  for (const [lx, lz] of [[-W / 2, 0], [W / 2, 0], [-W / 2, -D], [W / 2, -D], [0, -D / 2], [0, 0.8]]) {
    const [wx, wz] = toWorld(lx, lz), h = ground(wx, wz); gMax = Math.max(gMax, h); gMin = Math.min(gMin, h);
  }
  const floor = gMax + 0.18;
  B.setMatrix(new THREE.Matrix4().makeRotationY(lot.rot).setPosition(lot.x, floor, lot.z));
  const flowers = [], r = rng(d.seed * 7 + 3);
  const bw = W / nb, x0 = -W / 2;

  // Foundation plinth (stone), deep enough for the slope.
  const fd = floor - gMin + 0.45;
  { const g = uvBox(W + 0.16, fd, D + 0.16); g.translate(0, 0.06 - fd / 2, -D / 2); B.add('stone', g); }

  // Walls: front bays, sides and back.
  for (let i = 0; i < nb; i++) {
    const xa = x0 + i * bw, xb = xa + bw;
    const isGable = d.gable && d.gable.at === i;
    B.quad('wall', V(xa, 0, 0), V(xb, 0, 0), V(xb, Hw, 0), V(xa, Hw, 0), cellUV(isGable ? BAY.plain : bays[i]), tint);
    const sill = SILL[bays[i]];
    if (detail && sill && !isGable) { // flower box under the window
      const y = sill[1] * Hw - 0.1, cx = xa + bw * sill[0];
      const g = uvBox(1.15, 0.24, 0.26, 0.8); g.translate(cx, y, 0.14); B.add('paint', g, d.boxTint);
      for (let k = 0; k < 7; k++) flowers.push({lx: cx - 0.5 + k / 6 + (r() - 0.5) * 0.08, ly: y + 0.16 + r() * 0.06, lz: 0.14 + (r() - 0.5) * 0.12, c: (d.flowers * 8 + (k % 3 === 0 ? 3 : 0)) | 0, s: 0.75 + r() * 0.5});
    }
  }
  const sideBays = Math.max(2, Math.round(D / 2.4)), sw = D / sideBays;
  for (const s of [-1, 1]) for (let i = 0; i < sideBays; i++) {
    const za = -i * sw, zb = -(i + 1) * sw, x = s * W / 2, cell = i === 1 && (d.seed + s) % 2 ? BAY.winA : BAY.plain;
    if (s > 0) B.quad('wall', V(x, 0, za), V(x, 0, zb), V(x, Hw, zb), V(x, Hw, za), cellUV(cell), tint);
    else B.quad('wall', V(x, 0, zb), V(x, 0, za), V(x, Hw, za), V(x, Hw, zb), cellUV(cell), tint);
  }
  for (let i = 0; i < nb; i++) {
    const xa = x0 + i * bw, xb = xa + bw;
    B.quad('wall', V(xb, 0, -D), V(xa, 0, -D), V(xa, Hw, -D), V(xb, Hw, -D), cellUV(i % 2 ? BAY.winA : BAY.plain), tint);
  }

  // Main roof: ridge along the street, gable ends left and right.
  const tanP = Math.tan(pitch), Hr = (D / 2) * tanP, ohE = 0.45, ohG = 0.4;
  const rx0 = -W / 2 - ohG, rx1 = W / 2 + ohG, ridgeY = Hw + Hr, eaveY = Hw - ohE * tanP;
  const opts = {x0: rx0, x1: rx1, seed: d.seed, wave: d.wave, curl: d.curl, nu: detail ? 12 : 6, nv: detail ? 6 : 3};
  B.add('roof', roofSlope({...opts, eaveZ: ohE, eaveY, ridgeZ: -D / 2, ridgeY}), roofTint);
  B.add('roof', roofSlope({...opts, eaveZ: -D - ohE, eaveY, ridgeZ: -D / 2, ridgeY}), roofTint);
  // Gable-end triangles.
  for (const s of [-1, 1]) {
    const x = s * W / 2, uv = cellUV(BAY.gable);
    if (s > 0) B.tri('wall', V(x, Hw, 0), V(x, Hw, -D), V(x, ridgeY - 0.05, -D / 2), [uv[0], uv[1], [(uv[0][0] + uv[1][0]) / 2, uv[2][1]]], tint);
    else B.tri('wall', V(x, Hw, -D), V(x, Hw, 0), V(x, ridgeY - 0.05, -D / 2), [uv[0], uv[1], [(uv[0][0] + uv[1][0]) / 2, uv[2][1]]], tint);
  }
  if (detail) { // rolled edges along the eaves and a ridge roll
    const darker = roofTint.clone().multiplyScalar(0.8), pts = [];
    for (const z of [ohE + 0.02, -D - ohE - 0.02]) {
      pts.length = 0;
      for (let k = 0; k <= 8; k++) { const x = rx0 + (rx1 - rx0) * k / 8, edge = Math.min(x - rx0, rx1 - x); pts.push(V(x, eaveY - d.curl + d.wave * Math.sin(x * 1.25 + d.seed) - d.curl * 0.8 * Math.max(0, 1 - edge / 0.55) ** 2 - 0.02, z)); }
      B.add('roof', rolledEdge(pts, 0.1), darker);
    }
    pts.length = 0;
    for (let k = 0; k <= 8; k++) { const x = rx0 + (rx1 - rx0) * k / 8, u = k / 8; pts.push(V(x, ridgeY - 0.14 * Math.sin(Math.PI * u) - d.curl * 0.8 * Math.max(0, 1 - Math.min(x - rx0, rx1 - x) / 0.55) ** 2 + 0.02, -D / 2)); }
    B.add('roof', rolledEdge(pts, 0.13), darker);
  }

  // Front cross-gable with its own steeper roof (the door sits under it).
  if (d.gable) {
    const gb = d.gable, cx = x0 + (gb.at + 0.5) * bw, hw = gb.w / 2, p = gb.p, tG = Math.tan(gb.pitch), Hg = hw * tG;
    const xa = cx - hw, xb = cx + hw;
    B.quad('wall', V(xa, 0, p), V(xb, 0, p), V(xb, Hw, p), V(xa, Hw, p), cellUV(d.kind === 'gallery' ? BAY.shopDoor : BAY.door), tint);
    B.quad('wall', V(xb, 0, p), V(xb, 0, 0), V(xb, Hw, 0), V(xb, Hw, p), cellUV(BAY.plain, 0, p / BAY_H * 1.3), tint);
    B.quad('wall', V(xa, 0, 0), V(xa, 0, p), V(xa, Hw, p), V(xa, Hw, 0), cellUV(BAY.plain, 0, p / BAY_H * 1.3), tint);
    const guv = cellUV(BAY.gable);
    B.tri('wall', V(xa, Hw, p), V(xb, Hw, p), V(cx, Hw + Hg - 0.05, p), [guv[0], guv[1], [(guv[0][0] + guv[1][0]) / 2, guv[2][1]]], tint);
    const back = -Hg * (D / 2) / Hr - 0.4, oh = 0.35;
    // The cross-gable slopes run along z: build them in a rotated frame.
    const m = B.m.clone();
    for (const s of [-1, 1]) { // built along x, then turned so the ridge runs towards the street
      const g = roofSlope({x0: back, x1: p + oh, eaveZ: -s * (hw + oh), eaveY: Hw - oh * tG, ridgeZ: 0, ridgeY: Hw + Hg, seed: d.seed + s, wave: d.wave * 0.6, sag: 0.05, curl: d.curl * 0.8, nu: detail ? 6 : 3, nv: detail ? 5 : 2});
      g.rotateY(-Math.PI / 2); g.translate(cx, 0, 0);
      B.add('roof', g, roofTint);
    }
    B.setMatrix(m);
    if (detail) { // step up to the door
      const g = uvBox(gb.w * 0.6, 0.3, 0.6); g.translate(cx, -0.15, p + 0.3); B.add('stone', g);
    }
  }

  // Stone chimney on one gable end.
  if (d.chimney) {
    const s = d.chimney, x = s * (W / 2 + 0.32), z = -D / 2 + 0.3 * (r() - 0.5), top = ridgeY + 0.7 + r() * 0.5, base = -fd + 0.06;
    const lower = uvBox(0.66, Hw + 0.4 - base, 1.5); lower.translate(x, (Hw + 0.4 + base) / 2, z); B.add('stone', lower);
    const shoulder = uvBox(0.6, 0.6, 1.1); shoulder.translate(x - s * 0.02, Hw + 0.7, z); B.add('stone', shoulder);
    const stack = uvBox(0.55, top - Hw - 0.4, 0.82); stack.translate(x - s * 0.04, (top + Hw + 0.4) / 2, z); B.add('stone', stack);
    const cap = uvBox(0.7, 0.12, 0.96); cap.translate(x - s * 0.04, top + 0.06, z); B.add('stone', cap);
    if (detail) { const pot = new THREE.CylinderGeometry(0.11, 0.13, 0.42, 7); pot.translate(x - s * 0.04, top + 0.33, z + 0.15); B.add('paint', pot, new THREE.Color('#9a5a3c')); }
  }

  // Gallery: hanging sign on a bracket.
  if (d.sign >= 0) {
    const sx = x0 - 0.05 + 0.02, y = Hw - 0.55, zOut = 1.05, iu = (d.sign % 2) / 2, iv = 1 - (Math.floor(d.sign / 2) + 1) / 4;
    const bracket = uvBox(0.06, 0.06, zOut + 0.1, 0.5); bracket.translate(sx + 0.6, y + 0.32, zOut / 2); B.add('iron', bracket);
    const uv = [[iu, iv], [iu + 0.5, iv], [iu + 0.5, iv + 0.25], [iu, iv + 0.25]];
    const cx = sx + 0.6, z0 = zOut - 0.95, z1 = zOut - 0.05, yb = y - 0.26, yt = y + 0.26;
    B.quad('sign', V(cx + 0.02, yb, z1), V(cx + 0.02, yb, z0), V(cx + 0.02, yt, z0), V(cx + 0.02, yt, z1), uv);
    B.quad('sign', V(cx - 0.02, yb, z0), V(cx - 0.02, yb, z1), V(cx - 0.02, yt, z1), V(cx - 0.02, yt, z0), uv);
  }

  // Flowers to world space.
  return flowers.map(f => {
    const v = V(f.lx, f.ly, f.lz).applyMatrix4(B.m);
    return {x: v.x, y: v.y, z: v.z, c: PALETTE.flower[f.c % PALETTE.flower.length], s: f.s};
  });
}

export const FLOWER_COLORS = PALETTE.flower;
