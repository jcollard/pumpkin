// Fishing nets strung across the Monterey course.
//
// Each net hangs between two sturdy posts wrapped in red/white flagging: a
// thick cream diamond-mesh panel (a real vertex grid, displaced every frame),
// an orange headline with cork floats and a lead footrope on the dirt.
// Everything is a pure function of race time t (scrub-safe, nothing accumulates):
//  - idle: the panel breathes in the wind;
//  - impact: the breaker pushes a pocket into the mesh (the game's 0.5 m stretch);
//  - caught: the pumpkin sits in that pocket until someone else breaks the net;
//  - NET OPEN: the ropes snap at the breaker's lane, both halves whip back to
//    their posts and slump, and a burst of fibres, cord ends and corks flies out
//    and bounces down the track (trajectories precomputed once per race).
// The physics puts the net at x = net.x; the panel hangs PLANE_BACK metres
// upstream, so a pumpkin stopped at net.x stretches it by PLANE_BACK + radius ≈ 0.5 m.
import * as THREE from 'three';
import * as P from '../../physics.js';
import {rng} from '../../noise.js';
import {rod, merge, mesh} from '../../env/geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const PLANE_BACK = 0.3;
const CELL = 0.2;                  // diamond mesh period (m)
const HEIGHT = 2.2;                // headline height at the posts above the road
const SAG = 0.18;
const FLAG_COLORS = ['#3f8f4f', '#2f6db3', '#d0402a'];   // each net's pennant colour (matches its sign)
const DEBRIS_T = 3.2, DEBRIS_HZ = 60;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Thick diamond-mesh twine, with a hand-made mip chain that keeps the net
// reading as a pale veil from far away instead of vanishing.
function meshTexture() {
  const levels = [];
  for (let s = 128, k = 0; s >= 1; s >>= 1, k++) {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    if (s <= 4) { g.fillStyle = 'rgba(255,255,255,0.62)'; g.fillRect(0, 0, s, s); }
    else {
      const cover = Math.min(0.62, 0.3 + 0.075 * k), lw = Math.max(1, cover * s / 2.5);
      // Slightly darker core so the twine has some body up close.
      for (const [col, w] of [['rgba(255,255,255,1)', lw], ['rgba(222,214,196,1)', lw * 0.35]]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
        for (const [a, b, c2, d] of [[0, 0, s, s], [s, 0, 0, s], [-s, 0, s, 2 * s], [0, -s, 2 * s, s], [0, s, s, 0], [2 * s, 0, 0, 2 * s]]) {
          g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
        }
      }
      if (s >= 32) { g.fillStyle = '#fff'; for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { g.beginPath(); g.arc(x, y, lw * 0.9, 0, 7); g.fill(); } }
    }
    levels.push(c);
  }
  const t = new THREE.CanvasTexture(levels[0]);
  t.mipmaps = levels; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
  return t;
}

// Red and white flagging tape bands for the posts.
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#d2382a'; g.fillRect(0, i * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Four-sided rope tube along a polyline whose points change every frame.
function ropeGeometry(n) {
  const g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  for (let i = 0; i < n - 1; i++) {
    if (i === n / 2 - 1) continue; // the two ropes (headline, footrope) share one buffer
    for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4; idx.push(a, c, b, b, c, d); }
  }
  g.setIndex(idx);
  return g;
}
const _t = new THREE.Vector3(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _ref = new THREE.Vector3();
function writeRope(g, pts, r, offset = 0) {
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    _t.subVectors(b, a); if (_t.lengthSq() < 1e-10) _t.set(0, 0, 1); _t.normalize();
    _ref.set(1, 0, 0); if (Math.abs(_t.x) > 0.9) _ref.set(0, 1, 0);
    _n1.crossVectors(_t, _ref).normalize(); _n2.crossVectors(_t, _n1);
    for (let k = 0; k < 4; k++) {
      const s = k % 2 ? _n2 : _n1, sign = k < 2 ? 1 : -1, j = ((offset + i) * 4 + k) * 3;
      pos[j] = pts[i].x + s.x * r * sign; pos[j + 1] = pts[i].y + s.y * r * sign; pos[j + 2] = pts[i].z + s.z * r * sign;
      nrm[j] = s.x * sign; nrm[j + 1] = s.y * sign; nrm[j + 2] = s.z * sign;
    }
  }
}

// Build all nets. Returns {nets, onRace(data), update(t, camera)}.
export function buildNets(group, course, {low = false} = {}) {
  const half = course.roadHalf, PZ = half + 0.8;
  const staticParts = [], tapeParts = [], flagParts = [];
  const wood = new THREE.MeshStandardMaterial({color: 0x6e5440, roughness: 0.9});
  const ropeMat = new THREE.MeshStandardMaterial({color: 0xf07a1e, roughness: 0.75});
  const floatMat = new THREE.MeshStandardMaterial({roughness: 0.6});
  const cordMat = new THREE.MeshStandardMaterial({color: 0xd9ccae, roughness: 0.95});
  const tex = meshTexture();
  tex.repeat.set(1 / CELL, 1 / CELL);
  const ny = low ? 10 : 15, colStep = low ? 0.2 : 0.12;

  const nets = course.track.nets.map((n, k) => {
    const X = n.x - PLANE_BACK, g = course.roadY(n.x);
    const top = z => g + HEIGHT - SAG * (1 - (z / PZ) ** 2);
    const mat = new THREE.MeshStandardMaterial({color: 0xf6eedb, map: tex, transparent: true, alphaTest: 0.05,
      side: THREE.DoubleSide, depthWrite: false, roughness: 0.9});
    for (const s of [-1, 1]) {
      const z = s * PZ;
      staticParts.push(rod(V(X, g - 0.6, z), V(X, g + HEIGHT + 0.5, z), 0.14, 10));
      staticParts.push(rod(V(X - 0.02, g + HEIGHT + 0.42, z), V(X - 0.2, g - 0.05, z + s * 2.4), 0.014, 3));
      staticParts.push(rod(V(X + 0.05, g + HEIGHT + 0.42, z), V(X + 1.7, g - 0.05, z + s * 1.8), 0.014, 3));
      staticParts.push(rod(V(X - 0.2, g - 0.2, z + s * 2.4), V(X - 0.2, g + 0.25, z + s * 2.4), 0.045, 5));
      staticParts.push(rod(V(X + 1.7, g - 0.2, z + s * 1.8), V(X + 1.7, g + 0.25, z + s * 1.8), 0.045, 5));
      // Flagging tape wrapped round the post (two bands) and streamers.
      for (const [y0, y1] of [[g + 0.25, g + 0.95], [g + HEIGHT - 0.35, g + HEIGHT + 0.35]]) {
        const sleeve = new THREE.CylinderGeometry(0.152, 0.152, y1 - y0, 12, 1, true); sleeve.translate(X, (y0 + y1) / 2, z);
        const uv = sleeve.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (y1 - y0) / 0.22);
        tapeParts.push(sleeve);
      }
      for (let i = 0; i < 2; i++) {
        const st = new THREE.PlaneGeometry(0.05, 0.75); st.translate(0, -0.37, 0); st.rotateZ(0.5 + i * 0.25); st.rotateY(i ? 0.6 : -0.4);
        st.translate(X + 0.1, g + HEIGHT + 0.3 - i * 0.05, z + s * 0.08); tapeParts.push(st);
      }
      // Pennant on top of the post in the net's colour.
      const shape = new THREE.BufferGeometry();
      shape.setAttribute('position', new THREE.Float32BufferAttribute([X, g + HEIGHT + 1.45, z, X, g + HEIGHT + 0.85, z, X + 1.15, g + HEIGHT + 1.18, z - s * 0.05], 3));
      shape.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      const col = new THREE.Color(FLAG_COLORS[k % 3]), cols = [];
      for (let i = 0; i < 3; i++) cols.push(col.r, col.g, col.b);
      shape.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      flagParts.push(shape);
      staticParts.push(rod(V(X, g + HEIGHT + 0.4, z), V(X, g + HEIGHT + 1.5, z), 0.03, 5));
    }
    return {k, x: n.x, X, g, top, mat, energy: n.energy, halves: [], open: Infinity, snap: Infinity, opener: null, pushers: [], lastT: NaN,
      settled: false, debris: null, zt: 0.35};
  });
  group.add(mesh(merge(staticParts), wood));
  const tapes = new THREE.Mesh(merge(tapeParts), new THREE.MeshStandardMaterial({map: stripeTexture(), roughness: 0.6, side: THREE.DoubleSide}));
  tapes.castShadow = true; group.add(tapes);
  const flags = new THREE.Mesh(merge(flagParts), new THREE.MeshStandardMaterial({vertexColors: true, side: THREE.DoubleSide, roughness: 0.8}));
  flags.castShadow = true; group.add(flags);

  // Hanging buoys at the posts: red/white spheres (instanced, static).
  const buoyMats = [];
  for (const net of nets) for (const s of [-1, 1]) {
    buoyMats.push(new THREE.Matrix4().makeTranslation(net.X + 0.2, net.g + 1.45, s * (PZ + 0.2)));
    buoyMats.push(new THREE.Matrix4().makeTranslation(net.X - 0.15, net.g + 1.05, s * (PZ + 0.16)));
  }
  const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({roughness: 0.45}), buoyMats.length);
  buoyMats.forEach((m, i) => { buoys.setMatrixAt(i, m); buoys.setColorAt(i, new THREE.Color(i % 2 ? 0xf2efe6 : 0xd6382b)); });
  buoys.castShadow = true; group.add(buoys);

  // Cork floats along each headline, plus loose corks for the burst (instanced, updated every frame).
  const floatGeo = new THREE.CapsuleGeometry(0.046, 0.07, 3, 8); floatGeo.rotateX(Math.PI / 2);
  const FLOAT_STEP = 0.36, LOOSE = 8, perNet = Math.ceil(2 * PZ / FLOAT_STEP) + 4 + LOOSE;
  const floats = new THREE.InstancedMesh(floatGeo, floatMat, perNet * nets.length);
  for (let i = 0; i < floats.count; i++) floats.setColorAt(i, new THREE.Color(i % 3 === 2 ? 0xf6f1e4 : 0xf08a2c));
  floats.castShadow = true; floats.frustumCulled = false; group.add(floats);
  // Cord ends and fibres for the burst.
  const CORDS = low ? 16 : 30, FIBRES = low ? 40 : 90;
  const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 3); cordGeo.translate(0, 0.5, 0);
  const cords = new THREE.InstancedMesh(cordGeo, cordMat, (CORDS + FIBRES) * nets.length);
  cords.castShadow = false; cords.frustumCulled = false; group.add(cords);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < cords.count; i++) cords.setMatrixAt(i, hidden);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fs = new THREE.Vector3(1, 1, 1), zAxis = V(0, 0, 1), yAxis = V(0, 1, 0), fe = new THREE.Euler();

  // (Re)build the two halves of a net, split at lane zt.
  function buildHalves(net, zt) {
    for (const h of net.halves) { group.remove(h.mesh, h.rope); h.mesh.geometry.dispose(); h.rope.geometry.dispose(); }
    const r = rng(101 + net.k * 7);
    net.halves = [-1, 1].map(s => {
      const zPost = s * PZ, W = Math.abs(zPost - zt), nz = Math.max(3, Math.ceil(W / colStep));
      const rest = [], uv = [], idx = [], jag = [];
      for (let i = 0; i <= nz; i++) jag.push(r());
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nz; i++) {
        const z = zPost + (zt - zPost) * i / nz, v = j / ny, y = net.g + 0.03 + (net.top(z) - net.g - 0.03) * v;
        rest.push({z, y, v, e: 1 - i / nz, i, j, jag: jag[i]});
        uv.push(z + PZ, y - net.g);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nz; i++) {
        const a = j * (nz + 1) + i, b = a + 1, c = a + nz + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rest.length * 3), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, net.mat);
      m.frustumCulled = false; m.renderOrder = 2;
      const rope = new THREE.Mesh(ropeGeometry((nz + 1) * 2), ropeMat);
      rope.frustumCulled = false; rope.castShadow = true;
      group.add(m, rope);
      // Corks threaded on this half's headline; the ones right at the tear fly off in the burst.
      const nF = Math.max(1, Math.floor(W / FLOAT_STEP)), fl = [];
      for (let f = 0; f < nF; f++) { const u = (f + 0.5) / nF; fl.push({u, z: zPost + (zt - zPost) * u, loose: Math.abs(zPost + (zt - zPost) * u - zt) < 0.55}); }
      return {s, zPost, W, nz, rest, mesh: m, rope, pts: rest.map(() => V(0, 0, 0)), fl};
    });
    net.zt = zt; net.lastT = NaN; net.settled = false;
  }
  for (const net of nets) buildHalves(net, 0.35);

  // Where the net material is at time t for a rest point (before tearing).
  function intact(net, t, R, pushers, out) {
    const zDist = PZ - Math.abs(R.z), pinZ = smooth(0, 0.9, zDist), pinY = 0.5 + 0.5 * smooth(0, 0.4, R.y - net.g);
    let dx = 0.035 * Math.sin(R.z * 2.1 + R.v * 2.7) * pinZ                                    // loose folds
      + 0.06 * pinZ * R.v * Math.sin(t * 1.6 + R.z * 0.55 + net.k) + 0.025 * Math.sin(t * 3.1 + R.z * 1.7) * pinZ; // breeze
    let dy = -0.03 * pinZ * R.v * Math.sin(t * 1.6 + R.z * 0.55 + net.k), dz = 0, push = 0;
    for (const p of pushers) {
      const px = p.x - net.X, Rr = p.r * 1.06, depth = px + Rr;
      if (depth <= 0) continue;
      const rho = Math.hypot(R.z - p.z, R.y - p.y), w = 0.42 + 1.6 * Rr + 0.5 * Math.max(0, px);
      let d = depth * Math.exp(-((rho / w) ** 2) * 1.4);
      if (rho < Rr) d = Math.max(d, px + Math.sqrt(Rr * Rr - rho * rho));
      d *= pinZ * pinY;
      if (d > push) {
        push = d;
        dz = (p.z - R.z) * 0.22 * d / (0.3 + Math.abs(p.z - R.z));      // mesh drawn in toward the pocket
        dy = -0.42 * d * R.v * R.v * Math.exp(-(((R.z - p.z) / 2.2) ** 2)) + p.quiver * R.v;   // headline dragged down over it
      }
    }
    return out.set(net.X + dx + push, R.y + dy, R.z + dz);
  }

  const pushersAt = (net, t) => {
    const list = [];
    for (const c of net.pushers) {
      if (t < c.from || t >= c.to) continue;
      const v = c.view, f = P.sampleSimulation(v.result, Math.max(0, Math.min(t, v.result.time)));
      let x = f.centerX, quiver = 0;
      if (c.caught !== undefined && t >= c.caught) { x = Math.max(x, net.x); const q = t - c.caught; quiver = 0.08 * Math.exp(-q / 0.35) * Math.sin(q * 15); }
      list.push({x, y: course.H0 + f.centerY, z: v.lane, r: v.radius, quiver});
    }
    return list;
  };

  // Burst debris: trajectories with gravity, drag and bounces, sampled once per race.
  function simulateDebris(net) {
    const r = rng(9000 + net.k * 31), out = [];
    const v0 = net.opener ? P.sampleSimulation(net.opener.result, Math.min(net.opener.result.time, net.open)).v : 8;
    const ground = (x, z) => (Math.abs(z) <= half + 0.3 ? course.roadY(x) : Math.max(course.roadY(x) - 0.3, course.terrainH(x, z)));
    const spawn = [];
    for (const h of net.halves) for (const f of h.fl) if (f.loose) spawn.push({kind: 'float', z: f.z, y: net.top(f.z)});
    for (let i = 0; i < CORDS; i++) spawn.push({kind: 'cord', z: net.zt + (r() - 0.5) * 1.2, y: net.g + 0.1 + r() * (HEIGHT - 0.1)});
    for (let i = 0; i < FIBRES; i++) spawn.push({kind: 'fibre', z: net.zt + (r() - 0.5) * 0.9, y: net.g + 0.15 + r() * (HEIGHT - 0.2)});
    const N = Math.round(DEBRIS_T * DEBRIS_HZ), sub = 2, dt = 1 / (DEBRIS_HZ * sub);
    for (const s of spawn) {
      const type = s.kind, drag = type === 'fibre' ? 3.2 : type === 'cord' ? 1.3 : 0.35, e = type === 'float' ? 0.45 : 0.18;
      const side = Math.sign(s.z - net.zt) || (r() < 0.5 ? -1 : 1);
      let x = net.x + 0.1 + r() * 0.3, y = s.y, z = s.z;
      let vx = v0 * (type === 'fibre' ? 0.5 + r() * 0.8 : 0.25 + r() * 0.6) + r() * 2, vy = 1 + r() * (type === 'float' ? 4.5 : 3.5), vz = side * (1 + r() * 4) + (r() - 0.5) * 2;
      const len = type === 'cord' ? 0.1 + r() * 0.22 : type === 'fibre' ? 0.03 + r() * 0.06 : 0, rad = type === 'float' ? 0.046 : 0.012;
      const spin = V((r() - 0.5) * 30, (r() - 0.5) * 30, (r() - 0.5) * 30);
      const pos = new Float32Array((N + 1) * 3);
      let rest = DEBRIS_T, resting = false;
      for (let i = 0; i <= N; i++) {
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        for (let k = 0; k < sub && !resting; k++) {
          vy -= 9.81 * dt;
          const sp = Math.hypot(vx, vy, vz), dk = Math.exp(-drag * sp * 0.08 * dt);
          vx *= dk; vy *= dk; vz *= dk;
          x += vx * dt; y += vy * dt; z += vz * dt;
          const gy = ground(x, z) + rad;
          if (y < gy) {
            y = gy;
            if (vy < 0) vy = -vy * e;
            vx *= 0.55; vz *= 0.55;
            if (Math.abs(vy) < 0.35 && Math.hypot(vx, vz) < 0.25) { resting = true; rest = Math.min(rest, i / DEBRIS_HZ); }
          }
        }
      }
      out.push({type, pos, rest, len, spin, tilt: r() * 6.28});
    }
    return out;
  }

  const tmp = V(0, 0, 0), P0 = V(0, 0, 0), dp = V(0, 0, 0);
  function updateNet(net, t) {
    const torn = t >= net.snap, tau = t - net.snap;
    if (torn && tau > DEBRIS_T + 0.2 && net.settled) return;
    const at = torn ? net.snap : t;
    const pushers = pushersAt(net, at);
    let fi = net.k * perNet;
    for (const h of net.halves) {
      const pos = h.mesh.geometry.attributes.position.array;
      h.rest.forEach((R, n) => {
        intact(net, at, R, pushers, P0);
        if (torn) {
          // Whip back toward the post, then slump: draped from the post top, the free end on the ground.
          const e = R.e, free = 1 - e, s = h.s;
          const zf = h.zPost - s * (0.06 + 0.11 * h.W * free * (0.75 + 0.5 * R.jag));
          const drape = Math.pow(e, 1.6);
          const yf = net.g + 0.04 + (R.y - net.g) * drape * 0.92 + 0.03 * R.jag * free;
          const xf = net.X + 0.12 + free * (0.15 + 0.9 * R.v * (0.7 + 0.6 * R.jag)) * (1 - drape);
          const kz = Math.exp(-tau / 0.13) * Math.cos(tau * 13);            // elastic recoil with overshoot
          const kx = Math.exp(-tau / 0.18) * Math.cos(tau * 11);
          const lash = 0.35 * free * free * Math.exp(-tau / 0.12) * Math.sin(tau * 40 + R.j * 0.5);  // the free end flails
          const fall = 4.9 * tau * tau * (0.6 + 0.4 * free);
          const y = Math.max(yf, P0.y - fall) + 0.05 * Math.exp(-tau / 0.25) * Math.sin(tau * 18) * free;
          tmp.set(xf + (P0.x - xf) * kx + lash, Math.max(net.g + 0.03, y), zf + (P0.z - zf) * kz);
        } else tmp.copy(P0);
        h.pts[n].copy(tmp);
        pos[n * 3] = tmp.x; pos[n * 3 + 1] = tmp.y; pos[n * 3 + 2] = tmp.z;
      });
      h.mesh.geometry.attributes.position.needsUpdate = true;
      h.mesh.geometry.computeVertexNormals();
      const nz = h.nz, topRow = h.pts.slice(ny * (nz + 1), (ny + 1) * (nz + 1)), botRow = h.pts.slice(0, nz + 1);
      writeRope(h.rope.geometry, topRow, 0.022, 0); writeRope(h.rope.geometry, botRow, 0.026, nz + 1);
      h.rope.geometry.attributes.position.needsUpdate = h.rope.geometry.attributes.normal.needsUpdate = true;
      for (const f of h.fl) {
        if (torn && f.loose) { floats.setMatrixAt(fi++, hidden); continue; }
        const u = f.u * nz, i = Math.min(nz - 1, Math.floor(u)), a = topRow[i], b = topRow[i + 1], w = u - i;
        tmp.lerpVectors(a, b, w); tmp.y += 0.03;
        _t.subVectors(b, a); if (_t.lengthSq() < 1e-10) _t.set(0, 0, 1);
        fq.setFromUnitVectors(zAxis, _t.normalize()); fs.setScalar(1);
        fm.compose(tmp, fq, fs); floats.setMatrixAt(fi++, fm);
      }
    }
    // The burst: loose corks, cord ends and fibres.
    let ci = net.k * (CORDS + FIBRES);
    const k0 = Math.min(Math.round(DEBRIS_T * DEBRIS_HZ) - 1, Math.max(0, Math.floor(tau * DEBRIS_HZ))), wk = Math.min(1, Math.max(0, tau * DEBRIS_HZ - k0));
    for (const d of net.debris || []) {
      const isFloat = d.type === 'float';
      if (!torn) { if (!isFloat) cords.setMatrixAt(ci++, hidden); continue; }
      const a = k0 * 3, b = a + 3;
      dp.set(d.pos[a] + (d.pos[b] - d.pos[a]) * wk, d.pos[a + 1] + (d.pos[b + 1] - d.pos[a + 1]) * wk, d.pos[a + 2] + (d.pos[b + 2] - d.pos[a + 2]) * wk);
      const sp = Math.min(tau, d.rest);
      fe.set(d.tilt + d.spin.x * sp, d.spin.y * sp, d.spin.z * sp); fq.setFromEuler(fe);
      if (isFloat) { fs.setScalar(1); fm.compose(dp, fq, fs); if (fi < (net.k + 1) * perNet) floats.setMatrixAt(fi++, fm); }
      else {
        const fade = d.type === 'fibre' ? Math.max(0, 1 - Math.max(0, tau - 0.5) / 0.6) : 1;
        fs.set(fade, d.len * fade, fade); fm.compose(dp, fq, fs); cords.setMatrixAt(ci++, fm);
      }
    }
    while (fi < (net.k + 1) * perNet) floats.setMatrixAt(fi++, hidden);
    floats.instanceMatrix.needsUpdate = true; cords.instanceMatrix.needsUpdate = true;
    net.settled = torn && tau > DEBRIS_T + 0.2;
  }

  return {
    nets,
    // Called once per race: who breaks which net, who gets caught and when.
    onRace({views = [], netEvents = []} = {}) {
      for (const net of nets) {
        const ev = netEvents.find(e => e.net === net.k);
        net.open = ev ? ev.t : Infinity;
        net.opener = ev ? views[ev.team] : null;
        net.pushers = [];
        net.snap = ev ? ev.t + 0.02 : Infinity;            // ropes part at the game's NET OPEN time
        if (net.opener) net.pushers.push({view: net.opener, from: net.open - 0.6, to: net.snap + 1});
        for (const v of views) for (const e of v.result.events) if (e.type === 'CAUGHT' && e.net === net.k) {
          const rel = v.result.events.find(r2 => r2.type === 'RELEASED' && r2.net === net.k);
          net.pushers.push({view: v, from: e.t - 0.6, to: rel ? Math.max(rel.t, net.snap) + 1 : Infinity, caught: e.t});
        }
        buildHalves(net, net.opener ? net.opener.lane : 0.35);
        net.debris = net.opener ? simulateDebris(net) : [];
      }
    },
    update(t, camera) {
      for (const net of nets) {
        if (camera && camera.position.distanceTo(tmp.set(net.X, net.g, 0)) > 450 && !Number.isNaN(net.lastT)) continue;
        if (t === net.lastT) continue;
        net.lastT = t;
        updateNet(net, t);
      }
    },
    isOpen: (k, t) => t >= nets[k].snap,
  };
}
