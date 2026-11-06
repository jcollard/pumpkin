// Carmel: 250 m crest sprint down a storybook village lane to the white-sand
// dunes of Carmel Beach. Inspection first: the pumpkin with the single highest
// artificial score is disqualified at the start tent before GO.
import * as THREE from 'three';
import * as P from '../../physics.js';
import * as T from '../../textures.js';
import {clamp} from '../../noise.js';
import {rod, mesh} from '../../env/geom.js';
import * as props from '../../env/props.js';
import {createCourse} from './course.js';
import * as CT from './tex.js';
import {buildLane, buildVillage, makeGround} from './village.js';
import {buildBeach} from './beach.js';
import {buildDistant, missionComplex} from './distant.js';
import {buildInspection, inspectionRig, gateRig, makeScript, PREROLL, START_ARCH_X} from './inspection.js';
import {addModels, loadLibrary} from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

async function build(scene, renderer, course, {low = false} = {}) {
  const group = new THREE.Group();
  const H = course.roadHalf, L = course.length;
  const mats = props.sharedMaterials();
  const ground = makeGround(course);
  const lib = await loadLibrary().catch(e => { console.warn('[carmel] models', e); return null; });

  buildLane(group, course, mats, {low});
  const village = buildVillage(group, course, mats, {low, ground, lib});
  const insp = buildInspection(group, course, mats, {ground, lib});
  const beach = buildBeach(group, course, mats, {low, ground});
  buildDistant(group, course, {low});

  // Start and finish dressing (shared log gantries, gate, chalk) plus signs.
  props.gantry(group, course, mats, START_ARCH_X, props.clothTexture('CARMEL · START', '#e9dcc0'), props.clothTexture('TO THE BEACH', '#e58b37'));
  const board = props.finishGantry(group, course, mats);
  props.chalkLine(group, course, 0.9); props.chalkLine(group, course, L);
  // Rodeo start chutes, open at the back so the inspection lineup and the DQ pen work from behind.
  const updateGate = props.startChutes(group, course, mats, {back: false}).update;
  props.sign(group, course, mats, T.signTexture(['CARMEL', {text: 'by-the-Sea · Crest Sprint', font: 'italic bold 36px'}]), {x: -26, z: -H - 3.0, w: 4.2, h: 2.1, post: 1.5, posts: 2});
  CREST_SIGNS.forEach(([x, text]) => props.sign(group, course, mats, T.signTexture([text, {text: 'CREST', font: 'bold 54px'}], {bg: '#a8432a', w: 256, h: 256}), {x: x - 22, z: -H - 1.5, w: 1.1, h: 1.1, post: 0.9}));
  props.sign(group, course, mats, T.signTexture(['BEACH', {text: 'dogs welcome', font: 'italic 44px'}], {bg: '#2f6d8c'}), {x: course.VILLAGE_END + 6, z: H + 2.4, w: 2.6, h: 1.3, post: 1.2, posts: 2, face: -1});
  for (const d of [100, 200]) props.sign(group, course, mats, T.signTexture([`${d} m`], {w: 256, h: 128, font: 'bold 60px'}), {x: d, z: -H - 1.0, w: 1.0, h: 0.5, post: 0.75});

  // Photo-finish camera on a post at the line, with a flash for each finisher.
  const pf = new THREE.Group(), dark = new THREE.MeshStandardMaterial({color: 0x222326, roughness: 0.5, metalness: 0.4});
  const pfy = course.roadY(L), body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.36), dark);
  body.position.set(L, pfy + 0.62, -H - 1.15);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), dark); lens.rotation.x = Math.PI / 2; lens.position.set(L, pfy + 0.62, -H - 0.9);
  pf.add(body, lens, mesh(rod(V(L, pfy - 0.2, -H - 1.15), V(L, pfy + 0.5, -H - 1.15), 0.03, 6), dark));
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({map: CT.glowTexture(), color: 0xfff6e0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
  flash.position.set(L, pfy + 0.62, -H - 0.8); flash.scale.setScalar(0.9); flash.visible = false; pf.add(flash);
  group.add(pf);
  let flashTimes = [];

  // Spectators: lawns on the north side stay behind the TV camera's sightline.
  const crowd = props.crowd(group, course, [
    {x0: L - 12, x1: L + 22, z0: -H - 7.5, z1: -H - 1.8, n: 70},
    {x0: L - 10, x1: L + 22, z0: 19, z1: 24, n: 45},
    {x0: -30, x1: -13, z0: 6.0, z1: 9.5, n: 26},
    {x0: 4, x1: 16, z0: -7.4, z1: -6.8, n: 10},
    {x0: 48, x1: 72, z0: 10.6, z1: 13.4, n: 20},
    {x0: 118, x1: 144, z0: 10.6, z1: 13.4, n: 22},
    {x0: 188, x1: 206, z0: -12, z1: -6.5, n: 26},
      ], {low});

  scene.add(group);
  // Catalogue models (cottages, mission, beach props, dogs, people) load last; the track works without them.
  const extra = await addModels(group, course, {low, lib}).catch(e => { console.warn('[carmel] models', e); return null; });
  if (!extra?.mission) missionComplex(group, course, {withChurch: true});
  else missionComplex(group, course, {withChurch: false});

  return {
    group, board, updateGate, crowdZones: crowd.zones,
    onRace({views, inspection}) {
      insp.onRace(views, inspection);
      flashTimes = views.filter(v => v.result.status === 'FINISHED').map(v => v.result.time);
    },
    update(t, wall, ctx) {
      insp.update(t, wall);
      beach.update(wall);
      crowd.update(wall, ctx.excitement);
      extra?.update?.(t, wall, ctx);
      const f = flashTimes.find(ft => t >= ft && t < ft + 0.05);
      flash.visible = f !== undefined;
      if (f !== undefined) flash.material.opacity = 1 - (t - f) / 0.05;
    },
  };
}
const CREST_SIGNS = [[60, '1st'], [130, '2nd'], [205, '3rd']];

// --- Cameras ---------------------------------------------------------------
const cameras = {
  INSPECTION: {label: 'INSPECTION', fov: 32, allowDQ: true, rig: inspectionRig},
  GATE: {label: 'TO THE GATE', fov: 44, allowDQ: true, rig: gateRig},
  // Low on the shoulder just past a crest crown: pumpkins come over the top towards the lens, then fly on towards the sea.
  // Low at the lane edge just past a crest crown. It dollies ahead of the pumpkin down the
  // hill, then stops a few metres past the crown so the pumpkin flies over the top and past the lens.
  CREST: {label: 'CREST CAM', fov: 40, key: '7', rig: ({F, course, self, cut}) => {
    const C = course.CRESTS, H = course.roadHalf;
    if (cut || !self.crest || F.x > self.crest.x + 30) self.crest = C.find(c => c.x + 6.5 > F.x - 2) || C.at(-1);
    const stop = self.crest.x + 6.5, x = Math.min(stop, F.x + 11), z = H + 0.55;
    const pos = V(x, course.roadY(x) + 0.42, z);
    return {pos, look: V(F.x + 0.4, F.y + 0.1, F.z * 0.7), smoothing: x < stop ? 10 : 0};
  }},
  // The photo-finish camera on its post: square across the line at pumpkin height.
  PHOTO: {label: 'PHOTO FINISH', fov: 34, ground: false, rig: ({course}) => {
    const L = course.length, y = course.roadY(L), H = course.roadHalf;
    return {pos: V(L, y + 0.62, -H - 0.62), look: V(L, y + 0.18, H)};
  }},
  // Long lens from the dunes, straight up the village lane.
  OCEAN: {label: 'OCEAN AVENUE', fov: 9, rig: ({F, course}) => {
    const x = 228;
    return {pos: V(x, course.roadY(x) + 10.5, 0.4), look: V(F.x + 4, F.y + 0.5, F.z * 0.5), smoothing: 4};
  }},
  // Wide over the beach: dunes, the finish and the village climbing the hill.
  BAY: {label: 'CARMEL BAY', fov: 30, rig: ({course}) => establishing(course)},
};

function establishing(course) { // from the dunes: white sand, the bay, the mission and Point Lobos beyond
  return {pos: V(318, 24, 30), look: V(1250, 12, -2400)};
}

// --- Director highlights ---------------------------------------------------
function planShots(views, {timeAtX, add, preroll, finishers}) {
  const course = views[0].course, S = makeScript(views, course);
  // 1) The inspection claims the pre-roll.
  const pop = Math.min(S.popEnd, S.opener - 0.4);
  add(-preroll, -preroll + pop, 'INSPECTION', S.dq >= 0 ? S.dq : -1);
  add(-preroll + pop, -preroll + S.opener, 'GATE', S.dq >= 0 ? S.dq : -1);
  const racing = views.map((v, i) => ({v, i})).filter(o => o.v.result.status !== 'DQ');
  if (!racing.length) return {S};
  const lead = racing.slice().sort((a, b) => timeAtX(a.v.result, 120) - timeAtX(b.v.result, 120))[0];
  // 2) Long lens up Ocean Avenue as the field reaches the first crest, then the second crest.
  const t70 = timeAtX(lead.v.result, 84), t118 = timeAtX(lead.v.result, 116), t142 = timeAtX(lead.v.result, 142), t178 = timeAtX(lead.v.result, 178);
  if (isFinite(t118)) add(t70, t118, 'OCEAN', lead.i);
  if (isFinite(t142)) add(t118, t142, 'CREST', lead.i);
  if (isFinite(t178)) add(t142, t178, 'DRONE', lead.i);
  // 3) The third crest in slow motion, then the run to the line and the photo finish.
  // Nominal start times are ordered so the director keeps this sequence (each shot starts where the previous ends).
  const win = finishers[0], jumps = [];
  for (const {v, i} of racing) {
    const j = v.result.events.find(e => e.type === 'JUMP' && e.x > 185 && e.x < 215);
    if (j) { const land = v.result.events.find(e => e.type === 'LANDING' && e.t > j.t); jumps.push({i, t: j.t, x: j.x, land: land?.t ?? j.t + 0.6, landX: land?.x, energy: land?.energy ?? 0, durability: land?.durability}); }
  }
  const star = win ? racing.find(o => o.i === win.i) : lead;
  const sj = jumps.find(j => j.i === star.i);
  const tA = timeAtX(star.v.result, 178), tCrown = timeAtX(star.v.result, 203);
  const finT = win ? win.t : Infinity, dirFinish = finT - 1.5;
  const second = finishers[1], close = second && second.t - finT < 0.3;
  const slowStart = sj ? sj.t - 0.3 : tCrown - 0.4, slowEnd = sj ? sj.land + 0.3 : tCrown + 0.9;
  const photoStart = finT - 0.25, photoEnd = close ? second.t + 0.25 : finT + 0.3;
  if (isFinite(tA) && isFinite(slowStart)) {
    const nSlow = Math.min(slowStart, dirFinish - 0.06);
    add(Math.min(tA, nSlow - 0.01), slowStart, 'CREST', star.i);
    add(nSlow, Math.min(slowEnd, win ? photoStart - 0.4 : slowEnd), 'CREST', star.i, 0.35);
  }
  if (win) {
    add(Math.min(slowEnd, dirFinish - 0.04), photoStart, 'FINISH', win.i);
    add(dirFinish - 0.02, photoEnd, 'PHOTO', win.i, 0.2);
  }
  return {S, jumps, close: close ? {a: win.i, b: second.i, gap: second.t - finT} : null};
}

function tickerEvents(views, extra) {
  const out = [], S = extra.S, pre = PREROLL;
  out.push({t: -pre + 0.15, text: 'Pre-race inspection: artificial coats, cores and grooves'});
  if (S && S.dq < 0) out.push({t: S.verdict - pre + 0.9, text: S.tie ? 'No disqualification: the highest artificial scores are tied' : 'No disqualification: an all-natural field'});
  if (S && S.dq >= 0) out.push({t: S.roll.t1 - pre + 0.2, text: `${views[S.dq].name} is wheeled to the DQ pen`});
  const crestName = ['first', 'second', 'third'];
  const firstAt = {};
  for (const v of views) for (const e of v.result.events) {
    if (e.type !== 'JUMP') continue;
    const k = [60, 130, 205].findIndex(c => Math.abs(e.x - c) < 12);
    if (k < 0 || (firstAt[k] && firstAt[k].e.t < e.t)) continue;
    firstAt[k] = {v, e};
  }
  for (const [k, {v, e}] of Object.entries(firstAt)) {
    const f = P.sampleSimulation(v.result, e.t);
    out.push({t: e.t, text: `${v.name} takes off over the ${crestName[k]} crest at ${Math.round(f.v * 3.6)} km/h`, sound: 'whoosh'});
  }
  for (const j of extra.jumps || []) if (j.durability !== undefined && j.energy > 300) out.push({t: j.land + 0.05, text: `${views[j.i].name} lands hard: ${Math.round(j.durability)}% durability left`});
  if (extra.close) out.push({t: views[extra.close.a].result.time + 0.02, text: `Photo finish! ${views[extra.close.a].name} by ${extra.close.gap.toFixed(2)} s`});
  return out;
}

export default {
  id: 'carmel', name: 'Carmel', label: '250 m · CREST SPRINT',
  blurb: 'Inspection at the tent, then down the storybook village lane, over three crests to the white-sand dunes.',
  createCourse, build, cameras, planShots, tickerEvents, preroll: PREROLL, heroCam: 'CREST',
  establishing,
  ambience: {sea: 0.8, wind: 0.35, gulls: 0.7, crowd: 0.55, birds: 0.3},
};
