import { describe, it, expect } from 'vitest';
import {
  riskScoreRows, funnelPoints, denominatorNote, scoreTitle, buildDrivers,
  buildRiskScoreTable, PRECISION_FLOOR,
} from './riskscore.js';

const METRICS = [
  {
    MetricID: 'Analysis_srs0001', ID: 'srs0001', GroupLevel: 'Site',
    Abbreviation: 'SRS', Metric: 'Site Risk Score', Flag: 'NA', RiskScoreWeight: 'NA',
  },
  {
    MetricID: 'Analysis_kri0001', ID: 'kri0001', GroupLevel: 'Site',
    Abbreviation: 'AE', Metric: 'Adverse Event Rate',
    Flag: '-2,-1,0,1,2', RiskScoreWeight: '2,1,0,1,2', Threshold: '-2,-1,2,3',
  },
  {
    MetricID: 'Analysis_kri0006', ID: 'kri0006', GroupLevel: 'Site',
    Abbreviation: 'SDSC', Metric: 'Study Discontinuation Rate',
    Flag: '0,1,2', RiskScoreWeight: '0,16,32', Threshold: '2,3',
  },
];

const GROUPS = [
  { GroupLevel: 'Site', GroupID: 'SITE1', Param: 'ParticipantCount', Value: '28' },
  { GroupLevel: 'Site', GroupID: 'SITE1', Param: 'InvestigatorLastName', Value: 'Smith' },
  { GroupLevel: 'Site', GroupID: 'SITE1', Param: 'City', Value: 'Newtown Square' },
  { GroupLevel: 'Site', GroupID: 'SITE2', Param: 'ParticipantCount', Value: '2' },
  { GroupLevel: 'Site', GroupID: 'SITE3', Param: 'ParticipantCount', Value: '31' },
];

const result = (id, metricId, extra = {}) => ({
  GroupID: id, GroupLevel: 'Site', MetricID: metricId,
  Numerator: '', Denominator: '', Metric: '', Score: '', Flag: '', ...extra,
});

const REPORTING = {
  metrics: METRICS,
  groups: GROUPS,
  results: [
    result('SITE1', 'Analysis_srs0001', {
      Numerator: '34', Denominator: '178', Metric: '19.1', Flag: 'NA',
      Metric_Change: '7.9', Metric_Previous: '11.2', SnapshotDate_Previous: '2012-03-29',
    }),
    result('SITE1', 'Analysis_kri0001', { Flag: '2', Metric: '0.4' }),
    result('SITE1', 'Analysis_kri0006', { Flag: '2', Metric: '0.5' }),
    result('SITE2', 'Analysis_srs0001', {
      Numerator: '32', Denominator: '178', Metric: '18.0', Flag: 'NA', Metric_Change: '0.2',
    }),
    result('SITE2', 'Analysis_kri0006', { Flag: '2', Metric: '0.9' }),
    result('SITE3', 'Analysis_srs0001', {
      Numerator: '2', Denominator: '178', Metric: '1.1', Flag: 'NA', Metric_Change: '0.0',
    }),
    result('SITE3', 'Analysis_kri0001', { Flag: '1', Metric: '0.2' }),
    // A country row that must never reach the site table.
    { ...result('UK', 'Analysis_srs0001', { Metric: '9' }), GroupLevel: 'Country' },
  ],
};

describe('riskScoreRows', () => {
  it('carries the weight sum and the maximum weight beside the score', () => {
    const rows = riskScoreRows(REPORTING);
    const one = rows.find((r) => r.id === 'SITE1');
    expect(one.score).toBe(19.1);
    expect(one.weight).toBe(34);
    expect(one.maxWeight).toBe(178);
    expect(denominatorNote(one)).toBe('34 of 178 possible');
  });

  it('reads the change from the pipeline rather than recomputing it', () => {
    const rows = riskScoreRows(REPORTING);
    expect(rows.find((r) => r.id === 'SITE1').change).toBe(7.9);
    expect(rows.find((r) => r.id === 'SITE1').previous).toBe(11.2);
  });

  it('has no change at all on a study\'s first snapshot', () => {
    const first = {
      ...REPORTING,
      results: REPORTING.results.map(({ Metric_Change, Metric_Previous, ...r }) => r),
    };
    expect(riskScoreRows(first).every((r) => r.change === null)).toBe(true);
  });

  it('ranks by score but sorts low-precision sites after the ranked ones', () => {
    const rows = riskScoreRows(REPORTING);
    // SITE2 scores 18.0 on two participants; it must not outrank SITE3's 1.1.
    expect(rows.map((r) => r.id)).toEqual(['SITE1', 'SITE3', 'SITE2']);
    expect(rows.find((r) => r.id === 'SITE2').lowPrecision).toBe(true);
    expect(rows.find((r) => r.id === 'SITE1').lowPrecision).toBe(false);
  });

  it('names the flagged metrics that drove the score, heaviest first', () => {
    const drivers = riskScoreRows(REPORTING).find((r) => r.id === 'SITE1').drivers;
    expect(drivers.map((d) => d.abbreviation)).toEqual(['SDSC', 'AE']);
    expect(drivers[0].weight).toBe(32);
    expect(drivers[1].weight).toBe(2);
  });

  it('stays at one group level', () => {
    expect(riskScoreRows(REPORTING).map((r) => r.id)).not.toContain('UK');
  });

  it('labels a site with its investigator and city when it has them', () => {
    expect(riskScoreRows(REPORTING).find((r) => r.id === 'SITE1').label)
      .toBe('SITE1 · Smith, Newtown Square');
  });

  it('takes the precision floor from the caller when asked', () => {
    const rows = riskScoreRows(REPORTING, { floor: 1 });
    expect(rows.every((r) => !r.lowPrecision)).toBe(true);
  });
});

describe('scoreTitle', () => {
  it('spells the denominator out and lists the contributing weights', () => {
    const row = riskScoreRows(REPORTING).find((r) => r.id === 'SITE1');
    const title = scoreTitle(row);
    expect(title).toContain('34 of 178 possible');
    expect(title).toContain('SDSC');
    expect(title).toContain('weight 32');
  });

  it('says why a low-precision site is not ranked', () => {
    const row = riskScoreRows(REPORTING).find((r) => r.id === 'SITE2');
    expect(scoreTitle(row)).toContain(`below the precision floor of ${PRECISION_FLOOR}`);
  });
});

describe('buildDrivers', () => {
  it('renders an em dash rather than an empty cell', () => {
    expect(buildDrivers({ drivers: [] })).toContain('—');
  });

  it('caps the list and says how many are hidden', () => {
    const drivers = ['A', 'B', 'C', 'D', 'E'].map((a) => ({
      abbreviation: a, name: a, level: 'red', flag: 2, weight: 1,
    }));
    const html = buildDrivers({ drivers });
    expect(html).toContain('+1');
  });
});

describe('buildRiskScoreTable', () => {
  it('shows the denominator in the body, not only on hover', () => {
    const html = buildRiskScoreTable(riskScoreRows(REPORTING));
    expect(html).toContain('34 of 178 possible');
  });

  it('dims a low-precision row and refuses to chip its change', () => {
    const html = buildRiskScoreTable(riskScoreRows(REPORTING));
    expect(html).toContain('is-low-precision');
    expect(html).toContain('low precision');
  });

  it('suppresses a change that does not clear the noise floor', () => {
    const html = buildRiskScoreTable(riskScoreRows(REPORTING));
    // SITE3 moved by 0.0 — a neutral chip, not a "better" arrow.
    expect(html).toContain('no change');
  });

  it('drops the change column entirely with no history to compare against', () => {
    const first = {
      ...REPORTING,
      results: REPORTING.results.map(({ Metric_Change, Metric_Previous, ...r }) => r),
    };
    const html = buildRiskScoreTable(riskScoreRows(first));
    expect(html).not.toContain('Since');
  });

  it('names the snapshot being compared against when the caller knows it', () => {
    const html = buildRiskScoreTable(riskScoreRows(REPORTING), { previousLabel: 'ps-001' });
    expect(html).toContain('Since ps-001');
  });

  it('leaves out sites that scored zero', () => {
    const rows = riskScoreRows({
      ...REPORTING,
      results: [result('SITE9', 'Analysis_srs0001', { Metric: '0', Numerator: '0', Denominator: '178' })],
    });
    expect(buildRiskScoreTable(rows)).toContain('No site scored above zero');
  });
});

describe('funnelPoints', () => {
  it('hands the funnel every scored site, precision and all', () => {
    const points = funnelPoints(riskScoreRows(REPORTING));
    expect(points).toHaveLength(3);
    expect(points.find((p) => p.id === 'SITE2')).toMatchObject({ n: 2, score: 18 });
  });
});
