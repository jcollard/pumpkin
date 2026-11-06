// Geometry helpers shared by every track.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {rng} from '../noise.js';

export function samples(a, b, step) {
  const xs = [];
  for (let x = a; x < b; x += step) xs.push(x);
  xs.push(b);
  return xs;
}

export function ribbon(xs, yFn, zA, zB, uLen) {
  const pos = [], uv = [], idx = [];
  xs.forEach((x, i) => {
    const y = yFn(x);
    pos.push(x, y, zA, x, y, zB);
    uv.push(x / uLen, 0, x / uLen, 1);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function beam(xs, topFn, botFn, zA, zB, uLen = 4) {
  const pos = [], uv = [], idx = [];
  const quad = (a, b, c, d, ua, ub) => {
    const k = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(ua, 0, ub, 0, ub, 1, ua, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1], x1 = xs[i], t0 = topFn(x0), t1 = topFn(x1), b0 = botFn(x0), b1 = botFn(x1);
    const u0 = x0 / uLen, u1 = x1 / uLen;
    quad([x0, t0, zA], [x0, t0, zB], [x1, t1, zB], [x1, t1, zA], u0, u1);        // top
    quad([x0, b0, zB], [x0, b0, zA], [x1, b1, zA], [x1, b1, zB], u0, u1);        // bottom
    quad([x0, b0, zB], [x1, b1, zB], [x1, t1, zB], [x0, t0, zB], u0, u1);        // +z side
    quad([x1, b1, zA], [x0, b0, zA], [x0, t0, zA], [x1, t1, zA], u0, u1);        // -z side
  }
  const xa = xs[0], xb = xs[xs.length - 1];
  quad([xa, botFn(xa), zA], [xa, botFn(xa), zB], [xa, topFn(xa), zB], [xa, topFn(xa), zA], 0, 1);
  quad([xb, botFn(xb), zB], [xb, botFn(xb), zA], [xb, topFn(xb), zA], [xb, topFn(xb), zB], 0, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function box(cx, cy, cz, sx, sy, sz, rotZ = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(cx, cy, cz);
  // World-ish UVs so concrete texture is not stretched on tall columns.
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / 4, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / 4);
  }
  return g;
}

export function rod(a, b, r = 0.06, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export const strip = g => { // drop uv-less geometries' attributes mismatch before merging
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g.index ? g.toNonIndexed() : g;
};

export const merge = list => mergeGeometries(list.map(strip), false);

export function mesh(geo, mat, {cast = true, receive = true} = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

export function coloured(geo, hex, jitter, seed) {
  const r = rng(seed), c = new THREE.Color(hex), out = new Float32Array(geo.attributes.position.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    tmp.copy(c).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * jitter);
    out.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

export function blob(sx, sy, sz, x, y, z, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, r = rng(Math.round(x * 13 + y * 7 + z * 3) + 5);
  for (let i = 0; i < p.count; i++) { const k = 0.82 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  g.scale(sx, sy, sz); g.translate(x, y, z); g.computeVertexNormals();
  return g;
}

export function instanced(geo, mat, transforms, {cast = true, colors} = {}) {
  const m = new THREE.InstancedMesh(geo, mat, transforms.length);
  transforms.forEach((t, i) => m.setMatrixAt(i, t));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

export const mat4 = (x, y, z, s, ry = 0, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, sy, s));

// Slope magnitude of a height function at (x, z).
export function slopeAt(heightFn, x, z, e = 1.5) {
  const dx = (heightFn(x + e, z) - heightFn(x - e, z)) / (2 * e), dz = (heightFn(x, z + e) - heightFn(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

// Like instanced(), but splits the instances into square cells so frustum
// culling (camera and sun shadow) can skip whole cells. Returns the meshes
// (all added to group). transforms: Matrix4[]; colors: Color[] (optional).
export function instancedChunks(group, geo, mat, transforms, {cell = 200, cast = true, receive = true, colors, name} = {}) {
  const cells = new Map(), p = new THREE.Vector3();
  transforms.forEach((t, i) => {
    p.setFromMatrixPosition(t);
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const out = [];
  for (const idx of cells.values()) {
    const m = new THREE.InstancedMesh(geo, mat, idx.length);
    idx.forEach((k, i) => { m.setMatrixAt(i, transforms[k]); if (colors) m.setColorAt(i, colors[k]); });
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    m.computeBoundingSphere();
    group.add(m); out.push(m);
  }
  return out;
}

// Tapered tube along points [[x,y,z],...] with radii [r0, r1, ...] (one per point).
// UV: u wraps around (×uWrap), v runs along the length in units of the base girth.
export function taperedTube(points, radii, opts = {}) {
  const {radial = 7, uWrap = 2, flare = 0} = opts;
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const segs = Math.max(2, (points.length - 1) * (opts.segs ?? 2)), frames = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], nrm = [], idx = [];
  const girth = 2 * Math.PI * radii[0];
  let len = 0, prev = curve.getPointAt(0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t);
    len += c.distanceTo(prev); prev = c;
    const fr = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(fr));
    let r = radii[k] + (radii[k + 1] - radii[k]) * (fr - k);
    if (flare && t < 0.08) r *= 1 + flare * (1 - t / 0.08) ** 2;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r); nrm.push(nx, ny, nz);
      uv.push(j / radial * uWrap, len / girth);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
