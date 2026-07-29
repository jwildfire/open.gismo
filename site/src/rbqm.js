/**
 * RBQM domain — the dashboard overview.
 *
 * Three sections, in the order a monitor reads them:
 *
 *   1. flag tiles — how much needs attention at this snapshot;
 *   2. the group overview table — *the real `groupOverview` widget from
 *      gsm.viz*, the same table a gsm.kri report renders, mounted by
 *      kritable.js from this snapshot's reporting layer. The page renders its
 *      mount point; app.js fills it after paint;
 *   3. charts & reports — everything `4_modules` published for this domain:
 *      the rendered KRI reports and the static chart exports.
 *
 * Everything derives from the snapshot's reporting layer; nothing is computed
 * in the browser beyond counting.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';

/**
 * Flag tiles. Counts are group-level roll-ups (a site with any red flag counts
 * once), which is what a monitor actually acts on.
 */
export function buildFlagTiles(summary, opts = {}) {
  const level = plural(summary?.groupLevel || 'Site');
  const tiles = [
    { key: 'red', label: `Red ${level}`, value: summary?.redGroups || 0, note: `${summary?.red || 0} flagged metrics` },
    { key: 'amber', label: `Amber ${level}`, value: summary?.amberGroups || 0, note: `${summary?.amber || 0} flagged metrics` },
    { key: 'ontrack', label: `On-track ${level}`, value: summary?.clearGroups || 0, note: `${summary?.onTrack || 0} clear metrics` },
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

/** "Site" → "sites", "Country" → "countries". */
export function plural(level) {
  const l = String(level || 'group').toLowerCase();
  return l.endsWith('y') ? `${l.slice(0, -1)}ies` : `${l}s`;
}

/** The group-level switch above the overview table (Site / Country / …). */
export function buildLevelSwitch(levels, active) {
  if (!levels || levels.length < 2) return '';
  let h = '<div class="level-switch" role="group" aria-label="Group level">';
  for (const l of levels) {
    const on = l === active;
    h += `<button type="button" class="btn-toggle${on ? ' is-on' : ''}" data-level="${esc(l)}" `
      + `aria-pressed="${on ? 'true' : 'false'}">${esc(l)}</button>`;
  }
  h += '</div>';
  return h;
}

/**
 * The group overview section: the mount point plus the legend that names the
 * widget's icon vocabulary in words, since the table signals flags with colour
 * and arrow direction.
 */
export function buildOverviewTable(o = {}) {
  const level = o.groupLevel || 'Site';
  let h = '<div class="section-head">';
  h += `<h3 class="section-title">${esc(level)} overview</h3>`;
  h += `<div class="section-actions">${buildLevelSwitch(o.levels, level)}</div>`;
  h += '</div>';
  h += '<p class="section-note">The <span class="mono">groupOverview</span> table from '
    + '<span class="mono">gsm.viz</span> — the same table a gsm.kri report renders — '
    + `over <span class="num">${esc(String(o.groupCount || 0))}</span> ${esc(plural(level))} `
    + `and <span class="num">${esc(String(o.metricCount || 0))}</span> metrics. `
    + 'Click a column header to sort, a cell for its numbers.</p>';
  h += buildFlagLegend();
  if (o.error) {
    h += `<div class="error-msg">The overview table could not be rendered: ${esc(o.error)}</div>`;
  }
  h += '<div class="table-scroll"><div id="kriTable" class="kri-table" '
    + `data-group-level="${esc(level)}"></div></div>`;
  if (o.empty) {
    h += '<div class="empty-state"><div class="empty-title">No '
      + `${esc(level.toLowerCase())}-level results in this snapshot</div>`
      + '<div class="empty-hint">The <span class="mono">3_reporting</span> phase produced no rows for this group level.</div></div>';
  }
  return h;
}

/** The flag vocabulary in words — the table itself draws icons and colour. */
export function buildFlagLegend() {
  const items = [
    ['red', '⇈ Red flag — |flag| = 2, direction by arrow'],
    ['amber', '↑ Amber flag — |flag| = 1, direction by arrow'],
    ['ontrack', '✓ On track — flag 0'],
    ['none', '– Not evaluated'],
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

/**
 * The static chart exports from `4_modules` — one PNG per metric, opened in a
 * new tab. `paths` are already resolved against the snapshot by the caller.
 */
export function buildStaticCharts(reportsJson) {
  const charts = reportsJson && Array.isArray(reportsJson.static_charts) ? reportsJson.static_charts : [];
  if (!charts.length) return '';
  let h = '<h3 class="section-title">Static charts</h3>';
  h += `<p class="section-note"><span class="num">${charts.length}</span> metric exports rendered by `
    + '<span class="mono">4_modules</span> — one PNG per metric, for reports and decks.</p>';
  h += '<div class="static-grid">';
  for (const c of charts) {
    h += `<a class="static-card" href="${esc(c.png || '')}" target="_blank" rel="noopener" data-metric="${esc(c.metric || '')}">`;
    h += `<span class="static-card-title">${esc(c.title || c.metric || 'Chart')}</span>`;
    h += `<span class="static-card-id mono">${esc(c.metric || '')}</span>`;
    h += '</a>';
  }
  h += '</div>';
  return h;
}

/** The RBQM domain home. */
export function buildRbqmView(o) {
  const { summary, moduleReports, domain } = o;
  let h = '<section class="domain-view">';
  h += '<div class="domain-head"><div>';
  h += `<h2 class="domain-title">${esc(domain?.label || 'RBQM')}</h2>`;
  // The tiles are always the site-level roll-up, so the subtitle names that
  // level rather than the one the table happens to be showing.
  h += `<p class="domain-sub">Key risk indicators at the ${esc(String(summary?.groupLevel || 'Site').toLowerCase())} level`
    + `${domain?.charts ? ` · charts: <span class="mono">${esc(domain.charts)}</span>` : ''}`
    + `${domain?.workflows?.length ? ` · workflows: <span class="mono">${esc(domain.workflows.join(', '))}</span>` : ''}</p>`;
  h += '</div></div>';
  h += buildFlagTiles(summary);
  h += buildOverviewTable(o);

  h += '<h3 class="section-title">Reports</h3>';
  h += buildModuleReports(moduleReports);
  h += buildStaticCharts(moduleReports);
  h += '</section>';
  return h;
}

/** A module report page — same iframe treatment as a safety chart. */
export function buildModuleReportPage(report) {
  if (!report) {
    return '<div class="empty-state"><div class="empty-title">Report not found in this snapshot</div>'
      + `<div class="empty-hint"><a href="${esc(buildHash('rbqm'))}">Back to the RBQM overview</a></div></div>`;
  }
  let h = '<section class="chart-page">';
  h += `<div class="crumbs"><a href="${esc(buildHash('rbqm'))}" class="crumb-back">← RBQM</a></div>`;
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
