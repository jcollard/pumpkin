// Big Sur: 500 m down a Highway 1-style cliff route, a jump across the cut-away
// middle of a Bixby Creek-style arch bridge, finish on the far abutment.
import * as THREE from 'three';
import * as P from '../../physics.js';
import * as T from '../../textures.js';
import {rng, fbm} from '../../noise.js';
import {samples, ribbon, beam, box, rod, merge, mesh, slopeAt} from '../../env/geom.js';
import * as props from '../../env/props.js';
import * as flora from '../../env/flora.js';
import * as dressing from '../../env/dressing.js';
import {createCourse} from './course.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function build(scene, renderer, course, {low = false} = {}) {
  const group = new THREE.Group();
  const {roadY, deckY, terrainH, archY, RAMP, GAP, BRIDGE, ARCH, DECK_HALF, coastZ, canyonCentre, canyonFloor} = course;
  const ROAD_HALF = course.roadHalf, FINISH = course.length;
  const mats = props.sharedMaterials(), timber = mats.timber, concrete = mats.concrete;

  props.dirtTrack(group, course, mats, {ranges: [[-420, RAMP[0]], [GAP[1], 1300]], bermRanges: [[-420, BRIDGE.start - 1], [BRIDGE.end + 1, 1300]]});

  // --- Timber kicker: deck exactly on the physics profile, on a timber frame ---
  const rampXs = samples(RAMP[0], GAP[0], 0.25);
  group.add(mesh(ribbon(rampXs, roadY, -ROAD_HALF, ROAD_HALF, 4), new THREE.MeshStandardMaterial({map: T.rampTexture(), roughness: 0.9}), {cast: false}));
  group.add(mesh(beam(rampXs, x => roadY(x) - 0.01, x => roadY(x) - 0.25, -ROAD_HALF, ROAD_HALF), timber));
  group.add(mesh(merge([
    beam(rampXs, x => roadY(x) + 0.35, x => roadY(x) - 0.1, ROAD_HALF - 0.14, ROAD_HALF + 0.06),
    beam(rampXs, x => roadY(x) + 0.35, x => roadY(x) - 0.1, -ROAD_HALF - 0.06, -ROAD_HALF + 0.14),
  ]), mats.wood));
  group.add(mesh(box(GAP[0] - 0.1, (roadY(GAP[0]) + deckY(GAP[0])) / 2, 0, 0.2, roadY(GAP[0]) - deckY(GAP[0]), ROAD_HALF * 2 + 0.2), timber));
  const frame = [];
  const zs = [-ROAD_HALF + 0.3, -1.3, 1.3, ROAD_HALF - 0.3];
  for (let x = RAMP[0] + 1; x <= GAP[0] - 0.3; x += 1.9) for (const z of zs) {
    const top = roadY(x) - 0.25, bot = deckY(x);
    if (top - bot > 0.2) frame.push(box(x, (top + bot) / 2, z, 0.18, top - bot, 0.18));
  }
  for (let h = 1.4; h < 6; h += 1.5) for (const z of zs) {
    const xs = samples(RAMP[0], GAP[0] - 0.3, 0.5).filter(x => roadY(x) - 0.25 - deckY(x) > h);
    if (xs.length > 1) { const a = xs[0], b = xs.at(-1); frame.push(box((a + b) / 2, deckY((a + b) / 2) + h, z, b - a, 0.14, 0.1, Math.atan2(deckY(b) - deckY(a), b - a))); }
  }
  for (let x = RAMP[0] + 2.9; x < GAP[0] - 2; x += 3.8) for (const z of [zs[0], zs[3]]) {
    const a = V(x, deckY(x) + 0.1, z), b = V(x + 1.9, Math.min(roadY(x + 1.9) - 0.3, deckY(x + 1.9) + 4), z);
    if (b.y > a.y + 0.3) frame.push(rod(a, b, 0.07, 4));
  }
  group.add(mesh(merge(frame), mats.wood));

  // --- Bridge deck, parapets, arch and piers (Bixby Creek inspired) ---
  const spans = [[BRIDGE.start, GAP[0]], [GAP[1], BRIDGE.end]];
  const deckParts = [];
  for (const [a, b] of spans) {
    const xs = samples(a, b, 0.5);
    deckParts.push(beam(xs, x => deckY(x) - 0.02, x => deckY(x) - 1.6, -DECK_HALF, DECK_HALF));
    for (const s of [-1, 1]) {
      const zA = s * (DECK_HALF - 0.35), zB = s * DECK_HALF, lo = Math.min(zA, zB), hi = Math.max(zA, zB);
      deckParts.push(beam(xs, x => deckY(x) + 1.05, x => deckY(x) + 0.85, lo, hi), beam(xs, x => deckY(x) + 0.32, x => deckY(x) - 0.02, lo, hi));
      for (let x = a + 0.3; x <= b - 0.3; x += 2.5) deckParts.push(box(x, deckY(x) + 0.5, s * (DECK_HALF - 0.175), 0.32, 1.1, 0.35));
      const wA = s * ROAD_HALF, wB = s * (DECK_HALF - 0.35);
      deckParts.push(beam(xs, x => deckY(x) + 0.12, x => deckY(x) - 0.1, Math.min(wA, wB), Math.max(wA, wB)));
    }
  }
  group.add(mesh(merge(deckParts), concrete));

  const struts = [];
  const archA = BRIDGE.center - ARCH.half, archB = BRIDGE.center + ARCH.half;
  for (const s of [-1, 1]) {
    const z = s * ARCH.ribZ;
    struts.push(beam(samples(archA, archB, 1), x => archY(x) + 1.3, x => archY(x) - 1.3, z - 0.9, z + 0.9));
    for (const x of [archA, archB]) { const ground = terrainH(x, z) - 3; struts.push(box(x, (archY(x) + ground) / 2, z, 5, archY(x) - ground + 2.6, 3.4)); }
  }
  for (let k = -7; k <= 7; k++) {
    const x = BRIDGE.center + k * 6.4;
    if (x > GAP[0] - 0.5 && x < GAP[1] + 0.5) continue;
    const top = deckY(x) - 1.6, bot = archY(x) + 1.2;
    if (top - bot < 0.4) continue;
    for (const s of [-1, 1]) struts.push(box(x, (top + bot) / 2, s * ARCH.ribZ, 1.25, top - bot, 1.25));
    struts.push(box(x, top - 0.45, 0, 1.0, 0.9, ARCH.ribZ * 2 + 1.25));
  }
  for (let x = archA + 3; x < archB - 3; x += 9.6) struts.push(box(x, archY(x), 0, 0.9, 1.4, ARCH.ribZ * 2));
  for (const x of [...samples(BRIDGE.start + 9, archA - 6, 9.5), ...samples(archB + 6, BRIDGE.end - 9, 9.5)]) {
    const top = deckY(x) - 1.6, ground = Math.min(terrainH(x, -ARCH.ribZ), terrainH(x, ARCH.ribZ)) - 1.5;
    if (top - ground < 1.5) continue;
    for (const s of [-1, 1]) struts.push(box(x, (top + ground) / 2, s * ARCH.ribZ, 1.7, top - ground, 1.7));
    for (let y = top - 0.5; y > ground + 4; y -= 14) struts.push(box(x, y, 0, 1.1, 1.0, ARCH.ribZ * 2 + 1.7));
  }
  for (const x of [BRIDGE.start, BRIDGE.end]) {
    const dir = x === BRIDGE.start ? -1 : 1, ground = Math.min(terrainH(x, -DECK_HALF), terrainH(x, DECK_HALF), terrainH(x - dir * 6, 0)) - 3;
    struts.push(box(x + dir * 2.5, (deckY(x) - 0.3 + ground) / 2, 0, 7, deckY(x) - 0.3 - ground, DECK_HALF * 2 + 1.2));
  }
  group.add(mesh(merge(struts), concrete));

  // Exposed rebar where the deck has been cut away.
  const rebar = [], r = rng(9);
  for (const [x, dir] of [[GAP[0], 1], [GAP[1], -1]]) for (let z = -DECK_HALF + 0.4; z <= DECK_HALF - 0.4; z += 0.55) for (const dy of [-0.5, -1.15]) {
    const len = 0.4 + r() * 1.3, y = deckY(x) + dy;
    rebar.push(rod(V(x, y, z), V(x + dir * len, y + (r() - 0.6) * 0.5, z + (r() - 0.5) * 0.2), 0.03, 5));
  }
  group.add(mesh(merge(rebar), new THREE.MeshStandardMaterial({color: 0x7a4a2c, roughness: 0.8, metalness: 0.3})));

  // Fence, bales, signs, start and finish.
  props.fence(group, course, mats, {ranges: [[-260, BRIDGE.start - 2], [BRIDGE.end + 2, 900]], z: ROAD_HALF + 1.6});
  const baleList = [...props.baleRows(course, -18, -2), ...props.baleRows(course, 290, BRIDGE.start - 3), ...props.baleRows(course, BRIDGE.end + 3, FINISH + 40, {stackEvery: 3})];
  for (let z = -ROAD_HALF; z <= ROAD_HALF; z += 1.2) for (let k = 0; k < 3; k++) baleList.push({x: 640 + k * 0.6, z, rot: Math.PI / 2, stack: k === 2 ? 1 : 0});
  props.bales(group, course, mats, baleList);
  props.sign(group, course, mats, T.signTexture(['BIG SUR', {text: 'Pumpkin Grand Prix', font: 'italic bold 40px'}]), {x: -40, z: -ROAD_HALF - 3.2, w: 4.6, h: 2.3, post: 1.8, posts: 2});
  props.sign(group, course, mats, T.signTexture(['BIXBY CREEK', {text: 'Bridge · 1932', font: 'italic 40px'}]), {x: 296, z: -ROAD_HALF - 2.4, w: 3.6, h: 1.8, post: 1.6, posts: 2});
  props.sign(group, course, mats, T.signTexture(['GAP AHEAD'], {bg: '#a8432a', font: 'bold 70px'}), {x: 236, z: ROAD_HALF + 2.6, w: 3, h: 1.5, post: 1.3, posts: 2});
  props.sign(group, course, mats, T.signTexture(['JUMP', {text: '16 m', font: 'bold 60px'}], {bg: '#a8432a', w: 256, h: 256}), {x: 312, z: -ROAD_HALF - 2.0, w: 1.8, h: 1.8, post: 1.3});
  for (const d of [100, 200, 300]) props.sign(group, course, mats, T.signTexture([`${d} m`], {w: 256, h: 128, font: 'bold 60px'}), {x: d, z: -ROAD_HALF - 1.4, w: 1.0, h: 0.5, post: 0.8});
  const {board, updateGate} = props.startFinish(group, course, mats);

  // --- Nature ---
  const clearOfRoad = (x, z) => Math.abs(z) > ROAD_HALF + 4 && !(x > BRIDGE.start - 4 && x < BRIDGE.end + 4 && Math.abs(z) < 12);
  const clearOfFinish = (x, z) => !(x > FINISH - 4 && x < FINISH + 60 && Math.abs(z) < 14);
  const clearOfCameras = (x, z) => !(x > -40 && x < FINISH + 90 && ((z > 0 && z < 38) || (z < 0 && z > -14)));
  const cypressPts = flora.scatter({count: low ? 260 : 620, x0: -150, x1: 710, z0: -260, z1: 40, seed: 11, accept: (x, z, r) => {
    const h = terrainH(x, z);
    if (h < 6 || !clearOfRoad(x, z) || !clearOfFinish(x, z) || !clearOfCameras(x, z) || slopeAt(terrainH, x, z) > 0.75) return false;
    if (z > 0 && z > coastZ(x) - 2) return false;
    if (fbm(x / 60, z / 60, 2) < -0.05 && r() < 0.8) return false;
    return h;
  }}).map(p => ({...p, s: 0.8 + p.r * 0.7, rot: (p.r - 0.5) * 0.6}));
  flora.trees(group, flora.cypress, cypressPts, {low});
  // A few Monterey pines high on the inland slopes.
  const pinePts = flora.scatter({count: low ? 30 : 80, x0: -150, x1: 710, z0: -260, z1: -40, seed: 15, accept: (x, z) => {
    const h = terrainH(x, z);
    if (!clearOfRoad(x, z) || !clearOfCameras(x, z) || slopeAt(terrainH, x, z) > 0.7 || fbm(x / 80 + 9, z / 80, 2) < 0.1) return false;
    return h;
  }}).map(p => ({...p, s: 0.75 + p.r * 0.5, rot: p.r * 6}));
  flora.trees(group, flora.pine, pinePts, {low});
  const redPts = flora.scatter({count: low ? 70 : 170, x0: BRIDGE.center - 60, x1: BRIDGE.center + 60, z0: -620, z1: 20, seed: 12, accept: (x, z) => {
    if (Math.abs(x - canyonCentre(z)) > 35) return false;
    const h = terrainH(x, z);
    if (h > canyonFloor(z) + 26 || h < 2 || Math.abs(z) < 16 || slopeAt(terrainH, x, z) > 1.2) return false;
    return h;
  }}).map(p => ({...p, s: 0.6 + p.r * 0.5, rot: p.r * 6}));
  flora.trees(group, flora.redwood, redPts, {low});
  const shrubPts = flora.scatter({count: low ? 1200 : 3400, x0: -160, x1: 720, z0: -190, z1: 190, seed: 13, accept: (x, z) => {
    const h = terrainH(x, z);
    if (h < 1.5 || !clearOfRoad(x, z) || !clearOfFinish(x, z) || slopeAt(terrainH, x, z) > 1.0) return false;
    return h;
  }});
  flora.shrubs(group, shrubPts, {cast: !low, low, palette: ['#5d6b3e', '#6f7748', '#7e7a50', '#4f5d38', '#8a8058', '#6a6f52']});
  // Verge grass, wildflowers and pebbles along the land sections of the road.
  const notBridge = (x, z) => !(x > BRIDGE.start - 3 && x < BRIDGE.end + 3 && Math.abs(z) < DECK_HALF + 6);
  flora.grass(group, course, {x0: -70, x1: 640, far: 24, palette: 'golden', accept: notBridge, low,
    zones: [{x0: -24, x1: -2, z0: ROAD_HALF + 1, z1: ROAD_HALF + 9, density: 3}]});
  const r2 = rng(2025), stacks = [];
  for (let i = 0; i < 46; i++) {
    const x = -900 + r2() * 2400, z = coastZ(x) + 50 + r2() * (i < 14 ? 120 : 420), s = i < 14 ? 4 + r2() * 8 : 6 + r2() * 22;
    stacks.push({x, y: -2, z, s, sy: s * (0.7 + r2() * 1.3), sz: s * (0.8 + r2() * 0.4), rx: r2(), ry: r2() * 6});
  }
  const stackList = stacks.map(k => ({x: k.x, z: k.z, s: k.s * 0.85, h: k.sy * 0.95 + 3, ry: k.ry}));
  // Boulders in the surf along the foot of the cliffs.
  const surf = [];
  for (let i = 0; i < (low ? 40 : 110); i++) {
    const x = -300 + r2() * 1300, cz = coastZ(x), z = cz + 38 + r2() * 60;
    if (terrainH(x, z) > -0.3 || terrainH(x, z) < -6) continue;
    surf.push({x, y: -0.6 - r2() * 0.8, z, s: 1.2 + r2() * 3.2, sy: 0.8 + r2() * 2.2, ry: r2() * 6, rx: (r2() - 0.5) * 0.4});
  }
  flora.seaStacks(group, stackList, {low});
  // Broken rock bands and boulders in the road cut, half buried, so the cut reads as rock, not a smooth bank.
  const cutRocks = [], r3 = rng(77);
  const signXs = [-40, 100, 200, 236, 296, 312];
  for (let x = -150; x < 700; x += low ? 4.5 : 2.6) {
    if ((x > BRIDGE.start - 8 && x < BRIDGE.end + 8) || (x > FINISH - 4 && x < FINISH + 60) || signXs.some(sx => Math.abs(x - sx) < 3)) continue;
    const z = -ROAD_HALF - 2.4 - r3() * r3() * 14, xx = x + r3() * 1.5;
    if (slopeAt(terrainH, xx, z) < 0.55) continue;
    const s = 0.6 + r3() * r3() * 2.4, e = 0.8, dz = (terrainH(xx, z + e) - terrainH(xx, z - e)) / (2 * e);
    // Flattened slabs lying in the slope (tilted to its normal) and mostly buried.
    cutRocks.push({x: xx, y: terrainH(xx, z) - s * 0.5, z, s: s * 1.35, sy: s * (0.32 + r3() * 0.3), sz: s * (0.8 + r3() * 0.6), rx: Math.atan(-dz) * 0.9 + (r3() - 0.5) * 0.25, ry: (r3() - 0.5) * 0.6});
  }
  flora.rocks(group, cutRocks, {color: 0x7a7064, cast: !low, shape: 'craggy'});
  flora.rocks(group, surf, {color: 0x7d7468, wet: 0.7, shape: 'craggy'});
  scene.userData.shoreFoam?.addRocks([...stackList.map(k => ({x: k.x, z: k.z, r: k.s * 0.95})), ...surf.map(k => ({x: k.x, z: k.z, r: k.s * 0.9}))]);

  // A Point Sur-like volcanic rock with a lighthouse, far down the coast.
  const sur = new THREE.Mesh(flora.rockGeometry(), new THREE.MeshStandardMaterial({color: 0x6b6156, roughness: 0.95, flatShading: true}));
  sur.scale.set(190, 115, 150); sur.position.set(3500, -18, 760); sur.rotation.y = 0.6;
  const surTop = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({color: 0x7d7a4a, roughness: 1}));
  surTop.scale.set(120, 22, 95); surTop.position.set(3500, 72, 760);
  const lighthouse = new THREE.Group(), white = new THREE.MeshStandardMaterial({color: 0xf3f0e8, roughness: 0.6});
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 14, 12), white); tower.position.y = 7;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), new THREE.MeshStandardMaterial({color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 2})); lamp.position.y = 15.2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2, 12), new THREE.MeshStandardMaterial({color: 0x9a2f22, roughness: 0.5})); cap.position.y = 17.4;
  const house = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 9), white); house.position.set(-9, 3, 3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.6, 1, 9.6), new THREE.MeshStandardMaterial({color: 0x9a2f22})); roof.position.set(-9, 6.4, 3);
  lighthouse.add(tower, lamp, cap, house, roof); lighthouse.position.set(3480, 90, 735); lighthouse.scale.setScalar(1.6);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(900, 160), new THREE.MeshStandardMaterial({color: 0xd6c59c, roughness: 1}));
  bar.rotation.x = -Math.PI / 2; bar.rotation.z = 0.25; bar.position.set(3420, 0.6, 420);
  group.add(sur, surTop, lighthouse, bar);

  flora.cloudBank(group, {count: low ? 22 : 46, opacity: 0.62, z0: 2200});
  const updateBirds = flora.soaringBirds(group, [
    {cx: BRIDGE.center + 30, cz: -110, radius: 120, height: 175, speed: 0.05},
    {cx: BRIDGE.center + 30, cz: -110, radius: 190, height: 220, speed: 0.062},
  ]);
  const crowd = props.crowd(group, course, [
    {x0: 262, x1: 300, z0: ROAD_HALF + 6.5, z1: ROAD_HALF + 14, n: 60},
    {x0: FINISH + 6, x1: FINISH + 44, z0: -ROAD_HALF - 7, z1: -ROAD_HALF - 1.6, n: 90},
    {x0: FINISH + 6, x1: FINISH + 44, z0: ROAD_HALF + 1.8, z1: ROAD_HALF + 6.5, n: 70},
    {x0: -22, x1: -3, z0: ROAD_HALF + 1.8, z1: ROAD_HALF + 7, n: 34},
  ], {low});

  // Race-day dressing around the spectator areas: tents, tables, chairs, bunting and flags.
  const dressed = [
    dressing.crowdDressing(group, course, {x0: 262, x1: 300, z0: ROAD_HALF + 6.5, z1: ROAD_HALF + 14}, {low, seed: 3, text: 'BIG SUR GP', depth: 3.5}),
    dressing.crowdDressing(group, course, {x0: FINISH + 6, x1: FINISH + 44, z0: -ROAD_HALF - 7, z1: -ROAD_HALF - 1.6}, {low, seed: 4, text: 'FINISH'}),
    dressing.crowdDressing(group, course, {x0: FINISH + 6, x1: FINISH + 44, z0: ROAD_HALF + 1.8, z1: ROAD_HALF + 6.5}, {low, seed: 5}),
    dressing.bunting(group, course, {points: [[FINISH + 6, -ROAD_HALF - 1.3], [FINISH + 18, -ROAD_HALF - 1.3], [FINISH + 30, -ROAD_HALF - 1.3], [FINISH + 42, -ROAD_HALF - 1.3]], height: 3.4}),
    dressing.bunting(group, course, {points: [[-22, ROAD_HALF + 1.4], [-12, ROAD_HALF + 1.4], [-2, ROAD_HALF + 1.4]], height: 3.0, seed: 8}),
    dressing.bunting(group, course, {points: [[262, ROAD_HALF + 5.8], [274, ROAD_HALF + 5.8], [287, ROAD_HALF + 5.8], [300, ROAD_HALF + 5.8]], height: 3.0, seed: 9}),
    dressing.flagPole(group, course, {x: -6, z: -ROAD_HALF - 2.5, height: 7, text: 'BIG SUR', bg: '#2f5d7c', rotY: Math.PI}),
    dressing.flagPole(group, course, {x: FINISH + 3, z: ROAD_HALF + 2.6, height: 7, color: '#e58b37', rotY: Math.PI}),
  ].filter(Boolean);

  scene.add(group);
  return {
    group, board, updateGate,
    update(t, wall, ctx) { updateBirds(wall); crowd.update(wall, ctx.excitement, ctx.camera); for (const d of dressed) d.update?.(wall); },
    crowdZones: crowd.zones,
  };
}

// Big Sur's own cameras. Each rig gets the focus position F and returns pos/look.
const cameras = {
  // Wide establishing view from the cliffs; the aim drifts with the pumpkin so it stays in the
  // centre band of the frame (clear of the HUD), with the gap always in shot.
  VISTA: {label: 'BIXBY VISTA', fov: 42, key: '7', rig: ({course, F}) => {
    const {BRIDGE, GAP, deckY, H0} = course;
    const fx = Math.min(GAP[1] + 20, Math.max(BRIDGE.start - 40, F?.x ?? BRIDGE.start));
    const ax = fx * 0.55 + (GAP[0] + 4) * 0.45;
    return {pos: V(BRIDGE.center - 150, H0 - 30, 150), look: V(ax, deckY(ax) - 14, 0), smoothing: 3};
  }},
  // Flies alongside, inside the parapets (so they never block the view), slightly above the pumpkin.
  FLIGHT: {label: 'FLIGHT CAM', fov: 46, rig: ({F, course}) => ({pos: V(F.x - 3.4, F.y + 2.4, Math.max(-course.DECK_HALF + 0.7, Math.min(F.z - 2.6, -2.2))), look: V(F.x + 1.4, F.y - 0.9, F.z + 1.6), smoothing: 12})},
  LANDING: {label: 'LANDING CAM', fov: 30, rig: ({course}) => {
    const x = 489;
    return {pos: V(x, course.deckY(x) + 1.3, -course.roadHalf + 0.4), look: V(446, course.roadY(446) + 2.6, 0)};
  }},
};

// Highlights for the auto director: the leader's jump in slow motion, then the rest landing.
function planShots(views, {timeAtX, add}) {
  const GAP = views[0].course.GAP;
  const jumps = views.map((v, i) => {
    const r = v.result, to = r.events.find(e => e.type === 'JUMP' && e.x > GAP[0] - 4 && e.x < GAP[0] + 2);
    if (!to) return null;
    const land = r.events.find(e => e.type === 'LANDING' && e.t > to.t);
    return {i, t: to.t, land: land ? land.t : r.time, landX: land ? land.x : null};
  }).filter(Boolean).sort((a, b) => a.t - b.t);
  if (!jumps.length) return {jumps};
  const first = jumps[0];
  add(Math.max(2, timeAtX(views[first.i].result, 325)), first.t - 0.35, 'VISTA', first.i);
  add(first.t - 0.35, first.land + 0.35, 'FLIGHT', first.i, 0.3);
  const rest = jumps.slice(1).filter(j => j.t < first.t + 6);
  add(first.land + 0.35, rest.length ? Math.max(...rest.map(j => j.land)) + 1.2 : first.land + 2.2, 'LANDING', rest.length ? rest[0].i : first.i);
  return {jumps};
}

// Ticker lines for this track's highlights.
function tickerEvents(views, extra) {
  const out = [];
  for (const j of extra.jumps || []) {
    const v = views[j.i], f = P.sampleSimulation(v.result, j.t);
    out.push({t: j.t, text: `${v.name} takes off at ${Math.round(f.v * 3.6)} km/h`, sound: 'whoosh'});
    if (j.landX) out.push({t: j.land, text: `${v.name} lands after ${Math.round(j.landX - v.course.GAP[0])} m`});
  }
  return out;
}

export default {
  id: 'big-sur', name: 'Big Sur', label: '500 m · BRIDGE JUMP',
  blurb: 'Down the cliff road and over the gap in the Bixby Creek bridge.',
  createCourse, build, cameras, planShots, tickerEvents, heroCam: 'VISTA',
  establishing: course => ({pos: V(course.BRIDGE.center - 140, course.H0 - 30, 150), look: V(course.BRIDGE.center, 60, 0)}),
  ambience: {sea: 1, wind: 0.7, gulls: 0.6, crowd: 0.5},
};
