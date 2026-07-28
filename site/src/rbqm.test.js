import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFlagTiles, buildMatrixCell, buildMatrixTable, buildMatrixLegend,
  buildModuleReports, buildRbqmView, buildModuleReportPage,
} from './rbqm.js';
import { summarizeFlags, buildMatrix, metricIndex, groupIndex } from './flags.js';

const rows = [
  { GroupID: 'S1', MetricID: 'Analysis_kri0001', Flag: '2', GroupLevel: 'Site', Score: '3.2' },
  { GroupID: 'S1', MetricID: 'Analysis_kri0002', Flag: '0', GroupLevel: 'Site', Score: '0.1' },
  { GroupID: 'S2', MetricID: 'Analysis_kri0001', Flag: '-1', GroupLevel: 'Site', Score: '-1.8' },
  { GroupID: 'S2', MetricID: 'Analysis_kri0002', Flag: 'NA', GroupLevel: 'Site', Score: '' },
  { GroupID: 'S3', MetricID: 'Analysis_kri0001', Flag: '0', GroupLevel: 'Site', Score: '0.2' },
  { GroupID: 'S3', MetricID: 'Analysis_kri0002', Flag: '0', GroupLevel: 'Site', Score: '0.3' },
];

const metrics = metricIndex([
  { MetricID: 'Analysis_kri0001', ID: 'kri0001', Abbreviation: 'AE', Metric: 'Adverse Event Rate', GroupLevel: 'Site' },
  { MetricID: 'Analysis_kri0002', ID: 'kri0002', Abbreviation: 'SAE', Metric: 'Serious Adverse Event Rate', GroupLevel: 'Site' },
]);

const groups = groupIndex([
  { GroupID: 'S1', Param: 'InvestigatorLastName', Value: 'Smith', GroupLevel: 'Site' },
  { GroupID: 'S1', Param: 'Country', Value: 'US', GroupLevel: 'Site' },
], 'Site');

const MODULES = {
  reports: [
    { id: 'report_kri_site', title: 'Site-Level Key Risk Indicator Report', html: 'output/4_modules/report_kri_site/x.html', group_level: 'Site' },
    { id: 'report_kri_country', title: 'Country-Level Key Risk Indicator Report', html: 'output/4_modules/report_kri_country/y.html', group_level: 'Country' },
  ],
};

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('buildFlagTiles', () => {
  it('headlines group roll-ups with the cell counts as the note', () => {
    const el = mount(buildFlagTiles(summarizeFlags(rows, 'Site')));
    const tiles = el.querySelectorAll('.tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[0].querySelector('.tile-value').textContent).toBe('1'); // S1 red
    expect(tiles[1].querySelector('.tile-value').textContent).toBe('1'); // S2 amber
    expect(tiles[2].querySelector('.tile-value').textContent).toBe('1'); // S3 clear
    expect(tiles[0].textContent).toContain('Red sites');
  });

  it('always labels the tiles in words, not colour alone', () => {
    const el = mount(buildFlagTiles(summarizeFlags(rows, 'Site')));
    for (const t of el.querySelectorAll('.tile')) {
      expect(t.querySelector('.tile-label').textContent.length).toBeGreaterThan(3);
    }
  });

  it('discloses cells that were not evaluated', () => {
    const el = mount(buildFlagTiles(summarizeFlags(rows, 'Site')));
    expect(el.textContent).toContain('not evaluated');
  });
});

describe('buildMatrixCell', () => {
  it('carries a glyph and an aria-label naming group, metric and level', () => {
    const el = mount(`<table><tr>${buildMatrixCell({ level: 'red', flag: '2' }, 'S1', 'Adverse Event Rate')}</tr></table>`);
    const mark = el.querySelector('.cell-mark');
    expect(mark.getAttribute('aria-label')).toBe('S1, Adverse Event Rate: Red flag (high)');
    expect(el.querySelector('.cell-glyph').textContent).toBe('●');
  });

  it('adds a visible text label for flagged cells', () => {
    const red = mount(`<table><tr>${buildMatrixCell({ level: 'red', flag: '2' }, 'S1', 'M')}</tr></table>`);
    expect(red.querySelector('.cell-text').textContent).toBe('Red');
    document.body.innerHTML = '';
    const clear = mount(`<table><tr>${buildMatrixCell({ level: 'ontrack', flag: '0' }, 'S1', 'M')}</tr></table>`);
    expect(clear.querySelector('.cell-text')).toBe(null);
    expect(clear.querySelector('.cell-mark').getAttribute('aria-label')).toContain('On track');
  });

  it('renders an absent cell as not evaluated', () => {
    const el = mount(`<table><tr>${buildMatrixCell(null, 'S1', 'M')}</tr></table>`);
    expect(el.querySelector('.cell-mark').getAttribute('aria-label')).toContain('Not evaluated');
  });
});

describe('buildMatrixTable', () => {
  it('renders flagged groups as rows and metrics as columns', () => {
    const matrix = buildMatrix(rows, { groupLevel: 'Site', flaggedOnly: true });
    const el = mount(buildMatrixTable(matrix, metrics, groups));
    const bodyRows = el.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2); // S1, S2
    expect(el.querySelectorAll('thead th')).toHaveLength(3); // corner + 2 metrics
    expect(el.querySelector('thead .matrix-metric abbr').getAttribute('title')).toBe('Adverse Event Rate');
  });

  it('adds the investigator sub-label when group metadata exists', () => {
    const matrix = buildMatrix(rows, { groupLevel: 'Site', flaggedOnly: true });
    const el = mount(buildMatrixTable(matrix, metrics, groups));
    expect(el.querySelector('.matrix-group-sub').textContent).toBe('Smith, US');
  });

  it('scrolls wide content in its own container, not the page', () => {
    const matrix = buildMatrix(rows, { groupLevel: 'Site', flaggedOnly: false });
    const el = mount(buildMatrixTable(matrix, metrics, groups));
    expect(el.querySelector('.table-scroll')).toBeTruthy();
    expect(el.querySelector('caption').textContent).toContain('flag matrix');
  });

  it('says so when nothing is flagged', () => {
    const clean = rows.map((r) => ({ ...r, Flag: '0' }));
    const matrix = buildMatrix(clean, { groupLevel: 'Site', flaggedOnly: true });
    const el = mount(buildMatrixTable(matrix, metrics, groups));
    expect(el.textContent).toContain('No flagged sites');
  });
});

describe('buildMatrixLegend', () => {
  it('spells out the flag vocabulary', () => {
    const el = mount(buildMatrixLegend());
    expect(el.textContent).toContain('|flag| = 2');
    expect(el.textContent).toContain('On track');
    expect(el.textContent).toContain('Not evaluated');
  });
});

describe('buildModuleReports', () => {
  it('links each rendered module report to its in-app page', () => {
    const el = mount(buildModuleReports(MODULES));
    const links = el.querySelectorAll('.report-link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('#/rbqm/report/report_kri_site');
    expect(links[0].textContent).toContain('Site-Level');
  });

  it('shows an empty state when 4_modules produced nothing', () => {
    expect(mount(buildModuleReports(null)).textContent).toContain('No module reports');
  });
});

describe('buildRbqmView', () => {
  const view = (flaggedOnly = true) => buildRbqmView({
    summary: summarizeFlags(rows, 'Site'),
    matrix: buildMatrix(rows, { groupLevel: 'Site', flaggedOnly }),
    metrics,
    groups,
    moduleReports: MODULES,
    domain: { key: 'rbqm', label: 'RBQM', workflows: ['2_metrics', '3_reporting'] },
    flaggedOnly,
  });

  it('assembles tiles, matrix and module reports', () => {
    const el = mount(view());
    expect(el.querySelectorAll('.tile')).toHaveLength(3);
    expect(el.querySelector('.matrix')).toBeTruthy();
    expect(el.querySelectorAll('.report-link')).toHaveLength(2);
  });

  it('states how many groups are shown out of the total', () => {
    const el = mount(view());
    expect(el.querySelector('.section-note').textContent).toContain('2');
    expect(el.querySelector('.section-note').textContent).toContain('3');
  });

  it('exposes the flagged-only toggle with a pressed state', () => {
    const on = mount(view(true));
    expect(on.querySelector('#matrixToggle').getAttribute('aria-pressed')).toBe('true');
    document.body.innerHTML = '';
    const off = mount(view(false));
    expect(off.querySelector('#matrixToggle').getAttribute('aria-pressed')).toBe('false');
    expect(off.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('buildModuleReportPage', () => {
  it('renders an unloaded iframe page with back nav', () => {
    const el = mount(buildModuleReportPage(MODULES.reports[0]));
    expect(el.querySelector('.chart-frame').getAttribute('src')).toBe('about:blank');
    expect(el.querySelector('.crumb-back').getAttribute('href')).toBe('#/rbqm');
    expect(el.querySelector('.chart-title').textContent).toContain('Site-Level');
  });

  it('handles an unknown report id', () => {
    expect(mount(buildModuleReportPage(null)).textContent).toContain('Report not found');
  });
});
