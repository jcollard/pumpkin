// Carmel planting: Monterey pines, small garden trees, hedges, flower beds,
// dune grass and ice plant. All instanced or merged.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {rng} from '../../noise.js';
import {coloured, blob, instanced, mat4} from '../../env/geom.js';

// Monterey pine: tall bare trunk, a lumpy dark crown up top.
export function pine() {
  const canopy = coloured(mergeGeometries([
    blob(3.4, 1.9, 3.2, 0, 14.2, 0), blob(2.6, 1.6, 2.5, 2.3, 13.0, 1.2), blob(2.5, 1.5, 2.4, -2.2, 13.4, -1.0),
    blob(2.2, 1.4, 2.1, 0.8, 15.6, -1.6), blob(2.0, 1.3, 2.0, -1.2, 12.0, 2.0), blob(1.9, 1.2, 1.9, 1.6, 11.4, -2.2),
  ]), '#2e4a2e', 0.14, 21);
  const trunk = new THREE.CylinderGeometry(0.22, 0.5, 13, 6); trunk.translate(0, 6.5, 0);
  trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.05, 0, 0.04, 0));
  return {canopy, trunk, bark: 0x5b4535};
}

// Small garden tree (olive / flowering plum style), about 4 m.
export function gardenTree() {
  const canopy = coloured(mergeGeometries([blob(1.5, 1.2, 1.5, 0, 3.3, 0), blob(1.1, 0.9, 1.1, 0.9, 2.9, 0.4), blob(1.0, 0.9, 1.0, -0.8, 3.0, -0.4)]), '#6a7d45', 0.16, 22);
  const trunk = new THREE.CylinderGeometry(0.08, 0.14, 2.6, 5); trunk.translate(0, 1.3, 0);
  return {canopy, trunk, bark: 0x5a4a3c};
}

// Tall cypress-like coastal tree, used as a far silhouette (cheap).
export function farTree() {
  const canopy = coloured(blob(3.2, 2.6, 3.0, 0, 7.6, 0, 0), '#22361f', 0.1, 23);
  const trunk = new THREE.CylinderGeometry(0.3, 0.5, 6.5, 3, 1, true); trunk.translate(0, 3.2, 0);
  return {canopy, trunk, bark: 0x4a3a2c};
}

// Flowers as tiny instanced blobs: points [{x, y, z, c (Color), s}].
export function flowers(group, points, {size = 0.085, cast = false} = {}) {
  if (!points.length) return null;
  const g = new THREE.OctahedronGeometry(size, 0); g.scale(1, 0.7, 1);
  const m = points.map(p => mat4(p.x, p.y, p.z, p.s ?? 1, (p.x * 7.1) % 6.28));
  const mesh = instanced(g, new THREE.MeshStandardMaterial({roughness: 0.75, flatShading: true}), m, {cast, colors: points.map(p => p.c)});
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// Leafy mounds (shrubs, roses, lavender) with per-instance colour.
export function mounds(group, points, {cast = true, detail = 1} = {}) {
  if (!points.length) return null;
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position, r = rng(31);
  for (let i = 0; i < p.count; i++) { const k = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i)) * k, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = points.map(q => new THREE.Matrix4().compose(new THREE.Vector3(q.x, q.y, q.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, q.rot ?? 0, 0)), new THREE.Vector3(q.sx, q.sy, q.sz ?? q.sx)));
  const mesh = instanced(geo, new THREE.MeshStandardMaterial({roughness: 0.95, flatShading: true}), m, {cast, colors: points.map(q => q.c)});
  group.add(mesh);
  return mesh;
}

// Dune grass tufts: a fan of single-triangle blades, instanced.
export function grassTufts(group, points, {color = '#b8ad72', cast = false} = {}) {
  if (!points.length) return null;
  const r = rng(41), pos = [];
  for (let i = 0; i < 9; i++) {
    const h = 0.45 + r() * 0.45, a = r() * 6.28, lean = (r() - 0.5) * 0.7, w = 0.035, bx = (r() - 0.5) * 0.2, bz = (r() - 0.5) * 0.2;
    const c = Math.cos(a), s = Math.sin(a), tx = bx + Math.cos(a + 1.57) * lean * h, tz = bz + Math.sin(a + 1.57) * lean * h;
    pos.push(bx - c * w, 0, bz - s * w, bx + c * w, 0, bz + s * w, tx, h, tz);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setY(i, Math.abs(n.getY(i)) + 0.6); // soft, sky-lit blades
  const base = new THREE.Color(color), cols = points.map(() => base.clone().offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.12));
  const mesh = instanced(geo, new THREE.MeshStandardMaterial({roughness: 0.9, side: THREE.DoubleSide}), points.map(p => mat4(p.x, p.y - 0.03, p.z, p.s ?? 1, p.rot ?? 0)), {cast, colors: cols});
  group.add(mesh);
  return mesh;
}
