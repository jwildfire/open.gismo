import { describe, it, expect } from 'vitest';
import { domainContents } from './domaincontents.js';

const DOMAINS = [
  { key: 'rbqm', label: 'RBQM' },
  { key: 'safety', label: 'Safety' },
];

const BUNDLE = {
  modules: {
    reports: [
      { id: 'report_kri_site', title: 'Site KRI Report', group_level: 'Site' },
      { id: 'report_qtl', title: 'QTL Report', group_level: 'Study' },
    ],
    static_charts: [{ metric: 'kri0001' }, { metric: 'srs0001' }],
  },
  reporting: { metrics: [{ MetricID: 'Analysis_kri0001' }, { MetricID: 'Analysis_qtl0001' }] },
  cards: [{ id: 'hep_explorer', title: 'Hepatic Explorer', dataLabel: 'Labs' }],
};

describe('domainContents', () => {
  it('lists a domain\'s reports, charts and metrics, each with its own link', () => {
    const entries = domainContents(DOMAINS, BUNDLE).rbqm;
    expect(entries.map((e) => e.key)).toEqual([
      'report_kri_site', 'report_qtl', 'charts', 'metrics',
    ]);
    expect(entries[0].href).toBe('#/rbqm/report/report_kri_site');
    expect(entries[2].href).toBe('#/rbqm/charts');
    expect(entries[3].href).toBe('#/rbqm/metrics');
  });

  it('picks up a report module the study added without a change here', () => {
    // report_qtl is not named anywhere in the builder — it comes from the
    // snapshot's own reports.json.
    expect(domainContents(DOMAINS, BUNDLE).rbqm.some((e) => e.key === 'report_qtl')).toBe(true);
  });

  it('gives Safety the same treatment from its own manifest', () => {
    const entries = domainContents(DOMAINS, BUNDLE).safety;
    expect(entries).toEqual([
      { key: 'hep_explorer', label: 'Hepatic Explorer', href: '#/safety/hep_explorer', note: 'Labs' },
    ]);
  });

  it('omits a domain with nothing to list rather than nesting an empty list', () => {
    const empty = domainContents(DOMAINS, { modules: { reports: [] }, reporting: {}, cards: [] });
    expect(empty).toEqual({});
  });

  it('ignores a registry domain with no builder', () => {
    const out = domainContents([...DOMAINS, { key: 'finance', label: 'Finance' }], BUNDLE);
    expect(out.finance).toBeUndefined();
  });

  it('survives a snapshot that could not be read', () => {
    expect(domainContents(DOMAINS, null)).toEqual({});
    expect(domainContents(null, BUNDLE)).toEqual({});
  });
});

describe('safetyContents — participant metrics (hub#138)', () => {
  const BUNDLE = {
    cards: [{ id: 'hep_explorer', title: 'Hepatic Safety Explorer', dataLabel: 'LB' }],
    reporting: {
      metrics: [
        { ID: 'saf0001', GroupLevel: 'Subject', Metric: "Hy's Law Candidate (Subject)", Abbreviation: 'HYLAW' },
        { ID: 'kri0001', GroupLevel: 'Site', Metric: 'Adverse Event Rate', Abbreviation: 'AE' },
      ],
    },
  };
  const DOMAINS = [{ key: 'safety', label: 'Safety' }];

  it('nests participant metrics under Safety, above the charts', () => {
    const out = domainContents(DOMAINS, BUNDLE);
    expect(out.safety.map((e) => e.key)).toEqual(['saf0001', 'hep_explorer']);
  });

  it('links each metric to its own page', () => {
    const out = domainContents(DOMAINS, BUNDLE);
    expect(out.safety[0].href).toBe('#/safety/metric/saf0001');
  });

  it('never nests a site-level metric under Safety', () => {
    const out = domainContents(DOMAINS, BUNDLE);
    expect(out.safety.map((e) => e.key)).not.toContain('kri0001');
  });

  it('still lists charts when a snapshot has no participant metrics', () => {
    const out = domainContents(DOMAINS, { cards: BUNDLE.cards, reporting: { metrics: [] } });
    expect(out.safety.map((e) => e.key)).toEqual(['hep_explorer']);
  });
});
