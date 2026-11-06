# Shared assets: licences

Assets in `assets/shared/` are used by every track. See also `assets/LICENSES.md` for the catalogue in `assets/models/`
and `assets/textures/`.

## `people/crowd.json` + `people/crowd.bin` (spectators, used by `src/env/people.js`)

Baked from eight **CC0 1.0** low-poly characters by **Quaternius** (Animated Men and Women pack), downloaded from
Poly Pizza: [Man](https://poly.pizza/m/HMnuH5geEG), [Man](https://poly.pizza/m/fjHyMd5Wxw),
[Man in Long Sleeves](https://poly.pizza/m/DLptRuewTn), [Man in Suit](https://poly.pizza/m/mQnGoME1ez),
[Woman](https://poly.pizza/m/AQsd9ngvKU), [Woman in Tank Top](https://poly.pizza/m/XqzeZGB7iU),
[Woman Casual](https://poly.pizza/m/jpKRgGDxhk), [Woman in Dress](https://poly.pizza/m/zMyPlQXBzq)
(the same models as `assets/models/people/`). No attribution is required.

Modified: six static poses were baked from the models' own animation clips (idle, standing, clapping open/closed,
arms up from the jump clip, seated), vertices welded, normals smoothed, three lower levels of detail made with a
quadric-error simplifier, materials replaced by colour slots, and positions quantised into one binary file
(~650 KB). The bake scripts (`bake.mjs`, `process.mjs`) live outside the project in `vqtools/crowd/`.

Hats, camp chairs and all crowd dressing in `src/env/dressing.js` (bunting, flags, tents, picnic tables, umbrellas,
coolers) are procedural geometry written for this project: no third-party assets.

## `foliage_atlas.webp` (leaf cards for trees and shrubs, used by `src/textures.js` / `src/env/flora.js`)

Drawn procedurally by `foliageAtlasCanvas()` in `src/textures.js` (leaf by leaf on a canvas) and saved once as WebP
so the page doesn't spend ~2 s redrawing it. Original work for this project: no third-party assets. If the file is
missing the same image is drawn at load time.

## Texture sets used by the shared terrain, track and rock shaders

`src/env/surface.js` and `src/env/world.js` use the catalogue's CC0 PBR sets in place (`assets/textures/dirt_packed`,
`grass_dry`, `rock_cliff`, `sand_beach`, `concrete_weathered`, `bark_redwood`, `wood_planks`): Poly Haven and ambientCG,
CC0, see `assets/LICENSES.md`. No CC-BY assets are used by the shared modules or by Big Sur.
