import { describe, it, expect, beforeEach } from 'vitest';
import {
  sidebarItems, buildSidebar, wireSidebar, applyCollapsed, railMark,
  markActive, sidebarSignature, readCollapsed, writeCollapsed, SIDEBAR_STORAGE_KEY,
  readExpanded, writeExpanded,
} from './sidebar.js';

const DOMAINS = [
  { key: 'safety', label: 'Safety', charts: 'safety.viz', workflows: [] },
  { key: 'rbqm', label: 'RBQM', charts: 'gsm.viz', workflows: [] },
];

/** A localStorage stand-in; the real one is not shared between test files. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

function mount(html, collapsed = false) {
  const el = document.createElement('nav');
  el.id = 'sidebar';
  el.className = 'sidebar';
  el.dataset.collapsed = String(collapsed);
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('sidebarItems', () => {
  it('is Study Overview, the registry domains, then Config at the bottom', () => {
    expect(sidebarItems(DOMAINS).map((i) => i.label))
      .toEqual(['Study Overview', 'RBQM', 'Safety', 'Config']);
  });

  it('orders RBQM before Safety whatever order the registry lists them in', () => {
    const reversed = [...DOMAINS].reverse();
    expect(sidebarItems(reversed).map((i) => i.key))
      .toEqual(['overview', 'rbqm', 'safety', 'explorer']);
  });

  it('still admits a new registry domain, after the known ones', () => {
    const keys = sidebarItems([...DOMAINS, { key: 'qtl', label: 'QTL' }]).map((i) => i.key);
    expect(keys).toEqual(['overview', 'rbqm', 'safety', 'qtl', 'explorer']);
  });

  it('keeps the frame entries when the registry is empty', () => {
    expect(sidebarItems([]).map((i) => i.key)).toEqual(['overview', 'explorer']);
  });
});

describe('railMark', () => {
  it('gives each known section a two-character rail mark', () => {
    expect(railMark('overview')).toBe('OV');
    expect(railMark('rbqm')).toBe('RB');
    expect(railMark('safety')).toBe('SA');
    expect(railMark('explorer')).toBe('CF');
  });

  it('derives one for an unknown section', () => {
    expect(railMark('qtl')).toBe('QT');
  });
});

describe('buildSidebar', () => {
  it('links every entry to its hash route', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    const hrefs = [...el.querySelectorAll('.sidebar-link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/overview', '#/rbqm', '#/safety', '#/explorer']);
  });

  it('marks the active section with aria-current', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'rbqm'));
    expect(el.querySelector('[aria-current="page"]').dataset.view).toBe('rbqm');
    expect(el.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('keeps an accessible name on every link for the collapsed rail', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview', true), true);
    const links = [...el.querySelectorAll('.sidebar-link')];
    expect(links.map((a) => a.getAttribute('aria-label')))
      .toEqual(['Study Overview', 'RBQM', 'Safety', 'Config']);
    // The label stays in the DOM — the rail hides it visually, not from AT.
    expect(links[0].querySelector('.sidebar-label').textContent).toBe('Study Overview');
    expect(links[0].querySelector('.sidebar-mark').textContent).toBe('OV');
  });

  it('exposes a keyboard-operable toggle wired to the nav it controls', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    const btn = el.querySelector('#sidebarToggle');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-controls')).toBe('sidebarNav');
    expect(el.querySelector('#sidebarNav')).toBeTruthy();
  });

  it('renders the toggle pre-set to the remembered state', () => {
    const open = mount(buildSidebar(sidebarItems(DOMAINS), 'overview', false));
    expect(open.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe('true');
    expect(open.querySelector('#sidebarToggle').getAttribute('aria-label')).toBe('Collapse navigation');
    document.body.innerHTML = '';
    const shut = mount(buildSidebar(sidebarItems(DOMAINS), 'overview', true), true);
    expect(shut.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe('false');
    expect(shut.querySelector('#sidebarToggle').getAttribute('aria-label')).toBe('Expand navigation');
  });
});

describe('applyCollapsed', () => {
  it('keeps the data attribute, aria-expanded and the affordance in sync', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    applyCollapsed(el, true);
    expect(el.dataset.collapsed).toBe('true');
    expect(el.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.sidebar-toggle-mark').textContent).toBe('»');
    applyCollapsed(el, false);
    expect(el.dataset.collapsed).toBe('false');
    expect(el.querySelector('#sidebarToggle').getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.sidebar-toggle-mark').textContent).toBe('«');
  });
});

describe('markActive', () => {
  it('moves the active marker without rebuilding the nav', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    const before = el.querySelector("[data-view='rbqm']");
    markActive(el, 'rbqm');
    expect(el.querySelector("[data-view='rbqm']")).toBe(before);   // same node
    expect(before.getAttribute('aria-current')).toBe('page');
    expect(before.classList.contains('is-active')).toBe(true);
    expect(el.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('clears the previous marker', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    markActive(el, 'safety');
    const prev = el.querySelector("[data-view='overview']");
    expect(prev.hasAttribute('aria-current')).toBe(false);
    expect(prev.classList.contains('is-active')).toBe(false);
  });

  it('leaves nothing marked for a view that is not a section', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    markActive(el, 'nonsense');
    expect(el.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe('sidebarSignature', () => {
  it('changes only when the item set does', () => {
    const a = sidebarSignature(sidebarItems(DOMAINS));
    expect(sidebarSignature(sidebarItems([...DOMAINS].reverse()))).toBe(a);
    expect(sidebarSignature(sidebarItems([...DOMAINS, { key: 'qtl', label: 'QTL' }]))).not.toBe(a);
    expect(sidebarSignature([])).toBe('');
  });
});

describe('collapse state persistence', () => {
  it('round-trips through storage', () => {
    const store = fakeStorage();
    expect(readCollapsed(store)).toBe(false);
    writeCollapsed(true, store);
    expect(store._map.get(SIDEBAR_STORAGE_KEY)).toBe('true');
    expect(readCollapsed(store)).toBe(true);
    writeCollapsed(false, store);
    expect(readCollapsed(store)).toBe(false);
  });

  it('treats an unavailable storage as expanded rather than failing', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(readCollapsed(broken)).toBe(false);
    expect(writeCollapsed(true, broken)).toBe(false);
  });
});

describe('wireSidebar', () => {
  it('toggles on click and reports the new state', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    const seen = [];
    const isCollapsed = wireSidebar(el, (c) => seen.push(c));
    expect(isCollapsed()).toBe(false);
    el.querySelector('#sidebarToggle').click();
    expect(seen).toEqual([true]);
    expect(isCollapsed()).toBe(true);
    expect(el.dataset.collapsed).toBe('true');
    el.querySelector('#sidebarToggle').click();
    expect(seen).toEqual([true, false]);
    expect(el.dataset.collapsed).toBe('false');
  });

  it('remembers the choice for the next visit', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview'));
    wireSidebar(el);
    el.querySelector('#sidebarToggle').click();
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true');
    el.querySelector('#sidebarToggle').click();
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('false');
  });

  it('starts from the state the sidebar was rendered in', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS), 'overview', true), true);
    const isCollapsed = wireSidebar(el);
    expect(isCollapsed()).toBe(true);
    el.querySelector('#sidebarToggle').click();
    expect(isCollapsed()).toBe(false);
  });

  it('is a no-op without a sidebar', () => {
    expect(wireSidebar(null)()).toBe(false);
  });
});

/* ── nested section contents (registry-driven) ─────────────────────────────── */

const CONTENTS = {
  rbqm: [
    { key: 'report_kri_site', label: 'Site KRI report', href: '#/rbqm/report/report_kri_site' },
    { key: 'charts', label: 'Metric charts', href: '#/rbqm/charts' },
  ],
  safety: [
    { key: 'hep_explorer', label: 'Hepatic Explorer', href: '#/safety/hep_explorer' },
  ],
};

describe('sidebarItems with section contents', () => {
  it('nests a domain\'s reports, charts and metrics under it', () => {
    const items = sidebarItems(DOMAINS, CONTENTS);
    const rbqm = items.find((i) => i.key === 'rbqm');
    expect(rbqm.children.map((c) => c.label)).toEqual(['Site KRI report', 'Metric charts']);
  });

  it('is driven by the registry, not by a per-domain special case', () => {
    // The same call shape serves any domain the study config declares.
    const items = sidebarItems(DOMAINS, CONTENTS);
    expect(items.find((i) => i.key === 'safety').children).toHaveLength(1);
    expect(items.find((i) => i.key === 'overview').children).toBeUndefined();
  });

  it('leaves a domain with no contents unnested', () => {
    const items = sidebarItems(DOMAINS, { rbqm: [] });
    expect(items.find((i) => i.key === 'rbqm').children).toBeUndefined();
    expect(items.find((i) => i.key === 'safety').children).toBeUndefined();
  });
});

describe('buildSidebar with nested sections', () => {
  it('gives a nested section a disclosure button wired to its list', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'rbqm'));
    const btn = el.querySelector('.sidebar-disclosure[data-section="rbqm"]');
    expect(btn.tagName).toBe('BUTTON');
    const listId = btn.getAttribute('aria-controls');
    expect(el.querySelector(`#${listId}`).tagName).toBe('UL');
    expect(btn.getAttribute('aria-expanded')).toBe('true'); // active section opens
  });

  it('links every child to its own page', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'rbqm'));
    const hrefs = [...el.querySelectorAll('.sidebar-sublink')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/rbqm/report/report_kri_site');
    expect(hrefs).toContain('#/rbqm/charts');
  });

  it('leaves a section without children unchanged', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'rbqm'));
    expect(el.querySelector('.sidebar-disclosure[data-section="overview"]')).toBeNull();
  });

  it('starts sections other than the active one closed', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'overview'));
    const rbqm = el.querySelector('.sidebar-disclosure[data-section="rbqm"]');
    expect(rbqm.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#sidebarSub-rbqm').hidden).toBe(true);
  });

  it('honours a remembered expanded set over the active-section default', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'overview', false, ['safety']));
    expect(el.querySelector('.sidebar-disclosure[data-section="safety"]').getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.sidebar-disclosure[data-section="rbqm"]').getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the active child page', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'rbqm'));
    markActive(el, 'rbqm', '#/rbqm/charts');
    const active = el.querySelector('.sidebar-sublink[aria-current="page"]');
    expect(active.getAttribute('href')).toBe('#/rbqm/charts');
    // The section link keeps its own marker off when a child owns the page.
    expect(el.querySelector('.sidebar-link[data-view="rbqm"]').hasAttribute('aria-current')).toBe(false);
  });
});

describe('wireSidebar disclosures', () => {
  it('toggles a section open and shut, and remembers it', () => {
    const store = fakeStorage();
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'overview'));
    wireSidebar(el, null, store);
    const btn = el.querySelector('.sidebar-disclosure[data-section="rbqm"]');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#sidebarSub-rbqm').hidden).toBe(false);
    expect(readExpanded(store)).toContain('rbqm');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(readExpanded(store)).not.toContain('rbqm');
  });

  it('still toggles the rail without disturbing the open sections', () => {
    const el = mount(buildSidebar(sidebarItems(DOMAINS, CONTENTS), 'rbqm'));
    wireSidebar(el);
    el.querySelector('#sidebarToggle').click();
    expect(el.dataset.collapsed).toBe('true');
    // The section stays open in the accessibility tree; the rail hides it in CSS.
    expect(el.querySelector('.sidebar-disclosure[data-section="rbqm"]').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('expanded-section persistence', () => {
  it('round-trips a set of section keys', () => {
    const store = fakeStorage();
    expect(readExpanded(store)).toEqual([]);
    writeExpanded(['rbqm', 'safety'], store);
    expect(readExpanded(store)).toEqual(['rbqm', 'safety']);
  });

  it('treats unusable storage as nothing remembered', () => {
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(readExpanded(broken)).toEqual([]);
    expect(writeExpanded(['rbqm'], broken)).toBe(false);
  });
});
