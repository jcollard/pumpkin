// Monterey course layout in world space.
//
// World axes: +X runs down the race (east, from the pine hills above Pacific
// Grove toward Cannery Row and the wharf), +Y is up, +Z points to the bay
// (north). The road centre line is z = 0. The race itself is 2D; lanes are cosmetic.
//
// Layout (x along the race):
//   -150..250  pine and eucalyptus forest on the hills (start, monarch grove)
//    280       NET 1 in a meadow clearing at the foot of the first descent
//    335..355  sand trap: a tongue of dune sand across the track
//   300..800  Pacific Grove: Victorian cottages inland, cypress bluffs and the
//             shoreline trail on the bay side; NET 2 at 560; sand at 660..690
//   820..1000 Cannery Row: canneries both sides, conveyor walkways overhead,
//             NET 3 at 890, beach sand on the street at 945..965
//   1000      finish at the foot of the wharf; breakwater with sea lions
import * as THREE from 'three';
import * as P from '../../physics.js';
import {fbm, ridged, vnoise, clamp, smooth} from '../../noise.js';

export const TRACK_INDEX = P.tracks.findIndex(t => t.id === 'monterey');
if (TRACK_INDEX < 0) throw Error('This version of the game has no Monterey track.');
export const TRACK = P.tracks[TRACK_INDEX];

export const H0 = 118.6;                 // start line height above the bay (m)
export const FINISH = TRACK.length;      // 1000 m
export const ROAD_HALF = 4.0;
export const NETS = TRACK.nets.map(n => n.x);
export const SAND = TRACK.sand;
export const ROW = {x0: 818, x1: 1062};  // Cannery Row (buildings on both sides)
export const WHARF = {x: 1092, z0: 26, z1: 250, half: 9};
const END_Y = H0 - TRACK.drop(FINISH);   // ≈ 4.6 m

// Physics height of the road (relative to the start) mapped into the world.
export function roadY(x) {
  if (x < 0) { const u = Math.min(-x, 60); return H0 + 0.095 * u * (1 - u / 120) + Math.max(0, -x - 60) * 0.03; }
  if (x <= FINISH) return H0 - TRACK.drop(x);
  const u = Math.min(x - FINISH, 50);
  return END_Y - 0.1 * u * (1 - u / 100);   // eases onto the waterfront at ≈ 2.1 m
}

// Smooth interpolation through control points (monotone cubic-ish via cosine).
function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [a, ya] = pts[i - 1], [b, yb] = pts[i], u = (x - a) / (b - a), s = u * u * (3 - 2 * u);
    return ya + (yb - ya) * s;
  }
  return pts.at(-1)[1];
}

// Shoreline: z of the water's edge for each x. Far from the hills, close at Cannery Row.
const COAST = [[-1600, 560], [-1000, 470], [-400, 420], [0, 360], [250, 290], [450, 215], [650, 150], [780, 96],
  [835, 52], [930, 41], [1000, 40], [1060, 38], [1150, 46], [1400, 70], [2000, 120], [3000, 330], [4500, 900]];
export function coastZ(x) {
  const town = smooth(760, 840, x) * (1 - smooth(1250, 1400, x));
  return curve(COAST, x) + (1 - town * 0.8) * (14 * Math.sin(x / 61 + 1.3) + 9 * fbm(x / 40, 7.1, 3));
}

// Land height without the corridor blend.
function landH(x, z) {
  const bed = roadY(x), n = fbm(x / 140, z / 140, 4);
  const row = smooth(ROW.x0 - 40, ROW.x0, x) * (1 - smooth(ROW.x1 + 60, ROW.x1 + 140, x));
  if (z <= 0) { // inland: banks, then the wooded hills
    const d = Math.max(0, -z - ROAD_HALF - 1);
    const bank = Math.min(d * 0.45, 1.2 + d * 0.16) + 1.6 * fbm(x / 17, z / 17, 3) * smooth(1, 10, d);
    const hills = 150 * smooth(80, 900, d) * (0.65 + 0.5 * vnoise(x / 600, z / 600)) * (1 - 0.45 * smooth(600, 1100, x));
    const ridge = 40 * ridged(x / 330, z / 330, 4) * smooth(60, 500, d);
    let h = bed + bank + hills + ridge + 4 * n * smooth(0, 30, d);
    // Building pads along Cannery Row: flat terraces stepping up the hill.
    if (row > 0) {
      const pad = bed - 0.2 + Math.max(0, d - 42) * 0.25;
      h += (pad - h) * row * (1 - smooth(46, 80, d));
    }
    return h;
  }
  // Bay side: shoulder, a slope of grass and cypress, then the rocky shore.
  const d = Math.max(0, z - ROAD_HALF - 1), cz = coastZ(x);
  const span = Math.max(8, cz - ROAD_HALF - 1), t = d / span;
  let h;
  if (t < 1) {
    const shape = Math.pow(t, 1.35 + 0.5 * vnoise(x / 120, 3.3));
    h = bed - 0.3 + (1.2 - bed) * shape + 3.5 * fbm(x / 35, z / 35, 3) * t * (1 - t) * 4 * (1 - row * 0.8);
    // Low rock bluff at the water's edge.
    h += 2.2 * smooth(0.82, 0.97, t) * (1 - smooth(0.97, 1, t)) * (0.5 + vnoise(x / 18, z / 18));
  } else {
    const w = z - cz;
    h = 1.2 - Math.min(w * 0.35, 3 + w * 0.06) - Math.min(28, w * 0.025) + 1.6 * fbm(x / 21, z / 21, 3) * smooth(30, 0, w);
  }
  // The peninsula ends past Point Pinos (behind the start).
  const west = smooth(-1150, -1400, x + 60 * Math.sin(z / 230));
  if (west > 0) h += (-9 - h) * west;
  return h;
}

export function terrainH(x, z) {
  const bed = roadY(x), h = landH(x, z);
  const corridor = 1 - smooth(ROAD_HALF + 0.6, ROAD_HALF + 5, Math.abs(z));
  return h + (bed - 0.25 - h) * corridor;
}

export function surfaceY(x, z) {
  if (Math.abs(z) <= ROAD_HALF) return roadY(x);
  return Math.max(0, terrainH(x, z));
}

export const inSand = (x, pad = 0) => SAND.some(([a, b]) => x >= a - pad && x <= b + pad);
// Patchy dune sand spilling off the first two traps.
export function dunes(x, z) {
  const n = vnoise(x / 7, z / 7);
  return Math.max(smooth(26, 8, Math.hypot((x - 345) * 1.1, z * 0.9)), smooth(30, 9, Math.hypot((x - 675) * 0.9, (z - 4) * 0.85))) * smooth(0.25, 0.6, n + 0.15);
}

// Texture weights for the shared terrain shader: [rock, soil, sand, -].
export function splatAt(x, z, h, slope, w) {
  const cz = coastZ(x);
  const underRow = x > ROW.x0 - 10 && x < ROW.x1 + 120 && z > 18;
  const beach = !underRow && h < 2.6 && slope < 0.6 && z > cz - 8 ? smooth(2.6, 1.2, h) : 0;
  const sand = Math.max(beach, dunes(x, z) * 0.9, Math.abs(z) < ROAD_HALF + 3.5 && inSand(x, 4) ? 0.8 : 0);
  const row = x > ROW.x0 - 10 && x < ROW.x1 + 120 && z > -50 && z < cz;
  const nearRoad = Math.abs(z) < ROAD_HALF + 3.2 ? smooth(ROAD_HALF + 3.2, ROAD_HALF + 0.8, Math.abs(z)) : 0;
  const rock = underRow ? 0.85 : smooth(0.62, 1.0, slope) * (1 - sand) + (z > 0 && z > cz - 10 && h > 0.4 ? 0.5 * smooth(0.4, 0.7, vnoise(x / 9, z / 9)) : 0);
  w[0] = Math.min(1, rock); w[1] = Math.max(nearRoad * 0.9, row ? 0.75 : 0) * (1 - rock) * (1 - sand); w[2] = sand; w[3] = 0;
  return w;
}

// --- Terrain colouring ---
const C = hex => new THREE.Color(hex);
const PALETTE = {
  rock: C('#6a625a'), rockDark: C('#3d3833'), lichen: C('#a08a52'),
  needles: C('#5a4630'), forest: C('#3b4127'), grass: C('#a08c52'), grassDry: C('#bfa262'), green: C('#66733a'),
  iceplant: C('#55702f'), iceBloom: C('#b8336e'), sand: C('#c6ad82'), wetSand: C('#9a876a'), dune: C('#c8aa78'),
  soil: C('#6f5238'), verge: C('#7a7040'), seabed: C('#4f6a63'), kelpbed: C('#3d4f3a'), paving: C('#6e6a63'), asphalt: C('#4c4a46'),
};

export function colourAt(x, z, h, slope, out) {
  const n = vnoise(x / 37, z / 37), m = vnoise(x / 9 + 50, z / 9), cz = coastZ(x);
  const row = x > ROW.x0 - 10 && x < ROW.x1 + 120;
  if (h < -0.6) return out.copy(PALETTE.seabed).lerp(PALETTE.kelpbed, smooth(0.5, 0.8, vnoise(x / 30, z / 30)) * 0.6);
  if (row && z > 18) return out.copy(PALETTE.rockDark).lerp(PALETTE.rock, 0.5 * m).lerp(PALETTE.kelpbed, h < 1 ? 0.4 : 0);  // riprap under the canneries
  if (z > 0 && z > cz - 6 && h < 2.6) return out.copy(h < 0.9 ? PALETTE.wetSand : PALETTE.sand).lerp(PALETTE.rock, slope > 0.6 ? 0.7 : 0);
  if (Math.abs(z) < ROAD_HALF + 3.5) {
    if (inSand(x, 4)) return out.copy(PALETTE.dune).lerp(PALETTE.sand, m);
    if (row) return out.copy(PALETTE.paving).lerp(PALETTE.asphalt, 0.4 * m);
    return out.copy(PALETTE.verge).lerp(PALETTE.soil, smooth(ROAD_HALF + 3.5, ROAD_HALF, Math.abs(z)) * 0.8 * (0.6 + 0.4 * m));
  }
  // Dune patches around the first two sand traps.
  const duneA = dunes(x, z);
  if (duneA > 0.05 && slope < 0.7) { out.copy(PALETTE.grassDry).lerp(PALETTE.dune, duneA * (0.45 + 0.35 * m)); return out; }
  if (row && z < 0 && z > -50) return out.copy(PALETTE.paving).lerp(PALETTE.asphalt, 0.5 * n).lerp(PALETTE.soil, 0.2 * m);
  if (row && z > 0 && z < cz) return out.copy(PALETTE.paving).lerp(PALETTE.rock, 0.3 * m);
  if (slope > 0.9) return out.copy(PALETTE.rock).lerp(PALETTE.rockDark, 0.5 * m).lerp(PALETTE.lichen, 0.15 * n);
  // Ice plant carpets on the shoreline slopes (magenta in bloom).
  if (z > 0 && z > cz - 26) {
    const t = smooth(cz - 26, cz - 10, z);
    out.copy(PALETTE.green).lerp(PALETTE.iceplant, t);
    if (vnoise(x / 11, z / 11) > 0.55) out.lerp(PALETTE.iceBloom, t * 0.75 * smooth(0.55, 0.7, vnoise(x / 11, z / 11)));
    if (slope > 0.6) out.lerp(PALETTE.rock, smooth(0.6, 0.9, slope));
    return out;
  }
  // Pine forest floor on the hills, golden grass lower down.
  const forest = smooth(560, 200, x) * 0.8 + (z < -60 ? 0.6 * smooth(-60, -160, z) : 0);
  out.copy(PALETTE.green).lerp(PALETTE.grass, n).lerp(PALETTE.grassDry, smooth(0.5, 0.9, n) * 0.7 * (1 - forest));
  out.lerp(m > 0.5 ? PALETTE.needles : PALETTE.forest, clamp(forest, 0, 1) * (0.55 + 0.3 * m));
  if (slope > 0.6) out.lerp(PALETTE.rock, smooth(0.6, 0.9, slope) * 0.8);
  return out;
}

// Late-afternoon summer sun low over the bay (west-northwest at the solstice; nudged north so the
// cameras on the bay side see the canneries and pumpkins lit, not backlit).
export const SUN_DIR = new THREE.Vector3(-0.32, 0.25, 0.92).normalize();

export function createCourse() {
  return {
    id: 'monterey', name: 'Monterey', trackIndex: TRACK_INDEX, track: TRACK, length: FINISH, H0, roadHalf: ROAD_HALF,
    roadY, terrainH, surfaceY, colourAt, splatAt,
    hasSurface: () => true,
    surfaceAt: x => (inSand(x) ? "sand" : "dirt"),
    sunDir: SUN_DIR, sea: true,
    sunColor: 0xffd3a0, sunIntensity: 3.0, exposure: 0.58, envIntensity: 0.5,
    sky: {turbidity: 4.6, rayleigh: 1.3, mieCoefficient: 0.005, mieDirectionalG: 0.84, cloudCoverage: 0.34, cloudDensity: 0.38},
    fog: {color: 0xc4cbcc, near: 700, far: 9000},
    hemi: {sky: 0xb8cce4, ground: 0x6c5a40, intensity: 0.85},
    seaColor: 0x0f4a55,
    dqSpot: team => ({x: -6 - team * 0.9, z: ROAD_HALF + 2.4}),
    terrain: {near: {x0: -170, x1: 1240, z0: -160, z1: 215, step: 2.5}, far: {x0: -3000, x1: 5000, z0: -3000, z1: 2600, step: 25}},
    shoreBox: {x0: -900, x1: 2200, z0: -20, z1: 700},
    // Monterey specifics used by its own scenery and cameras.
    NETS, SAND, ROW, WHARF, coastZ, inSand,
  };
}
