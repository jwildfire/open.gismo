import { describe, it, expect, beforeEach } from 'vitest';
import { buildOverview, buildChangeList, overviewLoading } from './overview.js';
import { summarizeFlags, metricIndex, groupIndex, flagDeltas } from './flags.js';
import { chartCards } from './gallery.js';

const rows = (flags) => Object.entries(flags).map(([k, v]) => {
  const [GroupID, MetricID] = k.split('|');
  return { GroupID, MetricID, Flag: String(v), GroupLevel: 'Site' };
});

const PREV = rows({ 'S1|Analysis_kri0001': 1, 'S2|Analysis_kri0001': 2, 'S3|Analysis_kri0001': 0 });
const CURR = rows({ 'S1|Analysis_kri0001': 2, 'S2|Analysis_kri0001': 0, 'S3|Analysis_kri0001': 0 });

const metrics = metricIndex([
  { MetricID: 'Analysis_kri0001', ID: 'kri0001', Abbreviation: 'AE', Metric: 'Adverse Event Rate', GroupLevel: 'Site' },
]);
const groups = groupIndex([
  { GroupID: 'S1', Param: 'InvestigatorLastName', Value: 'Smith', GroupLevel: 'Site' },
], 'Site');

const CARDS = chartCards({
  reports: [
    { id: 'hep_explorer', title: 'Hepatic Safety Explorer Report', data: 'adbds', html: 'a.html', status: 'completed' },
    { id: 'ae_explorer', title: 'AE Explorer Report', data: 'adae', html: 'b.html', status: 'completed' },
    { id: 'qt_explorer', title: 'QT Explorer Report', data: 'adeg', html: 'c.html', status: 'completed' },
    { id: 'shift_plot', title: 'Shift Plot Report', data: 'adbds', html: 'd.html', status: 'completed' },
    { id: 'histogram', title: 'Histogram Report', data: 'adbds', html: 'e.html', status: 'completed' },
  ],
});

const DOMAINS = [
  { key: 'safety', label: 'Safety', charts: 'safety.viz', workflows: [] },
  { key: 'rbqm', label: 'RBQM', charts: 'gsm.viz', workflows: [] },
];

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('buildChangeList', () => {
  it('lists flag transitions with a direction tag', () => {
    const el = mount(buildChangeList(flagDeltas(PREV, CURR), { metrics, groups }));
    const items = el.querySelectorAll('.change-item');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('change-worse')).toBe(true);
    expect(items[0].textContent).toContain('Adverse Event Rate');
    expect(items[0].textContent).toContain('worse');
  });

  it('names the group with its investigator label when known', () => {
    const el = mount(buildChangeList(flagDeltas(PREV, CURR), { metrics, groups }));
    expect(el.textContent).toContain('S1 · Smith');
  });

  it('says nothing changed rather than showing an empty list', () => {
    const el = mount(buildChangeList([], { metrics, groups }));
    expect(el.textContent).toContain('No flag level changed');
  });

  it('caps the list and links the rest to the compare view', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      groupId: `S${i}`, metricId: 'Analysis_kri0001', from: '0', to: '2',
      fromLevel: 'ontrack', toLevel: 'red', kind: 'changed', direction: 'worse',
    }));
    const el = mount(buildChangeList(many, { metrics, groups }));
    expect(el.querySelectorAll('.change-item')).toHaveLength(8);
    expect(el.querySelector('.change-more a').getAttribute('href')).toBe('#/compare');
  });
});

describe('buildOverview', () => {
  const html = (extra = {}) => buildOverview({
    summary: summarizeFlags(CURR, 'Site'),
    cards: CARDS,
    deltas: flagDeltas(PREV, CURR),
    metrics,
    groups,
    prevSnapshot: { snapshot_id: 'ps-001', input_data_version: 'cut-1' },
    currentSnapshot: { snapshot_id: 'ps-002', input_data_version: 'cut-2' },
    domains: DOMAINS,
    ...extra,
  });

  it('interleaves the RBQM headline and the Safety preview', () => {
    const el = mount(html());
    const titles = [...el.querySelectorAll('.section-title')].map((n) => n.textContent);
    expect(titles[0]).toContain('RBQM');
    expect(titles[1]).toContain('Safety');
    expect(el.querySelectorAll('.tile')).toHaveLength(3);
  });

  it('links each headline into its domain home', () => {
    const el = mount(html());
    const links = [...el.querySelectorAll('.section-link')].map((a) => a.getAttribute('href'));
    expect(links).toContain('#/rbqm');
    expect(links).toContain('#/safety');
  });

  it('previews at most four charts and links to the rest', () => {
    const el = mount(html());
    expect(el.querySelectorAll('.chart-card')).toHaveLength(4);
    expect(el.querySelector('.change-more a').getAttribute('href')).toBe('#/safety');
  });

  it('shows the since-previous-snapshot section only with a second snapshot', () => {
    const withPrev = mount(html());
    expect(withPrev.textContent).toContain('Since');
    expect(withPrev.textContent).toContain('cut-1');
    document.body.innerHTML = '';
    const single = mount(html({ prevSnapshot: null, deltas: [] }));
    expect(single.textContent).not.toContain('Since');
  });

  it('links the change section to a pre-filled comparison', () => {
    const el = mount(html());
    const links = [...el.querySelectorAll('.section-link')].map((a) => a.getAttribute('href'));
    expect(links).toContain('#/compare?from=ps-001&to=ps-002');
  });

  it('renders only the domains present in the registry', () => {
    const el = mount(html({ domains: [DOMAINS[0]] }));
    expect(el.textContent).toContain('Safety');
    expect(el.querySelectorAll('.tile')).toHaveLength(0);
  });

  it('has a loading state', () => {
    expect(overviewLoading()).toContain('spinner');
  });
});
