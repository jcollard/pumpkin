// Trackside props shared by every course: the dirt track itself, berms, fences,
// straw bales, wooden signs, log gantries, the start gate, chalk lines and spectators.
// Everything takes the course object so it sits on that track's exact profile.
import * as THREE from 'three';
import * as T from '../textures.js';
import {rng} from '../noise.js';
import {samples, ribbon, beam, box, rod, merge, mesh, instanced} from './geom.js';
import {worldDetail} from './surface.js';
import {startChutes} from './chutes.js';
export {startChutes};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function sharedMaterials() {
  const dirt = T.dirtTrackTexture({pebbles: 500});
  // Photo detail (CC0 PBR sets) is added in world space on top of the procedural
  // base, so ribbons, berms and bridge parts get the same texel size everywhere.
  return {
    dirt,
    track: worldDetail(new THREE.MeshStandardMaterial({map: dirt, roughness: 1, metalness: 0}), {set: 'dirt_packed', scale: 2.07, macro: 8.3, strength: 0.95, normalScale: 1.1}),
    berm: worldDetail(new THREE.MeshStandardMaterial({color: 0x7b7046, roughness: 1}), {set: 'grass_dry', mode: 'triplanar', scale: 2, strength: 1, normalScale: 0.8}),
    wood: new THREE.MeshStandardMaterial({map: T.woodTexture(61), roughness: 0.9}),
    timber: new THREE.MeshStandardMaterial({map: T.woodTexture(62, true), color: 0xd8cfc0, roughness: 0.85}),
    straw: new THREE.MeshStandardMaterial({map: T.strawTexture(), roughness: 1, color: 0xe8dcc0}),
    concrete: worldDetail(new THREE.MeshStandardMaterial({map: T.concreteTexture(), color: 0xd6cfc2, roughness: 0.88}), {set: 'concrete_weathered', mode: 'triplanar', scale: 3.2, strength: 0.9, normalScale: 0.7}),
  };
}

// Dirt track ribbons over [a, b] ranges (skip gaps by passing several ranges),
// with low grassy berms along the land sections.
export function dirtTrack(group, course, mats, {ranges, bermRanges = ranges, step = 0.5, coarseBeyond = [-60, course.length + 140]}) {
  const half = course.roadHalf;
  for (const [a, b] of ranges) {
    const xs = samples(a, b, step).filter(x => (x >= coarseBeyond[0] && x <= coarseBeyond[1]) || Math.round(x) % 4 === 0);
    group.add(mesh(ribbon(xs, course.roadY, -half, half, 12), mats.track, {cast: false}));
  }
  const berms = [];
  for (const [a, b] of bermRanges) {
    const xs = samples(a, b, 1);
    for (const s of [-1, 1]) {
      const z0 = s * half, z1 = s * (half + 0.9);
      berms.push(beam(xs, x => course.roadY(x) + 0.05, x => course.roadY(x) - 0.4, Math.min(z0, z1), Math.max(z0, z1), 3));
    }
  }
  if (berms.length) group.add(mesh(merge(berms), mats.berm, {cast: false}));
}

// Split-rail fence along one side.
export function fence(group, course, mats, {ranges, z, seed = 5}) {
  const r = rng(seed), parts = [];
  const ground = x => Math.max(course.roadY(x), course.terrainH(x, z));
  for (const [a, b] of ranges) for (let x = a; x < b; x += 3) {
    const x2 = Math.min(b, x + 3), y1 = ground(x), y2 = ground(x2);
    parts.push(rod(V(x, y1 - 0.3, z), V(x, y1 + 1.15, z), 0.07, 6));
    for (const h of [0.45, 0.95]) parts.push(rod(V(x, y1 + h, z), V(x2, y2 + h, z + (r() - 0.5) * 0.06), 0.05, 5));
  }
  if (parts.length) group.add(mesh(merge(parts), mats.timber));
}

// Straw bales. Each entry: {x, z, rot?, stack?}.
let baleGeo = null;
function baleGeometry() { // box with softly rounded edges, like a real small square bale
  if (baleGeo) return baleGeo;
  const W = 1.15, H = 0.54, D = 0.58, R = 0.07;
  baleGeo = new THREE.BoxGeometry(W, H, D, 6, 3, 3);
  const p = baleGeo.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(W / 2 - R, H / 2 - R, D / 2 - R), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-inner.x, Math.min(inner.x, v.x)), Math.max(-inner.y, Math.min(inner.y, v.y)), Math.max(-inner.z, Math.min(inner.z, v.z)));
    const d = v.clone().sub(c);
    if (d.lengthSq() > 1e-8) v.copy(c).addScaledVector(d.normalize(), R);
    // a little bulge and unevenness
    v.x *= 1 + 0.015 * Math.sin(v.y * 9 + v.z * 7); v.z *= 1 + 0.04 * (1 - (2 * v.y / H) ** 2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  baleGeo.computeVertexNormals();
  return baleGeo;
}

export function bales(group, course, mats, list) {
  const r = rng(list.length + 11);
  const geos = list.map(({x, z, rot = 0, stack = 0}) => {
    const y = Math.max(course.roadY(x), course.terrainH(x, z)) + 0.26 + stack * 0.53;
    const g = baleGeometry().clone(); g.rotateY(rot + (r() - 0.5) * 0.06); g.translate(x, y, z); return g;
  });
  if (geos.length) group.add(mesh(merge(geos), mats.straw));
}

// A line of bales along x on both sides of the track.
export function baleRows(course, a, b, {offset = 1.0, stackEvery = 0} = {}) {
  const list = [];
  for (const s of [-1, 1]) for (let x = a; x <= b; x += 1.2) {
    list.push({x, z: s * (course.roadHalf + offset)});
    if (stackEvery && Math.round(x / 1.2) % stackEvery === 0) list.push({x, z: s * (course.roadHalf + offset), stack: 1});
  }
  return list;
}

// Wooden sign on log posts facing riders coming down the course (-X).
export function sign(group, course, mats, tex, {x, z, y, w, h, post = 2.2, posts = 1, face = -1}) {
  const base = y ?? Math.max(course.roadY(x), course.terrainH(x, z));
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: tex, roughness: 0.85}));
  plane.rotation.y = face < 0 ? -Math.PI / 2 : Math.PI / 2;
  plane.position.set(x + (face < 0 ? -0.05 : 0.05), base + post + h / 2, z);
  const back = mesh(new THREE.BoxGeometry(0.08, h, w), mats.wood);
  back.position.set(x, base + post + h / 2, z);
  for (let i = 0; i < posts; i++) {
    const pz = posts === 1 ? z : z - w / 2 + w * (i + 0.5) / posts;
    const pole = mesh(new THREE.CylinderGeometry(0.08, 0.1, post + h + 0.3, 7), mats.wood);
    pole.position.set(x + 0.1, base + (post + h + 0.3) / 2 - 0.3, pz);
    group.add(pole);
  }
  group.add(plane, back);
  return plane;
}

export const clothTexture = (text, bg, fg = '#2b1d10') => T.signTexture([text], {bg, fg, border: null, planks: false, w: 1024, h: 160, font: 'bold 92px'});

// Log gantry with canvas banners front and back. Returns the top height.
export function gantry(group, course, mats, x, front, back, extra) {
  const y = course.roadY(x), span = course.roadHalf + 1.4, top = y + 5.4;
  const logs = [rod(V(x, y - 0.5, -span), V(x, top + 0.4, -span), 0.2, 9), rod(V(x, y - 0.5, span), V(x, top + 0.4, span), 0.2, 9),
    rod(V(x, top + 0.1, -span - 0.5), V(x, top + 0.1, span + 0.5), 0.16, 9)];
  group.add(mesh(merge(logs), mats.wood));
  const banner = (tex, side) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.7, 1.3), new THREE.MeshStandardMaterial({map: tex, roughness: 0.95}));
    m.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(x + side * 0.05, top - 0.75, 0); group.add(m);
  };
  banner(front, -1); banner(back, 1);
  if (extra) extra(x, top);
  return top;
}

// Finish gantry with a live timing board. Returns the board texture.
export function finishGantry(group, course, mats, title = 'FINISH') {
  const board = T.timingBoard();
  gantry(group, course, mats, course.length, T.checkerTexture(title), T.checkerTexture(course.name.toUpperCase()), (x, top) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({map: board, toneMapped: false}));
    m.rotation.y = -Math.PI / 2; m.position.set(x - 0.2, top + 0.85, 0);
    const back = mesh(new THREE.BoxGeometry(0.3, 1.0, 3.4), mats.wood); back.position.set(x, top + 0.85, 0);
    group.add(m, back);
  });
  return board;
}

// Striped pole that swings down as the race starts. Returns update(t).
// Boom barrier: pivots at a post on the inland side (z = -roadHalf). Raised near-vertical
// before t = -2.2 (so lineup shots are clear), swings down by t = -1.6, and drops away at GO.
// The returned update(t) is a pure function of t, so scrubbing is safe.
let boomTex = null;
function boomTexture() {
  if (boomTex) return boomTex;
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#c4321f'; g.fillRect(0, i * 32, 16, 32); }
  boomTex = new THREE.CanvasTexture(c); boomTex.colorSpace = THREE.SRGBColorSpace; boomTex.anisotropy = 4;
  return boomTex;
}
export function startGate(group, course) {
  const half = course.roadHalf, x0 = 0.75, base = course.roadY(x0), len = half * 2 - 0.3, pivotZ = -half + 0.12;
  const gate = new THREE.Group(), boom = new THREE.Group();
  const bar = mesh(new THREE.CylinderGeometry(0.065, 0.075, len, 12), new THREE.MeshStandardMaterial({map: boomTexture(), roughness: 0.5}));
  bar.rotation.x = Math.PI / 2; bar.position.z = len / 2 + 0.05;
  const dark = new THREE.MeshStandardMaterial({color: 0x2c2f33, roughness: 0.6, metalness: 0.3});
  const weight = mesh(new THREE.BoxGeometry(0.2, 0.22, 0.42), dark); weight.position.z = -0.32;
  const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12), dark); hub.rotation.z = Math.PI / 2;
  const tip = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({color: 0xc4321f, roughness: 0.5})); tip.position.z = len + 0.05;
  boom.add(bar, weight, hub, tip);
  boom.position.set(0, 0.5, pivotZ);
  gate.add(boom);
  gate.position.set(x0, base, 0);
  // Static post with a small housing beside the pivot.
  const post = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 10), new THREE.MeshStandardMaterial({color: 0xd9d6cf, roughness: 0.6}));
  post.position.set(x0 + 0.2, base + 0.31, pivotZ);
  const housing = mesh(new THREE.BoxGeometry(0.26, 0.3, 0.3), new THREE.MeshStandardMaterial({color: 0xc4321f, roughness: 0.55}));
  housing.position.set(x0 + 0.2, base + 0.6, pivotZ);
  group.add(gate, post, housing);
  const ease = u => u * u * (3 - 2 * u);
  return t => {
    const raise = t < -2.2 ? 1 : t < -1.6 ? 1 - ease((t + 2.2) / 0.6) : 0;
    boom.rotation.x = -raise * 1.45;
    gate.rotation.z = -Math.min(1, Math.max(0, (t + 0.25) / 0.25)) * Math.PI / 2;
  };
}

let chalkTex = null;
export function chalkLine(group, course, x) {
  chalkTex ??= T.chalkTexture();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, course.roadHalf * 2 - 0.2),
    new THREE.MeshStandardMaterial({map: chalkTex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false}));
  const slope = Math.atan2(course.roadY(x + 0.5) - course.roadY(x - 0.5), 1);
  m.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), slope));
  m.position.set(x, course.roadY(x) + 0.02, 0); m.receiveShadow = true; group.add(m);
}

// Standard start/finish dressing: gantries, gate, chalk, bale chutes. Returns {board, updateGate}.
// gate: 'chutes' (default: rodeo start stalls, rebuilt per race for the lane count) or 'boom'.
export function startFinish(group, course, mats, {startText, startBack = 'GOOD LUCK', gate = 'chutes'} = {}) {
  gantry(group, course, mats, 0, clothTexture(startText ?? `${course.name.toUpperCase()} · START`, '#e9dcc0'), clothTexture(startBack, '#e58b37'));
  const board = finishGantry(group, course, mats);
  const updateGate = gate === 'boom' ? startGate(group, course) : startChutes(group, course, mats).update;
  chalkLine(group, course, 0.9); chalkLine(group, course, course.length);
  return {board, updateGate};
}

// Spectators (CC0 low-poly people, see env/people.js). zones: [{x0, x1, z0, z1, n, sit?, kids?, look?}].
// Returns {zones, update(wall, excitement(zoneIndex), camera?), ready (Promise, resolves when the people are in the scene)}.
// Passing the main camera (ctx.camera in env.update) to update() picks the detail level for that view.
import {spectators} from './people.js';
export function crowd(group, course, zones, {low = false, seed = 2024, ...opts} = {}) {
  return spectators(group, course, zones, {low, seed, ...opts});
}

// Crowd dressing (procedural): see env/dressing.js for options.
export {bunting, flagPole, canopyTent, canopyTents, picnicTable, picnicTables, umbrellas, campChairs, coolers, crowdDressing, flatEnough} from './dressing.js';
