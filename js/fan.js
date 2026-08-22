import * as d3 from 'd3';
import { S, $, fullName, person } from './state.js';

function parentsOfVisible(id, visibleIds) {
  return S.relationships
    .filter(r => r.relationship_type === 'parent' && r.to_person_id === id && visibleIds.has(r.from_person_id))
    .map(r => r.from_person_id);
}

function maxDepthFor(limit) {
  if (limit === 'all') return 7;
  return Math.max(1, Math.min(7, +limit));
}

function buildNode(id, depth, maxDepth, seenPath, visibleIds) {
  const emptyChildren = () => depth < maxDepth
    ? [buildNode(null, depth + 1, maxDepth, seenPath, visibleIds), buildNode(null, depth + 1, maxDepth, seenPath, visibleIds)]
    : [];
  const p = id ? person(id) : null;
  if (!id || depth > maxDepth || seenPath.has(id) || !p) return { id: null, empty: true, children: emptyChildren() };
  const nextSeen = new Set(seenPath); nextSeen.add(id);
  const parents = parentsOfVisible(id, visibleIds);
  const children = depth < maxDepth
    ? [buildNode(parents[0] || null, depth + 1, maxDepth, nextSeen, visibleIds), buildNode(parents[1] || null, depth + 1, maxDepth, nextSeen, visibleIds)]
    : [];
  return { id, name: fullName(p), birth: p.birth_date || '', death: p.death_date || '', empty: false, children };
}

export function bindFan() {}

export async function renderFan(people) {
  const wrapEl = $('fanWrap'), svgEl = $('fanSvg');
  if (!wrapEl || !svgEl) return;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const ids = new Set(people.map(p => p.id));
  const rootId = S.treeFocusId;
  const root = rootId ? person(rootId) : null;
  if (!root) { wrapEl.innerHTML = '<svg class="fan-svg" id="fanSvg"></svg><p class="small tree-empty">No one to focus on yet.</p>'; return }

  const maxDepth = maxDepthFor(S.treeGenerationLimit);
  const data = buildNode(rootId, 0, maxDepth, new Set(), ids);
  const hierarchyRoot = d3.hierarchy(data).sum(d => (d.children && d.children.length) ? 0 : 1);
  d3.partition().size([1, maxDepth + 1])(hierarchyRoot);

  const rect = wrapEl.getBoundingClientRect();
  const width = Math.max(360, rect.width || 800), height = Math.max(360, rect.height || 600);
  const ringWidth = Math.min(width / 2, height - 40) / (maxDepth + 1);

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', '100%');
  const centerG = svg.append('g').attr('class', 'fan-center').attr('transform', `translate(${width / 2},${height - 24})`);
  const g = centerG.append('g').attr('class', 'fan-zoom');

  const arc = d3.arc()
    .startAngle(d => -Math.PI / 2 + d.x0 * Math.PI)
    .endAngle(d => -Math.PI / 2 + d.x1 * Math.PI)
    .innerRadius(d => d.y0 * ringWidth)
    .outerRadius(d => Math.max(d.y0 * ringWidth + 2, d.y1 * ringWidth - 2))
    .padAngle(0.004)
    .cornerRadius(2);

  const nodes = hierarchyRoot.descendants().filter(d => !d.data.empty);

  g.selectAll('path.fan-arc').data(nodes, d => d.data.id + ':' + d.depth + ':' + d.x0).join('path')
    .attr('class', d => 'fan-arc' + (d.depth === 0 ? ' fan-arc-main' : ''))
    .attr('data-person-id', d => d.depth === 0 ? d.data.id : null)
    .attr('d', arc)
    .on('click', (e, d) => {
      if (d.depth === 0) return;
      S.treeFocusId = d.data.id;
      import('./tree.js').then(m => m.renderTree());
    });

  const labels = g.selectAll('g.fan-label').data(nodes, d => d.data.id + ':' + d.depth + ':' + d.x0).join('g')
    .attr('class', d => 'fan-label' + (d.depth === 0 ? ' fan-label-main' : ''))
    .attr('data-person-id', d => d.depth === 0 ? d.data.id : null);

  labels.each(function (d) {
    const sel = d3.select(this);
    const angularWidth = (d.x1 - d.x0) * Math.PI;
    const rMid = (d.y0 + d.y1) / 2 * ringWidth;
    const arcLenAtMid = angularWidth * rMid;
    const years = [d.data.birth, d.data.death].filter(Boolean).join(' – ');
    if (d.depth === 0) {
      sel.attr('transform', 'translate(0,-10)');
      sel.append('text').attr('text-anchor', 'middle').attr('class', 'fan-label-name').text(d.data.name);
      if (years) sel.append('text').attr('text-anchor', 'middle').attr('dy', '1.15em').attr('class', 'fan-label-years').text(years);
      return;
    }
    if (arcLenAtMid < 16) return; // too small to label
    const mid = -Math.PI / 2 + (d.x0 + d.x1) / 2 * Math.PI;
    const r0 = d.y0 * ringWidth + 6;
    const rot = mid * 180 / Math.PI;
    sel.attr('transform', `rotate(${rot}) translate(${r0},0)`);
    const maxChars = Math.max(4, Math.floor(arcLenAtMid / 6));
    const nameText = d.data.name.length > maxChars ? d.data.name.slice(0, maxChars - 1) + '…' : d.data.name;
    sel.append('text').attr('class', 'fan-label-name').text(nameText);
    if (years && angularWidth * ((d.y1) * ringWidth) > 30) {
      sel.append('text').attr('class', 'fan-label-years').attr('dy', '1.1em').text(years);
    }
  });

  const zb = d3.zoom().scaleExtent([0.35, 3]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zb);
  svgEl.__fanZoom = zb;
  syncFanZoomLabel();
}

function syncFanZoomLabel() {
  const svgEl = $('fanSvg'); const z = $('zoomLabel');
  if (!svgEl || !z) return;
  const t = svgEl.__fanZoom ? d3.zoomTransform(svgEl) : d3.zoomIdentity;
  z.textContent = Math.round(t.k * 100) + '%';
}

export function zoomFan(delta) {
  const svgEl = $('fanSvg'); if (!svgEl || !svgEl.__fanZoom) return;
  d3.select(svgEl).transition().duration(200).call(svgEl.__fanZoom.scaleBy, delta > 0 ? 1.2 : 1 / 1.2).on('end', syncFanZoomLabel);
}
export function resetFan() {
  const svgEl = $('fanSvg'); if (!svgEl || !svgEl.__fanZoom) return;
  d3.select(svgEl).transition().duration(300).call(svgEl.__fanZoom.transform, d3.zoomIdentity).on('end', syncFanZoomLabel);
}
export function fitFan() { resetFan() }
