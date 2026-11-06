// Rodeo-town dressing for the Salinas course: numbered bucking-chute start gates,
// the start arch, catwalk and announcer's booth, white arena rails, the finish
// photo-finish camera mast, a small covered grandstand, pennant bunting and waving flags.
import * as THREE from 'three';
import * as T from '../../textures.js';
import {rng} from '../../noise.js';
import {box, rod, merge, mesh, samples} from '../../env/geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, {repeat = true} = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Weathered painted boards (horizontal planks) in any colour.
export function paintTexture(base = '#ebe5d8', seed = 3, {plank = 64, chips = 160} = {}) {
  const [c, g] = canvas(256, 256), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += plank) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '60,40,25'},${0.04 + r() * 0.06})`; g.fillRect(0, y, 256, plank);
    g.fillStyle = 'rgba(40,28,18,.45)'; g.fillRect(0, y, 256, 2);
    for (let k = 0; k < 10; k++) {
      g.strokeStyle = `rgba(70,55,40,${0.05 + r() * 0.08})`; g.lineWidth = 1;
      const yy = y + r() * plank; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(90, yy + 2, 170, yy - 2, 256, yy + r() * 2); g.stroke();
    }
  }
  for (let i = 0; i < chips; i++) { g.fillStyle = `rgba(110,80,50,${0.3 + r() * 0.5})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 2); }
  const grime = g.createLinearGradient(0, 0, 0, 256); grime.addColorStop(0, 'rgba(0,0,0,0)'); grime.addColorStop(1, 'rgba(70,50,30,.12)');
  g.fillStyle = grime; g.fillRect(0, 0, 256, 256);
  return tex(c);
}

// Corrugated roofing, a little rusty.
export function tinTexture(seed = 5) {
  const [c, g] = canvas(256, 256), r = rng(seed);
  for (let x = 0; x < 256; x++) { const s = 0.5 + 0.5 * Math.sin(x / 256 * Math.PI * 2 * 16); const l = 120 + 70 * s; g.fillStyle = `rgb(${l},${l + 4},${l + 6})`; g.fillRect(x, 0, 1, 256); }
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, w = 3 + r() * 10, grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(140,70,30,0)'); grd.addColorStop(0.3 + r() * 0.5, `rgba(140,70,30,${0.15 + r() * 0.25})`); grd.addColorStop(1, 'rgba(140,70,30,0)');
    g.fillStyle = grd; g.fillRect(x, 0, w, 256);
  }
  return tex(c);
}

export function rodeoMaterials() {
  return {
    white: new THREE.MeshStandardMaterial({map: paintTexture('#ece6d8', 3), roughness: 0.8}),
    red: new THREE.MeshStandardMaterial({map: paintTexture('#a3352a', 7), roughness: 0.82}),
    blue: new THREE.MeshStandardMaterial({map: paintTexture('#2f5a86', 9), roughness: 0.82}),
    tin: new THREE.MeshStandardMaterial({map: tinTexture(), roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide}),
    dark: new THREE.MeshStandardMaterial({color: 0x2a2622, roughness: 0.7}),
    steel: new THREE.MeshStandardMaterial({color: 0x8d9296, roughness: 0.45, metalness: 0.7}),
  };
}

// White three-rail arena fence along x at side z. ranges: [[a, b], ...]
export function arenaRails(parts, course, ranges, z, {step = 2.4, ground} = {}) {
  const gy = ground ?? (x => Math.max(course.roadY(x), course.terrainH(x, z)));
  const inward = -Math.sign(z) * 0.09;
  for (const [a, b] of ranges) {
    const xs = samples(a, b, step);
    xs.forEach((x, i) => {
      const y = gy(x);
      parts.push(box(x, y + 0.45, z, 0.14, 1.65, 0.14));
      if (!i) return;
      const x0 = xs[i - 1], y0 = gy(x0), len = Math.hypot(x - x0, y - y0), ang = Math.atan2(y - y0, x - x0);
      for (const h of [0.32, 0.72, 1.12]) parts.push(box((x + x0) / 2, (y + y0) / 2 + h, z + inward, len + 0.1, 0.15, 0.045, ang));
    });
  }
}

// --- Number plate for a chute gate ---
function numberTexture(n, bg, fg) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = fg; g.stroke();
  g.fillStyle = fg; g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  return tex(c, {repeat: false});
}

// Bucking chutes, one per lane, with gates that swing open at GO.
// Built per race (the number of lanes changes). Returns {group, update(t), dispose()}.
export function chutes(course, lanes, rm, mats) {
  const group = new THREE.Group(), half = course.roadHalf;
  const ls = [...lanes].sort((a, b) => a - b), n = ls.length;
  const gap = n > 1 ? ls[1] - ls[0] : 1.15;
  const edges = n ? [ls[0] - gap / 2, ...ls.slice(1).map((l, i) => (ls[i] + l) / 2), ls[n - 1] + gap / 2] : [-0.6, 0.6];
  const XG = 0.47, XB = -2.5, y = x => course.roadY(x);
  const walls = [], posts = [];
  const plank = (x0, x1, z, h0, h, t = 0.05) => {
    const y0 = y(x0) + h0, y1 = y(x1) + h0, len = Math.hypot(x1 - x0, y1 - y0);
    walls.push(box((x0 + x1) / 2, (y0 + y1) / 2 + h / 2, z, len, h, t, Math.atan2(y1 - y0, x1 - x0)));
  };
  // Dividers between chutes, solid walls on the outer sides.
  edges.forEach((z, i) => {
    const outer = i === 0 || i === edges.length - 1;
    for (const h of outer ? [0.04, 0.3, 0.56, 0.82] : [0.12, 0.47, 0.82]) plank(XB, XG - 0.06, z, h, outer ? 0.25 : 0.17, outer ? 0.07 : 0.05);
    plank(XB, XG - 0.06, z, 1.1, 0.06, 0.16);                               // cap rail
    for (const x of [XB, (XB + XG) / 2, XG - 0.05]) posts.push(box(x, y(x) + 0.55, z, 0.11, 1.35, 0.11));
  });
  // Wing walls from the chute block out to the track edges, and the back gates.
  for (const s of [-1, 1]) {
    const zIn = s < 0 ? edges[0] : edges[edges.length - 1], zOut = s * (half + 0.5);
    if (Math.abs(zOut) - Math.abs(zIn) > 0.1) {
      for (const h of [0.04, 0.32, 0.6, 0.88]) walls.push(box(XG - 0.02, y(XG) + h + 0.13, (zIn + zOut) / 2, 0.07, 0.26, Math.abs(zOut - zIn)));
      posts.push(box(XG - 0.02, y(XG) + 0.62, zOut, 0.16, 1.5, 0.16));
    }
  }
  for (const h of [0.15, 0.55]) walls.push(box(XB - 0.04, y(XB) + h + 0.1, (edges[0] + edges.at(-1)) / 2, 0.06, 0.2, edges.at(-1) - edges[0]));
  group.add(mesh(merge(walls), mats.timber), mesh(merge(posts), rm.red));

  // Gates: hinged on their -z post, swing toward +x (downhill).
  const gates = [], paint = [rm.white, rm.red];
  ls.forEach((lane, i) => {
    const z0 = edges[i] + 0.035, w = edges[i + 1] - edges[i] - 0.07;
    const g = new THREE.Group(), m = paint[i % 2], parts = [];
    for (const h of [0.14, 0.5, 0.86]) parts.push(box(0, h, w / 2, 0.045, 0.13, w));
    parts.push(box(0, 0.5, 0.03, 0.06, 0.95, 0.06), box(0, 0.5, w - 0.03, 0.06, 0.95, 0.06));
    const brace = rod(V(0, 0.16, 0.06), V(0, 0.84, w - 0.06), 0.022, 5);
    g.add(mesh(merge([...parts, brace]), m));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({map: numberTexture(i + 1, i % 2 ? '#f1ead8' : '#a3352a', i % 2 ? '#2a1c12' : '#f6efe0'), roughness: 0.7}));
    plate.rotation.y = Math.PI / 2; plate.position.set(0.03, 0.5, w / 2);
    g.add(plate);
    g.position.set(XG, y(XG) + 0.04, z0);
    group.add(g);
    gates.push({g, delay: (i % 3) * 0.025});
  });
  return {
    group,
    update(t) {
      for (const {g, delay} of gates) {
        const s = Math.max(0, (t + 0.06 - delay) / 0.3);
        g.rotation.y = s <= 0 ? 0 : Math.PI / 2 * 0.97 * (1 - Math.exp(-4.2 * s) * Math.cos(6.5 * s));
      }
    },
    dispose() {
      group.parent?.remove(group);
      group.traverse(o => { o.geometry?.dispose(); if (o.material && !Object.values(rm).includes(o.material) && !Object.values(mats).includes(o.material)) { o.material.map?.dispose(); o.material.dispose(); } });
    },
  };
}

// Big painted sign texture.
export function boardTexture(lines, {bg = '#f1e8d2', fg = '#7c2318', w = 1024, h = 256, border = '#7c2318', accent = '#2f5a86', font = 'bold 120px'} = {}) {
  const [c, g] = canvas(w, h), r = rng(w + lines.length * 7);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += h / 4) { g.fillStyle = 'rgba(60,40,20,.25)'; g.fillRect(0, y, w, 2); }
  g.lineWidth = 14; g.strokeStyle = border; g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 4; g.strokeStyle = accent; g.strokeRect(30, 30, w - 60, h - 60);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const L = typeof l === 'string' ? {text: l} : l;
    g.font = `${L.font ?? font} Georgia, "Times New Roman", serif`; g.fillStyle = L.color ?? fg;
    g.fillText(L.text, w / 2, h * (i + 1) / (lines.length + 1) + 4, w - 100);
  });
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,60,30,${0.15 + r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2); }
  return tex(c, {repeat: false});
}

// Double-sided sign board (front faces +x unless face = -1).
export function signBoard(group, tex, {x, y, z, w, h, face = 1, back, thick = 0.08, frame}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: tex, roughness: 0.8}));
  m.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; m.position.set(x + face * (thick / 2 + 0.005), y, z);
  group.add(m);
  if (back) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: back, roughness: 0.8}));
    b.rotation.y = -m.rotation.y; b.position.set(x - face * (thick / 2 + 0.005), y, z); group.add(b);
  }
  if (frame) group.add(mesh(box(x, y, z, thick, h + 0.12, w + 0.12), frame));
  return m;
}

// Pennant bunting: strings of little triangles between points. Returns the mesh.
export function bunting(group, strands, {colors = ['#c8362e', '#f1ead8', '#2f5a86', '#e9b23c'], size = 0.32, spacing = 0.42, sag = 0.08, cast = true} = {}) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -size * 0.45, 0, 0, size * 0.45, 0, -size, 0], 3));
  tri.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  const mats = [], cols = [], cords = [];
  const pal = colors.map(c => new THREE.Color(c)), q = new THREE.Quaternion(), up = V(0, 1, 0), m = new THREE.Matrix4();
  for (const [a, b] of strands) {
    const d = b.clone().sub(a), len = d.length(), k = Math.max(2, Math.round(len / spacing));
    const at = t => a.clone().lerp(b, t).add(V(0, -4 * sag * len * t * (1 - t) / 2, 0));
    const along = V(d.x, 0, d.z).normalize();
    for (let i = 1; i < k; i++) {
      const p = at(i / k);
      q.setFromUnitVectors(V(0, 0, 1), along.lengthSq() ? along : V(0, 0, 1));
      mats.push(m.clone().compose(p, q, V(1, 1, 1))); cols.push(pal[i % pal.length]);
    }
    for (let i = 0; i < 8; i++) cords.push(rod(at(i / 8), at((i + 1) / 8), 0.008, 3));
  }
  const inst = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({roughness: 0.8, side: THREE.DoubleSide}), mats.length);
  mats.forEach((mm, i) => { inst.setMatrixAt(i, mm); inst.setColorAt(i, cols[i]); });
  inst.castShadow = cast;
  group.add(inst);
  if (cords.length) group.add(mesh(merge(cords), new THREE.MeshStandardMaterial({color: 0xe8e0cc, roughness: 0.9}), {cast: false}));
  return inst;
}

// Waving cloth flags on poles. list: [{x, y, z, h, w, fh, color, stripe}]. Returns update(wall).
export function flags(group, list, {wind = V(0.35, 0, -1).normalize()} = {}) {
  const poleParts = [], flagMeshes = [];
  const yaw = Math.atan2(-wind.z, wind.x); // flag streams downwind
  for (const f of list) {
    poleParts.push(rod(V(f.x, f.y - 0.2, f.z), V(f.x, f.y + f.h, f.z), f.r ?? 0.045, 6));
    const geo = new THREE.PlaneGeometry(f.w, f.fh, 10, 4); geo.translate(f.w / 2, 0, 0);
    const [c, g] = canvas(128, 80);
    g.fillStyle = f.color; g.fillRect(0, 0, 128, 80);
    if (f.stripe) { g.fillStyle = f.stripe; for (let k = 0; k < 3; k++) g.fillRect(0, 10 + k * 26, 128, 10); }
    if (f.star) { g.fillStyle = f.star; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 9 : 22; g.lineTo(40 + Math.cos(a) * rr, 40 + Math.sin(a) * rr); } g.fill(); }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: tex(c, {repeat: false}), roughness: 0.85, side: THREE.DoubleSide}));
    m.position.set(f.x, f.y + f.h - f.fh / 2 - 0.05, f.z); m.rotation.y = yaw; m.castShadow = true;
    m.userData.base = Float32Array.from(geo.attributes.position.array);
    m.userData.phase = (f.x * 0.37 + f.z * 0.71) % 6.28;
    flagMeshes.push(m); group.add(m);
  }
  if (poleParts.length) group.add(mesh(merge(poleParts), new THREE.MeshStandardMaterial({color: 0xdedad2, roughness: 0.4, metalness: 0.6})));
  return wall => {
    for (const m of flagMeshes) {
      const p = m.geometry.attributes.position, b = m.userData.base, ph = m.userData.phase;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], yy = b[i * 3 + 1], k = x / 1.2;
        p.setZ(i, Math.sin(wall * 5.2 - x * 3.1 + ph) * 0.12 * k + Math.sin(wall * 8.3 - x * 5 + yy * 2 + ph) * 0.035 * k);
        p.setY(i, yy - k * k * 0.05);
      }
      p.needsUpdate = true; m.geometry.computeVertexNormals();
    }
  };
}

// Start arch over the chutes with the big painted sign, catwalk and announcer's booth.
export function startArea(group, course, rm, mats) {
  const half = course.roadHalf, y = x => course.roadY(x);
  const XA = -1.15, top = y(XA) + 5.4, span = half + 0.75;
  const parts = [];
  for (const s of [-1, 1]) {
    const g = Math.max(course.terrainH(XA, s * span), y(XA) - 0.3);
    parts.push(box(XA, (top + 0.5 + g - 0.4) / 2, s * span, 0.34, top + 0.9 - g, 0.34));
    parts.push(box(XA, top + 1.05, s * span, 0.46, 0.14, 0.46));            // post caps
  }
  parts.push(box(XA, top, 0, 0.38, 0.36, span * 2 + 0.7));                    // header beam
  for (const s of [-1, 1]) parts.push(rod(V(XA, top - 1.4, s * (span - 0.15)), V(XA, top - 0.1, s * (span - 1.4)), 0.07, 6)); // knee braces
  group.add(mesh(merge(parts), rm.red));
  const front = boardTexture([{text: 'SALINAS', font: 'bold 118px'}, {text: '· PUMPKIN ROUNDUP ·', font: 'italic bold 64px', color: '#2f5a86'}], {h: 300});
  const back = boardTexture([{text: "LET 'EM ROLL!", font: 'bold 120px'}], {h: 300, bg: '#2f5a86', fg: '#f1e8d2', border: '#f1e8d2', accent: '#c8362e'});
  signBoard(group, front, {x: XA + 0.1, y: top - 1.0, z: 0, w: 7.6, h: 2.2, back, frame: rm.white});

  // Catwalk behind the chutes, where the handlers stand.
  const cw = [], XC0 = -3.75, XC1 = -2.65, cy = y(-3.2) + 0.95;
  cw.push(box((XC0 + XC1) / 2, cy, 0, XC1 - XC0, 0.08, span * 2));
  for (const z of samples(-span, span, 2.2)) for (const x of [XC0 + 0.05, XC1 - 0.05]) cw.push(box(x, (cy + y(x) - 0.2) / 2, z, 0.1, cy - y(x) + 0.2, 0.1));
  for (const z of samples(-span, span, 2.2)) cw.push(box(XC0 + 0.05, cy + 0.55, z, 0.08, 1.1, 0.08));
  cw.push(box(XC0 + 0.05, cy + 1.08, 0, 0.07, 0.08, span * 2), box(XC0 + 0.05, cy + 0.6, 0, 0.05, 0.07, span * 2));
  group.add(mesh(merge(cw), mats.timber));

  // Wooden deck behind the chutes.
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(10, half * 2 + 1.6), new THREE.MeshStandardMaterial({map: T.rampTexture(), roughness: 0.9}));
  deck.material.map.repeat.set(3, 2); deck.rotation.x = -Math.PI / 2; deck.position.set(-9.4, y(-10) + 0.03, 0); deck.receiveShadow = true;
  group.add(deck);
  const skirt = [];
  for (const s of [-1, 1]) skirt.push(box(-9.4, y(-10) - 0.25, s * (half + 0.8), 10, 0.6, 0.08));
  skirt.push(box(-14.4, y(-10) - 0.25, 0, 0.08, 0.6, half * 2 + 1.6));
  group.add(mesh(merge(skirt), mats.timber));

  // Announcer's booth on stilts, south side.
  const bx = -8.2, bz = -half - 6.4, g0 = course.terrainH(bx, bz), fy = g0 + 2.5, W = 2.8, D = 2.4;
  const b = [];
  for (const dx of [-W / 2, W / 2]) for (const dz of [-D / 2, D / 2]) b.push(box(bx + dx, (fy + course.terrainH(bx + dx, bz + dz) - 0.3) / 2, bz + dz, 0.16, fy - course.terrainH(bx + dx, bz + dz) + 0.3, 0.16));
  b.push(box(bx, fy, bz, W + 0.3, 0.16, D + 0.3));
  b.push(box(bx, fy + 0.55, bz + D / 2, W, 1.0, 0.08), box(bx - W / 2, fy + 0.55, bz, 0.08, 1.0, D), box(bx + W / 2, fy + 0.55, bz, 0.08, 1.0, D));
  b.push(box(bx, fy + 1.25, bz - D / 2, W, 2.4, 0.08));
  for (const dx of [-W / 2, W / 2]) for (const dz of [-D / 2, D / 2]) b.push(box(bx + dx, fy + 1.3, bz + dz, 0.1, 2.5, 0.1));
  group.add(mesh(merge(b), rm.white));
  const roof = [box(bx, fy + 2.62, bz - 0.2, W + 0.9, 0.08, D + 1.2, 0)];
  roof[0].rotateX(0.12);
  const rm1 = mesh(merge(roof), rm.tin); group.add(rm1);
  const stair = [];
  for (let k = 0; k < 9; k++) { const sx = bx + W / 2 + 0.6 + k * 0.32, sy = fy - k * 0.28; stair.push(box(sx, sy - 0.05, bz + D / 2 - 0.55, 0.3, 0.06, 0.9)); }
  stair.push(rod(V(bx + W / 2 + 0.5, fy + 0.9, bz + D / 2 - 0.1), V(bx + W / 2 + 3.4, course.terrainH(bx + W / 2 + 3.4, bz) + 0.9, bz + D / 2 - 0.1), 0.03, 5));
  group.add(mesh(merge(stair), mats.timber));
  signBoard(group, boardTexture([{text: 'ANNOUNCER', font: 'bold 100px'}], {h: 180, bg: '#a3352a', fg: '#f6efe0', border: '#f6efe0', accent: '#2a1c12'}),
    {x: bx, y: fy + 0.55, z: bz + D / 2 + 0.06, w: 2.4, h: 0.45, face: 1, thick: 0.02}).rotation.y = 0;
  // Loudspeaker horns on a pole.
  const hornMat = new THREE.MeshStandardMaterial({color: 0x9aa3a7, roughness: 0.4, metalness: 0.6});
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.4, 6), hornMat); pole.position.set(bx - W / 2 - 0.3, fy + 1.6, bz + D / 2); group.add(pole);
  for (const a of [0.5, -0.9]) {
    const h = mesh(new THREE.ConeGeometry(0.28, 0.6, 10, 1, true), hornMat);
    h.rotation.z = -Math.PI / 2; h.rotation.y = a; h.position.set(bx - W / 2 - 0.3 + Math.cos(a) * 0.3, fy + 3.6, bz + D / 2 - Math.sin(a) * 0.3); group.add(h);
  }
  return {platforms: [{x0: XC0 + 0.1, x1: XC1 - 0.1, z0: -span, z1: span, y: cy + 0.04}, {x0: bx - W / 2 + 0.2, x1: bx + W / 2 - 0.2, z0: bz - D / 2 + 0.2, z1: bz + D / 2 - 0.25, y: fy + 0.08}],
    arch: {x: XA, top, span}, booth: {x: bx, z: bz, y: fy}};
}

// Finish line: log gantry set just past the line (so the photo-finish camera has a clear view), timing board.
export function finishLine(group, course, mats) {
  const board = T.timingBoard();
  const L = course.length, gx = L + 2.0;
  // Same construction as the shared finishGantry, set 2 m past the line (clear of the photo-finish camera).
  const y = course.roadY(gx), span = course.roadHalf + 1.4, top = y + 5.4;
  group.add(mesh(merge([rod(V(gx, y - 0.5, -span), V(gx, top + 0.4, -span), 0.2, 9), rod(V(gx, y - 0.5, span), V(gx, top + 0.4, span), 0.2, 9),
    rod(V(gx, top + 0.1, -span - 0.5), V(gx, top + 0.1, span + 0.5), 0.16, 9)]), mats.wood));
  const banner = (t, side) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 0.7, 1.3), new THREE.MeshStandardMaterial({map: t, roughness: 0.95}));
    m.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2; m.position.set(gx + side * 0.05, top - 0.75, 0); group.add(m);
  };
  banner(T.checkerTexture('FINISH'), -1); banner(T.checkerTexture('SALINAS'), 1);
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({map: board, toneMapped: false}));
  bm.rotation.y = -Math.PI / 2; bm.position.set(gx - 0.2, top + 0.85, 0);
  const back = mesh(new THREE.BoxGeometry(0.3, 1.0, 3.4), mats.wood); back.position.set(gx, top + 0.85, 0);
  group.add(bm, back);
  return {board, gx, top, span};
}

// Photo-finish mast on the open side of the line: a slim pole with the camera housing,
// so it doesn't block the trackside cameras. Returns the lens position.
export function photoMast(group, course, rm, {x, z}) {
  const g0 = course.terrainH(x, z), top = g0 + 2.15, parts = [];
  parts.push(box(x, (g0 - 0.3 + top) / 2, z + 0.35, 0.12, top - g0 + 0.3, 0.12));
  parts.push(box(x, g0 + 0.05, z + 0.35, 0.7, 0.1, 0.7));
  for (const s of [-1, 1]) parts.push(rod(V(x + s * 0.32, g0 + 0.08, z + 0.35), V(x, g0 + 1.1, z + 0.35), 0.025, 4));
  group.add(mesh(merge(parts), rm.white));
  const housing = [box(x, top + 0.1, z + 0.05, 0.26, 0.24, 0.62), box(x, top + 0.28, z + 0.05, 0.34, 0.04, 0.72)];
  const lens = new THREE.CylinderGeometry(0.07, 0.08, 0.14, 12); lens.rotateX(Math.PI / 2); lens.translate(x, top + 0.1, z - 0.32);
  group.add(mesh(merge([...housing, lens]), rm.dark));
  return {lens: V(x, top + 0.1, z - 0.42), top};
}

// Covered wooden grandstand on the south side of the finish. Returns platforms for the crowd and tier info.
export function grandstand(group, course, rm, mats, S, {low = false} = {}) {
  const {x0, x1, y} = S, zf = S.z1, rows = 8, depth = 0.82, rise = 0.42, apron = 1.4;
  const zBack = zf - apron - rows * depth, X = (x0 + x1) / 2, Wd = x1 - x0;
  const steps = [], deck = [];
  deck.push(box(X, y - 0.1, (zf + zBack) / 2, Wd, 0.2, zf - zBack));
  for (let k = 0; k < rows; k++) {
    const za = zf - apron - k * depth, zb = za - depth, h = rise * (k + 1);
    steps.push(box(X, y + h / 2, (za + zb) / 2, Wd, h, depth));
  }
  group.add(mesh(merge(steps), mats.timber));
  // Benches (seat boards) at the front of each tier.
  const benches = [];
  for (let k = 0; k < rows; k++) { const za = zf - apron - k * depth; benches.push(box(X, y + rise * (k + 1) + 0.04, za - 0.18, Wd - 0.3, 0.06, 0.3)); }
  group.add(mesh(merge(benches), rm.white));
  // Ends: stepped red panels; back wall; front rail; skirt down to the ground; posts under the deck.
  const ends = [], whites = [];
  for (const xe of [x0 - 0.05, x1 + 0.05]) {
    ends.push(box(xe, y + 0.55, zf - apron / 2, 0.1, 1.1, apron));
    for (let k = 0; k < rows; k++) { const za = zf - apron - k * depth; ends.push(box(xe, y + (rise * (k + 1) + 1.0) / 2, za - depth / 2, 0.1, rise * (k + 1) + 1.0, depth)); }
  }
  const backTop = y + rise * rows + 1.1;
  ends.push(box(X, (backTop + y) / 2, zBack - 0.05, Wd + 0.2, backTop - y, 0.1));
  const ground = (x, z) => course.terrainH(x, z);
  for (const x of samples(x0, x1, 2.5)) {
    whites.push(box(x, y + 0.5, zf - 0.05, 0.1, 1.0, 0.1));
    const gy = Math.min(ground(x, zf), y);
    if (y - gy > 0.15) whites.push(box(x, (y + gy - 0.2) / 2, zf - 0.08, 2.5, y - gy + 0.2, 0.06));
    for (const z of [zf - 0.3, (zf + zBack) / 2, zBack + 0.2]) {
      const gz = ground(x, z);
      if (y - gz > 0.3) deck.push(box(x, (y + gz) / 2 - 0.2, z, 0.18, y - gz, 0.18));
    }
  }
  whites.push(box(X, y + 1.0, zf - 0.05, Wd, 0.08, 0.08), box(X, y + 0.55, zf - 0.05, Wd, 0.06, 0.06));
  group.add(mesh(merge(ends), rm.red), mesh(merge(whites), rm.white), mesh(merge(deck), mats.timber));
  // Roof on posts, open to the track, with a painted fascia.
  // Cantilevered roof: tall back posts with stays, nothing in the spectators' view.
  const rf = y + rise * rows + 3.0, rb = rf + 0.9, posts = [], stays = [];
  for (const x of samples(x0 + 0.3, x1 - 0.3, 7.4)) {
    posts.push(box(x, (y - 0.2 + rb + 2.2) / 2, zBack - 0.15, 0.22, rb + 2.4 - y, 0.22));
    stays.push(rod(V(x, rb + 2.1, zBack - 0.15), V(x, rf + 0.05, zf - apron + 0.9), 0.035, 5));
    stays.push(rod(V(x, rb + 2.1, zBack - 0.15), V(x, (rf + rb) / 2 + 0.05, (zf - apron + 0.9 + zBack) / 2), 0.03, 5));
  }
  group.add(mesh(merge(posts), rm.white), mesh(merge(stays), rm.steel));
  const roofGeo = new THREE.PlaneGeometry(Wd + 1.2, Math.hypot(zf - apron + 0.9 - zBack, rb - rf) + 0.6);
  roofGeo.rotateX(-Math.PI / 2 + Math.atan2(rb - rf, zf - apron + 0.9 - zBack));
  roofGeo.translate(X, (rf + rb) / 2 + 0.1, (zf - apron + 0.9 + zBack) / 2);
  const roofMat = rm.tin.clone(); roofMat.map = rm.tin.map.clone(); roofMat.map.repeat.set(6, 1); roofMat.map.needsUpdate = true;
  group.add(mesh(roofGeo, roofMat));
  const fascia = boardTexture([{text: 'SALINAS VALLEY  ·  PUMPKIN ROUNDUP', font: 'bold 92px'}], {w: 2048, h: 160, bg: '#f1e8d2', fg: '#7c2318'});
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(Wd + 1.2, 0.85), new THREE.MeshStandardMaterial({map: fascia, roughness: 0.8}));
  fm.position.set(X, rf - 0.15, zf - apron + 0.95); group.add(fm);
  const fb = mesh(box(X, rf - 0.15, zf - apron + 0.9, Wd + 1.3, 0.95, 0.08), rm.red); group.add(fb);
  // Tier surfaces for the crowd (one strip per row) and the apron.
  const tiers = [];
  for (let k = 0; k < rows; k++) { const za = zf - apron - k * depth; tiers.push({x0: x0 + 0.5, x1: x1 - 0.5, z0: za - depth + 0.12, z1: za - 0.36, y: y + rise * (k + 1) + 0.0}); }
  const apronZone = {x0: x0 + 0.5, x1: x1 - 0.5, z0: zf - apron + 0.2, z1: zf - 0.35, y};
  return {tiers, apron: apronZone, roof: {y: rf, x0, x1, z: zf - apron + 0.95}, back: zBack, flagsAt: samples(x0 + 1, x1 - 1, 5.6).map(x => ({x, y: rb, z: zBack + 0.1}))};
}
