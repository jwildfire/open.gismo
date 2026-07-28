import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseRoute, buildHash, explorerTab, safetyChartId, rbqmReportId, withSnapshot, VIEWS,
} from './router.js';

describe('parseRoute', () => {
  it('defaults to the overview', () => {
    expect(parseRoute('').view).toBe('overview');
    expect(parseRoute('#').view).toBe('overview');
    expect(parseRoute('#/').view).toBe('overview');
    expect(parseRoute(undefined).view).toBe('overview');
  });

  it('reads the view and its params', () => {
    const r = parseRoute('#/safety/hep_explorer');
    expect(r.view).toBe('safety');
    expect(r.params).toEqual(['hep_explorer']);
  });

  it('reads the query part', () => {
    const r = parseRoute('#/rbqm?snapshot=ps-001');
    expect(r.view).toBe('rbqm');
    expect(r.query.snapshot).toBe('ps-001');
  });

  it('falls back to the overview for an unknown view', () => {
    expect(parseRoute('#/nonsense/x').view).toBe('overview');
  });

  it('decodes percent-encoded segments', () => {
    expect(parseRoute('#/safety/a%2Fb').params).toEqual(['a/b']);
  });
});

describe('buildHash', () => {
  it('round-trips with parseRoute', () => {
    const h = buildHash('compare', [], { from: 'ps-001', to: 'ps-002' });
    expect(h).toBe('#/compare?from=ps-001&to=ps-002');
    const r = parseRoute(h);
    expect(r.view).toBe('compare');
    expect(r.query).toEqual({ from: 'ps-001', to: 'ps-002' });
  });

  it('drops empty query values and params', () => {
    expect(buildHash('safety', [null, ''], { snapshot: undefined })).toBe('#/safety');
  });
});

describe('route helpers', () => {
  it('resolves the explorer sub-tab with a default', () => {
    expect(explorerTab(parseRoute('#/explorer'))).toBe('workflows');
    expect(explorerTab(parseRoute('#/explorer/data'))).toBe('data');
    expect(explorerTab(parseRoute('#/explorer/bogus'))).toBe('workflows');
  });

  it('resolves the safety chart id only on safety routes', () => {
    expect(safetyChartId(parseRoute('#/safety/qt_explorer'))).toBe('qt_explorer');
    expect(safetyChartId(parseRoute('#/safety'))).toBe(null);
    expect(safetyChartId(parseRoute('#/rbqm/qt_explorer'))).toBe(null);
  });

  it('resolves the rbqm module report id', () => {
    expect(rbqmReportId(parseRoute('#/rbqm/report/report_kri_site'))).toBe('report_kri_site');
    expect(rbqmReportId(parseRoute('#/rbqm'))).toBe(null);
    expect(rbqmReportId(parseRoute('#/rbqm/other/x'))).toBe(null);
  });
});

describe('withSnapshot', () => {
  it('rewrites only the snapshot query, keeping the view and params', () => {
    const r = parseRoute('#/safety/hep_explorer?snapshot=ps-002');
    expect(withSnapshot(r, 'ps-001')).toBe('#/safety/hep_explorer?snapshot=ps-001');
  });

  it('adds the snapshot to a route that had none', () => {
    expect(withSnapshot(parseRoute('#/rbqm'), 'ps-001')).toBe('#/rbqm?snapshot=ps-001');
  });

  it('removes the snapshot when given none', () => {
    expect(withSnapshot(parseRoute('#/rbqm?snapshot=ps-001'), null)).toBe('#/rbqm');
  });
});

describe('router properties', () => {
  it('parseRoute always yields a known view and never throws', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parseRoute(s);
        expect(VIEWS).toContain(r.view);
      }),
      { numRuns: 150 },
    );
  });

  it('buildHash → parseRoute preserves view and params', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIEWS),
        fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/), { maxLength: 3 }),
        (view, params) => {
          const r = parseRoute(buildHash(view, params));
          expect(r.view).toBe(view);
          expect(r.params).toEqual(params);
        },
      ),
      { numRuns: 100 },
    );
  });
});
