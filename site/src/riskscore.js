/**
 * Sites needing attention — the site risk score, with its denominator.
 *
 * The ranked list is the thing a monitor asks for, and the thing the statistics
 * literature warns about: with most sites scoring zero and a long tail of
 * two- and three-participant sites, a plain league table puts a site with no
 * evidence at the top of the page. Three things keep this table honest:
 *
 *   1. **The denominator is beside every score, always.** The score is a
 *      weighted flag sum over the maximum weight available, and that maximum
 *      moves silently — a KRI whose rows are all unevaluated is dropped by
 *      `gsm.kri::CalculateRiskScore()`'s weight join and vanishes from the
 *      denominator entirely. A score whose denominator moves without saying so
 *      is not auditable, so it is printed.
 *   2. **Low-precision sites are dimmed, not ranked.** They stay on the page —
 *      hiding them would be its own distortion — but below the ranked rows and
 *      marked, because at that denominator the score cannot separate signal
 *      from arithmetic. The floor is an engineering judgment, stated on the
 *      page: no guidance sets a minimum cell size.
 *   3. **The contributing flags and their weights are on the score.** Hovering
 *      a score shows what built it, so the number can be taken apart.
 */

import { esc } from './utils.js';
import { classifyFlag, FLAG_LEVELS, groupLabel } from './flags.js';
import { RISK_SCORE_METRIC_ID, weightIndex } from './kritable.js';
import { classifyChange, changeChip } from './change.js';

/**
 * The participant count below which a site is shown but not ranked.
 *
 * Five is the median site size in a study of this shape, and no regulatory
 * guidance sets a numeric minimum for a site-level cell — so this is a stated
 * choice rather than a citation, and the page says so.
 */
export const PRECISION_FLOOR = 5;

/**
 * The risk score is a weighted sum of flags: more is worse, by construction,
 * whatever any individual KRI's threshold vector says about its own direction.
 */
export const RISK_SCORE_BAD_DIRECTION = 'up';

/**
 * A change smaller than this is reported as no meaningful change.
 *
 * One point of the score is roughly two of the lightest flag transitions in
 * the model — below that, the movement is a site gaining or losing a single
 * marginal cell, which is not what a reviewer came to read. The exact delta
 * stays on the chip's title either way.
 */
export const SCORE_NOISE = 1.0;

/** Numeric coercion that treats "NA" and "" as absent rather than zero. */
function num(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === 'NA') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build one row per scored site.
 *
 * @param {object} reporting { results, metrics, groups }
 * @param {object} [opts] { groupLevel, riskScoreMetricId, floor }
 * @returns {Array<object>} rows, ranked
 */
export function riskScoreRows(reporting, opts = {}) {
  const groupLevel = opts.groupLevel || 'Site';
  const riskId = opts.riskScoreMetricId || RISK_SCORE_METRIC_ID;
  const floor = opts.floor ?? PRECISION_FLOOR;

  const results = (reporting?.results || []).filter(
    (r) => String(r.GroupLevel || '') === groupLevel,
  );
  const metrics = new Map(
    (reporting?.metrics || [])
      .filter((m) => String(m.GroupLevel || '') === groupLevel && m.MetricID)
      .map((m) => [m.MetricID, m]),
  );
  const weights = weightIndex([...metrics.values()]);

  const meta = new Map();
  for (const g of reporting?.groups || []) {
    if (String(g.GroupLevel || '') !== groupLevel || !g.GroupID) continue;
    if (!meta.has(g.GroupID)) meta.set(g.GroupID, {});
    meta.get(g.GroupID)[g.Param] = g.Value;
  }

  // Everything a site contributes, keyed by site: the score row, and the
  // flagged metric cells that built it.
  const bySite = new Map();
  for (const r of results) {
    const id = String(r.GroupID);
    if (!bySite.has(id)) bySite.set(id, { scoreRow: null, cells: [] });
    if (r.MetricID === riskId) bySite.get(id).scoreRow = r;
    else bySite.get(id).cells.push(r);
  }

  const rows = [];
  for (const [id, { scoreRow, cells }] of bySite) {
    if (!scoreRow) continue;
    const score = num(scoreRow.Metric);
    if (score === null) continue;
    const groupMeta = meta.get(id) || {};
    const n = num(groupMeta.ParticipantCount) ?? 0;

    const drivers = cells
      .map((c) => {
        const level = classifyFlag(c.Flag);
        if (level !== 'red' && level !== 'amber') return null;
        const m = metrics.get(c.MetricID);
        return {
          metricId: c.MetricID,
          abbreviation: m?.Abbreviation || c.MetricID,
          name: m?.Metric || m?.Abbreviation || c.MetricID,
          flag: num(c.Flag),
          level,
          weight: weights.get(`${c.MetricID}|${String(c.Flag).trim()}`) ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)
        || FLAG_LEVELS[b.level].rank - FLAG_LEVELS[a.level].rank);

    rows.push({
      id,
      label: groupLabel(id, groupMeta),
      n,
      score,
      // Numerator/Denominator on the risk-score row are the weight sum and the
      // maximum weight available — the denominator the tooltip has to name.
      weight: num(scoreRow.Numerator),
      maxWeight: num(scoreRow.Denominator),
      // CalculateChange writes these when the reporting phase was given a
      // longitudinal input; absent on a study's first snapshot.
      change: num(scoreRow.Metric_Change),
      previous: num(scoreRow.Metric_Previous),
      previousDate: scoreRow.SnapshotDate_Previous || null,
      drivers,
      lowPrecision: n < floor,
    });
  }

  // Ranked by score; low-precision sites sort after the ranked ones however
  // high they score, which is the whole point of not ranking them.
  rows.sort((a, b) => Number(a.lowPrecision) - Number(b.lowPrecision)
    || b.score - a.score
    || b.n - a.n
    || String(a.id).localeCompare(String(b.id)));
  return rows;
}

/** The rows the funnel plots: every scored site, precision and all. */
export function funnelPoints(rows) {
  return (rows || []).map((r) => ({
    id: r.id,
    label: r.label,
    n: r.n,
    score: r.score,
    numerator: r.weight ?? 0,
    denominator: r.maxWeight ?? 0,
  }));
}

/** "33 of 178 possible" — the sentence the score is short for. */
export function denominatorNote(row) {
  if (row.weight === null || row.maxWeight === null) return '';
  return `${row.weight} of ${row.maxWeight} possible`;
}

/** What built this score, for the score cell's title. */
export function scoreTitle(row) {
  const parts = [`${row.score.toFixed(1)} = ${denominatorNote(row) || 'no weight recorded'}`];
  if (row.drivers.length) {
    parts.push(...row.drivers.map((d) => {
      const weight = d.weight === null ? 'weight not recorded' : `weight ${d.weight}`;
      return `${d.abbreviation} · ${FLAG_LEVELS[d.level].short} (flag ${d.flag}) · ${weight}`;
    }));
  } else {
    parts.push('No flagged metrics at this site.');
  }
  if (row.lowPrecision) {
    parts.push(`Only ${row.n} participants — below the precision floor of ${PRECISION_FLOOR}, so this site is not ranked.`);
  }
  return parts.join('\n');
}

/** The driver abbreviations, red before amber, heaviest first. */
export function buildDrivers(row) {
  if (!row.drivers.length) return '<span class="muted">—</span>';
  return row.drivers
    .slice(0, 4)
    .map((d) => `<span class="driver driver-${esc(d.level)}" title="${esc(`${d.name} — ${FLAG_LEVELS[d.level].label}`)}">${esc(d.abbreviation)}</span>`)
    .join(' ')
    + (row.drivers.length > 4 ? `<span class="driver-more">+${row.drivers.length - 4}</span>` : '');
}

/**
 * The table.
 *
 * @param {Array<object>} rows from riskScoreRows
 * @param {object} [opts] { limit, previousLabel, hasHistory }
 */
export function buildRiskScoreTable(rows, opts = {}) {
  const limit = opts.limit ?? 10;
  const shown = (rows || []).filter((r) => r.score > 0).slice(0, limit);
  const hasHistory = opts.hasHistory ?? shown.some((r) => r.change !== null);
  const sinceLabel = opts.previousLabel ? `Since ${opts.previousLabel}` : 'Since last snapshot';

  if (!shown.length) {
    return '<div class="empty-state"><div class="empty-title">No site scored above zero at this snapshot</div>'
      + '<div class="empty-hint">Every site is on track on every evaluated metric.</div></div>';
  }

  let h = '<div class="table-scroll"><table class="risk-table">';
  h += '<thead><tr>';
  h += '<th scope="col">Site</th>';
  h += '<th scope="col" class="num-col">N</th>';
  h += '<th scope="col" class="num-col">Score</th>';
  if (hasHistory) h += `<th scope="col">${esc(sinceLabel)}</th>`;
  h += '<th scope="col">Drivers</th>';
  h += '</tr></thead><tbody>';

  for (const row of shown) {
    h += `<tr class="risk-row${row.lowPrecision ? ' is-low-precision' : ''}" data-site="${esc(row.id)}">`;
    h += `<th scope="row" class="risk-site">${esc(row.label)}</th>`;
    h += `<td class="num-col num">${esc(String(row.n))}</td>`;
    h += `<td class="num-col risk-score" title="${esc(scoreTitle(row))}">`
      + `<span class="risk-score-value num">${esc(row.score.toFixed(1))}</span>`
      + `<span class="risk-score-denom mono">${esc(denominatorNote(row))}</span></td>`;
    if (hasHistory) {
      h += '<td class="risk-change">';
      if (row.lowPrecision) {
        h += '<span class="muted">low precision</span>';
      } else if (row.change === null) {
        h += '<span class="muted">new this snapshot</span>';
      } else {
        h += changeChip(classifyChange(row.change, {
          badDirection: RISK_SCORE_BAD_DIRECTION,
          noise: SCORE_NOISE,
        }));
      }
      h += '</td>';
    }
    h += `<td class="risk-drivers">${buildDrivers(row)}</td>`;
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}
