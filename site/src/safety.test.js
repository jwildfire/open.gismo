import { describe, it, expect } from 'vitest';
import {
  parseCensus, formatValue, formatAgainst, participantMetrics, parseWeights,
  reviewQueue, describeFinding, buildCensusTiles, buildCoverage,
  buildDisposition, buildReviewQueue, buildSafetyOverview, buildSafetyStudyBlock,
} from './safety.js';

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const CENSUS_JSON = {
  Census: [
    { Label: 'Enrolled participants', Value: 765, Denominator: null, Group: 'Census' },
    { Label: 'Received study drug', Value: 741, Denominator: 765, Group: 'Census' },
    { Label: 'Deaths', Value: 1, Denominator: 765, Group: 'Census' },
    { Label: 'Person-years on treatment', Value: 49.8, Denominator: null, Group: 'Exposure' },
    { Label: 'Participants with a lab result', Value: 765, Denominator: 765, Group: 'Follow-up' },
  ],
  Coverage: [
    { Domain: 'Labs', Visit: 'Baseline', VisitNum: 1, Participants: 765, Expected: 765 },
    { Domain: 'Labs', Visit: 'Week 4', VisitNum: 5, Participants: 400, Expected: 765 },
    { Domain: 'Labs', Visit: 'Week 12', VisitNum: 8, Participants: 17, Expected: 765 },
    { Domain: 'ECG', Visit: 'Baseline', VisitNum: 1, Participants: 765, Expected: 765 },
  ],
  Disposition: [
    { State: 'Ongoing', Participants: 70 },
    { State: 'Died', Participants: 1 },
  ],
};

const METRICS = [
  {
    ID: 'saf0001', MetricID: 'Analysis_saf0001', GroupLevel: 'Subject',
    Metric: "Hy's Law Candidate (Subject)", Abbreviation: 'HYLAW',
    Flag: '0,1,2', RiskScoreWeight: '0,4,16',
  },
  {
    ID: 'saf0002', MetricID: 'Analysis_saf0002', GroupLevel: 'Subject',
    Metric: 'QTcF Prolongation (Subject)', Abbreviation: 'QTCF',
    Flag: '0,1,2', RiskScoreWeight: '0,4,16',
  },
  {
    ID: 'kri0001', MetricID: 'Analysis_kri0001', GroupLevel: 'Site',
    Metric: 'Adverse Event Rate', Abbreviation: 'AE',
    Flag: '-2,-1,0,1,2', RiskScoreWeight: '32,16,0,1,2',
  },
];

const result = (GroupID, MetricID, Flag) => ({
  GroupID, MetricID, Flag, GroupLevel: 'Subject',
});

/* ── the census payload ───────────────────────────────────────────────────── */

describe('parseCensus', () => {
  it('normalises the three payload tables', () => {
    const c = parseCensus(CENSUS_JSON);
    expect(c.census).toHaveLength(5);
    expect(c.coverage).toHaveLength(4);
    expect(c.disposition).toHaveLength(2);
    expect(c.census[0]).toEqual({
      label: 'Enrolled participants', value: 765, denominator: null, group: 'Census',
    });
  });

  it('survives jsonlite unboxing a one-row frame to a bare object', () => {
    const c = parseCensus({
      Census: { Label: 'Enrolled participants', Value: 3, Denominator: null, Group: 'Census' },
      Coverage: [], Disposition: [],
    });
    expect(c.census).toHaveLength(1);
    expect(c.census[0].value).toBe(3);
  });

  it('survives jsonlite unboxing a scalar to a one-element array', () => {
    const c = parseCensus({ Census: [{ Label: ['Deaths'], Value: [1], Group: ['Census'] }] });
    expect(c.census[0]).toMatchObject({ label: 'Deaths', value: 1 });
  });

  it('reads a null value as absent, not as zero', () => {
    const c = parseCensus({ Census: [{ Label: 'Deaths', Value: null, Group: 'Census' }] });
    expect(c.census[0].value).toBeNull();
    expect(formatValue(c.census[0].value)).toBe('—');
  });

  it('returns empty tables for a missing payload', () => {
    expect(parseCensus(null)).toEqual({ census: [], coverage: [], disposition: [] });
  });
});

describe('formatAgainst', () => {
  it('keeps the denominator beside the count', () => {
    expect(formatAgainst(741, 765)).toBe('of 765 (97%)');
  });

  it('says a figure was not collected rather than showing a bare zero', () => {
    expect(formatAgainst(null, 765)).toBe('not collected');
  });

  it('omits the fraction when there is no denominator', () => {
    expect(formatAgainst(49.8, null)).toBe('');
  });

  it('reads a rate that rounds to nothing as <1%, never as 0%', () => {
    expect(formatAgainst(1, 765)).toBe('of 765 (<1%)');
    expect(formatAgainst(0, 765)).toBe('of 765 (0%)');
  });
});

/* ── metric registry ──────────────────────────────────────────────────────── */

describe('participantMetrics', () => {
  it('selects only GroupLevel: Subject metrics', () => {
    const m = participantMetrics(METRICS);
    expect(m.map((x) => x.id)).toEqual(['saf0001', 'saf0002']);
  });

  it('strips the "(Subject)" suffix from the display label', () => {
    expect(participantMetrics(METRICS)[0].label).toBe("Hy's Law Candidate");
  });

  it('is registry-driven — a new subject metric needs no code change', () => {
    const extra = [...METRICS, {
      ID: 'saf0009', MetricID: 'Analysis_saf0009', GroupLevel: 'Subject',
      Metric: 'Something New (Subject)', Flag: '0,1,2', RiskScoreWeight: '0,4,16',
    }];
    expect(participantMetrics(extra).map((x) => x.id)).toContain('saf0009');
  });
});

describe('parseWeights', () => {
  it('transposes the parallel Flag and RiskScoreWeight vectors', () => {
    const w = parseWeights('0,1,2', '0,4,16');
    expect(w.get('2')).toBe(16);
    expect(w.get('1')).toBe(4);
  });

  it('drops entries with no numeric weight', () => {
    expect(parseWeights('0,1,2', '0,4').size).toBe(2);
  });
});

/* ── the review queue ─────────────────────────────────────────────────────── */

describe('reviewQueue', () => {
  const RESULTS = [
    result('S1', 'Analysis_saf0001', 2),   // red   -> 16
    result('S2', 'Analysis_saf0001', 1),   // amber -> 4
    result('S2', 'Analysis_saf0002', 1),   // amber -> 4
    result('S3', 'Analysis_saf0001', 0),   // on track, not queued
    { GroupID: 'SITE1', MetricID: 'Analysis_kri0001', Flag: 2, GroupLevel: 'Site' },
  ];

  it('queues only flagged participants, never on-track ones', () => {
    const q = reviewQueue({ results: RESULTS, metrics: METRICS });
    expect(q.map((p) => p.id)).toEqual(['S1', 'S2']);
  });

  it('never queues a site-level flag', () => {
    const q = reviewQueue({ results: RESULTS, metrics: METRICS });
    expect(q.map((p) => p.id)).not.toContain('SITE1');
  });

  it('ranks by summed flag weight, using the metric\'s own RiskScoreWeight', () => {
    const q = reviewQueue({ results: RESULTS, metrics: METRICS });
    expect(q[0]).toMatchObject({ id: 'S1', score: 16, reds: 1 });
    expect(q[1]).toMatchObject({ id: 'S2', score: 8, reds: 0 });
  });

  it('ranks two ambers above one amber — severity alone cannot say that', () => {
    const results = [
      result('two', 'Analysis_saf0001', 1),
      result('two', 'Analysis_saf0002', 1),
      result('one', 'Analysis_saf0001', 1),
    ];
    const q = reviewQueue({ results, metrics: METRICS });
    expect(q.map((p) => p.id)).toEqual(['two', 'one']);
  });

  it('marks a participant new when the previous snapshot was less severe', () => {
    const prev = [result('S1', 'Analysis_saf0001', 1)];
    const q = reviewQueue({ results: RESULTS, prevResults: prev, metrics: METRICS });
    expect(q.find((p) => p.id === 'S1').isNew).toBe(true);
  });

  it('does not call a participant new when they were already at that level', () => {
    const prev = [result('S1', 'Analysis_saf0001', 2)];
    const q = reviewQueue({ results: RESULTS, prevResults: prev, metrics: METRICS });
    expect(q.find((p) => p.id === 'S1').isNew).toBe(false);
  });

  it('treats a participant absent from the previous snapshot as new', () => {
    const prev = [result('S2', 'Analysis_saf0001', 1)];
    const q = reviewQueue({ results: RESULTS, prevResults: prev, metrics: METRICS });
    expect(q.find((p) => p.id === 'S1').isNew).toBe(true);
  });

  it('marks nobody new at the first snapshot — a whole queue of "new" is noise', () => {
    const q = reviewQueue({ results: RESULTS, metrics: METRICS, hasPrevious: false });
    expect(q.every((p) => !p.isNew)).toBe(true);
    expect(buildReviewQueue(q)).not.toContain('queue-new');
  });

  it('sorts each participant\'s findings worst first', () => {
    const results = [
      result('S9', 'Analysis_saf0001', 1),
      result('S9', 'Analysis_saf0002', 2),
    ];
    const q = reviewQueue({ results, metrics: METRICS });
    expect(q[0].findings.map((f) => f.level)).toEqual(['red', 'amber']);
  });

  it('attaches the evidence behind each finding when it is loaded', () => {
    const evidence = {
      saf0001: new Map([['S1', {
        PeakALT_xULN: 5.2, PeakAST_xULN: 9.1, PeakTB_xULN: 7.5, PeakALP_xULN: 0.6,
      }]]),
    };
    const q = reviewQueue({ results: RESULTS, metrics: METRICS, evidence });
    expect(q[0].findings[0].why).toContain('peak ALT/AST 9.1×ULN');
  });

  it('still queues when no evidence is loaded — it just says less', () => {
    const q = reviewQueue({ results: RESULTS, metrics: METRICS });
    expect(q[0].findings[0].why).toBe('');
  });

  it('returns an empty queue when the snapshot has no subject metrics', () => {
    expect(reviewQueue({ results: RESULTS, metrics: [METRICS[2]] })).toEqual([]);
  });

  it('honours a limit', () => {
    expect(reviewQueue({ results: RESULTS, metrics: METRICS, limit: 1 })).toHaveLength(1);
  });
});

describe('describeFinding', () => {
  it('reads liver evidence in xULN', () => {
    expect(describeFinding('saf0001', {
      PeakALT_xULN: 3.75, PeakAST_xULN: 3, PeakTB_xULN: 3, PeakALP_xULN: 0.75,
    })).toBe('peak ALT/AST 3.8×ULN, bilirubin 3.0×ULN, ALP 0.8×ULN');
  });

  it('reads QT evidence in milliseconds, both criteria', () => {
    expect(describeFinding('saf0002', { Measure: 'QTcF', MaxValue: 505, MaxChange: 105 }))
      .toBe('max QTcF 505 ms, change 105 ms');
  });

  it('reads AE evidence as counts', () => {
    expect(describeFinding('saf0003', { AECount: 3, SeriousCount: 1, RelatedCount: 2 }))
      .toBe('3 AEs, 1 serious, 2 related');
  });

  it('returns nothing for an unknown or missing row', () => {
    expect(describeFinding('saf0001', undefined)).toBe('');
    expect(describeFinding('saf0009', { Unrelated: 1 })).toBe('');
  });
});

/* ── markup ───────────────────────────────────────────────────────────────── */

describe('buildCensusTiles', () => {
  it('renders one tile per figure in the requested group', () => {
    const html = buildCensusTiles(parseCensus(CENSUS_JSON).census, 'Census');
    expect(html.match(/census-tile/g)).toHaveLength(3);
    expect(html).toContain('Enrolled participants');
    expect(html).not.toContain('Person-years');
  });

  it('shows the denominator beside every proportion', () => {
    const html = buildCensusTiles(parseCensus(CENSUS_JSON).census, 'Census');
    expect(html).toContain('of 765 (97%)');
  });

  it('renders nothing for a group with no figures', () => {
    expect(buildCensusTiles([], 'Census')).toBe('');
  });
});

describe('buildCoverage', () => {
  const coverage = parseCensus(CENSUS_JSON).coverage;

  it('states both figures in text, not only in the bar', () => {
    const html = buildCoverage(coverage);
    expect(html).toContain('400 of 765');
    expect(html).toContain('52%');
  });

  it('groups by domain', () => {
    const html = buildCoverage(coverage);
    expect(html).toContain('>Labs<');
    expect(html).toContain('>ECG<');
  });

  it('marks a badly covered visit without relying on colour alone', () => {
    const html = buildCoverage(coverage);
    // The 2% visit gets the red bar class AND its number.
    expect(html).toContain('coverage-red');
    expect(html).toContain('17 of 765');
    expect(html).toContain('2%');
  });

  it('says so when a snapshot has no coverage rows', () => {
    expect(buildCoverage([])).toContain('No visit-level coverage');
  });
});

describe('buildDisposition', () => {
  it('lists states with counts', () => {
    const html = buildDisposition(parseCensus(CENSUS_JSON).disposition);
    expect(html).toContain('Ongoing');
    expect(html).toContain('>70<');
  });

  it('says so when there is no disposition domain', () => {
    expect(buildDisposition([])).toContain('No disposition domain');
  });
});

describe('buildReviewQueue', () => {
  const queue = reviewQueue({
    results: [
      result('S1', 'Analysis_saf0001', 2),
      result('S2', 'Analysis_saf0002', 1),
    ],
    metrics: METRICS,
  });

  it('renders one row per flagged participant', () => {
    const html = buildReviewQueue(queue);
    expect(html.match(/queue-row/g)).toHaveLength(2);
    expect(html).toContain('S1');
  });

  it('names each finding in text, so colour is not the only signal', () => {
    const html = buildReviewQueue(queue);
    expect(html).toContain("Hy's Law Candidate");
    expect(html).toContain('Red flag');
  });

  it('reads an empty queue as a question, not as an all-clear', () => {
    const html = buildReviewQueue([]);
    expect(html).toContain('flagged nobody');
    expect(html).toContain('coverage');
  });

  it('escapes participant ids rather than injecting them', () => {
    const evil = [{ id: '<img src=x>', findings: [], score: 0, reds: 0, isNew: false }];
    expect(buildReviewQueue(evil)).not.toContain('<img src=x>');
  });
});

describe('buildSafetyOverview', () => {
  const html = buildSafetyOverview({
    census: parseCensus(CENSUS_JSON),
    queue: reviewQueue({ results: [result('S1', 'Analysis_saf0001', 2)], metrics: METRICS }),
    cards: [{
      id: 'hep_explorer', title: 'Hepatic Safety Explorer', available: true,
      status: { key: 'completed', label: 'Rendered' }, dataLabel: 'LB', description: '',
    }],
    domain: { key: 'safety', label: 'Safety' },
  });

  it('puts coverage above the findings — denominators before counts', () => {
    expect(html.indexOf('Data coverage by visit')).toBeLessThan(html.indexOf('Needs case review'));
  });

  it('puts the census above coverage', () => {
    expect(html.indexOf('Census and exposure')).toBeLessThan(html.indexOf('Data coverage by visit'));
  });

  it('puts the charts last', () => {
    expect(html.indexOf('Safety charts')).toBeGreaterThan(html.indexOf('Needs case review'));
  });

  it('states that every figure is pooled across arms', () => {
    expect(html).toContain('Pooled across treatment arms');
  });

  it('never splits a figure by arm', () => {
    expect(html).not.toMatch(/\bPlacebo\b/);
    expect(html).not.toMatch(/by arm/i);
  });

  it('leads the queue head with the red count, not the total flagged', () => {
    expect(html).toContain('1 participant with a red finding, 1 flagged in total');
  });

  it('says when the queue is truncated rather than silently capping it', () => {
    const many = Array.from({ length: 40 }, (_, i) => result(`S${i}`, 'Analysis_saf0001', 2));
    const page = buildSafetyOverview({
      census: parseCensus(CENSUS_JSON),
      queue: reviewQueue({ results: many, metrics: METRICS }),
    });
    expect(page).toContain('Showing the top');
    expect(page).toContain('of <span class="num">40</span>');
  });

  it('renders with no data at all rather than throwing', () => {
    expect(() => buildSafetyOverview({})).not.toThrow();
    expect(buildSafetyOverview({})).toContain('No safety charts in this snapshot');
  });
});

describe('buildSafetyStudyBlock', () => {
  const html = buildSafetyStudyBlock({
    census: parseCensus(CENSUS_JSON),
    queue: reviewQueue({ results: [result('S1', 'Analysis_saf0001', 2)], metrics: METRICS }),
  });

  it('leads the home page with the study-level denominators', () => {
    expect(html).toContain('Enrolled participants');
    expect(html).toContain('Received study drug');
    expect(html).toContain('Person-years on treatment');
    expect(html).toContain('Deaths');
  });

  it('carries the review queue headline', () => {
    expect(html).toContain('Flagged for review');
    expect(html).toContain('With a red finding');
  });

  it('surfaces the worst coverage, which an average would hide', () => {
    expect(html).toContain('Week 12');
    expect(html).toContain('17 of 765');
  });

  it('renders with no census rather than throwing', () => {
    expect(() => buildSafetyStudyBlock({})).not.toThrow();
  });
});

/* ── the per-metric page (sidebar nesting target) ─────────────────────────── */

import { buildMetricPage, metricDetail } from './safety.js';

describe('metricDetail', () => {
  const RESULTS = [
    result('S1', 'Analysis_saf0001', 2),
    result('S2', 'Analysis_saf0001', 0),
    { GroupID: 'SITE1', MetricID: 'Analysis_saf0001', Flag: 2, GroupLevel: 'Site' },
  ];

  it('reads the metric\'s identity from the reporting layer, not from code', () => {
    const d = metricDetail(METRICS, RESULTS, 'saf0001');
    expect(d).toMatchObject({ id: 'saf0001', label: "Hy's Law Candidate", threshold: '' });
  });

  it('counts only the participants the metric actually scored', () => {
    expect(metricDetail(METRICS, RESULTS, 'saf0001').scored).toBe(2);
  });

  it('returns null for a metric absent from this snapshot', () => {
    expect(metricDetail(METRICS, RESULTS, 'saf9999')).toBeNull();
  });
});

describe('buildMetricPage', () => {
  it('shows the metric identity and its flagged participants', () => {
    const queue = reviewQueue({
      results: [result('S1', 'Analysis_saf0001', 2)], metrics: METRICS,
    });
    const html = buildMetricPage({
      metric: metricDetail(METRICS, [result('S1', 'Analysis_saf0001', 2)], 'saf0001'),
      queue,
    });
    expect(html).toContain("Hy's Law Candidate");
    expect(html).toContain('saf0001');
    expect(html).toContain('S1');
    expect(html).toContain('participant flagged');
    expect(html).toContain('>1</span> red');
  });

  it('states the pooled-arms rule on the metric page too', () => {
    const html = buildMetricPage({ metric: metricDetail(METRICS, [], 'saf0001'), queue: [] });
    expect(html).toContain('Pooled across treatment arms');
  });

  it('offers a way back rather than a blank page for an unknown metric', () => {
    const html = buildMetricPage({ metric: null });
    expect(html).toContain('Metric not found');
    expect(html).toContain('Back to the Safety overview');
  });
});
