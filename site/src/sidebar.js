/**
 * The left sidebar — the app's primary axis.
 *
 * A full-height espresso band holding the four top-level sections: the study
 * overview, one entry per domain in the study config registry (RBQM, Safety),
 * and the Data Explorer, which still houses the pipeline-facing Workflows /
 * Data / Reports / Packages views as secondary navigation.
 *
 * It collapses to a slim rail. The toggle is a real button carrying
 * `aria-expanded`, every link keeps its accessible name in both states (the
 * label is hidden visually, never removed from the accessibility tree), and the
 * choice is remembered in localStorage so it survives a reload.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';

export const SIDEBAR_STORAGE_KEY = 'og.sidebar.collapsed';

/** Registry keys the sidebar orders deliberately; anything else follows. */
const DOMAIN_ORDER = ['rbqm', 'safety'];

/** Rail marks — two mono characters that stay legible when labels are hidden. */
const RAIL_MARKS = { overview: 'OV', rbqm: 'RB', safety: 'SA', explorer: 'DX' };

/** The rail mark for a section, derived from its key when not a known one. */
export function railMark(key) {
  return RAIL_MARKS[key] || String(key || '?').slice(0, 2).toUpperCase();
}

/**
 * The four top-level entries, in order: Study Overview, the registry domains
 * (RBQM before Safety), then Data Explorer.
 *
 * @param {Array<object>} domains registry entries from study-config.yaml
 */
export function sidebarItems(domains) {
  const registry = [...(domains || [])].sort((a, b) => {
    const ai = DOMAIN_ORDER.indexOf(a.key);
    const bi = DOMAIN_ORDER.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return [
    { key: 'overview', label: 'Study Overview' },
    ...registry.map((d) => ({ key: d.key, label: d.label || d.key })),
    { key: 'explorer', label: 'Data Explorer' },
  ];
}

/**
 * Sidebar markup.
 * @param {Array<object>} items from sidebarItems
 * @param {string} activeView
 * @param {boolean} collapsed
 */
export function buildSidebar(items, activeView, collapsed = false) {
  let h = `<div class="sidebar-head">`;
  h += `<a class="wordmark" href="${esc(buildHash('overview'))}" aria-label="open.gismo — study overview">`
    + '<span class="wordmark-full">open.<span class="wordmark-accent">gismo</span></span>'
    + '<span class="wordmark-rail" aria-hidden="true">o<span class="wordmark-accent">g</span></span></a>';
  h += '<button type="button" id="sidebarToggle" class="sidebar-toggle" '
    + `aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="sidebarNav" `
    + `aria-label="${collapsed ? 'Expand navigation' : 'Collapse navigation'}" `
    + `title="${collapsed ? 'Expand navigation' : 'Collapse navigation'}">`
    + `<span class="sidebar-toggle-mark" aria-hidden="true">${collapsed ? '»' : '«'}</span>`
    + '</button>';
  h += '</div>';

  h += '<ul id="sidebarNav" class="sidebar-list">';
  for (const item of items) {
    const active = item.key === activeView;
    h += '<li class="sidebar-item">';
    h += `<a class="sidebar-link${active ? ' is-active' : ''}" href="${esc(buildHash(item.key))}" `
      + `data-view="${esc(item.key)}" aria-label="${esc(item.label)}" title="${esc(item.label)}"`
      + `${active ? ' aria-current="page"' : ''}>`
      + `<span class="sidebar-mark mono" aria-hidden="true">${esc(railMark(item.key))}</span>`
      + `<span class="sidebar-label">${esc(item.label)}</span>`
      + '</a></li>';
  }
  h += '</ul>';
  return h;
}

/** Read the remembered collapse state; unreadable storage means expanded. */
export function readCollapsed(storage) {
  try {
    return (storage || window.localStorage).getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Remember the collapse state. Storage failures are never fatal. */
export function writeCollapsed(collapsed, storage) {
  try {
    (storage || window.localStorage).setItem(SIDEBAR_STORAGE_KEY, String(!!collapsed));
    return true;
  } catch {
    return false;
  }
}

/** Reflect a collapse state onto a rendered sidebar. */
export function applyCollapsed(root, collapsed) {
  if (!root) return;
  root.dataset.collapsed = String(!!collapsed);
  const btn = root.querySelector('#sidebarToggle');
  if (!btn) return;
  const label = collapsed ? 'Expand navigation' : 'Collapse navigation';
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  const mark = btn.querySelector('.sidebar-toggle-mark');
  if (mark) mark.textContent = collapsed ? '»' : '«';
}

/**
 * Move the active marker without rebuilding the nav.
 *
 * Navigation happens on every route change, and rebuilding the sidebar each
 * time would drop keyboard focus off the link the reader just activated. The
 * item set only changes when the study config does, so the common case is this:
 * repaint two attributes and a class.
 */
export function markActive(root, activeView) {
  if (!root) return;
  root.querySelectorAll('.sidebar-link').forEach((a) => {
    const active = a.dataset.view === activeView;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** The rendered item set, so the caller can tell a repaint from a rebuild. */
export function sidebarSignature(items) {
  return (items || []).map((i) => `${i.key}:${i.label}`).join('|');
}

/**
 * Wire the collapse toggle. Returns the current state getter so the caller can
 * keep re-renders in step without owning the storage key.
 *
 * @param {HTMLElement} root sidebar element
 * @param {(collapsed:boolean)=>void} [onToggle]
 */
export function wireSidebar(root, onToggle) {
  if (!root) return () => false;
  let collapsed = root.dataset.collapsed === 'true';
  const btn = root.querySelector('#sidebarToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      applyCollapsed(root, collapsed);
      writeCollapsed(collapsed);
      if (onToggle) onToggle(collapsed);
    });
  }
  return () => collapsed;
}
