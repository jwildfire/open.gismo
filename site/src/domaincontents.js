/**
 * What a domain contains — the entries the sidebar nests under it.
 *
 * The sidebar renders whatever it is handed; this is where a snapshot is turned
 * into that list. Deliberately one function per domain behind one registry
 * lookup, so adding a domain's contents means adding a builder here and nothing
 * else: no change to the sidebar, no per-domain branch in the render loop.
 *
 * Each entry is `{key, label, href, note?}`. `href` is a full in-app hash, so
 * app.js's snapshot decoration carries the reader's snapshot forward through it
 * like any other link.
 */

import { buildHash } from './router.js';

/**
 * RBQM: its report modules, its metric charts, and its metric definitions.
 * The reports come from `4_modules/reports.json`, so a study that adds a report
 * module — gsm.qtl's QTL report, say — gets it listed without a change here.
 */
function rbqmContents(bundle) {
  const out = [];
  for (const r of bundle?.modules?.reports || []) {
    out.push({
      key: r.id,
      label: r.title || r.id,
      href: buildHash('rbqm', ['report', r.id]),
      note: r.group_level || '',
    });
  }
  const charts = bundle?.modules?.static_charts || [];
  if (charts.length) {
    out.push({
      key: 'charts',
      label: 'Metric charts',
      href: buildHash('rbqm', ['charts']),
      note: `${charts.length} png`,
    });
  }
  const metrics = (bundle?.reporting?.metrics || []).filter((m) => m && m.MetricID);
  if (metrics.length) {
    out.push({
      key: 'metrics',
      label: 'Metrics',
      href: buildHash('rbqm', ['metrics']),
      note: String(metrics.length),
    });
  }
  return out;
}

/**
 * Safety: its charts, one entry each, from the rendered chart manifest.
 * Same shape as RBQM's — the nesting is a pattern, not a per-domain feature.
 */
function safetyContents(bundle) {
  return (bundle?.cards || []).map((c) => ({
    key: c.id,
    label: c.title || c.id,
    href: buildHash('safety', [c.id]),
    note: c.dataLabel || '',
  }));
}

const BUILDERS = {
  rbqm: rbqmContents,
  safety: safetyContents,
};

/**
 * The `{domainKey: entries}` map `sidebarItems()` nests.
 *
 * A domain with no builder, or one whose builder finds nothing to list, simply
 * has no nested list — the sidebar drops the disclosure rather than opening on
 * an empty one.
 *
 * @param {Array<object>} domains registry entries from study-config.yaml
 * @param {object} bundle the current snapshot bundle
 */
export function domainContents(domains, bundle) {
  const out = {};
  for (const d of domains || []) {
    const build = BUILDERS[d.key];
    if (!build) continue;
    const entries = build(bundle) || [];
    if (entries.length) out[d.key] = entries;
  }
  return out;
}
