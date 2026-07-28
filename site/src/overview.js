/**
 * Study Overview — the masthead's landing view.
 *
 * Interleaves each domain's headline: RBQM flag tiles, a Safety chart preview
 * row, and — when the study has published more than one snapshot — the flag
 * changes since the previous one.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';
import { buildFlagTiles } from './rbqm.js';
import { buildChartCard } from './gallery.js';
import { FLAG_LEVELS, groupLabel } from './flags.js';

/** "since previous snapshot" change list. */
export function buildChangeList(deltas, o = {}) {
  const metrics = o.metrics;
  const groups = o.groups;
  const limit = o.limit || 8;
  if (!deltas || !deltas.length) {
    return '<p class="change-empty">No flag level changed between these snapshots.</p>';
  }
  const shown = deltas.slice(0, limit);
  let h = '<ul class="change-list">';
  for (const d of shown) {
    const metric = metrics?.get(d.metricId);
    const metricName = metric?.name || String(d.metricId || '').replace(/^Analysis_/, '');
    const from = FLAG_LEVELS[d.fromLevel].short;
    const to = FLAG_LEVELS[d.toLevel].short;
    h += `<li class="change-item change-${esc(d.direction)}">`;
    h += `<span class="change-arrow" aria-hidden="true">${d.direction === 'worse' ? '▲' : d.direction === 'better' ? '▼' : '→'}</span>`;
    h += `<span class="change-group mono">${esc(groupLabel(d.groupId, groups?.get(d.groupId)))}</span>`;
    h += `<span class="change-metric">${esc(metricName)}</span>`;
    h += `<span class="change-transition">${esc(from)} <span aria-hidden="true">→</span> ${esc(to)}`
      + `<span class="visually-hidden"> changed to </span></span>`;
    h += `<span class="change-tag change-tag-${esc(d.direction)}">${esc(d.direction === 'worse' ? 'worse' : d.direction === 'better' ? 'improved' : 'changed')}</span>`;
    h += '</li>';
  }
  h += '</ul>';
  if (deltas.length > shown.length) {
    h += `<p class="change-more"><a href="${esc(buildHash('compare'))}">`
      + `${deltas.length - shown.length} more changes in the snapshot comparison →</a></p>`;
  }
  return h;
}

/**
 * The Overview.
 * @param {object} o { summary, cards, deltas, metrics, groups, prevSnapshot,
 *                     currentSnapshot, domains, statusCounts }
 */
export function buildOverview(o) {
  const domainOf = (key) => (o.domains || []).find((d) => d.key === key);
  let h = '<section class="overview">';

  // ── RBQM headline ────────────────────────────────────────────────────────
  const rbqm = domainOf('rbqm');
  if (rbqm) {
    h += '<div class="section-head">';
    h += `<h2 class="section-title">${esc(rbqm.label || 'RBQM')} <span class="section-kicker">flags at this snapshot</span></h2>`;
    h += `<a class="section-link" href="${esc(buildHash('rbqm'))}">open domain →</a>`;
    h += '</div>';
    h += buildFlagTiles(o.summary);
  }

  // ── Safety headline ──────────────────────────────────────────────────────
  const safety = domainOf('safety');
  if (safety) {
    const cards = (o.cards || []).slice(0, 4);
    h += '<div class="section-head">';
    h += `<h2 class="section-title">${esc(safety.label || 'Safety')} <span class="section-kicker">charts</span></h2>`;
    h += `<a class="section-link" href="${esc(buildHash('safety'))}">open domain →</a>`;
    h += '</div>';
    if (cards.length) {
      h += '<div class="chart-grid chart-grid-preview">';
      h += cards.map(buildChartCard).join('');
      h += '</div>';
      if ((o.cards || []).length > cards.length) {
        h += `<p class="change-more"><a href="${esc(buildHash('safety'))}">`
          + `${o.cards.length - cards.length} more charts in the gallery →</a></p>`;
      }
    } else {
      h += '<p class="change-empty">No rendered charts in this snapshot.</p>';
    }
  }

  // ── Since previous snapshot ──────────────────────────────────────────────
  if (o.prevSnapshot) {
    h += '<div class="section-head">';
    h += `<h2 class="section-title">Since <span class="mono">${esc(o.prevSnapshot.snapshot_id)}</span></h2>`;
    h += `<a class="section-link" href="${esc(buildHash('compare', [], { from: o.prevSnapshot.snapshot_id, to: o.currentSnapshot?.snapshot_id }))}">compare snapshots →</a>`;
    h += '</div>';
    h += `<p class="section-note">Flag level changes at the ${esc(String(o.summary?.groupLevel || 'Site').toLowerCase())} level, `
      + `<span class="mono">${esc(o.prevSnapshot.input_data_version || o.prevSnapshot.snapshot_id)}</span> → `
      + `<span class="mono">${esc(o.currentSnapshot?.input_data_version || o.currentSnapshot?.snapshot_id || 'current')}</span>.</p>`;
    h += buildChangeList(o.deltas, { metrics: o.metrics, groups: o.groups });
  }

  h += '</section>';
  return h;
}

/** Placeholder while the overview's data loads. */
export function overviewLoading() {
  return '<div class="loading"><span class="spinner"></span> Reading the snapshot…</div>';
}
