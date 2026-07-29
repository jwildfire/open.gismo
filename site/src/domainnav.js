/**
 * Config secondary navigation.
 *
 * The primary axis moved to the left sidebar (sidebar.js); what stays here is
 * the Explorer's own sub-navigation — the original pipeline-facing Workflows /
 * Data / Reports / Packages views — and the toolbar the workflow view uses.
 */

import { esc } from './utils.js';
import { buildHash, EXPLORER_TABS } from './router.js';

const EXPLORER_LABELS = {
  workflows: 'Workflows',
  data: 'Data',
  reports: 'Reports',
  packages: 'Packages',
};

/** Config secondary navigation. */
export function buildExplorerNav(activeTab) {
  let h = '<div class="subnav" role="tablist" aria-label="Config views">';
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
