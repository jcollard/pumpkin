// The Salinas Valley floor: a patchwork of crop fields drawn procedurally on one
// big plane at FIELD_Y. Lettuce, romaine, broccoli, celery, artichokes,
// strawberries under plastic, hoop tunnels, fallow ground and fresh beds, with
// farm roads and paved county roads on a regular grid. Rows are anti-aliased by
// their screen footprint, so they stay crisp near the camera and fade to the
// field's average colour toward the horizon (no moire). Furrows and plant
// domes perturb the normal, so the low sun rakes across the beds.
//
// A JS twin of the grid (cellOf, cropAt, roadX/roadZ) lets the scenery line up
// windbreaks, pipes and 3D lettuce with the rows the shader draws.
import * as THREE from 'three';

export const CELL = [220, 160];          // field size along x and z (metres)
export const ORIGIN = [185, -75];        // a grid line passes through here
export const CROPS = ['lettuce', 'redgreen', 'romaine', 'artichoke', 'strawberry', 'hoops', 'broccoli', 'fallow', 'beds', 'mustard', 'celery'];
const WEIGHTS = [0.22, 0.08, 0.12, 0.07, 0.12, 0.04, 0.10, 0.08, 0.07, 0.03, 0.07];

// Fields chosen by hand around the course: [cx, cz, crop, dir (0 rows along x, 1 along z), harvest fraction (1 = none)].
export const OVERRIDES = [
  [-1, 0, 0, 0, 1],    // finish & run-out: green lettuce, rows pointing down the course
  [-1, 1, 1, 0, 1],    // north of the run-out: red and green leaf lettuce
  [-1, -1, 4, 0, 1],   // south: strawberries under plastic
  [0, 0, 2, 0, 0.55],  // beyond the road: romaine, half harvested
  [0, 1, 10, 1, 1],    // celery
  [0, -1, 3, 1, 1],    // artichokes
  [-2, 1, 6, 0, 1],    // broccoli
  [-2, -1, 7, 1, 1],   // fallow
];

// Integer hash shared by JS and GLSL (uint arithmetic wraps mod 2^32 in both).
function hU(x) {
  x >>>= 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return x >>> 0;
}
export const hashCell = (cx, cz, salt) => hU((Math.imul(cx + 4096, 1973) + hU(cz + 4096 + salt)) >>> 0) / 4294967295;
const imod = (a, n) => ((a % n) + n) % n;
export const pavedX = k => imod(k, 3) === 0;   // grid lines x = ORIGIN + k * CELL: county road every third line
export const pavedZ = j => imod(j, 4) === 2;
export const lineX = k => ORIGIN[0] + k * CELL[0];
export const lineZ = j => ORIGIN[1] + j * CELL[1];

export function cellOf(x, z) {
  const qx = (x - ORIGIN[0]) / CELL[0], qz = (z - ORIGIN[1]) / CELL[1];
  const cx = Math.floor(qx), cz = Math.floor(qz);
  return {cx, cz, fx: (qx - cx) * CELL[0], fz: (qz - cz) * CELL[1]};
}

export function cropAt(cx, cz) {
  const o = OVERRIDES.find(v => v[0] === cx && v[1] === cz);
  if (o) return {type: o[2], name: CROPS[o[2]], dir: o[3], harvest: o[4]};
  let h = hashCell(cx, cz, 17), type = 0;
  for (; type < WEIGHTS.length - 1 && h > WEIGHTS[type]; type++) h -= WEIGHTS[type];
  const hv = hashCell(cx, cz, 53);
  return {type, name: CROPS[type], dir: hashCell(cx, cz, 31) < 0.5 ? 0 : 1, harvest: hv < 0.35 ? 0.3 + hv * 1.6 : 1};
}

// Row geometry the shader uses for lettuce-like crops (for 3D plants that match it).
export const ROWS = {lettuce: {S: 1.0, rows: [0.3, 0.7], P: 0.3, R: 0.14}, redgreen: {S: 1.0, rows: [0.3, 0.7], P: 0.3, R: 0.14}};

const lin = hex => new THREE.Color(hex); // THREE.Color stores linear values
const PALETTE = [
  '#6b5139', // 0 furrow soil (damp)
  '#8d6d4c', // 1 bed top soil (dry)
  '#6fa53a', // 2 green lettuce
  '#7a3d3c', // 3 red leaf lettuce
  '#4c7d2f', // 4 romaine
  '#8ea38a', // 5 artichoke silver-green
  '#2c2d2c', // 6 black plastic mulch
  '#5d8a3a', // 7 strawberry plants
  '#e4e7e4', // 8 hoop tunnel plastic
  '#3d6640', // 9 broccoli blue-green
  '#7e6248', // 10 fallow / disced soil
  '#d9c33c', // 11 mustard flowers
  '#9cc05a', // 12 celery pale green
  '#55524d', // 13 asphalt
  '#a48a66', // 14 farm road dirt
  '#958d58', // 15 weedy field edge
  '#e0c45a', // 16 road paint (faded yellow)
  '#b49a74', // 17 packed yard dirt
  '#9b9384', // 18 gravel
];

const GLSL = /* glsl */`
varying vec3 vFP;
uniform vec3 uPal[19];
uniform vec4 uOv[8];
uniform sampler2D uMask;
uniform vec4 uMaskRect;
const vec2 FC = vec2(${CELL[0].toFixed(1)}, ${CELL[1].toFixed(1)});
const vec2 FO = vec2(${ORIGIN[0].toFixed(1)}, ${ORIGIN[1].toFixed(1)});
const float W[11] = float[11](${WEIGHTS.map(w => w.toFixed(3)).join(', ')});

uint hU(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float hCell(ivec2 c, int salt) { return float(hU(uint(c.x + 4096) * 1973u + hU(uint(c.y + 4096 + salt)))) / 4294967295.0; }
float h2(vec2 p) { ivec2 i = ivec2(floor(p)); return float(hU(uint(i.x + 65536) * 7919u + hU(uint(i.y + 65536)))) / 4294967295.0; }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
int imod(int a, int n) { return ((a % n) + n) % n; }

// Plants as discs of radius R, in a row at 'off' across a bed of width S, spaced P along it.
// pa, pb: pixel footprint (metres) across and along the rows. Adds the dome slope to g (in a, b).
float plantRow(float fu, float b, float S, float off, float P, float stag, float R, float pa, float pb, float hp, inout vec2 g) {
  float da = (fu - off) * S;
  float db = (fract(b / P + stag) - 0.5) * P;
  float d = length(vec2(da, db));
  float pw = max(pa, pb);
  float disc = 1.0 - smoothstep(R - pw, R + pw, d);
  float stripe = (1.0 - smoothstep(0.8 * R - pa, 0.8 * R + pa, abs(da))) * clamp(1.75 * R / P, 0.0, 1.0);
  float avg = clamp(3.14159 * R * R / (S * P), 0.0, 1.0);
  float tB = smoothstep(0.25 * R, 1.1 * R, pb), tA = smoothstep(0.12 * S, 0.4 * S, pa);
  float k = d < R ? sin(3.14159 * d / R) * hp * 1.5708 / R / max(d, 1e-3) : 0.0;
  g -= vec2(da, db) * k * (1.0 - max(tB, tA));
  return mix(mix(disc, stripe, tB), avg, tA);
}

vec3 fieldShade(vec2 p, vec2 pwx, out vec2 gW, out float rough) {
  rough = 1.0; gW = vec2(0.0);
  vec2 q = (p - FO) / FC;
  ivec2 cid = ivec2(floor(q));
  vec2 f = (q - vec2(cid)) * FC;
  float pmax = max(pwx.x, pwx.y);
  // --- roads and field edges on the grid lines ---
  float dx = min(f.x, FC.x - f.x), dz = min(f.y, FC.y - f.y);
  int bx = f.x < FC.x * 0.5 ? cid.x : cid.x + 1, bz = f.y < FC.y * 0.5 ? cid.y : cid.y + 1;
  bool pX = imod(bx, 3) == 0, pZ = imod(bz, 4) == 2;
  float hx = pX ? 3.6 : 2.6, hz = pZ ? 3.6 : 2.6;
  vec3 dirt = uPal[14] * (0.92 + 0.16 * vn(p * 0.4));
  vec3 roadCol;
  float onX = 1.0 - smoothstep(hx - pwx.x, hx + pwx.x, dx), onZ = 1.0 - smoothstep(hz - pwx.y, hz + pwx.y, dz);
  float edgeX = 1.0 - smoothstep(hx + 1.6 - pwx.x, hx + 1.6 + pwx.x, dx), edgeZ = 1.0 - smoothstep(hz + 1.6 - pwx.y, hz + 1.6 + pwx.y, dz);
  // --- crop ---
  float hv = hCell(cid, 17); int type = 0;
  for (int i = 0; i < 10; i++) { if (hv <= W[i]) break; hv -= W[i]; type++; }
  int dir = hCell(cid, 31) < 0.5 ? 0 : 1;
  float hvst = hCell(cid, 53); float harvest = hvst < 0.35 ? 0.3 + hvst * 1.6 : 1.0;
  for (int i = 0; i < 8; i++) if (ivec2(uOv[i].xy) == cid) { type = int(uOv[i].z); dir = int(uOv[i].w / 10.0); harvest = uOv[i].w - float(dir) * 10.0; }
  float a = dir == 0 ? f.y : f.x, b = dir == 0 ? f.x : f.y, len = dir == 0 ? FC.x : FC.y;
  float pa = dir == 0 ? pwx.y : pwx.x, pb = dir == 0 ? pwx.x : pwx.y;
  float tint = 0.9 + 0.2 * hCell(cid, 71);
  float ptch = vn(p / 23.0 + vec2(cid) * 7.0), fine = vn(p * 1.7);
  vec2 g = vec2(0.0);
  vec3 col;
  float S = 1.0, bedH = 0.07;
  if (type == 3) S = 2.4; else if (type == 4) S = 1.32; else if (type == 5) S = 1.8; else if (type == 7) S = 0.5;
  float u = a / S, fu = fract(u), bed = floor(u);
  float tA = smoothstep(0.12 * S, 0.45 * S, pa);
  float hb = 0.5 - 0.5 * cos(6.28318 * fu);
  vec3 soil = mix(uPal[0], uPal[1], mix(hb, 0.55, tA)) * (0.9 + 0.2 * ptch) * (0.94 + 0.12 * fine);
  float slopeA = 3.14159 * sin(6.28318 * fu) / S * (1.0 - tA);
  bool cut = b > len * harvest && harvest < 1.0;
  if (type == 7) { // fallow: fine disc furrows and clods
    col = mix(uPal[10], uPal[0], 0.5 - 0.5 * mix(cos(6.28318 * fu), 0.0, tA)) * (0.88 + 0.24 * ptch);
    g.x += slopeA * 0.05;
  } else if (type == 9) { // mustard cover crop, broadcast
    float m = smoothstep(0.35, 0.75, vn(p * 2.3) * 0.6 + vn(p * 0.5) * 0.4);
    col = mix(mix(uPal[2] * 0.75, uPal[11], m), mix(uPal[2] * 0.75, uPal[11], 0.6), smoothstep(0.2, 0.8, pmax));
  } else if (type == 5) { // hoop tunnels of white plastic
    float tun = smoothstep(0.08 - pa / S, 0.12 + pa / S, fu) * (1.0 - smoothstep(0.88 - pa / S, 0.92 + pa / S, fu));
    col = mix(soil, uPal[8] * (0.82 + 0.18 * sin(3.14159 * clamp((fu - 0.1) / 0.8, 0.0, 1.0))), mix(tun, 0.8, tA));
    float x = clamp((fu - 0.1) / 0.8, 0.0, 1.0);
    g.x += tun * 0.55 * 3.14159 * cos(3.14159 * x) / (0.8 * S) * (1.0 - tA);
    rough = mix(1.0, 0.55, tun);
  } else if (type == 4) { // strawberries: plastic-covered beds, two rows of plants
    float pl = smoothstep(0.17 - pa / S, 0.21 + pa / S, fu) * (1.0 - smoothstep(0.79 - pa / S, 0.83 + pa / S, fu));
    pl = mix(pl, 0.62, tA);
    col = mix(soil * 0.95, uPal[6] * (0.9 + 0.2 * ptch), pl);
    rough = mix(1.0, 0.42, pl);
    float c = plantRow(fu, b, S, 0.36, 0.34, 0.0, 0.12, pa, pb, 0.08, g) + plantRow(fu, b, S, 0.64, 0.34, 0.5, 0.12, pa, pb, 0.08, g);
    col = mix(col, uPal[7] * (0.85 + 0.3 * fine), min(1.0, c) * (0.8 + 0.2 * ptch));
    g.x += slopeA * 0.09 * (1.0 - pl);
  } else { // row crops
    vec3 pc; float P = 0.3, R = 0.14, hp = 0.12, o0 = 0.3, o1 = 0.7; bool two = true;
    if (type == 0) pc = uPal[2];
    else if (type == 1) pc = mod(bed, 2.0) < 0.5 ? uPal[3] : uPal[2] * 0.95;
    else if (type == 2) { pc = uPal[4]; P = 0.28; R = 0.135; hp = 0.16; }
    else if (type == 3) { pc = uPal[5]; P = 1.3; R = 0.62; hp = 0.45; two = false; o0 = 0.5; }
    else if (type == 6) { pc = uPal[9]; P = 0.45; R = 0.23; hp = 0.2; }
    else if (type == 10) { pc = uPal[12]; P = 0.22; R = 0.11; hp = 0.15; }
    else { pc = uPal[1]; R = 0.0; } // fresh beds
    if (type == 8) { // freshly listed beds: pronounced beds, dark wet furrows, a thread of seedlings
      col = mix(uPal[0] * 0.8, uPal[1] * 1.08, mix(hb, 0.6, tA)) * (0.9 + 0.2 * ptch);
      float c = plantRow(fu, b, S, 0.5, 0.08, 0.0, 0.025, pa, pb, 0.0, g);
      col = mix(col, uPal[2], c * 0.6);
      g.x += slopeA * 0.12;
    } else {
      float vig = 0.75 + 0.5 * ptch;              // patchy growth
      float Rv = cut ? R * 0.25 : R * mix(0.85, 1.08, ptch);
      float c = plantRow(fu, b, S, o0, P, 0.0, Rv, pa, pb, hp, g);
      if (two) c += plantRow(fu, b, S, o1, P, 0.5, Rv, pa, pb, hp, g);
      c = min(1.0, c);
      vec3 leaf = pc * tint * (0.8 + 0.25 * vig) * (0.9 + 0.2 * fine);
      if (cut) leaf = mix(leaf, uPal[1], 0.5);
      col = mix(soil, leaf, c);
      g.x += slopeA * bedH * 1.5 * (1.0 - c);
      if (cut) col = mix(col, soil * 1.05, 0.25);
    }
  }
  col *= mix(0.86 + 0.14 * hb, 1.0, tA); // ambient occlusion in the furrows
  gW = dir == 0 ? vec2(g.y, g.x) : vec2(g.x, g.y);
  // --- field edges, roads ---
  vec3 weeds = uPal[15] * (0.85 + 0.3 * vn(p * 0.9));
  col = mix(col, weeds, max(edgeX, edgeZ));
  float lineX = 1.0 - smoothstep(0.07 - pwx.x, 0.07 + pwx.x, dx), lineZ = 1.0 - smoothstep(0.07 - pwx.y, 0.07 + pwx.y, dz);
  vec3 rX = pX ? mix(mix(uPal[13], uPal[18], smoothstep(2.9, 3.3, dx)), uPal[16], lineX * 0.8) : dirt * mix(1.0, 0.85, smoothstep(0.6, 0.2, abs(dx - 1.1)));
  vec3 rZ = pZ ? mix(mix(uPal[13], uPal[18], smoothstep(2.9, 3.3, dz)), uPal[16], lineZ * 0.8) : dirt * mix(1.0, 0.85, smoothstep(0.6, 0.2, abs(dz - 1.1)));
  col = mix(col, rX, onX);
  col = mix(col, rZ, onZ * (1.0 - onX * (pX ? 1.0 : 0.0)));
  float onRoad = max(onX, onZ);
  gW *= 1.0 - max(onRoad, max(edgeX, edgeZ));
  rough = mix(rough, 0.9, onRoad);
  // --- hand-painted yards, lots and verges near the course ---
  vec2 mu = (p - uMaskRect.xy) * uMaskRect.zw;
  if (mu.x > 0.0 && mu.x < 1.0 && mu.y > 0.0 && mu.y < 1.0) {
    vec4 mk = texture2D(uMask, mu);
    float yard = 1.0 - mk.r;
    vec3 yc = mix(uPal[17] * (0.86 + 0.24 * vn(p * 0.7)) * (0.92 + 0.1 * fine), uPal[18] * (0.9 + 0.2 * fine), mk.b);
    yc = mix(yc, weeds * 0.95, mk.g);
    col = mix(col, yc, yard);
    gW *= mk.r;
    rough = mix(rough, 1.0, yard);
  }
  return col;
}
`;

// mask: {canvas, rect: [x0, z0, x1, z1]} painted by the scenery (R crop, G weeds, B gravel).
export function buildFields(group, {mask, low = false}) {
  const geo = new THREE.PlaneGeometry(16000, 16000, 64, 64);
  geo.rotateX(-Math.PI / 2);
  geo.translate(1200, 0, 0);
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 0});
  const maskTex = new THREE.CanvasTexture(mask.canvas);
  maskTex.flipY = false; maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.anisotropy = 4;
  const [x0, z0, x1, z1] = mask.rect;
  const ov = OVERRIDES.map(o => new THREE.Vector4(o[0], o[1], o[2], o[3] * 10 + o[4]));
  while (ov.length < 8) ov.push(new THREE.Vector4(9999, 9999, 0, 0));
  const uniforms = {
    uPal: {value: PALETTE.map(lin).map(c => new THREE.Vector3(c.r, c.g, c.b))},
    uOv: {value: ov}, uMask: {value: maskTex}, uMaskRect: {value: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0))},
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <map_fragment>', `vec2 fGrad; float fRough;
        vec2 fpw = vec2(abs(dFdx(vFP.x)) + abs(dFdy(vFP.x)), abs(dFdx(vFP.z)) + abs(dFdy(vFP.z)));
        diffuseColor.rgb *= fieldShade(vFP.xz, fpw, fGrad, fRough);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * fRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(normalize(vec3(-fGrad.x, 1.0, -fGrad.y)), 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'salinas-fields-' + (low ? 'l' : 'h');
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0; m.receiveShadow = true; m.castShadow = false;
  m.renderOrder = -1;
  group.add(m);
  return m;
}

// Canvas for the hand-painted near layout. White = crops; paint yards black, weeds green, gravel blue.
export function maskCanvas(rect, res = 0.6) {
  const [x0, z0, x1, z1] = rect;
  const c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) / res); c.height = Math.round((z1 - z0) / res);
  const g = c.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, c.width, c.height);
  const k = c.width / (x1 - x0);
  // Paint helpers in world units. colour: 'yard' | 'weeds' | 'gravel'
  const fill = {yard: '#000000', weeds: '#00ff00', gravel: '#0000ff'};
  const api = {
    canvas: c, rect,
    rect_(xa, za, xb, zb, kind = 'yard', soft = 1.5) {
      g.save(); g.filter = soft > 0 ? `blur(${(soft * k).toFixed(1)}px)` : 'none'; g.fillStyle = fill[kind];
      g.fillRect((xa - x0) * k, (za - z0) * k, (xb - xa) * k, (zb - za) * k); g.restore();
    },
    ellipse(x, z, rx, rz, kind = 'yard', soft = 2) {
      g.save(); g.filter = `blur(${(soft * k).toFixed(1)}px)`; g.fillStyle = fill[kind];
      g.beginPath(); g.ellipse((x - x0) * k, (z - z0) * k, rx * k, rz * k, 0, 0, Math.PI * 2); g.fill(); g.restore();
    },
    poly(pts, kind = 'yard', soft = 1.5) {
      g.save(); g.filter = `blur(${(soft * k).toFixed(1)}px)`; g.fillStyle = fill[kind];
      g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo((x - x0) * k, (z - z0) * k) : g.moveTo((x - x0) * k, (z - z0) * k)); g.closePath(); g.fill(); g.restore();
    },
  };
  return api;
}
