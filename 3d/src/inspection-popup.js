// The original game's inspection scene, shown as a pop-up over the 3D view before
// races with an inspection (Carmel). It replays the game's own animation, driven by
// the race clock instead of wall time, so pausing and scrubbing work.
import {properties, tracks} from './physics.js';
import {renderPumpkin, inspectorFigure, canvasContext, teamColors, nameOf} from './inspector2d.js';

export const GAME_ANIMATION = 7;      // seconds in the original
export const GAME_VERDICT = 5.5;      // when the original reveals the verdict

// handlers: {onReveal(), onStart(), onBack()} for the same three buttons as the game's inspection.
export function createInspectionPopup(container, handlers = {}) {
  const el = document.createElement('div');
  el.className = 'inspect-pop'; el.hidden = true;
  el.innerHTML = `<div class="eyebrow"></div><h2>Under the magnifying glass.</h2><canvas aria-label="Inspector checking pumpkins"></canvas><p class="verdict" role="status"></p>
    <div class="actions"><button class="reveal">Show verdict</button><button class="start primary" disabled>START RACE</button><button class="back">Back</button></div>`;
  container.append(el);
  el.querySelector('.reveal').onclick = () => handlers.onReveal?.();
  el.querySelector('.start').onclick = () => handlers.onStart?.();
  el.querySelector('.back').onclick = () => handlers.onBack?.();
  const canvas = el.querySelector('canvas');
  let race = null;

  return {
    // entries: decoded pumpkins (race order); dq: index or -1; window: {start, duration} in race time.
    setRace(r) { race = r; el.querySelector('.eyebrow').textContent = `${tracks[r.trackIndex].name.toUpperCase()} · INSPECTION`; },
    clear() { race = null; el.hidden = true; },
    verdictTime() { return race ? race.start + race.duration * GAME_VERDICT / GAME_ANIMATION : null; },
    // waiting: the race is held at the end of the animation until START RACE is pressed.
    update(simT, {waiting = false, capturing = false} = {}) {
      if (!race) return;
      const local = (simT - race.start) / race.duration * GAME_ANIMATION; // the game's 0..7 s timeline
      const show = local >= 0 && local <= GAME_ANIMATION + 1.2;
      el.hidden = !show;
      el.classList.toggle('leaving', !waiting && local > GAME_ANIMATION + 0.6);
      el.classList.toggle('waiting', waiting);
      el.querySelector('.actions').hidden = capturing;
      el.querySelector('.reveal').hidden = local >= GAME_VERDICT;
      el.querySelector('.start').disabled = local < GAME_VERDICT;
      if (!show) return;
      paint(Math.min(GAME_ANIMATION, Math.max(0, local)));
    },
  };

  // The game's drawing (pumpkins, labels, inspector figure), with our own route: the inspector
  // walks in, stops briefly at every pumpkin, then turns back to the guilty one and examines it
  // until the verdict at 5.5 s (unchanged, so the 3D scene and sounds stay in sync).
  function paint(t) {
    const {entries, dq, trackIndex} = race;
    const {c, w, h} = canvasContext(canvas), cell = w / entries.length, py = h * .65;
    c.fillStyle = '#e8e8d9'; c.fillRect(0, 0, w, h);
    entries.forEach((p, i) => {
      renderPumpkin(c, p, (i + .5) * cell, py, Math.min(30, cell * .3));
      c.textAlign = 'center'; c.fillStyle = teamColors[i]; c.font = '10px "IBM Plex Mono"';
      c.fillText(nameOf(p, i).slice(0, 13), (i + .5) * cell, py + 45);
      if (t >= GAME_VERDICT) {
        c.fillStyle = i === dq ? '#ac3c37' : '#46673a';
        c.fillText(i === dq ? 'DQ · $0' : 'CLEARED', (i + .5) * cell, py + 65);
        c.fillText('△ ' + properties(p).artificial, (i + .5) * cell, py + 82);
      }
    });
    const pose = route(t, entries.length, cell, w, dq);
    c.save();
    if (pose.left) { c.translate(pose.x * 2 + 40, 0); c.scale(-1, 1); } // face the way he walks
    inspectorFigure(c, pose.x, py + 35, .78, pose.walking, pose.examine, t);
    c.restore();
    el.querySelector('.verdict').textContent = t < GAME_VERDICT ? pose.say
      : dq < 0 ? 'Everyone is cleared. Tied highest scores are allowed.'
      : `${nameOf(entries[dq], dq)} has the unique highest artificiality. Disqualified from ${tracks[trackIndex].name}.`;
  }
}

// Where the inspector is at time t (the game's 0..7 s timeline). The figure stands 48 px left of
// the pumpkin it is looking at. Returns {x, walking, examine, left, say}.
function route(t, n, cell, w, dq) {
  // He stands 48 px left of a pumpkin; for the first pumpkin that would be off the canvas, so he
  // examines it from its right-hand side instead (facing left).
  const spot = i => Math.max(4, (i + 0.5) * cell - 48);
  const dqSide = dq >= 0 && (dq + 0.5) * cell - 48 < 4 ? {x: (dq + 0.5) * cell + 8, left: true} : {x: (dq + 0.5) * cell - 48, left: false};
  const PASS0 = 0.9, PASS1 = dq >= 0 ? 3.7 : 5.3, BACK = 4.5;
  if (t < PASS0) return {x: -60 + (spot(0) + 60) * (t / PASS0), walking: true, examine: false, say: 'The inspector is arriving…'};
  if (t < PASS1) { // walk the line, pausing to look at each pumpkin
    const per = (PASS1 - PASS0) / n, k = Math.min(n - 1, Math.floor((t - PASS0) / per)), u = (t - PASS0 - k * per) / per;
    const look = 0.55; // share of each pumpkin's time spent looking
    if (u < look || k === n - 1) return {x: spot(k), walking: false, examine: true, say: 'Checking artificial coat, core and grooves…'};
    const v = (u - look) / (1 - look);
    return {x: spot(k) + (spot(k + 1) - spot(k)) * v, walking: true, examine: false, say: 'Checking artificial coat, core and grooves…'};
  }
  if (dq < 0) { // nobody to disqualify: off to the right
    const v = Math.min(1, (t - PASS1) / (7 - PASS1));
    return {x: spot(n - 1) + (w + 60 - spot(n - 1)) * v, walking: true, examine: false, say: 'Checking artificial coat, core and grooves…'};
  }
  if (t < BACK) { // back to the guilty pumpkin
    const v = (t - PASS1) / (BACK - PASS1), from = spot(n - 1), to = dqSide.x;
    return {x: from + (to - from) * v, walking: to !== from, examine: false, left: to < from, say: 'Hold on… one of these needs a closer look.'};
  }
  if (t < 5.5) return {x: dqSide.x, walking: false, examine: true, left: dqSide.left, say: 'Measuring the artificial score…'};
  const v = Math.min(1, (t - 5.5) / 1.5); // verdict given: walks off to the right
  return {x: dqSide.x + (w + 60 - dqSide.x) * v, walking: true, examine: false, say: ''};
}
