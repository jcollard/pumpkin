// Pacific Grove: painted Victorian cottages climbing the hillside inland of the
// course, with a white chapel and steeple. Merged into a few meshes.
import * as THREE from 'three';
import {rng} from '../../noise.js';
import {merge, mesh, coloured, box} from '../../env/geom.js';
import {slopeAt} from '../../env/geom.js';

// Clapboard facade tile (3 m) with one white-trimmed window; tinted by vertex colour.
function facadeTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 11) { g.fillStyle = 'rgba(60,50,40,.22)'; g.fillRect(0, y, N, 2); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, y + 2, N, 2); }
  // window: white trim (ignores tint because the trim is drawn at full white and multiplied... keep it light), dark panes
  g.fillStyle = '#fbfaf6'; g.fillRect(84, 62, 88, 128);
  g.fillStyle = '#2b3338'; g.fillRect(94, 72, 68, 108);
  g.fillStyle = '#fbfaf6'; g.fillRect(126, 72, 5, 108); g.fillRect(94, 122, 68, 5);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(98, 76, 24, 44);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function wallBox(x, y0, z, w, h, d, col, list) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y0 + h / 2, z);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.5 ? p.getZ(i) - z : p.getX(i) - x) / 3 + 0.5, ay > 0.5 ? 0 : (p.getY(i) - y0) / 3 + 0.1);
  }
  list.push(coloured(g, col, 0.03, Math.round(x * 7 + z)));
}

// Gable roof as a squashed 4-sided cone (ridge along x).
function roof(x, y, z, w, d, rise, col, list) {
  const g = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); g.rotateY(Math.PI / 4);
  g.scale(w * 0.74, rise, d * 0.74); g.translate(x, y + rise / 2, z);
  g.computeVertexNormals();
  list.push(coloured(g, col, 0.06, Math.round(x + z * 3)));
}

const PAINT = ['#e9b8c2', '#f1d98a', '#9fc4d9', '#b9d6b4', '#f4efe4', '#d7c2e2', '#f2b38a', '#a8c7c0', '#efe0c4', '#c9d9ef'];
const ROOFS = ['#4f4a48', '#5b4440', '#3f4a52', '#615a52'];

export function town(group, course, {low = false, x0 = 340, x1 = 800} = {}) {
  const r = rng(1875), walls = [], roofs = [], trim = [];
  const homes = [];
  const free = (x, z) => homes.every(h => Math.abs(h.x - x) > 13 || Math.abs(h.z - z) > 15);
  for (let i = 0; homes.length < (low ? 34 : 64) && i < 900; i++) {
    const x = x0 + r() * (x1 - x0), z = -18 - Math.pow(r(), 1.4) * 150;
    if (!free(x, z)) continue;
    if (Math.abs(x - 560) < 22 && z > -40) continue;          // open view behind net 2
    if (slopeAt(course.terrainH, x, z, 4) > 0.45) continue;
    homes.push({x, z});
  }
  for (const hm of homes) {
    const w = 6 + r() * 3, d = 7 + r() * 3, stories = r() < 0.7 ? 2 : 1, h = stories * 3.1 + 0.4;
    const ground = Math.min(course.terrainH(hm.x - w / 2, hm.z + d / 2), course.terrainH(hm.x + w / 2, hm.z + d / 2), course.terrainH(hm.x, hm.z - d / 2)) - 0.4;
    const col = PAINT[(r() * PAINT.length) | 0];
    wallBox(hm.x, ground, hm.z, w, h + 0.4, d, col, walls);
    roof(hm.x, ground + h + 0.4, hm.z, w + 0.9, d + 0.9, 2.6 + r() * 1.6, ROOFS[(r() * ROOFS.length) | 0], roofs);
    // Front porch facing the bay (+z) with a little roof.
    trim.push(coloured(box(hm.x, ground + 0.55, hm.z + d / 2 + 1.0, w * 0.8, 1.1, 2.0), '#f6f3ec', 0.02, 1));
    trim.push(coloured(box(hm.x, ground + 3.35, hm.z + d / 2 + 1.0, w * 0.86, 0.16, 2.2), '#f6f3ec', 0.02, 2));
    for (const s of [-1, 1]) trim.push(coloured(box(hm.x + s * w * 0.38, ground + 2.2, hm.z + d / 2 + 1.95, 0.14, 2.3, 0.14), '#f6f3ec', 0.02, 3));
    // Corner turret on some (very Pacific Grove).
    if (r() < 0.3 && stories === 2) {
      const tx = hm.x + w / 2, tz = hm.z + d / 2, tower = new THREE.CylinderGeometry(1.3, 1.3, h + 1.6, 8); tower.translate(tx, ground + (h + 1.6) / 2, tz);
      walls.push(coloured(tower, col, 0.03, 5));
      const cone = new THREE.ConeGeometry(1.6, 3.2, 8); cone.translate(tx, ground + h + 1.6 + 1.6, tz); roofs.push(coloured(cone, '#4f4a48', 0.05, 6));
    }
  }
  // Chapel with a steeple (white clapboard, by-the-sea style).
  const cx = 522, cz = -64, cg = course.terrainH(cx, cz) - 0.5;
  wallBox(cx, cg, cz, 9, 7, 16, '#f6f3ec', walls);
  roof(cx, cg + 7, cz, 10, 17, 5.5, '#5b4440', roofs);
  wallBox(cx, cg, cz + 9, 3.6, 13, 3.6, '#f6f3ec', walls);
  const spire = new THREE.ConeGeometry(2.4, 9, 4); spire.rotateY(Math.PI / 4); spire.translate(cx, cg + 13 + 4.5, cz + 9); roofs.push(coloured(spire, '#5b4440', 0.03, 8));

  group.add(mesh(merge(walls), new THREE.MeshStandardMaterial({vertexColors: true, map: facadeTexture(), roughness: 0.85})));
  group.add(mesh(merge(roofs), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9, flatShading: true})));
  group.add(mesh(merge(trim), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8})));
  return homes;
}
