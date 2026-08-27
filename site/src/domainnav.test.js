import { describe, it, expect, beforeEach } from 'vitest';
import { buildExplorerNav, buildExplorerToolbar } from './domainnav.js';

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

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
