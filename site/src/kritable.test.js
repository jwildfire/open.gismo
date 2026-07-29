import { describe, it, expect, beforeEach } from 'vitest';
import {
  groupOverviewInputs, weightIndex, latestSnapshotDate, availableLevels,
  canRender, mountGroupOverview, RISK_SCORE_METRIC_ID,
} from './kritable.js';

/**
 * Fixtures mirror the published shapes exactly: Reporting_Results carries the
 * ten gsm columns as strings (that is what parseCsv yields), Reporting_Metrics
 * carries the parallel Flag / RiskScoreWeight vectors, and Reporting_Groups is
 * long format.
 */
const RESULTS = [
  { GroupID: '61', GroupLevel: 'Site', Numerator: '1', Denominator: '1007', Metric: '0.00099', Score: '2.22', Flag: '2', MetricID: 'Analysis_kri0001', SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
  { GroupID: '61', GroupLevel: 'Site', Numerator: '4', Denominator: '1007', Metric: '0.004', Score: '0.4', Flag: '0', MetricID: 'Analysis_kri0002', SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
  { GroupID: '61', GroupLevel: 'Site', Numerator: '32', Denominator: '100', Metric: '32', Score: '32', Flag: '0', MetricID: RISK_SCORE_METRIC_ID, SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
  { GroupID: '77', GroupLevel: 'Site', Numerator: '0', Denominator: '900', Metric: '0', Score: '-1.1', Flag: '-1', MetricID: 'Analysis_kri0001', SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
  { GroupID: '77', GroupLevel: 'Site', Numerator: '2', Denominator: '900', Metric: '0.002', Score: '0.2', Flag: 'NA', MetricID: 'Analysis_kri0002', SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
  { GroupID: 'Japan', GroupLevel: 'Country', Numerator: '690', Denominator: '7403', Metric: '0.093', Score: '1.43', Flag: '0', MetricID: 'Analysis_cou0001', SnapshotDate: '2026-07-28', StudyID: 'AA-AA-000-0000' },
];

const METRICS = [
  { MetricID: 'Analysis_kri0001', ID: 'kri0001', GroupLevel: 'Site', Abbreviation: 'AE', Metric: 'Adverse Event Rate', Flag: '-2,-1,0,1,2', RiskScoreWeight: '32,16,0,1,2' },
  { MetricID: 'Analysis_kri0002', ID: 'kri0002', GroupLevel: 'Site', Abbreviation: 'SAE', Metric: 'Serious Adverse Event Rate', Flag: '0,1,2', RiskScoreWeight: '0,4,8' },
  { MetricID: RISK_SCORE_METRIC_ID, ID: 'srs0001', GroupLevel: 'Site', Abbreviation: 'SRS', Metric: 'Site Risk Score', Flag: 'NA', RiskScoreWeight: 'NA' },
  { MetricID: 'Analysis_cou0001', ID: 'cou0001', GroupLevel: 'Country', Abbreviation: 'AE', Metric: 'Adverse Event Rate', Flag: '-2,-1,0,1,2', RiskScoreWeight: 'NA' },
];

const GROUPS = [
  { GroupID: '61', Param: 'InvestigatorLastName', Value: 'Poveromo', GroupLevel: 'Site' },
  { GroupID: '61', Param: 'ParticipantCount', Value: '15', GroupLevel: 'Site' },
  { GroupID: '61', Param: 'Country', Value: 'Japan', GroupLevel: 'Site' },
  { GroupID: '77', Param: 'InvestigatorLastName', Value: 'Smith', GroupLevel: 'Site' },
  { GroupID: '77', Param: 'ParticipantCount', Value: '9', GroupLevel: 'Site' },
  { GroupID: 'Japan', Param: 'ParticipantCount', Value: '257', GroupLevel: 'Country' },
  { GroupID: 'AA-AA-000-0000', Param: 'nickname', Value: 'OAK-38', GroupLevel: 'Study' },
];

const REPORTING = { results: RESULTS, metrics: METRICS, groups: GROUPS };

beforeEach(() => { document.body.innerHTML = ''; });

describe('availableLevels', () => {
  it('lists the levels that have both metric definitions and results, Site first', () => {
    expect(availableLevels(REPORTING)).toEqual(['Site', 'Country']);
  });

  it('drops a level defined but never computed', () => {
    expect(availableLevels({ ...REPORTING, results: RESULTS.filter((r) => r.GroupLevel === 'Site') }))
      .toEqual(['Site']);
  });

  it('survives an empty reporting layer', () => {
    expect(availableLevels({ results: [], metrics: [], groups: [] })).toEqual([]);
    expect(availableLevels(null)).toEqual([]);
  });
});

describe('weightIndex', () => {
  it('transposes the parallel Flag / RiskScoreWeight vectors', () => {
    const w = weightIndex(METRICS);
    expect(w.get('Analysis_kri0001|-2')).toBe(32);
    expect(w.get('Analysis_kri0001|0')).toBe(0);
    expect(w.get('Analysis_kri0002|2')).toBe(8);
  });

  it('ignores rows whose vectors do not line up, and NA weights', () => {
    expect(weightIndex([{ MetricID: 'M', Flag: '0,1', RiskScoreWeight: '1' }]).size).toBe(0);
    expect(weightIndex(METRICS).has(`${RISK_SCORE_METRIC_ID}|NA`)).toBe(false);
  });
});

describe('latestSnapshotDate', () => {
  it('picks the newest date present', () => {
    expect(latestSnapshotDate([{ SnapshotDate: '2026-01-01' }, { SnapshotDate: '2026-07-28' }]))
      .toBe('2026-07-28');
    expect(latestSnapshotDate([])).toBe(null);
    expect(latestSnapshotDate([{ Flag: '0' }])).toBe(null);
  });
});

describe('groupOverviewInputs', () => {
  it('scopes every input to one group level', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    expect(i.results.every((r) => r.GroupLevel === 'Site')).toBe(true);
    expect(i.metricMetadata.every((m) => m.GroupLevel === 'Site')).toBe(true);
    expect(i.groupCount).toBe(2);
  });

  it('holds the risk-score metric out of the columns but keeps its rows', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    expect(i.metricMetadata.map((m) => m.MetricID)).toEqual(['Analysis_kri0001', 'Analysis_kri0002']);
    expect(i.results.some((r) => r.MetricID === RISK_SCORE_METRIC_ID)).toBe(true);
  });

  it('carries the per-flag risk-score weight onto each result row', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    const ae61 = i.results.find((r) => r.GroupID === '61' && r.MetricID === 'Analysis_kri0001');
    expect(ae61.Weight).toBe(2);       // Flag 2 → weight 2
    const ae77 = i.results.find((r) => r.GroupID === '77' && r.MetricID === 'Analysis_kri0001');
    expect(ae77.Weight).toBe(16);      // Flag -1 → weight 16
  });

  it('leaves Weight off a row whose flag has no weight (NA)', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    const na = i.results.find((r) => r.GroupID === '77' && r.MetricID === 'Analysis_kri0002');
    expect(na.Weight).toBeUndefined();
  });

  it('pins one point in time when the results span snapshots', () => {
    const mixed = [
      ...RESULTS,
      { ...RESULTS[0], SnapshotDate: '2026-01-01', Flag: '0' },
    ];
    const i = groupOverviewInputs({ ...REPORTING, results: mixed }, { groupLevel: 'Site' });
    expect(i.snapshotDate).toBe('2026-07-28');
    expect(i.results.every((r) => r.SnapshotDate === '2026-07-28')).toBe(true);
  });

  it('stringifies GroupID — the widget sorts rows with localeCompare', () => {
    const numeric = RESULTS.map((r) => ({ ...r, GroupID: r.GroupID === '61' ? 61 : r.GroupID }));
    const i = groupOverviewInputs({ ...REPORTING, results: numeric }, { groupLevel: 'Site' });
    expect(i.results.every((r) => typeof r.GroupID === 'string')).toBe(true);
  });

  it('configures the label, participant-count and risk-score keys the data uses', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    expect(i.config).toMatchObject({
      GroupLevel: 'Site',
      groupLabelKey: 'InvestigatorLastName',
      groupParticipantCountKey: 'ParticipantCount',
      SiteRiskScoreMetricID: RISK_SCORE_METRIC_ID,
    });
  });

  it('does not label country rows with an investigator name', () => {
    const i = groupOverviewInputs(REPORTING, { groupLevel: 'Country' });
    expect(i.config.groupLabelKey).toBe(null);
    expect(i.metricMetadata.map((m) => m.MetricID)).toEqual(['Analysis_cou0001']);
  });

  it('never mutates the cached reporting bundle', () => {
    groupOverviewInputs(REPORTING, { groupLevel: 'Site' });
    expect(RESULTS[0].Weight).toBeUndefined();
    expect(Object.isFrozen(RESULTS)).toBe(false);
  });

  it('handles rows parsed into null-prototype objects, as parseCsv returns', () => {
    const bare = RESULTS.map((r) => Object.assign(Object.create(null), r));
    const i = groupOverviewInputs({ ...REPORTING, results: bare }, { groupLevel: 'Site' });
    expect(i.results).toHaveLength(5);          // 2 sites × 2 metrics + 1 risk score
    expect(Object.getPrototypeOf(i.results[0])).toBe(Object.prototype);
  });
});

describe('canRender', () => {
  it('accepts a complete set of inputs', () => {
    expect(canRender(groupOverviewInputs(REPORTING, { groupLevel: 'Site' }))).toBe(true);
  });

  it('rejects a level with no group metadata — the widget throws on that', () => {
    const noMeta = { ...REPORTING, groups: GROUPS.filter((g) => g.GroupLevel !== 'Site') };
    expect(canRender(groupOverviewInputs(noMeta, { groupLevel: 'Site' }))).toBe(false);
  });

  it('rejects an empty reporting layer', () => {
    expect(canRender(groupOverviewInputs({ results: [], metrics: [], groups: [] }))).toBe(false);
    expect(canRender(null)).toBe(false);
  });
});

describe('mountGroupOverview', () => {
  const mount = (opts = {}) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return { el, res: mountGroupOverview(el, groupOverviewInputs(REPORTING, opts)) };
  };

  it('renders the real gsm.viz table: one row per group, one column per metric', () => {
    const { el, res } = mount({ groupLevel: 'Site' });
    expect(res.ok).toBe(true);
    const table = el.querySelector('table.group-overview');
    expect(table).toBeTruthy();
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('AE');
    expect(headers).toContain('SAE');
  });

  it('renders the widget group columns, including the site risk score', () => {
    const { el } = mount({ groupLevel: 'Site' });
    const headers = [...el.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers.slice(0, 4)).toEqual(['Group', 'Enrolled', 'Red Flags', 'Amber Flags']);
    expect(headers).toContain('Risk Score');
    expect(el.querySelector('td.group-overview--siteRiskScore')).toBeTruthy();
  });

  it('labels a site row with its investigator, per groupLabelKey', () => {
    const { el } = mount({ groupLevel: 'Site' });
    expect(el.textContent).toContain('61 (Poveromo)');
  });

  it('draws a flag icon in every metric cell rather than colour alone', () => {
    const { el } = mount({ groupLevel: 'Site' });
    const cells = el.querySelectorAll('td.group-overview--metric');
    expect(cells).toHaveLength(4);                       // 2 groups × 2 metrics
    for (const c of cells) expect(c.querySelector('svg')).toBeTruthy();
  });

  it('counts red and amber flags per group', () => {
    const { el } = mount({ groupLevel: 'Site' });
    const red = [...el.querySelectorAll('td.group-overview--nRedFlags')].map((td) => td.textContent);
    const amber = [...el.querySelectorAll('td.group-overview--nAmberFlags')].map((td) => td.textContent);
    expect(red).toContain('1');                          // site 61, AE flag 2
    expect(amber).toContain('1');                        // site 77, AE flag -1
  });

  it('re-renders in place rather than stacking tables — the snapshot switch does this', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    mountGroupOverview(el, groupOverviewInputs(REPORTING, { groupLevel: 'Site' }));
    mountGroupOverview(el, groupOverviewInputs(REPORTING, { groupLevel: 'Country' }));
    expect(el.querySelectorAll('table.group-overview')).toHaveLength(1);
    expect(document.querySelectorAll('body > .custom-tooltip')).toHaveLength(1);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);   // Japan only
  });

  it('reports a miss instead of throwing when the level cannot be tabulated', () => {
    const el = document.createElement('div');
    const res = mountGroupOverview(el, groupOverviewInputs({ results: [], metrics: [], groups: [] }));
    expect(res.ok).toBe(false);
    expect(el.querySelector('table')).toBe(null);
  });
});
