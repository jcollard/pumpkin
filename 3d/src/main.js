// PUMPKIN 3D — race viewer for every track in the game.
// Runs the original game's simulation (physics.js, unchanged) and plays the
// results back in 3D. All race outcomes come from the game's own code.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import * as P from './physics.js';
import {TRACK_IDS, loadTrack} from './tracks/index.js';
import {buildSkySea, buildTerrain} from './env/world.js';
import {PumpkinView, TEAM_COLORS} from './pumpkins.js';
import {Director, planShots, COMMON_CAMS} from './director.js';
import {createPips} from './pip.js';
import {createInspectionPopup} from './inspection-popup.js';
import {openGarage} from './garage.js';
import {createQuality, MODES} from './quality.js';
import {showChampion} from './finale.js';

// Four varied, deliberately non-optimal pumpkins: Rodeo Red (orange Howden, glossy), Bluebell (blue-grey
// Jarrahdale, lacquered; disqualified at Carmel), Crackerjack (lumpy, thin-skinned tan Provence that leads into
// the Big Sur jump and shatters on landing, and explodes on Monterey's first net) and Old Faithful (big natural Howden).
const DEFAULT_CODES = [
  'PL6.WyJSb2RlbyBSZWQiLDE0NjAsMCw1Myw5LDk0LDAsNywwLDUsMCwyLDEzLDgsNTQsMCw3LDAsNSwwLDJd.1gfaqvq',
  'PL6.WyJCbHVlYmVsbCIsNjExMzgsMSw0NSw3LDkyLDAsMTIsMCw0LDAsMCw1LDQsNTIsMCwxMiwwLDQsMCwwXQ.q0rd2s',
  'PL6.WyJDcmFja2VyamFjayIsMzI4MjUsMiw1MCwzLDk0LDAsMCwwLDUsMCwwLDEwLDQsNTQsMCwwLDAsNSwwLDBd.dwyw2n',
  'PL6.WyJPbGQgRmFpdGhmdWwiLDU1NDUwLDAsNTcsOSw5NCwzLDAsNCwwLDcsMCwxNyw4LDU0LDMsMCw0LDAsNywwXQ.1312ddw',
];
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.hash.slice(1));
// Lighter scenery is the default (fewer trees, coarser terrain); #quality=high or the setup checkbox turns it off.
const lowPref = localStorage.getItem('pumpkin3d-low2');
const LOW = params.get('quality') === 'high' ? false : params.get('quality') === 'low' || lowPref === null || lowPref === '1';

// --- Renderer (kept for the whole session); one scene per track ---
const renderer = new THREE.WebGLRenderer({canvas: $('#view'), antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture')});
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 60000);
const quality = createQuality(renderer, {onChange: () => refreshGfx()});
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; controls.enableDamping = true;

// Sound loads lazily; without it everything still works.
const silent = {start() {}, setTrack() {}, update() {}, play() {}, setMuted() {}, setVolume() {}, stopAll() {}, muted: false};
let audio = silent;
const audioReady = import('./audio.js').then(m => { audio = m.createAudio({hrtf: !LOW}); if (S.track) audio.setTrack(S.track.id, S.track.ambience); }).catch(e => console.warn('[audio] unavailable', e.message));
// Browsers only allow sound after a user gesture: start on the first click or key press.
const unlockAudio = () => { audioReady.then(() => audio.start?.()); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);

const pips = createPips($('#pips'));
const inspPop = createInspectionPopup($('#hud'), {
  // Like the game: nothing happens until Start Inspection, and the race waits after it until START RACE.
  onBegin: () => { S.inspectionStarted = true; S.playing = true; },
  onReveal: () => { S.inspectionStarted = true; if (S.inspection && S.simT < S.inspection.verdict) { S.simT = S.prevT = S.inspection.verdict; S.playing = true; if (S.director) S.director.cutPending = true; } },
  onStart: () => startAfterInspection(),
  onBack: () => { S.playing = false; openSetup(S.codes); },
});
function startAfterInspection() {
  if (!S.inspection) return;
  S.inspectionConfirmed = true; S.playing = true;
  if (S.simT < S.inspectionHold) { S.simT = S.prevT = S.inspectionHold; if (S.director) S.director.cutPending = true; }
}
const lowerThird = Object.assign(document.createElement('div'), {className: 'lowerthird', hidden: true});
$('#hud').append(lowerThird);

const S = { // everything that belongs to the current track and race
  scene: new THREE.Scene(), track: null, course: null, sky: null, env: null,
  views: [], director: null, plan: null, events: [], codes: [],
  simT: -3, prevT: -3, playing: true, userRate: 1, endT: 10, scrubbing: false, labelsOn: true, capturing: false,
  pipOn: localStorage.getItem('pumpkin3d-pip') ? localStorage.getItem('pumpkin3d-pip') === '1' : !LOW,
  results: null, rows: null, shownResults: false,
  mode: 'single', circuit: null, // circuit: {idx, races: [rows...], names}
};
let selected = params.get('circuit') === '1' ? 'circuit' : (params.get('track') || 'big-sur');

function disposeScene(scene) {
  scene.traverse(o => {
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
  scene.environment?.dispose();
}

async function setTrack(id) {
  $('#loading').hidden = false; $('#loading').textContent = 'Building the course…';
  // Stop updating and drawing the old race first: its scene is about to be disposed.
  const old = {scene: S.scene, views: S.views};
  Object.assign(S, {switching: true, director: null, views: [], env: null, plan: null, track: null});
  pips.hideAll(); inspPop.clear(); lowerThird.hidden = true; $('#results').hidden = true;
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  for (const v of old.views) v.dispose?.();
  disposeScene(old.scene);
  renderer.renderLists.dispose();
  const scene = new THREE.Scene();
  const track = await loadTrack(id);
  const course = track.createCourse();
  course.preroll = track.preroll ?? 5;
  const sky = buildSkySea(scene, renderer, course, {low: LOW});
  buildTerrain(scene, course, {low: LOW});
  const env = await track.build(scene, renderer, course, {low: LOW}); // may be async (models load first)
  renderer.toneMappingExposure = course.exposure ?? 0.62;
  // Quality knobs: shadows and sea reflections refresh on the quality step's schedule.
  sky.sun.shadow.autoUpdate = false; sky.sun.shadow.needsUpdate = true;
  if (sky.water?.onBeforeRender) {
    const mirror = sky.water.onBeforeRender;
    let first = true;
    sky.water.onBeforeRender = function (...a) { if (first || S.capturing || quality.reflectDue()) { first = false; mirror.apply(this, a); } };
  }
  Object.assign(S, {scene, track, course, sky, env, views: [], director: null, plan: null, switching: false});
  quality.settle(3);
  $('#brand-name').textContent = (track.name || course.name).toUpperCase();
  $('#brand-label').textContent = track.label || '';
  audio.stopAll?.();
  audio.setTrack(id, track.ambience);
  buildCamButtons();
  $('#loading').hidden = true;
}

function laneOffsets(n, half) {
  const gap = Math.min(1.6, (half * 2 - 1.2) / Math.max(1, n)); // 4 pumpkins: 1.6 m apart
  return Array.from({length: n}, (_, i) => (i - (n - 1) / 2) * gap);
}

// Run the race exactly as the game's official race does (inspection, shared nets).
function runRace(codes) {
  const {course, track, scene} = S;
  const entries = codes.map(c => P.decode(c));
  for (const v of S.views) v.dispose?.();
  const dq = course.track.inspection ? P.inspection(entries) : -1;
  const eligible = entries.map((p, i) => ({p, i})).filter(x => x.i !== dq);
  const fleet = P.simulateFleet(eligible.map(x => x.p), course.trackIndex);
  const netEvents = fleet.netEvents.map(e => ({...e, team: eligible[e.team].i}));
  let j = 0;
  const results = entries.map((p, i) => i === dq
    ? {status: 'DQ', time: 0, reason: 'Artificial inspection', durability: 100, speed: 0, energy: 0, frames: [P.initialPose(p, course.trackIndex)], events: []}
    : fleet.results[j++]);
  const rows = P.award(results, course.trackIndex);
  const lanes = laneOffsets(entries.length, course.roadHalf);
  const views = entries.map((p, i) => {
    const v = new PumpkinView(scene, course, p, results[i], i, lanes[i]);
    v.place = rows[i].place; v.money = rows[i].money; v.labelsOn = S.labelsOn;
    return v;
  });
  course.startChutes?.rebuild(lanes); // one start stall per pumpkin
  const netOpenTimes = (course.track.nets || []).map((_, k) => netEvents.find(e => e.net === k)?.t ?? Infinity);
  let inspection = null;
  if (course.track.inspection) {
    const duration = Math.min(7, Math.max(4, course.preroll - 2.6)), start = -course.preroll + 0.4;
    inspPop.setRace({entries, dq, trackIndex: course.trackIndex, start, duration});
    inspection = {start, duration, verdict: inspPop.verdictTime()};
  } else inspPop.clear();
  S.env.onRace?.({views, results, entries, netEvents, netOpenTimes, dq, inspection});
  const director = new Director(camera, views, controls, course, track);
  const plan = planShots(views, course.preroll, track);
  director.setPlan(plan);
  Object.assign(S, {views, director, plan, codes, results, rows, dq, netEvents, inspection, entries,
    inspectionHold: inspection ? inspection.start + inspection.duration : null, inspectionConfirmed: false, inspectionStarted: false, endT: plan.allDone + 9, shownResults: false,
    simT: -course.preroll, prevT: -course.preroll, playing: true});
  S.events = buildEvents();
  $('#scrub').min = -course.preroll; $('#scrub').max = S.endT; $('#scrub').step = 0.01;
  $('#results').hidden = true;
  drawMarks(); buildStandings(); setCamMode('AUTO');
  console.log('[pumpkin3d] results', course.id, JSON.stringify(views.map(v => ({name: v.name, status: v.result.status, time: +v.result.time.toFixed(4), reason: v.result.reason || null}))));
}

// --- Timed events: ticker lines and sounds ---
function buildEvents() {
  const {views, plan, course, track, dq, netEvents} = S;
  const at = (v, t) => () => { const f = P.sampleSimulation(v.result, Math.max(0, t)); return new THREE.Vector3(f.centerX, course.H0 + f.centerY, v.lane); };
  const out = [-3, -2, -1].map(t => ({t, sound: 'countdown'}));
  out.push({t: 0, text: 'GO!', big: true, sound: 'go'}, {t: 0.02, sound: 'gate'});
  const verdict = S.inspection?.verdict ?? -course.preroll + 1.6;
  if (dq >= 0) out.push({t: verdict, text: `Inspection: ${views[dq].name} has the highest artificial score. Disqualified.`, big: true, sound: 'dq'});
  else if (S.inspection) out.push({t: verdict, text: 'Inspection: everyone is cleared.', big: true, sound: 'whistle'});
  for (const e of netEvents) out.push({t: e.t, text: `${views[e.team].name} breaks net ${e.net + 1}`, sound: 'netSnap', pos: () => new THREE.Vector3(e.x, course.roadY(e.x) + 0.6, 0)});
  for (const v of views) for (const e of v.result.events) {
    if (e.type === 'CAUGHT') out.push({t: e.t, text: `${v.name} is caught in net ${e.net + 1}`, sound: 'netCatch', pos: at(v, e.t)});
    if (e.type === 'LANDING' && (e.energy ?? 0) > 40) {
      const speed = P.sampleSimulation(v.result, e.t + 0.005).landingSpeed || Math.sqrt(2 * e.energy / Math.max(1, P.properties(v.p).mass));
      out.push({t: e.t, sound: 'land', opts: {intensity: Math.min(1, Math.max(0.2, speed / 25))}, pos: at(v, e.t)});
    }
  }
  plan.finishers.forEach((f, k) => out.push({t: f.t, text: k === 0 ? `${views[f.i].name} WINS · ${f.t.toFixed(2)} s` : `${views[f.i].name} finishes ${ordinal(k + 1)} · ${f.t.toFixed(2)} s`,
    big: k === 0, sound: k === 0 ? 'win' : 'finish', opts: {place: k + 1}, pos: at(views[f.i], f.t)}));
  for (const b of plan.breaks) {
    const v = views[b.i], broken = v.result.status === 'BROKEN';
    out.push({t: b.t, text: broken ? `${v.name}: rapid unscheduled disassembly!` : `${v.name}: ${(v.result.reason || 'out').toLowerCase()}`, sound: broken ? 'shatter' : 'gasp', pos: at(v, b.t)});
  }
  if (track.tickerEvents) out.push(...track.tickerEvents(views, plan.extra));
  return out.sort((a, b) => a.t - b.t);
}
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
function ticker(text, big) {
  const d = document.createElement('div'); d.textContent = text; if (big) d.className = 'big';
  $('#ticker').prepend(d); setTimeout(() => d.remove(), 3700);
  while ($('#ticker').children.length > 3) $('#ticker').lastChild.remove();
}
function fireEvents(from, to) {
  if (to <= from || to - from > 1.5) return; // skipped by scrubbing or a jump in time
  for (const ev of S.events) if (ev.t > from && ev.t <= to) {
    if (ev.text) ticker(ev.text, ev.big);
    if (ev.sound && !(S.userRate > 2 && ev.sound === 'land')) audio.play(ev.sound, {...(ev.opts || {}), position: ev.pos?.()});
  }
}

// --- HUD ---
function buildStandings() {
  const ol = $('#standings'); ol.innerHTML = '';
  ol.style.display = 'flex'; ol.style.flexDirection = 'column';
  S.views.forEach((v, i) => {
    const li = document.createElement('li'); li.dataset.i = i;
    li.innerHTML = `<span class="pos"></span><span class="dot" style="background:${v.color}"></span><span class="name"></span><span class="val"></span><span class="bar"><i></i></span>`;
    li.querySelector('.name').textContent = v.name;
    li.onclick = () => { if (S.director.mode === 'AUTO') setCamMode('CHASE'); S.director.manualFocus = i; };
    ol.append(li); v.li = li;
  });
}

function updateStandings(t, focusIdx) {
  const rank = s => !s.st ? 1 : s.st.kind === 'finished' ? 0 : s.st.kind === 'dq' ? 3 : 2;
  const order = S.views.map((v, i) => ({v, i, st: v.statusAt(t)})).sort((a, b) =>
    rank(a) - rank(b) || (a.st?.kind === 'finished' && b.st?.kind === 'finished' ? a.v.result.time - b.v.result.time : (b.v.state?.x ?? 0) - (a.v.state?.x ?? 0)));
  order.forEach(({v, i, st}, k) => {
    const li = v.li;
    li.style.order = k; li.classList.toggle('focus', i === focusIdx); li.classList.toggle('out', !!st && st.kind !== 'finished');
    li.querySelector('.pos').textContent = st?.kind === 'finished' ? v.place : st ? '–' : k + 1;
    const dist = Math.max(0, Math.min(S.course.length, v.state?.x ?? 0));
    const caught = !st && v.state?.v < 0.05 && t > 1 && v.result.events.some(e => e.type === 'CAUGHT' && e.t <= t) && !v.result.events.some(e => e.type === 'RELEASED' && e.t <= t && e.t > (v.result.events.filter(c => c.type === 'CAUGHT' && c.t <= t).at(-1)?.t ?? 0));
    li.querySelector('.val').innerHTML = st ? (st.kind === 'finished' ? st.text : `<span class="tag ${st.kind === 'dq' ? 'dq' : 'broken'}">${st.text}</span>`) :
      `${dist.toFixed(0)} m${v.state?.air ? '<span class="tag">AIR</span>' : caught ? '<span class="tag">NET</span>' : ''}`;
    const dur = Math.max(0, v.state?.dur ?? 100), bar = li.querySelector('.bar i');
    bar.style.width = dur + '%'; bar.className = dur < 15 ? 'crit' : dur < 45 ? 'low' : '';
  });
}

const prof = $('#profile'), pctx = prof.getContext('2d');
function drawProfile() {
  const {course} = S, w = prof.clientWidth * devicePixelRatio, h = prof.clientHeight * devicePixelRatio, dpr = devicePixelRatio;
  if (prof.width !== w || prof.height !== h) { prof.width = w; prof.height = h; }
  pctx.clearRect(0, 0, w, h);
  const L = course.length, x0 = -L * 0.02, x1 = L * 1.02;
  let yTop = -Infinity, yBot = Infinity;
  for (let x = x0; x <= x1; x += L / 200) { const y = course.roadY(x); yTop = Math.max(yTop, y); yBot = Math.min(yBot, y); }
  yTop += 2; yBot -= 2;
  const X = x => (x - x0) / (x1 - x0) * w, Y = y => 6 * dpr + (yTop - y) / Math.max(1, yTop - yBot) * (h - 12 * dpr);
  for (const [a, b] of course.track.sand || []) { pctx.fillStyle = 'rgba(232,206,140,.35)'; pctx.fillRect(X(a), 0, X(b) - X(a), h); }
  pctx.lineWidth = 2 * dpr; pctx.strokeStyle = 'rgba(255,255,255,.55)'; pctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x += L / 400) {
    if (!course.hasSurface(x)) { pen = false; continue; }
    const px = X(x), py = Y(course.roadY(x)); pen ? pctx.lineTo(px, py) : pctx.moveTo(px, py); pen = true;
  }
  pctx.stroke();
  pctx.fillStyle = 'rgba(255,210,138,.85)'; pctx.font = `${10 * dpr}px ui-monospace, monospace`;
  if (course.track.gap) pctx.fillText('GAP', X(course.track.gap[0]) - 4 * dpr, Y(course.roadY(course.track.gap[0])) - 6 * dpr);
  (course.track.nets || []).forEach((n, k) => {
    const open = S.netOpen?.[k] ?? false;
    pctx.strokeStyle = open ? 'rgba(255,255,255,.25)' : 'rgba(255,210,138,.9)'; pctx.beginPath(); pctx.moveTo(X(n.x), Y(course.roadY(n.x)) - 9 * dpr); pctx.lineTo(X(n.x), Y(course.roadY(n.x)) + 4 * dpr); pctx.stroke();
    pctx.fillText(`NET ${k + 1}`, X(n.x) - 14 * dpr, Math.max(11 * dpr, Y(course.roadY(n.x)) - 12 * dpr));
  });
  pctx.fillText('FINISH', X(L) - 46 * dpr, Y(course.roadY(L)) - 6 * dpr);
  for (const v of S.views) {
    if (!v.state || v.result.status === 'DQ') continue;
    const px = X(Math.min(x1, v.root.position.x)), py = Y(v.root.position.y - v.radius);
    pctx.fillStyle = v.color; pctx.beginPath(); pctx.arc(px, py, 5 * dpr, 0, 7); pctx.fill();
    pctx.strokeStyle = '#111'; pctx.lineWidth = dpr; pctx.stroke();
  }
}

function drawMarks() {
  const marks = $('#marks'); marks.innerHTML = '';
  const t0 = -S.course.preroll, span = S.endT - t0;
  const add = (t, cls) => { const i = document.createElement('i'); i.style.left = `${(t - t0) / span * 100}%`; if (cls) i.className = cls; marks.append(i); };
  for (const ev of S.events) if (ev.text && !ev.big && !/finishes|disassembly|caught|out/.test(ev.text)) add(ev.t);
  S.plan.finishers.forEach(f => add(f.t, 'end')); S.plan.breaks.forEach(b => add(b.t, 'bad'));
}

// --- Results card and circuit ---
function showResults() {
  const {views, rows, course} = S;
  $('#results-title').textContent = `${course.name.toUpperCase()} · RESULTS`;
  const order = views.map((v, i) => ({v, r: rows[i]})).sort((a, b) => (a.r.place ?? 99) - (b.r.place ?? 99));
  $('#results-rows').innerHTML = order.map(({v, r}) => `<tr><td>${r.place ?? '–'}</td><td class="dot"><i style="background:${v.color}"></i></td><td>${esc(v.name)}</td>
    <td>${r.status === 'FINISHED' ? r.time.toFixed(2) + ' s' : r.status === 'DQ' ? 'DQ' : r.status === 'BROKEN' ? 'Broken' : esc(r.reason || 'DNF')}</td><td class="money">$${r.money.toLocaleString('en-US', {maximumFractionDigits: 0})}</td></tr>`).join('');
  const c = S.circuit;
  $('#results-next').hidden = !(S.mode === 'circuit' && c && c.idx < TRACK_IDS.length - 1);
  if (S.mode === 'circuit' && c) {
    c.races[c.idx] = rows;
    const done = c.races.filter(Boolean);
    const table = P.circuitStandings(done, views.length);
    $('#results-circuit').innerHTML = `<h3>${c.idx === TRACK_IDS.length - 1 ? 'CHAMPIONSHIP' : `CIRCUIT AFTER ${c.idx + 1} OF 4`}</h3><table><tbody>${table.map(t =>
      `<tr><td>${t.place}</td><td class="dot"><i style="background:${views[t.team].color}"></i></td><td>${esc(views[t.team].name)}${t.winner && c.idx === TRACK_IDS.length - 1 ? ' 🏆' : ''}</td><td class="money">$${t.total.toLocaleString('en-US', {maximumFractionDigits: 1})}</td></tr>`).join('')}</tbody></table>`;
  } else $('#results-circuit').innerHTML = '';
  $('#results').hidden = false;
  // After the last race of a circuit: the champion card, as in the game (also on the button).
  const last = S.mode === 'circuit' && c && c.idx === TRACK_IDS.length - 1;
  $('#results-final').hidden = !last;
  if (last && !c.celebrated) { c.celebrated = true; setTimeout(() => { if (!$('#results').hidden && !document.querySelector('dialog[open]')) openFinal(); }, 2500); }
}
function openFinal() {
  const c = S.circuit; if (!c) return;
  S.playing = false;
  showChampion({entries: S.entries, races: c.races, trackNames: TRACK_IDS.map(id => P.tracks.find(t => t.id === id)?.name ?? id), colors: S.views.map(v => v.color)});
}
$('#results-final').onclick = () => openFinal();
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

async function startSelected(codes) {
  await audioReady; audio.start?.();
  if (selected === 'circuit') {
    S.mode = 'circuit'; S.circuit = {idx: 0, races: []};
    await setTrack(TRACK_IDS[0]);
  } else {
    S.mode = 'single'; S.circuit = null;
    if (S.course?.id !== selected) await setTrack(selected);
  }
  runRace(codes);
  history.replaceState(null, '', '#' + (selected === 'circuit' ? 'circuit=1' : 'track=' + selected) + '&codes=' + codes.map(encodeURIComponent).join(','));
  $('#hud').hidden = false;
}
$('#results-next').onclick = async () => {
  const c = S.circuit; if (!c) return;
  c.idx++; $('#results').hidden = true;
  await setTrack(TRACK_IDS[c.idx]);
  runRace(S.codes);
};
$('#results-again').onclick = () => { $('#results').hidden = true; S.shownResults = true; restart(); };
$('#results-setup').onclick = () => { $('#results').hidden = true; openSetup(S.codes); };

// --- Cameras UI ---
function setCamMode(mode) {
  const d = S.director; if (!d) return;
  d.mode = mode; d.cutPending = true;
  if (mode !== 'AUTO' && d.lastShot) d.manualFocus = d.lastShot.focus >= 0 ? d.lastShot.focus : d.manualFocus;
  document.querySelectorAll('#cams button').forEach(b => b.classList.toggle('active', b.dataset.cam === mode));
}
function camList() {
  const cams = {...COMMON_CAMS, ...(S.track?.cameras || {})};
  return Object.entries(cams).filter(([, c]) => c.key).sort((a, b) => a[1].key.localeCompare(b[1].key));
}
function buildCamButtons() {
  const box = $('#cams'); box.innerHTML = '';
  const make = (id, label, key) => { const b = document.createElement('button'); b.dataset.cam = id; b.textContent = key ? `${key} ${label}` : label; b.onclick = () => setCamMode(id); box.append(b); };
  make('AUTO', 'AUTO DIRECTOR', '0');
  for (const [id, c] of camList()) make(id, c.label, c.key);
}

// --- Setup dialog ---
function openSetup(codes) {
  const pick = $('#track-pick'); pick.innerHTML = '';
  const options = [...TRACK_IDS.map(id => ({id, name: P.tracks.find(t => t.id === id)?.name ?? id, sub: P.tracks.find(t => t.id === id)?.label ?? ''})),
    {id: 'circuit', name: 'Full circuit', sub: 'All 4 races, prize money'}];
  for (const o of options) {
    const b = document.createElement('button'); b.type = 'button'; b.className = o.id === selected ? 'active' : '';
    b.innerHTML = `<b>${esc(o.name.toUpperCase())}</b><small>${esc(o.sub)}</small>`;
    b.onclick = () => { selected = o.id; pick.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
    pick.append(b);
  }
  const list = $('#code-list'); list.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const row = document.createElement('div'); row.className = 'code-row';
    row.innerHTML = `<span class="dot" style="background:${TEAM_COLORS[i]}"></span><input spellcheck="false" placeholder="Pumpkin code ${i + 1} (optional)"><small></small>`;
    const input = row.querySelector('input'), note = row.querySelector('small');
    input.value = codes[i] || '';
    const describe = () => {
      if (!input.value.trim()) { note.textContent = ''; return; }
      try { const p = P.decode(input.value); note.textContent = `${p.name} · ${P.varietyOf(p).name} · ${p.d} cm · ${p.s}% symmetry · artificial ${p.ea + p.ca + p.ga}`; note.style.color = ''; }
      catch (e) { note.textContent = e.message; note.style.color = '#b23a22'; }
    };
    input.oninput = describe; describe();
    list.append(row);
  }
  $('#quality').checked = LOW;
  $('#setup-error').textContent = '';
  $('#setup').showModal();
}

$('#setup-form').addEventListener('submit', e => {
  const codes = [...document.querySelectorAll('#code-list input')].map(i => i.value.trim()).filter(Boolean);
  if (!codes.length) { e.preventDefault(); $('#setup-error').textContent = 'Add at least one pumpkin code.'; return; }
  try { codes.forEach(c => P.decode(c)); } catch (err) { e.preventDefault(); $('#setup-error').textContent = err.message; return; }
  if ($('#quality').checked !== LOW) {
    localStorage.setItem('pumpkin3d-low2', $('#quality').checked ? '1' : '0');
    location.hash = (selected === 'circuit' ? 'circuit=1' : 'track=' + selected) + '&codes=' + codes.map(encodeURIComponent).join(',');
    location.reload(); return;
  }
  startSelected(codes).catch(err => { console.error(err); openSetup(codes); $('#setup-error').textContent = err.message; });
});
$('#setup-open').onclick = () => openSetup(S.views.map(v => P.encode(v.p)));

// --- Transport ---
function restart() { S.simT = S.prevT = -S.course.preroll; S.playing = true; S.inspectionConfirmed = false; S.inspectionStarted = false; if (S.director) S.director.cutPending = true; S.shownResults = false; $('#results').hidden = true; }
$('#play').onclick = () => { S.playing = !S.playing; };
$('#restart').onclick = restart;
$('#rate').onchange = e => { S.userRate = +e.target.value; };
$('#scrub').addEventListener('input', e => { S.simT = S.prevT = +e.target.value; S.scrubbing = true; if (S.director) S.director.cutPending = true; });
$('#scrub').addEventListener('change', () => { S.scrubbing = false; });
// Sound: click the speaker to mute, hover it for the volume slider.
const volIcon = () => { const v = +$('#volume').value; $('#mute').textContent = audio.muted || v === 0 ? '🔇' : v < 0.34 ? '🔈' : v < 0.67 ? '🔉' : '🔊'; };
const setMute = m => { audio.setMuted(m); localStorage.setItem('pumpkin3d-muted', m ? '1' : '0'); volIcon(); };
const setVolume = v => {
  v = Math.min(1, Math.max(0, v)); $('#volume').value = v;
  audio.setVolume?.(v); localStorage.setItem('pumpkin3d-volume', v);
  if (v > 0 && audio.muted) setMute(false); else volIcon();
};
$('#mute').onclick = () => setMute(!audio.muted);
$('#volume').oninput = e => setVolume(+e.target.value);
$('#mute').parentElement.addEventListener('wheel', e => { e.preventDefault(); setVolume(+$('#volume').value - Math.sign(e.deltaY) * 0.05); }, {passive: false});
const setPip = on => { S.pipOn = on; localStorage.setItem('pumpkin3d-pip', on ? '1' : '0'); $('#pip-toggle').classList.toggle('active', on); if (!on) pips.hideAll(); };
$('#pip-toggle').onclick = () => setPip(!S.pipOn);
$('#gfx').innerHTML = Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('#gfx').onchange = e => quality.setMode(e.target.value);
function refreshGfx() {
  const sel = $('#gfx'); if (!sel) return;
  sel.value = quality.mode;
  sel.options[0].textContent = quality.mode === 'auto' ? `Auto (${quality.step.name})` : 'Auto';
  $('#fps').textContent = quality.fps ? `${Math.round(quality.fps)} fps` : '';
  // At the lowest automatic step and still struggling: offer the lighter scenery build.
  $('#lighter').hidden = LOW || !(quality.mode === 'auto' && quality.step.name === 'Minimum' && quality.fps > 0 && quality.fps < 20);
}
$('#lighter').onclick = () => { localStorage.setItem('pumpkin3d-low2', '1'); location.reload(); };
quality.apply();
setPip(S.pipOn);
function showGarage(entries, withResults) {
  if (withResults) S.playing = false;
  return openGarage({entries, results: withResults ? S.results : [], rows: withResults ? S.rows : [], colors: entries.map((_, i) => TEAM_COLORS[i]), trackName: withResults ? S.course.name : ''});
}
$('#garage-open').onclick = () => S.views.length && showGarage(S.views.map(v => v.p), true);
$('#garage-preview').onclick = () => {
  const codes = [...document.querySelectorAll('#code-list input')].map(i => i.value.trim()).filter(Boolean);
  try { showGarage(codes.map(c => P.decode(c)), false); } catch (err) { $('#setup-error').textContent = err.message; }
};
$('#credits-open').onclick = async e => {
  e.preventDefault();
  $('#credits').showModal();
  const files = ['assets/CREDITS.md'];
  const parts = await Promise.all(files.map(f => fetch(f).then(r => (r.ok ? r.text() : '')).catch(() => '')));
  $('#credits-body').textContent = parts.filter(Boolean).join('\n\n────────\n\n') || 'No credits files found.';
};
audioReady.then(() => {
  setVolume(+(localStorage.getItem('pumpkin3d-volume') ?? 0.8));
  if (localStorage.getItem('pumpkin3d-muted') === '1') setMute(true);
});

addEventListener('keydown', e => {
  if ($('#setup').open || document.querySelector('#garage')?.open || e.target.tagName === 'INPUT' || !S.director) return;
  if (e.key === 'Enter' && S.inspection && !S.inspectionStarted && S.simT >= S.inspection.start - 0.01) { S.inspectionStarted = true; S.playing = true; e.preventDefault(); }
  else if (e.key === 'Enter' && S.inspectionHold != null && !S.inspectionConfirmed && S.simT >= S.inspectionHold - 0.01) { startAfterInspection(); e.preventDefault(); }
  else if (e.code === 'Space') { S.playing = !S.playing; e.preventDefault(); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'm' || e.key === 'M') setMute(!audio.muted);
  else if (e.key === 'p' || e.key === 'P') setPip(!S.pipOn);
  else if (e.key === 'g' || e.key === 'G') $('#garage-open').onclick();
  else if (e.key === 'l' || e.key === 'L') { S.labelsOn = !S.labelsOn; S.views.forEach(v => { v.labelsOn = S.labelsOn; }); }
  else if (e.key === '0') setCamMode('AUTO');
  else if (e.key === '[' || e.key === ']') { if (S.director.mode === 'AUTO') setCamMode('CHASE'); S.director.manualFocus = (S.director.manualFocus + (e.key === ']' ? 1 : S.views.length - 1)) % S.views.length; }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { S.simT = S.prevT = Math.max(-S.course.preroll, Math.min(S.endT, S.simT + (e.key === 'ArrowRight' ? 2 : -2))); S.director.cutPending = true; }
  else { const hit = camList().find(([, c]) => c.key === e.key); if (hit) setCamMode(hit[0]); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// --- Main loop ---
const timer = new THREE.Timer();
let boardTimer = 0, hudTimer = 0, wallTime = 0, fpsTimer = 0;
const fwd = new THREE.Vector3();
function frame(now) {
  timer.update(now);
  const realDt = timer.getDelta(), dt = Math.min(0.1, realDt);
  if (!S.capturing && !window.__garageOpen && !S.switching) {
    try { step(dt, true); }
    catch (e) { if (!frame.warned) { frame.warned = true; console.error('[pumpkin3d] frame error (continuing):', e); } }
  }
  quality.tick(realDt, !S.capturing && !window.__garageOpen && !!S.track);
  if ((fpsTimer += dt) > 0.5) { fpsTimer = 0; refreshGfx(); }
  requestAnimationFrame(frame);
}

// One frame of everything. advance=false keeps simT where it is (capture sets it).
function step(dt, advance) {
  wallTime += dt;
  const {director, views, course, env} = S;
  if (director) {
    const shot = director.shotAt(S.simT), rate = S.userRate * (shot.rate ?? 1);
    if (advance) {
      S.prevT = S.simT;
      if (S.playing && !S.scrubbing) S.simT = Math.min(S.endT, S.simT + dt * rate);
    }
    // Hold at the start of the inspection until Start Inspection (never while capturing videos).
    if (S.inspection && !S.inspectionStarted && !S.capturing) {
      if (S.prevT <= S.inspection.start + 1e-6 && S.simT > S.inspection.start) S.simT = S.inspection.start;
      if (S.simT > S.inspection.start + 0.5) S.inspectionStarted = true; // scrubbed past it
    }
    // Hold at the end of the inspection until START RACE (never while capturing videos).
    const holding = S.inspectionHold != null && !S.inspectionConfirmed && !S.capturing;
    if (holding && S.prevT <= S.inspectionHold + 1e-6 && S.simT > S.inspectionHold) S.simT = S.inspectionHold;
    if (holding && S.simT > S.inspectionHold + 0.5) S.inspectionConfirmed = true; // scrubbed past it
    fireEvents(S.prevT, S.simT);
    S.prevT = S.simT;
    for (const v of views) v.update(S.simT, camera);
    const info = director.update(S.simT, dt);
    const focusIdx = views.indexOf(info.focus);
    S.sky.followShadow(info.focus.root.position);
    env.updateGate?.(S.simT);
    S.netOpen = (course.track.nets || []).map((_, k) => S.netEvents.some(e => e.net === k && e.t <= S.simT));

    const xs = views.filter(v => v.result.status !== 'DQ').map(v => v.root.position.x);
    const excitementOf = zone => {
      const z = env.crowdZones?.[zone]; if (!z) return 0.2;
      const mid = (z.x0 + z.x1) / 2;
      return Math.max(0.15, ...xs.map(x => Math.max(0, 1 - Math.abs(x - mid) / 120)), S.simT > S.plan.allDone ? 0.9 : 0);
    };
    env.update?.(S.simT, wallTime, {excitement: excitementOf, views, camera});
    S.sky.update(wallTime);

    camera.getWorldDirection(fwd);
    audio.update({dt, simT: S.simT, playing: S.playing && !S.scrubbing, rate: S.playing ? rate : 0, slowmo: (shot.rate ?? 1) < 0.6, cut: info.cut,
      listener: {position: camera.position, forward: fwd, up: camera.up},
      pumpkins: views.filter(v => v.result.status !== 'DQ').map(v => ({id: v.team, position: v.root.position, speed: v.state?.v ?? 0, airborne: !!v.state?.air,
        surface: course.surfaceAt?.(v.root.position.x) ?? 'dirt', active: S.simT >= 0 && !v.state?.done})),
      crowdExcitement: Math.max(0, ...(env.crowdZones || []).map((_, i) => excitementOf(i)))});

    $('#cam-label').innerHTML = `CAM · ${info.label}${(shot.rate ?? 1) < 1 && S.playing ? '<span class="slow">SLOW MOTION</span>' : ''}`;
    $('#clock').textContent = S.inspection && !S.inspectionStarted && S.simT >= S.inspection.start - 1e-6 ? 'INSPECT' : S.inspectionHold != null && !S.inspectionConfirmed && S.simT >= S.inspectionHold - 1e-6 ? 'READY' : S.simT < 0 ? `−${Math.ceil(-S.simT)}` : Math.min(S.simT, S.plan.allDone).toFixed(2);
    $('#play').textContent = S.playing ? '❚❚' : '▶';
    if (!S.scrubbing) $('#scrub').value = S.simT;
    $('#speedo-name').textContent = info.focus.name;
    $('#speedo-value').textContent = Math.round((info.focus.state?.v ?? 0) * 3.6);
    if (!S.shownResults && S.simT >= S.plan.allDone + 3) { S.shownResults = true; showResults(); }
    inspPop.update(S.simT, {waiting: S.inspectionHold != null && !S.inspectionConfirmed && !S.capturing && S.simT >= S.inspectionHold - 1e-6,
      waitingToBegin: !!S.inspection && !S.inspectionStarted && !S.capturing && S.simT >= S.inspection.start - 1e-6, capturing: S.capturing});
    // Lineup caption: the pumpkin nearest the dollying camera.
    if (info.shot.cam === 'LINEUP') {
      const v = views.filter(x => x.result.status !== 'DQ').reduce((a, b) => (Math.abs(b.lane - camera.position.z) < Math.abs(a.lane - camera.position.z) ? b : a));
      const p = v.p, coat = p.ea ? `artificial coat ${p.ea}` : p.en ? `natural coat ${p.en}` : 'no coat';
      const core = p.ca ? `steel core ${p.ca}` : p.cn ? `seed core ${p.cn}` : 'hollow';
      lowerThird.hidden = false; lowerThird.style.setProperty('--team', v.color);
      lowerThird.innerHTML = `<b>${esc(v.name)}</b><small>${P.varietyOf(p).name} · ${p.d} cm · ${p.s}% round · ${coat} · ${core}${p.ga ? ` · treads ${p.ga}` : p.gn ? ` · grooves ${p.gn}` : ''}</small>`;
    } else lowerThird.hidden = true;
    S.pipList = pips.update({views, course, simT: S.simT, enabled: S.pipOn, hidden: !$('#results').hidden, main: info.focus}, dt);
    if (S.shownResults && S.simT < S.plan.allDone + 2.9) { S.shownResults = false; $('#results').hidden = true; }

    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; updateStandings(S.simT, focusIdx); drawProfile(); }
    boardTimer += dt;
    if (boardTimer > 0.05 && env.board) {
      boardTimer = 0;
      const leader = P.leaderAt(views.map(v => v.result), Math.max(0, S.simT));
      env.board.draw(Math.max(0, Math.min(S.simT, S.plan.allDone)), leader >= 0 ? views[leader].name : '');
    }
  } else if (S.track && S.env) {
    const e = S.track.establishing?.(course);
    if (e) { camera.position.copy(e.pos); camera.lookAt(e.look); }
    env?.update?.(0, wallTime, {excitement: () => 0.1, views: [], camera});
    S.sky?.update(wallTime);
  }
  if (S.sky && (S.capturing || quality.shadowsDue())) S.sky.sun.shadow.needsUpdate = true;
  renderer.render(S.scene, camera);
  if (S.director && S.pipOn) pips.render(renderer, S.scene, S.views, S.sky?.water);
}

// --- Boot ---
const fromUrl = (params.get('codes') || '').split(',').map(decodeURIComponent).filter(Boolean);
(async () => {
  await setTrack(selected === 'circuit' ? TRACK_IDS[0] : selected);
  if (fromUrl.length) {
    try { await startSelected(fromUrl); } catch (e) { openSetup(fromUrl); $('#setup-error').textContent = e.message; }
  } else openSetup(DEFAULT_CODES);
  if (params.has('t') && S.director) { S.simT = S.prevT = +params.get('t'); S.playing = params.get('play') === '1'; }
  if (params.has('cam') && S.director) setCamMode(params.get('cam'));
  requestAnimationFrame(frame);
})();
window.__pumpkin3d = {
  get simT() { return S.simT; }, set simT(v) { S.simT = S.prevT = v; if (S.director) S.director.cutPending = true; },
  get views() { return S.views; }, get plan() { return S.plan; }, get state() { return S; },
  setCamMode, pause: () => { S.playing = false; }, play: () => { S.playing = true; },
  setTrack, runRace, startSelected: (id, codes) => { selected = id; return startSelected(codes ?? DEFAULT_CODES); }, renderer,
  setPip, showGarage, get audio() { return audio; }, audioReady,
  // Frame-exact capture for videos: begin(), then frame(t, dt) for each frame in order.
  capture: {
    begin() { S.capturing = true; S.playing = false; document.body.classList.add('capturing'); quality.setMode('high'); if (S.director) S.director.cutPending = true; },
    frame(t, dt = 1 / 30) { S.simT = t; step(dt, false); },
    end() { S.capturing = false; document.body.classList.remove('capturing'); },
  },
};
