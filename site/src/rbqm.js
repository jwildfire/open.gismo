/**
 * RBQM domain — the dashboard.
 *
 * The order is the order a monitor reads in:
 *
 *   1. flag tiles — how much needs attention at this snapshot, and how much
 *      moved since the last one;
 *   2. **sites needing attention**, the ranked risk-score table, *beside* a
 *      funnel plot of the same sites against their precision. The table is
 *      what a monitor asks for; the funnel is what keeps it honest, and the
 *      two are side by side so neither can be read without the other;
 *   3. **acceptable ranges** — the study-level quality tolerance limits, in
 *      ICH E6(R3)'s three states, kept deliberately apart from the site KRIs;
 *   4. reports and charts — everything `4_modules` published for this domain;
 *   5. the group overview table — *the real `groupOverview` widget from
 *      gsm.viz*, the same table a gsm.kri report renders, mounted by
 *      kritable.js. The page renders its mount point; app.js fills it after
 *      paint.
 *
 * Everything derives from the snapshot's reporting layer. The only arithmetic
 * done in the browser is counting and the funnel's control limits.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';
import { buildRiskScoreTable, funnelPoints, PRECISION_FLOOR } from './riskscore.js';
import { buildFunnel } from './funnel.js';
import { buildAcceptableRanges } from './ranges.js';

/**
 * Flag tiles. Counts are group-level roll-ups (a site with any red flag counts
 * once), which is what a monitor actually acts on. A fourth tile appears once
 * there is a previous snapshot to have moved from.
 */
export function buildFlagTiles(summary, opts = {}) {
  const level = plural(summary?.groupLevel || 'Site');
  const tiles = [
    { key: 'red', label: `Red ${level}`, value: summary?.redGroups || 0, note: `${summary?.red || 0} flagged metrics` },
    { key: 'amber', label: `Amber ${level}`, value: summary?.amberGroups || 0, note: `${summary?.amber || 0} flagged metrics` },
    { key: 'ontrack', label: `On-track ${level}`, value: summary?.clearGroups || 0, note: `${summary?.onTrack || 0} clear metrics` },
  ];
  if (Number.isFinite(opts.movers)) {
    tiles.push({
      key: 'movers',
      label: 'Score movers',
      value: opts.movers,
      note: opts.moversNote || 'risk score changed materially',
    });
  }
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
 * Sites needing attention: the ranked table and the funnel, side by side.
 *
 * Which one leads was a real decision. The table leads because it is what a
 * monitor asks for and because it scans; the funnel sits beside it because a
 * ranked list of sites is the one thing the statistics literature explicitly
 * warns against — Spiegelhalter proposed funnel plots to "avoid spurious
 * ranking of institutions into league tables". Together they answer both: the
 * ranking you asked for, with the uncertainty next to it.
 */
export function buildRiskSection(o = {}) {
  const rows = o.riskRows || [];
  const scored = rows.filter((r) => r.score > 0);
  const zeros = rows.length - scored.length;

  let h = '<section class="risk-section">';
  h += '<div class="section-head"><h3 class="section-title">Sites needing attention</h3>';
  h += `<div class="section-actions"><span class="tag mono">${esc(String(rows.length))} scored</span></div></div>`;
  h += '<p class="section-note">The gsm.kri site risk score — a weighted sum of this snapshot\'s flags '
    + 'over the maximum weight available — with <strong>the denominator beside every score</strong>. '
    + 'Hover a score to see the flags and weights that built it.</p>';

  h += '<div class="risk-split">';
  h += '<div class="risk-split-table">';
  h += buildRiskScoreTable(rows, {
    limit: o.limit ?? 10,
    previousLabel: o.previousLabel,
    hasHistory: o.hasHistory,
  });
  h += `<p class="section-note">Sites with fewer than <span class="num">${esc(String(PRECISION_FLOOR))}</span> `
    + 'participants are shown but <strong>dimmed and not ranked</strong>: at that denominator the score '
    + 'cannot separate a signal from arithmetic. No guidance sets a minimum cell size for a site-level '
    + 'figure, so that floor is our judgment, stated here rather than hidden.';
  if (zeros > 0) {
    h += ` <span class="num">${esc(String(zeros))}</span> of the ${esc(String(rows.length))} scored `
      + `${esc(plural(o.groupLevel || 'Site'))} scored exactly zero and are not listed.`;
  }
  h += '</p>';
  h += '</div>';

  h += '<div class="risk-split-funnel">';
  h += '<h4 class="subsection-title">The same sites, against their precision</h4>';
  h += buildFunnel(funnelPoints(rows), o.funnel);
  h += '<p class="section-note">Each site\'s score against the participants behind it, with the study mean '
    + 'and the 95% and 99.8% control limits. A site inside the funnel is not distinguishable from the '
    + 'study as a whole however high it scores — which is exactly what a two-participant site at the top '
    + 'of a ranked list looks like. Only out-of-funnel sites are labelled. The risk score is not a rate, '
    + 'so the limits treat it as a percentage whose precision grows with the site\'s participant count: '
    + 'a normal approximation, and the reason this is a check on the ranking rather than a test.</p>';
  h += '</div>';
  h += '</div></section>';
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

/** Links into the rendered module reports (iframe pages). */
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
 * new tab. Paths are already resolved against the snapshot by the caller.
 */
export function buildStaticCharts(reportsJson, opts = {}) {
  const charts = reportsJson && Array.isArray(reportsJson.static_charts) ? reportsJson.static_charts : [];
  if (!charts.length) return '';
  const shown = opts.limit ? charts.slice(0, opts.limit) : charts;
  let h = '<div class="section-head"><h3 class="section-title">Metric charts</h3>';
  if (opts.limit && charts.length > shown.length) {
    h += `<div class="section-actions"><a class="btn-link" href="${esc(buildHash('rbqm', ['charts']))}">All ${esc(String(charts.length))} →</a></div>`;
  }
  h += '</div>';
  h += `<p class="section-note"><span class="num">${charts.length}</span> metric exports rendered by `
    + '<span class="mono">4_modules</span> — <span class="mono">gsm.kri::Visualize_Scatter()</span> over '
    + 'this snapshot\'s results and bounds, one PNG per metric, for reports and decks.</p>';
  h += '<div class="static-grid">';
  for (const c of shown) {
    h += `<a class="static-card" href="${esc(c.png || '')}" target="_blank" rel="noopener" data-metric="${esc(c.metric || '')}">`;
    h += `<span class="static-card-title">${esc(c.title || c.metric || 'Chart')}</span>`;
    h += `<span class="static-card-id mono">${esc(c.metric || '')}</span>`;
    h += '</a>';
  }
  h += '</div>';
  return h;
}

/** "" and "NA" are absent, not values. */
function nz(v) {
  const s = String(v ?? '').trim();
  return !s || s.toUpperCase() === 'NA' ? '' : s;
}

/** The metric list — what this domain measures, and how each one is judged. */
export function buildMetricList(metrics, opts = {}) {
  const rows = (metrics || []).filter((m) => m && m.MetricID);
  let h = '<div class="section-head"><h3 class="section-title">Metrics</h3>';
  h += `<div class="section-actions"><span class="tag mono">${esc(String(rows.length))} definitions</span></div></div>`;
  h += '<p class="section-note">Every metric this snapshot computed, from '
    + '<span class="mono">Reporting_Metrics</span> — the workflows\' own metadata, which is also where '
    + 'the risk-score weights and the acceptable-range limits are read from.</p>';
  if (!rows.length) {
    return `${h}<div class="empty-state"><div class="empty-title">No metric definitions in this snapshot</div></div>`;
  }
  h += '<div class="table-scroll"><table class="metric-table"><thead><tr>';
  h += '<th scope="col">Metric</th><th scope="col">ID</th><th scope="col">Level</th>'
    + '<th scope="col">Numerator ÷ denominator</th><th scope="col">Threshold</th><th scope="col" class="num-col">Max weight</th>';
  h += '</tr></thead><tbody>';
  for (const m of rows) {
    const weights = String(m.RiskScoreWeight ?? '').split(',').map(Number).filter(Number.isFinite);
    const maxWeight = weights.length ? Math.max(...weights) : null;
    h += '<tr>';
    h += `<th scope="row">${esc(m.Metric || m.Abbreviation || m.MetricID)}`
      + `${m.Abbreviation ? ` <span class="mono muted">${esc(m.Abbreviation)}</span>` : ''}</th>`;
    h += `<td class="mono">${esc(m.ID || m.MetricID)}</td>`;
    h += `<td>${esc(m.GroupLevel || '—')}</td>`;
    h += `<td>${esc(nz(m.Numerator) || '—')}${nz(m.Denominator) ? ` ÷ ${esc(m.Denominator)}` : ''}</td>`;
    h += `<td class="mono">${esc(nz(m.Threshold) || nz(m.nPropRate) || '—')}</td>`;
    h += `<td class="num-col num">${maxWeight === null ? '—' : esc(String(maxWeight))}</td>`;
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  if (opts.back !== false) {
    h += `<p class="section-note"><a href="${esc(buildHash('rbqm'))}">← Back to the RBQM overview</a></p>`;
  }
  return h;
}

/** The domain header, shared by the domain home and its sub-pages. */
function domainHead(domain, subtitle) {
  let h = '<div class="domain-head"><div>';
  h += `<h2 class="domain-title">${esc(domain?.label || 'RBQM')}</h2>`;
  h += `<p class="domain-sub">${subtitle}</p>`;
  h += '</div></div>';
  return h;
}

/** The RBQM domain home. */
export function buildRbqmView(o) {
  const { summary, moduleReports, domain } = o;
  const subtitle = `Key risk indicators at the ${esc(String(summary?.groupLevel || 'Site').toLowerCase())} level`
    + `${domain?.charts ? ` · charts: <span class="mono">${esc(domain.charts)}</span>` : ''}`
    + `${domain?.workflows?.length ? ` · workflows: <span class="mono">${esc(domain.workflows.join(', '))}</span>` : ''}`;

  let h = '<section class="domain-view">';
  h += domainHead(domain, subtitle);
  h += buildFlagTiles(summary, { movers: o.movers, moversNote: o.moversNote });
  h += buildRiskSection(o);
  h += buildAcceptableRanges(o.ranges || []);

  h += '<h3 class="section-title">Reports</h3>';
  h += buildModuleReports(moduleReports);
  h += buildStaticCharts(moduleReports, { limit: 8 });
  h += buildOverviewTable(o);
  h += '</section>';
  return h;
}

/** The all-charts page, reached from the sidebar or the "All N →" link. */
export function buildChartsPage(moduleReports, domain) {
  let h = '<section class="domain-view">';
  h += domainHead(domain, 'Every static metric export in this snapshot.');
  h += buildStaticCharts(moduleReports);
  h += `<p class="section-note"><a href="${esc(buildHash('rbqm'))}">← Back to the RBQM overview</a></p>`;
  h += '</section>';
  return h;
}

/** The metric-definitions page. */
export function buildMetricsPage(metrics, domain) {
  let h = '<section class="domain-view">';
  h += domainHead(domain, 'What this domain measures, and how each metric is judged.');
  h += buildMetricList(metrics);
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
  h += '<div class="chart-meta-item"><dt>Type</dt><dd>report module</dd></div>';
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
