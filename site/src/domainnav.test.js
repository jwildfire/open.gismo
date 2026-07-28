import { describe, it, expect, beforeEach } from 'vitest';
import { buildDomainNav, buildExplorerNav, buildExplorerToolbar } from './domainnav.js';

const DOMAINS = [
  { key: 'safety', label: 'Safety', charts: 'safety.viz', workflows: [] },
  { key: 'rbqm', label: 'RBQM', charts: 'gsm.viz', workflows: [] },
];

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('buildDomainNav', () => {
  it('renders Overview, one tab per registry domain, then Compare and Explorer', () => {
    const el = mount(buildDomainNav(DOMAINS, 'overview'));
    const tabs = [...el.querySelectorAll('.domain-tab')].map((a) => a.textContent);
    expect(tabs).toEqual(['Overview', 'Safety', 'RBQM', 'Compare', 'Explorer']);
  });

  it('is driven by the registry — a third domain needs no code change', () => {
    const el = mount(buildDomainNav([...DOMAINS, { key: 'qtl', label: 'QTL' }], 'qtl'));
    const tabs = [...el.querySelectorAll('.domain-tab')].map((a) => a.textContent);
    expect(tabs).toContain('QTL');
    expect(el.querySelector('.domain-tab.is-active').textContent).toBe('QTL');
  });

  it('marks the active view with aria-current', () => {
    const el = mount(buildDomainNav(DOMAINS, 'rbqm'));
    const active = el.querySelector('[aria-current="page"]');
    expect(active.dataset.view).toBe('rbqm');
  });

  it('links each tab to its hash route', () => {
    const el = mount(buildDomainNav(DOMAINS, 'overview'));
    const hrefs = [...el.querySelectorAll('.domain-tab')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/overview', '#/safety', '#/rbqm', '#/compare', '#/explorer']);
  });

  it('still renders with an empty registry', () => {
    const el = mount(buildDomainNav([], 'overview'));
    expect(el.querySelectorAll('.domain-tab')).toHaveLength(3);
  });
});

describe('buildExplorerNav', () => {
  it('keeps the four original pipeline views as secondary navigation', () => {
    const el = mount(buildExplorerNav('data'));
    const tabs = [...el.querySelectorAll('.subnav-tab')].map((a) => a.textContent);
    expect(tabs).toEqual(['Workflows', 'Data', 'Reports', 'Packages']);
    expect(el.querySelector('[aria-selected="true"]').dataset.explorerTab).toBe('data');
  });
});

describe('buildExplorerToolbar', () => {
  it('provides the search box and density toggle the workflow view needs', () => {
    const el = mount(buildExplorerToolbar(false));
    expect(el.querySelector('#searchInput')).toBeTruthy();
    expect(el.querySelector('#viewToggle').textContent).toBe('Compact');
    document.body.innerHTML = '';
    expect(mount(buildExplorerToolbar(true)).querySelector('#viewToggle').textContent).toBe('Detailed');
  });
});
