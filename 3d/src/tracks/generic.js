// Basic course and scenery for any track from the game. Track modules can use
// this as a starting point (createGenericCourse) and replace the scenery.
//
// World axes for every track: +X runs down the race, +Y is up, +Z points to the
// sea side (or the "open" side for inland tracks). Track centre line is z = 0.
// For 0 <= x <= length, roadY(x) is exactly H0 - track.drop(x): the surface the
// game simulates. Everything else is scenery.
import * as THREE from 'three';
import * as P from '../physics.js';
import * as T from '../textures.js';
import {fbm, vnoise, smooth, clamp} from '../noise.js';
import {slopeAt} from '../env/geom.js';
import * as props from '../env/props.js';
import * as flora from '../env/flora.js';

const C = h => new THREE.Color(h);
export const PALETTE = {
  grass: C('#7f8a45'), grassDry: C('#b9a464'), scrub: C('#5f6f43'), soil: C('#7a5c3e'), verge: C('#7d7a45'),
  rock: C('#6c6157'), rockDark: C('#3b352f'), sand: C('#d8c59c'), wetSand: C('#a8977a'), seabed: C('#556d68'),
};

// options: {H0, roadHalf, sea, coast(x) -> z of the sea cliff/beach edge, hills: amplitude, sunDir, sky, fog, extra}
export function createGenericCourse(trackId, options = {}) {
  const trackIndex = P.tracks.findIndex(t => t.id === trackId);
  if (trackIndex < 0) throw Error(`This version of the game has no ${trackId} track.`);
  const track = P.tracks[trackIndex], L = track.length;
  const H0 = options.H0 ?? Math.max(20, track.drop(L) + 25);
  const roadHalf = options.roadHalf ?? 4.0;
  const gap = track.gap;
  const grade0 = track.grade(0), gradeL = track.grade(L);
  function roadY(x) {
    if (x < 0) { const u = Math.min(-x, 60); return H0 + grade0 * u * (1 - u / 120) + Math.max(0, -x - 60) * 0.02; }
    if (x <= L) return H0 - track.drop(x);
    const u = Math.min(x - L, 100);
    return H0 - track.drop(L) - gradeL * u * (1 - u / 200) - Math.max(0, x - L - 100) * 0.01;
  }
  const sea = options.sea ?? false;
  const coast = options.coast ?? (x => 60 + 20 * Math.sin(x / 150));
  const hills = options.hills ?? 18;
  function terrainH(x, z) {
    const bed = roadY(x), d = Math.abs(z) - roadHalf - 1;
    let h = bed - 0.3 + hills * fbm(x / 220, z / 220, 4) * smooth(5, 80, d) + Math.max(0, d) * (z < 0 ? 0.18 : 0.05);
    if (sea && z > 0) {
      const cz = coast(x), t = clamp((z - cz) / 40, 0, 1);
      if (z > cz) h = h * (1 - t) + (-4 - Math.max(0, z - cz - 40) * 0.05) * t;
    }
    const corridor = 1 - smooth(roadHalf + 0.6, roadHalf + 5, Math.abs(z));
    return h + (bed - 0.25 - h) * corridor;
  }
  function surfaceY(x, z) {
    if (Math.abs(z) <= roadHalf && !(gap && x > gap[0] && x < gap[1])) return roadY(x);
    return Math.max(sea ? 0 : -1e9, terrainH(x, z));
  }
  function colourAt(x, z, h, slope, out) {
    const n = vnoise(x / 37, z / 37), m = vnoise(x / 9 + 50, z / 9);
    if (sea && h < -0.5) return out.copy(PALETTE.seabed);
    if (sea && h < 2.5 && slope < 0.55) return out.copy(h < 1 ? PALETTE.wetSand : PALETTE.sand);
    if (Math.abs(z) < roadHalf + 3.5) return out.copy(PALETTE.verge).lerp(PALETTE.soil, smooth(roadHalf + 3.5, roadHalf, Math.abs(z)) * 0.8 * (0.6 + 0.4 * m));
    if (slope > 0.85) return out.copy(PALETTE.rock).lerp(PALETTE.rockDark, 0.5 * m);
    out.copy(PALETTE.scrub).lerp(PALETTE.grass, n).lerp(PALETTE.grassDry, smooth(0.5, 0.9, n) * 0.6);
    if (slope > 0.55) out.lerp(PALETTE.rock, smooth(0.55, 0.85, slope) * 0.8);
    return out;
  }
  const sand = track.sand || [];
  return {
    id: trackId, name: track.name, trackIndex, track, length: L, H0, roadHalf,
    roadY, terrainH, surfaceY, colourAt,
    hasSurface: x => !(gap && x > gap[0] && x < gap[1]),
    surfaceAt: x => sand.some(([a, b]) => x >= a && x <= b) ? 'sand' : 'dirt',
    sunDir: options.sunDir ?? new THREE.Vector3(0.4, 0.35, 1), sea,
    sky: options.sky, fog: options.fog,
    terrain: {near: {x0: -160, x1: L + 220, z0: -190, z1: 190, step: 2}, far: {x0: -3000, x1: L + 4000, z0: -3200, z1: 2200, step: 20}},
    ...(options.extra || {}),
  };
}

// Plain scenery: dirt track, start/finish, fence, a few trees and spectators.
export function buildGeneric(scene, course, {low = false} = {}) {
  const group = new THREE.Group(), L = course.length, half = course.roadHalf;
  const mats = props.sharedMaterials();
  props.dirtTrack(group, course, mats, {ranges: [[-420, L + 800]]});
  props.fence(group, course, mats, {ranges: [[-100, L + 200]], z: half + 1.6});
  props.bales(group, course, mats, [...props.baleRows(course, -18, -2), ...props.baleRows(course, L + 3, L + 40, {stackEvery: 3})]);
  for (let d = 100; d < L; d += 100) props.sign(group, course, mats, T.signTexture([`${d} m`], {w: 256, h: 128, font: 'bold 60px'}), {x: d, z: -half - 1.4, w: 1.0, h: 0.5, post: 0.8});
  const {board, updateGate} = props.startFinish(group, course, mats);
  const pts = flora.scatter({count: low ? 150 : 400, x0: -150, x1: L + 200, z0: -180, z1: 180, seed: 4, accept: (x, z) => {
    if (Math.abs(z) < half + 10) return false;
    const h = course.terrainH(x, z);
    if (course.sea && h < 3) return false;
    return slopeAt(course.terrainH, x, z) < 0.6 ? h : false;
  }}).map(p => ({...p, s: 0.7 + p.r * 0.6, rot: p.r * 6}));
  flora.trees(group, flora.oak, pts);
  const crowd = props.crowd(group, course, [
    {x0: L + 6, x1: L + 40, z0: -half - 7, z1: -half - 1.6, n: 70},
    {x0: -22, x1: -3, z0: half + 2.2, z1: half + 7, n: 30},
  ], {low});
  const nets = placeholderNets(group, course);
  scene.add(group);
  return {group, board, updateGate, mats, crowdZones: crowd.zones,
    onRace: ({netOpenTimes}) => nets.setOpenTimes(netOpenTimes),
    update(t, wall, ctx) { crowd.update(wall, ctx.excitement); nets.update(t); }};
}

// Simple fishing nets across the track (Monterey). They vanish when broken.
export function placeholderNets(group, course) {
  const list = (course.track.nets || []).map(n => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(235,225,200,.9)'; g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 2);
    const w = course.roadHalf * 2 + 0.6, m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.8), new THREE.MeshStandardMaterial({map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3}));
    m.rotation.y = Math.PI / 2; m.position.set(n.x, course.roadY(n.x) + 0.9, 0);
    group.add(m);
    return {mesh: m, open: Infinity};
  });
  return {
    setOpenTimes(times = []) { list.forEach((n, i) => { n.open = times[i] ?? Infinity; }); },
    update(t) { for (const n of list) n.mesh.visible = t < n.open; },
  };
}

// A simple track definition built only from the generic pieces.
export function genericTrack(id, {label, blurb, courseOptions, ambience} = {}) {
  return {
    id, label, blurb, ambience,
    createCourse: () => createGenericCourse(id, courseOptions),
    build: (scene, renderer, course, opts) => buildGeneric(scene, course, opts),
    establishing: course => ({pos: new THREE.Vector3(-40, course.H0 + 25, 60), look: new THREE.Vector3(course.length * 0.4, course.roadY(course.length * 0.4), 0)}),
  };
}
