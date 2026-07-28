import { esc } from './utils.js';

// Map a report's group level to an existing tag color class.
function groupTagClass(level) {
  const key = String(level || '').toLowerCase();
  if (key === 'site') return 'tag-site';
  if (key === 'country') return 'tag-country';
  if (key === 'study') return 'tag-study';
  if (key === 'subject') return 'tag-subject';
  return 'tag-identity';
}

/**
 * Build a single interactive-report card. The card is selectable (sets the
 * shared iframe src) and carries an "open in new tab" link to the standalone
 * report HTML.
 */
export function buildReportCard(report, index, selected) {
  const title = report.title || report.id || 'Report';
  const level = report.group_level || '';
  const cls = 'report-card' + (selected ? ' selected' : '');
  let h = `<div class="${cls}" role="button" tabindex="0" data-report-index="${index}" data-report-html="${esc(report.html || '')}">`;
  h += '<div class="report-card-head">';
  h += `<span class="report-card-title">${esc(title)}</span>`;
  if (level) h += `<span class="tag ${groupTagClass(level)}">${esc(level)}</span>`;
  h += '</div>';
  if (report.html) {
    h += `<a class="report-card-open" href="${esc(report.html)}" target="_blank" rel="noopener">Open in new tab ↗</a>`;
  }
  h += '</div>';
  return h;
}

/**
 * Build the list of interactive-report cards, or a short note when none exist.
 */
export function buildReportCards(reports, selectedIndex = 0) {
  if (!reports || !reports.length) {
    return '<div class="reports-note">No interactive reports were generated.</div>';
  }
  return (
    '<div class="report-cards">' +
    reports.map((r, i) => buildReportCard(r, i, i === selectedIndex)).join('') +
    '</div>'
  );
}

/**
 * Build the static-chart grid. Each thumbnail links to the full-size PNG,
 * opened in a new tab. Returns '' when there are no static charts.
 */
export function buildStaticCharts(charts) {
  if (!charts || !charts.length) return '';
  let h = '<div class="reports-section"><div class="reports-section-title">Static charts</div>';
  h += '<div class="static-charts-grid">';
  charts.forEach((c) => {
    const title = c.title || c.metric || '';
    h += `<a class="static-chart" href="${esc(c.png || '')}" target="_blank" rel="noopener" title="${esc(title)}">`;
    h += `<img class="static-chart-img" src="${esc(c.png || '')}" alt="${esc(title)}" loading="lazy">`;
    h += `<span class="static-chart-caption">${esc(title)}</span>`;
    h += '</a>';
  });
  h += '</div></div>';
  return h;
}

/**
 * Empty state shown when reports.json is missing or carries no content.
 */
export function buildReportsEmpty() {
  return (
    '<div class="reports-empty">' +
    '<div class="reports-empty-title">No reports generated yet</div>' +
    '<div class="reports-empty-hint">Run <code>og_run()</code> to generate interactive KRI reports and static chart exports.</div>' +
    '</div>'
  );
}

/**
 * Build the full Reports tab from a reports.json payload
 * ({ reports: [...], static_charts: [...] }). Falls back to the empty state
 * when the payload is missing or has neither reports nor static charts.
 */
export function buildReportsView(data) {
  const reports = data && Array.isArray(data.reports) ? data.reports : [];
  const charts = data && Array.isArray(data.static_charts) ? data.static_charts : [];
  if (!reports.length && !charts.length) return buildReportsEmpty();

  let h = '<div class="reports-layout">';
  h += '<div class="reports-section">';
  h += '<div class="reports-section-title">Interactive reports</div>';
  h += buildReportCards(reports, 0);
  if (reports.length) {
    h += '<div class="report-viewer">';
    h += '<iframe class="report-iframe" title="Interactive report viewer" src="about:blank"></iframe>';
    h += '</div>';
  }
  h += '</div>';
  h += buildStaticCharts(charts);
  h += '</div>';
  return h;
}

/**
 * Render the Reports tab into a container and wire card selection to the shared
 * iframe. A single iframe is reused; its src is set lazily when a report card is
 * selected. The first report is auto-selected on render.
 */
export function renderReports(container, data) {
  container.innerHTML = buildReportsView(data);
  const iframe = container.querySelector('.report-iframe');
  const cards = container.querySelectorAll('.report-card');
  if (!iframe || !cards.length) return;

  const select = (card) => {
    cards.forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    const html = card.dataset.reportHtml;
    if (html) iframe.src = html;
  };

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      // Let the "open in new tab" link behave normally.
      if (e.target.closest('.report-card-open')) return;
      select(card);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(card);
      }
    });
  });

  // Auto-select the first report (single iframe, loaded lazily on selection).
  select(cards[0]);
}
