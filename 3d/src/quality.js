// Live render quality. "Auto" watches the real frame rate and steps quality down when
// rendering is slow (and back up when there's headroom). Every knob here changes instantly,
// without rebuilding the scene: render resolution, how often shadows and sea reflections
// refresh, and how many picture-in-picture insets are drawn.
// "Lighter scenery" (fewer trees, coarser terrain) is separate and needs a reload.

export const STEPS = [
  {name: 'Minimum', pr: 0.6, shadowEvery: 6, reflectEvery: 0, pips: 3},
  {name: 'Low', pr: 0.8, shadowEvery: 3, reflectEvery: 4, pips: 3},
  {name: 'Medium', pr: 1.0, shadowEvery: 2, reflectEvery: 2, pips: 3},
  {name: 'High', pr: 1.5, shadowEvery: 1, reflectEvery: 1, pips: 3},
  {name: 'Ultra', pr: 2.0, shadowEvery: 1, reflectEvery: 1, pips: 3},
];
export const MODES = {auto: 'Auto', ultra: 'Ultra', high: 'High', medium: 'Medium', low: 'Low'};
const STEP_OF = {ultra: 4, high: 3, medium: 2, low: 1};
// Aim for a steady 30 fps or better. A display's vsync rounds frame rates to 60, 30, 20…, so a reading of
// 30 means "just over budget", not stutter; step down below that, and only climb back after sustained 55+.
const WINDOW = 2, SLOW = 28, FAST = 55, UP_COOLDOWN = 30;

// A first guess before any measurement: software renderers, integrated or mobile GPUs start at Medium.
function guessStep(renderer) {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const weakGpu = /swiftshader|llvmpipe|software|intel|mali|adreno|powervr|videocore/i.test(name);
    const weakDevice = (navigator.hardwareConcurrency || 8) <= 4 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    return weakGpu || weakDevice ? 2 : 3;
  } catch { return 2; }
}

export function createQuality(renderer, {onChange = () => {}} = {}) {
  let mode = localStorage.getItem('pumpkin3d-gfx2') || 'low'; // Low by default; Auto and higher are in the menu
  if (!MODES[mode]) mode = 'auto';
  let step = mode === 'auto' ? guessStep(renderer) : STEP_OF[mode];
  let frameNo = 0, times = [], elapsed = 0, fps = 0, good = 0, slow = 0, sinceDown = Infinity, warmup = 3;

  const apply = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, STEPS[step].pr));
    onChange(STEPS[step]);
  };
  const restartWindow = () => { times = []; elapsed = 0; };

  return {
    get mode() { return mode; },
    get step() { return STEPS[step]; },
    get fps() { return fps; },
    get label() { return mode === 'auto' ? `Auto · ${STEPS[step].name}` : STEPS[step].name; },
    setMode(m) {
      mode = MODES[m] ? m : 'auto';
      localStorage.setItem('pumpkin3d-gfx2', mode);
      step = mode === 'auto' ? Math.min(step, 3) : STEP_OF[mode];
      good = slow = 0; restartWindow(); warmup = 1;
      apply();
    },
    apply,
    // New scene or race: ignore the first seconds (shader compiles, loading hitches).
    settle(seconds = 3) { warmup = seconds; restartWindow(); },
    // Call once per rendered frame with the real (unclamped) frame time.
    // active=false while hidden, in a dialog or capturing.
    tick(realDt, active) {
      frameNo++;
      if (!active || document.hidden) { restartWindow(); return; }
      if (warmup > 0) { warmup -= realDt; return; }
      times.push(realDt); elapsed += realDt; sinceDown += realDt;
      if (elapsed < WINDOW) return;
      // The median frame time ignores one-off hitches.
      const median = times.sort((a, b) => a - b)[times.length >> 1];
      fps = 1 / Math.max(1e-3, median); restartWindow();
      if (mode !== 'auto') return;
      if (fps < SLOW) {
        // Step down after two slow readings in a row, or at once if it's very slow.
        if ((++slow >= 2 || fps < 24) && step > 0) { step--; slow = good = 0; sinceDown = 0; warmup = 1; apply(); }
      } else {
        slow = 0;
        if (fps >= FAST && ++good >= 3 && sinceDown > UP_COOLDOWN && step < 3) { step++; good = 0; warmup = 1; apply(); }
        else if (fps < FAST) good = 0;
      }
    },
    shadowsDue() { const n = STEPS[step].shadowEvery; return n > 0 && frameNo % n === 0; },
    reflectDue() { const n = STEPS[step].reflectEvery; return n > 0 && frameNo % n === 0; },
    get pips() { return STEPS[step].pips; },
  };
}
