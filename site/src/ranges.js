/**
 * Acceptable ranges — the study-level quality tolerance limits.
 *
 * ICH E6(R3) renames quality tolerance limits "acceptable ranges" and makes
 * pre-specifying them a sponsor obligation, with three states a reader needs to
 * tell apart: within range, trending toward the limit, and breached. gsm.qtl's
 * `Analyze_OneSideProp()` produces exactly that vocabulary — its `Flag` is 0
 * when the metric sits below the expected rate, 1 between the expected rate and
 * the limit, and 2 at or above the limit — so this panel is a rendering of the
 * pipeline's own three states, not a re-derivation in the browser.
 *
 * QTLs are study-level and site KRIs are site-level, and conflating the two
 * levels is the named failure mode in TransCelerate's guidance. Nothing here
 * mixes them: this panel reads only `GroupLevel == "Study"` rows.
 *
 * The limit itself comes back from the metric's own metadata, the same way the
 * QTL report computes it:
 *
 *   limit = nPropRate + nNumDeviations × sqrt(nPropRate(1 − nPropRate) / N)
 *
 * where `nPropRate` is the pre-specified expected rate — the secondary limit a
 * reviewer watches — and `N` the study denominator.
 */

import { esc } from './utils.js';
import { classifyChange, changeChip } from './change.js';

/** The three states, in words. Colour is never the only carrier. */
export const RANGE_STATES = {
  within: { key: 'within', label: 'within range', glyph: '✓' },
  trending: { key: 'trending', label: 'trending to limit', glyph: '△' },
  breached: { key: 'breached', label: 'breached', glyph: '⇈' },
  unknown: { key: 'unknown', label: 'not evaluated', glyph: '–' },
};

/** A QTL flag (0/1/2) as one of the three ICH E6(R3) states. */
export function rangeState(flag) {
  const raw = String(flag ?? '').trim();
  // An absent flag is "not evaluated", not "within range": Number('') is 0.
  if (!raw || raw.toUpperCase() === 'NA') return RANGE_STATES.unknown;
  const n = Number(raw);
  if (!Number.isFinite(n)) return RANGE_STATES.unknown;
  if (n >= 2) return RANGE_STATES.breached;
  if (n >= 1) return RANGE_STATES.trending;
  return RANGE_STATES.within;
}

/** Numeric coercion that treats "NA" and "" as absent. */
function num(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === 'NA') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The tolerance limit for a QTL, from its own metadata.
 * @returns {number|null} a proportion, or null when the metadata is incomplete
 */
export function toleranceLimit(propRate, deviations, denominator) {
  const p = num(propRate);
  const z = num(deviations);
  const n = num(denominator);
  if (p === null || z === null || n === null || n <= 0) return null;
  return p + z * Math.sqrt((p * (1 - p)) / n);
}

/**
 * The study-level acceptable ranges in this snapshot.
 *
 * A metric qualifies by carrying the QTL contract — a pre-specified
 * `nPropRate` — not by having "qtl" in its id, so a study that names its
 * tolerance limits something else still gets them rendered.
 *
 * @param {object} reporting { results, metrics }
 * @returns {Array<object>}
 */
export function acceptableRanges(reporting) {
  const metrics = new Map(
    (reporting?.metrics || [])
      .filter((m) => m.MetricID && num(m.nPropRate) !== null)
      .map((m) => [m.MetricID, m]),
  );
  if (!metrics.size) return [];

  const rows = [];
  for (const r of reporting?.results || []) {
    if (String(r.GroupLevel || '') !== 'Study') continue;
    const m = metrics.get(r.MetricID);
    if (!m) continue;
    const metric = num(r.Metric);
    const denominator = num(r.Denominator);
    const propRate = num(m.nPropRate);
    const limit = toleranceLimit(m.nPropRate, m.nNumDeviations, denominator);
    const state = rangeState(r.Flag);
    const previous = num(r.Metric_Previous);
    rows.push({
      metricId: r.MetricID,
      workflowId: m.ID || '',
      name: m.Metric || m.Abbreviation || r.MetricID,
      abbreviation: m.Abbreviation || '',
      numerator: num(r.Numerator),
      denominator,
      metric,
      expected: propRate,
      limit,
      deviations: num(m.nNumDeviations),
      state,
      change: num(r.Metric_Change),
      previous,
      // How far through the band the study currently sits, for the meter.
      position: metric !== null && limit ? Math.min(1, Math.max(0, metric / limit)) : null,
    });
  }
  rows.sort((a, b) => {
    const rank = { breached: 0, trending: 1, within: 2, unknown: 3 };
    return rank[a.state.key] - rank[b.state.key] || a.name.localeCompare(b.name);
  });
  return rows;
}

/** A proportion as a percentage string. */
function pct(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * The panel.
 *
 * @param {Array<object>} ranges from acceptableRanges
 * @param {object} [opts] { compact }
 */
export function buildAcceptableRanges(ranges, opts = {}) {
  let h = '<div class="section-head"><h3 class="section-title">Acceptable ranges — study level</h3>';
  h += '<div class="section-actions"><span class="tag mono">gsm.qtl</span></div></div>';
  h += '<p class="section-note">Quality tolerance limits, in ICH E6(R3)\'s three states: '
    + '<strong>within range</strong>, <strong>trending to limit</strong>, <strong>breached</strong>. '
    + 'These are <em>study-level</em> parameters, deliberately kept apart from the site KRIs above — '
    + 'conflating the two levels is the named failure mode in TransCelerate\'s guidance. '
    + 'The limit is the metric\'s pre-specified expected rate plus its stated number of deviations; '
    + 'both are shown so a reader can see what the state is measured against.</p>';

  if (!ranges.length) {
    h += '<div class="empty-state"><div class="empty-title">No quality tolerance limits in this snapshot</div>'
      + '<div class="empty-hint">A QTL is a <span class="mono">2_metrics</span> workflow carrying an '
      + '<span class="mono">nPropRate</span> in its meta and reporting at <span class="mono">GroupLevel: Study</span>. '
      + 'None of this snapshot\'s metrics does.</div></div>';
    return h;
  }

  h += '<ul class="ranges">';
  for (const r of ranges) {
    h += `<li class="range range-${esc(r.state.key)}">`;
    h += '<div class="range-head">';
    h += `<span class="range-name">${esc(r.name)}</span>`;
    h += `<span class="range-state"><span class="range-glyph" aria-hidden="true">${esc(r.state.glyph)}</span>${esc(r.state.label)}</span>`;
    h += '</div>';

    h += '<div class="range-figure">';
    h += `<span class="range-value num">${esc(pct(r.metric))}</span>`;
    if (r.numerator !== null && r.denominator !== null) {
      h += `<span class="range-fraction mono">${esc(String(r.numerator))} of ${esc(String(r.denominator))}</span>`;
    }
    if (r.change !== null) {
      // A rate against a tolerance limit has one bad direction: up.
      h += changeChip(classifyChange(r.change * 100, { badDirection: 'up', noise: 0.2 }), { digits: 1 });
    }
    h += '</div>';

    // The meter is a second reading of the same numbers, not the only one.
    if (r.position !== null) {
      const expectedAt = r.limit ? Math.min(100, (r.expected / r.limit) * 100) : null;
      h += '<div class="range-meter" role="presentation">';
      h += `<span class="range-meter-fill" style="width:${(r.position * 100).toFixed(1)}%"></span>`;
      if (expectedAt !== null) {
        h += `<span class="range-meter-mark" style="left:${expectedAt.toFixed(1)}%"></span>`;
      }
      h += '</div>';
    }

    h += '<div class="range-limits mono">';
    h += `limit ${esc(pct(r.limit))}`;
    if (r.expected !== null) h += ` · expected ${esc(pct(r.expected))}`;
    if (r.deviations !== null) h += ` · ${esc(String(r.deviations))}σ`;
    h += '</div>';
    h += '</li>';
  }
  h += '</ul>';
  return h;
}
