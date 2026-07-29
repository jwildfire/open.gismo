import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFlagTiles, buildFlagLegend, buildLevelSwitch, buildOverviewTable, plural,
  buildModuleReports, buildStaticCharts, buildRbqmView, buildModuleReportPage,
  buildRiskSection, buildMetricList, buildChartsPage, buildMetricsPage,
} from './rbqm.js';
import { summarizeFlags } from './flags.js';

const rows = [
  { GroupID: 'S1', MetricID: 'Analysis_kri0001', Flag: '2', GroupLevel: 'Site', Score: '3.2' },
  { GroupID: 'S1', MetricID: 'Analysis_kri0002', Flag: '0', GroupLevel: 'Site', Score: '0.1' },
  { GroupID: 'S2', MetricID: 'Analysis_kri0001', Flag: '-1', GroupLevel: 'Site', Score: '-1.8' },
  { GroupID: 'S2', MetricID: 'Analysis_kri0002', Flag: 'NA', GroupLevel: 'Site', Score: '' },
  { GroupID: 'S3', MetricID: 'Analysis_kri0001', Flag: '0', GroupLevel: 'Site', Score: '0.2' },
  { GroupID: 'S3', MetricID: 'Analysis_kri0002', Flag: '0', GroupLevel: 'Site', Score: '0.3' },
];

const MODULES = {
  reports: [
    { id: 'report_kri_site', title: 'Site-Level Key Risk Indicator Report', html: 'output/4_modules/report_kri_site/x.html', group_level: 'Site' },
    { id: 'report_kri_country', title: 'Country-Level Key Risk Indicator Report', html: 'output/4_modules/report_kri_country/y.html', group_level: 'Country' },
  ],
  static_charts: [
    { metric: 'cou0001', title: 'Adverse Event Rate', png: 'output/4_modules/static/cou0001.png' },
    { metric: 'cou0002', title: 'Serious Adverse Event Rate', png: 'output/4_modules/static/cou0002.png' },
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

describe('plural', () => {
  it('pluralises the group levels the pipeline produces', () => {
    expect(plural('Site')).toBe('sites');
    expect(plural('Country')).toBe('countries');
    expect(plural('Study')).toBe('studies');
    expect(plural()).toBe('groups');
  });
});

describe('buildLevelSwitch', () => {
  it('offers each available group level, the active one pressed', () => {
    const el = mount(buildLevelSwitch(['Site', 'Country'], 'Site'));
    const btns = [...el.querySelectorAll('[data-level]')];
    expect(btns.map((b) => b.textContent)).toEqual(['Site', 'Country']);
    expect(btns[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('stays out of the way when there is only one level', () => {
    expect(buildLevelSwitch(['Site'], 'Site')).toBe('');
    expect(buildLevelSwitch([], 'Site')).toBe('');
  });
});

describe('buildOverviewTable', () => {
  it('renders the mount point the gsm.viz widget attaches to', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Site', levels: ['Site'], groupCount: 3, metricCount: 2 }));
    const mountPoint = el.querySelector('#kriTable');
    expect(mountPoint).toBeTruthy();
    expect(mountPoint.dataset.groupLevel).toBe('Site');
  });

  it('names the widget and the shape of what it is showing', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Site', levels: ['Site', 'Country'], groupCount: 3, metricCount: 2 }));
    const note = el.querySelector('.section-note').textContent;
    expect(note).toContain('groupOverview');
    expect(note).toContain('gsm.viz');
    expect(note).toContain('3 sites');
    expect(note).toContain('2');
  });

  it('says "countries", not "countrys"', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Country', levels: ['Site', 'Country'], groupCount: 3, metricCount: 12 }));
    expect(el.querySelector('.section-note').textContent).toContain('3 countries');
  });

  it('scrolls a wide table inside its own container, not the page', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Site', levels: ['Site'] }));
    expect(el.querySelector('.table-scroll #kriTable')).toBeTruthy();
  });

  it('says so when the level has no results', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Country', levels: ['Site', 'Country'], empty: true }));
    expect(el.textContent).toContain('No country-level results');
  });

  it('surfaces a mount failure rather than showing an empty box', () => {
    const el = mount(buildOverviewTable({ groupLevel: 'Site', levels: ['Site'], error: 'boom' }));
    expect(el.querySelector('.error-msg').textContent).toContain('boom');
  });
});

describe('buildFlagLegend', () => {
  it('spells out the flag vocabulary the table draws as icons', () => {
    const el = mount(buildFlagLegend());
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

describe('buildStaticCharts', () => {
  it('links each 4_modules PNG export', () => {
    const el = mount(buildStaticCharts(MODULES));
    const cards = [...el.querySelectorAll('.static-card')];
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('href')).toBe('output/4_modules/static/cou0001.png');
    expect(cards[0].dataset.metric).toBe('cou0001');
    expect(cards[0].textContent).toContain('Adverse Event Rate');
  });

  it('renders nothing when the snapshot exported no charts', () => {
    expect(buildStaticCharts({ reports: [] })).toBe('');
    expect(buildStaticCharts(null)).toBe('');
  });
});

describe('buildRbqmView', () => {
  const view = (extra = {}) => buildRbqmView({
    summary: summarizeFlags(rows, 'Site'),
    moduleReports: MODULES,
    domain: { key: 'rbqm', label: 'RBQM', charts: 'gsm.viz', workflows: ['2_metrics', '3_reporting'] },
    groupLevel: 'Site',
    levels: ['Site', 'Country'],
    groupCount: 3,
    metricCount: 2,
    ...extra,
  });

  it('assembles tiles, the overview table and the reports section', () => {
    const el = mount(view());
    expect(el.querySelectorAll('.tile')).toHaveLength(3);
    expect(el.querySelector('#kriTable')).toBeTruthy();
    expect(el.querySelectorAll('.report-link')).toHaveLength(2);
    expect(el.querySelectorAll('.static-card')).toHaveLength(2);
  });

  it('shows the domain registry entry it was configured from', () => {
    const el = mount(view());
    expect(el.querySelector('.domain-title').textContent).toBe('RBQM');
    expect(el.querySelector('.domain-sub').textContent).toContain('gsm.viz');
  });

  it('offers the group-level switch when more than one level is available', () => {
    const el = mount(view());
    expect([...el.querySelectorAll('[data-level]')].map((b) => b.dataset.level))
      .toEqual(['Site', 'Country']);
  });

  it('no longer builds a hand-rolled flag matrix', () => {
    const el = mount(view());
    expect(el.querySelector('.matrix')).toBe(null);
    expect(el.querySelector('#matrixToggle')).toBe(null);
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

/* ── the risk section: ranked table beside the funnel ─────────────────────── */

const RISK_ROWS = [
  {
    id: 'SITE1', label: 'SITE1 · Smith', n: 28, score: 19.1, weight: 34, maxWeight: 178,
    change: 7.9, previous: 11.2, previousDate: '2012-03-29', lowPrecision: false,
    drivers: [{ abbreviation: 'SDSC', name: 'Study Discontinuation', level: 'red', flag: 2, weight: 32 }],
  },
  {
    id: 'SITE2', label: 'SITE2', n: 2, score: 18.0, weight: 32, maxWeight: 178,
    change: null, previous: null, previousDate: null, lowPrecision: true, drivers: [],
  },
  {
    id: 'SITE3', label: 'SITE3', n: 40, score: 0, weight: 0, maxWeight: 178,
    change: 0, previous: 0, previousDate: '2012-03-29', lowPrecision: false, drivers: [],
  },
];

describe('buildRiskSection', () => {
  it('puts the table and the funnel in one split, table first', () => {
    const html = buildRiskSection({ riskRows: RISK_ROWS });
    expect(html).toContain('risk-split-table');
    expect(html).toContain('risk-split-funnel');
    expect(html.indexOf('risk-split-table')).toBeLessThan(html.indexOf('risk-split-funnel'));
  });

  it('states the precision floor rather than applying it silently', () => {
    const html = buildRiskSection({ riskRows: RISK_ROWS });
    expect(html).toContain('dimmed and not ranked');
    expect(html).toContain('our judgment');
  });

  it('says how many sites scored zero instead of pretending they are absent', () => {
    expect(buildRiskSection({ riskRows: RISK_ROWS })).toContain('scored exactly zero');
  });

  it('names the funnel\'s approximation instead of implying a test', () => {
    const html = buildRiskSection({ riskRows: RISK_ROWS });
    expect(html).toContain('normal approximation');
    expect(html).toContain('check on the ranking rather than a test');
  });

  it('renders with no scored sites at all', () => {
    const html = buildRiskSection({ riskRows: [] });
    expect(html).toContain('No site scored above zero');
  });
});

describe('buildFlagTiles with movers', () => {
  it('adds a movers tile only once there is a snapshot to have moved from', () => {
    const summary = summarizeFlags(rows, 'Site');
    expect(buildFlagTiles(summary)).not.toContain('Score movers');
    expect(buildFlagTiles(summary, { movers: 7 })).toContain('Score movers');
  });
});

describe('buildMetricList', () => {
  const METRICS = [
    {
      MetricID: 'Analysis_kri0006', ID: 'kri0006', GroupLevel: 'Site', Abbreviation: 'SDSC',
      Metric: 'Study Discontinuation Rate', Numerator: 'Subjects Discontinued',
      Denominator: 'Enrolled Subjects', Threshold: '2,3', RiskScoreWeight: '0,16,32',
    },
    {
      MetricID: 'Analysis_qtl0001', ID: 'qtl0001', GroupLevel: 'Study', Abbreviation: 'IE',
      Metric: 'Inclusion/Exclusion Violation Rate', Numerator: 'Ineligible',
      Denominator: 'Enrolled', Threshold: 'NA', nPropRate: '0.03', RiskScoreWeight: 'NA',
    },
  ];

  it('lists every metric with its level and how it is judged', () => {
    const html = buildMetricList(METRICS);
    expect(html).toContain('Study Discontinuation Rate');
    expect(html).toContain('kri0006');
    expect(html).toContain('32');
  });

  it('falls back to the pre-specified rate when a metric has no threshold', () => {
    const html = buildMetricList(METRICS);
    expect(html).toContain('0.03');
    // "NA" is absence, never a value to print.
    expect(html).not.toMatch(/<td class="mono">NA<\/td>/);
  });

  it('renders an empty state rather than an empty table', () => {
    expect(buildMetricList([])).toContain('No metric definitions');
  });
});

describe('rbqm sub-pages', () => {
  it('the charts page shows every export and links back', () => {
    const html = buildChartsPage(MODULES, { key: 'rbqm', label: 'RBQM' });
    expect(html).toContain('Metric charts');
    expect(html).toContain('#/rbqm');
  });

  it('the metrics page shows the definitions', () => {
    const html = buildMetricsPage([{ MetricID: 'Analysis_kri0001', Metric: 'AE Rate' }], { key: 'rbqm', label: 'RBQM' });
    expect(html).toContain('AE Rate');
  });
});
