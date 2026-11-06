// Carmel course layout in world space.
//
// World axes: +X runs down the race (west, down an Ocean Avenue-style village
// lane to the beach), +Y is up, +Z points north. The lane centre line is z = 0.
// The sea lies ahead (+X): Carmel Bay, with Point Lobos and a mission across
// the water to the south-west (-Z) and Pebble Beach headlands to the north (+Z).
import * as THREE from 'three';
import * as P from '../../physics.js';
import {fbm, ridged, vnoise, clamp, smooth} from '../../noise.js';

export const TRACK_INDEX = P.tracks.findIndex(t => t.id === 'carmel');
if (TRACK_INDEX < 0) throw Error('This version of the game has no Carmel track.');
export const TRACK = P.tracks[TRACK_INDEX];

export const H0 = 70;                    // start line height above the bay (m)
export const FINISH = TRACK.length;      // 250 m
export const ROAD_HALF = 4.0;
export const CRESTS = [{x: 60, h: 1.1, w: 22}, {x: 130, h: 1.5, w: 26}, {x: 205, h: 1.8, w: 30}];
export const SHORE_X = 360;              // waterline on the race axis
export const BEACH_W = 60;               // dry beach width at the foot of the lane
export const DUNE_TOP = 10;              // finish height: top of the dunes
export const VILLAGE_END = 178;          // last cottages; white-sand dunes below
export const RUNOUT_END = 334;           // end of the sand lane (catch bales)
export const MISSION = {x: 1180, z: -2590, rot: -0.45};   // on a terrace across the bay (artistic licence)

// Land height along the fall line, by distance inland from the waterline (no noise).
// Beach, dune face, then the village slope at the race's own 24% grade.
function beachH(d) { const u = clamp(d / BEACH_W, 0, 1); return 1.3 * (1 - (1 - u) * (1 - u)); }
function duneFace(d) { // Hermite from (BEACH_W, 1.3, slope 0) to (BEACH_W + 50, DUNE_TOP, slope 0.24)
  const u = clamp((d - BEACH_W) / 50, 0, 1), y0 = 1.3, y1 = DUNE_TOP, m1 = 0.24 * 50;
  return y0 * (2 * u ** 3 - 3 * u * u + 1) + y1 * (-2 * u ** 3 + 3 * u * u) + m1 * (u ** 3 - u * u);
}
export function land0(d) {
  if (d < 0) return Math.max(-34, d * 0.035);
  if (d < BEACH_W) return beachH(d);
  if (d < BEACH_W + 50) return duneFace(d);
  if (d < 480) return DUNE_TOP + 0.24 * (d - BEACH_W - 50);
  // Above the village the hill eases off towards the wooded ridge.
  return DUNE_TOP + 0.24 * (480 - BEACH_W - 50) + 145 * (1 - Math.exp(-(d - 480) / 604));
}

// Physics height of the lane. For 0..250 it is exactly the game's surface.
export function roadY(x) {
  if (x >= 0 && x <= FINISH) return H0 - TRACK.drop(x);
  return land0(SHORE_X - x);
}
const roadSmooth = x => land0(SHORE_X - x); // same without the crests
const crestsH = x => (x > 0 && x < FINISH ? roadY(x) - roadSmooth(x) : 0);

// --- Coastline: Carmel Bay as a polyline from the north (Pebble Beach) to the south (Point Lobos) ---
const COAST = [
  [6000, 5200], [3600, 4300], [2600, 3300], [2150, 2520], [1950, 2280], [1550, 2080], [1150, 1720], [830, 1270], [590, 840],
  [440, 470], [378, 210], [SHORE_X, 0], [364, -210], [392, -430], [450, -630], [545, -810], [655, -950], [722, -1085],
  [690, -1190], [600, -1290], [520, -1400], [470, -1560], [462, -1720], [505, -1900], [610, -2060], [830, -2270], [1180, -2470],
  [1580, -2600], [1960, -2660], [2280, -2620], [2560, -2540], [2760, -2600], [2980, -2760], [3250, -2880], [3600, -2960],
  [4000, -3080], [4600, -3380], [5600, -3900], [7400, -4800],
];
function smoothCoast(pts, sub = 5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts.at(-1));
  return out;
}
const SHORE = smoothCoast(COAST);

// Signed distance inland from the waterline (negative at sea). The shore is a
// smooth polyline with the land on its east side, so the sign comes from the
// nearest segment.
const SEG = (() => { // flat segment arrays: ax, az, dx, dz, 1/len^2
  const n = SHORE.length - 1, a = new Float64Array(n * 5);
  for (let i = 0; i < n; i++) {
    const [ax, az] = SHORE[i], [bx, bz] = SHORE[i + 1], dx = bx - ax, dz = bz - az;
    a.set([ax, az, dx, dz, 1 / (dx * dx + dz * dz)], i * 5);
  }
  return a;
})();
function exactCoastDist(x, z) {
  let best = Infinity, side = 1;
  for (let k = 0; k < SEG.length; k += 5) {
    const ax = SEG[k], az = SEG[k + 1], dx = SEG[k + 2], dz = SEG[k + 3];
    let t = ((x - ax) * dx + (z - az) * dz) * SEG[k + 4];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; side = dx * ez - dz * ex; }
  }
  return side > 0 ? -Math.sqrt(best) : Math.sqrt(best);
}

// Sampled on a grid once, then bilinear (fast enough for terrain and scatter).
const G = {x0: -3600, x1: 7600, z0: -5200, z1: 5200, step: 25};
let grid = null;
function buildGrid() {
  const nx = Math.round((G.x1 - G.x0) / G.step) + 1, nz = Math.round((G.z1 - G.z0) / G.step) + 1;
  grid = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = exactCoastDist(G.x0 + i * G.step, G.z0 + j * G.step);
  grid.nx = nx; grid.nz = nz;
}
export function coastDist(x, z) {
  if (!grid) buildGrid();
  const fx = clamp((x - G.x0) / G.step, 0, grid.nx - 1.001), fz = clamp((z - G.z0) / G.step, 0, grid.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = grid.nx;
  const a = grid[j * n + i], b = grid[j * n + i + 1], c = grid[(j + 1) * n + i], d = grid[(j + 1) * n + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v + Math.max(0, G.x0 - x);
}

// Waterline x for a given z (Newton steps on the distance field).
export function shoreX(z, guess = SHORE_X) {
  let x = guess;
  for (let k = 0; k < 6; k++) x += coastDist(x, z);
  return x;
}

// Regions around the bay (0..1 weights).
const bump = (v, c, w) => Math.exp(-(((v - c) / w) ** 2));
const wMissionValley = (x, z) => bump(z, -1700, 260) * (1 - smooth(-900, -1500, x));
const wCarmelPoint = (x, z) => bump(z, -1000, 230) * smooth(300, 520, x);
const wLobos = (x, z) => smooth(1500, 2300, x) * smooth(-2300, -2700, z);
const wPebble = (x, z) => smooth(1200, 2000, z) * smooth(500, 1100, x);
const wVillage = (x, z) => 1 - smooth(260, 520, Math.abs(z));

// Land shape away from the lane.
function landH(x, z) {
  const d = coastDist(x, z);
  if (d < 0) { // seabed (under the water plane)
    return Math.max(-38, d * 0.035) - 6 * wLobos(x, z) * smooth(0, -60, d);
  }
  const wv = wVillage(x, z);
  let h = land0(d);
  // Beach narrows away from the lane; elsewhere the dunes are lower.
  const nB = fbm(x / 160, z / 160, 3);
  if (wv < 1) {
    const other = (d < 18 ? 1.3 * d / 18 : 1.3 + 6 * smooth(18, 90, d)) + 180 * (1 - Math.exp(-Math.max(0, d - 60) / 900));
    h = h * wv + other * (1 - wv);
    h += (1 - wv) * smooth(60, 600, d) * (40 * fbm(x / 520, z / 520, 4) + 30 * ridged(x / 900, z / 900, 3));
  }
  // Village: the crests roll across the whole street; the south side climbs gently;
  // a few dune hummocks near the beach.
  const xl = SHORE_X - d;
  if (xl > 30 && xl < 240) h += wv * crestsH(xl) * (1 - smooth(14, 70, Math.abs(z)));
  h += wv * (0.045 * Math.max(0, -z - 6) * smooth(130, 200, d) - 0.012 * Math.max(0, z - 6) * smooth(130, 200, d));
  h += wv * 1.6 * fbm(x / 22, z / 22, 3) * smooth(55, 75, d) * (1 - smooth(150, 190, d)) * smooth(6, 16, Math.abs(z));
  h += 0.9 * nB * smooth(120, 300, d);
  // Carmel River valley: low flats where the mission stands.
  const mv = wMissionValley(x, z) * smooth(10, 70, d);
  if (mv > 0) h += (2.4 + 0.012 * Math.max(0, d - 70) + 1.2 * fbm(x / 60, z / 60, 2) - h) * mv * (1 - smooth(900, 1600, d));
  // A level terrace for the mission across the bay.
  const mt = bump(x, MISSION.x, 90) * bump(z, MISSION.z, 70);
  if (mt > 0.01 && d > 0) h += (Math.min(9, 1.5 + d * 0.12) - h) * Math.min(1, mt * 1.6);
  // Low rocky point between the beach and the river.
  const cp = wCarmelPoint(x, z);
  if (cp > 0) h += (Math.min(14, 2.5 + d * 0.35) + 3 * fbm(x / 40, z / 40, 3) - h) * cp * (1 - smooth(200, 500, d));
  // Point Lobos: granite headlands with cliffs.
  const lo = wLobos(x, z);
  if (lo > 0) h += (Math.min(42, 4 + d * 0.9) + 16 * ridged(x / 160, z / 160, 4) - 4 - h) * lo * (1 - smooth(500, 1100, d));
  // Pebble Beach side: rocky shore, wooded slopes.
  const pb = wPebble(x, z);
  if (pb > 0) h += (Math.min(26, 3 + d * 0.45) + 8 * fbm(x / 90, z / 90, 3) - h) * pb * (1 - smooth(400, 900, d));
  return h;
}

export function terrainH(x, z) {
  let h = landH(x, z);
  if (x > -260 && x < RUNOUT_END + 30) {
    const corridor = 1 - smooth(ROAD_HALF + 0.6, ROAD_HALF + 5, Math.abs(z));
    const k = x > RUNOUT_END ? 1 - smooth(RUNOUT_END, RUNOUT_END + 30, x) : 1;
    if (corridor > 0) h += (roadY(x) - 0.25 - h) * corridor * k;
  }
  return h;
}

export function surfaceY(x, z) {
  if (Math.abs(z) <= ROAD_HALF && x > -260 && x < RUNOUT_END) return roadY(x);
  return Math.max(0, terrainH(x, z));
}

// --- Terrain colouring ---
const C = hex => new THREE.Color(hex);
const PAL = {
  sand: C('#bdb29c'), sandWarm: C('#b2a48a'), wetSand: C('#b3a68f'), seabed: C('#5fb3ad'), seabedDeep: C('#2c6f74'),
  iceplant: C('#6f7d3a'), iceplantRed: C('#8a5a3a'), duneGrass: C('#a9a46a'),
  lawn: C('#5f7b3a'), lawnDry: C('#8c8c4e'), duff: C('#6b5034'), soil: C('#7a5c3e'), verge: C('#6d6a3e'),
  pine: C('#2c4027'), pineDark: C('#1f2f1a'), grass: C('#6a6237'), grassDry: C('#7a6c3f'),
  granite: C('#a39a8c'), graniteDark: C('#6f675d'), rock: C('#7d7469'), field: C('#7e8d48'),
};

// Inland edge of the white sand: the open dunes below the village reach up to the finish
// and the end of the lane; elsewhere the beach is a narrower strip below the bluff.
function sandEdgeAt(x, z, wv, m) {
  const lane = 1 - smooth(30, 95, Math.abs(z));
  const village = 72 + 106 * lane + 10 * fbm(x / 30, z / 30, 2);
  return wv * village + (1 - wv) * (24 + 10 * m);
}

export function colourAt(x, z, h, slope, out) {
  const d = coastDist(x, z), n = vnoise(x / 37, z / 37), m = vnoise(x / 9 + 50, z / 9);
  if (d < 0) return out.copy(PAL.seabed).lerp(PAL.seabedDeep, smooth(-10, -140, d));
  const lo = wLobos(x, z), wv = wVillage(x, z);
  if (lo > 0.5 && d > 4) { // granite and cypress
    if (slope > 0.6) return out.copy(PAL.granite).lerp(PAL.graniteDark, m * 0.6);
    return out.copy(PAL.pine).lerp(PAL.grass, smooth(0.2, 0.45, fbm(x / 200, z / 200, 2)) * 0.6);
  }
  if (d < 6 + 6 * m) return out.copy(PAL.wetSand).lerp(PAL.sand, smooth(1, 7, d));
  // White sand: beach and dunes near the lane, a narrower strip elsewhere.
  const sandEdge = sandEdgeAt(x, z, wv, m);
  if (d < sandEdge) {
    out.copy(PAL.sand).lerp(PAL.sandWarm, 0.35 * m);
    if (d > BEACH_W + 4) { // dune vegetation in patches
      const veg = smooth(0.48, 0.7, vnoise(x / 13 + 7, z / 13)) * smooth(BEACH_W + 4, BEACH_W + 20, d);
      out.lerp(n > 0.5 ? PAL.iceplant : PAL.duneGrass, veg * 0.85);
      if (n > 0.66) out.lerp(PAL.iceplantRed, veg * 0.4);
    }
    if (Math.abs(z) < ROAD_HALF + 3 && x < RUNOUT_END + 4) out.lerp(PAL.sandWarm, smooth(ROAD_HALF + 3, ROAD_HALF, Math.abs(z)) * 0.5);
    return out;
  }
  if (slope > 0.9) return out.copy(PAL.rock).lerp(PAL.graniteDark, 0.4 * m);
  if (wv > 0.5 && d < 640) { // village gardens, lawns and pine duff
    if (Math.abs(z) < ROAD_HALF + 3.5) return out.copy(PAL.verge).lerp(PAL.duff, smooth(ROAD_HALF + 3.5, ROAD_HALF, Math.abs(z)) * 0.7);
    out.copy(PAL.lawn).lerp(PAL.duff, smooth(0.35, 0.65, n) * 0.75).lerp(PAL.lawnDry, m * 0.3);
    return out;
  }
  const mv = wMissionValley(x, z);
  if (mv > 0.5 && d < 900) return out.copy(PAL.field).lerp(PAL.grassDry, m * 0.5);
  // Hills: Monterey pine forest with golden grass meadows (large-scale patches, not per-vertex noise).
  const big = fbm(x / 420 + 3.3, z / 420, 3), open = smooth(0.2, 0.45, big) * (1 - smooth(0.4, 0.9, slope));
  out.copy(PAL.pine).lerp(PAL.pineDark, smooth(-0.3, 0.3, fbm(x / 160, z / 160, 2)) * 0.7).lerp(big > 0.3 ? PAL.grassDry : PAL.grass, open * 0.85);
  if (slope > 0.6) out.lerp(PAL.rock, smooth(0.6, 0.95, slope) * 0.7);
  return out;
}

// Photo-texture layers for the shared terrain shader: [rock, soil, sand, -].
export function splatAt(x, z, h, slope, out) {
  const d = coastDist(x, z), wv = wVillage(x, z), m = vnoise(x / 9 + 50, z / 9);
  const sandEdge = sandEdgeAt(x, z, wv, m);
  const sand = d < sandEdge ? 1 - smooth(sandEdge - 6, sandEdge, d) : 0;
  const rock = smooth(0.6, 1.0, slope) * (1 - sand * 0.7);
  const az = Math.abs(z), nearRoad = az < ROAD_HALF + 3.5 ? smooth(ROAD_HALF + 3.5, ROAD_HALF + 0.8, az) : 0;
  out[0] = rock; out[1] = nearRoad * (1 - sand) * 0.8; out[2] = sand * (1 - rock); out[3] = 0;
  return out;
}

// Golden-hour sun low over the bay, to the north-west (+X, +Z).
export const SUN_DIR = new THREE.Vector3(0.76, 0.17, 0.62).normalize();

export function createCourse() {
  return {
    id: 'carmel', name: 'Carmel', trackIndex: TRACK_INDEX, track: TRACK, length: FINISH, H0, roadHalf: ROAD_HALF,
    roadY, terrainH, surfaceY, colourAt,
    hasSurface: () => true,
    surfaceAt: x => (x > VILLAGE_END + 10 ? 'sand' : 'dirt'),
    sunDir: SUN_DIR, sea: true,
    sky: {turbidity: 6, rayleigh: 1.5, mieCoefficient: 0.007, mieDirectionalG: 0.88, cloudCoverage: 0.22, cloudDensity: 0.3, cloudElevation: 0.6},
    fog: {color: 0xe2cfb2, near: 700, far: 11000},
    sunColor: 0xffa862, sunIntensity: 3.4, exposure: 0.6, envIntensity: 0.45,
    hemi: {sky: 0xaabdd8, ground: 0x8a6e50, intensity: 1.4},
    seaColor: 0x0d5162,
    terrain: {near: {x0: -196, x1: 476, z0: -206, z1: 206, step: 2.5}, far: {x0: -3000, x1: 5200, z0: -4000, z1: 3400, step: 40}},
    shoreBox: {x0: 240, x1: 1000, z0: -900, z1: 1000}, splatAt, groundSets: {ground: 'grass_green'},
    dqSpot: team => ({x: -2.3 - (team % 2) * 0.35, z: -7.4 - (team % 3) * 0.1}),
    // Carmel specifics used by its own scenery and cameras.
    CRESTS, SHORE_X, BEACH_W, DUNE_TOP, VILLAGE_END, RUNOUT_END, MISSION, coastDist, shoreX, landH, roadSmooth,
  };
}
