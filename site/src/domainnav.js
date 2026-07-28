/**
 * Domain switcher — the app's primary axis (D-APP7).
 *
 * Tabs are Overview + one per registry entry in config/study-config.yaml, plus
 * two frame-level views: Compare (snapshot history) and Explorer, which houses
 * the pipeline-facing Workflows / Data / Reports / Packages views as secondary
 * navigation.
 */

import { esc } from './utils.js';
import { buildHash, EXPLORER_TABS } from './router.js';

const FRAME_TABS = [
  { key: 'compare', label: 'Compare' },
  { key: 'explorer', label: 'Explorer' },
];

/**
 * @param {Array<object>} domains registry entries
 * @param {string} activeView
 */
export function buildDomainNav(domains, activeView) {
  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(domains || []).map((d) => ({ key: d.key, label: d.label || d.key })),
    ...FRAME_TABS,
  ];
  let h = '<nav class="domain-nav" aria-label="Domains"><div class="domain-nav-inner">';
  for (const t of tabs) {
    const active = t.key === activeView;
    h += `<a class="domain-tab${active ? ' is-active' : ''}" href="${esc(buildHash(t.key))}"`
      + `${active ? ' aria-current="page"' : ''} data-view="${esc(t.key)}">${esc(t.label)}</a>`;
  }
  h += '</div></nav>';
  return h;
}

const EXPLORER_LABELS = {
  workflows: 'Workflows',
  data: 'Data',
  reports: 'Reports',
  packages: 'Packages',
};

/** Explorer secondary navigation. */
export function buildExplorerNav(activeTab) {
  let h = '<div class="subnav" role="tablist" aria-label="Explorer views">';
  for (const key of EXPLORER_TABS) {
    const active = key === activeTab;
    h += `<a class="subnav-tab${active ? ' is-active' : ''}" role="tab" href="${esc(buildHash('explorer', [key]))}"`
      + ` aria-selected="${active}" data-explorer-tab="${esc(key)}">${esc(EXPLORER_LABELS[key])}</a>`;
  }
  h += '</div>';
  return h;
}

/** The Explorer toolbar (search + density toggle) — only the Workflows view uses it. */
export function buildExplorerToolbar(compactMode) {
  return '<div class="explorer-toolbar">'
    + '<input type="search" id="searchInput" class="input" placeholder="Search workflows…" aria-label="Search workflows">'
    + `<button type="button" id="viewToggle" class="btn-toggle">${compactMode ? 'Detailed' : 'Compact'}</button>`
    + '</div>';
}
