import { describe, it, expect, beforeEach } from 'vitest';
import {
  chartCard, chartCards, buildChartCard, buildGallery, buildChartPage,
  mountChartFrame, prettifyId, dataDomainLabel, chartStatus,
} from './gallery.js';

const REPORTS = {
  reports: [
    {
      id: 'hep_explorer',
      title: 'Hepatic Safety Explorer Report',
      description: 'Interactive safety.viz eDISH hepatic safety explorer.',
      data: 'adbds',
      html: 'output/3_reports/hep_explorer/hep_explorer.html',
      status: 'completed',
      error: null,
    },
    {
      id: 'ae_explorer',
      title: 'Adverse Event Explorer Report',
      description: 'Per-arm prevalence and between-arm differences.',
      data: 'adae',
      html: 'output/3_reports/ae_explorer/ae_explorer.html',
      status: 'completed',
      error: null,
    },
    {
      id: 'broken_chart',
      title: 'Broken Chart',
      data: 'adeg',
      html: '',
      status: 'failed',
      error: 'render failed',
    },
  ],
};

const DOMAIN = { key: 'safety', label: 'Safety', charts: 'safety.viz', workflows: ['1_mappings', '3_reports'] };

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('helpers', () => {
  it('prettifies a workflow id', () => {
    expect(prettifyId('safety_results_over_time')).toBe('Safety Results Over Time');
  });

  it('maps the Data meta key to a short domain label', () => {
    expect(dataDomainLabel('adbds')).toBe('LB / VS');
    expect(dataDomainLabel('adae')).toBe('AE');
    expect(dataDomainLabel('')).toBe('multi');
    expect(dataDomainLabel('custom')).toBe('CUSTOM');
  });

  it('maps report status to the safety.viz maturity vocabulary', () => {
    expect(chartStatus({ status: 'completed' }).label).toBe('Available');
    expect(chartStatus({ status: 'failed', error: 'boom' }).label).toBe('Failed');
    expect(chartStatus({ status: 'skipped' }).label).toBe('Not run');
  });
});

describe('chartCard', () => {
  it('prefers reports.json metadata', () => {
    const c = chartCard(REPORTS.reports[0]);
    expect(c.title).toBe('Hepatic Safety Explorer Report');
    expect(c.dataLabel).toBe('LB / VS');
    expect(c.available).toBe(true);
  });

  it('falls back to workflow YAML meta then to the prettified id', () => {
    const withMeta = chartCard({ id: 'qt_explorer' }, { Name: 'QT Safety Explorer Report', Data: 'adeg' });
    expect(withMeta.title).toBe('QT Safety Explorer Report');
    expect(withMeta.dataLabel).toBe('EG');
    const bare = chartCard({ id: 'qt_explorer' });
    expect(bare.title).toBe('Qt Explorer');
  });

  it('marks failed renders unavailable', () => {
    expect(chartCard(REPORTS.reports[2]).available).toBe(false);
  });
});

describe('buildGallery', () => {
  it('renders one card per chart with a status pill and domain tag', () => {
    const el = mount(buildGallery(chartCards(REPORTS), DOMAIN));
    const cards = el.querySelectorAll('.chart-card');
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute('href')).toBe('#/safety/hep_explorer');
    expect(cards[0].querySelector('.pill').textContent).toBe('Available');
    expect(cards[0].querySelector('.tag-domain').textContent).toBe('LB / VS');
  });

  it('headlines the available count and the domain registry entry', () => {
    const el = mount(buildGallery(chartCards(REPORTS), DOMAIN));
    const sub = el.querySelector('.domain-sub').textContent;
    expect(sub).toContain('2');
    expect(sub).toContain('3');
    expect(sub).toContain('safety.viz');
    expect(sub).toContain('3_reports');
  });

  it('dims unavailable cards', () => {
    const el = mount(buildGallery(chartCards(REPORTS), DOMAIN));
    expect(el.querySelectorAll('.chart-card')[2].classList.contains('is-unavailable')).toBe(true);
  });

  it('shows an empty state when the snapshot rendered no charts', () => {
    const el = mount(buildGallery([], DOMAIN));
    expect(el.querySelector('.empty-state')).toBeTruthy();
    expect(el.textContent).toContain('No safety charts');
  });

  it('escapes chart metadata', () => {
    const el = mount(buildChartCard(chartCard({ id: 'x', title: '<script>bad()</script>' })));
    expect(el.querySelector('script')).toBe(null);
  });
});

describe('buildChartPage', () => {
  it('renders the header strip, back nav and an unloaded iframe', () => {
    const card = chartCard(REPORTS.reports[0]);
    const el = mount(buildChartPage(card, DOMAIN));
    expect(el.querySelector('.chart-title').textContent).toBe('Hepatic Safety Explorer Report');
    expect(el.querySelector('.crumb-back').getAttribute('href')).toBe('#/safety');
    const frame = el.querySelector('.chart-frame');
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('src')).toBe('about:blank');
    expect(frame.getAttribute('loading')).toBe('lazy');
  });

  it('lists type, data domain, workflow and status', () => {
    const el = mount(buildChartPage(chartCard(REPORTS.reports[0]), DOMAIN));
    const meta = el.querySelector('.chart-meta').textContent;
    expect(meta).toContain('safety.viz renderer');
    expect(meta).toContain('LB / VS');
    expect(meta).toContain('hep_explorer');
    expect(meta).toContain('Available');
  });

  it('explains itself when the chart was not rendered', () => {
    const el = mount(buildChartPage(chartCard(REPORTS.reports[2]), DOMAIN));
    expect(el.querySelector('.chart-frame')).toBe(null);
    expect(el.textContent).toContain('not rendered in this snapshot');
  });

  it('handles an unknown chart id', () => {
    const el = mount(buildChartPage(null, DOMAIN));
    expect(el.textContent).toContain('Chart not found');
  });
});

describe('mountChartFrame', () => {
  it('sets the iframe src only on mount, resolved against the snapshot base', () => {
    const card = chartCard(REPORTS.reports[0]);
    const el = mount(buildChartPage(card, DOMAIN));
    const frame = mountChartFrame(el, card, (p) => `ps-001/${p}`);
    expect(frame.getAttribute('src')).toBe('ps-001/output/3_reports/hep_explorer/hep_explorer.html');
    expect(el.querySelector('[data-chart-open]').getAttribute('href'))
      .toBe('ps-001/output/3_reports/hep_explorer/hep_explorer.html');
  });

  it('loads exactly one chart document, never the gallery', () => {
    const cards = chartCards(REPORTS);
    const el = mount(buildGallery(cards, DOMAIN));
    expect(el.querySelectorAll('iframe')).toHaveLength(0);
  });
});
