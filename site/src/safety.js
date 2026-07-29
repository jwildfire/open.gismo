/**
 * Safety domain — the overview page.
 *
 * Reading order is deliberate and it is not the obvious one. Event counts come
 * last, denominators first:
 *
 *   1. census and exposure — how many participants, how much person-time;
 *   2. data coverage by visit — how completely the safety data was collected;
 *   3. disposition — who left the study and why;
 *   4. the needs-case-review queue — participants the metrics flagged;
 *   5. the chart gallery — the renderers available for this snapshot.
 *
 * Coverage sits above every count on purpose. A quiet visit where 40% of
 * participants have no lab result is not a reassuring visit, and a reader who
 * meets the event rate first has already drawn the wrong conclusion by the time
 * the denominator arrives.
 *
 * **Every figure on this page is pooled across treatment arms.** The default
 * study-team view is a blinded view; FDA guidance treats even coded arms
 * (A/B/C) as unblinded data, so an arm split belongs behind a role, not in this
 * page's markup.
 *
 * Nothing here is computed from raw domains in the browser. The census arrives
 * pre-reduced in `output/4_modules/safety_census.json`
 * (gsm.safety::SafetyCensus, run by the pipeline); the queue is built from the
 * participant-level metric outputs the same pipeline wrote.
 */

import { esc } from './utils.js';
import { buildHash } from './router.js';
import { buildChartCard } from './gallery.js';
import { classifyFlag, FLAG_LEVELS } from './flags.js';

/* ── the census payload ────────────────────────────────────────────────────── */

/** A JSON payload field that may arrive as a scalar or a one-element array. */
function scalar(v) {
  return Array.isArray(v) ? v[0] : v;
}

/** Rows of a jsonlite data.frame payload, always as an array. */
function rows(v) {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

/**
 * Normalise `safety_census.json` into { census, coverage, disposition }.
 * jsonlite writes a data.frame as an array of row objects and unboxes a
 * one-row frame to a bare object, so both shapes have to survive.
 */
export function parseCensus(payload) {
  if (!payload) return { census: [], coverage: [], disposition: [] };
  // Number(null) is 0, which would turn "not collected" into "none found" —
  // the one mistranslation this page exists to prevent.
  const num = (v) => {
    const raw = scalar(v);
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    census: rows(payload.Census).map((r) => ({
      label: String(scalar(r.Label) ?? ''),
      value: num(r.Value),
      denominator: num(r.Denominator),
      group: String(scalar(r.Group) ?? ''),
    })),
    coverage: rows(payload.Coverage).map((r) => ({
      domain: String(scalar(r.Domain) ?? ''),
      visit: String(scalar(r.Visit) ?? ''),
      visitNum: num(r.VisitNum),
      participants: num(r.Participants) ?? 0,
      expected: num(r.Expected) ?? 0,
    })),
    disposition: rows(payload.Disposition).map((r) => ({
      state: String(scalar(r.State) ?? ''),
      participants: num(r.Participants) ?? 0,
    })),
  };
}

/** Format a census value: integers plain, fractions to one decimal. */
export function formatValue(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "741 of 765 (97%)" — the denominator is never dropped. */
export function formatAgainst(value, denominator) {
  if (value === null || !Number.isFinite(value)) return 'not collected';
  if (!denominator || !Number.isFinite(denominator)) return '';
  const pct = Math.round((value / denominator) * 100);
  // A rate that rounds to 0% but is not 0 reads as "none"; say "<1%" instead.
  const shown = pct === 0 && value > 0 ? '<1' : String(pct);
  return `of ${denominator} (${shown}%)`;
}

/* ── the review queue ──────────────────────────────────────────────────────── */

/**
 * Participant-level metrics in this snapshot, from the reporting layer.
 * Registry-driven: a metric appears here because it declared
 * `GroupLevel: Subject`, not because this module names it.
 */
export function participantMetrics(metricRows) {
  return (metricRows || [])
    .filter((m) => String(m.GroupLevel || '') === 'Subject')
    .map((m) => ({
      id: String(m.ID || ''),
      metricId: String(m.MetricID || `Analysis_${m.ID}`),
      label: String(m.Metric || m.ID || '').replace(/\s*\(Subject\)\s*$/, ''),
      abbreviation: String(m.Abbreviation || ''),
      weights: parseWeights(m.Flag, m.RiskScoreWeight),
    }));
}

/** Flag → weight lookup from the metric's two parallel comma vectors. */
export function parseWeights(flagSpec, weightSpec) {
  const flags = String(flagSpec ?? '').split(',').map((s) => s.trim());
  const weights = String(weightSpec ?? '').split(',').map((s) => Number(s.trim()));
  const out = new Map();
  flags.forEach((f, i) => {
    if (f !== '' && Number.isFinite(weights[i])) out.set(f, weights[i]);
  });
  return out;
}

/** Fallback weighting when a metric ships no RiskScoreWeight vector. */
const LEVEL_WEIGHT = { red: 16, amber: 4, ontrack: 0, none: 0 };

/**
 * Rank participants by how much review they warrant.
 *
 * Review-worthiness is the sum of the flag weights each metric already
 * declares (`RiskScoreWeight` against `Flag` in the metric YAML), not the
 * single worst flag. Two ambers on different organ systems is a different
 * conversation from one amber, and severity alone cannot say so. A participant
 * whose flag worsened since the previous snapshot is surfaced as new, which is
 * the "why now" a reviewer needs to work a queue rather than re-read it.
 *
 * @param {object} o { results, prevResults, hasPrevious, metrics, evidence, limit }
 * @returns {Array<object>} ranked queue rows
 */
export function reviewQueue(o = {}) {
  const metrics = participantMetrics(o.metrics);
  if (!metrics.length) return [];
  const byMetricId = new Map(metrics.map((m) => [m.metricId, m]));

  // Without a snapshot to compare against, nothing is "new": marking the first
  // snapshot's whole queue as new is noise, not a signal.
  const hasPrevious = o.hasPrevious !== undefined
    ? Boolean(o.hasPrevious)
    : Boolean(o.prevResults && o.prevResults.length);
  const prevFlag = new Map();
  for (const r of o.prevResults || []) {
    if (String(r.GroupLevel || '') !== 'Subject') continue;
    prevFlag.set(`${r.GroupID}|${r.MetricID}`, classifyFlag(r.Flag));
  }

  const participants = new Map();
  for (const r of o.results || []) {
    if (String(r.GroupLevel || '') !== 'Subject') continue;
    const metric = byMetricId.get(String(r.MetricID || ''));
    if (!metric) continue;
    const level = classifyFlag(r.Flag);
    if (level !== 'red' && level !== 'amber') continue;

    const id = String(r.GroupID);
    if (!participants.has(id)) {
      participants.set(id, { id, findings: [], score: 0, reds: 0, isNew: false });
    }
    const p = participants.get(id);
    const weight = metric.weights.get(String(r.Flag).trim());
    const was = prevFlag.get(`${id}|${metric.metricId}`);
    // "Newly flagged" means this snapshot moved it. A participant absent from
    // the previous snapshot is new; one already red is not news.
    const isNew = hasPrevious && (
      was === undefined || FLAG_LEVELS[level].severity > FLAG_LEVELS[was].severity
    );

    p.findings.push({
      metricId: metric.id,
      label: metric.label,
      abbreviation: metric.abbreviation,
      level,
      isNew,
      why: describeFinding(metric.id, (o.evidence || {})[metric.id]?.get?.(id)),
    });
    p.score += Number.isFinite(weight) ? weight : LEVEL_WEIGHT[level];
    if (level === 'red') p.reds += 1;
    if (isNew) p.isNew = true;
  }

  const queue = [...participants.values()].sort(
    (a, b) => b.score - a.score
      || b.reds - a.reds
      || (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)
      || String(a.id).localeCompare(String(b.id)),
  );
  for (const p of queue) {
    p.findings.sort(
      (a, b) => FLAG_LEVELS[b.level].severity - FLAG_LEVELS[a.level].severity,
    );
  }
  return o.limit ? queue.slice(0, o.limit) : queue;
}

/**
 * The one-line "why" behind a finding, read from the metric's own evidence
 * columns. Returns '' when the metric's Analysis_Input is not loaded — the
 * queue still works, it just says less.
 */
export function describeFinding(metricId, row) {
  if (!row) return '';
  const n = (v, digits = 1) => {
    const x = Number(v);
    return Number.isFinite(x) ? x.toFixed(digits) : null;
  };
  if (row.PeakALT_xULN !== undefined || row.PeakTB_xULN !== undefined) {
    const at = Math.max(Number(row.PeakALT_xULN) || 0, Number(row.PeakAST_xULN) || 0);
    const parts = [];
    if (at > 0) parts.push(`peak ALT/AST ${at.toFixed(1)}×ULN`);
    if (n(row.PeakTB_xULN)) parts.push(`bilirubin ${n(row.PeakTB_xULN)}×ULN`);
    if (n(row.PeakALP_xULN)) parts.push(`ALP ${n(row.PeakALP_xULN)}×ULN`);
    return parts.join(', ');
  }
  if (row.MaxValue !== undefined) {
    const parts = [];
    if (n(row.MaxValue, 0)) parts.push(`max ${row.Measure || 'QTc'} ${n(row.MaxValue, 0)} ms`);
    if (n(row.MaxChange, 0)) parts.push(`change ${n(row.MaxChange, 0)} ms`);
    return parts.join(', ');
  }
  if (row.SeriousCount !== undefined) {
    const serious = Number(row.SeriousCount) || 0;
    const related = Number(row.RelatedCount) || 0;
    const total = Number(row.AECount) || 0;
    const parts = [`${total} AE${total === 1 ? '' : 's'}`];
    if (serious) parts.push(`${serious} serious`);
    if (related) parts.push(`${related} related`);
    return parts.join(', ');
  }
  return '';
}

/* ── markup ────────────────────────────────────────────────────────────────── */

function statTile(row) {
  const against = formatAgainst(row.value, row.denominator);
  let h = '<div class="census-tile">';
  h += `<div class="census-value${row.value === null ? ' census-absent' : ''}">${esc(formatValue(row.value))}</div>`;
  h += `<div class="census-label">${esc(row.label)}</div>`;
  if (against) h += `<div class="census-against">${esc(against)}</div>`;
  h += '</div>';
  return h;
}

/** Census and exposure tiles, grouped as the payload groups them. */
export function buildCensusTiles(census, group) {
  const shown = (census || []).filter((r) => !group || r.group === group);
  if (!shown.length) return '';
  return `<div class="census-row">${shown.map(statTile).join('')}</div>`;
}

/**
 * Data coverage by visit — a count against its denominator, per domain.
 * Rendered as labelled bars: the bar is redundant with the number, never a
 * replacement for it, and every row states both figures in text.
 */
export function buildCoverage(coverage) {
  if (!coverage || !coverage.length) {
    return '<p class="change-empty">No visit-level coverage in this snapshot.</p>';
  }
  const domains = [...new Set(coverage.map((r) => r.domain))];
  let h = '';
  for (const domain of domains) {
    const visitRows = coverage.filter((r) => r.domain === domain);
    h += '<div class="coverage-block">';
    h += `<h4 class="coverage-domain">${esc(domain)}</h4>`;
    h += '<table class="coverage-table"><thead><tr>';
    h += '<th scope="col">Visit</th><th scope="col">Participants with data</th>'
      + '<th scope="col" class="num">Coverage</th></tr></thead><tbody>';
    for (const r of visitRows) {
      const pct = r.expected ? Math.round((r.participants / r.expected) * 100) : 0;
      const key = pct >= 80 ? 'ontrack' : pct >= 50 ? 'amber' : 'red';
      h += '<tr>';
      h += `<th scope="row" class="coverage-visit">${esc(r.visit)}</th>`;
      h += '<td class="coverage-bar-cell">';
      h += `<span class="coverage-bar coverage-${key}" style="--pct:${pct}%" aria-hidden="true"></span>`;
      h += `<span class="coverage-count">${esc(String(r.participants))} of ${esc(String(r.expected))}</span>`;
      h += '</td>';
      h += `<td class="num coverage-pct">${pct}%</td>`;
      h += '</tr>';
    }
    h += '</tbody></table></div>';
  }
  return h;
}

/** Disposition states, largest first. */
export function buildDisposition(disposition) {
  if (!disposition || !disposition.length) {
    return '<p class="change-empty">No disposition domain in this snapshot.</p>';
  }
  const total = disposition.reduce((sum, r) => sum + r.participants, 0);
  let h = '<ul class="disp-list">';
  for (const r of disposition) {
    const pct = total ? Math.round((r.participants / total) * 100) : 0;
    h += '<li class="disp-item">';
    h += `<span class="disp-state">${esc(r.state)}</span>`;
    h += `<span class="disp-count num">${esc(String(r.participants))}</span>`;
    h += `<span class="disp-pct">${pct}%</span>`;
    h += '</li>';
  }
  h += '</ul>';
  return h;
}

/** The needs-case-review queue. */
export function buildReviewQueue(queue, o = {}) {
  if (!queue || !queue.length) {
    return '<div class="empty-state"><div class="empty-title">No participant is flagged in this snapshot</div>'
      + '<div class="empty-hint">The participant-level safety metrics ran and flagged nobody. '
      + 'Check the coverage table above before reading that as reassurance.</div></div>';
  }
  const shown = o.limit ? queue.slice(0, o.limit) : queue;
  let h = '<table class="queue-table"><thead><tr>';
  h += '<th scope="col">Participant</th><th scope="col">Findings</th>'
    + '<th scope="col" class="num">Review score</th></tr></thead><tbody>';
  for (const p of shown) {
    h += '<tr class="queue-row">';
    h += `<th scope="row" class="queue-id mono">${esc(p.id)}`;
    if (p.isNew) h += '<span class="queue-new">new</span>';
    h += '</th>';
    h += '<td class="queue-findings">';
    for (const f of p.findings) {
      h += `<div class="queue-finding queue-${esc(f.level)}">`;
      h += `<span class="flag-dot flag-${esc(f.level)}" aria-hidden="true"></span>`;
      h += `<span class="queue-metric">${esc(f.label)}</span>`;
      h += `<span class="visually-hidden">${esc(FLAG_LEVELS[f.level].label)}</span>`;
      h += `<span class="queue-level queue-level-${esc(f.level)}">${esc(FLAG_LEVELS[f.level].short)}</span>`;
      if (f.why) h += `<span class="queue-why">${esc(f.why)}</span>`;
      h += '</div>';
    }
    h += '</td>';
    h += `<td class="num queue-score">${esc(String(p.score))}</td>`;
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (queue.length > shown.length) {
    h += `<p class="change-more">${queue.length - shown.length} more flagged participants in this snapshot.</p>`;
  }
  return h;
}

/**
 * The Safety domain home.
 * @param {object} o { census, queue, cards, domain, metrics, snapshot }
 */
export function buildSafetyOverview(o = {}) {
  const c = o.census || { census: [], coverage: [], disposition: [] };
  const flagged = (o.queue || []).length;
  const reds = (o.queue || []).filter((p) => p.reds > 0).length;

  let h = '<section class="domain-view safety-view">';
  h += '<div class="domain-head">';
  h += '<div><h2 class="domain-title">Safety overview</h2>';
  h += '<p class="domain-sub">Exposure, data coverage and the participants the '
    + 'safety metrics flagged for review. '
    + '<span class="blinded-note">Pooled across treatment arms.</span></p></div>';
  h += '</div>';

  // 1. Census and exposure.
  h += sectionHead('Census and exposure', 'the denominators everything else is read against');
  h += buildCensusTiles(c.census, 'Census');
  h += buildCensusTiles(c.census, 'Exposure');

  // 2. Data coverage — deliberately above the findings.
  h += sectionHead('Data coverage by visit', 'what was collected, before what was found');
  h += '<p class="section-note">A quiet visit with low coverage is missing data, not a clean result. '
    + 'Coverage is participants with at least one record, against the enrolled population.</p>';
  h += buildCoverage(c.coverage);

  // 3. Follow-up and disposition.
  h += sectionHead('Follow-up and disposition', 'who is still being observed');
  h += buildCensusTiles(c.census, 'Follow-up');
  h += buildDisposition(c.disposition);

  // 4. The queue. The headline is the red count: a queue is a working list,
  // and the number that decides whether anyone opens it is how many
  // participants carry a red finding, not how many carry any flag at all.
  const limit = o.queueLimit || 25;
  h += sectionHead(
    'Needs case review',
    flagged
      ? `${reds} participant${reds === 1 ? '' : 's'} with a red finding, ${flagged} flagged in total`
      : 'nobody flagged in this snapshot',
  );
  h += '<p class="section-note">Ordered by review-worthiness — the summed flag weight across '
    + 'every participant-level metric — not by the single worst finding, so a participant '
    + 'amber on two organ systems outranks one amber on a single metric. '
    + 'Participants marked <span class="queue-new">new</span> were not flagged at this level in the previous snapshot.'
    + (flagged > limit
      ? ` Showing the top <span class="num">${limit}</span> of <span class="num">${flagged}</span>.`
      : '')
    + '</p>';
  h += buildReviewQueue(o.queue, { limit });

  // 5. Charts.
  const cards = o.cards || [];
  const available = cards.filter((x) => x.available).length;
  h += sectionHead(
    'Safety charts',
    cards.length ? `${available} of ${cards.length} renderers available in this snapshot` : 'none rendered',
  );
  if (cards.length) {
    h += '<div class="chart-grid">';
    h += cards.map(buildChartCard).join('');
    h += '</div>';
  } else {
    h += '<div class="empty-state"><div class="empty-title">No safety charts in this snapshot</div>'
      + '<div class="empty-hint">The chart workflows in <span class="mono">4_modules</span> produced no '
      + '<span class="mono">charts.json</span> entries.</div></div>';
  }

  h += '</section>';
  return h;
}

function sectionHead(title, kicker) {
  let h = '<div class="section-head">';
  h += `<h3 class="section-title">${esc(title)}`;
  if (kicker) h += ` <span class="section-kicker">${esc(kicker)}</span>`;
  h += '</h3></div>';
  return h;
}

/**
 * The Study Overview's safety block: the study-level baseline figures plus the
 * headline of the review queue, linking into the domain that owns them.
 */
export function buildSafetyStudyBlock(o = {}) {
  const c = o.census || { census: [], coverage: [] };
  const pick = (label) => (c.census || []).find((r) => r.label === label);
  const queue = o.queue || [];
  const reds = queue.filter((p) => p.reds > 0).length;

  // The worst coverage on the board, which is the figure a reader most needs
  // and the one a mean would hide.
  const worst = (c.coverage || [])
    .filter((r) => r.expected > 0)
    .sort((a, b) => a.participants / a.expected - b.participants / b.expected)[0];

  const tiles = [
    pick('Enrolled participants'),
    pick('Received study drug'),
    pick('Person-years on treatment'),
    pick('Deaths'),
    {
      label: 'Flagged for review',
      value: queue.length || null,
      denominator: pick('Enrolled participants')?.value ?? null,
      group: 'Safety',
    },
    {
      label: reds === 1 ? 'With a red finding' : 'With a red finding',
      value: reds,
      denominator: null,
      group: 'Safety',
    },
  ].filter(Boolean);

  let h = '<div class="census-row">';
  h += tiles.map(statTile).join('');
  h += '</div>';
  if (worst) {
    const pct = Math.round((worst.participants / worst.expected) * 100);
    h += `<p class="section-note">Lowest data coverage: <strong>${esc(worst.domain)}</strong> at `
      + `<strong>${esc(worst.visit)}</strong> — ${esc(String(worst.participants))} of `
      + `${esc(String(worst.expected))} participants (${pct}%). `
      + `<a href="${esc(buildHash('safety'))}">See coverage by visit →</a></p>`;
  }
  return h;
}

/**
 * The queue narrowed to one metric.
 *
 * Filtering the findings is not enough: a row's `reds` and `score` are summed
 * across every metric, so a page showing one metric has to recount them or it
 * reports the whole study's reds as its own.
 */
export function queueForMetric(queue, metricId) {
  const out = [];
  for (const p of queue || []) {
    const findings = (p.findings || []).filter((f) => f.metricId === metricId);
    if (!findings.length) continue;
    out.push({
      ...p,
      findings,
      reds: findings.filter((f) => f.level === 'red').length,
      score: findings.reduce(
        (sum, f) => sum + (LEVEL_WEIGHT[f.level] || 0), 0,
      ),
      isNew: findings.some((f) => f.isNew),
    });
  }
  return out.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
}

/**
 * A participant-metric page: what the metric measures, where its cut-points
 * come from, and every participant it flagged.
 *
 * The thresholds are read from the metric's own reporting-layer row rather
 * than restated here, so the page cannot drift from the workflow YAML that
 * produced the flags.
 */
export function buildMetricPage(o = {}) {
  const metric = o.metric;
  if (!metric) {
    return '<div class="empty-state"><div class="empty-title">Metric not found in this snapshot</div>'
      + `<div class="empty-hint"><a href="${esc(buildHash('safety'))}">Back to the Safety overview</a></div></div>`;
  }
  const queue = o.queue || [];
  const reds = queue.filter((p) => p.reds > 0).length;

  let h = '<section class="chart-page">';
  h += '<div class="crumbs">';
  h += `<a href="${esc(buildHash('safety'))}" class="crumb-back">← Safety overview</a>`;
  h += '</div>';
  h += '<div class="chart-head">';
  h += `<h2 class="chart-title">${esc(metric.label)}</h2>`;
  h += '<dl class="chart-meta">';
  h += metaItem('Metric', metric.id, 'mono');
  h += metaItem('Level', 'Participant');
  h += metaItem('Score', metric.numerator || 'Tier');
  h += metaItem('Thresholds', metric.threshold || '—', 'mono');
  h += metaItem('Scored', metric.scored === null ? '—' : String(metric.scored), 'num');
  h += '</dl>';
  h += '</div>';
  if (metric.description) h += `<p class="chart-desc">${esc(metric.description)}</p>`;
  h += '<p class="section-note">Pooled across treatment arms. '
    + `<span class="num">${queue.length}</span> participant${queue.length === 1 ? '' : 's'} flagged, `
    + `<span class="num">${reds}</span> red.</p>`;
  h += buildReviewQueue(queue, { limit: o.limit || 50 });
  h += '</section>';
  return h;
}

function metaItem(label, value, cls = '') {
  return `<div class="meta-item"><dt>${esc(label)}</dt>`
    + `<dd class="${cls}">${esc(String(value))}</dd></div>`;
}

/**
 * One participant metric's identity, from its reporting-layer row plus the
 * count of participants it actually scored.
 */
export function metricDetail(metricRows, resultRows, metricId) {
  const row = (metricRows || []).find((m) => String(m.ID || '') === String(metricId));
  if (!row) return null;
  const scored = (resultRows || []).filter(
    (r) => String(r.GroupLevel || '') === 'Subject'
      && String(r.MetricID || '') === String(row.MetricID || `Analysis_${row.ID}`),
  ).length;
  return {
    id: String(row.ID || ''),
    label: String(row.Metric || row.ID || '').replace(/\s*\(Subject\)\s*$/, ''),
    abbreviation: String(row.Abbreviation || ''),
    numerator: String(row.Numerator || ''),
    threshold: String(row.Threshold || ''),
    description: String(row.Description || ''),
    scored: scored || null,
  };
}
