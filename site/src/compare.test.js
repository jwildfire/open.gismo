import { describe, it, expect } from 'vitest';
import {
  artifactInventory,
  diffInventory,
  isComparable,
  comparablePaths,
  compareContent,
  summarizeCompare,
  buildCompareRows,
  changedRows,
} from './compare.js';

const status = (workflows) => ({ pipeline_status: 'completed', workflows });

const METRIC_WF = {
  Analysis_kri0001: {
    workflow_id: 'kri0001',
    workflow_type: 'Analysis',
    phase: '2_metrics',
    status: 'completed',
    steps: [
      { name: 'gsm.core::Input_Rate', output: 'Analysis_Input', status: 'completed' },
      { name: 'gsm.core::Summarize', output: 'Analysis_Summary', status: 'completed' },
      { name: 'gsm.core::Never', output: 'Analysis_Skipped', status: 'skipped' },
    ],
  },
  Reporting_Results: {
    workflow_id: 'Results',
    workflow_type: 'Reporting',
    phase: '3_reporting',
    status: 'completed',
    steps: [{ name: 'gsm.reporting::BindResults', output: 'Reporting_Results', status: 'completed' }],
  },
  Report_report_kri_site: {
    workflow_id: 'report_kri_site',
    workflow_type: 'Report',
    phase: '4_modules',
    status: 'completed',
    steps: [{ name: 'html_report', output: 'kri_report_Site', status: 'completed' }],
  },
};

const SAFETY_REPORTS = {
  reports: [
    { id: 'hep_explorer', title: 'Hepatic Safety Explorer Report', html: 'output/3_reports/hep_explorer/hep_explorer.html' },
    { id: 'qt_explorer', title: 'QT Safety Explorer Report', html: 'output/3_reports/qt_explorer/qt_explorer.html' },
  ],
};

describe('artifactInventory', () => {
  it('lists one artifact per completed step, with the right extension', () => {
    const inv = artifactInventory(status(METRIC_WF));
    const paths = inv.map((a) => a.path);
    expect(paths).toContain('output/2_metrics/kri0001/Analysis_Input.csv');
    expect(paths).toContain('output/3_reporting/Results/Reporting_Results.csv');
    expect(paths).toContain('output/4_modules/report_kri_site/kri_report_Site.html');
  });

  it('skips steps that did not complete', () => {
    const inv = artifactInventory(status(METRIC_WF));
    expect(inv.some((a) => a.output === 'Analysis_Skipped')).toBe(false);
  });

  it('adds the rendered safety charts from reports.json, which status.json does not track', () => {
    const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);
    const chart = inv.find((a) => a.path === 'output/3_reports/hep_explorer/hep_explorer.html');
    expect(chart).toBeTruthy();
    expect(chart.phase).toBe('3_reports');
    expect(chart.kind).toBe('html');
  });

  it('tolerates missing status and reports payloads', () => {
    expect(artifactInventory(null)).toEqual([]);
    expect(artifactInventory(status({}), { reports: null })).toEqual([]);
  });
});

describe('diffInventory', () => {
  it('splits into added / removed / common by path', () => {
    const prev = [{ path: 'a' }, { path: 'b' }];
    const curr = [{ path: 'b' }, { path: 'c' }];
    const d = diffInventory(prev, curr);
    expect(d.added.map((a) => a.path)).toEqual(['c']);
    expect(d.removed.map((a) => a.path)).toEqual(['a']);
    expect(d.common.map((a) => a.path)).toEqual(['b']);
  });

  it('is empty in both directions for identical inventories', () => {
    const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);
    const d = diffInventory(inv, inv);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.common).toHaveLength(inv.length);
  });
});

describe('isComparable / comparablePaths', () => {
  it('accepts reporting CSVs and metric summaries only', () => {
    expect(isComparable({ kind: 'csv', phase: '3_reporting', output: 'Reporting_Results' })).toBe(true);
    expect(isComparable({ kind: 'csv', phase: '2_metrics', output: 'Analysis_Summary' })).toBe(true);
    expect(isComparable({ kind: 'csv', phase: '2_metrics', output: 'Analysis_Input' })).toBe(false);
    expect(isComparable({ kind: 'csv', phase: '1_mappings', output: 'Mapped_AE' })).toBe(false);
    expect(isComparable({ kind: 'html', phase: '3_reports', output: 'hep_explorer' })).toBe(false);
    expect(isComparable(null)).toBe(false);
  });

  it('bounds the fetch set', () => {
    const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);
    expect(comparablePaths(inv)).toEqual([
      'output/2_metrics/kri0001/Analysis_Summary.csv',
      'output/3_reporting/Results/Reporting_Results.csv',
    ]);
  });
});

describe('compareContent', () => {
  const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);
  const common = diffInventory(inv, inv).common;

  it('marks byte-identical artifacts identical and differing ones changed', async () => {
    const read = async (path, side) => {
      if (path.endsWith('Reporting_Results.csv')) return side === 'prev' ? 'a\n1\n' : 'a\n2\n';
      return 'same\n1\n';
    };
    const res = await compareContent(common, read);
    expect(res.get('output/3_reporting/Results/Reporting_Results.csv').state).toBe('changed');
    expect(res.get('output/2_metrics/kri0001/Analysis_Summary.csv').state).toBe('identical');
  });

  it('reports row deltas for changed artifacts', async () => {
    const read = async (path, side) =>
      (side === 'prev' ? 'h\n1\n' : 'h\n1\n2\n3\n');
    const res = await compareContent(common, read);
    expect(res.get('output/3_reporting/Results/Reporting_Results.csv').rowDelta).toBe(2);
  });

  it('marks an artifact unavailable rather than unchanged when a fetch fails', async () => {
    const read = async (path, side) => {
      if (side === 'prev') throw new Error('404');
      return 'x';
    };
    const res = await compareContent(common, read);
    expect([...res.values()].every((r) => r.state === 'unavailable')).toBe(true);
  });

  it('never fetches artifacts outside the comparable set', async () => {
    const seen = [];
    const read = async (path) => { seen.push(path); return 'x'; };
    await compareContent(common, read);
    expect(seen.every((p) => p.endsWith('Analysis_Summary.csv') || p.includes('3_reporting'))).toBe(true);
  });
});

describe('summarizeCompare', () => {
  it('counts changed only among artifacts actually compared', () => {
    const diff = { added: [{ path: 'x' }], removed: [], common: [{ path: 'a' }, { path: 'b' }, { path: 'c' }] };
    const results = new Map([
      ['a', { state: 'changed' }],
      ['b', { state: 'identical' }],
    ]);
    const s = summarizeCompare(diff, results);
    expect(s.added).toBe(1);
    expect(s.removed).toBe(0);
    expect(s.changed).toBe(1);
    expect(s.identical).toBe(1);
    expect(s.compared).toBe(2);
    expect(s.notCompared).toBe(1);
  });

  it('is all-zero for a snapshot compared with itself', () => {
    const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);
    const diff = diffInventory(inv, inv);
    const s = summarizeCompare(diff, new Map(inv.map((a) => [a.path, { state: 'identical' }])));
    expect(s.added).toBe(0);
    expect(s.removed).toBe(0);
    expect(s.changed).toBe(0);
  });
});

describe('buildCompareRows', () => {
  const inv = artifactInventory(status(METRIC_WF), SAFETY_REPORTS);

  it('rolls artifacts up per phase/workflow in pipeline order', () => {
    const diff = diffInventory(inv, inv);
    const rows = buildCompareRows(diff, new Map());
    expect(rows.map((r) => r.phase)).toEqual(['2_metrics', '3_reporting', '3_reports', '3_reports', '4_modules']);
  });

  it('labels a workflow changed when any of its artifacts changed', () => {
    const diff = diffInventory(inv, inv);
    const results = new Map([['output/3_reporting/Results/Reporting_Results.csv', { state: 'changed', rowDelta: 3 }]]);
    const rows = buildCompareRows(diff, results);
    const reporting = rows.find((r) => r.workflow === 'Results');
    expect(reporting.status).toBe('changed');
    expect(reporting.note).toContain('1 changed');
  });

  it('labels artifacts that were never fetched as not compared, not identical', () => {
    const diff = diffInventory(inv, inv);
    const rows = buildCompareRows(diff, new Map());
    const charts = rows.find((r) => r.workflow === 'hep_explorer');
    expect(charts.status).toBe('not-compared');
    expect(charts.note).toBe('1 not compared');
  });

  it('marks workflows present on one side only', () => {
    const diff = diffInventory([], inv);
    const rows = buildCompareRows(diff, new Map());
    expect(rows.every((r) => r.status === 'added')).toBe(true);
  });

  it('changedRows drops identical workflows', () => {
    const diff = diffInventory(inv, inv);
    const results = new Map(inv.map((a) => [a.path, { state: 'identical' }]));
    const rows = buildCompareRows(diff, results);
    const kept = changedRows(rows);
    expect(kept.every((r) => r.status !== 'identical')).toBe(true);
    expect(kept.length).toBeLessThan(rows.length);
  });
});
