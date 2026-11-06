// Monterey vegetation: Monterey pines on the hills, wind-sculpted cypress on the
// bluffs, a eucalyptus grove (the Pacific Grove monarch sanctuary) with
// monarch butterflies drifting around it and across the track.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {rng} from '../../noise.js';
import {coloured, blob, instanced} from '../../env/geom.js';

// Monterey pine: tall trunk, irregular rounded crown of dark clumps.
export function montereyPine() {
  const canopy = coloured(mergeGeometries([
    blob(3.3, 1.9, 3.0, 0.3, 13.2, 0.2), blob(2.6, 1.6, 2.4, -2.1, 12.0, 1.0), blob(2.5, 1.5, 2.6, 2.3, 11.6, -1.2),
    blob(2.0, 1.4, 2.0, -0.8, 14.6, -1.5), blob(2.2, 1.3, 2.0, 1.4, 10.2, 1.9), blob(1.8, 1.2, 1.8, -2.5, 9.8, -1.4),
  ]), '#2c4224', 0.16, 9);
  const trunk = new THREE.CylinderGeometry(0.22, 0.5, 13, 6); trunk.translate(0, 6.5, 0);
  return {canopy, trunk, bark: 0x4e3f33};
}

// Blue gum eucalyptus: very tall, pale peeling trunk, airy grey-green crown.
export function eucalyptus() {
  const canopy = coloured(mergeGeometries([
    blob(3.0, 3.4, 2.8, 0.6, 24, 0.3), blob(2.4, 2.8, 2.2, -1.9, 20.5, 1.2), blob(2.2, 3.0, 2.4, 2.0, 19.5, -1.0),
    blob(1.8, 2.2, 1.8, -0.4, 27.5, -0.8), blob(2.0, 2.4, 1.8, 1.2, 15.8, 1.6),
  ]), '#5d7258', 0.14, 13);
  const trunk = new THREE.CylinderGeometry(0.28, 0.75, 26, 7); trunk.translate(0, 13, 0);
  trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.06, 0, 0, 0));
  return {canopy, trunk, bark: 0xb9ad98};
}

// Distant forest: one cheap blob per tree.
export function farPine() {
  const canopy = coloured(blob(3.4, 3.2, 3.2, 0, 11, 0, 0), '#2a3d23', 0.18, 21);
  const trunk = new THREE.CylinderGeometry(0.3, 0.45, 9, 4); trunk.translate(0, 4.5, 0);
  return {canopy, trunk, bark: 0x4e3f33};
}

// Monarch butterflies: a drifting cloud around the grove plus clusters on the branches.
// Instanced quads; flapping is done by squashing the wing span. Returns update(wall).
export function monarchs(group, course, {grove, crossings = [], low = false}) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (const s of [-1, 1]) { // two wings, orange with black veins and white-dotted borders
    g.save(); g.translate(64, 32); g.scale(s, 1);
    g.fillStyle = '#e8781e'; g.beginPath(); g.moveTo(2, -4); g.bezierCurveTo(30, -34, 62, -30, 60, -8); g.bezierCurveTo(58, 4, 30, 6, 2, 2); g.fill();
    g.beginPath(); g.moveTo(2, 2); g.bezierCurveTo(24, 6, 44, 18, 36, 28); g.bezierCurveTo(26, 32, 8, 22, 2, 6); g.fill();
    g.strokeStyle = '#1a1310'; g.lineWidth = 4; g.beginPath(); g.moveTo(2, -4); g.bezierCurveTo(30, -34, 62, -30, 60, -8); g.bezierCurveTo(58, 4, 30, 6, 2, 2); g.stroke();
    g.lineWidth = 1.6; for (const a of [-0.5, -0.2, 0.15]) { g.beginPath(); g.moveTo(4, 0); g.lineTo(4 + 50 * Math.cos(a), 50 * Math.sin(a) - 4); g.stroke(); }
    g.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(40 + k * 3.5, -24 + k * 3, 1.3, 0, 7); g.fill(); }
    g.restore();
  }
  g.fillStyle = '#1a1310'; g.fillRect(62, 10, 4, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(0.15, 0.075);  // a touch larger than life so they read on camera geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7});
  const r = rng(1859), flyers = [];
  const n = low ? 90 : 240;
  for (let i = 0; i < n; i++) {
    const cross = crossings.length && i % 2 === 0 ? crossings[i % crossings.length] : null;
    const cx = cross ? cross.x + (r() - 0.5) * cross.w : grove.x + (r() - 0.5) * grove.w;
    const cz = cross ? -14 + r() * 20 : grove.z + (r() - 0.5) * grove.d;
    const ground = course.surfaceY(cx, cz);
    flyers.push({cx, cz, base: ground + (cross ? 0.5 + r() * 2.6 : 2 + r() * 14), rad: 0.6 + r() * 2.5, sp: (0.25 + r() * 0.4) * (r() < 0.5 ? -1 : 1),
      ph: r() * 6.28, bob: 0.3 + r() * 0.6, flap: 9 + r() * 6, drift: cross ? 1 : 0});
  }
  const fly = new THREE.InstancedMesh(geo, mat, flyers.length);
  fly.frustumCulled = false; fly.castShadow = false;
  group.add(fly);
  // Roosting clusters: dense orange clumps hanging in the eucalyptus crowns.
  const roost = [], cr = rng(77);
  for (const tree of grove.trees.slice(0, low ? 6 : 14)) for (let k = 0; k < 26; k++) {
    const a = cr() * 6.28, rr = 0.4 + cr() * 1.6, y = tree.y + (16 + cr() * 8) * tree.s;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(tree.x + Math.cos(a) * rr, y - cr() * 0.6, tree.z + Math.sin(a) * rr),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.2 + cr() * 0.4, cr() * 6, 0)), new THREE.Vector3(1.4, 1.4, 1.4));
    roost.push(m);
  }
  if (roost.length) group.add(instanced(geo, mat, roost, {cast: false}));
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  return wall => {
    flyers.forEach((b, i) => {
      const a = wall * b.sp + b.ph;
      p.set(b.cx + Math.cos(a) * b.rad + (b.drift ? Math.sin(wall * 0.11 + b.ph) * 6 : 0), b.base + Math.sin(wall * b.bob + b.ph) * 0.6 + Math.abs(Math.sin(wall * b.flap * 0.5)) * 0.08,
        b.cz + Math.sin(a) * b.rad);
      e.set(0.2 * Math.sin(wall * 2 + b.ph), -a - Math.sign(b.sp) * Math.PI / 2, 0); q.setFromEuler(e);
      s.set(0.15 + 0.85 * Math.abs(Math.cos(wall * b.flap + b.ph)), 1, 1);
      m.compose(p, q, s); fly.setMatrixAt(i, m);
    });
    fly.instanceMatrix.needsUpdate = true;
  };
}
