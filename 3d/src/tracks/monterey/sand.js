// Sand traps: drifts of loose dune sand across the dirt track, with soft ragged
// edges, wind ripples, mounds at the verges and tufts of dune grass.
import * as THREE from 'three';
import {rng, fbm, vnoise} from '../../noise.js';
import {blob, merge, mesh, coloured} from '../../env/geom.js';

function sandTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), r = rng(91);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Wind ripples run across the track (along V), wobbling.
    const rip = 0.5 + 0.5 * Math.sin((x + 9 * Math.sin(y / 23) + 4 * Math.sin(y / 7.3)) / N * Math.PI * 2 * 22);
    const n = vnoise(x / 18, y / 18) * 0.6 + vnoise(x / 5, y / 5) * 0.4;
    const k = 0.86 + 0.1 * rip + 0.12 * (n - 0.5) + (r() - 0.5) * 0.08, i = (y * N + x) * 4;
    img.data[i] = 232 * k; img.data[i + 1] = 198 * k; img.data[i + 2] = 134 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 1600; i++) { // darker grains and shell bits
    g.fillStyle = r() < 0.7 ? `rgba(120,96,70,${0.25 + r() * 0.3})` : `rgba(250,245,232,${0.5 + r() * 0.4})`;
    g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function sandTraps(group, course, {low = false} = {}) {
  const half = course.roadHalf, tex = sandTexture();
  const mat = new THREE.MeshStandardMaterial({map: tex, vertexColors: true, transparent: true, roughness: 1, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const parts = [], mounds = [], grass = [], r = rng(7);
  for (const [a, b] of course.SAND) {
    const x0 = a - 7, x1 = b + 7, zs = [];
    for (let z = -half - 0.9; z <= half + 0.9 + 1e-6; z += 0.45) zs.push(z);
    const xs = [];
    for (let x = x0; x <= x1 + 1e-6; x += 0.5) xs.push(x);
    const pos = [], uv = [], col = [], idx = [];
    xs.forEach((x, i) => zs.forEach((z, j) => {
      const edge = Math.abs(z) > half ? course.roadY(x) + 0.05 - (Math.abs(z) - half) * 0.1 : course.roadY(x);
      // Ragged ends: sand thins out over ~6 m with a noisy front.
      const front = 4.5 + 2.2 * fbm(x / 3, z / 2.2, 3);
      const fade = Math.min(1, Math.max(0, Math.min(x - a + front, b + front - x) / 3.5));
      const thin = 0.55 + 0.45 * Math.min(1, Math.max(0, 1.3 - Math.abs(z) / half * 0.5 + 0.4 * fbm(x / 6, z / 4, 2)));
      pos.push(x, edge + 0.012, z); uv.push(x / 3.2, z / 3.2);
      col.push(1, 1, 1, Math.min(1, fade * thin * 1.15));
      if (i && j) { const n = zs.length, A = (i - 1) * n + j - 1, B = A + 1, C = A + n, D = C + 1; idx.push(A, B, C, B, D, C); }
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx); geo.computeVertexNormals();
    parts.push(geo);
    // Drifts banked up at the verges, and dune grass.
    for (let x = a - 4; x < b + 4; x += low ? 2.2 : 1.3) for (const s of [-1, 1]) {
      const z = s * (half + 0.9 + r() * 1.6), y = Math.max(course.roadY(x), course.terrainH(x, z));
      mounds.push(blob(0.9 + r() * 1.1, 0.18 + r() * 0.22, 0.6 + r() * 0.5, x + r() * 0.6, y - 0.05, z, 1));
      if (r() < 0.6) {
        const gz = s * (half + 2.2 + r() * 3), gy = course.terrainH(x, gz);
        for (let k = 0; k < 5; k++) {
          const blade = new THREE.ConeGeometry(0.035, 0.5 + r() * 0.45, 3);
          blade.translate(0, 0.3, 0); blade.rotateZ((r() - 0.5) * 0.7); blade.rotateX((r() - 0.5) * 0.7);
          blade.translate(x + (r() - 0.5) * 0.5, gy, gz + (r() - 0.5) * 0.5);
          grass.push(blade);
        }
      }
    }
  }
  const sand = new THREE.Mesh(merge(parts), mat); sand.receiveShadow = true; sand.renderOrder = 1;
  group.add(sand);
  group.add(mesh(coloured(merge(mounds), '#f6eedc', 0.06, 5), new THREE.MeshStandardMaterial({vertexColors: true, map: tex, roughness: 1}), {cast: false}));
  if (grass.length) group.add(mesh(coloured(merge(grass), '#8d9a52', 0.2, 6), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.9}), {cast: false}));
}
