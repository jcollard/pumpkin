# PUMPKIN 3D: architecture for contributors

A static three.js (r187) site that replays races from the Pumpkin game in 3D. No build step;
ES modules through the import map in `index.html` (`three` → `vendor/three/three.module.js`,
`three/addons/` → `vendor/three/addons/`). Published on GitHub Pages as a folder of the game's fork.

## Golden rule: results come from the game
`src/physics.js` is generated from the game's `index.html` by `tools/extract-physics.mjs`. **Never edit it.**
The viewer only *plays back* frames the game computed (`P.simulateFleet`). Lanes across the track are
display-only (pumpkins never touch in the game). Anything after a pumpkin's run ends (coasting past the
line, shattering) is decoration.

## World conventions (every track)
- +X runs down the race from the start (x = 0) to the finish (x = course.length). +Y is up (metres). +Z is the
  sea / open side; the track centre line is z = 0. Track half width `course.roadHalf` (≈4 m).
- For 0 ≤ x ≤ length the racing surface height is exactly `course.roadY(x) = H0 - track.drop(x)`.
  Physics frames give `centerX, centerY` relative to the start; world position is `(centerX, H0 + centerY, lane)`.
- Sea level is y = 0 when a track has sea (`course.sea !== false`).
- Late-afternoon light by default; each course sets its own `sunDir`, `sky`, `fog`.

## Course object (returned by `track.createCourse()`)
Required: `id, name, trackIndex, track (P.tracks[i]), length, H0, roadHalf, roadY(x), terrainH(x,z), surfaceY(x,z),
colourAt(x,z,h,slope,outColor), hasSurface(x), sunDir (Vector3), sea (bool), terrain: {near:{x0,x1,z0,z1,step}, far:{...}}`.
Optional: `surfaceAt(x) -> 'dirt'|'wood'|'concrete'|'sand'` (sound), `sky` (Sky uniforms), `fog {color,near,far}`, `exposure`,
`sunColor`, `sunIntensity`, `hemi {sky,ground,intensity}`, `envIntensity`, `seaColor`, `dqSpot(team) -> {x,z}` (where a
disqualified pumpkin waits), plus any track-specific fields your own module uses.
`src/tracks/generic.js` has `createGenericCourse(id, options)`: a working baseline you can wrap or replace.
`terrainH` must keep the land just under the track (see the corridor blend in generic.js / bigsur course.js).

## Track module (`src/tracks/<folder>/index.js`, default export)
```js
export default {
  id, name, label, blurb,
  createCourse(),                                 // -> course
  async build(scene, renderer, course, {low}),    // add scenery; may be async (await models). Return env:
     // {group, board (timing board texture from props.finishGantry/startFinish), updateGate(t),
     //  crowdZones (from props.crowd), update(t, wallTime, {excitement, views, camera}),
     //  onRace({views, results, entries, netEvents, netOpenTimes, dq})}  // called once per race
  cameras: {NAME: {label, fov, key?: '7', ground?: false, allowDQ?: bool,
            rig: ({F, r, st, t, course, cut, self, views, focus}) => ({pos: Vector3, look: Vector3, smoothing?})}},
  planShots(views, {timeAtX, add, preroll, finishers, breaks}) -> extra,  // add(start, end, CAM, focusIndex, rate) highlight shots
  tickerEvents(views, extra) -> [{t, text, big?, sound?, opts?, pos?: () => Vector3}],
  preroll: 3,            // seconds before GO (longer if you stage something, e.g. an inspection)
  heroCam: 'VISTA', establishing: course => ({pos, look}),   // idle view before a race
  ambience: {sea, wind, gulls, crowd, birds, sealions, insects},  // 0..1 levels for the sound system
}
```
`src/tracks/index.js` loads `src/tracks/<folder>/index.js` automatically (folders: salinas, monterey, carmel, bigsur) and
falls back to the generic track if the module is missing. **Big Sur (`src/tracks/bigsur/`) is the reference implementation.**

Common cameras (director.js): START, CHASE(1), TV tracking(2), DRONE(3), HELI(4), ONBOARD(5), ROADSIDE(6), FINISH(8), ORBIT,
FREE(9). Key 7 is free for your track's hero camera. The auto director fills gaps between your highlight shots with a cycle
of common cameras on the leader, adds the finish, broken pumpkins and the victory lap. Slow motion = pass `rate` < 1 to `add`.

Views (`src/pumpkins.js` PumpkinView): `v.result` (game result: status, time, events[], frames[]), `v.root.position`
(world), `v.radius`, `v.lane`, `v.state {x, v (m/s), air, dur, done}`, `v.name`, `v.color`, `v.team`.
Useful game events in `v.result.events`: JUMP, LANDING (energy), CAUGHT/RELEASED (net, t), NET OPEN (also in netEvents).

## Shared building blocks (keep using these; add to them only in a backward-compatible way)
- `src/env/world.js`: sky, sea, sun, shadows, terrain meshes from the course (main.js calls these for you).
- `src/env/props.js`: `sharedMaterials()`, `dirtTrack`, `fence`, `bales`/`baleRows`, `sign`, `gantry`, `finishGantry`,
  `startGate`, `chalkLine`, `startFinish` (does start+finish+gate+chalk), `crowd(group, course, zones)`, `clothTexture`.
- `src/env/flora.js`: `scatter`, `trees(group, kind, points)` with kinds `cypress`, `redwood`, `oak`; `shrubs`, `rocks`,
  `rockGeometry`, `cloudBank`, `soaringBirds`.
- `src/env/geom.js`: `samples, ribbon, beam, box, rod, merge, mesh, instanced, mat4, blob, coloured, slopeAt`.
- `src/env/models.js`: `loadModel(path)`, `place(group, path, {x,y,z,rotY,scale})`, `scatterModel(group, path, points)`.
- `src/textures.js`: procedural canvas textures (dirt, wood, straw, signs, chalk, checker, clouds, …).
- `assets/CATALOG.md`: CC0 models/textures/HDRIs (being assembled; read it, use what fits). Paths are relative to index.html.

## Image generation (optional, for gaps such as building facades or banners)
A few textures were generated with an image model (`google/gemini-2.5-flash-image` via OpenRouter, about $0.04 per
image). Keep API keys out of the repository.
Save results as compressed JPG/PNG under `assets/`. Record generated assets in `assets/LICENSES.md` as
"generated with Gemini via OpenRouter". Prefer CC0 assets; generate only what you can't find.

## Testing
Serve the folder with any static server (for example `python3 -m http.server`).
- A small Playwright script that opens `#track=<id>&codes=…`, pauses at time t on a camera and saves a screenshot
  (`window.__pumpkin3d.simT = t; window.__pumpkin3d.setCamMode('CHASE')`),
  and prints console errors/warnings and the race results. Cameras: AUTO, START, CHASE, TV, DRONE, HELI, ONBOARD,
  ROADSIDE, FINISH, ORBIT, FREE and your own. Copy the script if you need changes; don't edit the original.
- Headless Chromium uses software rendering (slow but faithful). Look at your screenshots, critique them like an art
  director, and iterate.
- In the page: `window.__pumpkin3d` has `simT` (settable), `pause()`, `play()`, `setCamMode(name)`, `views`, `plan`, `state`.

## Budgets
- Keep every track loading in a few seconds on a laptop: aim for under ~300k triangles visible, under ~400 draw calls
  (use instancing and merging), shadows only from the sun, and textures at 1K or smaller.
- `{low: true}` must reduce counts noticeably (fewer trees and props, coarser terrain).
- Total new assets per track: ideally under ~8 MB.

## Viewer features owned by main.js (for reference)
- **Default field: 4 pumpkins** (up to 8 supported). Lanes are 1.6 m apart for 4 (z ≈ ±0.8, ±2.4), narrower for more.
- **Pre-roll** defaults to 5 s: a LINEUP dolly past the grid (with a caption per pumpkin), then START. A track that adds a
  shot starting at `-preroll` replaces the lineup (Carmel's inspection does).
- **Inspection pop-up** (tracks with `track.inspection`): the original game's 2D inspector, extracted verbatim by
  `tools/extract-inspector.mjs` into `src/inspector2d.js`, plays in a panel above the controls from `start = -preroll + 0.4`
  for `D = clamp(preroll - 2.6, 4, 7)` s; verdict at `start + D·5.5/7`. `onRace` receives `inspection: {start, duration, verdict}`.
- **Picture-in-picture** (`src/pip.js`): live chase insets for 2nd–4th place on the right edge (toggle P).
- **Garage** (`src/garage.js`, key G): turntable cards using `buildPumpkinModel(p, {cutaway})` from pumpkins.js.
- **Auto director**: never repeats a camera back to back, weights cameras by the situation, varies shot lengths, sometimes
  follows the closest battle. Tracks can add pool cameras with `cyclePool: {NAME: {min, max, weight, when({t, sit, course})}}`.
- **HUD safe area** (1280×720): bottom 160 px controls; top-left standings (~300 px wide); right edge PiP insets
  (~250×140 px ×3 from y=62); keep camera subjects in the centre band.
- **Videos**: `node tools/render-video.mjs --track <id> --codes <json> --out <mp4>` renders frame-exact MP4s (HUD in a clean
  broadcast layout). Uses the GPU via WSL D3D12 by default (`SOFTWARE=1` for SwiftShader).
- **Showcase pumpkins**: `docs/showcase-codes.md`, `docs/showcase-a.json` (varieties/coats), `docs/showcase-b.json` (odd builds).

## Shared helpers added in the visual pass (all optional; old calls still work)
- `flora.grass(group, course, {x0, x1, near, far, density, zones, palette: 'dry'|'golden'|'green'|'coastal'|[hex], flowers, pebbles, low, seed})`:
  dense verge grass, wildflowers and pebbles; skips the racing surface, bridges and water. The biggest realism win near cameras.
- `flora.trees(group, kind, points, {low, variants, tint})` kinds: cypress, redwood, oak, pine, eucalyptus (leaf-card crowns with sway);
  `flora.shrubs(..., {kind: 'scrub'|'sage'|'needle'})`, `flora.seaStacks`, `flora.rocks(..., {shape: 'craggy', wet})`, `flora.pebbles`.
- `world.js`: automatic photo-textured terrain (`course.groundSets`, `course.splatAt`), shore foam on sea tracks
  (`scene.userData.shoreFoam.addRocks([{x, z, r}])`, `course.foam: false` to disable), `noReflect(...objs)` to keep objects out of the
  sea reflection, extra course fields `seaSunColor, seaGlint, shallowColor, shallowAmount, envGround, envSunDisc`.
- `surface.js`: `pbr(name)` and `worldDetail(material, {set, scale, mode: 'planar'|'triplanar'|'side'})` for photo detail on any material.
- `geom.js`: `instancedChunks` (instancing with culling cells), `taperedTube`.
- `props.js`: `crowd(...)` (CC0 people, one draw call) returns `{zones, update(wall, excitement, camera), ready}`; dressing helpers
  `bunting, flagPole, canopyTent(s), picnicTable(s), umbrellas, campChairs, coolers, crowdDressing(group, course, zone)`;
  `startGate` is a boom barrier (raised until t = -2.2).
- Budgets: count shadow and reflection passes too. Live quality (src/quality.js) throttles shadow/reflection refresh and resolution.
- The auto director folds shots shorter than 1.2 s on screen into a neighbour, and treats same-camera segments as one shot.
