/**
 * The left sidebar — the app's primary axis.
 *
 * A full-height espresso band holding the top-level sections: the study
 * overview, one entry per domain in the study config registry (RBQM, Safety),
 * and Config, which houses the pipeline-facing Workflows / Data / Reports /
 * Packages views. Config sits last: it describes how the study is wired, which
 * is a different question from what the study is doing.
 *
 * A domain section can carry a **nested list of its own pages** — its reports,
 * charts and metrics, each a direct link. That nesting is registry-driven, not
 * a per-domain special case: `sidebarItems(domains, contents)` takes a
 * `{domainKey: [{key, label, href}]}` map, so any domain gets the same
 * treatment by supplying its entries. The caller decides what a domain's
 * contents are; the sidebar only renders them.
 *
 * It collapses to a slim rail. Every toggle is a real button carrying
 * `aria-expanded`, every link keeps its accessible name in both states (the
 * label is hidden visually, never removed from the accessibility tree), and
 * both the rail state and the set of open sections are remembered in
 * localStorage so they survive a reload.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';

export const SIDEBAR_STORAGE_KEY = 'og.sidebar.collapsed';
export const SIDEBAR_EXPANDED_KEY = 'og.sidebar.expanded';

/** Registry keys the sidebar orders deliberately; anything else follows. */
const DOMAIN_ORDER = ['rbqm', 'safety'];

/** Rail marks — two mono characters that stay legible when labels are hidden. */
const RAIL_MARKS = { overview: 'OV', rbqm: 'RB', safety: 'SA', explorer: 'CF' };

/** The rail mark for a section, derived from its key when not a known one. */
export function railMark(key) {
  return RAIL_MARKS[key] || String(key || '?').slice(0, 2).toUpperCase();
}

/**
 * The top-level entries, in order: Study Overview, the registry domains (RBQM
 * before Safety), then Config.
 *
 * @param {Array<object>} domains registry entries from study-config.yaml
 * @param {Object<string, Array<{key:string,label:string,href:string,note?:string}>>} [contents]
 *        per-domain page lists. A domain with an empty or absent list is not
 *        nested at all, so a study that publishes no reports has no empty
 *        disclosure to open.
 */
export function sidebarItems(domains, contents = {}) {
  const registry = [...(domains || [])].sort((a, b) => {
    const ai = DOMAIN_ORDER.indexOf(a.key);
    const bi = DOMAIN_ORDER.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return [
    { key: 'overview', label: 'Study Overview' },
    ...registry.map((d) => {
      const item = { key: d.key, label: d.label || d.key };
      const children = (contents || {})[d.key];
      if (Array.isArray(children) && children.length) item.children = children;
      return item;
    }),
    { key: 'explorer', label: 'Config' },
  ];
}

/** The DOM id of a section's nested list. */
export function subListId(key) {
  return `sidebarSub-${key}`;
}

/**
 * Sidebar markup.
 * @param {Array<object>} items from sidebarItems
 * @param {string} activeView
 * @param {boolean} collapsed
 * @param {Array<string>|null} expanded remembered open sections; `null` falls
 *        back to "the active section is open", which is what a reader who has
 *        never touched a disclosure expects to find.
 */
export function buildSidebar(items, activeView, collapsed = false, expanded = null) {
  let h = '<div class="sidebar-head">';
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
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const open = hasChildren && (expanded ? expanded.includes(item.key) : active);
    h += `<li class="sidebar-item"${hasChildren ? ` data-section="${esc(item.key)}"` : ''}>`;
    h += '<div class="sidebar-row">';
    h += `<a class="sidebar-link${active ? ' is-active' : ''}" href="${esc(buildHash(item.key))}" `
      + `data-view="${esc(item.key)}" aria-label="${esc(item.label)}" title="${esc(item.label)}"`
      + `${active ? ' aria-current="page"' : ''}>`
      + `<span class="sidebar-mark mono" aria-hidden="true">${esc(railMark(item.key))}</span>`
      + `<span class="sidebar-label">${esc(item.label)}</span>`
      + '</a>';
    if (hasChildren) {
      const verb = open ? 'Collapse' : 'Expand';
      h += '<button type="button" class="sidebar-disclosure" '
        + `data-section="${esc(item.key)}" aria-expanded="${open ? 'true' : 'false'}" `
        + `aria-controls="${esc(subListId(item.key))}" `
        + `aria-label="${esc(`${verb} ${item.label} contents`)}" `
        + `title="${esc(`${verb} ${item.label} contents`)}">`
        + '<span class="sidebar-disclosure-mark" aria-hidden="true">▸</span>'
        + '</button>';
    }
    h += '</div>';
    if (hasChildren) {
      h += `<ul id="${esc(subListId(item.key))}" class="sidebar-sublist"${open ? '' : ' hidden'}>`;
      for (const child of item.children) {
        h += '<li class="sidebar-subitem">'
          + `<a class="sidebar-sublink" href="${esc(child.href)}" `
          + `data-child="${esc(child.key)}" title="${esc(child.label)}">`
          + `<span class="sidebar-sublabel">${esc(child.label)}</span>`
          + (child.note ? `<span class="sidebar-subnote mono">${esc(child.note)}</span>` : '')
          + '</a></li>';
      }
      h += '</ul>';
    }
    h += '</li>';
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

/** The remembered set of open sections; unreadable storage means none. */
export function readExpanded(storage) {
  try {
    const raw = (storage || window.localStorage).getItem(SIDEBAR_EXPANDED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** Remember which sections are open. */
export function writeExpanded(keys, storage) {
  try {
    (storage || window.localStorage).setItem(SIDEBAR_EXPANDED_KEY, JSON.stringify(keys || []));
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
 * Open or shut one section, keeping the button and its list in step.
 *
 * The rail is a separate axis: collapsing the sidebar hides the nested lists
 * visually (CSS) without shutting them, so expanding the rail again returns the
 * reader to the sections they had open.
 */
export function applyExpanded(root, key, open) {
  if (!root) return;
  const btn = root.querySelector(`.sidebar-disclosure[data-section="${key}"]`);
  const list = root.querySelector(`#${subListId(key)}`);
  if (!btn || !list) return;
  btn.setAttribute('aria-expanded', String(!!open));
  const name = btn.closest('.sidebar-item')?.querySelector('.sidebar-label')?.textContent || key;
  const label = `${open ? 'Collapse' : 'Expand'} ${name} contents`;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  list.hidden = !open;
}

/**
 * Move the active marker without rebuilding the nav.
 *
 * Navigation happens on every route change, and rebuilding the sidebar each
 * time would drop keyboard focus off the link the reader just activated. The
 * item set only changes when the study config does, so the common case is this:
 * repaint two attributes and a class.
 *
 * @param {HTMLElement} root
 * @param {string} activeView
 * @param {string} [activeHash] the current route's hash, so a nested page can
 *        own the `aria-current` marker instead of its section.
 */
export function markActive(root, activeView, activeHash = null) {
  if (!root) return;
  // Compared without the query: links are decorated with the reader's snapshot
  // after this runs, and "which page" is the path, not the snapshot on it.
  const path = (h) => String(h || '').split('?')[0];
  const wanted = activeHash ? path(activeHash) : null;
  let childOwnsPage = false;
  root.querySelectorAll('.sidebar-sublink').forEach((a) => {
    const active = !!wanted && path(a.getAttribute('href')) === wanted;
    a.classList.toggle('is-active', active);
    if (active) {
      a.setAttribute('aria-current', 'page');
      childOwnsPage = true;
    } else {
      a.removeAttribute('aria-current');
    }
  });
  root.querySelectorAll('.sidebar-link').forEach((a) => {
    const inSection = a.dataset.view === activeView;
    a.classList.toggle('is-active', inSection);
    if (inSection && !childOwnsPage) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** The rendered item set, so the caller can tell a repaint from a rebuild. */
export function sidebarSignature(items) {
  return (items || [])
    .map((i) => `${i.key}:${i.label}${i.children ? `[${i.children.map((c) => c.key).join(',')}]` : ''}`)
    .join('|');
}

/**
 * Wire the collapse toggle and the section disclosures. Returns the current
 * rail-state getter so the caller can keep re-renders in step without owning
 * the storage key.
 *
 * @param {HTMLElement} root sidebar element
 * @param {(collapsed:boolean)=>void} [onToggle]
 * @param {object} [storage] localStorage stand-in, for tests
 */
export function wireSidebar(root, onToggle, storage) {
  if (!root) return () => false;
  let collapsed = root.dataset.collapsed === 'true';
  const btn = root.querySelector('#sidebarToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      applyCollapsed(root, collapsed);
      writeCollapsed(collapsed, storage);
      if (onToggle) onToggle(collapsed);
    });
  }

  root.querySelectorAll('.sidebar-disclosure').forEach((disclosure) => {
    disclosure.addEventListener('click', () => {
      const key = disclosure.dataset.section;
      const open = disclosure.getAttribute('aria-expanded') !== 'true';
      applyExpanded(root, key, open);
      const keys = new Set(readExpanded(storage));
      if (open) keys.add(key); else keys.delete(key);
      writeExpanded([...keys], storage);
    });
  });

  return () => collapsed;
}
