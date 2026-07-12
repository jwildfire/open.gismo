import { describe, it, expect } from 'vitest';
import {
  buildReportCard,
  buildReportCards,
  buildStaticCharts,
  buildReportsEmpty,
  buildReportsView,
  renderReports,
} from './reports.js';

const sampleReports = [
  {
    id: 'report_kri_site',
    title: 'Site KRI Report (interactive)',
    html: 'output/4_modules/report_kri_site/kri_report_ABC_Site_2026-07-12.html',
    group_level: 'Site',
  },
  {
    id: 'report_kri_country',
    title: 'Country KRI Report (interactive)',
    html: 'output/4_modules/report_kri_country/kri_report_ABC_Country_2026-07-12.html',
    group_level: 'Country',
  },
];

const sampleCharts = [
  { metric: 'kri0001', title: 'AE Rate', png: 'output/4_modules/static/kri0001.png' },
  { metric: 'kri0002', title: 'SAE Rate', png: 'output/4_modules/static/kri0002.png' },
];

describe('buildReportCard', () => {
  it('renders the title, group level, and open-in-new-tab link to the report html', () => {
    const html = buildReportCard(sampleReports[0], 0, false);
    expect(html).toContain('Site KRI Report (interactive)');
    expect(html).toContain('Site');
    expect(html).toContain('href="output/4_modules/report_kri_site/kri_report_ABC_Site_2026-07-12.html"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('data-report-html="output/4_modules/report_kri_site/kri_report_ABC_Site_2026-07-12.html"');
  });

  it('marks the card selected when requested', () => {
    expect(buildReportCard(sampleReports[0], 0, true)).toContain('report-card selected');
    expect(buildReportCard(sampleReports[0], 0, false)).not.toContain('selected');
  });

  it('falls back to id when title is missing and omits the link when html is absent', () => {
    const html = buildReportCard({ id: 'report_x' }, 0, false);
    expect(html).toContain('report_x');
    expect(html).not.toContain('report-card-open');
  });
});

describe('buildReportCards', () => {
  it('renders one card per report', () => {
    const html = buildReportCards(sampleReports);
    expect(html).toContain('Site KRI Report (interactive)');
    expect(html).toContain('Country KRI Report (interactive)');
    expect(html).toContain('report-cards');
  });

  it('marks the selected index as selected', () => {
    const html = buildReportCards(sampleReports, 1);
    // The second card should be the selected one.
    const cards = html.split('report-card ').length;
    expect(cards).toBeGreaterThan(1);
    expect(html).toContain('report-card selected');
  });

  it('shows a note when there are no reports', () => {
    expect(buildReportCards([])).toContain('No interactive reports');
  });
});

describe('buildStaticCharts', () => {
  it('renders a linked PNG thumbnail with a caption per chart', () => {
    const html = buildStaticCharts(sampleCharts);
    expect(html).toContain('Static charts');
    expect(html).toContain('src="output/4_modules/static/kri0001.png"');
    expect(html).toContain('href="output/4_modules/static/kri0002.png"');
    expect(html).toContain('AE Rate');
    expect(html).toContain('SAE Rate');
    expect(html).toContain('target="_blank"');
  });

  it('returns empty string when there are no static charts', () => {
    expect(buildStaticCharts([])).toBe('');
    expect(buildStaticCharts(null)).toBe('');
  });
});

describe('buildReportsEmpty', () => {
  it('mentions og_run() as the way to generate reports', () => {
    const html = buildReportsEmpty();
    expect(html).toContain('No reports generated yet');
    expect(html).toContain('og_run()');
  });
});

describe('buildReportsView', () => {
  it('renders reports, an iframe viewer, and the static grid', () => {
    const html = buildReportsView({ reports: sampleReports, static_charts: sampleCharts });
    expect(html).toContain('Interactive reports');
    expect(html).toContain('Site KRI Report (interactive)');
    expect(html).toContain('report-iframe');
    expect(html).toContain('Static charts');
    expect(html).toContain('kri0001.png');
  });

  it('shows the empty state when there are no reports and no static charts', () => {
    expect(buildReportsView({ reports: [], static_charts: [] })).toContain('No reports generated yet');
    expect(buildReportsView(null)).toContain('No reports generated yet');
  });

  it('renders static charts even when there are no interactive reports', () => {
    const html = buildReportsView({ reports: [], static_charts: sampleCharts });
    expect(html).toContain('No interactive reports');
    expect(html).toContain('Static charts');
    expect(html).not.toContain('report-iframe');
  });
});

describe('renderReports', () => {
  it('auto-selects the first report and points the iframe at its html', () => {
    const container = document.createElement('div');
    renderReports(container, { reports: sampleReports, static_charts: sampleCharts });
    const iframe = container.querySelector('.report-iframe');
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('src')).toBe(sampleReports[0].html);
    const cards = container.querySelectorAll('.report-card');
    expect(cards[0].classList.contains('selected')).toBe(true);
  });

  it('updates the iframe when a different report card is clicked', () => {
    const container = document.createElement('div');
    renderReports(container, { reports: sampleReports, static_charts: sampleCharts });
    const cards = container.querySelectorAll('.report-card');
    cards[1].click();
    const iframe = container.querySelector('.report-iframe');
    expect(iframe.getAttribute('src')).toBe(sampleReports[1].html);
    expect(cards[1].classList.contains('selected')).toBe(true);
    expect(cards[0].classList.contains('selected')).toBe(false);
  });

  it('renders the empty state without wiring when reports.json is missing', () => {
    const container = document.createElement('div');
    renderReports(container, null);
    expect(container.innerHTML).toContain('No reports generated yet');
    expect(container.querySelector('.report-iframe')).toBeNull();
  });
});
