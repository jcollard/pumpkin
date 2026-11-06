// Crowd dressing for any track: bunting, flags, pop-up canopy tents, picnic tables, umbrellas, camp chairs and
// coolers. Everything is procedural (no licences to track), merged per material and placed on the course ground.
// Each helper takes (group, course, opts) and returns the created object(s); animated ones also return update(wall).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {rng} from '../noise.js';
import {woodTexture, signTexture} from '../textures.js';
import {campChairGeometry, PEOPLE_PALETTE} from './people.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = c => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));
export const groundY = (course, x, z) => Math.max(course.terrainH(x, z), Math.abs(z) <= course.roadHalf + 0.5 ? course.roadY(x) : -Infinity);

// Geometry helpers: every piece gets position/normal/uv/color so they all merge.
function paint(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = col(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const place = (g, x, y, z, rotY = 0) => { if (rotY) g.rotateY(rotY); g.translate(x, y, z); return g; };
function tube(a, b, r, color, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}
function boxUV(sx, sy, sz, color, uvScale = 1) { // world-ish UVs so wood grain is not stretched
  const g = new THREE.BoxGeometry(sx, sy, sz), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) * uvScale, (ay > 0.5 ? p.getZ(i) : p.getY(i)) * uvScale);
  }
  return paint(g, color);
}
function addMerged(group, list, mat, {cast = true, receive = true, name} = {}) {
  if (!list.length) return null;
  const m = new THREE.Mesh(mergeGeometries(list, false), mat);
  m.castShadow = cast; m.receiveShadow = receive; if (name) m.name = name;
  group.add(m);
  return m;
}
// Cloth: double sided, with a little fake translucency so backlit fabric glows instead of going black.
function clothMat({glow = 0.18, ...opts} = {}) {
  const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.88, side: THREE.DoubleSide, ...opts});
  if (glow) {
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(3)};`); };
    mat.customProgramCacheKey = () => 'cloth-glow-' + glow;
  }
  return mat;
}
const metalMat = () => new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.45, metalness: 0.6});
let woodMat = null;
const sharedWood = () => (woodMat ??= new THREE.MeshStandardMaterial({map: woodTexture(63, true), vertexColors: true, roughness: 0.85}));

// Cloth that flutters in the wind (vertex shader). Local cloth coordinates: the attached edge is at y = 0 (pennants)
// or x = 0 (flags); `reach` is the distance from that edge where the motion is full.
function flutterMaterial({axis = 'y', reach = 0.4, amp = 0.06, speed = 5, wave = 6, ...opts} = {}) {
  const mat = clothMat({glow: 0, ...opts}), uTime = {value: 0};
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.3;');
    sh.uniforms.uFlutterTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFlutterTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 seedPos = vec3(0.0);
#ifdef USE_INSTANCING
    seedPos = instanceMatrix[3].xyz;
#endif
    float d = clamp(${axis === 'y' ? '-position.y' : 'position.x'} / ${reach.toFixed(3)}, 0.0, 1.0);
    float ph = uFlutterTime * ${speed.toFixed(2)} + seedPos.x * 1.7 + seedPos.z * 1.3 + ${axis === 'y' ? 'position.x' : 'position.x'} * ${wave.toFixed(2)};
    transformed.z += sin(ph) * ${amp.toFixed(3)} * d;
    transformed.${axis === 'y' ? 'x' : 'y'} += cos(ph * 0.7) * ${(amp * 0.25).toFixed(3)} * d;
  }`);
  };
  mat.customProgramCacheKey = () => `flutter-${axis}-${reach}-${amp}-${speed}-${wave}-${!!opts.map}`;
  mat.userData.time = uTime;
  return mat;
}

const BUNTING_COLORS = ['#c8362e', '#efede6', '#2f6db3', '#e9c443', '#e8742a', '#3f9a4b'];

// Pennant bunting on a sagging string between posts.
// opts: points [[x, z, h?], ...] (h = attachment height above ground, default `height`) or from/to [x, z];
// colors (cycled; default festival mix), spacing (m between pennants, 0.42), sag (fraction of span, 0.06),
// height (m, 3.2), size (pennant width m, 0.3), poles (true: wooden poles at every point), seed.
// Returns {mesh, update(wall)}.
export function bunting(group, course, {points, from, to, colors = BUNTING_COLORS, spacing = 0.42, sag = 0.06, height = 3.2, size = 0.3, poles = true, seed = 5} = {}) {
  const pts = (points ?? [from, to]).map(([x, z, h]) => { const g = groundY(course, x, z); return {x, z, g, y: g + (h ?? height)}; });
  const r = rng(seed), mats = [], cols = colors.map(col), strings = [], posts = [];
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-size / 2, 0, 0, size / 2, 0, 0, 0, -size * 1.25, 0], 3));
  tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  tri.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  let k = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], span = Math.hypot(b.x - a.x, b.z - a.z), dip = sag * span;
    const at = t => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 4 * dip * t * (1 - t), a.z + (b.z - a.z) * t);
    const segs = Math.max(4, Math.ceil(span / 1.5));
    for (let s = 0; s < segs; s++) strings.push(tube(at(s / segs), at((s + 1) / segs), 0.008, '#3a3430', 4));
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x), n = Math.floor(span / spacing);
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, p = at(t), slope = Math.atan2(at(Math.min(1, t + 0.02)).y - at(Math.max(0, t - 0.02)).y, span * 0.04);
      mats.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, slope + (r() - 0.5) * 0.1, 'YXZ')), V(1, 1, 1)));
      k++;
    }
  }
  if (poles) for (const p of pts) posts.push(tube(V(p.x, p.g - 0.3, p.z), V(p.x, p.y + 0.15, p.z), 0.05, '#8a6a48', 7));
  const mat = flutterMaterial({axis: 'y', reach: size * 1.25, amp: 0.05, speed: 4.5, wave: 4});
  const inst = new THREE.InstancedMesh(tri, mat, mats.length);
  mats.forEach((m, i) => { inst.setMatrixAt(i, m); inst.setColorAt(i, cols[i % cols.length]); });
  inst.castShadow = true; inst.receiveShadow = true; inst.name = 'bunting';
  group.add(inst);
  addMerged(group, strings, clothMat({side: THREE.FrontSide, glow: 0}), {cast: false});
  addMerged(group, posts, sharedWood());
  return {mesh: inst, update(wall) { mat.userData.time.value = wall; }};
}

// Flag on a pole. opts: x, z, height (pole m, 6), w, h (flag m, 1.6 x 1.0), color or a texture via `text`
// (drawn with textures.signTexture: {text, bg, fg}), rotY (direction the flag streams, default +X). Returns {group, update(wall)}.
export function flagPole(group, course, {x, z, height = 6, w = 1.6, h = 1.0, color = '#c8362e', text = null, bg, fg = '#fdf6e3', rotY = 0} = {}) {
  const g = new THREE.Group(), base = groundY(course, x, z);
  g.add(addMerged(new THREE.Group(), [tube(V(0, -0.3, 0), V(0, height, 0), 0.045, '#d9d6cf', 8), paint(new THREE.SphereGeometry(0.07, 8, 6).translate(0, height + 0.05, 0), '#c9a23c')], metalMat()));
  const cloth = new THREE.PlaneGeometry(w, h, 12, 4); cloth.translate(w / 2, height - h / 2 - 0.08, 0);
  const opts = text ? {map: signTexture([text], {bg: bg ?? (typeof color === 'string' ? color : '#c8362e'), fg, border: null, planks: false, w: 512, h: 320, font: 'bold 120px'})} : {};
  const mat = flutterMaterial({axis: 'x', reach: w, amp: 0.12, speed: 3.2, wave: 2.2, ...opts});
  const flag = new THREE.Mesh(paint(cloth, text ? '#ffffff' : color), mat); flag.castShadow = true;
  g.add(flag); g.position.set(x, base, z); g.rotation.y = rotY;
  group.add(g);
  return {group: g, update(wall) { mat.userData.time.value = wall; }};
}

// Ground heights under the corners of a w x d footprint centred at (x, z) and turned by rotY.
function footprint(course, x, z, rotY, w, d) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => { const lx = sx * w / 2, lz = sz * d / 2; return groundY(course, x + lx * c + lz * s, z - lx * s + lz * c); });
}
// True if a w x d footprint is flat enough to stand something on (height range under `tol` metres).
export function flatEnough(course, x, z, w, d, rotY = 0, tol = 0.6) {
  const h = footprint(course, x, z, rotY, w, d);
  return Math.max(...h) - Math.min(...h) < tol;
}

// Pop-up canopy tent (event gazebo). opts: x, z, rotY, w (3), d (3), h (eave height 2.1), peak (0.7), color ('#c8362e'),
// stripes (second colour for alternating roof panels, or null), legs ('#d9d6cf'), text (valance lettering, front and back),
// textColor, walls ('back' adds a back wall). Returns the tent Group.
export function canopyTent(group, course, {x, z, rotY = 0, w = 3, d = 3, h = 2.1, peak = 0.7, color = '#c8362e', stripes = null, legs = '#d9d6cf', text = null, textColor = '#fdf6e3', walls = null} = {}) {
  const g = new THREE.Group(), base = Math.min(groundY(course, x, z), ...footprint(course, x, z, rotY, w, d));
  const frame = [], cloth = [], hw = w / 2, hd = d / 2, valH = 0.25;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    frame.push(tube(V(sx * hw * 0.98, -0.2, sz * hd * 0.98), V(sx * hw * 0.98, h + 0.02, sz * hd * 0.98), 0.025, legs, 6));
    frame.push(tube(V(sx * hw * 0.98, h - 0.02, sz * hd * 0.98), V(0, h + peak * 0.92, 0), 0.015, legs, 4)); // rafters
    frame.push(paint(new THREE.BoxGeometry(0.16, 0.02, 0.16).translate(sx * hw * 0.98, 0.01, sz * hd * 0.98), '#555a60'));
  }
  // Roof: 4 sloped triangles split into panels for optional stripes.
  const c1 = col(color), c2 = stripes ? col(stripes) : c1, apex = V(0, h + peak, 0), corners = [V(-hw, h, -hd), V(hw, h, -hd), V(hw, h, hd), V(-hw, h, hd)];
  for (let s = 0; s < 4; s++) {
    const A = corners[s], B = corners[(s + 1) % 4], panels = stripes ? 4 : 1;
    for (let k = 0; k < panels; k++) {
      const p0 = A.clone().lerp(B, k / panels), p1 = A.clone().lerp(B, (k + 1) / panels);
      const t = new THREE.BufferGeometry().setFromPoints([p0, apex, p1]); t.computeVertexNormals();
      cloth.push(paint(t, k % 2 ? c2 : c1));
    }
  }
  // Valance hanging from the eaves (plain colour unless it carries text).
  const valance = (len, px, pz, ry) => { const v = new THREE.PlaneGeometry(len, valH); v.rotateY(ry); v.translate(px, h - valH / 2, pz); return v; };
  const sides = [[w, 0, hd + 0.002, 0], [w, 0, -hd - 0.002, Math.PI], [d, hw + 0.002, 0, Math.PI / 2], [d, -hw - 0.002, 0, -Math.PI / 2]];
  sides.forEach(([len, px, pz, ry], i) => { if (!(text && i < 2)) cloth.push(paint(valance(len, px, pz, ry), stripes && i % 2 ? c2 : c1)); });
  if (walls === 'back') cloth.push(paint(new THREE.PlaneGeometry(w, h).translate(0, h / 2, -hd), c1.clone().multiplyScalar(0.9)));
  addMerged(g, frame, metalMat());
  addMerged(g, cloth, clothMat());
  if (text) {
    const tex = signTexture([text], {bg: '#' + c1.getHexString(THREE.SRGBColorSpace), fg: textColor, border: null, planks: false, w: 1024, h: 96, font: 'bold 64px'});
    const vm = new THREE.MeshStandardMaterial({map: tex, roughness: 0.9, side: THREE.DoubleSide});
    for (const [len, px, pz, ry] of sides.slice(0, 2)) { const m = new THREE.Mesh(valance(len, px, pz, ry), vm); m.castShadow = true; g.add(m); }
  }
  g.position.set(x, base, z); g.rotation.y = rotY;
  group.add(g);
  return g;
}

// Several tents from a list of canopyTent options (convenience).
export const canopyTents = (group, course, list) => list.map(o => canopyTent(group, course, o));

// Wooden picnic tables with attached benches, merged into one mesh. list: [{x, z, rotY?}]. Returns the mesh.
export function picnicTables(group, course, list) {
  const parts = [], tint = ['#f2e2c8', '#e6d2b4', '#fbeedb'];
  list.forEach(({x, z, rotY = 0}, i) => {
    const y = groundY(course, x, z), c = tint[i % 3], local = [];
    for (let k = -2; k <= 2; k++) local.push(boxUV(1.8, 0.04, 0.15, c).translate(0, 0.74, k * 0.16)); // top boards
    for (const s of [-1, 1]) {
      local.push(boxUV(1.8, 0.04, 0.24, c).translate(0, 0.44, s * 0.62)); // bench seats
      for (const e of [-0.7, 0.7]) {
        const leg = boxUV(0.06, 0.95, 0.09, c); leg.rotateX(s * 0.62); leg.translate(e, 0.37, s * 0.28); local.push(leg);
      }
    }
    for (const e of [-0.7, 0.7]) local.push(boxUV(0.06, 0.06, 1.5, c).translate(e, 0.4, 0)); // cross braces
    for (const g of local) parts.push(place(g, x, y, z, rotY));
  });
  return addMerged(group, parts, sharedWood(), {name: 'picnic-tables'});
}
export const picnicTable = (group, course, {x, z, rotY = 0} = {}) => picnicTables(group, course, [{x, z, rotY}]);

// Patio / beach umbrellas with alternating panels, merged. list: [{x, z, colors?: [a, b], r?: 1.2, h?: 2.2, tilt?}]. Returns the mesh.
export function umbrellas(group, course, list, {seed = 9} = {}) {
  const r = rng(seed), cloth = [], poles = [], pairs = [['#c8362e', '#efede6'], ['#2f6db3', '#efede6'], ['#e9c443', '#e8742a'], ['#2a8a86', '#efede6'], ['#3d5240', '#e4dccb']];
  for (const u of list) {
    const [ca, cb] = u.colors ?? pairs[(r() * pairs.length) | 0], R = u.r ?? 1.2, H = u.h ?? 2.2, y = groundY(course, u.x, u.z);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(u.tilt ?? (r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25));
    const local = [], top = V(0, H + 0.35, 0);
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
      const t = new THREE.BufferGeometry().setFromPoints([V(Math.cos(a0) * R, H, Math.sin(a0) * R), top, V(Math.cos(a1) * R, H, Math.sin(a1) * R)]);
      t.computeVertexNormals(); local.push(paint(t, k % 2 ? cb : ca));
    }
    const pole = [tube(V(0, -0.3, 0), V(0, H + 0.42, 0), 0.025, '#e8e6e0', 6), paint(new THREE.SphereGeometry(0.04, 6, 4).translate(0, H + 0.43, 0), '#e8e6e0')];
    const m = new THREE.Matrix4().compose(V(u.x, y, u.z), tilt, V(1, 1, 1));
    for (const g of local) cloth.push(g.applyMatrix4(m));
    for (const g of pole) poles.push(g.applyMatrix4(m));
  }
  addMerged(group, poles, metalMat());
  return addMerged(group, cloth, clothMat(), {name: 'umbrellas'});
}

// Folding camp chairs (empty), merged. list: [{x, z, rotY?, color?}]. Returns the mesh.
export function campChairs(group, course, list, {seed = 10} = {}) {
  const r = rng(seed), parts = [];
  const base = campChairGeometry(); // part attribute: 1 fabric, 2 armrests, 7 frame
  for (const c of list) {
    const fabric = col(c.color ?? PEOPLE_PALETTE.chairs[(r() * PEOPLE_PALETTE.chairs.length) | 0]), frame = col(r() < 0.5 ? '#2a2a2d' : '#9a9da2');
    const g = base.clone(), part = g.attributes.part.array, n = part.length, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const cc = part[i] === 7 ? frame : part[i] === 2 ? fabric.clone().multiplyScalar(0.6) : fabric; a.set([cc.r, cc.g, cc.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('part');
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    parts.push(place(g.index ? g.toNonIndexed() : g, c.x, groundY(course, c.x, c.z), c.z, c.rotY ?? r() * 6));
  }
  return addMerged(group, parts, clothMat({side: THREE.FrontSide, glow: 0.08}), {name: 'camp-chairs'});
}

// Picnic coolers (ice boxes), merged. list: [{x, z, rotY?, color?}]. Returns the mesh.
export function coolers(group, course, list, {seed = 11} = {}) {
  const r = rng(seed), parts = [], cols = ['#2f6db3', '#c8362e', '#efede6', '#3f9a4b', '#2a8a86'];
  for (const c of list) {
    const body = col(c.color ?? cols[(r() * cols.length) | 0]), y = groundY(course, c.x, c.z), rot = c.rotY ?? r() * 6;
    const local = [paint(new THREE.BoxGeometry(0.62, 0.34, 0.38).translate(0, 0.17, 0), body), paint(new THREE.BoxGeometry(0.64, 0.07, 0.4).translate(0, 0.37, 0), '#efede6'),
      paint(new THREE.BoxGeometry(0.3, 0.03, 0.04).translate(0, 0.42, 0), '#2a2a2d')];
    for (const g of local) parts.push(place(g, c.x, y, c.z, rot));
  }
  return addMerged(group, parts, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.5}), {name: 'coolers'});
}

// Sprinkle tents, picnic tables, umbrellas, chairs and coolers around a crowd zone without blocking the view:
// tents and tables go behind the zone (on the side away from the track), coolers and chairs at its back edge,
// umbrellas at the ends. zone: {x0, x1, z0, z1} (as for props.crowd). opts: tents (count, default by length),
// tables, umbrellas, coolers, chairs, colors (tent colours), text (tent valance text), low, seed, depth (m behind
// the zone, 3.2). Returns {group, update(wall)}.
export function crowdDressing(group, course, zone, {tents, tables, umbrellas: nUmb, coolers: nCool, chairs: nChair, colors = ['#c8362e', '#efede6', '#2f6db3', '#3d5240', '#e8742a'], text = null, low = false, seed = 17, depth = 3.2} = {}) {
  const r = rng(seed), g = new THREE.Group(), len = Math.abs(zone.x1 - zone.x0);
  const near = Math.abs(zone.z0) < Math.abs(zone.z1) ? zone.z0 : zone.z1, far = near === zone.z0 ? zone.z1 : zone.z0, out = Math.sign(far - near) || 1;
  const k = low ? 0.5 : 1, count = (v, d) => Math.max(0, Math.round((v ?? d) * k));
  const nT = count(tents, Math.max(1, Math.floor(len / 14))), nTab = count(tables, Math.floor(len / 16)), nU = count(nUmb, len > 20 ? 2 : 1);
  const nC = count(nCool, Math.ceil(len / 10)), nCh = count(nChair, Math.ceil(len / 9));
  const behind = (d) => far + out * d;
  const slots = Array.from({length: nT}, (_, i) => zone.x0 + (i + 0.5) * len / Math.max(1, nT) + (r() - 0.5) * 2);
  let first = true;
  slots.forEach((x, i) => {
    const big = r() < 0.4, w = big ? 4 : 3, d = 3, tz = behind(depth + d / 2), ry = out > 0 ? 0 : Math.PI;
    const stripes = r() < 0.35 ? '#efede6' : null, walls = r() < 0.4 ? 'back' : null;
    if (!flatEnough(course, x, tz, w, d, ry)) return;
    canopyTent(g, course, {x, z: tz, rotY: ry, w, d, color: colors[i % colors.length], stripes, text: first ? text : null, walls});
    first = false;
  });
  const tableList = Array.from({length: nTab}, () => ({x: zone.x0 + r() * len, z: behind(depth + 1.5 + r() * 1.5), rotY: (r() - 0.5) * 0.6}))
    .filter(t => flatEnough(course, t.x, t.z, 2, 2, t.rotY, 0.45));
  if (tableList.length) picnicTables(g, course, tableList);
  const umb = Array.from({length: nU}, (_, i) => ({x: i % 2 ? zone.x1 + 1.5 + r() : zone.x0 - 1.5 - r(), z: (near + far) / 2 + (r() - 0.5) * Math.abs(far - near) * 0.6}));
  if (umb.length) umbrellas(g, course, umb, {seed: seed + 1});
  const cool = Array.from({length: nC}, () => ({x: zone.x0 + r() * len, z: far + out * (0.3 + r() * 0.8)}));
  if (cool.length) coolers(g, course, cool, {seed: seed + 2});
  const chairs = Array.from({length: nCh}, () => ({x: zone.x0 + r() * len, z: far + out * (0.6 + r() * 1.4), rotY: (out > 0 ? Math.PI : 0) + (r() - 0.5) * 1.2}));
  if (chairs.length) campChairs(g, course, chairs, {seed: seed + 3});
  group.add(g);
  return {group: g, update() {}};
}
