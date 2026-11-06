// The garage: every pumpkin on a turntable, whole and cut away, with its build and result.
// Pumpkins are drawn at true relative size, so a 22 cm pumpkin looks small next to a 60 cm one.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as P from './physics.js';

const level = (nat, art) => art ? `artificial ${art}` : nat ? `natural ${nat}` : 'none';

// Fallback model if pumpkins.js has no buildPumpkinModel yet: a plain sphere in the variety colour.
function fallbackModel(p) {
  const g = new THREE.Group(), r = p.d / 200;
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({color: P.varietyOf(p).color, roughness: 0.6})));
  return g;
}

export async function openGarage({entries, results = [], rows = [], colors = [], trackName = ''}) {
  const mod = await import('./pumpkins.js');
  const build = (p, opts) => (mod.buildPumpkinModel ? mod.buildPumpkinModel(p, opts) : fallbackModel(p));

  let dlg = document.querySelector('#garage');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'garage'; dlg.className = 'garage';
    document.body.append(dlg);
  }
  dlg.innerHTML = `<header><div><div class="eyebrow">GARAGE${trackName ? ' · ' + trackName.toUpperCase() : ''}</div><h2>Meet the pumpkins</h2></div>
    <form method="dialog"><button>Close</button></form></header><div class="garage-grid"></div>`;
  const grid = dlg.querySelector('.garage-grid');

  // One small renderer draws every view, then each card copies its pixels.
  const SIZE = 300;
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const maxR = Math.max(...entries.map(p => p.d / 200));

  const cards = entries.map((p, i) => {
    const q = P.properties(p), v = P.varietyOf(p), r = results[i], row = rows[i];
    const card = document.createElement('article'); card.className = 'garage-card';
    card.style.setProperty('--team', colors[i] || '#e58b37');
    const status = !r ? '' : r.status === 'FINISHED' ? `${row?.place ? '#' + row.place + ' · ' : ''}${r.time.toFixed(2)} s` : r.status === 'DQ' ? 'Disqualified at inspection' : r.status === 'BROKEN' ? 'Broke' : (r.reason || 'Did not finish').toLowerCase();
    card.innerHTML = `<h3><i></i>${esc(p.name || 'Pumpkin ' + (i + 1))}</h3>
      <div class="views"><figure><canvas width="${SIZE}" height="${SIZE}"></canvas><figcaption>Outside</figcaption></figure>
      <figure><canvas width="${SIZE}" height="${SIZE}"></canvas><figcaption>Cutaway</figcaption></figure></div>
      <dl>
        <dt>Variety</dt><dd>${v.name} <small>${v.trait.toLowerCase()}</small></dd>
        <dt>Size</dt><dd>${p.d} cm · skin ${p.t} cm</dd>
        <dt>Shape</dt><dd>${p.s}% symmetric${p.s < 100 ? ' (lumpy)' : ''}</dd>
        <dt>Coat</dt><dd>${level(p.en, p.ea)}</dd>
        <dt>Core</dt><dd>${level(p.cn, p.ca)}</dd>
        <dt>Grooves</dt><dd>${level(p.gn, p.ga)}</dd>
        <dt>Mass</dt><dd>${q.mass.toFixed(1)} kg · spin factor ${q.inertia.toFixed(2)}</dd>
        <dt>Artificial</dt><dd>${q.artificial}</dd>
        ${status ? `<dt>${esc(trackName)}</dt><dd>${esc(status)}</dd>` : ''}
      </dl>`;
    grid.append(card);
    const [outside, cut] = card.querySelectorAll('canvas');
    // A tiny studio per view.
    const make = cutaway => {
      const scene = new THREE.Scene(); scene.environment = env;
      const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(1.5, 2.5, 2); key.castShadow = true;
      key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, {left: -1, right: 1, top: 1, bottom: -1});
      scene.add(key, new THREE.HemisphereLight(0xdfe8f5, 0x5a4a3a, 0.8));
      const floor = new THREE.Mesh(new THREE.CircleGeometry(maxR * 2.2, 48), new THREE.ShadowMaterial({opacity: 0.28}));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -p.d / 200; floor.receiveShadow = true;
      const turntable = new THREE.Group(); turntable.add(build(p, {cutaway}));
      turntable.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(floor, turntable);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
      // Same framing for every card, sized for the largest pumpkin, so sizes compare.
      const dist = maxR * 4.6, groundY = -p.d / 200 + maxR;
      camera.position.set(0, groundY + maxR * 0.9, dist); camera.lookAt(0, groundY - maxR * 0.15, 0);
      if (cutaway) { camera.position.set(0, groundY + maxR * 0.25, dist); camera.lookAt(0, groundY - maxR * 0.3, 0); }
      return {scene, camera, turntable, ctx: (cutaway ? cut : outside).getContext('2d'), cutaway};
    };
    return [make(false), make(true)];
  }).flat();

  let running = true, raf = 0, next = 0;
  const t0 = performance.now();
  const perFrame = Math.min(cards.length, 4); // a few views per frame keeps slower machines responsive
  const loop = now => {
    if (!running) return;
    const t = (now - t0) / 1000;
    for (let n = 0; n < perFrame; n++) {
      const c = cards[next]; next = (next + 1) % cards.length;
      // Whole pumpkin spins about the stem; the cutaway rocks gently to show depth.
      c.turntable.rotation.y = c.cutaway ? Math.sin(t * 0.6) * 0.35 : t * 0.6;
      renderer.render(c.scene, c.camera);
      c.ctx.clearRect(0, 0, SIZE, SIZE); c.ctx.drawImage(renderer.domElement, 0, 0);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.__garageOpen = true;
  dlg.addEventListener('close', () => {
    window.__garageOpen = false;
    running = false; cancelAnimationFrame(raf);
    for (const c of cards) c.scene.traverse(o => { o.geometry?.dispose(); if (o.material) [o.material].flat().forEach(m => m.dispose()); });
    env.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }, {once: true});
  dlg.showModal();
  return dlg;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
