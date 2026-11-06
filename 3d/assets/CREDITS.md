# Credits

PUMPKIN 3D replays races from the original Pumpkin game (physics unchanged) using [three.js](https://threejs.org) (MIT).

## Attribution (CC BY 3.0)

These models are used under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They were rescaled, re-centred and re-encoded for this project.

- "Sea lion" by Poly by Google (https://poly.pizza/m/45HRvXYpvUG), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Seagull" by Poly by Google (https://poly.pizza/m/0WRzrtCIIRp), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Flying seagull" by Poly by Google (https://poly.pizza/m/6Tpj_vcWP3f), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Brown pelican" by Poly by Google (https://poly.pizza/m/2oAiRa4fave), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Canopy" by Poly by Google (https://poly.pizza/m/40tUFNg2fu4), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Red/White Beach Umbrella" by S. Paul Michael (https://poly.pizza/m/2li3sdSkmCI), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Blue/White Beach Umbrella" by S. Paul Michael (https://poly.pizza/m/1BLLDjRdxoa), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Beach chair" by Poly by Google (https://poly.pizza/m/9TN4PyhWvz1), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Lifeguard Tower" by Daniel Doran (https://poly.pizza/m/eTXK45QuLQT), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Wind turbine" by Poly by Google (https://poly.pizza/m/6I2DF2AZDgB), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Farm house" by Poly by Google (https://poly.pizza/m/bHyQe5jzdiQ), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Tractor" by Poly by Google (https://poly.pizza/m/5TGoA5N14c5), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Boat" by Poly by Google (https://poly.pizza/m/1ZuSXvhkRg_), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Boat" by Poly by Google (https://poly.pizza/m/d2QPCNGeGp3), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Rowboat" by Poly by Google (https://poly.pizza/m/adoP7kR7S17), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Church" by Poly by Google (https://poly.pizza/m/2-J0Y-8AQOG), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.
- "Vertigo Bell Tower" by Fabio Hofnik (https://poly.pizza/m/3vKSG947XWZ), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded.

## Public domain (CC0), with thanks

- Quaternius (https://poly.pizza)
- BlenderVoyage (https://poly.pizza)
- Kay Lousberg (https://poly.pizza)
- Unknown author (https://polyhaven.com)
- Unknown author (https://ambientcg.com)

Models in use: 45 · textures: 8 · skies: 0. The full catalogue with sources is in assets/CATALOG.md.

---

<!-- from assets/shared/LICENSES.md -->
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

---

<!-- from assets/audio/LICENSES.md -->
# Audio licences

Every recording in this folder is public domain (CC0 1.0). No attribution is required; it is listed here so
the sources can be checked. Sounds not listed here (countdown and start beeps, finish bell, fanfare, wind,
rolling, whoosh, rope twang, creak, slow-motion effects) are synthesized in the browser by `src/audio/`.

Freesound files were taken from the HQ preview MP3s (`cdn.freesound.org/previews/…-hq.mp3`), which carry the
same licence as the originals. Each licence was checked on the sound page (link to
`creativecommons.org/publicdomain/zero/1.0/`). They were trimmed, filtered, level-normalised, crossfaded into
loops where they loop, and re-encoded to MP3 by `process.py` (kept outside the site).

| File in `assets/audio/` | Used for | Source(s) |
|---|---|---|
| `surf-cliff.mp3` | Big Sur surf below the cliffs (loop) | ["Ocean Waves Crashing on the Coast of Big Lagoon, Redwoods"](https://freesound.org/people/CVLTIV8R/sounds/803679/) by CVLTIV8R (Freesound #803679, CC0 1.0) |
| `surf-harbour.mp3` | Monterey harbour waves (loop) | ["Waves lapping on rocks"](https://freesound.org/people/dan.pugsley/sounds/457956/) by dan.pugsley (Freesound #457956, CC0 1.0) |
| `surf-beach.mp3` | Carmel beach waves (loop) | ["Calm ocean waves"](https://freesound.org/people/SamsterBirdies/sounds/578524/) by SamsterBirdies (Freesound #578524, CC0 1.0) |
| `crowd-murmur.mp3` | crowd murmur bed (loop) | ["Outdoors Walla"](https://freesound.org/people/IENBA/sounds/834339/) by IENBA (Freesound #834339, CC0 1.0) |
| `crowd-cheer-loop.mp3` | excited crowd bed (loop) | ["applause cheer ext medium crowd enthusiastic whistling for outdoor show nice if take out close claps.flac"](https://freesound.org/people/kyles/sounds/455659/) by kyles (Freesound #455659, CC0 1.0) |
| `prairie-birds.mp3` | Salinas meadowlarks, insects, breeze (loop) | ["Morning in Nebraska.aiff"](https://freesound.org/people/Danjocross/sounds/503209/) by Danjocross (Freesound #503209, CC0 1.0) |
| `crickets.mp3` | Salinas crickets (loop) | ["Crickets At Night - Raw sound"](https://freesound.org/people/Defelozedd94/sounds/522299/) by Defelozedd94 (Freesound #522299, CC0 1.0) |
| `tractor.mp3` | Salinas distant tractor (loop) | ["Tractor_Drive_Distant_01.wav"](https://freesound.org/people/BenDrain/sounds/488011/) by BenDrain (Freesound #488011, CC0 1.0) |
| `sealions-colony.mp3` | Monterey sea lion colony (loop) | ["Colony of sea lions on land barking and vocalizing"](https://freesound.org/people/RavenWolfProds/sounds/503679/) by RavenWolfProds (Freesound #503679, CC0 1.0) |
| `gulls.mp3` | gull calls (spots) | ["Herring Gull 1.wav"](https://freesound.org/people/Canardo55/sounds/538016/) by Canardo55 (Freesound #538016, CC0 1.0)<br>["Gull.wav"](https://freesound.org/people/nigelcoop/sounds/73497/) by nigelcoop (Freesound #73497, CC0 1.0) |
| `sealions.mp3` | sea lion barks (spots) | ["Sea Lions in Santa Cruz"](https://freesound.org/people/vflefevre/sounds/184491/) by vflefevre (Freesound #184491, CC0 1.0)<br>["Colony of sea lions on land barking and vocalizing"](https://freesound.org/people/RavenWolfProds/sounds/503679/) by RavenWolfProds (Freesound #503679, CC0 1.0) |
| `meadowlark.mp3` | meadowlark songs (spots) | ["Morning in Nebraska.aiff"](https://freesound.org/people/Danjocross/sounds/503209/) by Danjocross (Freesound #503209, CC0 1.0) |
| `foghorn.mp3` | Monterey distant foghorn | ["Long Distant Foghorn.aiff"](https://freesound.org/people/Danjocross/sounds/507471/) by Danjocross (Freesound #507471, CC0 1.0) |
| `dog.mp3` | Carmel distant dog | ["Distant Dog Bark"](https://freesound.org/people/qubodup/sounds/813116/) by qubodup (Freesound #813116, CC0 1.0)<br>["Dogs Barking in Distance_Rural.wav"](https://freesound.org/people/rvandemark/sounds/581478/) by rvandemark (Freesound #581478, CC0 1.0) |
| `raven.mp3` | Big Sur raven | ["Common Raven - Yellowstone National Park"](https://freesound.org/people/Nivatius/sounds/519591/) by Nivatius (Freesound #519591, CC0 1.0) |
| `whistle.mp3` | 'whistle', 'dq' | ["Referee whistle blow, gymnasium.wav"](https://freesound.org/people/SpliceSound/sounds/218318/) by SpliceSound (Freesound #218318, CC0 1.0) |
| `crowd-cheer.mp3` | 'cheer', automatic crowd bursts | ["Crowd cheer 2.wav"](https://freesound.org/people/deleted_user_2104797/sounds/346689/) by deleted_user_2104797 (Freesound #346689, CC0 1.0)<br>["rodeo audio cheer distant"](https://freesound.org/people/jayfrosting/sounds/728774/) by jayfrosting (Freesound #728774, CC0 1.0)<br>["Crowd Cheer"](https://freesound.org/people/FoolBoyMedia/sounds/397434/) by FoolBoyMedia (Freesound #397434, CC0 1.0) |
| `crowd-cheer-big.mp3` | 'win' | ["Crowd Cheer"](https://freesound.org/people/FoolBoyMedia/sounds/397434/) by FoolBoyMedia (Freesound #397434, CC0 1.0) |
| `crowd-gasp.mp3` | 'gasp', 'netSnap' reaction | ["Crowd Ooohs and Ahhhs in Excitement"](https://freesound.org/people/noah0189/sounds/264499/) by noah0189 (Freesound #264499, CC0 1.0) |
| `crowd-ohh.mp3` | 'dq' crowd reaction | ["crowd `oh - - disappointed.mp3"](https://freesound.org/people/mrrap4food/sounds/619007/) by mrrap4food (Freesound #619007, CC0 1.0) |
| `splash.mp3` | 'splash' | ["SPLASH (by blaukreuz)"](https://freesound.org/people/qubodup/sounds/212143/) by qubodup (Freesound #212143, CC0 1.0) |
| `splat.mp3` | 'shatter' wet splat | ["splat.ogg"](https://freesound.org/people/gprosser/sounds/360942/) by gprosser (Freesound #360942, CC0 1.0)<br>["splat2.ogg"](https://freesound.org/people/gprosser/sounds/361030/) by gprosser (Freesound #361030, CC0 1.0) |
| `crunch.mp3` | 'shatter' crunch | ["Smashing Peppers and Melons"](https://freesound.org/people/TheFilmLook/sounds/343722/) by TheFilmLook (Freesound #343722, CC0 1.0) |
| `rip.mp3` | 'netSnap' ripping | ["Fabric Ripping"](https://freesound.org/people/HarpyHarpHarp/sounds/449126/) by HarpyHarpHarp (Freesound #449126, CC0 1.0) |
| `air-horn.mp3` | 'go' starter horn | ["Industrial Air Horn"](https://freesound.org/people/mcpable/sounds/131930/) by mcpable (Freesound #131930, CC0 1.0) |
| `thud.mp3` | 'land', 'netCatch' | ["BODY FALL - V HVY - DIRT"](https://freesound.org/people/leonelmail/sounds/504626/) by leonelmail (Freesound #504626, CC0 1.0)<br>Kenney, [Impact Sounds](https://kenney.nl/assets/impact-sounds): impactPunch_heavy_000-004.ogg, impactSoft_heavy_000-004.ogg (CC0 1.0) |
| `wood.mp3` | 'gate' | ["Wooden Gate"](https://freesound.org/people/RealSquink/sounds/788015/) by RealSquink (Freesound #788015, CC0 1.0)<br>["Clacking"](https://freesound.org/people/SketchComPod/sounds/277585/) by SketchComPod (Freesound #277585, CC0 1.0)<br>Kenney, [Impact Sounds](https://kenney.nl/assets/impact-sounds): impactWood_heavy_000-002.ogg (CC0 1.0) |
| `debris.mp3` | 'shatter' debris | Kenney, [Impact Sounds](https://kenney.nl/assets/impact-sounds): impactSoft_medium_000-004.ogg, footstep_grass_000-002.ogg (CC0 1.0) |

## Source details

- Freesound #73497: https://freesound.org/people/nigelcoop/sounds/73497/ — author `nigelcoop` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/73/73497_1088850-hq.mp3
- Freesound #131930: https://freesound.org/people/mcpable/sounds/131930/ — author `mcpable` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/131/131930_1542102-hq.mp3
- Freesound #184491: https://freesound.org/people/vflefevre/sounds/184491/ — author `vflefevre` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/184/184491_1773681-hq.mp3
- Freesound #212143: https://freesound.org/people/qubodup/sounds/212143/ — author `qubodup` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/212/212143_71257-hq.mp3
- Freesound #218318: https://freesound.org/people/SpliceSound/sounds/218318/ — author `SpliceSound` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/218/218318_1480854-hq.mp3
- Freesound #264499: https://freesound.org/people/noah0189/sounds/264499/ — author `noah0189` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/264/264499_3890365-hq.mp3
- Freesound #277585: https://freesound.org/people/SketchComPod/sounds/277585/ — author `SketchComPod` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/277/277585_4231259-hq.mp3
- Freesound #343722: https://freesound.org/people/TheFilmLook/sounds/343722/ — author `TheFilmLook` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/343/343722_5463915-hq.mp3
- Freesound #346689: https://freesound.org/people/deleted_user_2104797/sounds/346689/ — author `deleted_user_2104797` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/346/346689_2104797-hq.mp3
- Freesound #360942: https://freesound.org/people/gprosser/sounds/360942/ — author `gprosser` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/360/360942_5406151-hq.mp3
- Freesound #361030: https://freesound.org/people/gprosser/sounds/361030/ — author `gprosser` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/361/361030_5406151-hq.mp3
- Freesound #397434: https://freesound.org/people/FoolBoyMedia/sounds/397434/ — author `FoolBoyMedia` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/397/397434_4019029-hq.mp3
- Freesound #449126: https://freesound.org/people/HarpyHarpHarp/sounds/449126/ — author `HarpyHarpHarp` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/449/449126_8895476-hq.mp3
- Freesound #455659: https://freesound.org/people/kyles/sounds/455659/ — author `kyles` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/455/455659_612689-hq.mp3
- Freesound #457956: https://freesound.org/people/dan.pugsley/sounds/457956/ — author `dan.pugsley` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/457/457956_9574372-hq.mp3
- Freesound #488011: https://freesound.org/people/BenDrain/sounds/488011/ — author `BenDrain` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/488/488011_4763661-hq.mp3
- Freesound #503209: https://freesound.org/people/Danjocross/sounds/503209/ — author `Danjocross` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/503/503209_2977885-hq.mp3
- Freesound #503679: https://freesound.org/people/RavenWolfProds/sounds/503679/ — author `RavenWolfProds` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/503/503679_9619518-hq.mp3
- Freesound #504626: https://freesound.org/people/leonelmail/sounds/504626/ — author `leonelmail` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/504/504626_4437257-hq.mp3
- Freesound #507471: https://freesound.org/people/Danjocross/sounds/507471/ — author `Danjocross` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/507/507471_2977885-hq.mp3
- Freesound #519591: https://freesound.org/people/Nivatius/sounds/519591/ — author `Nivatius` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/519/519591_7143328-hq.mp3
- Freesound #522299: https://freesound.org/people/Defelozedd94/sounds/522299/ — author `Defelozedd94` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/522/522299_9084007-hq.mp3
- Freesound #538016: https://freesound.org/people/Canardo55/sounds/538016/ — author `Canardo55` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/538/538016_11982267-hq.mp3
- Freesound #578524: https://freesound.org/people/SamsterBirdies/sounds/578524/ — author `SamsterBirdies` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/578/578524_5487341-hq.mp3
- Freesound #581478: https://freesound.org/people/rvandemark/sounds/581478/ — author `rvandemark` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/581/581478_11015511-hq.mp3
- Freesound #619007: https://freesound.org/people/mrrap4food/sounds/619007/ — author `mrrap4food` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/619/619007_781461-hq.mp3
- Freesound #728774: https://freesound.org/people/jayfrosting/sounds/728774/ — author `jayfrosting` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/728/728774_5884138-hq.mp3
- Freesound #788015: https://freesound.org/people/RealSquink/sounds/788015/ — author `RealSquink` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/788/788015_12262933-hq.mp3
- Freesound #803679: https://freesound.org/people/CVLTIV8R/sounds/803679/ — author `CVLTIV8R` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/803/803679_2520418-hq.mp3
- Freesound #813116: https://freesound.org/people/qubodup/sounds/813116/ — author `qubodup` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/813/813116_71257-hq.mp3
- Freesound #834339: https://freesound.org/people/IENBA/sounds/834339/ — author `IENBA` — licence: http://creativecommons.org/publicdomain/zero/1.0/ — preview used: https://cdn.freesound.org/previews/834/834339_9616576-hq.mp3
- Kenney Impact Sounds: https://kenney.nl/assets/impact-sounds — author Kenney (www.kenney.nl) — licence: CC0 1.0 (Creative Commons Zero), per License.txt in the pack

Authors shown as `deleted_user_…` are Freesound accounts that were later closed; their uploads keep the CC0 licence.

---

<!-- from assets/tracks/salinas/LICENSES.md -->
# Salinas track: asset credits

The Salinas track (`src/tracks/salinas/`) is mostly procedural: terrain, crop fields (a shader), the rodeo
chutes, arch, booth, judges' stand, grandstand, fences, flags, bunting, vehicles, cattle, irrigation pipes and
far windbreaks are generated in code, and its signs are drawn on canvases at run time. It also places these
models from the shared catalogue (`assets/models/`, see `assets/LICENSES.md`).

## Attribution required: CC BY 3.0

Licence text: https://creativecommons.org/licenses/by/3.0/

| File | Credit line |
|---|---|
| `models/farm/windpump.glb` | "Wind turbine" by Poly by Google (https://poly.pizza/m/6I2DF2AZDgB), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/farm/farmhouse.glb` | "Farm house" by Poly by Google (https://poly.pizza/m/bHyQe5jzdiQ), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/farm/tractor.glb` | "Tractor" by Poly by Google (https://poly.pizza/m/5TGoA5N14c5), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/props/canopy_striped.glb` | "Canopy" by Poly by Google (https://poly.pizza/m/40tUFNg2fu4), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |

## CC0 1.0 (no attribution required; credited with thanks)

- Quaternius: `farm/barn_big.glb` ([Big Barn](https://poly.pizza/m/q1N3xn2SpC)), `farm/barn_small.glb` ([Small Barn](https://poly.pizza/m/aTcDP7UERC)),
  `farm/barn_open.glb` ([Open Barn](https://poly.pizza/m/ZIdWHxYsUv)), `farm/silo.glb` ([Silo](https://poly.pizza/m/5GhLrv5Ce3)),
  `farm/water_tower.glb` ([Water Tower](https://poly.pizza/m/tMK8bhapAK)), `props/market_stand_a.glb` ([Market Stand](https://poly.pizza/m/DGIM5HGISb)),
  `props/market_stand_b.glb` ([Market Stand](https://poly.pizza/m/hts7l0NZxW)); spectators via the shared crowd (`assets/shared/people/`).
- Kay Lousberg: `farm/crate_lettuce.glb` ([Crate Lettuce](https://poly.pizza/m/INP7sbCv4J)), `farm/crate_tomatoes.glb` ([Crate of Tomatoes](https://poly.pizza/m/YrCZgQcpMN)).
- Terrain photo textures (Poly Haven / ambientCG, CC0) come through the shared terrain material.

## Generated for this track

| File | Source |
|---|---|
| `assets/tracks/salinas/billboard.jpg` | Original artwork generated with Gemini via OpenRouter (`google/gemini-2.5-flash-image`), November 2026, from a text prompt for a vintage crate-label-style roadside billboard ("SALINAS VALLEY · SALAD BOWL OF THE WORLD"). No logos or brand names. Cropped and re-encoded to 1024 × 570 JPG. |

---

<!-- from assets/tracks/monterey/LICENSES.md -->
# Monterey track: asset licences

## Files in this folder

| File | Source and licence |
|---|---|
| `facade1.jpg` (Pacific Pearl Packing Co.), `facade2.jpg` (Ocean Star Cannery), `facade3.jpg` (Bayside Sardine Co.), `facade4.jpg` (Del Mar Fish Reduction) | Generated with Gemini (`google/gemini-2.5-flash-image`) via OpenRouter for this project, then resized to 1024 px and re-encoded as JPG. The company names are invented. |

Everything else on the Monterey track (nets, canneries, conveyors, wharf, cottages, boats, kayaks, kelp,
lighthouse, sand, signs) is procedural code in `src/tracks/monterey/`.

## Shared catalogue assets used by the Monterey track

### Attribution required: CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/)

| File | Credit line |
|---|---|
| `models/animals/sea_lion.glb` | "Sea lion" by Poly by Google (https://poly.pizza/m/45HRvXYpvUG), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/animals/seagull_standing.glb` | "Seagull" by Poly by Google (https://poly.pizza/m/0WRzrtCIIRp), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/animals/seagull_flying.glb` | "Flying seagull" by Poly by Google (https://poly.pizza/m/6Tpj_vcWP3f), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/animals/pelican_brown.glb` | "Brown pelican" by Poly by Google (https://poly.pizza/m/2oAiRa4fave), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/harbor/boat_fishing_white.glb` | "Boat" by Poly by Google (https://poly.pizza/m/1ZuSXvhkRg_), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/harbor/boat_fishing_green.glb` | "Boat" by Poly by Google (https://poly.pizza/m/d2QPCNGeGp3), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/harbor/rowboat.glb` | "Rowboat" by Poly by Google (https://poly.pizza/m/adoP7kR7S17), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |

### CC0 (no attribution required)

- Quaternius: `models/harbor/cannery_brick.glb` ([Big Building](https://poly.pizza/m/AVCS8jUd2l)),
  `models/farm/water_tower.glb` ([Water Tower](https://poly.pizza/m/tMK8bhapAK)),
  `models/props/barrel.glb` ([Barrel](https://poly.pizza/m/ONdghDBByN)), `models/props/crate.glb` ([Crate](https://poly.pizza/m/3OEFd1AWfa)),
  `models/props/bench.glb` ([Bench](https://poly.pizza/m/jLxjFxFRpw)).
- Kay Lousberg: `models/harbor/shopfront_building.glb` ([Building B](https://poly.pizza/m/5XG9i3QzlT)).
- Poly Haven: `textures/wood_planks` ([Wood Planks Grey](https://polyhaven.com/a/wood_planks_grey)) for the wharf deck.
- Shared vegetation, terrain textures and spectators come from `src/env/` (see `assets/LICENSES.md`).

---

<!-- from assets/tracks/carmel/LICENSES.md -->
# Carmel track: asset licences

The Carmel scenery (`src/tracks/carmel/`) is mostly procedural: cottages, shingles, stone, sand, signs, the
inspection tent, placards and flags are drawn on canvases at runtime (no files, no licences). It also uses shared
catalogue models from `assets/models/` (see `assets/CATALOG.md`, `assets/LICENSES.md`). No files of its own are
stored in this folder.

## CC0 (no attribution required), Quaternius via Poly Pizza

`people/farmer.glb` (the inspector), `people/man_suit.glb` (his helper), `people/woman_casual.glb` (scorekeeper and a
beach walker), `people/beach_character.glb` (beach walkers), `animals/dog_shiba.glb` (dogs on the beach, recoloured
per dog), `plants/dune_grass.glb`.

## CC BY 3.0 (attribution required)

Licence text: https://creativecommons.org/licenses/by/3.0/

| File | Credit line |
|---|---|
| `models/animals/seagull_standing.glb` | "Seagull" by Poly by Google (https://poly.pizza/m/0WRzrtCIIRp), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/animals/seagull_flying.glb` | "Flying seagull" by Poly by Google (https://poly.pizza/m/6Tpj_vcWP3f), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/props/beach_umbrella_red.glb` | "Red/White Beach Umbrella" by S. Paul Michael (https://poly.pizza/m/2li3sdSkmCI), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/props/beach_umbrella_blue.glb` | "Blue/White Beach Umbrella" by S. Paul Michael (https://poly.pizza/m/1BLLDjRdxoa), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/props/beach_chair.glb` | "Beach chair" by Poly by Google (https://poly.pizza/m/9TN4PyhWvz1), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/props/lifeguard_tower.glb` | "Lifeguard Tower" by Daniel Doran (https://poly.pizza/m/eTXK45QuLQT), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/landmarks/mission_church.glb` | "Church" by Poly by Google (https://poly.pizza/m/2-J0Y-8AQOG), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
| `models/landmarks/mission_bell_tower.glb` | "Vertigo Bell Tower" by Fabio Hofnik (https://poly.pizza/m/3vKSG947XWZ), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Rescaled, re-centred and textures re-encoded. |
