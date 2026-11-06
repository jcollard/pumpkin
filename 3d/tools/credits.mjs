// Writes assets/CREDITS.md: every catalogue model, texture and sky the code actually uses,
// with the credit lines CC-BY requires. Run it after adding or removing assets:
//   node tools/credits.mjs
import {readFileSync, writeFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const code = walk(join(root, 'src')).filter(f => f.endsWith('.js')).map(f => readFileSync(f, 'utf8')).join('\n');
const cat = JSON.parse(readFileSync(join(root, 'assets/catalog.json'), 'utf8'));

// An asset counts as used if the code mentions its path, file name or catalogue id.
const used = a => [a.path, a.id, a.path && basename(a.path).replace(/\.[a-z]+$/, ''), a.hdr, a.jpg].filter(Boolean).some(k => code.includes(k));
const models = cat.models.filter(used), textures = (cat.textures || []).filter(used), hdris = (cat.hdris || []).filter(used);
const all = [...models, ...textures, ...hdris];
const ccby = all.filter(a => /BY/i.test(a.licence));
const cc0 = all.filter(a => !/BY/i.test(a.licence));

const lines = ['# Credits', '',
  'PUMPKIN 3D replays races from the original Pumpkin game (physics unchanged) using [three.js](https://threejs.org) (MIT).', '',
  '## Attribution (CC BY 3.0)', '',
  ccby.length ? 'These models are used under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They were rescaled, re-centred and re-encoded for this project.' : 'None in use.', '',
  ...ccby.map(a => `- ${a.attribution || `"${a.title || a.name}" by ${a.author}, ${a.source}, CC BY 3.0`}`), '',
  '## Public domain (CC0), with thanks', '',
  ...[...new Map(cc0.map(a => [`${a.author || 'Unknown'}|${(a.source || '').split('/')[2] || ''}`, a])).values()]
    .map(a => `- ${a.author || 'Unknown author'} (${(a.source || '').split('/').slice(0, 3).join('/')})`), '',
  `Models in use: ${models.length} · textures: ${textures.length} · skies: ${hdris.length}. The full catalogue with sources is in assets/CATALOG.md.`, '',
];
// Fold in the per-folder licence notes (sounds, shared assets, generated images).
for (const f of ['assets/shared/LICENSES.md', 'assets/audio/LICENSES.md', ...['salinas', 'monterey', 'carmel', 'bigsur'].map(t => `assets/tracks/${t}/LICENSES.md`)]) {
  if (existsSync(join(root, f))) lines.push(`---`, '', `<!-- from ${f} -->`, readFileSync(join(root, f), 'utf8').trim(), '');
}
writeFileSync(join(root, 'assets/CREDITS.md'), lines.join('\n'));
console.log(`assets/CREDITS.md: ${ccby.length} CC-BY credits, ${cc0.length} CC0 assets in use.`);
