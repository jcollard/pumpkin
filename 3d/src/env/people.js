// Spectators for every track.
// The people are CC0 low-poly characters by Quaternius (see assets/shared/LICENSES.md), baked offline into
// static poses (idle, standing, clapping open/closed, arms up, seated) with three levels of detail and packed
// into assets/shared/people/crowd.{json,bin}. The whole crowd, their hats and camp chairs are ONE BatchedMesh:
// each frame a person can switch pose (clap, cheer, jump) and detail level just by swapping the geometry of
// its instance. Clothes, skin and hair colours come from a small per-instance palette texture, so 300 people
// cost one draw call (plus one for shadows).
import * as THREE from 'three';
import {rng} from '../noise.js';

const BASE = new URL('../../assets/shared/people/', import.meta.url);
// Colour slots used by the baked meshes (crowd.json lists the same names).
const SKIN = 0, TOP = 1, TOP_LIGHT = 2, INNER = 3, BOTTOM = 4, HAIR = 5, HAIR_DARK = 6, SHOES = 7, SOCKS = 8, EYES = 9, ACCENT = 10, SLOTS = 11;

const hex = list => list.map(h => new THREE.Color(h));
export const PEOPLE_PALETTE = {
  skin: hex(['#f3cfb0', '#eab894', '#d9a07a', '#c68863', '#a8714c', '#8a5a3c', '#6b4129', '#4e2f1f']),
  // Casual coastal autumn crowd: mostly muted layers, some bright team colours and pumpkin orange.
  topsMuted: hex(['#2f4058', '#3d5240', '#8f4a2c', '#b8923e', '#e4dccb', '#8d8f92', '#3a3c40', '#4c6a8c', '#6e2a33', '#6b6a3a', '#7fa6c9', '#efede6', '#1f1f22', '#5b4a3a', '#a4806a']),
  topsBright: hex(['#e8742a', '#c8362e', '#e9c443', '#2a8a86', '#d77a9a', '#6f4f99', '#3f9a4b', '#2f6db3', '#f0a03c']),
  bottoms: hex(['#3c5675', '#26364c', '#1f1f22', '#a89272', '#5e6166', '#56573a', '#5a4532', '#7e95ad', '#2e3440', '#c9bda4']),
  hair: hex(['#17120f', '#2a1d14', '#3b2a1e', '#5e4330', '#7a3d22', '#a3804f', '#c8ab72', '#8e8a86', '#d4d0ca']),
  shoes: hex(['#e8e6e0', '#1c1c1e', '#4a3324', '#7b7d80', '#e8e6e0', '#2a3a55', '#8a6a48']),
  inner: hex(['#efede6', '#d9d6cf', '#2a2a2d', '#8d8f92']),
  chairs: hex(['#2b4a6f', '#3d5a3a', '#8c2f2a', '#2f6db3', '#4a4f57', '#c26a2a', '#6b3b6e']),
  hats: hex(['#1f2b44', '#c8362e', '#efede6', '#3d5240', '#e8742a', '#2f6db3', '#b8923e', '#1f1f22']),
  straw: hex(['#d8c08a', '#c9ad73', '#e2d3a8', '#b99c64']),
};

let dataPromise = null;
// Load (once) the baked crowd: resolves to {header, types: [{name, sex, seat, seatZ, anchors, geos[pose][lod]}]}.
export function loadPeople() {
  dataPromise ??= Promise.all([
    fetch(new URL('crowd.json', BASE)).then(r => r.ok ? r.json() : Promise.reject(Error('crowd.json ' + r.status))),
    fetch(new URL('crowd.bin', BASE)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(Error('crowd.bin ' + r.status))),
  ]).then(([header, bin]) => ({header, types: buildTypes(header, bin)}));
  return dataPromise;
}

function buildTypes(h, bin) {
  return h.types.map(t => {
    const slots = new Uint8Array(bin, t.offsets.slots, t.n);
    const lods = t.offsets.lods.map(l => { // compact each LOD to the vertices it uses
      const idx = new Uint16Array(bin, l.at, l.count), remap = new Int32Array(t.n).fill(-1), used = [];
      for (const i of idx) if (remap[i] < 0) { remap[i] = used.length; used.push(i); }
      return {used, index: Uint16Array.from(idx, i => remap[i])};
    });
    const geos = {};
    for (const pose of h.poses) {
      const q = new Int16Array(bin, t.offsets[pose].pos, t.n * 3), qn = new Int8Array(bin, t.offsets[pose].nrm, t.n * 3);
      geos[pose] = lods.map(({used, index}) => {
        const m = used.length, pos = new Float32Array(m * 3), nrm = new Float32Array(m * 3), part = new Float32Array(m);
        used.forEach((i, k) => {
          for (let j = 0; j < 3; j++) { pos[k * 3 + j] = q[i * 3 + j] * h.posScale; nrm[k * 3 + j] = qn[i * 3 + j] / 127; }
          part[k] = slots[i];
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        g.setAttribute('part', new THREE.BufferAttribute(part, 1));
        g.setIndex(new THREE.BufferAttribute(index, 1));
        return g;
      });
    }
    return {...t, geos};
  });
}

// --- Accessories (in units of the person's height, head at the origin of the hat) ---
const withPart = (g, slot) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(slot), 1));
  return g;
};
function mergeParts(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); part.set(g.attributes.part.array, o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('part', new THREE.BufferAttribute(part, 1));
  g.setIndex(new THREE.BufferAttribute(Uint16Array.from({length: n}, (_, i) => i), 1));
  return g;
}
const R = 0.064; // head radius relative to body height
function capGeometry() {
  const crown = new THREE.SphereGeometry(R * 1.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(1, 0.78, 1.08);
  const bill = new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.008, 12, 1, false, -Math.PI / 2, Math.PI);
  bill.scale(1, 1, 0.9); bill.rotateX(0.12); bill.translate(0, 0.004, R * 0.62);
  return mergeParts([withPart(crown, TOP), withPart(bill, ACCENT)]);
}
function sunHatGeometry() {
  const crown = new THREE.CylinderGeometry(R * 0.82, R * 1.02, R * 0.95, 14, 1, false); crown.translate(0, R * 0.47, 0);
  const top = new THREE.SphereGeometry(R * 0.82, 14, 3, 0, Math.PI * 2, 0, Math.PI / 2); top.scale(1, 0.35, 1); top.translate(0, R * 0.94, 0);
  const brim = new THREE.CylinderGeometry(R * 2.1, R * 2.2, 0.006, 20, 1, false); brim.translate(0, 0.003, 0);
  const band = new THREE.CylinderGeometry(R * 1.0, R * 1.04, R * 0.28, 14, 1, true); band.translate(0, R * 0.16, 0);
  return mergeParts([withPart(crown, TOP), withPart(top, TOP), withPart(brim, TOP), withPart(band, ACCENT)]);
}
function beanieGeometry() {
  const dome = new THREE.SphereGeometry(R * 1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); dome.scale(1, 0.95, 1.05);
  const cuff = new THREE.CylinderGeometry(R * 1.13, R * 1.13, R * 0.4, 12, 1, true); cuff.scale(1, 1, 1.05); cuff.translate(0, -R * 0.05, 0);
  return mergeParts([withPart(dome, TOP), withPart(cuff, TOP_LIGHT)]);
}
// Folding camp chair in metres, seat top at 0.42 m, facing +Z. Attribute `part`: 1 fabric, 2 armrests, 7 frame.
export function campChairGeometry() {
  const parts = [], leg = (x0, z0, x1, z1, y0, y1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(0.012, 0.012, d.length(), 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(withPart(g, SHOES));
  };
  for (const s of [-1, 1]) { // X-frame legs and armrest posts
    leg(s * 0.25, -0.22, s * 0.25, 0.2, 0.0, 0.42); leg(s * 0.25, 0.2, s * 0.25, -0.22, 0.0, 0.42);
    leg(s * 0.26, 0.2, s * 0.26, 0.2, 0.0, 0.62); leg(s * 0.26, -0.22, s * 0.26, -0.26, 0.0, 0.95);
  }
  const seat = new THREE.BoxGeometry(0.5, 0.03, 0.44, 2, 1, 2); seat.translate(0, 0.405, -0.01);
  const sp = seat.attributes.position; for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) - 0.03 * (1 - (sp.getX(i) / 0.25) ** 2)); // sag
  seat.computeVertexNormals();
  const back = new THREE.BoxGeometry(0.5, 0.48, 0.03); back.rotateX(-0.2); back.translate(0, 0.7, -0.25);
  const arms = [-1, 1].map(s => { const a = new THREE.BoxGeometry(0.07, 0.025, 0.42); a.translate(s * 0.27, 0.62, -0.02); return withPart(a, TOP_LIGHT); });
  return mergeParts([...parts, withPart(seat, TOP), withPart(back, TOP), ...arms]);
}

// Material that colours each vertex from the instance's palette row (part slot x instance id).
function crowdMaterial(colorTex) {
  const mat = new THREE.MeshStandardMaterial({roughness: 0.84, metalness: 0});
  mat.peopleColors = colorTex; // so scene disposal finds and frees it
  mat.onBeforeCompile = sh => {
    sh.uniforms.peopleColors = {value: colorTex};
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nuniform highp sampler2D peopleColors;')
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_BATCHING
  vColor = vec4(texelFetch(peopleColors, ivec2(int(part + 0.5), int(getIndirectIndex(gl_DrawID))), 0).rgb, 1.0);
#endif`);
  };
  mat.customProgramCacheKey = () => 'pumpkin-crowd-v1';
  return mat;
}

const groundAt = (course, x, z) => Math.max(course.terrainH(x, z), Math.abs(z) <= course.roadHalf + 0.5 ? course.roadY(x) : -Infinity);

// Choose people for the zones (deterministic). Each person: position, height, facing, clothes, behaviour.
function planPeople(course, zones, {low, seed, types}) {
  const r = rng(seed), P = PEOPLE_PALETTE, pick = a => a[(r() * a.length) | 0];
  const people = [];
  zones.forEach((zone, zi) => {
    const n = Math.round(low ? zone.n / 2 : zone.n), area = Math.abs((zone.x1 - zone.x0) * (zone.z1 - zone.z0));
    const minD = Math.min(0.55, 0.8 * Math.sqrt(area / Math.max(1, n))), pts = [];
    const near = Math.abs(zone.z0) < Math.abs(zone.z1) ? zone.z0 : zone.z1, far = near === zone.z0 ? zone.z1 : zone.z0;
    const lo = Math.min(zone.z0, zone.z1), hi = Math.max(zone.z0, zone.z1);
    // Groups of friends and families, packed towards the side nearest the track.
    for (let tries = 0; pts.length < n && tries < n * 30; tries++) {
      const gx = zone.x0 + r() * (zone.x1 - zone.x0), gz = near + (far - near) * r() ** (zone.pack ?? 1.8);
      const size = 1 + Math.floor(r() ** 1.4 * 4.6);
      for (let k = 0; k < size && pts.length < n; k++) {
        const x = Math.min(zone.x1, Math.max(zone.x0, gx + (k ? (r() - 0.5) * 1.5 : 0)));
        const z = Math.min(hi, Math.max(lo, gz + (k ? (r() - 0.5) * 1.1 : 0)));
        if (pts.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) && tries < n * 24) continue;
        pts.push({x, z, gx, gz});
      }
    }
    // Front row (closest to the track centre line) gets the kids and the camp chairs.
    pts.sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
    const sitShare = zone.sit ?? 0.1, kidShare = zone.kids ?? 0.12;
    pts.forEach((p, k) => {
      const front = k / Math.max(1, pts.length - 1);
      const seated = zone.bench ? r() < (zone.sit ?? 0.5) : front < 0.45 && r() < sitShare * 2.2;
      const kid = !seated && front < 0.5 && r() < kidShare * 2;
      const type = (r() * types.length) | 0, sex = types[type].sex;
      const H = kid ? 1.05 + r() * 0.35 : sex === 'm' ? 1.7 + r() * 0.18 : 1.58 + r() * 0.16;
      const tx = p.x + (r() - 0.5) * 8 - (zone.look ?? 4) * r(), tz = 0;
      let yaw = Math.atan2(tx - p.x, tz - p.z) + (r() - 0.5) * 0.3;
      if (r() < 0.18 && Math.hypot(p.x - p.gx, p.z - p.gz) > 0.3) yaw = Math.atan2(p.gx - p.x, p.gz - p.z); // chatting to their group
      const bright = r() < 0.32, top = bright ? pick(P.topsBright) : pick(P.topsMuted);
      const colors = new Array(SLOTS);
      colors[SKIN] = pick(P.skin); colors[TOP] = top;
      colors[TOP_LIGHT] = top.clone().lerp(new THREE.Color(1, 1, 1), 0.25);
      colors[INNER] = pick(P.inner); colors[BOTTOM] = sex === 'f' && types[type].name === 'woman_dress' ? top : pick(P.bottoms);
      colors[HAIR] = r() < 0.1 && !kid ? P.hair[7 + ((r() * 2) | 0)] : P.hair[(r() * 7) | 0]; colors[HAIR_DARK] = colors[HAIR].clone().multiplyScalar(0.55);
      colors[SHOES] = pick(P.shoes); colors[SOCKS] = r() < 0.6 ? new THREE.Color('#e8e6e0') : new THREE.Color('#2a2a2d');
      colors[EYES] = new THREE.Color('#15100c'); colors[ACCENT] = pick(P.topsBright);
      const hatRoll = r(), hat = hatRoll < 0.16 ? 'cap' : hatRoll < 0.24 ? 'sun' : hatRoll < 0.29 ? 'beanie' : null;
      const styleRoll = r();
      people.push({
        zone: zi, x: p.x, z: p.z, ground: groundAt(course, p.x, p.z), type, H, yaw, kid, seated, bench: !!zone.bench, colors, hat,
        hatColor: hat === 'sun' ? pick(P.straw) : pick(P.hats), hatAccent: hat === 'sun' ? pick([...P.hats, ...P.topsBright]) : pick(P.inner),
        chairColor: pick(P.chairs), chairFrame: r() < 0.5 ? new THREE.Color('#2a2a2d') : new THREE.Color('#9a9da2'),
        rest: r() < 0.55 ? 'idle' : r() < 0.75 ? 'stand' : 'clapA',
        style: kid ? (styleRoll < 0.6 ? 'jump' : 'wave') : styleRoll < 0.5 ? 'clap' : styleRoll < 0.78 ? 'wave' : 'jump',
        phase: r() * 6.283, eager: 0.6 + r() * 0.8, thr: 0.25 + r() * 0.45, freq: 0.85 + r() * 0.35, sway: r() * 6.283,
      });
    });
  });
  return people;
}

// Build the crowd once the baked people are loaded. Returns {mesh, update(wall, excitement)}.
function buildCrowd(group, course, zones, data, {low, seed, lodScale = 1, forceLod}) {
  const {types, header} = data, poses = header.poses;
  const people = planPeople(course, zones, {low, seed, types});
  const hats = {cap: capGeometry(), sun: sunHatGeometry(), beanie: beanieGeometry()}, chair = campChairGeometry();
  const nHats = people.filter(p => p.hat).length, nChairs = people.filter(p => p.seated && !p.bench).length;
  for (const p of people) if (p.seated && p.bench) { // sit on the surface itself (bleachers, walls): seat at ground level
    const t = types[p.type], q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), off = new THREE.Vector3(0, 0, -t.seatZ * p.H).applyQuaternion(q0);
    p.ground -= t.seat * p.H; p.x += off.x; p.z += off.z;
  }
  const instCount = Math.max(1, people.length + nHats + nChairs);
  // Only add the type/pose geometries people actually use.
  const usedTypes = [...new Set(people.map(p => p.type))];
  const geoList = [];
  for (const ti of usedTypes) for (const pose of poses) for (const g of types[ti].geos[pose]) geoList.push(g);
  geoList.push(...Object.values(hats), chair);
  const vCount = geoList.reduce((n, g) => n + g.attributes.position.count, 0), iCount = geoList.reduce((n, g) => n + g.index.count, 0);

  const colorTex = new THREE.DataTexture(new Float32Array(SLOTS * instCount * 4), SLOTS, instCount, THREE.RGBAFormat, THREE.FloatType);
  const mesh = new THREE.BatchedMesh(instCount, vCount, iCount, crowdMaterial(colorTex));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false; // people hop; per-person culling still applies
  mesh.name = 'crowd';
  const gid = {}; // gid[type][pose][lod]
  for (const ti of usedTypes) { gid[ti] = {}; for (const pose of poses) gid[ti][pose] = types[ti].geos[pose].map(g => mesh.addGeometry(g)); }
  const hatGid = Object.fromEntries(Object.entries(hats).map(([k, g]) => [k, mesh.addGeometry(g)]));
  const chairGid = mesh.addGeometry(chair);

  const rows = colorTex.image.data, white = new THREE.Color(1, 1, 1);
  const setRow = (id, colors) => { for (let s = 0; s < SLOTS; s++) { const c = colors[s] || white; rows.set([c.r, c.g, c.b, 1], (id * SLOTS + s) * 4); } };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const p of people) {
    p.pose = p.seated ? 'sit' : p.rest;
    p.gid = gid[p.type][p.pose].at(-1);
    p.id = mesh.addInstance(p.gid); setRow(p.id, p.colors); mesh.setColorAt(p.id, white);
    if (p.hat) {
      p.hatId = mesh.addInstance(hatGid[p.hat]); mesh.setColorAt(p.hatId, white);
      const c = []; c[TOP] = p.hatColor; c[ACCENT] = p.hatAccent; c[TOP_LIGHT] = p.hatColor.clone().lerp(white, 0.3); setRow(p.hatId, c);
    }
    if (p.seated && !p.bench) {
      const t = types[p.type], id = mesh.addInstance(chairGid); mesh.setColorAt(id, white);
      const c = []; c[TOP] = p.chairColor; c[TOP_LIGHT] = p.chairColor.clone().multiplyScalar(0.6); c[SHOES] = p.chairFrame; setRow(id, c);
      const seatH = t.seat * p.H - 0.01; // chair seat top meets the seated pose
      q.setFromAxisAngle(up, p.yaw);
      v.set(0, 0, t.seatZ * p.H + 0.03).applyQuaternion(q).add(new THREE.Vector3(p.x, p.ground, p.z));
      mesh.setMatrixAt(id, m.compose(v, q, sc.set(1, seatH / 0.42, 1)));
    }
  }
  colorTex.needsUpdate = true;
  group.add(mesh);
  // Free the batch's own textures with the scene.
  let disposed = false;
  mesh.geometry.addEventListener('dispose', () => { if (!disposed) { disposed = true; mesh.dispose(); } });

  // Camera for level-of-detail choice: the camera that drew the crowd into the largest viewport since the last
  // update (picture-in-picture insets and reflections use smaller ones), unless update() is given a camera.
  const cam = {pos: new THREE.Vector3(0, 1e5, 0), tanHalf: 0.36, seen: false}, best = {pos: new THREE.Vector3(), tanHalf: 0.36, area: -1};
  const vp = new THREE.Vector4(), baseBefore = mesh.onBeforeRender.bind(mesh);
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material, grp) => {
    renderer.getCurrentViewport(vp);
    const area = vp.z * vp.w;
    if (camera.isPerspectiveCamera && area >= best.area) { best.area = area; best.pos.setFromMatrixPosition(camera.matrixWorld); best.tanHalf = Math.tan(camera.fov * Math.PI / 360); }
    baseBefore(renderer, scene, camera, geometry, material, grp);
  };
  // Detail thresholds on distance * tan(fov/2) for a 1.75 m person (about 11 m, 36 m and 100 m at a 40° lens).
  const k = (low ? 0.6 : 1) * lodScale, L0 = 4 * k, L1 = 13 * k, L2 = 36 * k, nLods = types[0].geos[poses[0]].length;
  const hm = new THREE.Matrix4(), ho = new THREE.Vector3(), tiltBack = new THREE.Matrix4().makeRotationX(-0.12);

  function update(wall, excitement = () => 0.2, camera = null) {
    if (disposed) return; // the scene was disposed (track switch)
    if (camera?.isPerspectiveCamera) { cam.pos.setFromMatrixPosition(camera.matrixWorld); cam.tanHalf = Math.tan(camera.fov * Math.PI / 360); cam.seen = true; }
    else if (best.area >= 0) { cam.pos.copy(best.pos); cam.tanHalf = best.tanHalf; cam.seen = true; }
    best.area = -1;
    for (const p of people) {
      const e = Math.min(1.4, (excitement(p.zone) ?? 0.2) * p.eager);
      let pose = p.seated ? 'sit' : p.rest, hop = 0;
      const t = wall * p.freq + p.phase;
      if (!p.seated && e > p.thr) {
        if (p.style === 'clap') pose = Math.sin(t * 2 * Math.PI * 1.6) > 0 ? 'clapA' : 'clapB';
        else if (p.style === 'jump') { const s = Math.sin(t * 2 * Math.PI * 1.1); hop = Math.max(0, s) * (p.kid ? 0.16 : 0.12) * Math.min(1, e); pose = s > -0.2 ? 'up' : 'clapA'; }
        else pose = Math.sin(t * 2 * Math.PI * 0.55) > -0.35 ? 'up' : 'clapB';
      } else if (!p.seated && e > p.thr * 0.7 && p.style === 'clap') pose = 'clapA';
      // Level of detail from projected size.
      let lod = nLods - 1;
      if (forceLod !== undefined) lod = Math.min(nLods - 1, forceLod);
      else if (cam.seen) {
        const d = Math.hypot(cam.pos.x - p.x, cam.pos.y - p.ground - 1, cam.pos.z - p.z) * cam.tanHalf * 1.75 / p.H;
        lod = Math.min(nLods - 1, d < L0 ? 0 : d < L1 ? 1 : d < L2 ? 2 : 3);
      }
      if (p.hat && (lod >= 3) !== p.hatHidden) { p.hatHidden = lod >= 3; mesh.setVisibleAt(p.hatId, !p.hatHidden); }
      const g = gid[p.type][pose][lod];
      if (g !== p.gid) { mesh.setGeometryIdAt(p.id, g); p.gid = g; }
      p.pose = pose;
      const yaw = p.yaw + Math.sin(wall * 0.45 + p.sway) * (p.seated ? 0.015 : 0.07) + (pose === 'up' ? Math.sin(t * 3.1) * 0.12 : 0);
      q.setFromAxisAngle(up, yaw);
      v.set(p.x, p.ground + hop, p.z);
      m.compose(v, q, sc.setScalar(p.H));
      mesh.setMatrixAt(p.id, m);
      if (p.hat) {
        const a = types[p.type].anchors[pose];
        ho.set(a.head[0], a.headTop - R * (p.hat === 'cap' ? 0.62 : p.hat === 'sun' ? 0.42 : 0.72), a.head[2]);
        hm.makeTranslation(ho.x, ho.y, ho.z);
        if (pose === 'sit') hm.multiply(tiltBack);
        mesh.setMatrixAt(p.hatId, hm.premultiply(m));
      }
    }
  }
  update(0, () => 0.2);
  return {mesh, update, people};
}

// Fallback if the baked people cannot be loaded: simple instanced figures.
function fallbackCrowd(group, course, zones, {low, seed}) {
  const r = rng(seed), P = PEOPLE_PALETTE, people = [];
  zones.forEach((zone, zi) => {
    for (let i = 0; i < (low ? zone.n / 2 : zone.n); i++) {
      const x = zone.x0 + r() * (zone.x1 - zone.x0), z = zone.z0 + r() * (zone.z1 - zone.z0);
      people.push({x, z, ground: groundAt(course, x, z), s: 0.85 + r() * 0.3, phase: r() * 6.28, zone: zi, eager: 0.6 + r() * 0.8,
        shirt: [...P.topsMuted, ...P.topsBright][(r() * 24) | 0], skin: P.skin[(r() * P.skin.length) | 0]});
    }
  });
  const ident = people.map(() => new THREE.Matrix4());
  const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.42, 3, 8); bodyGeo.translate(0, 1.08, 0);
  const legGeo = new THREE.CapsuleGeometry(0.15, 0.55, 3, 6); legGeo.scale(1, 1, 0.8); legGeo.translate(0, 0.45, 0);
  const headGeo = new THREE.SphereGeometry(0.12, 10, 8); headGeo.translate(0, 1.52, 0);
  const inst = (geo, mat, colors) => { const im = new THREE.InstancedMesh(geo, mat, people.length); ident.forEach((t, i) => im.setMatrixAt(i, t)); colors?.forEach((c, i) => im.setColorAt(i, c)); im.castShadow = im.receiveShadow = true; return im; };
  const bodies = inst(bodyGeo, new THREE.MeshStandardMaterial({roughness: 0.85}), people.map(p => p.shirt));
  const heads = inst(headGeo, new THREE.MeshStandardMaterial({roughness: 0.7}), people.map(p => p.skin));
  const legs = inst(legGeo, new THREE.MeshStandardMaterial({color: 0x2e3440, roughness: 0.9}));
  group.add(bodies, heads, legs);
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {update(wall, excitement = () => 0.2) {
    people.forEach((p, i) => {
      const hop = excitement(p.zone) * p.eager * Math.max(0, Math.sin(wall * (7 + p.eager * 3) + p.phase)) * 0.28;
      v.set(p.x, p.ground + hop, p.z); sc.setScalar(p.s); m.compose(v, q, sc);
      bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m); legs.setMatrixAt(i, m);
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = legs.instanceMatrix.needsUpdate = true;
  }};
}

// Spectators. zones: [{x0, x1, z0, z1, n, sit?, kids?, look?, pack?, bench?}] (sit/kids: share of seated people in camp
// chairs and of children, mostly in the front row; look: how far up the course people tend to look, metres; pack: how
// strongly people crowd towards the side of the zone nearest the track, 1 = evenly; bench: seated people sit on the zone
// surface itself, e.g. a bleacher tier or a wall, legs hanging over its front edge, share `sit` (default 0.5)).
// Returns {zones, update(wall, excitement(zoneIndex) -> 0..1, camera?), ready: Promise, people()}. Pass the main camera
// to update() if you can (env.update gets it as ctx.camera); otherwise detail levels follow the largest view drawn.
// lodScale > 1 keeps full detail further away; forceLod (0-3) is for testing.
export function spectators(group, course, zones, {low = false, seed = 2024, lodScale = 1, forceLod} = {}) {
  let impl = null;
  const ready = loadPeople()
    .then(data => { impl = buildCrowd(group, course, zones, data, {low, seed, lodScale, forceLod}); })
    .catch(e => { console.warn('[people] using simple figures:', e.message); impl = fallbackCrowd(group, course, zones, {low, seed}); });
  return {
    zones, ready,
    update(wall, excitement, camera) { impl?.update(wall, excitement, camera); },
    people: () => impl?.people ?? [],
  };
}
