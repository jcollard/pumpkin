// The bay side of Monterey: Fisherman's Wharf on its pilings with shacks, the
// breakwater with sea lions, the marina, sailboats, kayaks among the kelp,
// rocky shore, the shoreline trail on the old railway bed and Point Pinos light.
import * as THREE from 'three';
import * as T from '../../textures.js';
import {rng, fbm} from '../../noise.js';
import {samples, merge, mesh, rod, box, coloured, blob} from '../../env/geom.js';
import * as flora from '../../env/flora.js';
import {loadModel} from '../../env/models.js';
import {consolidate} from './consolidate.js';
import {pbr} from '../../env/surface.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DECK_Y = 3.3;

// Instance every mesh of a loaded model at many transforms; returns set(i, Matrix4) for animation.
export async function instanceModel(group, path, mats, {cast = true} = {}) {
  const tpl = await loadModel(path);
  if (!tpl || !mats.length) return null;
  tpl.updateMatrixWorld(true);
  const parts = [];
  tpl.traverse(o => { if (o.isMesh) parts.push(o); });
  const meshes = parts.map(part => {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
    inst.castShadow = cast; inst.receiveShadow = true;
    group.add(inst); return inst;
  });
  const tmp = new THREE.Matrix4();
  const set = (i, m) => parts.forEach((part, k) => { meshes[k].setMatrixAt(i, tmp.multiplyMatrices(m, part.matrixWorld)); });
  mats.forEach((m, i) => set(i, m));
  return {meshes, set, done: () => meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); })};
}
const M = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

function labelTex(text, bg, fg) {
  return T.signTexture([text], {bg, fg, border: null, planks: false, w: 512, h: 96, font: 'bold 56px'});
}

export async function coast(group, course, {low = false} = {}) {
  const {WHARF, coastZ, terrainH} = course;
  const updates = [];
  const r = rng(404);
  const woodMat = new THREE.MeshStandardMaterial({map: T.woodTexture(63, true), color: 0xb8aa96, roughness: 0.9});

  // --- Fisherman's Wharf: plank deck on a forest of pilings ---
  const tl = new THREE.TextureLoader();
  const plank = tl.load('assets/textures/wood_planks/color.jpg'); plank.colorSpace = THREE.SRGBColorSpace;
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.anisotropy = 8;
  const deckMat = new THREE.MeshStandardMaterial({map: plank, color: 0xc9bba6, roughness: 0.92});
  const wx0 = WHARF.x - WHARF.half, wx1 = WHARF.x + WHARF.half;
  const deck = new THREE.BoxGeometry(wx1 - wx0, 0.45, WHARF.z1 - WHARF.z0);
  const uv = deck.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (wx1 - wx0) / 1.5, uv.getY(i) * (WHARF.z1 - WHARF.z0) / 1.5);
  deck.translate(WHARF.x, DECK_Y - 0.22, (WHARF.z0 + WHARF.z1) / 2);
  // Wide head of the wharf with restaurants.
  const head = new THREE.BoxGeometry(46, 0.45, 34); head.translate(WHARF.x + 6, DECK_Y - 0.22, WHARF.z1 - 10);
  const huv = head.attributes.uv; for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) * 30, huv.getY(i) * 22);
  // Approach ramp from the waterfront road.
  const ramp = new THREE.BoxGeometry(12, 0.4, 18); ramp.translate(WHARF.x, DECK_Y - 0.4, WHARF.z0 - 6);
  group.add(mesh(merge([deck, head, ramp]), deckMat));
  const pileMats = [];
  for (let z = WHARF.z0 + 2; z < WHARF.z1 + 6; z += 3.6) for (let x = wx0 + 0.6; x <= wx1; x += 3.0) pileMats.push(M(x, -3, z));
  for (let z = WHARF.z1 - 26; z < WHARF.z1 + 7; z += 3.6) for (let x = WHARF.x - 16; x <= WHARF.x + 28; x += 3.4) if (x < wx0 || x > wx1) pileMats.push(M(x, -3, z));
  const pileGeo = new THREE.CylinderGeometry(0.2, 0.24, 6.3, 7); pileGeo.translate(0, 3.0, 0);
  const piles = new THREE.InstancedMesh(pileGeo, new THREE.MeshStandardMaterial({color: 0x3f3329, roughness: 1}), pileMats.length);
  pileMats.forEach((m, i) => piles.setMatrixAt(i, m)); piles.castShadow = !low; piles.receiveShadow = true; group.add(piles);
  // Railings.
  const rail = [];
  for (const x of [wx0 + 0.15, wx1 - 0.15]) {
    for (let z = WHARF.z0; z < WHARF.z1 - 27; z += 2.4) rail.push(box(x, DECK_Y + 0.5, z, 0.12, 1.0, 0.12));
    for (const h of [0.55, 1.0]) rail.push(box(x, DECK_Y + h, (WHARF.z0 + WHARF.z1 - 27) / 2, 0.08, 0.08, WHARF.z1 - 27 - WHARF.z0));
  }
  group.add(mesh(merge(rail), woodMat));

  // Shacks along the wharf: bright clapboard boxes with gable roofs and painted signs.
  const SHACKS = [['FISH MARKET', '#d8cfb8', '#2f5f7a'], ['CLAM CHOWDER', '#e7c25a', '#8a2b20'], ['BAIT & TACKLE', '#6f9aa8', '#f4ead2'],
    ['WHALE WATCH TOURS', '#c2553a', '#f6efe0'], ['FRESH CRAB', '#f0ebe0', '#a8352a'], ['SALTWATER TAFFY', '#e79fb0', '#5b2235'],
    ['OYSTER BAR', '#8aa37a', '#f6efe0'], ['SPORT FISHING', '#2f5f7a', '#f6efe0'], ['ICE CREAM', '#f2dfb0', '#6a3a1e'], ['GALLERY', '#b39cc4', '#2a1e33']];
  const shackParts = [], roofParts = [], signQuads = [];
  // All wharf signs share one canvas atlas: 12 rows of 1024x80.
  const ac = document.createElement('canvas'); ac.width = 1024; ac.height = 1024;
  const ag = ac.getContext('2d'), ROWS = 12;
  const atlasRow = (i, text, bg, fg) => {
    const y = i * 1024 / ROWS, h = 1024 / ROWS;
    ag.fillStyle = bg; ag.fillRect(0, y, 1024, h);
    ag.strokeStyle = fg; ag.lineWidth = 4; ag.strokeRect(8, y + 6, 1008, h - 12);
    ag.fillStyle = fg; ag.font = 'bold 54px Georgia, "Times New Roman", serif'; ag.textAlign = 'center'; ag.textBaseline = 'middle';
    ag.fillText(text, 512, y + h / 2 + 2, 980);
    return [1 - (i + 1) / ROWS, 1 - i / ROWS];
  };
  const signQuad = (cx, cy, cz, w, h, ry, [v0, v1]) => {
    const g = new THREE.PlaneGeometry(w, h); const uvA = g.attributes.uv;
    for (let i = 0; i < uvA.count; i++) uvA.setY(i, uvA.getY(i) > 0.5 ? v1 : v0);
    g.rotateY(ry); g.translate(cx, cy, cz); signQuads.push(g);
  };
  let k = 0;
  for (let z = WHARF.z0 + 22; z < WHARF.z1 - 34; z += 13) for (const s of [-1, 1]) {
    const [name, wall, ink] = SHACKS[k % SHACKS.length], w = 5.2 + r() * 2, d = 5.5 + r() * 3, h = 3.6 + r() * 1.4;
    const cx = WHARF.x + s * (WHARF.half - d / 2 - 0.8);
    shackParts.push(coloured(box(cx, DECK_Y + h / 2, z, d, h, w), wall, 0.04, k));
    const roof = new THREE.CylinderGeometry(0.01, d * 0.62, w + 0.6, 4, 1); roof.rotateX(Math.PI / 2); roof.rotateZ(Math.PI / 4); roof.scale(1, 0.45, 1);
    roof.translate(cx, DECK_Y + h + d * 0.18, z); roofParts.push(coloured(roof, '#5d4a42', 0.08, k));
    const row = k < SHACKS.length ? atlasRow(k, name, wall === '#f0ebe0' ? '#2f5f7a' : '#f4efe3', ink) : [1 - ((k % SHACKS.length) + 1) / ROWS, 1 - (k % SHACKS.length) / ROWS];
    signQuad(cx - s * (d / 2 + 0.04), DECK_Y + h - 0.6, z, w * 0.85, w * 0.85 * 85 / 1024 * 1.25, -s * Math.PI / 2, row);
    k++;
  }
  // Restaurant at the head of the wharf.
  shackParts.push(coloured(box(WHARF.x + 6, DECK_Y + 2.8, WHARF.z1 - 6, 30, 5.6, 14), '#e9e2d2', 0.04, 3));
  const rr = new THREE.CylinderGeometry(0.01, 11, 32, 4, 1); rr.rotateZ(Math.PI / 2); rr.rotateX(Math.PI / 4); rr.scale(1, 0.32, 1); rr.translate(WHARF.x + 6, DECK_Y + 5.6 + 2.4, WHARF.z1 - 6);
  roofParts.push(coloured(rr, '#3d5a6a', 0.06, 9));
  group.add(mesh(merge(shackParts), new THREE.MeshStandardMaterial({vertexColors: true, map: T.woodTexture(64, true), roughness: 0.85})));
  group.add(mesh(merge(roofParts), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8})));
  signQuad(WHARF.x + 6, DECK_Y + 4.3, WHARF.z1 - 13.05, 16, 1.25, Math.PI, atlasRow(10, "CAPTAIN LOU'S SEAFOOD GROTTO", '#e9e2d2', '#3d5a6a'));
  signQuad(WHARF.x, DECK_Y + 5.4, WHARF.z0 - 1, 9, 0.7, Math.PI, atlasRow(11, "OLD FISHERMAN'S WHARF", '#2f5f7a', '#f4efe3'));
  const atlasTex = new THREE.CanvasTexture(ac); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8;
  group.add(mesh(merge(signQuads), new THREE.MeshStandardMaterial({map: atlasTex, roughness: 0.8}), {cast: false}));
  // Entrance arch over the wharf approach.
  const arch = [];
  for (const s of [-1, 1]) arch.push(box(WHARF.x + s * 4.8, DECK_Y + 2.9, WHARF.z0 - 0.9, 0.35, 5.8, 0.35));
  arch.push(box(WHARF.x, DECK_Y + 5.4, WHARF.z0 - 0.85, 10, 0.9, 0.25));
  group.add(mesh(merge(arch), woodMat));

  // --- Breakwater: a rock jetty sheltering the marina, with sea lions on it ---
  const bw = t => V(1004 - 22 * t, 0, 44 + 205 * t + 30 * t * t);
  const rocks = [];
  for (let t = 0; t <= 1; t += 0.008) {
    const p = bw(t);
    for (let j = 0; j < 3; j++) rocks.push({x: p.x + (r() - 0.5) * 7, y: -0.6 + r() * 0.8, z: p.z + (r() - 0.5) * 3, s: 1.3 + r() * 1.5, sy: 1.0 + r() * 1.4, rx: r(), ry: r() * 6});
  }
  // Rocky shore along the Pacific Grove coast.
  for (let x = -260; x < 820; x += low ? 6 : 3.2) {
    const cz = coastZ(x);
    if (r() < 0.25) continue;
    rocks.push({x: x + r() * 3, y: -0.8 + r() * 0.6, z: cz + (r() - 0.3) * 16, s: 0.8 + r() * 2.6, sy: 0.6 + r() * 1.4, rx: r(), ry: r() * 6});
  }
  for (let i = 0; i < 30; i++) { const x = -200 + r() * 1000, z = coastZ(x) + 25 + r() * 90; rocks.push({x, y: -1.5, z, s: 2 + r() * 4, sy: 1.5 + r() * 2.5, rx: r(), ry: r() * 6}); }
  flora.rocks(group, rocks, {color: 0x6b645c});

  // Sea lions on the breakwater and on two offshore rocks, gulls on the rocks.
  const lionMats = [], lionSpots = [];
  for (let i = 0; i < (low ? 9 : 18); i++) {
    const t = 0.3 + (i / 18) * 0.68, p = bw(t), side = i % 2 ? 1 : -1;
    const m = {x: p.x + side * (1.2 + r() * 1.5), y: 1.0 + r() * 0.5, z: p.z + (r() - 0.5) * 2, ry: r() * 6.28, s: 0.9 + r() * 0.35, ph: r() * 6};
    lionSpots.push(m); lionMats.push(M(m.x, m.y, m.z, m.ry, m.s));
  }
  // A few more hauled out on rocks just below the seawall by the finish, where the victory lap sees them.
  const nearRocks = [];
  for (const [x, dz, ry] of [[1016, 3.2, 0.4], [1027, 2.6, 2.6], [1034, 3.6, 4.2], [1052, 2.8, 1.2], [1068, 3.4, 5.4]]) {
    const z = coastZ(x) + dz;
    nearRocks.push({x, y: -0.7, z, s: 1.7, sy: 1.1, rx: 0.2, ry});
    const m = {x, y: 0.62, z, ry, s: 0.95, ph: r() * 6};
    lionSpots.push(m); lionMats.push(M(m.x, m.y, m.z, m.ry, m.s));
  }
  flora.rocks(group, nearRocks, {color: 0x5f5850});
  const lions = await instanceModel(group, 'assets/models/animals/sea_lion.glb', lionMats);
  if (lions) {
    lions.done();
    const tmpM = new THREE.Matrix4();
    updates.push(wall => { // heads up to bark now and then
      lionSpots.forEach((m, i) => {
        const bark = Math.max(0, Math.sin(wall * 0.9 + m.ph * 3)) ** 6;
        lions.set(i, tmpM.compose(V(m.x, m.y, m.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18 * bark + 0.04 * Math.sin(wall * 9 + m.ph) * bark, m.ry, 0)), V(m.s, m.s, m.s)));
      });
      lions.meshes.forEach(x => { x.instanceMatrix.needsUpdate = true; });
    });
  }
  const gullMats = [];
  for (let i = 0; i < 10; i++) { const p = bw(0.15 + r() * 0.8); gullMats.push(M(p.x + (r() - 0.5) * 3, 1.6 + r() * 0.6, p.z + (r() - 0.5) * 2, r() * 6)); }
  for (let z = WHARF.z0 + 8; z < WHARF.z1 - 30; z += 19) gullMats.push(M(WHARF.x - WHARF.half + 0.15, DECK_Y + 1.05, z, r() * 6));
  (await instanceModel(group, 'assets/models/animals/seagull_standing.glb', gullMats, {cast: false}))?.done();
  (await instanceModel(group, 'assets/models/animals/pelican_brown.glb', [M(wx1 - 0.2, DECK_Y + 1.05, WHARF.z0 + 30, 1.2), M(wx1 - 0.2, DECK_Y + 1.05, WHARF.z0 + 44, 2.0), M(bw(0.95).x, 1.7, bw(0.95).z, 0.4)], {cast: false}))?.done();

  // Gulls wheeling over the waterfront.
  const flyers = [];
  for (let i = 0; i < 12; i++) flyers.push({cx: 900 + r() * 220, cz: 30 + r() * 140, rad: 15 + r() * 40, h: 14 + r() * 26, sp: (0.12 + r() * 0.15) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28});
  const gulls = await instanceModel(group, 'assets/models/animals/seagull_flying.glb', flyers.map(() => M(0, -50, 0)), {cast: false});
  if (gulls) {
    gulls.meshes.forEach(m => { m.frustumCulled = false; });
    const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    updates.push(wall => {
      flyers.forEach((f, i) => {
        const a = wall * f.sp + f.ph;
        e.set(0, -a + (f.sp > 0 ? 0 : Math.PI), (f.sp > 0 ? -1 : 1) * 0.35 + 0.1 * Math.sin(wall * 2 + f.ph));
        q.setFromEuler(e);
        gulls.set(i, tmpM.compose(V(f.cx + Math.cos(a) * f.rad, f.h + Math.sin(wall * 0.7 + f.ph) * 2, f.cz + Math.sin(a) * f.rad), q, V(1.2, 1.2, 1.2)));
      });
      gulls.meshes.forEach(x => { x.instanceMatrix.needsUpdate = true; });
    });
  }

  // --- Boats: trawlers at the wharf and in the marina, sailboats and kayaks on the bay ---
  const moored = [[WHARF.x + WHARF.half + 5, WHARF.z0 + 60, Math.PI / 2], [WHARF.x + WHARF.half + 5, WHARF.z0 + 92, Math.PI / 2 + 0.05],
    [WHARF.x - WHARF.half - 5, WHARF.z0 + 120, -Math.PI / 2], [1040, 150, 0.4], [1050, 110, 0.2]];
  const white = moored.filter((_, i) => i % 2 === 0), green = moored.filter((_, i) => i % 2 === 1);
  (await instanceModel(group, 'assets/models/harbor/boat_fishing_white.glb', white.map(([x, z, ry]) => M(x, -1.0, z, ry))))?.done();
  (await instanceModel(group, 'assets/models/harbor/boat_fishing_green.glb', green.map(([x, z, ry]) => M(x, -1.0, z, ry))))?.done();
  const rowMats = [];
  for (let i = 0; i < 6; i++) rowMats.push(M(1018 + r() * 50, -0.12, 70 + r() * 90, r() * 6));
  (await instanceModel(group, 'assets/models/harbor/rowboat.glb', rowMats))?.done();
  // Marina floating docks.
  const docks = [];
  for (let i = 0; i < 4; i++) docks.push(box(1030 + i * 13, 0.35, 105, 1.6, 0.4, 70));
  group.add(mesh(merge(docks), woodMat, {cast: false}));

  // Sailboats: instanced hulls (white or navy) and rigging (mast + sails); they drift and heel.
  const hullGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); hullGeo.scale(4.5, 0.9, 1.3); hullGeo.translate(0, 0.55, 0);
  const mastG = new THREE.CylinderGeometry(0.06, 0.08, 12, 5); mastG.translate(0.5, 6, 0);
  const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.computeVertexNormals(); return g; };
  const mainG = tri([0.5, 1.2, 0, -3.2, 1.25, 0, 0.5, 11.6, 0]); mainG.rotateY(0.25);
  const jibG = tri([0.9, 1.1, 0, 4.3, 0.95, 0, 0.7, 10.3, 0]); jibG.rotateY(-0.15);
  const rigGeo = merge([mastG, mainG, jibG]);
  const nSail = low ? 6 : 12, sailboats = [];
  const hulls = new THREE.InstancedMesh(hullGeo, new THREE.MeshStandardMaterial({roughness: 0.45}), nSail);
  const rigs = new THREE.InstancedMesh(rigGeo, new THREE.MeshStandardMaterial({color: 0xf4f1ea, roughness: 0.7, side: THREE.DoubleSide}), nSail);
  for (let i = 0; i < nSail; i++) {
    const x = 300 + r() * 1300, z = Math.max(coastZ(x) + 120, 260 + r() * 900), sc = 0.8 + r() * 0.5;
    hulls.setColorAt(i, new THREE.Color(i % 4 === 1 ? 0x1d3c5a : i % 4 === 3 ? 0x8a2a22 : 0xf2f2ee));
    sailboats.push({x, z, sc, heading: r() * 6.28, sp: 1.2 + r() * 1.5, ph: r() * 6});
  }
  for (const m of [hulls, rigs]) { m.castShadow = true; m.frustumCulled = false; group.add(m); }
  const sm = new THREE.Matrix4(), sq = new THREE.Quaternion(), se = new THREE.Euler(), sv = V(0, 0, 0), ss = V(1, 1, 1);
  updates.push(wall => {
    sailboats.forEach((s, i) => {
      const d = Math.sin(wall * s.sp / 300 + s.ph) * 250;
      sv.set(s.x + Math.cos(s.heading) * d, Math.sin(wall * 0.8 + s.ph) * 0.12, s.z + Math.sin(s.heading) * d);
      se.set(Math.sin(wall * 0.6 + s.ph) * 0.03, -s.heading, -0.14 + Math.sin(wall * 0.5 + s.ph) * 0.04); sq.setFromEuler(se); ss.setScalar(s.sc);
      sm.compose(sv, sq, ss); hulls.setMatrixAt(i, sm); rigs.setMatrixAt(i, sm);
    });
    hulls.instanceMatrix.needsUpdate = rigs.instanceMatrix.needsUpdate = true;
  });

  // Kayaks among the kelp off Cannery Row: instanced hulls plus paddlers.
  const kHull = new THREE.CapsuleGeometry(0.3, 3.4, 4, 8); kHull.rotateZ(Math.PI / 2); kHull.scale(1, 0.55, 1); kHull.translate(0, 0.05, 0);
  const kBody = coloured(new THREE.CapsuleGeometry(0.2, 0.45, 3, 6).translate(0, 0.55, 0), '#d94a3a', 0.05, 1);
  const kHead = coloured(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.0, 0), '#d9a27d', 0.02, 2);
  const kPad = coloured(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 4).rotateX(Math.PI / 2).rotateY(0.4).translate(0, 0.78, 0), '#222222', 0, 3);
  const nK = low ? 5 : 10, kayaks = [];
  const kh = new THREE.InstancedMesh(kHull, new THREE.MeshStandardMaterial({roughness: 0.5}), nK);
  const kp = new THREE.InstancedMesh(merge([kBody, kHead, kPad]), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8}), nK);
  const kayakCols = [0xf2c230, 0xe2512c, 0x2f8f5a, 0xe58b37, 0x2f6db3];
  for (let i = 0; i < nK; i++) {
    const x = 760 + r() * 280, z = coastZ(x) + 25 + r() * 110;
    kh.setColorAt(i, new THREE.Color(kayakCols[i % 5]));
    kayaks.push({x, z, ph: r() * 6, sp: (0.3 + r() * 0.4) * (r() < 0.5 ? 1 : -1), heading: r() * 6});
  }
  for (const m of [kh, kp]) { m.castShadow = true; m.frustumCulled = false; group.add(m); }
  updates.push(wall => {
    kayaks.forEach((k3, i) => {
      const d = Math.sin(wall * 0.02 * k3.sp + k3.ph) * 30;
      sv.set(k3.x + Math.cos(k3.heading) * d, Math.sin(wall * 1.1 + k3.ph) * 0.05, k3.z + Math.sin(k3.heading) * d);
      se.set(Math.sin(wall * 1.3 + k3.ph) * 0.05, -k3.heading, 0); sq.setFromEuler(se); ss.setScalar(1);
      sm.compose(sv, sq, ss); kh.setMatrixAt(i, sm);
      se.set(0, -k3.heading + Math.sin(wall * 2.2 + k3.ph) * 0.35, Math.sin(wall * 2.2 + k3.ph) * 0.25); sq.setFromEuler(se);
      sm.compose(sv, sq, ss); kp.setMatrixAt(i, sm);
    });
    kh.instanceMatrix.needsUpdate = kp.instanceMatrix.needsUpdate = true;
  });

  // Kelp canopy floating on the water.
  const kc = document.createElement('canvas'); kc.width = kc.height = 256;
  const kg = kc.getContext('2d'), kr = rng(55);
  for (let i = 0; i < 70; i++) {
    const x = 128 + (kr() - 0.5) * 200, y = 128 + (kr() - 0.5) * 200, a = kr() * 6.28, l = 30 + kr() * 70;
    kg.strokeStyle = `rgba(${90 + kr() * 40},${80 + kr() * 30},${30 + kr() * 20},${0.75})`; kg.lineWidth = 3 + kr() * 5; kg.lineCap = 'round';
    kg.beginPath(); kg.moveTo(x, y); kg.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); kg.stroke();
    kg.fillStyle = 'rgba(120,100,40,.9)'; kg.beginPath(); kg.arc(x, y, 3 + kr() * 3, 0, 7); kg.fill();
  }
  const kelpTex = new THREE.CanvasTexture(kc); kelpTex.colorSpace = THREE.SRGBColorSpace;
  const kelpGeo = new THREE.PlaneGeometry(14, 14); kelpGeo.rotateX(-Math.PI / 2);
  const kelpMats = [];
  for (let i = 0; i < (low ? 60 : 140); i++) {
    const x = 380 + r() * 700, cz = coastZ(x), z = cz + 30 + Math.abs(fbm(x / 80, i, 2)) * 140 + r() * 40;
    if (x > 975 && x < 1110 && z < 280) continue; // keep the harbour clear
    kelpMats.push(new THREE.Matrix4().compose(V(x, 0.04 + (i % 7) * 0.004, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r() * 6), V(0.7 + r() * 1.2, 1, 0.7 + r() * 1.2)));
  }
  const kelp = new THREE.InstancedMesh(kelpGeo, new THREE.MeshStandardMaterial({map: kelpTex, transparent: true, depthWrite: false, roughness: 0.6}), kelpMats.length);
  kelpMats.forEach((m, i) => kelp.setMatrixAt(i, m)); kelp.receiveShadow = false; kelp.renderOrder = 1; group.add(kelp);

  // --- Shoreline recreation trail on the old railway bed, with rails and benches ---
  const trailZ = x => coastZ(x) - 20 - 4 * Math.sin(x / 90);
  const xs = samples(-120, 812, 2);
  const trail = [], rails = [];
  const ty = (x, z) => Math.max(0.6, terrainH(x, z)) + 0.06;
  const pos = [], tuv = [], idx = [];
  xs.forEach((x, i) => {
    const z = trailZ(x);
    for (const [j, dz] of [[0, -1.6], [1, 1.6]]) { pos.push(x, ty(x, z + dz), z + dz); tuv.push(x / 3, j); }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  trail.push(tg);
  const trailMat = new THREE.MeshStandardMaterial({color: 0xb7aa92, map: T.concreteTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2});
  group.add(mesh(tg, trailMat, {cast: false}));
  for (let i = 0; i < xs.length - 1; i += 1) for (const dz of [-0.72, 0.72]) {
    const xa = xs[i], xb = xs[i + 1], za = trailZ(xa) + dz + 2.6, zb = trailZ(xb) + dz + 2.6;
    rails.push(rod(V(xa, ty(xa, za) + 0.1, za), V(xb, ty(xb, zb) + 0.1, zb), 0.04, 3));
  }
  group.add(mesh(merge(rails), new THREE.MeshStandardMaterial({color: 0x6b4a36, roughness: 0.6, metalness: 0.4}), {cast: false}));
  const benchMats = [];
  for (let x = -60; x < 800; x += 70) { const z = trailZ(x) - 2.6; benchMats.push(M(x, ty(x, z) - 0.05, z, Math.PI)); }
  (await instanceModel(group, 'assets/models/props/bench.glb', benchMats, {cast: false}))?.done();

  // --- Point Pinos lighthouse: a Cape Cod house with the tower rising from its roof ---
  const lx = -1040, lz = 452, ly = Math.max(1, terrainH(lx, lz));
  const lh = new THREE.Group(), whiteM = new THREE.MeshStandardMaterial({color: 0xf1ece0, roughness: 0.7});
  const houseB = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 9), whiteM); houseB.position.y = 2.5;
  const roofG = new THREE.CylinderGeometry(0.01, 7.6, 13, 4, 1); roofG.rotateZ(Math.PI / 2); roofG.rotateX(Math.PI / 4); roofG.scale(1, 0.42, 1);
  const roofM = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({color: 0x7a2c22, roughness: 0.75})); roofM.position.y = 7.2;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 7, 10), whiteM); tower.position.y = 9.5;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.3, 12), new THREE.MeshStandardMaterial({color: 0x222222})); gallery.position.y = 13.1;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10), new THREE.MeshStandardMaterial({color: 0xfff1c0, emissive: 0xffd77a, emissiveIntensity: 2.2})); lamp.position.y = 14.2;
  const capL = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 10), new THREE.MeshStandardMaterial({color: 0x7a2c22})); capL.position.y = 15.8;
  lh.add(houseB, roofM, tower, gallery, lamp, capL); lh.position.set(lx, ly, lz); lh.scale.setScalar(1.5); lh.rotation.y = 0.3;
  lh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(lh);
  consolidate(lh, group);

  // --- Waterfront plaza past the finish: worn concrete, lamps, bollards, stalls and fishing gear ---
  const set = pbr('concrete_weathered');
  const plazaMat = new THREE.MeshStandardMaterial({map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, color: 0xc9c0b0, roughness: 1});
  const px0 = 996, px1 = 1124, pz0 = -9.5, nx = 64, nzs = 24;
  const ppos = [], puv = [], pidx = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nzs; j++) {
    const x = px0 + (px1 - px0) * i / nx, zTop = coastZ(x) - 2.5, z = pz0 + (zTop - pz0) * j / nzs;
    ppos.push(x, terrainH(x, z) + 0.05, z); puv.push(x / 3.5, z / 3.5);
    if (i && j) { const a = (i - 1) * (nzs + 1) + j - 1, b = a + 1, c = a + nzs + 1, d = c + 1; pidx.push(a, b, c, b, d, c); }
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
  pg.setIndex(pidx); pg.computeVertexNormals();
  const plaza = new THREE.Mesh(pg, plazaMat); plaza.receiveShadow = true; group.add(plaza);
  // Seawall cap along the water's edge and a low railing.
  const wall = [], railing = [];
  for (let x = 960; x < 1150; x += 2) {
    const za = coastZ(x) - 2.5, zb = coastZ(x + 2) - 2.5;
    wall.push(box(x + 1, Math.max(terrainH(x, za), 0.6) - 0.6, (za + zb) / 2, 2.05, 2.0, 0.7));
    if (x < WHARF.x - 7 || x > WHARF.x + 7) railing.push(rod(V(x, terrainH(x, za) + 1.0, za), V(x + 2, terrainH(x + 2, zb) + 1.0, zb), 0.03, 4), rod(V(x, terrainH(x, za), za), V(x, terrainH(x, za) + 1.0, za), 0.035, 4));
  }
  group.add(mesh(merge(wall), new THREE.MeshStandardMaterial({map: set.map, color: 0xb5ad9f, roughness: 1})));
  group.add(mesh(merge(railing), new THREE.MeshStandardMaterial({color: 0x2d3e36, roughness: 0.5, metalness: 0.5}), {cast: false}));
  const bollards = [], lampsW = [];
  for (let x = 1004; x < 1120; x += 6) { const z = coastZ(x) - 4; bollards.push(rod(V(x, terrainH(x, z) - 0.1, z), V(x, terrainH(x, z) + 0.55, z), 0.14, 8)); }
  for (const [x, z] of [[1010, 12], [1034, 13], [1058, 12], [1080, 10], [1104, 12], [1128, 10]]) {
    const y = terrainH(x, z);
    lampsW.push(rod(V(x, y, z), V(x, y + 4.4, z), 0.07, 6), rod(V(x - 0.5, y + 4.2, z), V(x + 0.5, y + 4.2, z), 0.04, 4));
    for (const dx of [-0.5, 0.5]) { const gl = new THREE.SphereGeometry(0.2, 8, 6); gl.translate(x + dx, y + 4.0, z); lampsW.push(gl); }
  }
  group.add(mesh(merge([...bollards, ...lampsW]), new THREE.MeshStandardMaterial({color: 0x26332d, roughness: 0.45, metalness: 0.5})));
  const stallMats = [M(1016, terrainH(1016, 18), 18, Math.PI, 1), M(1046, terrainH(1046, 19), 19, Math.PI + 0.1, 1), M(1112, terrainH(1112, 16), 16, Math.PI - 0.1, 1)];
  (await instanceModel(group, 'assets/models/props/market_stand_a.glb', stallMats.slice(0, 2)))?.done();
  (await instanceModel(group, 'assets/models/props/market_stand_b.glb', stallMats.slice(2)))?.done();
  const gear = [];
  for (let i = 0; i < 9; i++) { const x = 1020 + r() * 90, z = 14 + r() * 12; gear.push(M(x, terrainH(x, z), z, r() * 6)); }
  (await instanceModel(group, 'assets/models/harbor/bucket_fish.glb', gear.slice(0, 4)))?.done();
  (await instanceModel(group, 'assets/models/props/crate_open.glb', gear.slice(4)))?.done();
  // Lobster traps stacked by the seawall (simple wire boxes).
  const traps = [];
  for (let i = 0; i < 14; i++) {
    const x = 1060 + (i % 5) * 1.0 + r() * 0.2, z = coastZ(1060) - 5 - Math.floor(i / 5) * 0.75, y = terrainH(x, z) + 0.22 + (i % 2) * 0;
    traps.push(coloured(box(x, y, z, 0.9, 0.42, 0.62), i % 3 ? '#3f6b6a' : '#c0582c', 0.08, i));
  }
  group.add(mesh(merge(traps), new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8})));

  return {update: wall => { for (const u of updates) u(wall); }, trailZ, ty, bw};
}
