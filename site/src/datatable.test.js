import { describe, it, expect } from 'vitest';
import { parseCsv, buildEnhancedTable } from './datatable.js';

const sampleCsv = `SubjectID,SiteID,DaysOnStudy,Count,Rate
SUBJ-001,SITE-01,120,2,0.0167
SUBJ-002,SITE-01,90,1,0.0111
SUBJ-003,SITE-02,60,1,0.0167
SUBJ-004,SITE-02,45,0,0.0000`;

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    const { headers, rows } = parseCsv(sampleCsv);
    expect(headers).toEqual(['SubjectID', 'SiteID', 'DaysOnStudy', 'Count', 'Rate']);
    expect(rows).toHaveLength(4);
    expect(rows[0][0]).toBe('SUBJ-001');
  });

  it('handles quoted fields with commas', () => {
    const { headers, rows } = parseCsv('Name,Desc\nAlice,"Hello, World"');
    expect(rows[0][1]).toBe('Hello, World');
  });

  it('returns empty for blank input', () => {
    const { headers, rows } = parseCsv('');
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it('handles single column', () => {
    const { headers, rows } = parseCsv('ID\n1\n2\n3');
    expect(headers).toEqual(['ID']);
    expect(rows).toHaveLength(3);
  });
});

describe('buildEnhancedTable', () => {
  it('renders a dt-root element', () => {
    const el = buildEnhancedTable(sampleCsv);
    expect(el.className).toBe('dt-root');
  });

  it('contains search input', () => {
    const el = buildEnhancedTable(sampleCsv);
    expect(el.querySelector('.dt-search')).toBeTruthy();
  });

  it('contains sortable column headers', () => {
    const el = buildEnhancedTable(sampleCsv);
    const ths = el.querySelectorAll('th.dt-sortable');
    expect(ths).toHaveLength(5);
    expect(ths[0].textContent).toContain('SubjectID');
  });

  it('renders data rows', () => {
    const el = buildEnhancedTable(sampleCsv);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4); // all 4 rows fit in default page size of 25
  });

  it('shows row count', () => {
    const el = buildEnhancedTable(sampleCsv);
    const count = el.querySelector('.dt-row-count');
    expect(count.textContent).toContain('4 rows');
    expect(count.textContent).toContain('5 cols');
  });

  it('detects numeric columns and aligns them right', () => {
    const el = buildEnhancedTable(sampleCsv);
    const numCells = el.querySelectorAll('.dt-num');
    expect(numCells.length).toBeGreaterThan(0);
  });

  it('has pagination controls', () => {
    const el = buildEnhancedTable(sampleCsv);
    expect(el.querySelector('.dt-pager')).toBeTruthy();
    expect(el.querySelectorAll('.dt-pg-btn')).toHaveLength(4);
  });

  it('has page size selector', () => {
    const el = buildEnhancedTable(sampleCsv);
    const select = el.querySelector('.dt-page-size');
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(4);
  });

  it('search filters rows', () => {
    const el = buildEnhancedTable(sampleCsv);
    const input = el.querySelector('.dt-search');
    input.value = 'SUBJ-003';
    input.dispatchEvent(new Event('input'));
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('SUBJ-003');
  });

  it('sort toggles on header click', () => {
    const el = buildEnhancedTable(sampleCsv);
    // Click once: ascending sort on DaysOnStudy (col 2)
    el.querySelector('th[data-col="2"]').click();
    let firstCell = el.querySelector('tbody tr td.dt-num');
    expect(firstCell.textContent).toBe('45');
    // Click again: descending (re-query th since render replaces DOM)
    el.querySelector('th[data-col="2"]').click();
    firstCell = el.querySelector('tbody tr td.dt-num');
    expect(firstCell.textContent).toBe('120');
  });

  it('handles empty CSV gracefully', () => {
    const el = buildEnhancedTable('');
    expect(el.className).toBe('dt-empty');
    expect(el.textContent).toBe('No data');
  });

  it('shows type tags on headers', () => {
    const el = buildEnhancedTable(sampleCsv);
    const tags = el.querySelectorAll('.dt-type-tag');
    expect(tags.length).toBe(5);
  });

  it('shows stats in header tooltip for numeric columns', () => {
    const el = buildEnhancedTable(sampleCsv);
    const numTh = el.querySelector('th[data-col="3"]'); // Count column
    expect(numTh.title).toContain('mean=');
    expect(numTh.title).toContain('min=');
  });
});
