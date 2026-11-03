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

function knownDepth(id, visibleIds, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  const ps = parentsOfVisible(id, visibleIds);
  return ps.length ? 1 + Math.max(...ps.map(p => knownDepth(p, visibleIds, new Set(seen)))) : 0;
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

  // Only draw as many rings as there are known ancestors — "Everyone" on a
  // 4-generation family otherwise leaves the outer rings empty and the fan tiny.
  const maxDepth = Math.max(1, Math.min(maxDepthFor(S.treeGenerationLimit), knownDepth(rootId, ids)));
  const data = buildNode(rootId, 0, maxDepth, new Set(), ids);
  const hierarchyRoot = d3.hierarchy(data).sum(d => (d.children && d.children.length) ? 0 : 1);
  d3.partition().size([1, maxDepth + 1])(hierarchyRoot);

  // Same timing issue as the tree: the container isn't guaranteed to have its
  // real on-screen size on the very first render of a session, so measuring
  // it immediately can produce a tiny fallback-sized fan. Defer past two
  // animation frames to guarantee a layout pass has happened first.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const rect = wrapEl.getBoundingClientRect();
  const width = Math.max(360, rect.width || 800), height = Math.max(360, rect.height || 600);
  const ringWidth = Math.min(width / 2, height - 40) / (maxDepth + 1);

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', '100%');
  // Zoom transform goes on the outer group so wheel/pinch zoom centres on the
  // pointer; the fan's own offset to the bottom-centre sits inside it.
  const zoomG = svg.append('g').attr('class', 'fan-zoom');
  // Sit the fan's flat edge at the bottom when height is the limit, but centre
  // it vertically on tall narrow screens instead of leaving the top half empty.
  const fanRadius = ringWidth * (maxDepth + 1);
  const cy = Math.min(height - 24, (height + fanRadius) / 2);
  const g = zoomG.append('g').attr('class', 'fan-center').attr('transform', `translate(${width / 2},${cy})`);

  const arc = d3.arc()
    .startAngle(d => -Math.PI / 2 + d.x0 * Math.PI)
    .endAngle(d => -Math.PI / 2 + d.x1 * Math.PI)
    .innerRadius(d => d.y0 * ringWidth)
    .outerRadius(d => Math.max(d.y0 * ringWidth + 2, d.y1 * ringWidth - 2))
    .padAngle(0.004)
    .cornerRadius(2);

  // Unknown ancestors still get a faint slot, so each parent's side of the fan
  // keeps its shape and it's clear which branch a name belongs to.
  g.selectAll('path.fan-arc-empty').data(hierarchyRoot.descendants().filter(d => d.data.empty)).join('path')
    .attr('class', 'fan-arc-empty')
    .attr('d', arc);

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
      // Centre of mass of the half-disc, not its flat bottom edge, or the
      // years line gets clipped by the bottom of the view.
      sel.attr('transform', `translate(0,${-ringWidth * 0.42})`);
      const n = Math.max(4, Math.floor(ringWidth * 1.6 / 6.5));
      sel.append('text').attr('text-anchor', 'middle').attr('class', 'fan-label-name').text(d.data.name.length > n ? d.data.name.slice(0, n - 1) + '…' : d.data.name);
      if (years) sel.append('text').attr('text-anchor', 'middle').attr('dy', '1.15em').attr('class', 'fan-label-years').text(years);
      return;
    }
    const thickness = (d.y1 - d.y0) * ringWidth - 4;
    // Wide inner segments read best with text along the arc; the narrow outer
    // ones only have room for text running out along the radius.
    const tangential = arcLenAtMid >= thickness;
    const along = (tangential ? arcLenAtMid : thickness) - 8; // room for the text's length
    const across = tangential ? thickness : arcLenAtMid; // room for stacked lines
    if (across < 11 || along < 24) return; // too small to label
    // d3.arc measures angles clockwise from 12 o'clock; SVG rotate() measures
    // from 3 o'clock, hence the -90 for radial text. The +180 on the left half
    // keeps radial text upright. Tangential text never needs flipping because
    // the fan is only the top semicircle.
    const midDeg = (-Math.PI / 2 + (d.x0 + d.x1) / 2 * Math.PI) * 180 / Math.PI;
    const rot = tangential ? midDeg : midDeg - 90 + (midDeg < 0 ? 180 : 0);
    const rad = midDeg * Math.PI / 180;
    sel.attr('transform', `translate(${rMid * Math.sin(rad)},${-rMid * Math.cos(rad)}) rotate(${rot})`);
    const fit = (s, px) => { const n = Math.max(3, Math.floor(along / px)); return s.length > n ? s.slice(0, n - 1) + '…' : s };
    const twoLines = years && across >= 24;
    sel.append('text').attr('class', 'fan-label-name').attr('text-anchor', 'middle').attr('dy', twoLines ? '-0.2em' : '0.35em').text(fit(d.data.name, 6));
    if (twoLines) sel.append('text').attr('class', 'fan-label-years').attr('text-anchor', 'middle').attr('dy', '1em').text(fit(years, 5));
  });

  const zb = d3.zoom().scaleExtent([0.35, 3]).on('zoom', e => { zoomG.attr('transform', e.transform); syncFanZoomLabel() });
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
