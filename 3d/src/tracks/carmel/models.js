// Catalogue models for Carmel (assets/CATALOG.md). Everything here is optional:
// if a file is missing the track falls back to its procedural scenery.
// Licences: see assets/tracks/carmel/LICENSES.md (CC0 Quaternius models; the
// mission, beach props and gulls are CC-BY 3.0 and credited there).
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {rng} from '../../noise.js';

const ROOT = 'assets/models/';
const loader = new GLTFLoader();
const cache = new Map();
export function gltf(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(ROOT + path).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }).catch(e => { console.warn('[carmel] could not load', path, e.message); return null; }));
  return cache.get(path);
}

export const FILES = {
  house: 'village/storybook_house.glb', inn: 'village/storybook_inn.glb',
  church: 'landmarks/mission_church.glb', tower: 'landmarks/mission_bell_tower.glb',
  dog: 'animals/dog_shiba.glb', farmer: 'people/farmer.glb', suit: 'people/man_suit.glb', woman: 'people/woman_casual.glb', beachGuy: 'people/beach_character.glb',
  umbRed: 'props/beach_umbrella_red.glb', umbBlue: 'props/beach_umbrella_blue.glb', chair: 'props/beach_chair.glb', lifeguard: 'props/lifeguard_tower.glb',
  gullFly: 'animals/seagull_flying.glb', gullStand: 'animals/seagull_standing.glb',
  duneGrass: 'plants/dune_grass.glb',
};

export async function loadLibrary() {
  const pairs = await Promise.all(Object.entries(FILES).map(async ([k, p]) => [k, await gltf(p)]));
  return Object.fromEntries(pairs);
}

// Many copies of a static model as InstancedMeshes (one per mesh part).
// points: [{x, y, z, rotY?, scale?}]. opts.recolor: {materialName: Color}.
export function instances(group, g, points, {cast = true, recolor = null} = {}) {
  if (!g || !points.length) return [];
  const tpl = g.scene; tpl.updateMatrixWorld(true);
  const out = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  tpl.traverse(part => {
    if (!part.isMesh) return;
    let mat = part.material;
    if (recolor) mat = Array.isArray(mat) ? mat.map(x => recolorMat(x, recolor)) : recolorMat(mat, recolor);
    const inst = new THREE.InstancedMesh(part.geometry, mat, points.length);
    points.forEach((pt, i) => {
      q.setFromAxisAngle(up, pt.rotY ?? 0);
      const sc = pt.scale ?? 1; Array.isArray(sc) ? s.set(...sc) : s.setScalar(sc);
      m.compose(p.set(pt.x, pt.y, pt.z), q, s).multiply(part.matrixWorld);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = cast; inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst); out.push(inst);
  });
  return out;
}
function recolorMat(mat, recolor) {
  const c = recolor[mat.name];
  if (!c) return mat;
  const m = mat.clone(); m.color = new THREE.Color(c); if (m.map && recolor._dropMaps) m.map = null;
  return m;
}

// A rigged character or animal: clone with its own mixer. Pose it by clip and time
// (pure function of time: pose(name, t) sets one clip's time and applies it).
export function rigged(g, {tint = null, cast = true} = {}) {
  if (!g) return null;
  const root = SkeletonUtils.clone(g.scene);
  if (tint) root.traverse(o => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = mats.map(mm => tint[mm.name] ? Object.assign(mm.clone(), {color: new THREE.Color(tint[mm.name])}) : mm); if (o.material.length === 1) o.material = o.material[0]; } });
  root.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of g.animations) {
    const short = clip.name.split('|').pop().replace(/^(Man|Female)_/, '');
    const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); actions[short] = {a, d: clip.duration};
  }
  const bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  let current = null;
  return {
    root, mixer, actions, bones,
    // Blend: [[clip, time, weight], ...]
    pose(list) {
      for (const k in actions) actions[k].a.setEffectiveWeight(0);
      for (const [name, t, w = 1] of list) { const A = actions[name]; if (!A) continue; A.a.setEffectiveWeight(w); A.a.time = ((t % A.d) + A.d) % A.d; }
      mixer.update(0);
      current = list;
    },
    duration: name => actions[name]?.d ?? 1,
  };
}

// --- Scenery from the catalogue ------------------------------------------
export async function addModels(group, course, {low, lib}) {
  if (!lib) return null;
  const r = rng(4242), {terrainH, coastDist, shoreX, MISSION} = course;
  const updates = [];
  let mission = false;

  // Mission across the bay: church with a domed bell tower beside it, scaled to read at distance.
  if (lib.church) {
    const g = new THREE.Group(), S = 2.2;
    const church = lib.church.scene.clone(true); church.scale.setScalar(S); g.add(church);
    if (lib.tower) { const t = lib.tower.scene.clone(true); t.scale.setScalar(S * 1.2); t.position.set(12 * S, 0, 1 * S); g.add(t); }
    g.position.set(MISSION.x, terrainH(MISSION.x, MISSION.z) - 0.4, MISSION.z); g.rotation.y = MISSION.rot;
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    group.add(g); mission = true;
  }

  // Beach life: umbrellas, loungers, a lifeguard tower, gulls.
  const beachSpot = (z, from = 10, to = 46) => { const sx = shoreX(z); const x = sx - from - r() * (to - from); return {x, y: terrainH(x, z), z}; };
  const umb = [], chairs = [];
  for (let i = 0; i < (low ? 8 : 18); i++) {
    const z = (r() < 0.5 ? -1 : 1) * (22 + r() * 230), p = beachSpot(z, 12, 40);
    umb.push({...p, rotY: r() * 6.28, kind: r() < 0.5});
    if (r() < 0.8) chairs.push({x: p.x + 1.2, y: terrainH(p.x + 1.2, p.z + 0.6), z: p.z + 0.6, rotY: Math.PI / 2 + (r() - 0.5) * 0.6});
  }
  instances(group, lib.umbRed, umb.filter(u => u.kind)); instances(group, lib.umbBlue, umb.filter(u => !u.kind));
  instances(group, lib.chair, chairs);
  if (lib.lifeguard) { const p = beachSpot(-118, 30, 31); instances(group, lib.lifeguard, [{...p, rotY: -Math.PI / 2}]); }
  if (lib.gullStand) instances(group, lib.gullStand, Array.from({length: 9}, () => { const p = beachSpot(-120 + r() * 300, 2, 14); return {...p, rotY: r() * 6.28}; }), {cast: false});
  if (lib.gullFly) {
    const gulls = Array.from({length: low ? 2 : 4}, (_, k) => {
      const o = lib.gullFly.scene.clone(true); o.traverse(m => { m.castShadow = false; }); group.add(o);
      return {o, cx: 300 + r() * 80, cz: -60 + r() * 140, rad: 25 + r() * 40, h: 14 + r() * 18, sp: 0.18 + r() * 0.1, ph: k * 1.7};
    });
    updates.push((t, wall) => { for (const g of gulls) { const a = wall * g.sp + g.ph; g.o.position.set(g.cx + Math.cos(a) * g.rad, g.h + Math.sin(a * 1.7) * 2, g.cz + Math.sin(a) * g.rad); g.o.rotation.set(0, -a, Math.sin(a * 2) * 0.25); } });
  }

  // Dogs on the beach (Carmel is famously dog friendly): gallop loops, walks with owners, one waiting at the finish.
  if (lib.dog) {
    const coats = [{Main: '#c27a3a'}, {Main: '#1f1b18', Main_Light: '#6b625a'}, {Main: '#e8dcc6'}, {Main: '#6b4426'}, {Main: '#a8a29a'}, {Main: '#d9a24e'}];
    const dogs = [];
    const run = (cx, cz, rx, rz, sp, coat, clip = 'Gallop', ph = 0) => { const d = rigged(lib.dog, {tint: coats[coat % coats.length], cast: false}); group.add(d.root); dogs.push({d, cx, cz, rx, rz, sp, clip, ph, scale: 1.0 + r() * 0.25}); };
    const sx0 = shoreX(0);
    run(sx0 - 14, -60, 9, 26, 0.32, 0); run(sx0 - 10, 50, 7, 20, 0.4, 1, 'Gallop', 2);
    if (!low) run(sx0 - 9, 4, 6, 14, 0.36, 4, 'Gallop', 4);
    // Dogs sitting with spectators near the finish.
    const sit = [{x: course.length + 6, z: -course.roadHalf - 2.2, coat: 2, rot: -Math.PI / 2}, {x: -16, z: 6.4, coat: 3, rot: Math.PI}];
    const sitting = sit.map(s => { const d = rigged(lib.dog, {tint: coats[s.coat]}); d.root.position.set(s.x, course.terrainH(s.x, s.z), s.z); d.root.rotation.y = s.rot; group.add(d.root); return {d, ph: r() * 5}; });
    updates.push((t, wall) => {
      for (const k of dogs) {
        const a = wall * k.sp + k.ph, x = k.cx + Math.cos(a) * k.rx, z = k.cz + Math.sin(a) * k.rz;
        const dx = -Math.sin(a) * k.rx, dz = Math.cos(a) * k.rz;
        k.d.root.position.set(x, Math.max(0.05, terrainH(x, z)), z);
        k.d.root.rotation.y = Math.atan2(dx, dz); k.d.root.scale.setScalar(k.scale);
        k.d.pose([[k.clip, wall * (k.clip === 'Gallop' ? 1.0 : 0.9) + k.ph]]);
      }
      for (const s of sitting) s.d.pose([['Idle', wall + s.ph]]);
    });
  }

  // People strolling at the waterline.
  if (lib.beachGuy || lib.woman) {
    const walkers = [];
    for (let i = 0; i < (low ? 1 : 2); i++) {
      const g = i % 2 ? lib.woman : lib.beachGuy; if (!g) continue;
      const pr = rigged(g, {cast: false}); group.add(pr.root);
      walkers.push({pr, z0: -200 + r() * 360, sp: (r() < 0.5 ? 1 : -1) * (0.9 + r() * 0.3), off: 6 + r() * 10, ph: r() * 10, len: 220});
    }
    updates.push((t, wall) => {
      for (const w of walkers) {
        const u = ((wall * w.sp / w.len + w.ph) % 2 + 2) % 2, back = u > 1, f = back ? 2 - u : u;
        const z = w.z0 - w.len / 2 + f * w.len, dir = (back ? -1 : 1) * Math.sign(w.sp), x = shoreX(z) - w.off;
        w.pr.root.position.set(x, terrainH(x, z), z); w.pr.root.rotation.y = dir > 0 ? 0 : Math.PI;
        w.pr.pose([['Walk', wall * 1.0 + w.ph]]);
      }
    });
  }
  void coastDist;
  return {mission, update: (t, wall, ctx) => { for (const u of updates) u(t, wall, ctx); }};
}
