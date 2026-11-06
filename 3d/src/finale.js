// End of a full circuit, as in the original game: the champion card (confetti, the
// champion's winnings, every pumpkin's place) and then the Pumpkin Analysis table
// (winnings per race and every build setting with the changes spent).
import * as P from './physics.js';
import {renderPumpkin, canvasContext} from './inspector2d.js';

const GROUPS = [['d', 'Size'], ['s', 'Shape'], ['t', 'Skin'], ['en', 'Natural coat'], ['ea', 'Artificial coat'],
  ['cn', 'Natural core'], ['ca', 'Artificial core'], ['gn', 'Natural grooves'], ['ga', 'Artificial grooves']];
const valueLabel = (k, v) => (k === 's' ? v + '%' : k === 'd' || k === 't' ? v + ' cm' : String(v));
const money = n => '$' + n.toLocaleString('en-US', {maximumFractionDigits: 1});
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const nameOf = (p, i) => p.name.trim() || `Pumpkin ${i + 1}`;
const totalOf = (races, i) => races.reduce((n, rows) => n + (rows?.[i]?.money || 0), 0);

function dialog(id, cls, html) {
  document.getElementById(id)?.remove();
  const d = document.createElement('dialog');
  d.id = id; d.className = cls; d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

function confetti() {
  const colors = ['#e7953e', '#6e8f54', '#d8b74d', '#698e9d', '#b97f9b', '#c8362e'];
  return Array.from({length: 46}, (_, i) =>
    `<i class="confetti" style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${((i * 0.13) % 2.4).toFixed(2)}s;animation-duration:${(2.6 + (i % 5) * 0.3).toFixed(1)}s"></i>`).join('');
}

// entries: decoded pumpkins; races: award rows per race in circuit order; trackNames: same order.
export function showChampion({entries, races, trackNames, colors = []}) {
  const rows = P.circuitStandings(races, entries.length), winners = rows.filter(r => r.winner);
  const d = dialog('champion', 'champion', `${confetti()}
    <div class="eyebrow">PUMPKIN · ${winners.length > 1 ? 'JOINT CHAMPIONS' : 'CIRCUIT CHAMPION'}</div>
    <h2>${winners.map(r => esc(nameOf(entries[r.team], r.team))).join(' &amp; ')}</h2>
    <div class="jackpot">${money(rows[0].total)}</div>
    <div class="ranks">${rows.map(r => `<div class="rank"><b>#${r.place}</b><i style="background:${colors[r.team] || '#e58b37'}"></i><div>${esc(nameOf(entries[r.team], r.team))}</div><b class="money">${money(r.total)}</b></div>`).join('')}</div>
    <div class="row"><form method="dialog"><button>Close</button></form><button id="reveal-builds" class="primary">Pumpkin Analysis →</button></div>`);
  d.querySelector('#reveal-builds').onclick = () => { d.close(); showAnalysis({entries, races, trackNames, colors}); };
  return d;
}

export function showAnalysis({entries, races, trackNames, colors = []}) {
  const d = dialog('analysis', 'analysis', `<header><h2>Pumpkin Analysis</h2><form method="dialog"><button>Close</button></form></header>
    <div class="table-scroll"><table class="breakdown"><thead><tr><th>Pumpkin</th><th>Winnings</th><th>Variety</th>
      ${GROUPS.map(([k, label]) => `<th class="${k.endsWith('a') ? 'art' : ''}">${label}</th>`).join('')}<th>Total used</th><th>Unused</th><th class="art">Artificial</th></tr></thead>
    <tbody>${entries.map((p, i) => `<tr><th><canvas class="mini" data-mini="${i}"></canvas><span class="nm"><i style="background:${colors[i] || '#e58b37'}"></i>${esc(nameOf(p, i))}</span></th>
      <td class="winnings"><b class="money">${money(totalOf(races, i))}</b>${trackNames.map((n, t) => `<small>${esc(n)} ${money(races[t]?.[i]?.money || 0)}</small>`).join('')}</td>
      <td>${esc(P.varietyOf(p).name)}</td>
      ${GROUPS.map(([k]) => `<td>${valueLabel(k, p[k])}<span class="spend">${p.spent[k]} changes</span></td>`).join('')}
      <td><b>${p.used}</b></td><td>${100 - p.used}</td><td class="art">${P.properties(p).artificial}</td></tr>`).join('')}</tbody></table></div>`);
  // The game's own pumpkin drawing for each row.
  d.querySelectorAll('[data-mini]').forEach(canvas => {
    const {c, w, h} = canvasContext(canvas);
    renderPumpkin(c, entries[+canvas.dataset.mini], w / 2, h * 0.57, 22);
  });
  return d;
}
