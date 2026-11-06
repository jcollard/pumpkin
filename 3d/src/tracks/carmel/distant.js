// Across the bay: a mission with a Moorish domed bell tower in the river
// valley, Point Lobos' granite headlands and cypress, the Pebble Beach shore,
// sea stacks and a marine layer on the horizon at golden hour.
import * as THREE from 'three';
import {rng} from '../../noise.js';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {box, merge, mesh, blob, coloured} from '../../env/geom.js';
import * as flora from '../../env/flora.js';
import {cloudTexture} from '../../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Procedural mission (used if the catalogue models are missing, and for the
// adobe compound around them): long nave, curved gable, star window, domed tower.
export function missionComplex(group, course, {withChurch = true} = {}) {
  const {MISSION: M, terrainH} = course, g = new THREE.Group();
  const adobe = new THREE.MeshStandardMaterial({color: 0xd9c3a0, roughness: 0.95});
  const sand = new THREE.MeshStandardMaterial({color: 0xc9a77c, roughness: 0.95});
  const tile = new THREE.MeshStandardMaterial({color: 0xa8553a, roughness: 0.85});
  const dark = new THREE.MeshStandardMaterial({color: 0x3a2c24, roughness: 1});
  const base = terrainH(M.x, M.z);
  const walls = [], roofs = [];
  // Courtyard ranges (low adobe wings with tile roofs).
  for (const [x, z, sx, sz] of [[-30, 22, 60, 9], [-58, 0, 9, 44], [-30, -22, 60, 9]]) {
    walls.push(box(x, 3, z, sx, 6, sz));
    const r = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); // pyramid-ish hip roof
    r.rotateY(Math.PI / 4); r.scale(sx * 0.75, 2.4, sz * 0.75); r.translate(x, 7.1, z); roofs.push(r);
  }
  if (withChurch) {
    walls.push(box(14, 8, 0, 46, 16, 14));                       // nave
    const nave = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); nave.rotateY(Math.PI / 4); nave.scale(34, 5, 10.5); nave.translate(14, 18.4, 0); roofs.push(nave);
    walls.push(box(38.5, 10, 0, 3, 20, 16));                      // facade
    for (let k = 0; k < 7; k++) { const a = Math.PI * k / 6, rr = 6.2; walls.push(box(38.5, 20 + Math.sin(a) * 2.6, Math.cos(a) * rr, 2.6, 2.2, 2.4)); }
    // Moorish tower: square base, belfry, dome with lantern.
    const tx = 40, tz = -9.5;
    walls.push(box(tx, 11, tz, 7.5, 22, 7.5), box(tx, 24.5, tz, 6.2, 5, 6.2));
    const dome = new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(tx, 27, tz);
    const lantern = new THREE.CylinderGeometry(0.9, 1.1, 2.4, 8); lantern.translate(tx, 31.4, tz);
    const cap = new THREE.SphereGeometry(1.0, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(tx, 32.6, tz);
    g.add(mesh(merge([dome, lantern, cap]), sand));
    walls.push(box(tx, 14, -tz + 19, 5, 6, 5)); // small belfry on the other side
    const star = new THREE.CircleGeometry(1.4, 8); star.rotateY(Math.PI / 2); star.translate(40.1, 14.5, 0);
    const door = new THREE.PlaneGeometry(3, 5.5); door.rotateY(Math.PI / 2); door.translate(40.1, 2.75, 0);
    g.add(mesh(merge([star, door]), dark));
    for (const z of [-5, 5]) { const arch = new THREE.PlaneGeometry(1.5, 2.2); arch.rotateY(Math.PI / 2); arch.translate(tx + 3.12, 24.5, tz + z * 0.2); g.add(mesh(arch, dark)); }
  }
  g.add(mesh(merge(walls), adobe), mesh(merge(roofs), tile));
  g.position.set(M.x - 40, base - 0.5, M.z - 30); g.rotation.y = M.rot + Math.PI / 2; g.scale.setScalar(1.4);
  group.add(g);
  return g;
}

// Flat-topped cypress silhouette for far headlands (cheap).
function farCypress() {
  const canopy = coloured(mergeGeometries([blob(4.2, 1.6, 3.4, 0.6, 7.6, 0, 0), blob(3.0, 1.3, 2.6, -2.2, 6.6, 0.8, 0)]), '#263d26', 0.1, 71);
  const trunk = new THREE.CylinderGeometry(0.3, 0.55, 7, 3, 1, true); trunk.translate(0, 3.5, 0); trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.15, 0, -0.1, 0));
  return {canopy, trunk, bark: 0x4a3a2c};
}

// Low marine layer on the horizon out at sea (+X).
function marineLayer(group, {count = 40, seed = 9} = {}) {
  const r = rng(seed);
  const mats = [cloudTexture(5), cloudTexture(9), cloudTexture(14)].map(t => new THREE.SpriteMaterial({map: t, transparent: true, opacity: 0.75, depthWrite: false, fog: true, color: 0xffe6c8}));
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(mats[i % 3]), far = r();
    s.position.set(5200 + far * 5000, 40 + r() * 140 + far * 120, -6500 + r() * 13000);
    s.scale.set(1600 + r() * 2200, 160 + r() * 260, 1);
    group.add(s);
  }
}

export function buildDistant(group, course, {low}) {
  const {terrainH, coastDist} = course, r = rng(88);
  // Sea stacks and granite boulders off Point Lobos, Carmel Point and Pebble Beach.
  const stacks = [];
  const shoreRocks = (x0, x1, z0, z1, n, sMin, sMax) => {
    for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), d = coastDist(x, z);
      if (d > 4 || d < -90) continue;
      const s = sMin + r() * (sMax - sMin);
      stacks.push({x, y: Math.min(-1, terrainH(x, z)) + s * 0.25, z, s, sy: s * (0.6 + r() * 0.9), sz: s * (0.7 + r() * 0.5), rx: r() * 0.3, ry: r() * 6}); i++;
    }
  };
  shoreRocks(1700, 4600, -3400, -2400, low ? 40 : 90, 6, 22);   // Point Lobos
  shoreRocks(420, 760, -1300, -620, low ? 20 : 45, 2, 7);        // Carmel Point
  shoreRocks(800, 2400, 1300, 2700, low ? 25 : 50, 4, 14);       // Pebble Beach
  shoreRocks(350, 440, -560, -300, 10, 1, 3);                    // south end of the beach
  flora.rocks(group, stacks, {color: 0x5e574f});
  // Cypress silhouettes along the headlands (scaled up a little so they read at distance).
  const pts = flora.scatter({count: low ? 200 : 450, x0: 400, x1: 4600, z0: -3500, z1: 2800, seed: 61, accept: (x, z) => {
    const d = coastDist(x, z);
    if (d < 8 || d > 260) return false;
    const lobos = x > 1500 && z < -2300, point = z < -620 && z > -1350, pebble = z > 1150;
    if (!lobos && !point && !pebble) return false;
    return terrainH(x, z);
  }}).map(p => ({...p, s: 1.2 + p.r * 0.8, rot: p.r * 6.28}));
  flora.trees(group, farCypress, pts, {cast: false});
  // Mission compound (adobe wings; the church comes from the catalogue when available).
  marineLayer(group, {count: low ? 8 : 16});
  flora.cloudBank(group, {count: low ? 5 : 10, x0: -6000, x1: 2000, z0: -7000, z1: -4000, y0: 300, y1: 900, opacity: 0.5});
}
