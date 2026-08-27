import { PHASES } from './constants.js';
import { esc } from './utils.js';
import { buildStatusBadge, buildStatusSummary } from './status.js';

const REPO_BASE = 'https://github.com/Gilead-BioStats/open.gismo';

function normalizePriority(item) {
  if (!item.Priority && item.Priority !== 0) item.Priority = '0';
}

function groupByPriority(items) {
  const groups = {};
  items.forEach(it => { const p = it.Priority; (groups[p] = groups[p] || []).push(it); });
  return Object.keys(groups).map(Number).sort().map(p => ({ priority: p, items: groups[p] }));
}

const linkSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M3.75 2h3.5a.75.75 0 010 1.5H4.5v8h8V8.75a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.72-.03h2.78a.75.75 0 01.75.75v2.78a.75.75 0 01-1.5 0V4.31L8.78 8.03a.75.75 0 01-1.06-1.06l3.72-3.72h-1.19a.75.75 0 010-1.5z"/></svg>';
const infoSvg = '<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">i</text></svg>';
const dataSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';

export function makeCard(item, phaseIdx, compact) {
  const p = PHASES[phaseIdx], color = p ? p.color : '#94a3b8';
  const id = esc(item.ID || item._stem);
  const desc = esc(item.Description || item.Metric || item.Name || '');
  const gl = item.GroupLevel || '', at = item.AnalysisType || '', ot = item.Output || '';
  const pri = item.Priority;
  const path = esc(item._path || '');
  const ghUrl = `${REPO_BASE}/blob/HEAD/${path}`;
  const search = esc(
    [item._stem, item.ID, item.Description, item.Metric, item.Name, gl, at, item.Abbreviation]
      .filter(Boolean).join(' ')
  );

  // Activation state â€” treat missing/undefined as active/true
  const isActive = item.Active !== false && item.Active !== 'false';
  const hasRiskSignal = item.GenerateRiskSignal !== false && item.GenerateRiskSignal !== 'false';

  const hasOutputs = item._steps && item._steps.some(s => s.status === 'completed' && s.output);
  const dataBtn = hasOutputs
    ? `<button class="card-data-btn" data-wf-type="${esc(item.Type)}" data-wf-id="${esc(item.ID || item._stem)}" aria-label="View output data" title="View data">${dataSvg}</button>`
    : '';

  const actions = `<div class="card-actions"><a href="${ghUrl}" target="_blank" rel="noopener" class="card-link-btn" aria-label="Open in GitHub" title="Open in GitHub">${linkSvg}</a>${dataBtn}<button class="card-info-btn" data-path="${path}" aria-label="View workflow details" title="View details">${infoSvg}</button></div>`;

  if (compact) {
    const inactiveCls = isActive ? '' : ' card-inactive';
    return `<div class="card card-compact${inactiveCls}" data-group="${esc(gl)}" data-type="${esc(at || ot)}" data-search="${search}">
      <div class="card-header"><div class="card-id" style="color:${color}">${id}</div>${actions}</div></div>`;
  }

  let tags = '';
  tags += `<span class="tag tag-priority">P${esc(String(pri))}</span>`;
  if (gl) tags += `<span class="tag tag-${gl.toLowerCase()}">${esc(gl)}</span>`;
  if (at) tags += `<span class="tag tag-${at.toLowerCase()}">${esc(at)}</span>`;
  if (ot) {
    const f = ot.replace(/^\./, '').toUpperCase();
    tags += `<span class="tag tag-${f.toLowerCase()}">${f}</span>`;
  }
  // Activation badges â€” only shown when metric is not in default active/signal state
  if (!isActive) tags += '<span class="tag tag-inactive">Inactive</span>';
  else if (!hasRiskSignal) tags += '<span class="tag tag-monitoring">Monitoring Only</span>';

  let statusHtml = '';
  if (item._steps && item._steps.length) {
    const tmp = document.createElement('div');
    tmp.appendChild(buildStatusSummary(item._steps));
    statusHtml = tmp.innerHTML;
  }

  const inactiveCls = isActive ? '' : ' card-inactive';
  return `<div class="card${inactiveCls}" data-group="${esc(gl)}" data-type="${esc(at || ot)}" data-search="${search}">
    <div class="card-header"><div class="card-id" style="color:${color}">${id}</div>${actions}</div><div class="card-title">${desc}</div>
    <div class="card-tags">${tags}</div>${statusHtml}</div>`;
}

function renderPriorityGroups(items, phaseIdx, compact) {
  const pGroups = groupByPriority(items);
  let h = '';
  pGroups.forEach(({ priority, items: pItems }) => {
    h += `<div class="subgroup"><div class="subgroup-label">Priority ${priority} (${pItems.length})</div>`;
    pItems.forEach(it => { h += makeCard(it, phaseIdx, compact); });
    h += '</div>';
  });
  return h;
}

export function buildPipeline(phases, compact = false) {
  Object.values(phases).flat().forEach(normalizePriority);

  const arrow = '<div class="arrow"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>';
  let h = '';
  const idxs = Object.keys(phases).map(Number).sort();

  h += '<div class="stats">';
  idxs.forEach(i => {
    const p = PHASES[i];
    h += `<div class="stat"><div class="stat-value" style="color:${p.color}">${phases[i].length}</div><div class="stat-label">${esc(p.label)}</div></div>`;
  });
  h += '</div>';

  const gls = new Set();
  Object.values(phases).flat().forEach(it => { if (it.GroupLevel) gls.add(it.GroupLevel); });
  h += '<div class="filters"><button class="filter-btn active" data-group="all">All</button>';
  [...gls].sort().forEach(gl => {
    h += `<button class="filter-btn" data-group="${esc(gl)}">${esc(gl)}</button>`;
  });
  h += '</div><div class="pipeline">';

  idxs.forEach((idx, i) => {
    if (i > 0) h += arrow;
    const p = PHASES[idx], items = phases[idx];
    h += `<div class="phase phase-${idx}"><div class="phase-header">${idx} &bull; ${esc(p.label)} (${items.length})</div><div class="phase-body">`;
    h += renderPriorityGroups(items, idx, compact);
    h += '</div></div>';
  });
  h += '</div>';

  h += `<div class="legend">
    <div class="legend-section"><span class="legend-title">Priority:</span><span class="tag tag-priority">P0</span><span class="tag tag-priority">P1</span><span class="tag tag-priority">P2</span><span class="tag tag-priority">P3</span></div>
    <div class="legend-section"><span class="legend-title">Group Level:</span><span class="tag tag-site">Site</span><span class="tag tag-country">Country</span><span class="tag tag-study">Study</span><span class="tag tag-subject">Subject</span></div>
    <div class="legend-section"><span class="legend-title">Analysis Type:</span><span class="tag tag-rate">rate</span><span class="tag tag-binary">binary</span><span class="tag tag-identity">identity</span></div>
    <div class="legend-section"><span class="legend-title">Output:</span><span class="tag tag-html">HTML</span><span class="tag tag-xlsx">XLSX</span><span class="tag tag-pptx">PPTX</span></div>
  </div>`;
  return h;
}
