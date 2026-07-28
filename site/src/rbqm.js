/**
 * RBQM domain — the monitor (Direction A, re-homed).
 *
 * Flag tiles, the group × metric matrix, and links into the rendered gsm.kri
 * module reports. Everything derives from the snapshot's reporting layer via
 * flags.js; nothing is computed in the browser beyond counting.
 *
 * Accessibility rule for the matrix: a flag cell is never colour alone. Each
 * cell carries a shape-bearing glyph and an aria-label with the group, metric
 * and flag level in words; the level's short label is also rendered as text for
 * red and amber cells.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';
import { FLAG_LEVELS, flagLabel, groupLabel } from './flags.js';

const GLYPH = { red: '●', amber: '◆', ontrack: '·', none: '' };

/**
 * Flag tiles. Counts are group-level roll-ups (a site with any red flag counts
 * once), which is what a monitor actually acts on.
 */
export function buildFlagTiles(summary, opts = {}) {
  const level = (summary?.groupLevel || 'Site').toLowerCase();
  const tiles = [
    { key: 'red', label: `Red ${level}s`, value: summary?.redGroups || 0, note: `${summary?.red || 0} flagged metrics` },
    { key: 'amber', label: `Amber ${level}s`, value: summary?.amberGroups || 0, note: `${summary?.amber || 0} flagged metrics` },
    { key: 'ontrack', label: `On-track ${level}s`, value: summary?.clearGroups || 0, note: `${summary?.onTrack || 0} clear metrics` },
  ];
  let h = `<div class="tiles"${opts.compact ? ' data-compact="true"' : ''}>`;
  for (const t of tiles) {
    h += `<div class="tile tile-${t.key}">`;
    h += `<div class="tile-value num">${esc(String(t.value))}</div>`;
    h += `<div class="tile-label">${esc(t.label)}</div>`;
    h += `<div class="tile-note">${esc(t.note)}</div>`;
    h += '</div>';
  }
  h += '</div>';
  if (summary?.notEvaluated) {
    h += `<p class="tiles-foot"><span class="num">${esc(String(summary.notEvaluated))}</span> group × metric cells were not evaluated at this snapshot `
      + '(below the metric\'s accrual threshold).</p>';
  }
  return h;
}

/** One matrix cell — glyph + text label + aria-label. */
export function buildMatrixCell(cell, groupName, metricName) {
  const level = cell ? cell.level : 'none';
  const meta = FLAG_LEVELS[level];
  const text = cell ? flagLabel(cell.flag) : 'Not evaluated';
  const aria = `${groupName}, ${metricName}: ${text}`;
  const showText = level === 'red' || level === 'amber';
  return `<td class="cell cell-${level}">`
    + `<span class="cell-mark" role="img" aria-label="${esc(aria)}" title="${esc(aria)}">`
    + `<span class="cell-glyph" aria-hidden="true">${GLYPH[level]}</span>`
    + (showText ? `<span class="cell-text">${esc(meta.short)}</span>` : '')
    + '</span></td>';
}

/**
 * The group × metric matrix.
 * @param {object} matrix from flags.buildMatrix
 * @param {Map} metrics from flags.metricIndex
 * @param {Map} groups from flags.groupIndex
 */
export function buildMatrixTable(matrix, metrics, groups) {
  if (!matrix || !matrix.groups.length) {
    return '<div class="empty-state"><div class="empty-title">No flagged '
      + esc(String(matrix?.groupLevel || 'group').toLowerCase()) + 's at this snapshot</div>'
      + '<div class="empty-hint">Every evaluated group × metric cell is on track.</div></div>';
  }
  const level = matrix.groupLevel;
  let h = '<div class="table-scroll"><table class="matrix">';
  h += `<caption class="visually-hidden">${esc(level)} by metric flag matrix. `
    + `${matrix.groups.length} of ${matrix.allGroupCount} ${esc(level.toLowerCase())}s shown.</caption>`;
  h += `<thead><tr><th scope="col" class="matrix-corner">${esc(level)}</th>`;
  for (const id of matrix.metricIds) {
    const m = metrics?.get(id);
    const abbrev = m?.abbreviation || id.replace(/^Analysis_/, '');
    const name = m?.name || id;
    h += `<th scope="col" class="matrix-metric"><abbr title="${esc(name)}">${esc(abbrev)}</abbr></th>`;
  }
  h += '</tr></thead><tbody>';
  for (const g of matrix.groups) {
    const name = groupLabel(g.id, groups?.get(g.id));
    h += `<tr><th scope="row" class="matrix-group"><span class="mono">${esc(String(g.id))}</span>`;
    const meta = groups?.get(g.id);
    if (meta?.InvestigatorLastName) {
      h += `<span class="matrix-group-sub">${esc(meta.InvestigatorLastName)}${meta.Country ? `, ${esc(meta.Country)}` : ''}</span>`;
    }
    h += '</th>';
    for (const id of matrix.metricIds) {
      const m = metrics?.get(id);
      h += buildMatrixCell(matrix.cell(g.id, id), name, m?.name || id);
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}

/** Legend — the flag vocabulary in words, always shown with the matrix. */
export function buildMatrixLegend() {
  const items = [
    ['red', `${GLYPH.red} Red — |flag| = 2`],
    ['amber', `${GLYPH.amber} Amber — |flag| = 1`],
    ['ontrack', `${GLYPH.ontrack} On track — flag 0`],
    ['none', '· Not evaluated'],
  ];
  return '<ul class="legend">' + items.map(([k, t]) =>
    `<li class="legend-item legend-${k}"><span class="legend-swatch" aria-hidden="true"></span>${esc(t)}</li>`).join('') + '</ul>';
}

/** Links into the rendered gsm.kri module reports (iframe pages). */
export function buildModuleReports(reportsJson) {
  const reports = reportsJson && Array.isArray(reportsJson.reports) ? reportsJson.reports : [];
  if (!reports.length) {
    return '<div class="empty-state"><div class="empty-title">No module reports in this snapshot</div>'
      + '<div class="empty-hint">The <span class="mono">4_modules</span> phase produced no reports.</div></div>';
  }
  let h = '<div class="report-links">';
  for (const r of reports) {
    h += `<a class="report-link" href="${esc(buildHash('rbqm', ['report', r.id]))}" data-report="${esc(r.id)}">`;
    h += '<span class="report-link-icon" aria-hidden="true">▤</span>';
    h += '<span class="report-link-body">';
    h += `<span class="report-link-title">${esc(r.title || r.id)}</span>`;
    h += `<span class="report-link-meta mono">${esc(r.group_level || '')}${r.group_level ? ' · ' : ''}html</span>`;
    h += '</span></a>';
  }
  h += '</div>';
  return h;
}

/** The RBQM domain home. */
export function buildRbqmView(o) {
  const { summary, matrix, metrics, groups, moduleReports, domain, flaggedOnly } = o;
  let h = '<section class="domain-view">';
  h += '<div class="domain-head"><div>';
  h += '<h2 class="domain-title">RBQM monitor</h2>';
  h += `<p class="domain-sub">Key risk indicators at the ${esc(String(summary?.groupLevel || 'Site').toLowerCase())} level`
    + `${domain?.workflows?.length ? ` · workflows: <span class="mono">${esc(domain.workflows.join(', '))}</span>` : ''}</p>`;
  h += '</div></div>';
  h += buildFlagTiles(summary);

  h += '<div class="section-head">';
  h += `<h3 class="section-title">${esc(summary?.groupLevel || 'Site')} × metric matrix</h3>`;
  h += '<div class="section-actions">';
  h += `<button type="button" class="btn-toggle" id="matrixToggle" aria-pressed="${flaggedOnly ? 'true' : 'false'}">`
    + `${flaggedOnly ? 'Showing flagged only' : 'Showing all'}</button>`;
  h += '</div></div>';
  h += `<p class="section-note"><span class="num">${esc(String(matrix?.groups.length || 0))}</span> of `
    + `<span class="num">${esc(String(matrix?.allGroupCount || 0))}</span> `
    + `${esc(String(summary?.groupLevel || 'group').toLowerCase())}s shown · `
    + `<span class="num">${esc(String(matrix?.metricIds.length || 0))}</span> metrics</p>`;
  h += buildMatrixLegend();
  h += buildMatrixTable(matrix, metrics, groups);

  h += '<h3 class="section-title">Module reports</h3>';
  h += buildModuleReports(moduleReports);
  h += '</section>';
  return h;
}

/** A module report page — same iframe treatment as a safety chart. */
export function buildModuleReportPage(report) {
  if (!report) {
    return '<div class="empty-state"><div class="empty-title">Report not found in this snapshot</div>'
      + `<div class="empty-hint"><a href="${esc(buildHash('rbqm'))}">Back to the monitor</a></div></div>`;
  }
  let h = '<section class="chart-page">';
  h += `<div class="crumbs"><a href="${esc(buildHash('rbqm'))}" class="crumb-back">← RBQM monitor</a></div>`;
  h += '<div class="chart-head">';
  h += `<h2 class="chart-title">${esc(report.title || report.id)}</h2>`;
  h += '<dl class="chart-meta">';
  h += `<div class="chart-meta-item"><dt>Type</dt><dd>gsm.kri module report</dd></div>`;
  h += `<div class="chart-meta-item"><dt>Group level</dt><dd>${esc(report.group_level || '—')}</dd></div>`;
  h += `<div class="chart-meta-item"><dt>Workflow</dt><dd class="mono">${esc(report.id)}</dd></div>`;
  h += '</dl></div>';
  h += '<div class="chart-frame-wrap"><div class="chart-frame-bar">';
  h += `<span class="mono chart-frame-path">${esc(report.html || '')}</span>`;
  h += `<a class="btn-link" href="${esc(report.html || '')}" target="_blank" rel="noopener" data-chart-open>Open full page ↗</a>`;
  h += '</div>';
  h += `<iframe class="chart-frame" title="${esc(report.title || report.id)}" src="about:blank" loading="lazy"></iframe>`;
  h += '</div></section>';
  return h;
}
