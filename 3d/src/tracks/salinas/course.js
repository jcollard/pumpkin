// Salinas course layout in world space.
//
// World axes: +X runs down the race (west, from a Gabilan foothill toward the
// valley floor), +Y is up, +Z is the open side (north, up the valley toward
// the bay). The track centre line is z = 0.
//
// The start chutes sit on the crest of a rounded golden foothill. The 100 m
// chute plunges at a constant 22% (the game's grade) to a finish at the toe of
// the hill, where a level run-out crosses the lettuce fields. The valley floor
// is flat (FIELD_Y); the crop rows are drawn on a separate field plane, so the
// terrain below the fields sits a little lower (FLOOR_T).
import * as THREE from 'three';
import * as P from '../../physics.js';
import {fbm, ridged, vnoise, clamp, smooth} from '../../noise.js';

export const TRACK_INDEX = P.tracks.findIndex(t => t.id === 'salinas');
if (TRACK_INDEX < 0) throw Error('This version of the game has no Salinas track.');
export const TRACK = P.tracks[TRACK_INDEX];

export const FINISH = TRACK.length;          // 100 m
export const ROAD_HALF = 4.0;
export const FIELD_Y = 0;                    // valley floor: top of the field plane
export const FLOOR_T = -0.45;                // terrain under the field plane
const RUNOUT = 20;                           // run-out levels off over 20 m past the line
const RUN_LIFT = 0.12;                       // run-out road sits a hand above the fields
const BACK = 10;                             // the start deck levels off over 10 m behind the line
const GRADE = TRACK.grade(0);                // 0.22
export const H0 = TRACK.drop(FINISH) + GRADE * RUNOUT / 2 + RUN_LIFT + FIELD_Y; // 24.32 m above the fields
export const RUN_END = 172;                  // bale wall at the end of the run-out
export const STAND = {x0: 95, x1: 125, z0: -18.6, z1: -7.0, y: 0}; // grandstand footprint; y set below
STAND.y = H0 - TRACK.drop(FINISH) - 0.3;     // level stand floor just under the finish line

// Racing surface (exact physics profile for 0..100).
export function roadY(x) {
  if (x < 0) { const u = Math.min(-x, BACK); return H0 + GRADE * u * (1 - u / (2 * BACK)); }
  if (x <= FINISH) return H0 - TRACK.drop(x);
  const u = Math.min(x - FINISH, RUNOUT);
  return H0 - TRACK.drop(FINISH) - GRADE * u * (1 - u / (2 * RUNOUT));
}

// Crest of the foothill along z = 0 (natural ground, before the corridor blend).
function crest(x) {
  if (x >= -10 && x <= FINISH) return roadY(x) - 0.3;
  if (x > FINISH) { const u = x - FINISH; return roadY(FINISH) - 0.3 - GRADE * u - 0.012 * u * u; }
  const u = -10 - x; // behind the start: a rounded hilltop, then down to a saddle
  return roadY(-10) - 0.3 + 1.8 * smooth(0, 34, u) - 27 * smooth(45, 280, u);
}

// Side fall of the rounded hill: parabolic near the crest, then a steady slope.
const SIDE_R = 115, SIDE_S = 0.3, SIDE_K = SIDE_R * SIDE_S;
function side(d) { return d < SIDE_K ? d * d / (2 * SIDE_R) : SIDE_K * SIDE_S / 2 + SIDE_S * (d - SIDE_K); }

const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h); };
const softFloor = (v, k) => v > 8 * k ? v : k * Math.log1p(Math.exp(v / k));

// The start hill: a lobe of the Gabilan foothills reaching west into the valley.
function hillH(x, z) {
  const d = Math.abs(z);
  const lumps = 2.2 * fbm(x / 70 + 3, z / 70, 3) * smooth(10, 40, d) + 0.8 * fbm(x / 23, z / 23 + 5, 2) * smooth(8, 25, d);
  const widen = 1 + 0.6 * smooth(-10, -120, x); // broader hilltop behind the start
  return crest(x) - side(d / widen) + lumps;
}

// Gabilan Range behind the start (east, -X): rolling golden foothills, then the range.
function gabilanH(x, z) {
  const xr = x + 240 * fbm(z / 900, 4.2, 3) + 60 * fbm(z / 230, 1.3, 2);
  const foot = smooth(-320, -800, xr), range = smooth(-900, -4200, xr);
  const rolling = (34 + 26 * vnoise(x / 500, z / 500)) * (0.55 + 0.45 * fbm(x / 210, z / 210, 4)) * foot;
  const big = 560 * range * (0.72 + 0.4 * fbm(x / 1500, z / 1500 + 2, 3)) + 90 * fbm(x / 520, z / 520, 4) * range;
  return rolling + big - 6;
}

// Santa Lucia Range across the valley (west, +X): higher and more rugged, blue in the haze.
function luciaH(x, z) {
  const xs = x - 420 * fbm(z / 1300, 7.7, 3) - 110 * fbm(z / 300, 2.2, 2);
  const t = smooth(6000, 9300, xs);
  return 620 * t * (0.7 + 0.4 * fbm(x / 1600, z / 1600 + 9, 3)) + 180 * ridged(x / 650, z / 650, 4) * smooth(5900, 7000, xs) - 8;
}

// Ground height without the track corridor and grandstand pad.
function landH(x, z) {
  let h = smax(hillH(x, z), gabilanH(x, z), 12);
  h = Math.max(h, luciaH(x, z));
  return FLOOR_T + softFloor(h - FLOOR_T, 0.5);
}

export function terrainH(x, z) {
  let h = landH(x, z);
  // Keep the land just under the track, start deck and run-out.
  if (x > -40 && x < RUN_END + 30) {
    const corridor = (1 - smooth(ROAD_HALF + 0.6, ROAD_HALF + 5, Math.abs(z))) * smooth(-40, -30, x) * (1 - smooth(RUN_END + 15, RUN_END + 30, x));
    h += (roadY(x) - 0.25 - h) * corridor;
  }
  // Grandstand pad cut into the toe of the hill.
  const dx = Math.max(STAND.x0 - 1 - x, 0, x - STAND.x1 - 1), dz = Math.max(STAND.z0 - 1 - z, 0, z - STAND.z1 - 0.3);
  const out = Math.hypot(dx, dz);
  if (out < 12) h = Math.min(h, STAND.y - 0.08 + out * 0.6);
  return h;
}

export function surfaceY(x, z) {
  if (Math.abs(z) <= ROAD_HALF && x > -30 && x < RUN_END + 10) return roadY(x);
  return Math.max(FIELD_Y, terrainH(x, z));
}

// --- Terrain colouring ---
const C = hex => new THREE.Color(hex);
const PAL = {
  gold: C('#9e7a3c'), goldPale: C('#b08c4c'), straw: C('#8c6c36'), tan: C('#83663c'), greenDry: C('#76743c'),
  swale: C('#7c8044'), oakDark: C('#4f5a33'), chaparral: C('#59603f'), chapDark: C('#454d36'), rock: C('#8b7d68'),
  soil: C('#7a5c3e'), verge: C('#8f8150'), luciaGreen: C('#2c3829'), luciaGold: C('#5e5640'), haze: C('#3c4756'),
};

export function colourAt(x, z, h, slope, out) {
  const n = vnoise(x / 41, z / 41), m = vnoise(x / 9 + 50, z / 9), big = vnoise(x / 260 + 7, z / 260);
  if (h < FIELD_Y + 0.02) return out.copy(PAL.soil);
  if (Math.abs(z) < ROAD_HALF + 3.2 && x > -40 && x < RUN_END + 20) return out.copy(PAL.verge).lerp(PAL.soil, smooth(ROAD_HALF + 3.2, ROAD_HALF, Math.abs(z)) * 0.75 * (0.6 + 0.4 * m));
  if (x > 5200) { // Santa Lucia: chaparral with golden grassy shoulders
    out.copy(PAL.luciaGreen).lerp(PAL.chapDark, m * 0.5);
    out.lerp(PAL.luciaGold, smooth(0.45, 0.8, n) * (1 - smooth(0.4, 0.9, slope)) * 0.8);
    if (slope > 0.7) out.lerp(PAL.rock, smooth(0.7, 1.1, slope) * 0.5);
    return out.lerp(PAL.haze, 0.5);
  }
  // Gabilan foothills: summer-gold grass, darker oak woodland in hollows and on steeper slopes.
  out.copy(PAL.gold).lerp(PAL.goldPale, smooth(0.5, 0.85, n) * 0.6).lerp(PAL.straw, m * 0.35);
  out.lerp(PAL.swale, smooth(0.55, 0.85, big) * 0.35 * (1 - smooth(4, 14, h)));
  if (h > 25 || x < -250) {
    const woods = smooth(0.58, 0.72, vnoise(x / 120 + 3, z / 120 - 4) + slope * 0.25);
    out.lerp(PAL.oakDark, woods * 0.75);
  }
  if (x < -900) out.lerp(PAL.haze, 0.3 * smooth(-900, -3500, x));
  if (h < FIELD_Y + 1.2) out.lerp(PAL.greenDry, 0.4 * smooth(FIELD_Y + 1.2, FIELD_Y, h));
  if (slope > 0.6) out.lerp(PAL.rock, smooth(0.6, 1.0, slope) * 0.5);
  return out;
}

// Summer morning: the marine layer has just burned off and a haze hangs over the
// valley. The sun is on the open (+Z) side, so the tracking camera is front-lit and
// the cameras looking up or down the course both get warm side light.
export const SUN_DIR = new THREE.Vector3(0.06, 0.5, 0.86).normalize();

export function createCourse() {
  return {
    id: 'salinas', name: 'Salinas', trackIndex: TRACK_INDEX, track: TRACK, length: FINISH, H0, roadHalf: ROAD_HALF,
    roadY, terrainH, surfaceY, colourAt,
    hasSurface: () => true,
    surfaceAt: () => 'dirt',
    sunDir: SUN_DIR, sea: false,
    sky: {turbidity: 7.5, rayleigh: 1.25, mieCoefficient: 0.0075, mieDirectionalG: 0.82, cloudCoverage: 0.18, cloudDensity: 0.3, cloudElevation: 0.6},
    fog: {color: 0xbfc8d1, near: 350, far: 13000},
    exposure: 0.52, sunColor: 0xffe6c2, sunIntensity: 3.0,
    hemi: {sky: 0xc4d6ee, ground: 0x7d6a46, intensity: 0.85}, envIntensity: 0.5,
    terrain: {near: {x0: -320, x1: 192, z0: -160, z1: 160, step: 3.4}, far: {x0: -4600, x1: 9800, z0: -5600, z1: 5600, step: 88}},
    dqSpot: team => ({x: -6 - (team % 4) * 1.1, z: ROAD_HALF + 2.0 + Math.floor(team / 4) * 1.1}),
    // Salinas specifics used by its own scenery and cameras.
    FIELD_Y, FLOOR_T, RUN_END, STAND,
  };
}
