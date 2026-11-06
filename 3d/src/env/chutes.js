// Rodeo-style start chutes shared by every track (first built for Salinas): one wooden stall per
// lane with a numbered gate that swings open at GO. They are rebuilt per race to match the number
// of pumpkins, and painted in each track's colours.
import * as THREE from 'three';
import {rng} from '../noise.js';
import {box, rod, merge, mesh} from './geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const GATE_X = 0.47, BACK_X = -2.5; // gate line just in front of the start; stalls run 3 m back

// Paint per track: [gate A, gate B], posts, and number plate colours.
const THEMES = {
  salinas: {gates: ['#ece6d8', '#a3352a'], posts: '#a3352a'},
  monterey: {gates: ['#eef0ec', '#24476b'], posts: '#24476b'},
  carmel: {gates: ['#efe8d6', '#5d7a5a'], posts: '#5d7a5a'},
  'big-sur': {gates: ['#d9c6a5', '#8a4b32'], posts: '#6b3f2a'},
};

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

function numberTexture(n, bg, fg) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = fg; g.stroke();
  g.fillStyle = fg; g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  return tex(c, {repeat: false});
}

// Light or dark text for a background colour.
const ink = hex => (new THREE.Color(hex).getHSL({}).l > 0.6 ? '#2a1c12' : '#f6efe0');

// Build the stalls for these lanes into a new group. Returns {group, update(t), dispose()}.
function buildChutes(course, lanes, paint, timber, {back = true} = {}) {
  const group = new THREE.Group();
  const ls = [...lanes].sort((a, b) => a - b), n = ls.length;
  const gap = n > 1 ? ls[1] - ls[0] : 1.15;
  const edges = n ? [ls[0] - gap / 2, ...ls.slice(1).map((l, i) => (ls[i] + l) / 2), ls[n - 1] + gap / 2] : [-0.6, 0.6];
  const XG = GATE_X, XB = BACK_X, y = x => course.roadY(x), half = course.roadHalf;
  const walls = [], posts = [];
  const plank = (x0, x1, z, h0, h, t = 0.05) => {
    const y0 = y(x0) + h0, y1 = y(x1) + h0, len = Math.hypot(x1 - x0, y1 - y0);
    walls.push(box((x0 + x1) / 2, (y0 + y1) / 2 + h / 2, z, len, h, t, Math.atan2(y1 - y0, x1 - x0)));
  };
  // Dividers between stalls, solid walls on the outer sides, a cap rail on each.
  edges.forEach((z, i) => {
    const outer = i === 0 || i === edges.length - 1;
    for (const h of outer ? [0.04, 0.3, 0.56, 0.82] : [0.12, 0.47, 0.82]) plank(XB, XG - 0.06, z, h, outer ? 0.25 : 0.17, outer ? 0.07 : 0.05);
    plank(XB, XG - 0.06, z, 1.1, 0.06, 0.16);
    for (const x of [XB, (XB + XG) / 2, XG - 0.05]) posts.push(box(x, y(x) + 0.55, z, 0.11, 1.35, 0.11));
  });
  // Wing walls out to the track edges, and (optionally) rails across the back.
  for (const s of [-1, 1]) {
    const zIn = s < 0 ? edges[0] : edges[edges.length - 1], zOut = s * (half + 0.5);
    if (Math.abs(zOut) - Math.abs(zIn) > 0.1) {
      for (const h of [0.04, 0.32, 0.6, 0.88]) walls.push(box(XG - 0.02, y(XG) + h + 0.13, (zIn + zOut) / 2, 0.07, 0.26, Math.abs(zOut - zIn)));
      posts.push(box(XG - 0.02, y(XG) + 0.62, zOut, 0.16, 1.5, 0.16));
    }
  }
  if (back) for (const h of [0.15, 0.55]) walls.push(box(XB - 0.04, y(XB) + h + 0.1, (edges[0] + edges.at(-1)) / 2, 0.06, 0.2, edges.at(-1) - edges[0]));
  group.add(mesh(merge(walls), timber), mesh(merge(posts), paint.post));

  // Gates: hinged on their -z post, swing toward +x (down the course) at GO.
  const gates = [], owned = [];
  ls.forEach((lane, i) => {
    const z0 = edges[i] + 0.035, w = edges[i + 1] - edges[i] - 0.07;
    const g = new THREE.Group(), m = paint.gates[i % 2], parts = [];
    for (const h of [0.14, 0.5, 0.86]) parts.push(box(0, h, w / 2, 0.045, 0.13, w));
    parts.push(box(0, 0.5, 0.03, 0.06, 0.95, 0.06), box(0, 0.5, w - 0.03, 0.06, 0.95, 0.06));
    g.add(mesh(merge([...parts, rod(V(0, 0.16, 0.06), V(0, 0.84, w - 0.06), 0.022, 5)]), m));
    const bg = paint.colors[(i + 1) % 2], plateMat = new THREE.MeshStandardMaterial({map: numberTexture(i + 1, bg, ink(bg)), roughness: 0.7});
    owned.push(plateMat);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), plateMat);
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
      group.traverse(o => o.geometry?.dispose());
      for (const m of owned) { m.map?.dispose(); m.dispose(); }
    },
  };
}

// Start chutes for a course, in its colours. They start with four lanes and are rebuilt for
// each race by main.js (course.startChutes.rebuild(lanes)). Returns {update(t), rebuild(lanes)}.
export function startChutes(parent, course, mats, {back = true, theme} = {}) {
  const th = theme || THEMES[course.id] || THEMES.salinas;
  const paint = {
    colors: th.gates,
    gates: th.gates.map((c, i) => new THREE.MeshStandardMaterial({map: paintTexture(c, 3 + i * 4), roughness: 0.8})),
    post: new THREE.MeshStandardMaterial({map: paintTexture(th.posts, 7), roughness: 0.82}),
  };
  let built = null, t = -10;
  const api = {
    rebuild(lanes) {
      built?.dispose();
      built = buildChutes(course, lanes, paint, mats.timber, {back});
      parent.add(built.group);
      built.update(t);
    },
    update(time) { t = time; built?.update(time); },
  };
  api.rebuild([-2.4, -0.8, 0.8, 2.4]);
  course.startChutes = api;
  return api;
}
