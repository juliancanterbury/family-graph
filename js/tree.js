import * as d3 from 'd3';
import * as f3 from 'https://cdn.jsdelivr.net/npm/family-chart@0.9.0/dist/family-chart.esm.js';
import { S, $, esc, fullName, person, initial, visiblePeople } from './state.js';
import { faceForPerson, cropStyle } from './render.js';
import { renderFan, bindFan } from './fan.js';

let chart = null;

function relIndexes(people) {
  const ids = new Set(people.map(p => p.id));
  const childrenOf = {}, parentsOf = {}, spousesOf = {};
  S.relationships.forEach(r => {
    if (!ids.has(r.from_person_id) || !ids.has(r.to_person_id)) return;
    if (r.relationship_type === 'parent') {
      (childrenOf[r.from_person_id] ||= []).push(r.to_person_id);
      (parentsOf[r.to_person_id] ||= []).push(r.from_person_id);
    }
    if (r.relationship_type === 'partner') {
      (spousesOf[r.from_person_id] ||= new Set()).add(r.to_person_id);
      (spousesOf[r.to_person_id] ||= new Set()).add(r.from_person_id);
    }
  });
  return { childrenOf, parentsOf, spousesOf };
}

async function avatarField(p) {
  if (p.avatar_path) {
    const bucketName = typeof FAMILY_MEDIA_BUCKET !== 'undefined' ? FAMILY_MEDIA_BUCKET : 'family-media';
    const url = S.sb.storage.from(bucketName).getPublicUrl(p.avatar_path).data.publicUrl;
    return { avatarKind: 'img', avatarUrl: url };
  }
  const f = faceForPerson(p.id);
  if (f) return { avatarKind: 'style', avatarStyle: await cropStyle(f, 56) };
  return { avatarKind: 'initials', avatarInitials: initial(p) };
}

export async function buildFamilyChartData(people) {
  const { childrenOf, parentsOf, spousesOf } = relIndexes(people);
  return Promise.all(people.map(async p => {
    const av = await avatarField(p);
    const parents = parentsOf[p.id] || [];
    const rels = {};
    if (parents[0]) rels.father = parents[0];
    if (parents[1]) rels.mother = parents[1];
    const sp = [...(spousesOf[p.id] || [])];
    if (sp.length) rels.spouses = sp;
    const ch = childrenOf[p.id] || [];
    if (ch.length) rels.children = ch;
    return { id: p.id, rels, data: { name: fullName(p), birth: p.birth_date || '', death: p.death_date || '', ...av } };
  }));
}

function cardInnerHtmlCreator(d) {
  const p = d.data.data;
  let avatar;
  if (p.avatarKind === 'img') avatar = `<div class="fg-card-avatar"><img src="${esc(p.avatarUrl)}" alt=""></div>`;
  else if (p.avatarKind === 'style') avatar = `<div class="fg-card-avatar" style="${p.avatarStyle}"></div>`;
  else avatar = `<div class="fg-card-avatar fg-card-initials">${esc(p.avatarInitials)}</div>`;
  return `<div class="card-inner fg-card">
    ${avatar}
    <strong>${esc(p.name)}</strong>
    <span class="small">${esc(p.birth || '')}${p.death ? ' – ' + esc(p.death) : ''}</span>
    <a class="tree-view-profile" data-person-id="${d.data.id}">View profile →</a>
  </div>`;
}

function depthsFor(limit) {
  if (limit === 'all') return { a: 40, p: 40 };
  const n = +limit;
  return { a: n, p: n };
}

function getZoomListener() {
  if (!chart) return null;
  const svg = chart.svg;
  if (!svg) return null;
  const el = svg.__zoomObj ? svg : svg.parentNode;
  return el && el.__zoomObj ? el : null;
}

function syncZoomLabel() {
  const el = getZoomListener();
  const z = $('zoomLabel');
  if (!z) return;
  const k = el ? d3.zoomTransform(el).k : 1;
  z.textContent = Math.round(k * 100) + '%';
}

function defaultFocusId(ids) {
  if (S.treeFocusId && ids.has(S.treeFocusId)) return S.treeFocusId;
  if (S.profile?.person_id && ids.has(S.profile.person_id)) return S.profile.person_id;
  const sorted = [...ids].map(person).filter(Boolean).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return sorted[0]?.id || null;
}

function syncFocusChip() {
  const chip = $('treeFocusChip');
  const sel = $('treeGenerationSelect');
  if (sel && sel.value !== String(S.treeGenerationLimit)) sel.value = String(S.treeGenerationLimit);
  if (!chip) return;
  const p = person(S.treeFocusId);
  if (!p) { chip.classList.add('hidden'); return }
  chip.classList.remove('hidden');
  chip.querySelector('span').textContent = 'Centred on ' + fullName(p);
}

function syncGraphHash() {
  if (!S.treeFocusId) return;
  const target = '#graph/' + encodeURIComponent(S.treeFocusId) + '/' + S.treeViewMode + '/' + S.treeGenerationLimit;
  if (location.hash !== target) history.replaceState(null, '', target);
}

function onCardClick(e, d) {
  if (e.target.closest('[data-person-id]')) return;
  const id = d.data.id;
  S.treeFocusId = id;
  renderTree();
}

export async function renderTree() {
  const graphWrap = $('graphWrap'), fanWrap = $('fanWrap');
  const showFan = S.treeViewMode === 'fan';
  graphWrap?.classList.toggle('hidden', showFan);
  fanWrap?.classList.toggle('hidden', !showFan);
  document.querySelectorAll('#treeViewToggle [data-tree-view]').forEach(b => b.classList.toggle('primary', b.dataset.treeView === (showFan ? 'fan' : 'tree')));
  text($('treeHelpStrip'), showFan
    ? 'Focus person sits at the centre bottom; ancestors fan outward, one ring per generation back.'
    : 'Click a person to make them the centre of the tree. Use "Show" to limit how many generations appear around them.');

  const el = $('graph');
  if (!el) return;
  const people = visiblePeople();
  const ids = new Set(people.map(p => p.id));
  S.treeFocusId = defaultFocusId(ids);
  syncGraphHash();

  if (showFan) {
    chart = null;
    await renderFan(people);
    syncFocusChip();
    return;
  }

  if (!people.length) { el.innerHTML = '<p class="small tree-empty">No one visible yet — add some people first.</p>'; return }
  if (!S.treeFocusId) { el.innerHTML = '<p class="small tree-empty">No one to focus on yet.</p>'; return }

  const data = await buildFamilyChartData(people);
  el.innerHTML = '';
  chart = f3.createChart('#graph', data);
  chart.setTransitionTime(350);
  chart.setCardHtml()
    .setCardDim({ w: 180, h: 168 })
    .setCardInnerHtmlCreator(cardInnerHtmlCreator)
    .setOnCardClick(onCardClick);
  // card_x_spacing/card_y_spacing are the actual center-to-center gap between
  // cards, not a margin added on top of card_dim — must exceed card_dim.w/h or
  // adjacent cards overlap.
  chart.setCardXSpacing(230);
  chart.setCardYSpacing(250);
  chart.setSingleParentEmptyCard(false);
  chart.setShowSiblingsOfMain(true);
  const { a, p: pd } = depthsFor(S.treeGenerationLimit);
  chart.setAncestryDepth(a);
  chart.setProgenyDepth(pd);
  chart.updateMainId(S.treeFocusId);
  chart.updateTree({ initial: true });

  const zEl = getZoomListener();
  if (zEl && zEl.__zoomObj) zEl.__zoomObj.on('zoom.label', () => syncZoomLabel());
  syncZoomLabel();
  syncFocusChip();
}

function text(el, v) { if (el) el.textContent = v }

export function setTreeFocus(id) { S.treeFocusId = id; renderTree() }
export function clearTreeFocus() {
  S.treeFocusId = S.profile?.person_id || null;
  renderTree();
}
export function fitGraph() {
  if (S.treeViewMode === 'fan') { import('./fan.js').then(m => m.fitFan?.()); return }
  chart?.updateTree({ tree_position: 'fit', transition_time: 400 });
  setTimeout(syncZoomLabel, 450);
}
export function zoom(delta) {
  if (S.treeViewMode === 'fan') { import('./fan.js').then(m => m.zoomFan?.(delta)); return }
  const el = getZoomListener();
  if (!el) return;
  d3.select(el).transition().duration(200).call(el.__zoomObj.scaleBy, delta > 0 ? 1.2 : 1 / 1.2).on('end', syncZoomLabel);
}
export function zoomResetGraph() {
  if (S.treeViewMode === 'fan') { import('./fan.js').then(m => m.resetFan?.()); return }
  chart?.updateTree({ tree_position: 'main_to_middle', transition_time: 400 });
  setTimeout(syncZoomLabel, 450);
}

export function bindTree() {
  bindFan();
  document.getElementById('fitGraphBtn')?.addEventListener('click', fitGraph);
  document.getElementById('zoomInBtn')?.addEventListener('click', () => zoom(1));
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => zoom(-1));
  document.getElementById('zoomResetBtn')?.addEventListener('click', zoomResetGraph);
  document.getElementById('themeRail')?.addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (b) { import('./state.js').then(m => m.applyTheme(b.dataset.theme)) } });
  document.getElementById('treeFocusChip')?.addEventListener('click', clearTreeFocus);
  document.getElementById('treeGenerationSelect')?.addEventListener('change', e => { S.treeGenerationLimit = e.target.value === 'all' ? 'all' : +e.target.value; renderTree() });
  document.getElementById('treeViewToggle')?.addEventListener('click', e => {
    const b = e.target.closest('[data-tree-view]'); if (!b) return;
    S.treeViewMode = b.dataset.treeView;
    localStorage.setItem('familyGraphTreeView', S.treeViewMode);
    renderTree();
  });
}
