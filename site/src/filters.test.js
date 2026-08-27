import { describe, it, expect, beforeEach } from 'vitest';
import { setFilter, applyFilters, resetFilters } from './filters.js';

function setupDOM(cards, searchValue = '') {
  document.body.innerHTML = `
    <input id="searchInput" value="${searchValue}" />
    <div id="container">
      <button class="filter-btn active" data-group="all">All</button>
      <button class="filter-btn" data-group="Site">Site</button>
      <button class="filter-btn" data-group="Country">Country</button>
      <div class="subgroup">
        ${cards.map(c => `<div class="card" data-group="${c.group}" data-search="${c.search}">${c.id}</div>`).join('')}
      </div>
    </div>
  `;
}

describe('setFilter', () => {
  beforeEach(() => {
    resetFilters();
  });

  it('activates the selected filter button and deactivates others', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE mapping Site' },
    ]);
    setFilter('Site');
    const siteBtn = document.querySelector('[data-group="Site"]');
    const allBtn = document.querySelector('[data-group="all"]');
    expect(siteBtn.classList.contains('active')).toBe(true);
    expect(allBtn.classList.contains('active')).toBe(false);
  });

  it('shows only cards matching the selected group level', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE Site' },
      { id: 'DM', group: 'Country', search: 'DM Country' },
    ]);
    setFilter('Site');
    const cards = document.querySelectorAll('.card');
    expect(cards[0].classList.contains('hidden')).toBe(false); // AE - Site
    expect(cards[1].classList.contains('hidden')).toBe(true);  // DM - Country
  });

  it('shows all cards when filter is "all"', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE Site' },
      { id: 'DM', group: 'Country', search: 'DM Country' },
    ]);
    setFilter('all');
    const cards = document.querySelectorAll('.card');
    expect(cards[0].classList.contains('hidden')).toBe(false);
    expect(cards[1].classList.contains('hidden')).toBe(false);
  });
});

describe('applyFilters', () => {
  beforeEach(() => {
    resetFilters();
  });

  it('filters cards by search text matching data-search attribute', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE Adverse Events mapping Site' },
      { id: 'DM', group: 'Site', search: 'DM Demographics mapping Site' },
    ], 'Adverse');
    applyFilters();
    const cards = document.querySelectorAll('.card');
    expect(cards[0].classList.contains('hidden')).toBe(false); // AE matches
    expect(cards[1].classList.contains('hidden')).toBe(true);  // DM doesn't match
  });

  it('search is case-insensitive', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE Adverse Events' },
    ], 'adverse');
    applyFilters();
    const card = document.querySelector('.card');
    expect(card.classList.contains('hidden')).toBe(false);
  });

  it('shows all cards when search is empty', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE' },
      { id: 'DM', group: 'Site', search: 'DM' },
    ], '');
    applyFilters();
    const cards = document.querySelectorAll('.card');
    expect(cards[0].classList.contains('hidden')).toBe(false);
    expect(cards[1].classList.contains('hidden')).toBe(false);
  });

  it('hides subgroups when all their cards are hidden', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE' },
    ], 'nonexistent');
    applyFilters();
    const subgroup = document.querySelector('.subgroup');
    expect(subgroup.classList.contains('hidden')).toBe(true);
  });
});

describe('resetFilters', () => {
  it('resets the active filter to "all"', () => {
    setupDOM([
      { id: 'AE', group: 'Site', search: 'AE' },
      { id: 'DM', group: 'Country', search: 'DM' },
    ]);
    setFilter('Site');
    resetFilters();
    // After reset, applying filters with "all" should show everything
    applyFilters();
    const cards = document.querySelectorAll('.card');
    expect(cards[0].classList.contains('hidden')).toBe(false);
    expect(cards[1].classList.contains('hidden')).toBe(false);
  });
});
