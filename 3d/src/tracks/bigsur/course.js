// Big Sur course layout in world space.
//
// World axes: +X runs down the race (south along Highway 1), +Y is up,
// +Z points out to sea (west). The road centre line is z = 0.
// The race itself is 2D (distance and height); lanes across the road are
// cosmetic, which is fine because pumpkins never touch each other.
import * as THREE from 'three';
import * as P from '../../physics.js';
import {fbm, ridged, vnoise, clamp, smooth} from '../../noise.js';

export const TRACK_INDEX = P.tracks.findIndex(t => t.id === 'big-sur');
if (TRACK_INDEX < 0) throw Error('This version of the game has no Big Sur track.');
export const TRACK = P.tracks[TRACK_INDEX];

export const H0 = 140;                 // start line height above the Pacific (m)
export const FINISH = TRACK.length;    // 500 m
export const GAP = TRACK.gap;          // [400, 416]: no road surface here
export const RAMP = [380, GAP[0]];     // the kicker built on the bridge deck
export const ROAD_HALF = 4.0;          // half the dirt track width
export const DECK_HALF = 5.5;          // half the bridge deck width
export const BRIDGE = {start: 318, end: 506, center: (GAP[0] + GAP[1]) / 2};
export const ARCH = {half: 47, ribZ: 3.4};

// Physics height of the road (relative to the start) mapped into the world.
// For 0..500 this is exactly the surface the game simulates.
export function roadY(x) {
  if (x < 0) {
    const u = Math.min(-x, 60);
    return H0 + 0.16 * u * (1 - u / 120) + Math.max(0, -x - 60) * 0.02;
  }
  if (x <= FINISH) return H0 - TRACK.drop(x);
  const u = Math.min(x - FINISH, 100);
  return H0 - TRACK.drop(FINISH) - 0.08 * u * (1 - u / 200) - Math.max(0, x - FINISH - 100) * 0.012;
}

// Concrete deck top: follows the road except under the kicker, where the
// deck keeps its plain 16% grade and the ramp is built on top of it.
export function deckY(x) {
  if (x >= RAMP[0] && x <= GAP[0]) return H0 - 0.16 * x;
  return roadY(x);
}

// Road bed used to shape the land (bridges the gap smoothly).
function roadBed(x) {
  if (x > RAMP[0] && x < GAP[1]) {
    const a = deckY(RAMP[0]), b = roadY(GAP[1]);
    return a + (b - a) * (x - RAMP[0]) / (GAP[1] - RAMP[0]);
  }
  return roadY(x);
}

export function coastZ(x) {
  return Math.max(16, 34 + 16 * Math.sin(x / 190 + 0.6) + 9 * Math.sin(x / 71 + 2.1) + 7 * fbm(x / 90, 3.3, 3));
}

export function canyonCentre(z) {
  return BRIDGE.center + 28 * Math.sin(z / 170) * smooth(15, 220, Math.abs(z));
}

export function canyonFloor(z) {
  return 2.2 + Math.max(0, -z) * 0.05 - Math.max(0, z - 20) * 0.03;
}

// Land height without the creek canyon.
function landH(x, z) {
  const bed = roadBed(x);
  const n = fbm(x / 140, z / 140, 4);
  let h;
  if (z <= 0) { // Santa Lucia side: road cut, then mountains
    const d = Math.max(0, -z - ROAD_HALF - 1);
    const cut = Math.min(d * 1.25, 7 + d * 0.5) + (3.2 * fbm(x / 13, z / 13, 3) + 1.3 * fbm(x / 4.5, z / 4.5 + 3, 2)) * smooth(1.5, 12, d);
    const range = 560 * smooth(70, 1300, d) * (0.7 + 0.4 * vnoise(x / 700, z / 700));
    const spines = 95 * ridged(x / 280, z / 280, 4) * smooth(40, 500, d);
    h = bed + cut + range + spines + 5 * n * smooth(0, 25, d);
  } else { // Pacific side: shoulder, then sea cliff
    const d = Math.max(0, z - ROAD_HALF - 1);
    const shoulder = bed - 0.3 - d * 0.08 + 1.8 * n * smooth(0, 12, d);
    const cz = coastZ(x), width = 38 + 26 * vnoise(x / 85, 7.7);
    const t = clamp((z - cz) / width, 0, 1);
    if (z < cz) h = shoulder;
    else if (t < 1) h = -3 + (shoulder + 3) * Math.pow(1 - t, 0.55) + 7 * fbm(x / 23, z / 23, 3) * t * (1 - t) * 4;
    else h = -3 - Math.min(40, (z - cz - width) * 0.09) + 3 * fbm(x / 60, z / 60, 3);
  }
  // Keep the land just under the road ribbon.
  const corridor = 1 - smooth(ROAD_HALF + 0.6, ROAD_HALF + 5, Math.abs(z));
  return h + (bed - 0.25 - h) * corridor;
}

// Full terrain height, including Bixby-style creek canyon under the bridge.
export function terrainH(x, z) {
  let h = landH(x, z);
  const floor = canyonFloor(z) + 1.2 * fbm(x / 9, z / 9, 2);
  const dx = Math.abs(x - canyonCentre(z));
  const t = clamp((dx - 13) / 76, 0, 1), s = t * t * (3 - 2 * t), w = 0.4 * t + 0.6 * s;
  if (h > floor) h = floor + (h - floor) * w;
  return h;
}

// Ground a loose object lands on: bridge deck where there is one, else land.
export function surfaceY(x, z) {
  const onDeck = x >= BRIDGE.start && x <= BRIDGE.end && Math.abs(z) <= DECK_HALF && !(x > GAP[0] && x < GAP[1]);
  if (onDeck) return x >= RAMP[0] && x <= GAP[0] && Math.abs(z) <= ROAD_HALF ? roadY(x) : deckY(x);
  if (Math.abs(z) <= ROAD_HALF && (x < BRIDGE.start || x > BRIDGE.end)) return roadY(x);
  return Math.max(0, terrainH(x, z));
}

// Parabolic arch rib, springing from the canyon walls with its crown under the gap.
export function archY(x) {
  const crown = deckY(GAP[0]) - 7.5, spring = 30;
  const u = (x - BRIDGE.center) / ARCH.half;
  return spring + (crown - spring) * (1 - u * u);
}

// --- Terrain colouring ---
const C = hex => new THREE.Color(hex);
const PALETTE = {
  rock: C('#776c60'), rockDark: C('#4f473f'), rockWarm: C('#8c7660'),
  chaparral: C('#4a5532'), chaparralDark: C('#353f26'), sage: C('#7c805a'),
  scrub: C('#5f6f43'), scrubDark: C('#475635'), grass: C('#9c7f45'), grassDry: C('#ad8f52'), grassGreen: C('#827d45'),
  riparian: C('#3c5530'), sand: C('#d2c09a'), wetSand: C('#9c8b70'), soil: C('#806449'), verge: C('#8a7f50'), seabed: C('#3f5f5e'),
};

// Rock outcrops on the open hillsides (also used for the rock texture weight).
function outcrop(x, z, slope) {
  if (Math.abs(z) < ROAD_HALF + 3) return 0;
  const r = ridged(x / 38 + 3.1, z / 38 - 7.7, 3);
  return smooth(0.62, 0.8, r) * smooth(0.3, 0.6, slope);
}
function rockiness(x, z, h, slope) {
  const cutBand = z < 0 && z > -ROAD_HALF - 12 && (x < BRIDGE.start || x > BRIDGE.end) ? smooth(0.7, 1.0, slope) : 0;
  return Math.max(smooth(0.78, 1.1, slope), outcrop(x, z, slope), cutBand);
}

export function colourAt(x, z, h, slope, out) {
  const n = vnoise(x / 37, z / 37), m = vnoise(x / 9 + 50, z / 9);
  const dCanyon = Math.abs(x - canyonCentre(z));
  if (h < -0.5) return out.copy(PALETTE.seabed);
  if (h < 2.5 && slope < 0.55) return out.copy(h < 1 ? PALETTE.wetSand : PALETTE.sand);
  if (Math.abs(z) < ROAD_HALF + 3.5 && (x < BRIDGE.start || x > BRIDGE.end)) return out.copy(PALETTE.verge).lerp(PALETTE.soil, smooth(ROAD_HALF + 3.5, ROAD_HALF, Math.abs(z)) * 0.8 * (0.6 + 0.4 * m));
  // Vegetation mosaic: golden grass, grey-green sage, dark chaparral in patches and on steeper ground.
  const chapN = vnoise(x / 46 + 13, z / 46 - 4) * 0.7 + vnoise(x / 13, z / 13 + 9) * 0.3;
  const chap = smooth(0.5, 0.66, chapN + slope * 0.18 + (z < -80 ? 0.06 : 0));
  out.copy(PALETTE.grass).lerp(PALETTE.grassDry, smooth(0.4, 0.8, n)).lerp(PALETTE.grassGreen, 0.35 * smooth(0.55, 0.9, m));
  out.lerp(PALETTE.sage, 0.45 * smooth(0.45, 0.7, vnoise(x / 21 - 5, z / 21 + 2)));
  out.lerp(m > 0.5 ? PALETTE.chaparral : PALETTE.chaparralDark, chap * 0.92);
  if (dCanyon < 24 && h < canyonFloor(z) + 16) out.lerp(PALETTE.riparian, 0.8 * smooth(24, 10, dCanyon));
  const rk = rockiness(x, z, h, slope);
  if (rk > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 1.1 + n * 5 + fbm(x / 20, z / 20, 2) * 2);
    rockTmp.copy(PALETTE.rock).lerp(PALETTE.rockDark, 0.5 * strata * (0.6 + 0.4 * m)).lerp(PALETTE.rockWarm, 0.35 * n);
    out.lerp(rockTmp, rk);
  }
  return out;
}
const rockTmp = new THREE.Color();

// Texture weights for the shared terrain shader: [rock, soil, sand, -].
export function splatAt(x, z, h, slope, w) {
  const sand = h < 2.6 && slope < 0.6 ? smooth(2.6, 1.2, h) : 0;
  const nearRoad = Math.abs(z) < ROAD_HALF + 3.2 && (x < BRIDGE.start - 2 || x > BRIDGE.end + 2) ? smooth(ROAD_HALF + 3.2, ROAD_HALF + 0.8, Math.abs(z)) : 0;
  const rock = rockiness(x, z, h, slope) * (1 - sand);
  w[0] = rock; w[1] = nearRoad * (1 - rock) * 0.9; w[2] = sand; w[3] = 0;
  return w;
}


// Late-afternoon sun low over the Pacific (west = +Z), slightly south (+X).
export const SUN_DIR = new THREE.Vector3(0.32, 0.27, 1).normalize();

export function createCourse() {
  return {
    id: 'big-sur', name: 'Big Sur', trackIndex: TRACK_INDEX, track: TRACK, length: FINISH, H0, roadHalf: ROAD_HALF,
    roadY, terrainH, surfaceY, colourAt, splatAt,
    hasSurface: x => !(x > GAP[0] && x < GAP[1]),
    surfaceAt: x => (x >= RAMP[0] && x <= GAP[0] ? 'wood' : 'dirt'),
    sunDir: SUN_DIR, sea: true,
    sunColor: 0xffd3a0, sunIntensity: 3.4, exposure: 0.62, envIntensity: 0.4,
    hemi: {sky: 0xb7c6da, ground: 0x76603f, intensity: 0.42},
    sky: {turbidity: 3.6, rayleigh: 1.2, mieCoefficient: 0.0032, mieDirectionalG: 0.78},
    seaSunColor: 0xf0c890,
    fog: {color: 0xbcc6cc, near: 1200, far: 15000},
    seaColor: 0x0b3f52, shallowColor: 0x2f7f86, shallowAmount: 0.22,
    terrain: {near: {x0: -160, x1: 720, z0: -190, z1: 190, step: 2}, far: {x0: -3200, x1: 5200, z0: -3400, z1: 1600, step: 22}},
    // Big Sur specifics used by its own scenery and cameras.
    GAP, RAMP, BRIDGE, ARCH, DECK_HALF, deckY, archY, coastZ, canyonCentre, canyonFloor,
  };
}
