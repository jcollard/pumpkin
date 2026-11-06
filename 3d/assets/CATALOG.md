# Pumpkin 3D asset catalogue

Free models, PBR textures and sky HDRIs for the four coastal tracks (Salinas, Monterey, Carmel, Big Sur).
Everything here is **CC0** or **CC-BY 3.0** (credits in [LICENSES.md](LICENSES.md)). The same data, in a
machine-readable form, is in [catalog.json](catalog.json). Contact sheets: [preview.png](preview.png), plus
[nature](preview-nature.png), [people and props](preview-people-props.png), [buildings](preview-buildings.png) and
[textures](preview-textures.png). For a live version, serve the project root and open `tools/asset-preview.html`;
it can filter with `?cat=trees`, `?track=carmel`, `?q=barn` and pose rigs with `?anim=Clapping|Wave`.

**Totals:** 96 models (17.7 MB), 8 PBR texture sets (4.3 MB),
2 HDRIs (2.8 MB), and preview images plus catalog.json (1.9 MB).
**Total: 26.6 MB.**

## Conventions (all models)

- **Units are metres at scale 1.** Every model was rescaled to a realistic size and the scale was baked in, so a
  scale of `1` is real size. The "Scale" column gives a sensible random range for variety; `1` means use as-is.
- **+Y is up.** glTF's default forward is **+Z**. Characters and animals face +Z. Buildings and props keep their
  author's orientation; in the preview the blue axis is +Z, so you can see which way each one faces.
- **Origin:**
  - **base centre** (default): the bottom-centre of the bounding box sits at (0,0,0), so the model rests on y = 0.
  - **trunk base** (trees): x/z is at the trunk, because the crowns lean. Roots dip a little below y = 0, about
    0.2 m on small trees and about 1 m on the redwoods, so place the origin at ground level.
  - **feet** (rigged): x/z is between the feet and y = 0 is at the soles. The bounding box is the bind pose (T-pose),
    which is why people show as ~1.9 m wide.
- Plain `.glb` with embedded textures (JPG for opaque textures, PNG for alpha and flat palettes). There is no
  Draco, meshopt, KTX2, WebP or other glTF extension, so stock `GLTFLoader` is all you need.
- Static models were flattened, and their meshes merged per material, so most load as 1–4 draw calls.
- "Tris" is the triangle count. "Size" is the bounding box W × H × D (x × y × z) in metres.

## How to load

The loaders are vendored from three@0.187.0 in `vendor/three/addons/`. They are `loaders/GLTFLoader.js` (which
imports `utils/BufferGeometryUtils.js` and `utils/SkeletonUtils.js`), `loaders/HDRLoader.js`, and
`loaders/RGBELoader.js` (a deprecated alias of HDRLoader). The existing import map
(`"three/addons/": "./vendor/three/addons/"`) resolves them unchanged.

```js
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const gltfLoader = new GLTFLoader();
const cache = new Map();
const loadModel = (path) => {                      // path relative to assets/, e.g. 'models/trees/pine_a.glb'
  if (!cache.has(path)) cache.set(path, gltfLoader.loadAsync('assets/' + path));
  return cache.get(path);
};

// Static model: clone the scene per placement (geometry and materials are shared).
const barn = (await loadModel('models/farm/barn_big.glb')).scene.clone();
barn.position.set(40, groundY, -12);
barn.rotation.y = Math.PI / 2;
barn.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
scene.add(barn);

// Many copies (trees, grass, rocks): use InstancedMesh per mesh. The transforms are baked, so the geometry is already in metres.
const pine = (await loadModel('models/trees/pine_a.glb')).scene;
pine.traverse(o => {
  if (!o.isMesh) return;
  const inst = new THREE.InstancedMesh(o.geometry, o.material, count);
  // inst.setMatrixAt(i, matrix) for each placement, then scene.add(inst)
});

// Rigged people and the dog: SkeletonUtils.clone (plain .clone() breaks skinning), plus one mixer each.
const gltf = await loadModel('models/people/woman_casual.glb');
const fan = SkeletonUtils.clone(gltf.scene);
const mixer = new THREE.AnimationMixer(fan);
mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'HumanArmature|Female_Clapping')).play();
// each frame: mixer.update(dt). Start each fan at a random time (action.time = Math.random() * clip.duration) so the crowd doesn't move in sync.

// Sky: the HDR lights the scene; the JPG is a cheap background.
const pmrem = new THREE.PMREMGenerator(renderer);
const hdr = await new HDRLoader().loadAsync('assets/hdri/qwantani_late_afternoon_puresky_1k.hdr');
scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose();
const sky = await new THREE.TextureLoader().loadAsync('assets/hdri/qwantani_late_afternoon_puresky_2k.jpg');
sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
scene.background = sky;

// PBR ground texture: colour is sRGB; normal (OpenGL convention, which three.js expects) and roughness are linear.
const tl = new THREE.TextureLoader();
const tex = (file, srgb, repeat) => { const t = tl.load('assets/textures/' + file); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const rep = trackWidthMetres / 2.07;               // dirt_packed tile is 2.07 m
const dirt = new THREE.MeshStandardMaterial({ roughness: 1,
  map: tex('dirt_packed/color.jpg', true, rep), normalMap: tex('dirt_packed/normal.jpg', false, rep),
  roughnessMap: tex('dirt_packed/roughness.jpg', false, rep) });
```

Notes:
- **Foliage** uses `alphaTest` and is double-sided. If you replace the material, keep `alphaTest ≈ 0.45` and
  `side: DoubleSide`. For shadows from leaves, the default depth material already respects `alphaTest` when
  `map` is set.
- **Recolouring flat-colour models:** most have only a few materials named by colour or part. Clone a material
  before you change `.color`, or every instance changes.
- **Animation clip names** are listed per model below. People: `…_Clapping`, `…_Idle`, `…_Standing`,
  `…_Sitting` and `…_Walk`, or `Idle`, `Idle_Neutral`, `Wave`, `Walk` and `Interact` for the farmer and
  the beach-goer. Unused clips were removed to save space.

## Trees (`models/trees/`)

Quaternius **Stylized Nature MegaKit** (textured, hand-painted stylised look; 512 px bark colour + normal map, 1024 px alpha-cut leaf atlas). Leaves were switched from alpha *blend* to alpha *test* (`MASK`, cutoff 0.45, double-sided) so they sort correctly; re-colours and tints are baked into the files.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/trees/cypress_monterey_a.glb` | Monterey cypress, wind-sculpted (MegaKit "Twisted Tree", leaves recoloured from red to dark cypress green). Crown leans to +X/-Z; rotate freely for variety | 608 | 9564 | 16.73 | 13.5 × 16.7 × 11.6 | trunk base | 0.6–1.2 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Twisted Tree](https://poly.pizza/m/9aWlx82xUf) |
| `models/trees/cypress_monterey_b.glb` | Monterey cypress, wind-sculpted, variant b | 648 | 10089 | 16.07 | 11.4 × 16.1 × 11.5 | trunk base | 0.6–1.2 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Twisted Tree](https://poly.pizza/m/8oraKn9m0x) |
| `models/trees/cypress_monterey_c.glb` | Monterey cypress, wind-sculpted, variant c | 677 | 10104 | 15.66 | 9.49 × 15.7 × 9.39 | trunk base | 0.6–1.2 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Twisted Tree](https://poly.pizza/m/edSPJNECM7) |
| `models/trees/oak_round_a.glb` | Round broadleaf tree (stands in for coast live oak), leaves darkened to oak green. squash Y to 0.8 for a broader oak silhouette | 383 | 5648 | 10.5 | 6.13 × 10.5 × 5.87 | trunk base | 0.7–1.3 | Salinas, Carmel, Big Sur | CC0, Quaternius: [Tree](https://poly.pizza/m/aVOxaHRPWe) |
| `models/trees/oak_round_b.glb` | Round broadleaf tree / coast live oak, variant b | 442 | 6265 | 10 | 5.93 × 10.0 × 6.30 | trunk base | 0.7–1.3 | Salinas, Carmel, Big Sur | CC0, Quaternius: [Tree](https://poly.pizza/m/qZtx0AHhcy) |
| `models/trees/broadleaf_tall.glb` | Tall slender broadleaf tree (eucalyptus / sycamore stand-in). Windbreak rows along Salinas fields | 335 | 3505 | 9.43 | 4.06 × 9.43 × 4.24 | trunk base | 0.8–1.6 | Salinas, Carmel, Monterey | CC0, Quaternius: [Tree](https://poly.pizza/m/QVOop92WmG) |
| `models/trees/pine_a.glb` | Pine / Monterey pine | 245 | 3947 | 14.5 | 9.80 × 14.5 × 8.99 | trunk base | 0.6–1.4 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Pine](https://poly.pizza/m/rfnxJv0Rqa) |
| `models/trees/pine_b.glb` | Pine, variant b (taller, sparse lower branches) | 239 | 3370 | 16 | 9.07 × 16.0 × 8.39 | trunk base | 0.6–1.4 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Pine](https://poly.pizza/m/79gmlLnweB) |
| `models/trees/pine_c.glb` | Pine, variant c (dense conical) | 237 | 3648 | 14 | 10.9 × 14.0 × 9.91 | trunk base | 0.6–1.4 | Monterey, Carmel, Big Sur | CC0, Quaternius: [Pine](https://poly.pizza/m/Zt62gceKXZ) |
| `models/trees/redwood_a.glb` | Coast redwood (MegaKit pine scaled up, bark tinted red-brown, needles darkened). Trunk about 1.6 m across near the ground; sparse low branches. Group in clusters ("fairy rings") | 277 | 4964 | 34 | 16.6 × 34.0 × 18.4 | trunk base | 0.6–1.3 | Big Sur | CC0, Quaternius: [Pine](https://poly.pizza/m/699sFuLCN2) |
| `models/trees/redwood_b.glb` | Coast redwood, variant b. Trunk about 2.3 m across near the ground; dense crown | 166 | 1646 | 36 | 26.5 × 36.0 × 25.7 | trunk base | 0.6–1.3 | Big Sur | CC0, Quaternius: [Pine](https://poly.pizza/m/igSu0cPoBz) |

## Shrubs, grass, flowers (`models/plants/`)

Same MegaKit family as the trees. Grass tufts are opaque mesh blades (no alpha), cheap to instance by the thousand.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/plants/bush_coastal_sage.glb` | Round shrub, recoloured grey-green (coastal sage scrub) | 105 | 900 | 1.2 | 1.45 × 1.20 × 1.49 | base centre | 0.5–1.8 | all | CC0, Quaternius: [Bush](https://poly.pizza/m/EoTERLq3z2) |
| `models/plants/bush_flowering.glb` | Green shrub with pink flowers | 201 | 1368 | 1.2 | 1.45 × 1.20 × 1.49 | base centre | 0.5–1.5 | Carmel, Monterey, Salinas | CC0, Quaternius: [Bush with Flowers](https://poly.pizza/m/U1ymDy8tbY) |
| `models/plants/fern.glb` | Fern (sword-fern understorey). Under redwoods | 70 | 288 | 0.59 | 2.00 × 0.59 × 1.88 | base centre | 0.6–1.5 | Big Sur | CC0, Quaternius: [Fern](https://poly.pizza/m/jqcanvH7D6) |
| `models/plants/grass_tuft.glb` | Green grass tuft. Mesh blades, opaque (no alpha). Instance heavily | 14 | 155 | 0.5 | 0.24 × 0.50 × 0.28 | base centre | 1 | all | CC0, Quaternius: [Grass](https://poly.pizza/m/vUJjrRsFp4) |
| `models/plants/grass_dry_a.glb` | Dry golden grass tuft (short, wispy). California summer grass. Mesh blades, opaque | 31 | 494 | 0.55 | 0.68 × 0.55 × 0.62 | base centre | 1 | all | CC0, Quaternius: [Grass Wispy](https://poly.pizza/m/Msr9zx66VU) |
| `models/plants/grass_dry_b.glb` | Dry golden grass tuft (taller, wispy). Mesh blades, opaque | 35 | 622 | 0.8 | 0.74 × 0.80 × 0.76 | base centre | 1 | all | CC0, Quaternius: [Grass Wispy](https://poly.pizza/m/6EzB7VA6vb) |
| `models/plants/grass_tall.glb` | Tall green grass / reeds. Creek beds, ditches | 22 | 326 | 1 | 0.48 × 1.00 × 0.53 | base centre | 1 | Salinas, Big Sur | CC0, Quaternius: [Tall Grass](https://poly.pizza/m/JSIYtscPmP) |
| `models/plants/dune_grass.glb` | Dune grass (tall grass recoloured pale sea-green). For Carmel beach dunes | 22 | 326 | 0.8 | 0.38 × 0.80 × 0.42 | base centre | 0.6–1.3 | Carmel, Monterey | CC0, Quaternius: [Tall Grass](https://poly.pizza/m/JSIYtscPmP) |
| `models/plants/wildflowers_pink.glb` | Wildflower clump, pink | 153 | 755 | 0.5 | 0.36 × 0.50 × 0.39 | base centre | 0.6–1.4 | all | CC0, Quaternius: [Flower Group](https://poly.pizza/m/hfPzQAedOe) |
| `models/plants/wildflowers_yellow.glb` | Wildflower clump, yellow spikes (bush lupine / mustard look). Salinas mustard fields, Big Sur bluffs | 193 | 1690 | 0.6 | 0.43 × 0.60 × 0.33 | base centre | 1 | all | CC0, Quaternius: [Flower Group](https://poly.pizza/m/LqTljN6Wg2) |

## Rocks, sea stacks, cliff chunks (`models/rocks/`)

MegaKit rocks (one 1024 px painted texture each, desaturated/brightened towards coastal grey). Sea stacks and the cliff chunk are the same meshes stretched non-uniformly and baked.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/rocks/boulder_a.glb` | Boulder, flat-topped, mossy top. Sink ~10 % into the ground | 109 | 244 | 1.9 | 3.05 × 1.90 × 2.48 | base centre | 0.3–3 | all | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/KZdEP3uUpa) |
| `models/rocks/boulder_b.glb` | Boulder, rounded | 113 | 342 | 2.26 | 3.23 × 2.26 × 2.99 | base centre | 0.3–3 | all | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/s1OJ3bBzqc) |
| `models/rocks/boulder_c.glb` | Boulder, blocky/tall | 119 | 522 | 2.32 | 3.42 × 2.32 × 3.48 | base centre | 0.3–3 | all | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/JQxF95498B) |
| `models/rocks/sea_stack_a.glb` | Sea stack (boulder_c stretched to ~24 m tall). Place in the surf, base ~3 m under water. Texture is stretched; fine at distance | 119 | 522 | 24.32 | 20.5 × 24.3 × 20.9 | base centre | 1 | Big Sur, Carmel, Monterey | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/JQxF95498B) |
| `models/rocks/sea_stack_b.glb` | Sea stack, broad (boulder_b stretched to ~18 m). Rotate/scale for variety | 113 | 342 | 18.08 | 19.4 × 18.1 × 17.9 | base centre | 1 | Big Sur, Carmel, Monterey | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/s1OJ3bBzqc) |
| `models/rocks/cliff_chunk.glb` | Cliff / headland chunk (boulder_a stretched to ~11 m tall, 24 m wide). Embed into cliff faces / road cuttings | 109 | 244 | 11.39 | 24.4 × 11.4 × 19.8 | base centre | 1 | Big Sur, Carmel | CC0, Quaternius: [Rock Medium](https://poly.pizza/m/KZdEP3uUpa) |

## People (spectators) (`models/people/`)

Quaternius low-poly characters, rigged and animated, flat colours (no textures). Two packs share the look: *Animated Men/Women* (8 people) and *Ultimate Modular Men* (farmer, beach-goer; heavier mesh). The source files were ~4.8 m tall; a scaled root node fixes that, so do not rescale.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/people/man_a.glb` | Man, T-shirt and shorts (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Man_Clapping`, `HumanArmature\|Man_Idle`, `HumanArmature\|Man_Sitting`, `HumanArmature\|Man_Standing`, `HumanArmature\|Man_Walk` | 436 | 1852 | 1.78 | 1.91 × 1.78 × 0.35 | feet | 1 | all | CC0, Quaternius: [Man](https://poly.pizza/m/HMnuH5geEG) |
| `models/people/man_b.glb` | Man, red shirt (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Man_Clapping`, `HumanArmature\|Man_Idle`, `HumanArmature\|Man_Sitting`, `HumanArmature\|Man_Standing`, `HumanArmature\|Man_Walk` | 440 | 1854 | 1.78 | 1.91 × 1.78 × 0.35 | feet | 1 | all | CC0, Quaternius: [Man](https://poly.pizza/m/fjHyMd5Wxw) |
| `models/people/man_long_sleeves.glb` | Man, long sleeves (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Man_Clapping`, `HumanArmature\|Man_Idle`, `HumanArmature\|Man_Sitting`, `HumanArmature\|Man_Standing`, `HumanArmature\|Man_Walk` | 447 | 1970 | 1.8 | 1.93 × 1.80 × 0.38 | feet | 1 | all | CC0, Quaternius: [Man in Long Sleeves](https://poly.pizza/m/DLptRuewTn) |
| `models/people/man_suit.glb` | Man in suit (officials / commentators) (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Man_Clapping`, `HumanArmature\|Man_Idle`, `HumanArmature\|Man_Sitting`, `HumanArmature\|Man_Standing`, `HumanArmature\|Man_Walk` | 485 | 2058 | 1.8 | 1.93 × 1.80 × 0.39 | feet | 1 | all | CC0, Quaternius: [Man in Suit](https://poly.pizza/m/mQnGoME1ez) |
| `models/people/woman_casual.glb` | Woman, casual (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Female_Clapping`, `HumanArmature\|Female_Idle`, `HumanArmature\|Female_Sitting`, `HumanArmature\|Female_Standing`, `HumanArmature\|Female_Walk` | 526 | 2776 | 1.66 | 1.79 × 1.66 × 0.35 | feet | 1 | all | CC0, Quaternius: [Woman Casual](https://poly.pizza/m/jpKRgGDxhk) |
| `models/people/woman.glb` | Woman, red top (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Female_Clapping`, `HumanArmature\|Female_Idle`, `HumanArmature\|Female_Sitting`, `HumanArmature\|Female_Standing`, `HumanArmature\|Female_Walk` | 451 | 2004 | 1.66 | 1.79 × 1.66 × 0.34 | feet | 1 | all | CC0, Quaternius: [Woman](https://poly.pizza/m/AQsd9ngvKU) |
| `models/people/woman_tank_top.glb` | Woman, tank top (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Female_Clapping`, `HumanArmature\|Female_Idle`, `HumanArmature\|Female_Sitting`, `HumanArmature\|Female_Standing`, `HumanArmature\|Female_Walk` | 447 | 1983 | 1.66 | 1.78 × 1.66 × 0.34 | feet | 1 | all | CC0, Quaternius: [Woman in Tank Top](https://poly.pizza/m/XqzeZGB7iU) |
| `models/people/woman_dress.glb` | Woman in dress (rigged). Source is ~4.8 m tall; root node scaled 0.37. Play "…Clapping" for cheering spectators. Clips: `HumanArmature\|Female_Clapping`, `HumanArmature\|Female_Idle`, `HumanArmature\|Female_Sitting`, `HumanArmature\|Female_Standing`, `HumanArmature\|Female_Walk` | 425 | 1786 | 1.66 | 1.78 × 1.66 × 0.46 | feet | 1 | all | CC0, Quaternius: [Woman in Dress](https://poly.pizza/m/zMyPlQXBzq) |
| `models/people/farmer.glb` | Farmer with hat (rigged). Wave clip for spectators. Clips: `CharacterArmature\|Idle`, `CharacterArmature\|Idle_Neutral`, `CharacterArmature\|Interact`, `CharacterArmature\|Walk`, `CharacterArmature\|Wave` | 1065 | 5476 | 1.8 | 1.62 × 1.80 × 0.39 | feet | 1 | Salinas | CC0, Quaternius: [Farmer](https://poly.pizza/m/7pn3R6hPvE) |
| `models/people/beach_character.glb` | Beach-goer in shorts (rigged). Wave clip for spectators. Clips: `CharacterArmature\|Idle`, `CharacterArmature\|Idle_Neutral`, `CharacterArmature\|Interact`, `CharacterArmature\|Walk`, `CharacterArmature\|Wave` | 1177 | 6574 | 1.8 | 1.60 × 1.80 × 0.36 | feet | 1 | Carmel, Monterey | CC0, Quaternius: [Beach Character](https://poly.pizza/m/DojKLcO34E) |

## Animals (`models/animals/`)

Flat-colour low-poly. The dog is a rigged Quaternius model; the coastal animals are static Poly by Google models.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/animals/dog_shiba.glb` | Dog (Shiba Inu), rigged; clips Idle, Idle_2, Walk, Gallop, Eating. Carmel is famously dog friendly. Clips: `Eating`, `Gallop`, `Walk`, `Idle_2`, `Idle` | 698 | 1950 | 0.62 | 0.21 × 0.62 × 0.79 | feet | 1 | Carmel, all | CC0, Quaternius: [Shiba Inu](https://poly.pizza/m/y4wdQpg767) |
| `models/animals/sea_lion.glb` | California sea lion, propped up on flippers (static). Put several on wharf pilings, buoys and rocks | 54 | 714 | 1.05 | 1.33 × 1.05 × 1.23 | base centre | 1 | Monterey, Big Sur | **CC-BY 3.0**, Poly by Google: [Sea lion](https://poly.pizza/m/45HRvXYpvUG) |
| `models/animals/seagull_standing.glb` | Western gull, standing (static). Perch on posts, railings, rocks | 26 | 434 | 0.42 | 0.17 × 0.42 × 0.49 | base centre | 1 | Monterey, Carmel, Big Sur | **CC-BY 3.0**, Poly by Google: [Seagull](https://poly.pizza/m/0WRzrtCIIRp) |
| `models/animals/seagull_flying.glb` | Gull in flight, wings spread (static). Wingspan ~1.3 m. Animate by moving/banking the whole model | 31 | 410 | 0.65 | 1.21 × 0.65 × 1.30 | base centre | 1 | Monterey, Carmel, Big Sur | **CC-BY 3.0**, Poly by Google: [Flying seagull](https://poly.pizza/m/6Tpj_vcWP3f) |
| `models/animals/pelican_brown.glb` | Brown pelican, standing (static). Perched on piers and rocks | 94 | 1026 | 1.05 | 0.46 × 1.05 × 0.89 | base centre | 1 | Monterey, Big Sur, Carmel | **CC-BY 3.0**, Poly by Google: [Brown pelican](https://poly.pizza/m/2oAiRa4fave) |

## Props: flags, tents, stalls, furniture, beach (`models/props/`)

Flat-colour low-poly from several authors (Quaternius, Poly by Google, J-Toastie, S. Paul Michael, Daniel Doran, MiniPoly, BlenderVoyage).

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/props/flag_red.glb` | Red flag on a wooden pole. Pole ~4 m. Recolour material for team flags | 13 | 216 | 4.06 | 2.05 × 4.06 × 0.28 | base centre | 1 | all | CC0, Quaternius: [Flag](https://poly.pizza/m/FuOkF3WBrx) |
| `models/props/flags_triple.glb` | Three pennant flags on poles (blue, red, purple). Start/finish dressing | 171 | 2316 | 4.31 | 9.17 × 4.31 × 1.04 | base centre | 1 | all | CC0, MiniPoly: [Flags](https://poly.pizza/m/ahsyGj1RmE) |
| `models/props/pennant_marker.glb` | Course marker flag on weighted stand (red pennant). Line the track edge | 9 | 322 | 2.33 | 1.41 × 2.33 × 0.38 | base centre | 1 | all | CC0, Quaternius: [Goal Flag](https://poly.pizza/m/onAi7dx56P) |
| `models/props/canopy_striped.glb` | Market canopy with red/white striped roof, open sides. Food stalls, spectator shade | 23 | 384 | 3 | 6.10 × 3.00 × 3.17 | base centre | 1 | all | **CC-BY 3.0**, Poly by Google: [Canopy](https://poly.pizza/m/40tUFNg2fu4) |
| `models/props/canopy_popup_red.glb` | Pop-up event tent, red, one side wall. Team / timing tents | 10 | 150 | 3 | 3.10 × 3.00 × 3.10 | base centre | 1 | all | **CC-BY 3.0**, Poly by Google: [Canopy](https://poly.pizza/m/eXvS3l7k4DJ) |
| `models/props/canopy_popup_white.glb` | Pop-up gazebo, white roof with blue legs. Finish-line / VIP tent | 11 | 204 | 3.2 | 2.77 × 3.20 × 2.43 | base centre | 1 | all | **CC-BY 3.0**, Zsky: [Tent](https://poly.pizza/m/gQiLVDXMVg) |
| `models/props/market_stand_a.glb` | Wooden market stall with striped awning and crates. Fruit / vegetable stand | 82 | 1548 | 2.8 | 2.54 × 2.80 × 3.18 | base centre | 1 | Salinas, Carmel, Monterey | CC0, Quaternius: [Market Stand](https://poly.pizza/m/DGIM5HGISb) |
| `models/props/market_stand_b.glb` | Wooden market stall, awning, counter | 61 | 1132 | 2.8 | 1.39 × 2.80 × 3.10 | base centre | 1 | Salinas, Carmel, Monterey | CC0, Quaternius: [Market Stand](https://poly.pizza/m/hts7l0NZxW) |
| `models/props/picnic_table.glb` | Wooden picnic table with attached benches | 22 | 428 | 0.78 | 1.93 × 0.78 × 1.97 | base centre | 1 | all | **CC-BY 3.0**, J-Toastie: [Picnic Table](https://poly.pizza/m/LM6QWe8kFT) |
| `models/props/picnic_table_cloth.glb` | Picnic table with red-check tablecloth | 45 | 832 | 0.8 | 1.48 × 0.80 × 1.20 | base centre | 1 | all | **CC-BY 3.0**, J-Toastie: [Picnic Table](https://poly.pizza/m/GQieALI2C4) |
| `models/props/bench.glb` | Wooden park bench with backrest | 21 | 376 | 0.85 | 1.79 × 0.85 × 0.65 | base centre | 1 | all | CC0, Quaternius: [Bench](https://poly.pizza/m/jLxjFxFRpw) |
| `models/props/crate.glb` | Closed wooden crate | 34 | 784 | 0.6 | 0.60 × 0.60 × 0.60 | base centre | 1 | all | CC0, Quaternius: [Crate](https://poly.pizza/m/3OEFd1AWfa) |
| `models/props/crate_open.glb` | Open slatted fruit crate (empty) | 11 | 196 | 0.3 | 0.67 × 0.30 × 0.55 | base centre | 1 | Salinas, Monterey | CC0, BlenderVoyage: [Fruit Crate](https://poly.pizza/m/aXulVWHOeV) |
| `models/props/barrel.glb` | Wooden barrel | 73 | 1384 | 0.9 | 0.70 × 0.90 × 0.69 | base centre | 1 | all | CC0, Quaternius: [Barrel](https://poly.pizza/m/ONdghDBByN) |
| `models/props/life_ring.glb` | Life ring / float, orange and white, lying flat. Rotate 90° about X to hang on a post. Also usable as a mooring float | 49 | 3744 | 0.14 | 0.76 × 0.14 × 0.76 | base centre | 1 | Monterey, Carmel | **CC-BY 3.0**, Poly by Google: [Life preserver](https://poly.pizza/m/7n1vrlFN0GH) |
| `models/props/beach_umbrella_red.glb` | Beach umbrella, red/white | 18 | 214 | 2.3 | 1.94 × 2.30 × 1.73 | base centre | 1 | Carmel, Monterey | **CC-BY 3.0**, S. Paul Michael: [Red/White Beach Umbrella](https://poly.pizza/m/2li3sdSkmCI) |
| `models/props/beach_umbrella_blue.glb` | Beach umbrella, blue/white | 18 | 214 | 2.3 | 1.94 × 2.30 × 1.73 | base centre | 1 | Carmel, Monterey | **CC-BY 3.0**, S. Paul Michael: [Blue/White Beach Umbrella](https://poly.pizza/m/1BLLDjRdxoa) |
| `models/props/beach_chair.glb` | Folding beach lounger | 11 | 264 | 0.9 | 0.74 × 0.90 × 1.23 | base centre | 1 | Carmel | **CC-BY 3.0**, Poly by Google: [Beach chair](https://poly.pizza/m/9TN4PyhWvz1) |
| `models/props/lifeguard_tower.glb` | Lifeguard tower on stilts with ramp (teal hut) | 217 | 4562 | 4.2 | 4.14 × 4.20 × 5.04 | base centre | 1 | Carmel, Monterey | **CC-BY 3.0**, Daniel Doran: [Lifeguard Tower](https://poly.pizza/m/eTXK45QuLQT) |

## Salinas: farm (`models/farm/`)

Quaternius Farm Buildings pack (scaled ×1.5 to real barn size) plus Poly by Google farmhouse, tractor and windpump.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/farm/barn_big.glb` | Big red barn with gambrel roof and lean-to | 175 | 4220 | 11.83 | 11.6 × 11.8 × 12.3 | base centre | 1 | Salinas | CC0, Quaternius: [Big Barn](https://poly.pizza/m/q1N3xn2SpC) |
| `models/farm/barn.glb` | Red barn, gambrel roof | 118 | 2910 | 9.01 | 11.6 × 9.01 × 12.3 | base centre | 1 | Salinas | CC0, Quaternius: [Barn](https://poly.pizza/m/vSqQNA7ez6) |
| `models/farm/barn_small.glb` | Small red barn | 89 | 2176 | 7.44 | 9.12 × 7.44 × 9.41 | base centre | 1 | Salinas | CC0, Quaternius: [Small Barn](https://poly.pizza/m/aTcDP7UERC) |
| `models/farm/barn_open.glb` | Open-sided red hay barn / equipment shed | 73 | 1612 | 7.12 | 8.62 × 7.12 × 9.27 | base centre | 1 | Salinas | CC0, Quaternius: [Open Barn](https://poly.pizza/m/ZIdWHxYsUv) |
| `models/farm/silo.glb` | Red grain silo with dome | 67 | 1592 | 13.6 | 5.50 × 13.6 × 5.26 | base centre | 1 | Salinas | CC0, Quaternius: [Silo](https://poly.pizza/m/5GhLrv5Ce3) |
| `models/farm/water_tower.glb` | Wooden water tank on steel lattice tower | 57 | 1158 | 14.07 | 3.97 × 14.1 × 4.06 | base centre | 1 | Salinas, Monterey | CC0, Quaternius: [Water Tower](https://poly.pizza/m/tMK8bhapAK) |
| `models/farm/windpump.glb` | American farm windpump (multi-blade windmill on wooden tower) | 62 | 342 | 9 | 3.39 × 9.00 × 3.57 | base centre | 1 | Salinas | **CC-BY 3.0**, Poly by Google: [Wind turbine](https://poly.pizza/m/6I2DF2AZDgB) |
| `models/farm/farmhouse.glb` | White two-storey clapboard farmhouse with porch | 262 | 2047 | 9.5 | 13.1 × 9.50 × 9.86 | base centre | 1 | Salinas, Carmel | **CC-BY 3.0**, Poly by Google: [Farm house](https://poly.pizza/m/bHyQe5jzdiQ) |
| `models/farm/tractor.glb` | Red farm tractor | 219 | 2766 | 2.6 | 2.82 × 2.60 × 4.67 | base centre | 1 | Salinas | **CC-BY 3.0**, Poly by Google: [Tractor](https://poly.pizza/m/5TGoA5N14c5) |
| `models/farm/fence_rail.glb` | Wooden rail fence section, 5.9 m long. Runs along X; tile every 5.9 m | 10 | 188 | 1.1 | 5.89 × 1.10 × 0.17 | base centre | 1 | Salinas, all | CC0, Quaternius: [Fence](https://poly.pizza/m/e02PFKKhbr) |
| `models/farm/fence_picket_wood.glb` | Wooden picket fence section, 5.9 m long. Runs along X; tile every 5.9 m | 16 | 324 | 1.17 | 5.89 × 1.17 × 0.17 | base centre | 1 | Salinas, all | CC0, Quaternius: [Fence](https://poly.pizza/m/U7g0Wxpt63) |
| `models/farm/lettuce.glb` | Lettuce head (crop rows). Instance in rows ~0.35 m apart | 32 | 592 | 0.25 | 0.30 × 0.25 × 0.30 | base centre | 1 | Salinas | CC0, Quaternius: [Lettuce](https://poly.pizza/m/MEmUwHUHNR) |
| `models/farm/cabbage.glb` | Cabbage head | 9 | 144 | 0.25 | 0.31 × 0.25 × 0.33 | base centre | 1 | Salinas | CC0, Kenney: [Cabbage](https://poly.pizza/m/6urnIRBhzr) |
| `models/farm/crate_lettuce.glb` | Produce crate full of lettuce | 77 | 1980 | 0.42 | 0.84 × 0.42 × 0.84 | base centre | 1 | Salinas | CC0, Kay Lousberg: [Crate Lettuce](https://poly.pizza/m/INP7sbCv4J) |
| `models/farm/crate_tomatoes.glb` | Produce crate full of tomatoes | 89 | 2072 | 0.4 | 0.87 × 0.40 × 0.87 | base centre | 1 | Salinas | CC0, Kay Lousberg: [Crate of Tomatoes](https://poly.pizza/m/YrCZgQcpMN) |

## Monterey: harbour and Cannery Row (`models/harbor/`)

Quaternius piers, wharf shed and brick building, Kay Lousberg shopfront, Poly by Google boats.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/harbor/cannery_brick.glb` | Three-storey brick building (Cannery Row style) | 344 | 7004 | 13 | 10.8 × 13.0 × 10.1 | base centre | 1 | Monterey | CC0, Quaternius: [Big Building](https://poly.pizza/m/AVCS8jUd2l) |
| `models/harbor/shopfront_building.glb` | Two-storey shopfront building, red/blue | 74 | 1082 | 8 | 9.70 × 8.00 × 9.70 | base centre | 1 | Monterey, Carmel | CC0, Kay Lousberg: [Building B](https://poly.pizza/m/5XG9i3QzlT) |
| `models/harbor/wharf_shed.glb` | Small wooden shed on a plank deck (wharf hut) | 195 | 4088 | 3.4 | 6.30 × 3.40 × 6.55 | base centre | 1 | Monterey | CC0, Quaternius: [Storage Hut](https://poly.pizza/m/BsTn4bKSGb) |
| `models/harbor/pier_long.glb` | Wooden pier section on pilings, rope rails. Deck along Z. Pilings reach below the deck; sink the model so the deck sits ~2 m above water | 90 | 1688 | 4.29 | 5.07 × 4.29 × 11.9 | base centre | 1 | Monterey, Carmel | CC0, Quaternius: [Dock Long](https://poly.pizza/m/bN9Oz3niNm) |
| `models/harbor/pier_wide.glb` | Wide wooden pier section on pilings | 90 | 1688 | 4.22 | 8.04 × 4.22 × 11.9 | base centre | 1 | Monterey | CC0, Quaternius: [Dock Wide](https://poly.pizza/m/XndOrGa7rN) |
| `models/harbor/pier_stairs.glb` | Pier corner with stairs down to the water | 34 | 628 | 4.19 | 4.78 × 4.19 × 5.21 | base centre | 1 | Monterey | CC0, Quaternius: [Dock Stairs](https://poly.pizza/m/IaUtCxMAxg) |
| `models/harbor/boat_fishing_white.glb` | Fishing boat (trawler), white hull. Bow points along X. Waterline is roughly 1/4 of the hull height above the keel | 232 | 4486 | 8.41 | 14.0 × 8.41 × 6.18 | base centre | 1 | Monterey | **CC-BY 3.0**, Poly by Google: [Boat](https://poly.pizza/m/1ZuSXvhkRg_) |
| `models/harbor/boat_fishing_green.glb` | Fishing boat (trawler), green hull. Same hull as the white one | 236 | 4486 | 8.41 | 14.0 × 8.41 × 6.18 | base centre | 1 | Monterey | **CC-BY 3.0**, Poly by Google: [Boat](https://poly.pizza/m/d2QPCNGeGp3) |
| `models/harbor/rowboat.glb` | Rowboat, white with red trim | 19 | 1030 | 0.96 | 1.74 × 0.96 × 3.80 | base centre | 1 | Monterey, Carmel | **CC-BY 3.0**, Poly by Google: [Rowboat](https://poly.pizza/m/adoP7kR7S17) |
| `models/harbor/bucket_fish.glb` | Wooden bucket of fish | 115 | 3860 | 0.55 | 0.69 × 0.55 × 0.93 | base centre | 1 | Monterey | CC0, Quaternius: [Bucket of Fish](https://poly.pizza/m/G61jVPof0G) |

## Carmel: village (`models/village/`)

Quaternius half-timbered "fantasy" houses read well as Carmel's storybook (Comstock) cottages.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/village/storybook_house.glb` | Storybook half-timbered cottage, steep teal roof (Comstock-style) | 308 | 5758 | 8.5 | 5.38 × 8.50 × 6.67 | base centre | 1 | Carmel | CC0, Quaternius: [Fantasy House](https://poly.pizza/m/BH2XHWUNmF) |
| `models/village/storybook_inn.glb` | Storybook half-timbered inn, red roof, porch | 354 | 7756 | 8.5 | 9.81 × 8.50 × 9.79 | base centre | 1 | Carmel | CC0, Quaternius: [Fantasy Inn](https://poly.pizza/m/x3ZcGn3jr4) |
| `models/village/cottage_small_a.glb` | Small cottage, red tiled roof, timber | 104 | 2336 | 5 | 5.76 × 5.00 × 5.60 | base centre | 1 | Carmel, Salinas | CC0, Quaternius: [House](https://poly.pizza/m/oJJIRwv6Bo) |
| `models/village/cottage_small_b.glb` | Small cottage, red tiled roof, variant b | 152 | 3504 | 5.5 | 6.40 × 5.50 × 6.77 | base centre | 1 | Carmel, Salinas | CC0, Quaternius: [House](https://poly.pizza/m/RSwoYSLblu) |
| `models/village/picket_fence_white.glb` | White picket fence section, 1.75 m long | 8 | 128 | 1 | 1.92 × 1.00 × 0.15 | base centre | 1 | Carmel | **CC-BY 3.0**, Vice Cooper: [White Picket Fence](https://poly.pizza/m/4ivPc8ObaIn) |

## Landmarks: mission, lighthouses (`models/landmarks/`)

Poly by Google mission church, Fabio Hofnik mission bell tower, three lighthouses.

| File | What it is | KB | Tris | Height m | Size W×H×D m | Origin | Scale | Tracks | Licence / source |
|---|---|---:|---:|---:|---|---|---|---|---|
| `models/landmarks/mission_church.glb` | Ochre mission-style church with bell tower (Carmel Mission stand-in) | 192 | 4014 | 22 | 18.9 × 22.0 × 7.56 | base centre | 1 | Carmel | **CC-BY 3.0**, Poly by Google: [Church](https://poly.pizza/m/2-J0Y-8AQOG) |
| `models/landmarks/mission_bell_tower.glb` | White California-mission bell tower with dome | 267 | 4944 | 16 | 3.94 × 16.0 × 4.07 | base centre | 1 | Carmel | **CC-BY 3.0**, Fabio Hofnik: [Vertigo Bell Tower](https://poly.pizza/m/3vKSG947XWZ) |
| `models/landmarks/lighthouse_redwhite.glb` | Lighthouse, red/white striped tower with gallery | 217 | 3064 | 16 | 5.31 × 16.0 × 5.59 | base centre | 1 | Monterey, Big Sur | CC0, MaverickFX: [Light House](https://poly.pizza/m/KRebJXIRb8) |
| `models/landmarks/lighthouse_keeper_house.glb` | Lighthouse with attached keeper's house (Point Pinos-like) | 69 | 1472 | 14 | 7.68 × 14.0 × 4.75 | base centre | 1 | Monterey | **CC-BY 3.0**, jeremy: [Lighthouse](https://poly.pizza/m/0SWQTv1whoA) |
| `models/landmarks/lighthouse_stone.glb` | Grey stone lighthouse tower (Point Sur-like) | 167 | 11762 | 15 | 5.13 × 15.0 × 5.13 | base centre | 1 | Big Sur | **CC-BY 3.0**, Robert Mirabelle: [Lighthouse](https://poly.pizza/m/3gEvVZoTN7e) |

## PBR textures (`textures/<name>/`), 1024² JPG, all CC0

Each set has `color.jpg` (sRGB), `normal.jpg` (OpenGL +Y, linear) and `roughness.jpg` (linear). `rock_cliff` and
`wood_planks` also have `ao.jpg` (linear, uv channel 0 in r187). All files are re-encoded and under 435 KB each.
"Tile" is the real-world size one texture repeat covers: set `repeat = surfaceSizeMetres / tile`.

| Folder | What it is | KB | Tile m | Tracks | Licence / source |
|---|---|---:|---:|---|---|
| `textures/dirt_packed/` | Packed light-tan dirt with fine debris (track surface). Files: color.jpg, normal.jpg, roughness.jpg | 516 | 2.07 | all | CC0, [Poly Haven "Dirt Floor"](https://polyhaven.com/a/dirt_floor) |
| `textures/grass_dry/` | Withered pale-straw grass; tint golden (color 0xe8c890) for summer California hills. Pale straw as shipped. For golden summer hills set `material.color = 0xe8c890`. Files: color.jpg, normal.jpg, roughness.jpg | 817 | 2 | all | CC0, [Poly Haven "Withered Grass"](https://polyhaven.com/a/withered_grass) |
| `textures/grass_green/` | Short dense green grass (roughness remapped to ~0.75). The source roughness (~0.26) looked wet, so it was remapped to ~0.75. Files: color.jpg, normal.jpg, roughness.jpg | 806 | 1.4 | Salinas, Carmel | CC0, [ambientCG Grass004](https://ambientcg.com/a/Grass004) |
| `textures/rock_cliff/` | Beige-brown cracked weathered rock face. Use a 3–6 m repeat on cliffs; triplanar or box UVs help on steep faces. Files: ao.jpg, color.jpg, normal.jpg, roughness.jpg | 725 | 2.7 | Big Sur, Carmel, Monterey | CC0, [Poly Haven "Rock Face 03"](https://polyhaven.com/a/rock_face_03) |
| `textures/sand_beach/` | Fine white/cream beach sand. Files: color.jpg, normal.jpg, roughness.jpg | 275 | 2 | Carmel, Monterey | CC0, [ambientCG Ground101](https://ambientcg.com/a/Ground101) |
| `textures/bark_redwood/` | Reddish fibrous (dawn) redwood bark. On trunks, wrap once around and repeat about every 2 m vertically. Files: color.jpg, normal.jpg, roughness.jpg | 514 | 1.94 | Big Sur, all | CC0, [Poly Haven "Metasequoia Bark"](https://polyhaven.com/a/metasequoia_bark) |
| `textures/wood_planks/` | Weathered grey timber boards (pier deck, barn siding). Boards run along V. Files: ao.jpg, color.jpg, normal.jpg, roughness.jpg | 436 | 1.5 | Monterey, Salinas, all | CC0, [Poly Haven "Wood Planks Grey"](https://polyhaven.com/a/wood_planks_grey) |
| `textures/concrete_weathered/` | Light grey weathered layered concrete (bridge, walls). Files: color.jpg, normal.jpg, roughness.jpg | 293 | 2 | Big Sur, Monterey | CC0, [Poly Haven "Concrete Layers 02"](https://polyhaven.com/a/concrete_layers_02) |

## Sky HDRIs (`hdri/`), CC0, Poly Haven

The `_1k.hdr` (1024×512 Radiance HDR) is for `scene.environment` via PMREM. The `_2k.jpg` (2048×1024,
tonemapped by Poly Haven) is a cheap `scene.background`. Both are "pure sky" versions: below the horizon is a soft
mirrored sky with no ground photo, so your terrain and sea must cover the horizon.

| Files | What it is | KB | Tracks | Source |
|---|---|---:|---|---|
| `hdri/qwantani_late_afternoon_puresky_1k.hdr`, `hdri/qwantani_late_afternoon_puresky_2k.jpg` | Clear sky, low warm late-afternoon sun, hazy horizon | 1193 | all; the best warm late-afternoon look (Big Sur, Carmel) | CC0, [Poly Haven](https://polyhaven.com/a/qwantani_late_afternoon_puresky) |
| `hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`, `hdri/kloofendal_48d_partly_cloudy_puresky_2k.jpg` | Sun ~48° up, fair-weather cumulus, brighter afternoon | 1665 | all; a brighter, cloudier option (Salinas, Monterey) | CC0, [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) |

## Quick picks per track

- **Salinas** (farm valley): `farm/*` (barns, silo, water tower, windpump, farmhouse, tractor, fences, lettuce and
  cabbage rows, produce crates), `props/market_stand_*` as a fruit stand, `trees/broadleaf_tall` as windbreaks,
  `trees/oak_round_*`, `plants/grass_dry_*`, `plants/wildflowers_yellow` (mustard), `people/farmer`, and
  `textures/grass_green` and `grass_dry`.
- **Monterey** (Cannery Row and the bay): `harbor/*` (brick cannery building, shopfront, piers, wharf shed, fishing
  boats, rowboat, fish bucket), `animals/sea_lion`, `seagull_*`, `pelican_brown`, `props/barrel`, `crate`,
  `life_ring`, `landmarks/lighthouse_keeper_house` (Point Pinos-like), `trees/cypress_monterey_*`, `pine_*`,
  and `textures/wood_planks` and `concrete_weathered`.
- **Carmel** (village and white beach): `village/*` (storybook cottages, picket fence),
  `landmarks/mission_church` and `mission_bell_tower`, `props/beach_umbrella_*`, `beach_chair`,
  `lifeguard_tower`, `plants/dune_grass`, `animals/dog_shiba`, `people/beach_character`,
  `trees/cypress_monterey_*`, and `textures/sand_beach`.
- **Big Sur** (cliffs, bridge, redwoods): `rocks/sea_stack_*`, `cliff_chunk`, `boulder_*`,
  `trees/redwood_*` with `plants/fern` underneath, `trees/cypress_monterey_*` on the bluffs,
  `plants/bush_coastal_sage`, `landmarks/lighthouse_stone` (Point Sur-like), `animals/seagull_*` and
  `pelican_brown`, and `textures/rock_cliff`, `concrete_weathered` (the bridge) and `bark_redwood`.
- **All tracks:** `people/*` as spectators, `props/flag_red`, `flags_triple`, `pennant_marker`, `canopy_*`,
  `picnic_table*` and `bench`, `textures/dirt_packed` for the track, and the two HDRIs.

## Gaps and caveats

- **I found no free Monterey cypress or coast live oak that matches the nature set's style.** The cypresses
  are MegaKit "Twisted Tree" variants recoloured to dark green, and the oaks are MegaKit broadleaf trees with darker
  leaves. They read well, but are not botanically exact. A flat-colour alternative, if you ever want one, is the
  layered flat-top "Tree" by Poly by Google (https://poly.pizza/m/7qYSFCnZTB6, CC-BY, 22 m, 2048 px texture). It is
  not included because it would clash with the textured MegaKit trees. For the flat-topped cypress shape, scale Y by about 0.7.
- **Redwoods are scaled-up MegaKit pines** with a red-tinted bark. Real redwoods have long bare trunks; for a more
  convincing grove, add a separate tall cylinder trunk using `textures/bark_redwood` under the crown.
- **Sea stacks and the cliff chunk are stretched boulders.** Their texture is stretched too, which is fine at a
  distance. For big cliffs, the procedural terrain with `textures/rock_cliff` will look better.
- **There is no navigation buoy or channel marker.** The free candidates were broken (wrong scale or stray geometry).
  Use `props/life_ring` as a float, or a simple procedural cylinder in red and white.
- **No pennant bunting strings were found.** Use `flags_triple` and `pennant_marker`, or build bunting procedurally.
- **No corrugated-metal cannery shed.** `harbor/cannery_brick` plus `harbor/wharf_shed` on `pier_*` stand in.
- **There is no bridge model;** the Bixby-style bridge stays procedural.
- **Lettuce, cabbage and crates are single objects.** For fields, instance them in rows; this is far cheaper than any
  "crop field" model. The free field model we tried had 35k triangles, so it was dropped.
- **CC-BY items need credit.** Credit them on the page or in the README; LICENSES.md has the exact lines.
- **Style:** nature (trees, plants, rocks) is textured stylised (MegaKit). Everything else is flat-colour low-poly
  from Quaternius, Poly by Google and others. Within each kind of object the style is consistent; no photoreal models
  are mixed in. The PBR ground textures are realistic, which is a deliberate split: stylised objects on realistic
  ground.
- **Heaviest files** are `people/beach_character` (1177 KB) and `people/farmer`
  (1065 KB), which have a dense skinned mesh, and the three cypresses
  (~600–680 KB each, 10k triangles). Everything else is under 600 KB, and most props are under 100 KB.

## Pipeline (for re-processing)

Raw downloads are outside the project in `downloads/assets-raw/`. The scripts are in `downloads/tools/`:
`spec.mjs` (the selection and the per-asset scale, recolour and clips), `process.mjs` (glTF-Transform plus sharp:
prune clips, recolour, bake scale and origin, flatten and join, re-encode textures), `mkcatalog.mjs` and
`gen-docs.mjs`. Previews are rendered with Playwright from `tools/asset-preview.html`.
