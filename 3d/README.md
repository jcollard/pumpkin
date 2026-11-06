# PUMPKIN 3D

A 3D way to watch races from the Pumpkin game, on four tracks inspired by the Monterey County coast:
**Salinas** (100 m sprint), **Monterey** (1 km with fishing nets), **Carmel** (250 m crest sprint with an
inspection) and **Big Sur** (500 m with a jump over a broken bridge). It runs the game's own physics, unchanged,
then plays the races back with three.js, so times, places, prize money, disqualifications and breakages always
match the 2D game.

## Run it

Any static file server works:

```sh
cd pumpkin3d
python3 -m http.server 8000
# open http://localhost:8000/
```

Paste up to 8 share codes (PL6…), pick a track or **Full circuit** (all four races with prize money and a
championship table), and press **RACE**. Races are tuned for 4 pumpkins. The URL updates to `#track=…&codes=…`
(or `#circuit=1&codes=…`), so a link replays the same race.

## Put it in the fork

Copy this folder into the fork as `3d/`, next to the game's `index.html`. GitHub Pages serves it at
`https://<user>.github.io/pumpkin/3d/`. No build step.

When the game's `index.html` changes, refresh the copied game code:

```sh
node 3d/tools/extract-physics.mjs     # race physics  -> 3d/src/physics.js
node 3d/tools/extract-inspector.mjs   # 2D inspector  -> 3d/src/inspector2d.js
node 3d/tools/credits.mjs             # asset credits -> 3d/assets/CREDITS.md
```

Both extract tools copy the game's code verbatim and stop with an error if something they need has gone.

## Watching

- **Auto director** picks shots from the race itself: highlight shots per track (the Bixby jump in slow motion,
  nets snapping, the Carmel inspection, photo finishes), never the same camera twice in a row.
- **Picture-in-picture**: live insets for 2nd, 3rd and 4th place (P).
- **Lineup**: before each race the camera glides past the grid with a caption per pumpkin.
- **Garage** (G): every pumpkin on a turntable, whole and cut away (skin thickness, seed or steel core), at true
  relative size, with its build and result. "Preview pumpkins" in the setup dialog opens it before racing.
- **Sound**: per-track ambience (surf, sea lions, meadowlarks, crowd), positional rolling sounds that change with
  speed and surface, and event sounds. Starts on your first click or key; M mutes.
- **Graphics**: Auto watches the frame rate and lowers render resolution, shadow and reflection refresh and the
  number of insets when it drops below about 30 fps, then climbs back when there is headroom. You can also fix it
  to Ultra, High, Medium or Low. "Lighter scenery" (setup dialog) reloads with fewer trees and coarser terrain.

| Key | Action |
|---|---|
| Space | Play / pause |
| 0 | Auto director |
| 1–9 | Chase, tracking, drone, helicopter, pumpkin cam, roadside, the track's hero camera, finish line, free camera |
| `[` `]` | Change which pumpkin the camera follows |
| ← → | Skip 2 seconds |
| P / G / L / M | Picture-in-picture / garage / labels / sound |
| R | Restart |

## Videos

```sh
node tools/render-video.mjs --track monterey --codes docs/video-monterey.json --out monterey.mp4 --audio
```

Renders every frame exactly (smooth even on a slow machine), follows the auto director including slow motion,
uses a clean broadcast layout, and records the sound in a real-time pass. Needs `playwright-core`, a Chromium
build and `ffmpeg`. It uses the GPU by default (on WSL through D3D12); `SOFTWARE=1` forces software rendering.

## Showcase pumpkins

`docs/showcase-codes.md` lists eight deliberately non-optimal builds (all three varieties, lumpy shapes, a 22 cm
and a 60 cm pumpkin, thick skin, natural and artificial coats, cores and grooves) and how each races.
`docs/video-<track>.json` are the four-pumpkin fields used for the showcase videos.

## How it fits together

See `docs/ARCHITECTURE.md` for the contracts. In short:

| Path | What it is |
|---|---|
| `src/physics.js`, `src/inspector2d.js` | Generated copies of the game's code. Never edit. |
| `src/main.js` | App: setup, races, circuit, HUD, events, quality, capture hooks. |
| `src/director.js` | Cameras and the automatic shot list. |
| `src/pumpkins.js` | Pumpkin models built from each code (variety, exact outline, coat, grooves, core) and posed from the game's frames. |
| `src/pip.js`, `src/garage.js`, `src/inspection-popup.js`, `src/quality.js`, `src/audio.js` | Picture-in-picture, garage, inspector pop-up, live quality, sound. |
| `src/env/` | Shared sky, sea, terrain, track surface, props, plants, models. |
| `src/tracks/<track>/` | Each track's course, scenery, cameras and highlights. Big Sur is the reference. |
| `assets/` | CC0 and CC-BY models, textures, skies and sounds (see `assets/CREDITS.md`), plus a few generated images. |
| `vendor/three/` | three.js r187, unmodified (MIT). |

## Credits

Models, textures, skies and sounds are CC0 or CC-BY; `assets/CREDITS.md` lists everything in use with the credit
lines CC-BY requires, and the in-app Credits link shows it. A few textures were generated with Gemini via
OpenRouter for this project (noted in the per-track `LICENSES.md` files).
