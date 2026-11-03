// Fake but deliberately messy family: remarriage with a half-sibling, co-parents
// never recorded as partners, a single-parent child, a stored 'sibling' link
// with no shared parent, partners with no children, an "Unknown" placeholder,
// and in-laws who fall outside the viewer's family-side scope.
import { S, applyTheme } from '../js/state.js';

const P = (id, display_name, birth_date = '', death_date = '') => ({ id, display_name, birth_date, death_date, living: !death_date });
S.people = [
  P('george', 'George Canterbury', '1900', '1970'), P('edith', 'Edith Canterbury', '1905', '1980'),
  P('walter', 'Walter Hughes', '1898', '1960'), P('mabel', 'Mabel Hughes', '1902', '1975'),
  P('arthur', 'Arthur Canterbury', '1930', '2000'), P('margaret', 'Margaret Canterbury', '1932', '1965'),
  P('irene', 'Irene Canterbury', '1940'), P('frank', 'Frank Ellis', '1928', '1999'),
  P('doris', 'Doris Ellis', '1931', '2010'), P('harold', 'Harold Hughes', '1934', '2001'),
  P('paul', 'Paul Canterbury', '1958'), P('jean', 'Jean Canterbury', '1960'),
  P('susan', 'Susan Lee', '1960'), P('mark', 'Mark Lee', '1959'), P('tim', 'Tim Canterbury', '1968'),
  P('robert', 'Robert Ellis', '1962'), P('carol', 'Carol Ellis', '1964'),
  P('julian', 'Julian Canterbury', '1985'), P('sophie', 'Sophie Canterbury', '1986'),
  P('andrew', 'Andrew Canterbury', '1987'), P('kate', 'Kate Canterbury', '1988'),
  P('rachel', 'Rachel Canterbury', '1990'), P('sam', 'Sam Doe', '1992'),
  P('emma', 'Emma Lee', '1991'), P('lucy', 'Lucy Canterbury', '2000'),
  P('oliver', 'Oliver Canterbury', '2015'), P('mia', 'Mia Canterbury', '2018'), P('leo', 'Leo Canterbury', '2019'),
  P('brian', 'Brian Grant', '1955'), P('linda', 'Linda Grant', '1957'),
  P('unk', 'Unknown'),
];
const rels = [];
const parent = (p, ...kids) => kids.forEach(k => rels.push({ from_person_id: p, to_person_id: k, relationship_type: 'parent' }));
const partner = (a, b) => rels.push({ from_person_id: a, to_person_id: b, relationship_type: 'partner' });
const sibling = (a, b) => rels.push({ from_person_id: a, to_person_id: b, relationship_type: 'sibling' });
partner('george', 'edith'); parent('george', 'arthur'); parent('edith', 'arthur');
partner('walter', 'mabel'); parent('walter', 'doris', 'harold'); parent('mabel', 'doris', 'harold');
partner('arthur', 'margaret'); parent('arthur', 'paul', 'susan'); parent('margaret', 'paul', 'susan');
partner('arthur', 'irene'); parent('arthur', 'tim'); parent('irene', 'tim');
partner('frank', 'doris'); parent('frank', 'jean', 'robert'); parent('doris', 'jean', 'robert');
partner('jean', 'paul'); parent('paul', 'julian', 'andrew', 'rachel'); parent('jean', 'julian', 'andrew', 'rachel');
parent('susan', 'emma'); parent('mark', 'emma'); // co-parents, no partner row
parent('unk', 'mark');
parent('tim', 'lucy'); // single parent on record
partner('robert', 'carol');
partner('julian', 'sophie'); parent('julian', 'oliver', 'mia'); parent('sophie', 'oliver', 'mia');
partner('andrew', 'kate'); parent('kate', 'leo'); parent('andrew', 'leo');
sibling('rachel', 'sam');
partner('brian', 'linda'); parent('brian', 'sophie'); parent('linda', 'sophie');
S.relationships = rels;
S.faces = []; S.photos = [];
S.profile = { person_id: 'julian', role: 'owner' };
S.sb = { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } };

const index = new DOMParser().parseFromString(await (await fetch('../index.html')).text(), 'text/html');
const page = index.getElementById('graphPage');
page.classList.remove('hidden');
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99;background:#222;color:#eee;padding:6px 8px;border-radius:8px;font:12px sans-serif';
panel.innerHTML = '<label><input type="checkbox" id="harnessEveryone"> Show everyone</label>';
document.body.append(page, panel);
document.getElementById('harnessEveryone').addEventListener('change', e => { S.showEveryone = e.target.checked; renderTree() });

const { bindTree, renderTree } = await import('../js/tree.js');
const { bindNavigation } = await import('../js/navigation.js');
S.showEveryone = false;
applyTheme('ocean');
bindNavigation(); bindTree();
const h = location.hash.startsWith('#graph/') ? location.hash.slice(7).split('/') : [];
if (h[0]) S.treeFocusId = decodeURIComponent(h[0]);
if (h[1]) S.treeViewMode = h[1];
if (h[2]) S.treeGenerationLimit = h[2] === 'all' ? 'all' : +h[2];
await renderTree();
window.S = S;

// From the console: await checkTree('arthur', 3). Renders the Tree focused on
// that person and reports any card on the wrong generation row, any two cards
// at the same spot, and anyone drawn twice. Waits for animations to settle —
// reading positions mid-transition gives false alarms.
window.checkTree = async (focus, limit) => {
  S.treeFocusId = focus; S.treeGenerationLimit = limit; S.treeViewMode = 'tree';
  await renderTree();
  await new Promise(r => setTimeout(r, 2500));
  const gen = { [focus]: 0 }, q = [focus];
  while (q.length) {
    const id = q.shift();
    S.relationships.forEach(r => {
      let o, d;
      if (r.relationship_type === 'parent' && r.to_person_id === id) { o = r.from_person_id; d = -1 }
      else if (r.relationship_type === 'parent' && r.from_person_id === id) { o = r.to_person_id; d = 1 }
      else if (r.relationship_type !== 'parent' && (r.from_person_id === id || r.to_person_id === id)) { o = r.from_person_id === id ? r.to_person_id : r.from_person_id; d = 0 }
      if (o && !(o in gen)) { gen[o] = gen[id] + d; q.push(o) }
    });
  }
  const cards = [...document.querySelectorAll('.card_cont')].map(c => {
    const [, x, y] = c.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return { id: c.querySelector('[data-id]')?.dataset.id, x: +x, y: +y, name: c.querySelector('strong')?.textContent };
  });
  const wrongRow = cards.filter(c => gen[c.id] !== undefined && Math.round(c.y / 250) !== gen[c.id]).map(c => `${c.name}: row ${c.y / 250}, expected ${gen[c.id]}`);
  const at = {}, overlaps = [], seen = {}, drawnTwice = [];
  cards.forEach(c => { const k = c.x + ',' + c.y; if (at[k]) overlaps.push(at[k] + ' & ' + c.name); at[k] = c.name; if (seen[c.id]) drawnTwice.push(c.name); seen[c.id] = 1 });
  return { focus, limit, shown: cards.map(c => c.name), wrongRow, overlaps, drawnTwice };
};
