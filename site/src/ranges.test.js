import { describe, it, expect } from 'vitest';
import {
  rangeState, toleranceLimit, acceptableRanges, buildAcceptableRanges, RANGE_STATES,
} from './ranges.js';

const REPORTING = {
  metrics: [
    {
      MetricID: 'Analysis_qtl0001', ID: 'qtl0001', GroupLevel: 'Study',
      Abbreviation: 'IE', Metric: 'Inclusion/Exclusion Violation Rate',
      nPropRate: '0.03', nNumDeviations: '3', Threshold: 'NA',
    },
    {
      MetricID: 'Analysis_qtl0002', ID: 'qtl0002', GroupLevel: 'Study',
      Abbreviation: 'SDSC', Metric: 'Study Discontinuation Rate',
      nPropRate: '0.07', nNumDeviations: '3', Threshold: 'NA',
    },
    // A site KRI, which must never appear in a study-level panel.
    {
      MetricID: 'Analysis_kri0001', ID: 'kri0001', GroupLevel: 'Site',
      Abbreviation: 'AE', Metric: 'Adverse Event Rate', Threshold: '-2,-1,2,3',
    },
  ],
  results: [
    {
      GroupID: 'DEMO-301', GroupLevel: 'Study', MetricID: 'Analysis_qtl0001',
      Numerator: '27', Denominator: '760', Metric: '0.0355', Flag: '1', Score: '0.89',
    },
    {
      GroupID: 'DEMO-301', GroupLevel: 'Study', MetricID: 'Analysis_qtl0002',
      Numerator: '122', Denominator: '760', Metric: '0.1605', Flag: '2', Score: '9.78',
      Metric_Change: '0.012', Metric_Previous: '0.1485',
    },
    {
      GroupID: 'SITE1', GroupLevel: 'Site', MetricID: 'Analysis_kri0001',
      Numerator: '3', Denominator: '30', Metric: '0.1', Flag: '2', Score: '2',
    },
  ],
};

describe('rangeState', () => {
  it('maps the QTL flag onto ICH E6(R3)\'s three states', () => {
    expect(rangeState(0).key).toBe('within');
    expect(rangeState(1).key).toBe('trending');
    expect(rangeState(2).key).toBe('breached');
  });

  it('says not evaluated rather than guessing', () => {
    expect(rangeState('NA').key).toBe('unknown');
    expect(rangeState(null).key).toBe('unknown');
  });

  it('names every state in words as well as a glyph', () => {
    for (const s of Object.values(RANGE_STATES)) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.glyph.length).toBeGreaterThan(0);
    }
  });
});

describe('toleranceLimit', () => {
  it('is the expected rate plus its stated deviations', () => {
    // 0.07 + 3 * sqrt(0.07 * 0.93 / 760)
    expect(toleranceLimit(0.07, 3, 760)).toBeCloseTo(0.07 + 3 * Math.sqrt((0.07 * 0.93) / 760), 9);
  });

  it('is above the expected rate it is measured from', () => {
    expect(toleranceLimit(0.03, 3, 760)).toBeGreaterThan(0.03);
  });

  it('refuses to compute one from incomplete metadata', () => {
    expect(toleranceLimit(null, 3, 760)).toBeNull();
    expect(toleranceLimit(0.03, 3, 0)).toBeNull();
    expect(toleranceLimit(0.03, 'NA', 760)).toBeNull();
  });
});

describe('acceptableRanges', () => {
  it('reads only study-level rows', () => {
    expect(acceptableRanges(REPORTING).map((r) => r.workflowId)).toEqual(['qtl0002', 'qtl0001']);
  });

  it('qualifies a metric by the QTL contract, not by its id', () => {
    const renamed = {
      metrics: [{ ...REPORTING.metrics[0], MetricID: 'Analysis_ar0001', ID: 'ar0001' }],
      results: [{ ...REPORTING.results[0], MetricID: 'Analysis_ar0001' }],
    };
    expect(acceptableRanges(renamed)).toHaveLength(1);
  });

  it('ignores a metric with no pre-specified rate', () => {
    const noRate = {
      metrics: [{ MetricID: 'Analysis_x', GroupLevel: 'Study', Metric: 'X' }],
      results: [{ GroupID: 'S', GroupLevel: 'Study', MetricID: 'Analysis_x', Metric: '0.5', Flag: '0' }],
    };
    expect(acceptableRanges(noRate)).toEqual([]);
  });

  it('puts a breach before a trend before a metric within range', () => {
    expect(acceptableRanges(REPORTING).map((r) => r.state.key)).toEqual(['breached', 'trending']);
  });

  it('carries the change through when the snapshot has one', () => {
    const disc = acceptableRanges(REPORTING).find((r) => r.workflowId === 'qtl0002');
    expect(disc.change).toBeCloseTo(0.012, 6);
    expect(disc.previous).toBeCloseTo(0.1485, 6);
  });

  it('places the current value within the band for the meter', () => {
    const ie = acceptableRanges(REPORTING).find((r) => r.workflowId === 'qtl0001');
    expect(ie.position).toBeGreaterThan(0);
    expect(ie.position).toBeLessThanOrEqual(1);
  });
});

describe('buildAcceptableRanges', () => {
  it('names each state in words, never colour alone', () => {
    const html = buildAcceptableRanges(acceptableRanges(REPORTING));
    expect(html).toContain('breached');
    expect(html).toContain('trending to limit');
  });

  it('shows the limit and the expected rate it is measured from', () => {
    const html = buildAcceptableRanges(acceptableRanges(REPORTING));
    expect(html).toContain('limit');
    expect(html).toContain('expected 7.0%');
  });

  it('shows the numerator and denominator, not a bare percentage', () => {
    expect(buildAcceptableRanges(acceptableRanges(REPORTING))).toContain('122 of 760');
  });

  it('says QTLs are study-level and why that matters', () => {
    const html = buildAcceptableRanges([]);
    expect(html).toContain('study-level');
  });

  it('explains what a QTL is when a snapshot has none', () => {
    const html = buildAcceptableRanges([]);
    expect(html).toContain('nPropRate');
    expect(html).toContain('No quality tolerance limits');
  });
});
