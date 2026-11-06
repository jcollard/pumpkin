// Render a race to MP4, frame by frame (smooth even on slow machines).
//
//   node tools/render-video.mjs --track big-sur --codes docs/showcase-a.json --out race.mp4 \
//        [--fps 30] [--size 1280x720] [--workers 8] [--url http://127.0.0.1:8791/index.html] [--tail 6] [--start -5]
//
// Needs playwright-core (installed next to this tool, or point PW_DIR at a folder that has it), a Chromium build
// (CHROME, default the Playwright cache) and ffmpeg on PATH. Serve the project folder first.
// Frames follow the auto director, including slow motion. The HUD is included.
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : a), []));
// playwright-core from PW_DIR, next to this tool, or the folder you run it from.
const pwFrom = [process.env.PW_DIR, new URL('.', import.meta.url).pathname, process.cwd() + '/'].filter(Boolean);
const CHROME = process.env.CHROME || `${os.homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const {chromium} = (() => {
  for (const dir of pwFrom) { try { return createRequire(dir.endsWith('/') ? dir : dir + '/')('playwright-core'); } catch {} }
  throw Error('playwright-core not found: npm i playwright-core here, or set PW_DIR');
})();
const track = args.track || 'big-sur', fps = +(args.fps || 30), [W, H] = (args.size || '1280x720').split('x').map(Number);
const workers = +(args.workers || 4), tail = +(args.tail || 6), url = args.url || 'http://127.0.0.1:8791/index.html';
const out = resolve(args.out || `${track}.mp4`);
const codes = args.codes ? JSON.parse(readFileSync(args.codes, 'utf8')) : null;
const frameDir = resolve(args.frames || `${out}.frames`);
const hash = `#capture=1&quality=high&track=${track}${codes ? '&codes=' + codes.map(encodeURIComponent).join(',') : ''}${args.extra ? '&' + args.extra : ''}`;

// GPU by default (on WSL this goes through D3D12 to the real graphics card); SOFTWARE=1 forces SwiftShader.
const GPU = process.env.SOFTWARE !== '1';
const browser = await chromium.launch({executablePath: CHROME, headless: true,
  args: GPU ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  env: GPU ? {...process.env, GALLIUM_DRIVER: process.env.GALLIUM_DRIVER || 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME || 'NVIDIA',
    LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, '/usr/lib/wsl/lib'].filter(Boolean).join(':')} : process.env});
// Wait for the race; with no --codes the setup dialog opens, so press RACE with its defaults.
async function raceReady(page) {
  await page.waitForFunction(() => window.__pumpkin3d?.views?.length || document.querySelector('#setup')?.open, null, {timeout: 180000});
  if (await page.evaluate(() => !window.__pumpkin3d?.views?.length)) await page.click('#race');
  await page.waitForFunction(() => window.__pumpkin3d?.views?.length && window.__pumpkin3d.plan, null, {timeout: 180000});
}
async function openPage() {
  const page = await browser.newPage({viewport: {width: W, height: H}});
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(url + hash);
  await raceReady(page);
  await page.evaluate(() => window.__pumpkin3d.capture.begin());
  return page;
}

// Frame times: the playback clock at 1× with the director's slow motion.
const first = await openPage();
const times = await first.evaluate(({fps, tail, start}) => {
  const p = window.__pumpkin3d, shots = p.plan.shots, end = p.plan.allDone + tail;
  const rateAt = t => { for (let i = shots.length - 1; i >= 0; i--) if (t >= shots[i].start) return shots[i].rate ?? 1; return 1; };
  const out = [];
  for (let t = start ?? -p.state.course.preroll; t <= end; t += rateAt(t) / fps) out.push(t);
  return out;
}, {fps, tail, start: args.start === undefined ? undefined : +args.start});
console.log(`${track}: ${times.length} frames (${(times.length / fps).toFixed(1)} s of video), ${workers} workers`);

// --reuse keeps frames from an earlier run (e.g. to redo only the sound pass).
const haveAll = existsSync(frameDir) && times.every((_, i) => existsSync(join(frameDir, `${String(i).padStart(5, '0')}.png`)));
const reuse = args.reuse && haveAll;
if (!reuse) { if (existsSync(frameDir)) rmSync(frameDir, {recursive: true}); mkdirSync(frameDir, {recursive: true}); }
else console.log('Reusing rendered frames');
const chunk = Math.ceil(times.length / workers), WARM = Math.round(fps * 1.5);
let done = 0;
const t0 = Date.now();
// A frame is good if the graphics context is alive and the picture isn't blank.
const frameOk = page => page.evaluate(() => {
  const gl = window.__pumpkin3d.renderer.getContext();
  if (gl.isContextLost()) return false;
  const px = new Uint8Array(4 * 4 * 4);
  gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return !px.every(v => v > 250);
}).catch(() => false);
const renderFrame = (page, i) => page.evaluate(([t, dt]) => window.__pumpkin3d.capture.frame(t, dt), [times[i], 1 / fps]);
let retries = 0;
if (!reuse) await Promise.all(Array.from({length: workers}, async (_, w) => {
  const a = w * chunk, b = Math.min(times.length, a + chunk);
  if (a >= b) return;
  let page = w === 0 ? first : await openPage();
  const warm = async i => { for (let k = Math.max(0, i - WARM); k < i; k++) await renderFrame(page, k); };
  await warm(a); // camera smoothing for the frames before this chunk (not saved)
  for (let i = a; i < b; i++) {
    for (let attempt = 0; ; attempt++) {
      await renderFrame(page, i).catch(() => {});
      if (await frameOk(page)) break;
      if (attempt >= 3) throw Error(`Frame ${i} keeps failing to render`);
      // Lost the GPU context (or a blank frame): start a fresh page and pick up where we were.
      retries++;
      if (page !== first) await page.close().catch(() => {});
      page = await openPage(); await warm(i);
    }
    await page.screenshot({path: join(frameDir, `${String(i).padStart(5, '0')}.png`), timeout: 120000});
    if (++done % 50 === 0) console.log(`  ${done}/${times.length} frames, ${((Date.now() - t0) / done / 1000 * workers).toFixed(1)} s/frame/worker`);
  }
  if (page !== first) await page.close(); // free its WebGL context for the sound pass
}));
if (retries) console.log(`Recovered from ${retries} lost or blank frames`);
await first.close().catch(() => {});
// Optional sound: replay the race in real time and record the audio engine's output.
let audioFile = null;
if (args.audio !== undefined && args.audio !== 'false') {
  const page = await browser.newPage({viewport: {width: 640, height: 360}});
  page.on('pageerror', e => console.error('[audio page]', e.message));
  await page.goto(url + hash.replace('capture=1', 'capture=0'));
  await raceReady(page);
  const b64 = await page.evaluate(async ({start, end}) => {
    const p = window.__pumpkin3d;
    await p.audioReady; const audio = p.audio;
    if (!audio.captureStream) return null;
    await audio.start();
    const rec = new MediaRecorder(audio.captureStream(), {mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000});
    const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    p.pause(); p.simT = start; p.state.userRate = 1; p.state.inspectionStarted = p.state.inspectionConfirmed = true; // no waiting for the inspection buttons
    await new Promise(r => setTimeout(r, 300));
    rec.start(250); p.play();
    await new Promise(r => { const tick = () => (p.simT >= end ? r() : setTimeout(tick, 20)); tick(); });
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    const buf = new Uint8Array(await new Blob(chunks, {type: 'audio/webm'}).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, {start: times[0], end: times.at(-1)});
  if (b64) { audioFile = `${out}.webm`; (await import('node:fs')).writeFileSync(audioFile, Buffer.from(b64, 'base64')); console.log('Recorded audio pass'); }
  else console.log('Audio engine has no captureStream(); video will be silent.');
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frameDir, '%05d.png'),
  ...(audioFile ? ['-i', audioFile, '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out]);
if (audioFile) rmSync(audioFile);
await browser.close();
if (!args.keep) rmSync(frameDir, {recursive: true});
console.log(`Wrote ${out} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
