import { esc } from './utils.js';

const STATUS_MAP = {
  completed: { icon: '✓', color: '#22c55e', cls: 'status-completed' },
  failed:    { icon: '✗', color: '#ef4444', cls: 'status-failed' },
  not_run:   { icon: '—', color: '#9ca3b8', cls: 'status-not-run' },
};

/**
 * Build a status badge span for a single step status.
 * @param {string} status - One of 'completed', 'failed', 'not_run'.
 * @returns {HTMLSpanElement}
 */
export function buildStatusBadge(status) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.not_run;
  const span = document.createElement('span');
  span.className = cfg.cls;
  span.style.color = cfg.color;
  span.textContent = cfg.icon;
  return span;
}

/**
 * Build a status summary div for a list of steps.
 * Shows aggregate counts + individual step badges in order.
 * Displays error messages for failed steps.
 * @param {{ name: string, status: string, error: string|null }[]} steps
 * @returns {HTMLDivElement}
 */
export function buildStatusSummary(steps) {
  const counts = { completed: 0, failed: 0, not_run: 0 };
  steps.forEach(s => {
    if (counts[s.status] !== undefined) counts[s.status]++;
    else counts.not_run++;
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'summary-wrap';

  // Aggregate counts
  const agg = document.createElement('div');
  agg.className = 'summary-counts';
  agg.innerHTML =
    `<span class="count-completed">${counts.completed}</span> ` +
    `<span class="count-failed">${counts.failed}</span> ` +
    `<span class="count-not-run">${counts.not_run}</span>`;
  wrapper.appendChild(agg);

  // Individual step badges in order
  const badges = document.createElement('div');
  badges.className = 'summary-badges';
  steps.forEach(s => {
    badges.appendChild(buildStatusBadge(s.status));
    if (s.status === 'failed' && s.error) {
      const errSpan = document.createElement('span');
      errSpan.className = 'error-message';
      errSpan.textContent = s.error;
      badges.appendChild(errSpan);
    }
  });
  wrapper.appendChild(badges);

  return wrapper;
}
