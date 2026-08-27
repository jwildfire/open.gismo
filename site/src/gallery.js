/**
 * Safety domain — the chart gallery (Direction B, re-homed) and the chart page.
 *
 * The gallery reads `output/3_reports/reports.json`: one card per rendered
 * safety.viz chart workflow. Opening a card mounts the chart's own self-
 * contained HTML render in an iframe — these are 1–8 MB standalone documents,
 * so exactly one is ever loaded, on open, never the whole gallery.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';

/** Data-domain tag shown on a card, from the workflow's `Data` meta key. */
export const DATA_DOMAINS = {
  adbds: { label: 'Labs & vitals', short: 'LB / VS' },
  adae: { label: 'Adverse events', short: 'AE' },
  adeg: { label: 'ECG', short: 'EG' },
  adsl: { label: 'Subject level', short: 'SUBJ' },
};

export function dataDomainLabel(key) {
  const k = String(key || '').toLowerCase();
  return DATA_DOMAINS[k]?.short || (k ? k.toUpperCase() : 'multi');
}

/** Prettify a workflow id when no Name meta is available. */
export function prettifyId(id) {
  return String(id || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Chart status pill: reports.json status → the safety.viz maturity vocabulary. */
export function chartStatus(entry) {
  const s = String(entry?.status || '').toLowerCase();
  if (entry?.error) return { key: 'error', label: 'Failed' };
  if (s === 'completed' || s === '') return { key: 'available', label: 'Available' };
  if (s === 'skipped') return { key: 'skipped', label: 'Not run' };
  return { key: 'other', label: prettifyId(s) };
}

/**
 * Normalise a reports.json entry (+ optional workflow YAML meta) into a card.
 * @param {object} entry reports.json report
 * @param {object} [meta] parsed workflow meta (Name / Description / Data)
 */
export function chartCard(entry, meta) {
  const id = entry?.id || meta?.ID || '';
  return {
    id,
    title: entry?.title || meta?.Name || prettifyId(id),
    description: entry?.description || meta?.Description || '',
    data: entry?.data || meta?.Data || '',
    dataLabel: dataDomainLabel(entry?.data || meta?.Data),
    html: entry?.html || '',
    status: chartStatus(entry),
    available: !entry?.error && String(entry?.status || 'completed').toLowerCase() === 'completed',
  };
}

/** All cards for a reports.json payload, in declaration order. */
export function chartCards(reportsJson, metaById = {}) {
  const reports = reportsJson && Array.isArray(reportsJson.reports) ? reportsJson.reports : [];
  return reports.map((r) => chartCard(r, metaById[r.id]));
}

/** One gallery card. */
export function buildChartCard(card) {
  const href = buildHash('safety', [card.id]);
  const cls = `chart-card${card.available ? '' : ' is-unavailable'}`;
  let h = `<a class="${cls}" href="${esc(href)}" data-chart="${esc(card.id)}">`;
  h += '<div class="chart-card-head">';
  h += `<h3 class="chart-card-title">${esc(card.title)}</h3>`;
  h += `<span class="pill pill-${esc(card.status.key)}">${esc(card.status.label)}</span>`;
  h += '</div>';
  if (card.description) h += `<p class="chart-card-desc">${esc(card.description)}</p>`;
  h += '<div class="chart-card-foot">';
  h += `<span class="tag tag-domain">${esc(card.dataLabel)}</span>`;
  h += `<span class="mono chart-card-id">${esc(card.id)}</span>`;
  h += '</div>';
  h += '</a>';
  return h;
}

/**
 * The Safety domain home: the gallery.
 * @param {Array<object>} cards
 * @param {object} domain registry entry ({label, charts, workflows})
 */
export function buildGallery(cards, domain) {
  if (!cards || !cards.length) {
    return '<div class="empty-state"><div class="empty-title">No safety charts in this snapshot</div>'
      + '<div class="empty-hint">The <span class="mono">3_reports</span> phase produced no <span class="mono">reports.json</span> entries. '
      + 'Run the safety workflows to populate the gallery.</div></div>';
  }
  const available = cards.filter((c) => c.available).length;
  let h = '<section class="domain-view">';
  h += '<div class="domain-head">';
  h += '<div><h2 class="domain-title">Safety charts</h2>';
  h += `<p class="domain-sub"><span class="num">${available}</span> of <span class="num">${cards.length}</span> renderers available in this snapshot`
    + `${domain?.charts ? ` · charts: <span class="mono">${esc(domain.charts)}</span>` : ''}`
    + `${domain?.workflows?.length ? ` · workflows: <span class="mono">${esc(domain.workflows.join(', '))}</span>` : ''}</p></div>`;
  h += '</div>';
  h += '<div class="chart-grid">';
  h += cards.map(buildChartCard).join('');
  h += '</div>';
  h += '</section>';
  return h;
}

/**
 * The chart page: header strip + the live renderer in an iframe.
 * The iframe src is intentionally left blank here and set after mount so the
 * multi-megabyte document is fetched only when the page is actually shown.
 */
export function buildChartPage(card, domain) {
  if (!card) {
    return '<div class="empty-state"><div class="empty-title">Chart not found in this snapshot</div>'
      + `<div class="empty-hint"><a href="${esc(buildHash('safety'))}">Back to the gallery</a></div></div>`;
  }
  let h = '<section class="chart-page">';
  h += '<div class="crumbs">';
  h += `<a href="${esc(buildHash('safety'))}" class="crumb-back">← Safety charts</a>`;
  h += '</div>';
  h += '<div class="chart-head">';
  h += `<h2 class="chart-title">${esc(card.title)}</h2>`;
  h += '<dl class="chart-meta">';
  h += metaItem('Type', domain?.charts ? `${domain.charts} renderer` : 'Interactive renderer');
  h += metaItem('Data domain', card.dataLabel);
  h += metaItem('Workflow', card.id, 'mono');
  h += metaItem('Status', card.status.label);
  h += '</dl>';
  h += '</div>';
  if (card.description) h += `<p class="chart-desc">${esc(card.description)}</p>`;
  if (card.available && card.html) {
    h += '<div class="chart-frame-wrap">';
    h += '<div class="chart-frame-bar">';
    h += `<span class="mono chart-frame-path">${esc(card.html)}</span>`;
    h += `<a class="btn-link" href="${esc(card.html)}" target="_blank" rel="noopener" data-chart-open>Open full page ↗</a>`;
    h += '</div>';
    h += `<iframe class="chart-frame" title="${esc(card.title)}" src="about:blank" loading="lazy"></iframe>`;
    h += '</div>';
  } else {
    h += '<div class="empty-state"><div class="empty-title">This chart was not rendered in this snapshot</div>'
      + '<div class="empty-hint">The workflow reported <span class="mono">' + esc(card.status.label) + '</span>.</div></div>';
  }
  h += '</section>';
  return h;
}

function metaItem(label, value, cls = '') {
  return `<div class="chart-meta-item"><dt>${esc(label)}</dt><dd class="${cls}">${esc(String(value))}</dd></div>`;
}

/**
 * Mount the chart iframe after render. `resolve` maps the snapshot-relative
 * html path to a fetchable URL (context.withBase).
 */
export function mountChartFrame(root, card, resolve) {
  if (!card || !card.html) return null;
  const frame = root.querySelector('.chart-frame');
  if (!frame) return null;
  const url = resolve ? resolve(card.html) : card.html;
  frame.src = url;
  const open = root.querySelector('[data-chart-open]');
  if (open) open.href = url;
  const path = root.querySelector('.chart-frame-path');
  if (path) path.textContent = url;
  return frame;
}
