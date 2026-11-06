# Sound

The sound system is `src/audio.js` (entry point) with helpers in `src/audio/`:

| File | What it does |
|---|---|
| `src/audio.js` | `createAudio()`: AudioContext, buses, master compressor and limiter, file loading, slow motion, pause, listener. |
| `src/audio/sfx.js` | One-shots (`play(name)`): samples layered with synthesis, polyphony cap, per-name gaps. |
| `src/audio/rolling.js` | Rolling sound per pumpkin (pool of 4 voices, HRTF panners, Doppler, surface recipes). |
| `src/audio/ambience.js` | Track ambience scenes (beds, wind, scattered calls) and the crowd. |
| `src/audio/dsp.js` | Generated buffers: noise colours, crackle, reverb impulse, Karplus-Strong rope, creak, gust and swell curves. |
| `src/audio/manifest.js` | Generated list of files, loop points and sprite regions. |

All recordings are CC0; sources are in [LICENSES.md](LICENSES.md). Every recording has a synthesized
stand-in, so if a file fails to load (offline, 404) the sound still plays, just less realistically.
Total size of the MP3s: 3.8 MB (28 files, 44.1 kHz; beds 96 kbps stereo, point sources 64–80 kbps mono).

## Ambience

Levels are the defaults per track (0..1); any key passed to `setTrack(id, ambience)` overrides them.
Track changes crossfade over 2.5 s. Loops are stored with 0.25 s of wrapped audio before and after the
loop region (`loop: [start, length]` in the manifest) and an equal-power crossfade at the seam, so they
loop cleanly whether or not the browser's MP3 decoder trims the encoder delay.

| Layer | Source | Notes |
|---|---|---|
| Surf, Big Sur | file `surf-cliff.mp3` (24 s loop) | Big Lagoon (Northern California) surf, low-passed at 3.2 kHz to sound far below the cliffs. `sea` |
| Surf, Monterey | file `surf-harbour.mp3` (22 s loop) | Waves lapping on rocks. `sea` |
| Surf, Carmel | file `surf-beach.mp3` (24 s loop) | Calm beach waves with clear wave cycles. `sea` |
| Wind | synth | Stereo band-passed noise with looping gust curves, low buffeting rumble, a whistling edge on the Big Sur cliffs. Four characters: cliff, bay, beach, valley. `wind` |
| Gulls | file `gulls.mp3` (8 calls) | Herring gull calls, random pan, distance low-pass and pitch. Big Sur, Monterey, Carmel. `gulls` |
| Sea lions | files `sealions-colony.mp3` (22 s loop) + `sealions.mp3` (10 bark series) | California sea lions (Crescent City colony, Santa Cruz wharf). Monterey. `sealions` |
| Foghorn | file `foghorn.mp3` | Every 35–70 s, heavily low-passed. Monterey. `boats` |
| Raven | file `raven.mp3` (3 croak series) | Every 14–32 s. Big Sur. `ravens` |
| Dog | file `dog.mp3` (2 barks) | Distant, every 18–45 s. Carmel. `dog` |
| Meadowlarks | files `prairie-birds.mp3` (30 s loop) + `meadowlark.mp3` (9 songs) | Western meadowlarks, insects and grass wind from a Nebraska prairie morning. Salinas (and a little in Carmel). `birds` |
| Crickets | file `crickets.mp3` (15 s loop) | Band-passed 2.8–8 kHz. Salinas. `insects` |
| Tractor | file `tractor.mp3` (20 s loop, mono) | Low-passed, slowly drifting in and out (41 s cycle). Salinas. `tractor` |
| Crowd murmur | file `crowd-murmur.mp3` (20 s loop) | Level follows `crowdExcitement`. `crowd` |
| Crowd excited | file `crowd-cheer-loop.mp3` (16 s loop) | Fades in with excitement^1.5; a low-pass opens as excitement rises. `crowd` |

Cheer bursts: when the fast-smoothed excitement jumps 0.22 above the slow average (and is above 0.45),
the system plays `cheer` by itself, at most every 4.5 s (times the playback rate when fast-forwarding).

## Rolling (per pumpkin, synthesized)

Four voices are assigned to the loudest pumpkins at the listener (speed × distance), with stickiness so they
do not swap back and forth. Each voice: crackle noise through a band-pass (grit), brown noise low-pass (body),
a resonant band (hollow deck), high band (hiss), an LFO for the lumpy rotation (once per turn, or per plank
joint on wood), and an air band. Everything is panned with an HRTF `PannerNode` (pass `{hrtf: false}` for
equal-power on slow machines). Distance gain is `1 / (1 + (d − 3) / 4)` plus air absorption (low-pass falls
with distance). Doppler (±~1.5 semitones at 30 m/s, clamped) comes from on-screen motion, ignoring camera cuts.

| Surface | Character |
|---|---|
| dirt | strong crackle band around 2 kHz + body: gritty crunch |
| wood | resonant 120 Hz band, plank-joint rumble: hollow |
| concrete | smooth low hum, little grit, expansion-joint tick |
| sand | soft high hiss (4–6 kHz), little body |
| airborne | rolling silent; band-passed wind whoosh rising with speed |

## One-shots

| Name | Made of |
|---|---|
| `countdown` | synth: 880 Hz two-tone beep (UI bus, never muffled) |
| `go` | synth 1760 Hz beep + file `air-horn.mp3` |
| `gate` | file `wood.mp3`: a real wooden gate slam + a stick clack on top + a Kenney wood thump underneath, then a smaller clack (gate bouncing on its stop) |
| `land` | file `thud.mp3` (heavy body fall on dirt, Kenney punches) + synth sub thump + dirt spray; intensity scales level, weight and brightness |
| `shatter` | synth thump + file `crunch.mp3` (smashed melons/peppers) + file `splat.mp3` + 6–9 debris hits (`debris.mp3`) scattered over ~1.2 s |
| `netSnap` | synth rope crack + Karplus-Strong twang with falling pitch + file `rip.mp3` |
| `netCatch` | file `thud.mp3` (soft) + synth mesh rustle + generated stick-slip creak |
| `finish` | synth hand bell; place 1: three rings, 2–3: two, others one lower ring |
| `win` | file `crowd-cheer-big.mp3` + synth brass fanfare sting |
| `dq` | file `whistle.mp3` + file `crowd-ohh.mp3` |
| `whistle` | file `whistle.mp3` |
| `cheer` | file `crowd-cheer.mp3` (3 variants), length and level follow intensity |
| `gasp` | file `crowd-gasp.mp3` (8 oohs/aahs) |
| `whoosh` | synth band-passed noise sweep |
| `splash` | file `splash.mp3` |

Positional one-shots (`gate`, `land`, `shatter`, `netSnap`, `netCatch`, `whoosh`, `splash`) honour
`opts.position`: HRTF direction plus a gentle distance curve with a floor (−14 dB) so far events stay audible.
At most 14 one-shot voices ring at once (lowest priority, oldest first is stolen); each name has a minimum
gap and a maximum number of copies. When `rate > 1.5` gaps scale with the rate, copies drop by one and
one-shots are 2 dB quieter; at `rate >= 3` whooshes, gasps and soft landings are skipped.

## Slow motion, pause, master

- Slow motion (`slowmo`, or `rate < 0.6` with hysteresis to 0.7): world bus low-passed to 900 Hz,
  ambience and crowd loops pitched down to 0.8×, rolling filters and crackle rate ×0.62, one-shots played at
  0.72× pitch, reverb send 0.32, a low rumble pad, a down-sweep "whoomp" on entry and a short rising swoosh
  on exit.
- Pause (`playing: false`): rolling bus to 0 in ~0.1 s, ambience bus to −6 dB. One-shots already playing ring out.
- Master: volume (gain = volume², × 0.9) → compressor (−18 dB, 3.5:1) → limiter (−4 dB, 20:1, 1 ms) → −0.7 dB trim.
- `captureStream()` returns a `MediaStream` of the final mix (a `MediaStreamAudioDestinationNode` fed after the
  trim, created once; speakers keep playing). Volume and mute act before it. `context` is the AudioContext (null before `start()`).

## Measured levels

Rendered offline in headless Chromium (`tools/audio-test.html`, 48 kHz, after the master compressor/limiter).
dBFS; "short-term" is the loudest 100 ms window. Nothing clipped anywhere (0 samples ≥ 0.999).

| Render | Result |
|---|---|
| One-shots (files) | short-term −11.9 … −17.6 dB, peaks −1.9 … −7.4 dB. Loudest `dq` −11.9, `go` −12.2, `gasp` −12.6, `whistle` −12.6, `finish` −12.9; quietest `gate` −17.6 (small event, on purpose), `land` −15.6 at intensity 0.8 |
| One-shots (synth fallbacks only) | short-term −11.9 … −20 dB (gate fallback −20 to −25) |
| Ambience, 40 s, crowd at excitement 0.3 | Big Sur −22.7, Monterey −24.3, Carmel −23.8, Salinas −26.0 dB RMS; peaks ≤ −3.6 dB |
| Ambience, synth fallbacks only | −29 … −33.5 dB RMS |
| Crowd bed alone (level 0.5) | excitement 0: −36.5, 0.3: −32.9, 0.7: −27.0, 1: −24.2 dB RMS |
| Simulated race, 32 s (six pumpkins past a roadside listener + all events) | −16.7 … −18.4 dB RMS, peaks −1.9 dB; at 4× −16.1 dB RMS, peak −2.0 |
| Rolling, one pumpkin ~3 m away, 5 → 35 m/s | dirt −49 → −23 dB, centroid 640 → 1500 Hz; wood −45 → −18 dB, 135 → 285 Hz; concrete −45 → −19 dB, 180 → 775 Hz; sand −50 → −18 dB, 4.2 → 6.8 kHz |
| Pass-by at 30 m/s, 4 m | approaching −3.9 dB right-minus-left, receding +4.1 dB; centroid 514 Hz approaching vs 455 Hz receding (Doppler) |
| Slow motion (3–6 s of 9) | RMS −21.4 → −19.4 → −22.7 dB; spectral centroid 617 → 345 → 858 Hz |
| Pause (3–6 s of 9) | −19.3 → −30.7 → −25 dB RMS (rolling gone, ambience −6 dB) |
| `stopAll()` | silent (< −130 dB) within 1 s |
| 8 pumpkins + bursts of one-shots | 4 rolling voices; at 4× the burst is 2–3 dB quieter with fewer events |

Re-run: start any static server on the project, open `tools/audio-test.html`, or script it with headless
Chromium (`--autoplay-policy=no-user-gesture-required`) and call `renderOffline(trackId, seconds, {wav: true})`,
`renderOneShot(name)`, `renderRolling(surface)`, `renderSlowmo()`, `renderPause()`, `renderPassBy()`,
`renderCrossfade()`, `renderStack({rate})`. Each returns `{peakDb, rmsDb, clips, windows: [{t, rmsDb, peakDb, centroid}]}`
(+ `wav` as base64 with `{wav: true}`, or a download with `{download: true}`). Add `{files: false}` to hear the
synthesized fallbacks and `{hrtf: false}` for equal-power panning. Headless Chromium occasionally never finishes
an `OfflineAudioContext` that contains an HRTF panner; the page detects this within 4 s and throws, so reload
and retry (realtime playback is not affected).
