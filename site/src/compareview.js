/**
 * Snapshot comparison view — selectors, summary chips, the per-workflow change
 * table and the RBQM flag-delta rows. Pure markup over compare.js results.
 */

import { esc } from './utils.js';
import { PHASES } from './constants.js';
import { FLAG_LEVELS, groupLabel } from './flags.js';
import { snapshotDate } from './masthead.js';

/** Phase tag reusing the existing pipeline colour scale. */
export function phaseTag(phase) {
  const p = PHASES.find((x) => String(phase || '').startsWith(x.prefix));
  const label = p ? p.label : String(phase || '—');
  const cls = p ? `phase-tag-${p.idx}` : 'phase-tag-x';
  return `<span class="phase-tag ${cls}" title="${esc(String(phase || ''))}">${esc(label)}</span>`;
}

/** The two snapshot selectors. */
export function buildCompareControls(snapshots, fromId, toId) {
  const opt = (s, sel) =>
    `<option value="${esc(s.snapshot_id)}"${s.snapshot_id === sel ? ' selected' : ''}>`
    + `${esc(s.snapshot_id)} — ${esc(snapshotDate(s.created_at))} · ${esc(s.input_data_version || '')}</option>`;
  let h = '<div class="compare-controls">';
  h += '<label class="field"><span class="field-label">Baseline</span>'
    + '<select id="compareFrom" class="select">'
    + snapshots.map((s) => opt(s, fromId)).join('')
    + '</select></label>';
  h += '<span class="compare-vs" aria-hidden="true">vs</span>';
  h += '<label class="field"><span class="field-label">Comparison</span>'
    + '<select id="compareTo" class="select">'
    + snapshots.map((s) => opt(s, toId)).join('')
    + '</select></label>';
  h += '</div>';
  return h;
}

/** Summary chips — added / changed / removed, with the honesty footnote. */
export function buildCompareSummary(summary) {
  const chips = [
    { key: 'added', value: summary.added, label: summary.added === 1 ? 'artifact added' : 'artifacts added' },
    { key: 'changed', value: summary.changed, label: summary.changed === 1 ? 'artifact changed' : 'artifacts changed' },
    { key: 'removed', value: summary.removed, label: summary.removed === 1 ? 'artifact removed' : 'artifacts removed' },
  ];
  let h = '<div class="chips">';
  for (const c of chips) {
    h += `<div class="chip chip-${c.key}"><span class="chip-value num">${esc(String(c.value))}</span>`
      + `<span class="chip-label">${esc(c.label)}</span></div>`;
  }
  h += '</div>';
  h += '<p class="compare-note">'
    + `Added and removed are exact — they come from each snapshot's <span class="mono">status.json</span> and `
    + `<span class="mono">reports.json</span>. <strong>Changed</strong> counts only the `
    + `<span class="num">${esc(String(summary.compared))}</span> artifacts whose bytes were fetched from both snapshots `
    + '(the reporting tables and each metric\'s summary); '
    + `<span class="num">${esc(String(summary.notCompared))}</span> further shared artifacts — mapped domains, intermediate metric tables and the rendered HTML — were not compared.`
    + (summary.unavailable ? ` <span class="num">${esc(String(summary.unavailable))}</span> could not be fetched.` : '')
    + '</p>';
  return h;
}

const STATE_LABEL = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  identical: 'Identical',
  'not-compared': 'Not compared',
};

/** Per-workflow change table. */
export function buildCompareTable(rows) {
  if (!rows || !rows.length) {
    return '<div class="empty-state"><div class="empty-title">Nothing to compare</div>'
      + '<div class="empty-hint">These snapshots publish the same artifact set with no fetched differences.</div></div>';
  }
  let h = '<div class="table-scroll"><table class="compare-table">';
  h += '<caption class="visually-hidden">Per-workflow differences between the two snapshots</caption>';
  h += '<thead><tr><th scope="col">Workflow</th><th scope="col">Phase</th><th scope="col">Change</th><th scope="col">Artifacts</th></tr></thead><tbody>';
  for (const r of rows) {
    h += '<tr>';
    h += `<td class="mono">${esc(r.workflow)}</td>`;
    h += `<td>${phaseTag(r.phase)}</td>`;
    h += `<td><span class="state state-${esc(r.status)}">${esc(STATE_LABEL[r.status] || r.status)}</span></td>`;
    h += `<td class="compare-note-cell">${esc(r.note)}</td>`;
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}

/** Flag-delta rows for the RBQM layer. */
export function buildFlagDeltaTable(deltas, metrics, groups, groupLevel = 'Site') {
  if (!deltas || !deltas.length) {
    return '<p class="change-empty">No flag level changed between these snapshots.</p>';
  }
  let h = '<div class="table-scroll"><table class="compare-table">';
  h += `<caption class="visually-hidden">Flag changes at the ${esc(groupLevel)} level</caption>`;
  h += `<thead><tr><th scope="col">${esc(groupLevel)}</th><th scope="col">Metric</th>`
    + '<th scope="col">Was</th><th scope="col">Now</th><th scope="col">Direction</th></tr></thead><tbody>';
  for (const d of deltas) {
    const metric = metrics?.get(d.metricId);
    h += '<tr>';
    h += `<td class="mono">${esc(groupLabel(d.groupId, groups?.get(d.groupId)))}</td>`;
    h += `<td>${esc(metric?.name || String(d.metricId).replace(/^Analysis_/, ''))}</td>`;
    h += `<td><span class="state state-flag-${esc(d.fromLevel)}">${esc(FLAG_LEVELS[d.fromLevel].short)}</span></td>`;
    h += `<td><span class="state state-flag-${esc(d.toLevel)}">${esc(FLAG_LEVELS[d.toLevel].short)}</span></td>`;
    h += `<td><span class="state state-${esc(d.direction)}">${esc(d.direction)}</span></td>`;
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}

/** The full compare view. */
export function buildCompareView(o) {
  let h = '<section class="domain-view">';
  h += '<div class="domain-head"><div>';
  h += '<h2 class="domain-title">Compare snapshots</h2>';
  h += '<p class="domain-sub">A client-side diff of two published snapshot trees — no server, no build step.</p>';
  h += '</div></div>';
  h += buildCompareControls(o.snapshots, o.fromId, o.toId);
  if (o.loading) {
    h += '<div class="loading"><span class="spinner"></span> Reading both snapshots…</div>';
    h += '</section>';
    return h;
  }
  if (o.error) {
    h += `<div class="error-msg">${esc(o.error)}</div></section>`;
    return h;
  }
  if (o.fromId === o.toId) {
    h += '<div class="empty-state"><div class="empty-title">Pick two different snapshots</div>'
      + '<div class="empty-hint">A snapshot compared with itself has nothing to show.</div></div></section>';
    return h;
  }
  h += buildCompareSummary(o.summary);
  h += '<h3 class="section-title">Workflow changes</h3>';
  h += buildCompareTable(o.rows);
  h += '<h3 class="section-title">RBQM flag changes</h3>';
  h += buildFlagDeltaTable(o.deltas, o.metrics, o.groups, o.groupLevel);
  h += '</section>';
  return h;
}
