import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCompareView, buildCompareControls, buildCompareSummary,
  buildCompareTable, buildFlagDeltaTable, phaseTag,
} from './compareview.js';
import { metricIndex, groupIndex } from './flags.js';

const SNAPS = [
  { snapshot_id: 'ps-001', created_at: '2026-07-28T18:31:14Z', input_data_version: 'cut-1' },
  { snapshot_id: 'ps-002', created_at: '2026-07-28T18:41:49Z', input_data_version: 'cut-2' },
];

const SUMMARY = {
  added: 1, removed: 0, changed: 3, identical: 26, unavailable: 0,
  compared: 29, common: 160, notCompared: 131,
};

const ROWS = [
  { key: '3_reporting/Results', phase: '3_reporting', workflow: 'Results', status: 'changed', note: '1 changed' },
  { key: '2_metrics/kri0001', phase: '2_metrics', workflow: 'kri0001', status: 'not-compared', note: '4 not compared' },
];

const DELTAS = [
  { groupId: 'S1', metricId: 'Analysis_kri0001', from: '1', to: '2', fromLevel: 'amber', toLevel: 'red', kind: 'changed', direction: 'worse' },
];

const metrics = metricIndex([
  { MetricID: 'Analysis_kri0001', ID: 'kri0001', Abbreviation: 'AE', Metric: 'Adverse Event Rate', GroupLevel: 'Site' },
]);
const groups = groupIndex([], 'Site');

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('phaseTag', () => {
  it('reuses the pipeline phase scale', () => {
    const el = mount(phaseTag('3_reporting'));
    expect(el.querySelector('.phase-tag').textContent).toBe('Reporting');
    expect(el.querySelector('.phase-tag').classList.contains('phase-tag-3')).toBe(true);
  });

  it('degrades for an unknown phase', () => {
    expect(mount(phaseTag('9_weird')).querySelector('.phase-tag-x')).toBeTruthy();
  });
});

describe('buildCompareControls', () => {
  it('renders two labelled selects defaulted to the two newest snapshots', () => {
    const el = mount(buildCompareControls(SNAPS, 'ps-001', 'ps-002'));
    const from = el.querySelector('#compareFrom');
    const to = el.querySelector('#compareTo');
    expect(from.value).toBe('ps-001');
    expect(to.value).toBe('ps-002');
    expect(el.textContent).toContain('Baseline');
    expect(el.textContent).toContain('Comparison');
  });
});

describe('buildCompareSummary', () => {
  it('renders the three chips', () => {
    const el = mount(buildCompareSummary(SUMMARY));
    const chips = [...el.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips[0]).toContain('1');
    expect(chips[0]).toContain('artifact added');
    expect(chips[1]).toContain('3');
    expect(chips[2]).toContain('artifact');
  });

  it('is explicit about what was and was not compared', () => {
    const el = mount(buildCompareSummary(SUMMARY));
    const note = el.querySelector('.compare-note').textContent;
    expect(note).toContain('29');
    expect(note).toContain('131');
    expect(note).toContain('not compared');
    expect(note).toContain('status.json');
  });

  it('mentions unavailable fetches when there are any', () => {
    const el = mount(buildCompareSummary({ ...SUMMARY, unavailable: 2 }));
    expect(el.textContent).toContain('could not be fetched');
  });
});

describe('buildCompareTable', () => {
  it('renders one row per workflow with a phase tag and a state', () => {
    const el = mount(buildCompareTable(ROWS));
    const trs = el.querySelectorAll('tbody tr');
    expect(trs).toHaveLength(2);
    expect(trs[0].textContent).toContain('Results');
    expect(trs[0].querySelector('.phase-tag').textContent).toBe('Reporting');
    expect(trs[0].querySelector('.state').textContent).toBe('Changed');
    expect(trs[1].querySelector('.state').textContent).toBe('Not compared');
  });

  it('scrolls in its own container', () => {
    expect(mount(buildCompareTable(ROWS)).querySelector('.table-scroll')).toBeTruthy();
  });

  it('has an empty state', () => {
    expect(mount(buildCompareTable([])).textContent).toContain('Nothing to compare');
  });
});

describe('buildFlagDeltaTable', () => {
  it('renders was/now levels as text', () => {
    const el = mount(buildFlagDeltaTable(DELTAS, metrics, groups, 'Site'));
    const tds = [...el.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(tds[1]).toBe('Adverse Event Rate');
    expect(tds[2]).toBe('Amber');
    expect(tds[3]).toBe('Red');
    expect(tds[4]).toBe('worse');
  });

  it('says nothing changed when there are no deltas', () => {
    expect(mount(buildFlagDeltaTable([], metrics, groups)).textContent).toContain('No flag level changed');
  });
});

describe('buildCompareView', () => {
  it('shows a loading state while both snapshots are read', () => {
    const el = mount(buildCompareView({ snapshots: SNAPS, fromId: 'ps-001', toId: 'ps-002', loading: true }));
    expect(el.querySelector('.spinner')).toBeTruthy();
    expect(el.querySelector('#compareFrom')).toBeTruthy();
  });

  it('assembles controls, chips and both tables', () => {
    const el = mount(buildCompareView({
      snapshots: SNAPS, fromId: 'ps-001', toId: 'ps-002',
      summary: SUMMARY, rows: ROWS, deltas: DELTAS, metrics, groups, groupLevel: 'Site',
    }));
    expect(el.querySelectorAll('.chip')).toHaveLength(3);
    expect(el.querySelectorAll('table')).toHaveLength(2);
  });

  it('refuses to compare a snapshot with itself', () => {
    const el = mount(buildCompareView({ snapshots: SNAPS, fromId: 'ps-002', toId: 'ps-002' }));
    expect(el.textContent).toContain('Pick two different snapshots');
  });

  it('surfaces a fetch error', () => {
    const el = mount(buildCompareView({ snapshots: SNAPS, fromId: 'ps-001', toId: 'ps-002', error: 'boom' }));
    expect(el.querySelector('.error-msg').textContent).toBe('boom');
  });
});
