// Carmel's own canvas textures: storybook cottage walls, wavy shingles,
// Carmel stone, gallery signs, the inspection tent and placards.
import * as THREE from 'three';
import {rng} from '../../noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, {repeat = true, srgb = true} = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function grain(ctx, w, h, n, seed, light = 'rgba(255,250,240,.06)', dark = 'rgba(60,45,30,.07)') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { ctx.fillStyle = r() < 0.5 ? light : dark; const s = 1 + r() * 3; ctx.fillRect(r() * w, r() * h, s, s); }
}

// Stucco: near-white so each cottage can tint it with vertex colours.
function stucco(ctx, x, y, w, h, seed) {
  ctx.fillStyle = '#f3efe6'; ctx.fillRect(x, y, w, h);
  const r = rng(seed);
  for (let i = 0; i < 40; i++) { // soft trowel clouds
    const cx = x + r() * w, cy = y + r() * h, rad = 10 + r() * 40, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, r() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(170,150,120,.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  grain(ctx, w, h, 1400, seed + 3); ctx.restore();
}

function timber(ctx, x0, y0, x1, y1, width, seed) { // a beam from (x0,y0) to (x1,y1)
  const r = rng(seed), a = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(a);
  ctx.fillStyle = '#4a3322'; ctx.fillRect(0, -width / 2, len, width);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '25,15,8' : '110,80,55'},.35)`; ctx.fillRect(0, -width / 2 + r() * width, len, 1 + r()); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, width / 2 - 2, len, 2);
  ctx.restore();
}

function stoneBlocks(ctx, x, y, w, h, seed, {size = 26, base = [176, 160, 138]} = {}) {
  const r = rng(seed);
  ctx.fillStyle = '#8a7e70'; ctx.fillRect(x, y, w, h);
  for (let row = y; row < y + h; row += size * (0.7 + r() * 0.4)) {
    const rh = size * (0.65 + r() * 0.45);
    for (let col = x - r() * size; col < x + w; ) {
      const cw = size * (0.9 + r() * 1.3), k = 0.75 + r() * 0.4, tone = r();
      const cr = base[0] * k + (tone > 0.7 ? 20 : 0), cg = base[1] * k, cb = base[2] * k - (tone > 0.7 ? 12 : 0);
      ctx.fillStyle = rgba(cr, cg, cb);
      ctx.beginPath(); ctx.roundRect(col + 1.5, row + 1.5, cw - 3, rh - 3, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,245,225,.18)'; ctx.fillRect(col + 3, row + 2, cw - 8, 2);
      ctx.fillStyle = 'rgba(40,30,20,.22)'; ctx.fillRect(col + 3, row + rh - 4, cw - 6, 2);
      col += cw;
    }
  }
}

function windowPane(ctx, x, y, w, h, {arch = false, leaded = false, shutters = null, seed = 1}) {
  const r = rng(seed);
  // stone or timber surround
  ctx.fillStyle = '#5b4030';
  ctx.beginPath();
  if (arch) { ctx.moveTo(x - 7, y + h + 7); ctx.lineTo(x - 7, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2 + 7, Math.PI, 0); ctx.lineTo(x + w + 7, y + h + 7); }
  else ctx.rect(x - 7, y - 7, w + 14, h + 14);
  ctx.fill();
  // glass: sky reflection gradient
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, '#9fb6c4'); g.addColorStop(0.45, '#4b5d69'); g.addColorStop(1, '#27323a');
  ctx.fillStyle = g; ctx.beginPath();
  if (arch) { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.save(); ctx.clip();
  // warm interior glow + curtain
  const gl = ctx.createRadialGradient(x + w * 0.6, y + h * 0.75, 2, x + w * 0.6, y + h * 0.75, w * 0.7);
  gl.addColorStop(0, 'rgba(255,190,110,.35)'); gl.addColorStop(1, 'rgba(255,190,110,0)'); ctx.fillStyle = gl; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(238,228,205,.55)'; ctx.fillRect(x, y, w * 0.18, h); ctx.fillRect(x + w * 0.82, y, w * 0.18, h);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h); ctx.lineTo(x + w * 0.75, y); ctx.stroke();
  if (leaded) {
    ctx.strokeStyle = 'rgba(40,40,40,.75)'; ctx.lineWidth = 1.6; const s = w / 5;
    for (let k = -h; k < w + h; k += s) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k - h, y + h); ctx.stroke(); }
  }
  ctx.restore();
  // frame and mullions
  ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 5;
  if (!arch) ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + w / 2, y + (arch ? w * 0.15 : 0)); ctx.lineTo(x + w / 2, y + h);
  if (!leaded) { ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); }
  ctx.stroke();
  // sill
  ctx.fillStyle = '#7d6a58'; ctx.fillRect(x - 12, y + h + 4, w + 24, 9);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 12, y + h + 13, w + 24, 4);
  if (shutters) for (const sx of [x - 12 - w * 0.42, x + w + 12]) {
    ctx.fillStyle = shutters; ctx.fillRect(sx, y - 4, w * 0.42, h + 8);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(sx + w * 0.42 * k / 4, y); ctx.lineTo(sx + w * 0.42 * k / 4, y + h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(sx, y - 4, 3, h + 8);
  }
  void r;
}

function archedDoor(ctx, x, y, w, h, seed, color = '#7a4c2c') {
  // stone arch surround
  ctx.fillStyle = '#9c8e7b'; ctx.beginPath(); ctx.moveTo(x - 14, y + h); ctx.lineTo(x - 14, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2 + 14, Math.PI, 0); ctx.lineTo(x + w + 14, y + h); ctx.fill();
  const r = rng(seed);
  for (let a = Math.PI; a <= 2 * Math.PI + 0.01; a += Math.PI / 7) { // voussoirs
    ctx.strokeStyle = 'rgba(60,50,40,.5)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x + w / 2 + Math.cos(a) * w / 2, y + w / 2 + Math.sin(a) * w / 2); ctx.lineTo(x + w / 2 + Math.cos(a) * (w / 2 + 14), y + w / 2 + Math.sin(a) * (w / 2 + 14)); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.save(); ctx.clip();
  for (let k = 0; k < 6; k++) { // planks
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,220,170' : '30,15,5'},${0.05 + r() * 0.1})`; ctx.fillRect(x + k * w / 6, y, w / 6, h);
    ctx.fillStyle = 'rgba(25,12,5,.55)'; ctx.fillRect(x + k * w / 6, y, 2, h);
  }
  ctx.fillStyle = '#2a2420'; for (const hy of [0.42, 0.82]) ctx.fillRect(x, y + h * hy, w * 0.7, 6); // strap hinges
  ctx.restore();
  // little round window and ring handle
  ctx.fillStyle = '#5c7380'; ctx.beginPath(); ctx.arc(x + w / 2, y + w * 0.55, w * 0.13, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w * 0.78, y + h * 0.6, 7, 0, 7); ctx.stroke();
  ctx.fillStyle = '#6d6256'; ctx.fillRect(x - 18, y + h - 6, w + 36, 8); // step
}

function timberFrame(ctx, x, y, w, h, seed, {braces = true} = {}) {
  const t = 14;
  timber(ctx, x, y + t / 2, x + w, y + t / 2, t, seed);
  timber(ctx, x, y + h - t / 2, x + w, y + h - t / 2, t, seed + 1);
  timber(ctx, x + t / 2, y, x + t / 2, y + h, t, seed + 2);
  timber(ctx, x + w - t / 2, y, x + w - t / 2, y + h, t, seed + 3);
  if (braces) { timber(ctx, x + 8, y + h * 0.55, x + w * 0.22, y + 8, 11, seed + 4); timber(ctx, x + w - 8, y + h * 0.55, x + w * 0.78, y + 8, 11, seed + 5); }
}

// Wall bays: 4 x 2 cells of 256 x 512 px; each cell is one 2.4 m x 3.1 m bay.
// Row 0: window A, leaded window B, arched door, gallery display window.
// Row 1: plain timbered wall, gable fill, gallery door, stone bay with window.
export const BAY = {winA: 0, winB: 1, door: 2, shop: 3, plain: 4, gable: 5, shopDoor: 6, stone: 7};
export const BAY_W = 2.4, BAY_H = 3.1;
// Window boxes sit under these windows (cell-relative u, v of the sill centre).
export const SILL = {0: [0.5, 0.39], 1: [0.5, 0.36], 7: [0.5, 0.40]};

export function bayAtlas() {
  const CW = 256, CH = 512, [c, ctx] = canvas(CW * 4, CH * 2);
  const cell = (i, draw) => { const x = (i % 4) * CW, y = Math.floor(i / 4) * CH; ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.clip(); draw(); ctx.restore(); };
  const plinth = s => { stoneBlocks(ctx, 0, CH - 46, CW, 46, s, {size: 20}); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, CH - 48, CW, 3); };
  cell(0, () => { stucco(ctx, 0, 0, CW, CH, 11); timberFrame(ctx, 0, 0, CW, CH, 12, {braces: false}); timber(ctx, 0, 150, CW, 150, 10, 13);
    windowPane(ctx, 72, 205, 112, 108, {shutters: '#5d7d6c', seed: 14}); plinth(15); });
  cell(1, () => { stucco(ctx, 0, 0, CW, CH, 21); stoneBlocks(ctx, 0, 330, CW, CH - 330, 22, {size: 24});
    windowPane(ctx, 78, 185, 100, 140, {arch: true, leaded: true, seed: 23}); timber(ctx, 0, 10, CW, 10, 18, 24); });
  cell(2, () => { stucco(ctx, 0, 0, CW, CH, 31); timberFrame(ctx, 0, 0, CW, CH, 32, {braces: true}); archedDoor(ctx, 70, 168, 116, 300, 33); plinth(34);
    ctx.fillStyle = '#2b2622'; ctx.fillRect(186 + 18, 230, 10, 22); ctx.fillStyle = '#ffd890'; ctx.fillRect(188 + 18, 236, 6, 10); });
  cell(3, () => { stucco(ctx, 0, 0, CW, CH, 41); ctx.fillStyle = '#2f4a3d'; ctx.fillRect(10, 110, CW - 20, CH - 150);
    const gx = 26, gy = 150, gw = CW - 52, gh = CH - 230, g = ctx.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, '#f6e2b8'); g.addColorStop(1, '#c79a5e'); ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, gh); // lit interior
    const r = rng(42), cols = ['#2e5d7a', '#c9583a', '#e2b33c', '#4f7d4a', '#7c4f8c', '#d77e5a', '#33424f'];
    for (let k = 0; k < 3; k++) { // paintings on the back wall
      const px = gx + 14 + k * (gw - 20) / 3, pw = (gw - 40) / 3, py = gy + 40 + r() * 30, ph = 60 + r() * 50;
      ctx.fillStyle = '#b8924e'; ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);
      const pg = ctx.createLinearGradient(px, py, px, py + ph); pg.addColorStop(0, cols[(r() * 7) | 0]); pg.addColorStop(0.55, cols[(r() * 7) | 0]); pg.addColorStop(1, cols[(r() * 7) | 0]);
      ctx.fillStyle = pg; ctx.fillRect(px, py, pw, ph);
    }
    ctx.fillStyle = 'rgba(80,60,40,.6)'; ctx.fillRect(gx, gy + gh - 40, gw, 40); // display plinth
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw * 0.5, gy); ctx.lineTo(gx + gw * 0.7, gy); ctx.lineTo(gx + gw * 0.2, gy + gh); ctx.fill();
    ctx.strokeStyle = '#2f4a3d'; ctx.lineWidth = 8; ctx.strokeRect(gx, gy, gw, gh); ctx.beginPath(); ctx.moveTo(CW / 2, gy); ctx.lineTo(CW / 2, gy + gh); ctx.stroke();
    ctx.fillStyle = '#2f4a3d'; ctx.fillRect(0, 60, CW, 50); ctx.fillStyle = '#d9b45a'; ctx.fillRect(0, 62, CW, 3); ctx.fillRect(0, 104, CW, 3); // fascia
    stoneBlocks(ctx, 0, CH - 40, CW, 40, 43, {size: 18}); });
  cell(4, () => { stucco(ctx, 0, 0, CW, CH, 51); timberFrame(ctx, 0, 0, CW, CH, 52); timber(ctx, CW / 2, 0, CW / 2, CH, 12, 53); timber(ctx, 0, 250, CW, 250, 10, 54); plinth(55); });
  cell(5, () => { stucco(ctx, 0, 0, CW, CH, 61);
    timber(ctx, CW / 2, 0, CW / 2, CH, 14, 62); timber(ctx, 0, CH - 8, CW, CH - 8, 16, 63);
    timber(ctx, 20, CH - 10, CW / 2 - 6, CH * 0.45, 11, 64); timber(ctx, CW - 20, CH - 10, CW / 2 + 6, CH * 0.45, 11, 65);
    timber(ctx, 0, CH * 0.62, CW, CH * 0.62, 10, 66);
    windowPane(ctx, CW / 2 - 30, CH * 0.25, 60, 70, {leaded: true, seed: 67}); });
  cell(6, () => { stucco(ctx, 0, 0, CW, CH, 71); ctx.fillStyle = '#2f4a3d'; ctx.fillRect(48, 140, 160, CH - 150);
    const g = ctx.createLinearGradient(0, 160, 0, CH); g.addColorStop(0, '#f2d9a8'); g.addColorStop(1, '#a87d4c'); ctx.fillStyle = g; ctx.fillRect(66, 200, 124, 200);
    ctx.fillStyle = '#6c8a96'; ctx.fillRect(66, 156, 124, 34); ctx.fillStyle = '#d9b45a'; ctx.fillRect(116, 300, 8, 30);
    ctx.fillStyle = '#2f4a3d'; ctx.fillRect(0, 60, CW, 50); ctx.fillStyle = '#d9b45a'; ctx.fillRect(0, 62, CW, 3); ctx.fillRect(0, 104, CW, 3);
    ctx.fillStyle = '#6d6256'; ctx.fillRect(36, CH - 14, 184, 14); });
  cell(7, () => { stoneBlocks(ctx, 0, 0, CW, CH, 81, {size: 30, base: [190, 172, 146]}); windowPane(ctx, 74, 190, 108, 112, {shutters: '#7a3b2e', seed: 82}); });
  return tex(c, {repeat: false});
}

// Cedar shingles laid in wavy, uneven courses (storybook roofs).
export function shingleTexture() {
  const N = 512, [c, ctx] = canvas(N, N), r = rng(91);
  ctx.fillStyle = '#3b3029'; ctx.fillRect(0, 0, N, N);
  const rows = 16, rh = N / rows;
  for (let row = 0; row < rows; row++) {
    for (let x = -20; x < N + 20; ) {
      const w = 14 + r() * 26, k = 0.7 + r() * 0.5, tone = r();
      const wave = Math.sin((x / N) * Math.PI * 4 + row * 0.7) * 3;
      const y = row * rh + wave;
      const cr = (tone > 0.85 ? 150 : 128) * k, cg = (tone > 0.85 ? 132 : 104) * k, cb = (tone > 0.85 ? 112 : 82) * k;
      ctx.fillStyle = rgba(cr, cg, cb);
      ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + w - 1, y); ctx.lineTo(x + w - 2, y + rh + 4); ctx.quadraticCurveTo(x + w / 2, y + rh + 7, x + 2, y + rh + 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,.10)'; ctx.fillRect(x + 2, y + rh * 0.55, w - 4, rh * 0.45);
      for (let g = 0; g < 3; g++) { ctx.fillStyle = 'rgba(30,20,12,.18)'; ctx.fillRect(x + 2 + r() * (w - 4), y + 2, 1, rh); }
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x + w - 1.5, y, 1.5, rh + 4);
      x += w;
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = 0; x < N; x += 4) ctx.fillRect(x, row * rh + Math.sin((x / N) * Math.PI * 4 + row * 0.7) * 3 - 1, 4, 3);
  }
  for (let i = 0; i < 70; i++) { // moss and lichen
    const x = r() * N, y = r() * N, s = 8 + r() * 30, g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(${r() < 0.5 ? '110,120,70' : '170,165,130'},.28)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return tex(c);
}

export function stoneTexture(seed = 101) {
  const N = 512, [c, ctx] = canvas(N, N);
  stoneBlocks(ctx, 0, 0, N, N, seed, {size: 46, base: [184, 168, 146]});
  grain(ctx, N, N, 3000, seed + 1, 'rgba(255,250,240,.08)', 'rgba(40,30,20,.1)');
  return tex(c);
}

// Light sand for the lane through the dunes: white Carmel sand with footprints.
export function sandTexture() {
  const N = 512, [c, ctx] = canvas(N, N), r = rng(111);
  ctx.fillStyle = '#efe7d8'; ctx.fillRect(0, 0, N, N);
  grain(ctx, N, N, 9000, 112, 'rgba(255,255,255,.35)', 'rgba(150,130,100,.18)');
  for (let i = 0; i < 260; i++) { // footprints, paw prints and ripples
    const x = r() * N, y = r() * N, s = 3 + r() * 6;
    ctx.fillStyle = 'rgba(150,130,105,.18)'; ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.6, r() * 3, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(190,170,140,.18)'; ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const y = r() * N; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= N; x += 16) ctx.lineTo(x, y + Math.sin(x / 30 + i) * 4); ctx.stroke(); }
  return tex(c);
}

// Hanging gallery and shop signs: 2 x 4 cells of 256 x 128.
export const SIGNS = ['GALLERY', 'FINE ART', 'PAINTINGS', 'BOOKS & TEA', 'CERAMICS', 'ANTIQUES', 'PHOTOGRAPHY', 'BAKERY'];
export function signAtlas() {
  const [c, ctx] = canvas(512, 512), bgs = ['#2f4a3d', '#6b2f2a', '#273f5c', '#5a4632', '#3e5a4a', '#7a5a2a', '#333a42', '#7d3b2e'];
  SIGNS.forEach((s, i) => {
    const x = (i % 2) * 256, y = Math.floor(i / 2) * 128;
    ctx.fillStyle = bgs[i]; ctx.beginPath(); ctx.roundRect(x + 6, y + 6, 244, 116, 22); ctx.fill();
    ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(x + 14, y + 14, 228, 100, 16); ctx.stroke();
    ctx.fillStyle = '#f3e3b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `italic bold ${s.length > 9 ? 30 : 38}px Georgia, "Times New Roman", serif`; ctx.fillText(s, x + 128, y + 66, 210);
  });
  return tex(c, {repeat: false});
}

// Striped tent canvas (for the inspection tent roof and valance).
export function stripeTexture(a = '#f4efe2', b = '#d9562f', n = 8) {
  const [c, ctx] = canvas(256, 64);
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * 256 / n, 0, 256 / n, 64); }
  grain(ctx, 256, 64, 400, 7);
  return tex(c);
}

export function bannerTexture(text, {bg = '#f4efe2', fg = '#2b2118', w = 1024, h = 160, font = 'bold 86px', stripe = '#d9562f'} = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(0, 0, w, h * 0.1); ctx.fillRect(0, h * 0.9, w, h * 0.1); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${font} Georgia, "Times New Roman", serif`;
  ctx.fillText(text, w / 2, h * 0.54, w - 40);
  grain(ctx, w, h, 800, 9);
  return tex(c, {repeat: false});
}

export function placardTexture(text, bg, fg = '#fff', {w = 256, h = 160, font = 'bold 110px'} = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = 10; ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${font} "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillText(text, w / 2, h / 2 + 6, w - 40);
  return tex(c, {repeat: false});
}

// Soft round sprite (camera flash, sun glints).
export function glowTexture() {
  const [c, ctx] = canvas(128, 128), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,250,235,.7)'); g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return tex(c, {repeat: false});
}

// Foam lines for the surf: white streaks with soft alpha, V runs toward the shore.
export function foamTexture() {
  const W = 512, H = 256, [c, ctx] = canvas(W, H), r = rng(121);
  ctx.clearRect(0, 0, W, H);
  for (const band of [0.12, 0.5, 0.82]) {
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = band * H + (r() - 0.5) * 18 + Math.sin(x / 40) * 6, w = 10 + r() * 50, h = 2 + r() * 5;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.55})`; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, 7); ctx.fill();
    }
  }
  return tex(c);
}
