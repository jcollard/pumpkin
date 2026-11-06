// Track registry in the game's race order. A track's full module lives in
// src/tracks/<id>/index.js; until it exists, a plain generic version is used.
import {genericTrack} from './generic.js';

export const TRACK_IDS = ['salinas', 'monterey', 'carmel', 'big-sur'];
const FOLDERS = {salinas: 'salinas', monterey: 'monterey', carmel: 'carmel', 'big-sur': 'bigsur'};
const FALLBACK = {
  salinas: {label: '100 m · SPRINT', blurb: 'A short, slick plunge into the valley.', ambience: {wind: 0.6, birds: 0.7, insects: 0.5, crowd: 0.5}},
  monterey: {label: '1 km · NETS & HILLS', blurb: 'Rolling hills, sand and three fishing nets to break.', courseOptions: {sea: true}, ambience: {sea: 0.8, gulls: 0.8, sealions: 0.6, crowd: 0.5}},
  carmel: {label: '250 m · CREST SPRINT', blurb: 'Over the crests to the beach. Inspection first.', courseOptions: {sea: true}, ambience: {sea: 0.7, wind: 0.4, gulls: 0.6, crowd: 0.5}},
  'big-sur': {label: '500 m · BRIDGE JUMP', blurb: 'Down the cliff road and over the gap in the bridge.', courseOptions: {sea: true}},
};

const cache = {};
export async function loadTrack(id) {
  if (!TRACK_IDS.includes(id)) throw Error('Unknown track ' + id);
  if (cache[id]) return cache[id];
  let def;
  try { def = (await import(`./${FOLDERS[id]}/index.js`)).default; }
  catch (e) {
    if (!/Failed to fetch|Cannot find module|error loading dynamically imported module|Importing a module script failed/i.test(e.message)) throw e;
    def = genericTrack(id, FALLBACK[id]);
  }
  def.name ??= id.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (cache[id] = def);
}
