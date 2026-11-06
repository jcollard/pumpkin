// Procedural textures drawn on canvases: no image files to download or license.
import * as THREE from 'three';
import {rng} from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, {repeat = true, srgb = true, aniso = 8} = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Tileable value noise on an integer lattice of the given period.
function periodicNoise(period, seed) {
  const r = rng(seed), grid = Array.from({length: period * period}, r);
  const at = (i, j) => grid[((j % period + period) % period) * period + ((i % period + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function speckle(ctx, w, h, count, colors, size, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    const s = size * (0.4 + r());
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

// Packed-earth race track. U runs along the track, V across it.
export function dirtTrackTexture({pebbles = 2600, scuffs = 70} = {}) {
  const W = 1024, H = 512, [c, ctx] = canvas(W, H), img = ctx.createImageData(W, H);
  const n1 = periodicNoise(16, 41), n2 = periodicNoise(64, 42), n3 = periodicNoise(8, 43);
  const base = [154, 118, 80], loose = [104, 76, 50], grass = [112, 110, 62];
  for (let y = 0; y < H; y++) {
    const v = y / H, edge = Math.min(v, 1 - v);               // 0 at the edges, 0.5 in the middle
    const packed = Math.min(1, edge / 0.22);                   // compacted racing line in the middle
    const rut = 0.5 + 0.5 * Math.cos((v - 0.5) * Math.PI * 4); // two worn racing lines
    for (let x = 0; x < W; x++) {
      const a = n1(x / 64, y / 64), b = n2(x / 16, y / 16), d = n3(x / 128, y / 32);
      let r = loose[0] + (base[0] - loose[0]) * packed, g = loose[1] + (base[1] - loose[1]) * packed, bl = loose[2] + (base[2] - loose[2]) * packed;
      const k = 0.76 + 0.32 * a + 0.16 * b - 0.04 * rut * packed * (0.5 + a) + 0.1 * d;
      r *= k; g *= k; bl *= k;
      const tuft = edge < 0.06 ? Math.max(0, (0.06 - edge) / 0.06) * (b > 0.45 ? 1 : 0.3) : 0; // grass creeping in
      r += (grass[0] - r) * tuft; g += (grass[1] - g) * tuft; bl += (grass[2] - bl) * tuft;
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(44);
  for (let i = 0; i < pebbles; i++) { // pebbles
    const x = r() * W, y = r() * H, s = 1 + r() * 3.2, l = 120 + r() * 100;
    ctx.fillStyle = `rgba(${l},${l * 0.92},${l * 0.82},${0.55 + r() * 0.4})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,28,18,.35)'; ctx.fillRect(x - s * 0.3, y + s * 0.5, s, 1);
  }
  for (let i = 0; i < scuffs; i++) { // damp patches and scuffs
    const x = r() * W, y = H * (0.15 + r() * 0.7), rx = 10 + r() * 60, ry = 6 + r() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(${r() < 0.5 ? '70,48,28' : '190,160,120'},${0.08 + r() * 0.12})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c);
}

// Timber kicker deck: rough planks laid across the track.
export function rampTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(3);
  for (let p = 0; p < 8; p++) { // planks run across the track (along V)
    const x0 = p * 64, tone = 0.8 + r() * 0.35;
    ctx.fillStyle = `rgb(${150 * tone},${108 * tone},${66 * tone})`; ctx.fillRect(x0, 0, 64, 512);
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(${70 + r() * 30},${45 + r() * 20},${25 + r() * 10},.35)`; ctx.lineWidth = 1 + r() * 1.5;
      const x = x0 + r() * 64; ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y / 60 + i) * 2.5, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,26,14,.8)'; ctx.fillRect(x0, 0, 3, 512);
    ctx.fillStyle = 'rgba(30,30,30,.7)'; for (const y of [40, 256, 472]) { ctx.beginPath(); ctx.arc(x0 + 14, y, 3, 0, 7); ctx.arc(x0 + 50, y, 3, 0, 7); ctx.fill(); }
  }
  return tex(c);
}

// Weathered wood for posts, rails, gantries and sign boards.
export function woodTexture(seed = 61, light = false) {
  const [c, ctx] = canvas(256, 256), r = rng(seed);
  ctx.fillStyle = light ? '#a88458' : '#6e5136'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${light ? 70 : 40},${light ? 50 : 28},${light ? 30 : 16},${0.2 + r() * 0.35})`; ctx.lineWidth = 1 + r() * 2.5;
    const x = r() * 256; ctx.beginPath(); ctx.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y / 40 + i) * 3, y);
    ctx.stroke();
  }
  speckle(ctx, 256, 256, 900, ['rgba(255,240,210,.08)', 'rgba(20,12,6,.18)'], 2, seed + 1);
  return tex(c);
}

// Straw bale side: dense fine stalks, soft contrast, two twine bands.
export function strawTexture() {
  const [c, ctx] = canvas(512, 256), r = rng(71);
  ctx.fillStyle = '#bf9a52'; ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 5200; i++) {
    const x = r() * 512, y = r() * 256, a = (r() - 0.5) * 0.7, l = 10 + r() * 34, t = r();
    ctx.strokeStyle = t < 0.45 ? `rgba(226,196,120,${0.35 + r() * 0.4})` : t < 0.85 ? `rgba(150,112,52,${0.25 + r() * 0.35})` : `rgba(240,220,160,${0.4 + r() * 0.3})`;
    ctx.lineWidth = 0.8 + r() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(60,40,10,.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,10,.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  for (const x of [128, 384]) { ctx.fillStyle = 'rgba(110,80,40,.9)'; ctx.fillRect(x - 3, 0, 6, 256); ctx.fillStyle = 'rgba(40,28,12,.35)'; ctx.fillRect(x + 3, 0, 3, 256); }
  return tex(c);
}

// Chalk line on dirt: powdery white with ragged edges, transparent around it.
export function chalkTexture() {
  const [c, ctx] = canvas(64, 512), r = rng(81);
  for (let i = 0; i < 2600; i++) {
    const y = r() * 512, x = 32 + (r() + r() + r() - 1.5) * 15;
    ctx.fillStyle = `rgba(245,242,232,${0.35 + r() * 0.6})`; ctx.fillRect(x, y, 1.5 + r() * 2.5, 1.5 + r() * 2.5);
  }
  return tex(c, {repeat: false});
}

export function concreteTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#d8d1c3'; ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 512, 9000, ['#cfc7b8', '#e2dccf', '#c4bcad', '#bdb4a3'], 2, 11);
  const r = rng(12);
  for (let i = 0; i < 30; i++) { // weather stains
    const x = r() * 512, w = 6 + r() * 30, g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(120,110,95,0)'); g.addColorStop(0.3 + r() * 0.4, 'rgba(120,110,95,.18)'); g.addColorStop(1, 'rgba(120,110,95,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, w, 512);
  }
  ctx.strokeStyle = 'rgba(110,100,85,.35)'; ctx.lineWidth = 2;
  for (let y = 0; y <= 512; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  return tex(c);
}

// Greyscale detail multiplied over terrain vertex colours.
export function groundDetailTexture() {
  const [c, ctx] = canvas(512, 512), img = ctx.createImageData(512, 512);
  const n1 = periodicNoise(16, 21), n2 = periodicNoise(64, 22), n3 = periodicNoise(128, 23);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const v = 0.55 * n1(x / 32, y / 32) + 0.3 * n2(x / 8, y / 8) + 0.15 * n3(x / 4, y / 4);
    const g = 150 + v * 105, i = (y * 512 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

// Tileable water normal map for the Pacific.
export function waterNormals() {
  const N = 256, [c, ctx] = canvas(N, N), img = ctx.createImageData(N, N);
  const a = periodicNoise(8, 31), b = periodicNoise(16, 32), d = periodicNoise(32, 33);
  const height = (x, y) => 0.5 * a(x * 8 / N, y * 8 / N) + 0.3 * b(x * 16 / N, y * 16 / N) + 0.2 * d(x * 32 / N, y * 32 / N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * 6, dy = (height(x, y + 1) - height(x, y - 1)) * 6;
    const len = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / len * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, {srgb: false});
}

// Soft cloud puff for the marine layer.
export function cloudTexture(seed = 5) {
  const N = 256, [c, ctx] = canvas(N, N), img = ctx.createImageData(N, N), n = periodicNoise(8, seed), m = periodicNoise(16, seed + 1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2), r = Math.hypot(dx * 0.8, dy * 1.4);
    const v = 0.6 * n(x / 32, y / 32) + 0.4 * m(x / 16, y / 16);
    const alpha = Math.max(0, 1 - r) ** 1.5 * Math.min(1, Math.max(0, v * 1.6 - 0.25));
    const i = (y * N + x) * 4;
    img.data[i] = 250; img.data[i + 1] = 247; img.data[i + 2] = 242; img.data[i + 3] = alpha * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, {repeat: false});
}

// Checkered finish banner: a row of checks top and bottom, text in the middle.
export function checkerTexture(text = 'FINISH') {
  const [c, ctx] = canvas(1024, 160);
  ctx.fillStyle = '#f5f2ea'; ctx.fillRect(0, 0, 1024, 160);
  for (let x = 0; x < 32; x++) {
    ctx.fillStyle = '#111';
    ctx.fillRect(x * 32, x % 2 ? 0 : 128, 32, 32);
  }
  ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 84px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 82);
  return tex(c, {repeat: false});
}

// Painted plank sign. Defaults to cream lettering on dark weathered boards.
export function signTexture(lines, {bg = '#5b412b', fg = '#f1e6cc', border = '#3a2a1b', w = 512, h = 256, font = 'bold 64px', planks = true} = {}) {
  const [c, ctx] = canvas(w, h), r = rng(w + h + lines.length);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (planks) {
    const rows = Math.max(2, Math.round(h / 80));
    for (let i = 0; i < rows; i++) {
      const y0 = i * h / rows;
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,235,200' : '20,12,6'},${0.05 + r() * 0.08})`; ctx.fillRect(0, y0, w, h / rows);
      for (let k = 0; k < 18; k++) { ctx.strokeStyle = `rgba(25,15,8,${0.15 + r() * 0.2})`; ctx.lineWidth = 1 + r() * 2; const y = y0 + r() * h / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w / 3, y + 3, w * 2 / 3, y - 3, w, y + r() * 2); ctx.stroke(); }
      ctx.fillStyle = 'rgba(15,9,4,.75)'; ctx.fillRect(0, y0, w, 3);
    }
  }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const f = typeof line === 'object' ? line.font : font, t = typeof line === 'object' ? line.text : line;
    ctx.font = `${f} Georgia, "Times New Roman", serif`;
    ctx.fillText(t, w / 2, h * (i + 1) / (lines.length + 1), w - 40);
  });
  // Weathering: flecks of missing paint.
  for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(60,40,24,${0.25 + r() * 0.4})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2); }
  return tex(c, {repeat: false});
}

// Name tag shown above each pumpkin.
export function labelTexture(name, color) {
  const [c, ctx] = canvas(512, 96);
  ctx.font = '600 40px "IBM Plex Mono", ui-monospace, monospace';
  const w = Math.min(500, ctx.measureText(name).width + 70);
  const x0 = (512 - w) / 2;
  ctx.fillStyle = 'rgba(18,24,22,.78)'; ctx.beginPath(); ctx.roundRect(x0, 14, w, 64, 32); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + 34, 46, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(name, x0 + 56, 48, w - 66);
  return tex(c, {repeat: false});
}

// Live timing board face; redraw with drawBoard().
export function timingBoard() {
  const [c, ctx] = canvas(512, 128), t = tex(c, {repeat: false});
  t.draw = (time, leader) => {
    ctx.fillStyle = '#101312'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffb648'; ctx.font = 'bold 70px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(time.toFixed(2), 490, 56);
    ctx.fillStyle = '#d7d2c4'; ctx.font = '600 22px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText(leader.slice(0, 22), 20, 108);
    ctx.fillStyle = '#5ad37a'; ctx.fillRect(20, 30, 14, 14);
    t.needsUpdate = true;
  };
  t.draw(0, '');
  return t;
}

// Pumpkin skin: fine speckle and blemishes, multiplied with the variety colour.
export function skinTexture(seed) {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 256);
  speckle(ctx, 512, 256, 5000, ['#f1ece4', '#e6ddd0', '#fbf8f2', '#ddd2c2'], 2, seed);
  const r = rng(seed + 1);
  for (let i = 0; i < 26; i++) {
    const x = r() * 512, y = 30 + r() * 196, s = 3 + r() * 9;
    ctx.fillStyle = `rgba(150,120,80,${0.15 + r() * 0.25})`; ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.6 + r()), r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // Vertical streaks along the ribs.
  for (let i = 0; i < 90; i++) {
    const x = r() * 512; ctx.strokeStyle = `rgba(160,140,110,${0.08 + r() * 0.12})`; ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 6, 80, x - 6, 170, x, 256); ctx.stroke();
  }
  return tex(c);
}

// --- Foliage -----------------------------------------------------------------
// One 1024² atlas, four 512² cells with alpha, drawn leaf by leaf:
//   0 broad (oak, shrubs) · 1 scale (cypress) · 2 needle sprays (redwood, pine) · 3 eucalyptus.
// Colours are mid-greens close to white-balanced so instance/vertex colours tint them.
export const FOLIAGE_CELLS = {broad: 0, scale: 1, needle: 2, euc: 3, sage: 0};
let foliageAtlasTex = null;
// Mean colour (linear) of each cell, measured from the baked atlas.
const FOLIAGE_MEANS = [[0.10722, 0.21483, 0.03951], [0.04183, 0.12725, 0.02954], [0.06194, 0.16541, 0.03313], [0.11553, 0.22495, 0.17597]];
// The atlas is pre-baked to assets/shared/foliage_atlas.webp (drawing it takes ~2 s);
// if that file is missing it is drawn here instead.
export function foliageAtlas() {
  if (foliageAtlasTex) return foliageAtlasTex;
  foliageAtlasTex = new THREE.TextureLoader().load('assets/shared/foliage_atlas.webp', undefined, undefined, () => {
    foliageAtlasTex.image = foliageAtlasCanvas(); foliageAtlasTex.needsUpdate = true;
  });
  foliageAtlasTex.colorSpace = THREE.SRGBColorSpace; foliageAtlasTex.anisotropy = 8;
  foliageAtlasTex.premultiplyAlpha = false;
  return foliageAtlasTex;
}
export function foliageAtlasCanvas() {
  const N = 512, [c, ctx] = canvas(N * 2, N * 2);
  ctx.clearRect(0, 0, N * 2, N * 2);
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // Ragged clump mask: radius varies with angle.
  const blobR = (r, k) => { const ph = [r() * 6, r() * 6, r() * 6]; return a => k * (0.82 + 0.1 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.05 * Math.sin(9 * a + ph[2])); };
  const inside = (x, y, cx, cy, R) => { const a = Math.atan2(y - cy, x - cx); return Math.hypot(x - cx, y - cy) < R(a); };
  const fillBlob = (cx, cy, R, k, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, d = R(a) * k; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95); }
    ctx.fill();
  };
  const twig = (x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * 0.1, (y0 + y1) / 2, x1, y1); ctx.stroke(); };

  // Cell 0: broad leaves on twigs (oak / scrub).
  {
    const r = rng(501), ox = 0, oy = 0, cx = ox + N / 2, cy = oy + N * 0.47, R = blobR(r, N * 0.46);
    fillBlob(cx, cy, R, 0.78, 'rgb(38,48,24)');
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.6; twig(cx, oy + N * 0.98, cx + Math.cos(a) * N * 0.36, cy + Math.sin(a) * N * 0.3, 3 + r() * 3, 'rgba(70,55,40,1)'); }
    for (let i = 0; i < 2600; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * N * 0.47, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.95;
      if (!inside(x, y, cx, cy, R)) continue;
      const top = 1 - (y - oy) / N, L = 13 + r() * 13, W = L * (0.42 + r() * 0.18), ang = r() * Math.PI * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.fillStyle = hsl(78 + r() * 26, 30 + r() * 22, 22 + top * 22 + r() * 14);
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -W, L / 2, 0); ctx.quadraticCurveTo(0, W, -L / 2, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,10,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(230,240,190,.18)'; ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
      ctx.restore();
    }
  }
  // Cell 1: dense scale-like cypress foliage in tufts.
  {
    const r = rng(502), ox = N, oy = 0, cx = ox + N / 2, cy = oy + N * 0.5, R = blobR(r, N * 0.47);
    fillBlob(cx, cy, R, 0.8, 'rgb(30,42,24)');
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 3; twig(cx, oy + N * 0.95, cx + Math.cos(a) * N * 0.34, cy + Math.sin(a) * N * 0.3, 3 + r() * 2, 'rgba(60,45,35,1)'); }
    for (let k = 0; k < 70; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * N * 0.4, tx = cx + Math.cos(a) * d, ty = cy + Math.sin(a) * d;
      const tr = 22 + r() * 34, top = 1 - (ty - oy) / N;
      for (let i = 0; i < 160; i++) {
        const b = r() * Math.PI * 2, e = Math.sqrt(r()) * tr, x = tx + Math.cos(b) * e, y = ty + Math.sin(b) * e * 0.8;
        if (!inside(x, y, cx, cy, R)) continue;
        const s = 2.2 + r() * 3.6, rim = e / tr;
        ctx.fillStyle = hsl(95 + r() * 30, 26 + r() * 20, 16 + top * 14 + (1 - rim) * 12 + r() * 10);
        ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // Cell 2: drooping needle sprays (redwood, pine).
  {
    const r = rng(503), ox = 0, oy = N;
    for (let k = 0; k < 15; k++) {
      let x = ox + N * (0.22 + r() * 0.56), y = oy + N * (0.12 + r() * 0.22), ang = Math.PI / 2 + (r() - 0.5) * 1.3;
      const len = N * (0.4 + r() * 0.35), steps = 26, top = 1 - (y - oy) / N;
      for (let i = 0; i < steps; i++) {
        const nx = x + Math.cos(ang) * len / steps, ny = y + Math.sin(ang) * len / steps;
        twig(x, y, nx, ny, 22 * Math.sin(Math.PI * (i + 1) / (steps + 1)) + 2, 'rgb(34,46,26)');
        twig(x, y, nx, ny, 2.2 * (1 - i / steps) + 0.6, 'rgba(80,60,40,1)');
        const nl = 16 + 12 * Math.sin(Math.PI * i / steps) + r() * 6;
        for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) {
          const na = ang + sd * (0.9 + r() * 0.5), px = x + (nx - x) * j / 3, py = y + (ny - y) * j / 3;
          ctx.strokeStyle = hsl(88 + r() * 28, 30 + r() * 18, 18 + top * 14 + r() * 16); ctx.lineWidth = 1.6 + r() * 1.2;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl + nl * 0.25); ctx.stroke();
        }
        x = nx; y = ny; ang += (r() - 0.5) * 0.12 + 0.012;
        if (x < ox + 20 || x > ox + N - 20 || y > oy + N - 20) break;
      }
    }
  }
  // Cell 3: eucalyptus, long sickle leaves hanging from twigs.
  {
    const r = rng(504), ox = N, oy = N;
    for (let k = 0; k < 9; k++) {
      const x0 = ox + N * (0.15 + r() * 0.7), y0 = oy + N * (0.06 + r() * 0.2), x1 = x0 + (r() - 0.5) * N * 0.5, y1 = y0 + N * (0.3 + r() * 0.3);
      twig(x0, y0, x1, y1, 2.5, 'rgba(120,95,80,1)');
      for (let i = 0; i < 38; i++) {
        const t = r(), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, L = 46 + r() * 34, W = 7 + r() * 5, ang = Math.PI / 2 + (r() - 0.5) * 1.2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = hsl(140 + r() * 40, 12 + r() * 14, 34 + r() * 16);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.45, -W, L, W * 0.6); ctx.quadraticCurveTo(L * 0.45, W * 0.8, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(240,235,200,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.45, 0, L, W * 0.6); ctx.stroke();
        ctx.restore();
      }
    }
  }
  // Mean colour of the opaque texels per cell (linear), so tints can be normalised.
  foliageMeans.length = 0;
  for (let k = 0; k < 4; k++) {
    const d = ctx.getImageData((k % 2) * N, (k >> 1) * N, N, N).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    foliageMeans.push(new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace));
  }
  return c;
}
const foliageMeans = [];
export function foliageCellMean(cell) {
  if (!foliageMeans.length) FOLIAGE_MEANS.forEach(m => foliageMeans.push(new THREE.Color(...m)));
  return foliageMeans[cell] ?? new THREE.Color(0.2, 0.3, 0.1);
}
