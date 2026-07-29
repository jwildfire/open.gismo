/**
 * The gsm.kri group overview table.
 *
 * This is the *real* `groupOverview` widget from the `gsm.viz` JavaScript
 * library — the same table a `gsm.kri` report renders — vendored under
 * `vendor/gsm.viz/` (see its PROVENANCE.md) and fed straight from the
 * snapshot's reporting layer. Nothing here re-implements the table; this module
 * is only the adapter between two data contracts.
 *
 * What the widget wants (all field names case-sensitive):
 *
 *   results        one row per GroupID × MetricID, with GroupLevel, Numerator,
 *                  Denominator, Metric, Score, Flag, MetricID, SnapshotDate,
 *                  StudyID — plus an optional per-row `Weight` shown in the
 *                  risk-score tooltip
 *   groupMetadata  long format: GroupLevel / GroupID / Param / Value
 *   metricMetadata one row per metric *column*: MetricID / Abbreviation /
 *                  Metric — the column set and its order come from here, not
 *                  from `results`
 *
 * What `output/3_reporting/` publishes is already that shape: Reporting_Results
 * carries exactly the ten required columns, Reporting_Groups is already the
 * long Param/Value format, and Reporting_Metrics has MetricID / Abbreviation /
 * Metric. The adaptation left to do is small and explicit:
 *
 *   1. restrict every table to one group level (Site or Country);
 *   2. hold the risk-score metric out of the *column* set while keeping its
 *      rows in `results`, which is what makes the Risk Score column appear;
 *   3. transpose Reporting_Metrics' parallel `Flag` / `RiskScoreWeight` comma
 *      vectors into a per-flag weight each result row can carry;
 *   4. pin one SnapshotDate, since the widget renders a single point in time.
 */

import groupOverview from './vendor/gsm.viz/groupOverview.js';

/** The gsm.kri site risk score — a metric in the data, a column in the table. */
export const RISK_SCORE_METRIC_ID = 'Analysis_srs0001';

/** Group metadata param used to label a row, per group level. */
export const GROUP_LABEL_KEY = { Site: 'InvestigatorLastName', Country: null, Study: 'nickname' };

/** Rows of one group level, copied into plain objects. */
function levelRows(rows, groupLevel) {
  if (!Array.isArray(rows)) return [];
  // parseCsv yields null-prototype rows; d3 and the widget are happier with
  // ordinary objects, and the copy keeps the cached bundle immutable.
  return rows.filter((r) => r && String(r.GroupLevel || '') === groupLevel).map((r) => ({ ...r }));
}

/**
 * The group levels that can be tabulated in this snapshot: a level qualifies
 * when it has both metric definitions and result rows, ordered Site first.
 */
export function availableLevels(reporting) {
  const order = ['Site', 'Country', 'Study'];
  const metricLevels = new Set((reporting?.metrics || []).map((m) => String(m.GroupLevel || '')));
  const resultLevels = new Set((reporting?.results || []).map((r) => String(r.GroupLevel || '')));
  // A group overview needs groups: the reporting layer has to describe the
  // entities as well as score them. Participant-level metrics (GroupLevel
  // "Subject") produce results but no Reporting_Groups rows — they are a
  // case-review queue on the Safety page, not a row in the KRI monitor — so
  // requiring group metadata keeps them out of this selector rather than
  // offering a level that would render an empty table.
  const groupLevels = new Set((reporting?.groups || []).map((g) => String(g.GroupLevel || '')));
  const found = [...metricLevels].filter(
    (l) => l && resultLevels.has(l) && groupLevels.has(l),
  );
  return found.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });
}

/**
 * Per-flag risk-score weights.
 *
 * Reporting_Metrics stores two parallel comma vectors — `Flag` "-2,-1,0,1,2"
 * against `RiskScoreWeight` "32,16,0,1,2" — meaning "a -2 flag on this metric
 * contributes 32 to the site risk score". Transposing them gives the lookup
 * each result row needs to explain its own contribution in the tooltip.
 *
 * @returns {Map<string, number>} `${MetricID}|${flag}` → weight
 */
export function weightIndex(metricRows) {
  const out = new Map();
  if (!Array.isArray(metricRows)) return out;
  for (const m of metricRows) {
    const flags = String(m?.Flag ?? '').split(',');
    const weights = String(m?.RiskScoreWeight ?? '').split(',');
    if (flags.length !== weights.length) continue;
    flags.forEach((flag, i) => {
      const w = Number(weights[i]);
      if (!Number.isFinite(w)) return;
      out.set(`${m.MetricID}|${String(flag).trim()}`, w);
    });
  }
  return out;
}

/** The newest SnapshotDate present, or null when the column is absent. */
export function latestSnapshotDate(rows) {
  let latest = null;
  for (const r of rows || []) {
    const d = String(r?.SnapshotDate || '').trim();
    if (!d) continue;
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}

/**
 * Shape the reporting layer into the widget's four arguments.
 *
 * @param {object} reporting { results, metrics, groups } from loadReportingLayer
 * @param {object} [opts] { groupLevel, riskScoreMetricId }
 * @returns {{groupLevel, results, groupMetadata, metricMetadata, config,
 *            metricIds, groupCount, snapshotDate}}
 */
export function groupOverviewInputs(reporting, opts = {}) {
  const groupLevel = opts.groupLevel || 'Site';
  const riskScoreId = opts.riskScoreMetricId || RISK_SCORE_METRIC_ID;

  // Columns come from metricMetadata; the risk score is rendered as its own
  // column by the widget, so it must not also appear as a metric column.
  const metricMetadata = levelRows(reporting?.metrics, groupLevel)
    .filter((m) => m.MetricID && m.MetricID !== riskScoreId);
  const metricIds = new Set(metricMetadata.map((m) => m.MetricID));

  const weights = weightIndex(levelRows(reporting?.metrics, groupLevel));
  let results = levelRows(reporting?.results, groupLevel)
    .filter((r) => metricIds.has(r.MetricID) || r.MetricID === riskScoreId);

  // One point in time: the widget has no notion of history, and the snapshot
  // tree is the axis the app already moves along.
  const snapshotDate = latestSnapshotDate(results);
  if (snapshotDate) results = results.filter((r) => String(r.SnapshotDate || '') === snapshotDate);

  for (const r of results) {
    r.GroupID = String(r.GroupID);          // the row sort calls localeCompare
    const w = weights.get(`${r.MetricID}|${String(r.Flag).trim()}`);
    if (w !== undefined) r.Weight = w;
  }

  // Long format, passed whole — the widget filters it by config.GroupLevel and
  // warns (then throws) if the level is absent, so guard that here instead.
  const groupMetadata = (reporting?.groups || [])
    .filter((g) => g && g.GroupID && g.Param !== undefined)
    .map((g) => ({ ...g }));

  const config = {
    GroupLevel: groupLevel,
    groupLabelKey: GROUP_LABEL_KEY[groupLevel] ?? null,
    groupParticipantCountKey: 'ParticipantCount',
    SiteRiskScoreMetricID: riskScoreId,
  };

  return {
    groupLevel,
    results,
    groupMetadata,
    metricMetadata,
    config,
    metricIds: [...metricIds],
    groupCount: new Set(results.map((r) => r.GroupID)).size,
    snapshotDate,
  };
}

/**
 * Whether these inputs can actually render: the widget throws rather than
 * degrades when a piece is missing, so the caller checks first and shows an
 * empty state instead.
 */
export function canRender(inputs) {
  if (!inputs) return false;
  if (!inputs.results.length || !inputs.metricMetadata.length) return false;
  return inputs.groupMetadata.some((g) => String(g.GroupLevel || '') === inputs.groupLevel);
}

/**
 * Mount the widget into `el`.
 *
 * `groupOverview` *appends* its table and re-registers a body-level tooltip on
 * every call, so the mount point is emptied and any orphaned tooltip removed
 * first — this runs again on every snapshot switch.
 *
 * @param {HTMLElement} el mount point
 * @param {object} inputs from groupOverviewInputs
 * @param {object} [handlers] { groupClickCallback, metricClickCallback }
 * @returns {{ok:boolean, table?:object, error?:Error}}
 */
export function mountGroupOverview(el, inputs, handlers = {}) {
  if (!el) return { ok: false, error: new Error('No mount point') };
  el.innerHTML = '';
  document.querySelectorAll('body > .custom-tooltip').forEach((n) => n.remove());
  if (!canRender(inputs)) return { ok: false };
  try {
    const table = groupOverview(
      el,
      inputs.results,
      { ...inputs.config, ...handlers },
      inputs.groupMetadata,
      inputs.metricMetadata,
    );
    return { ok: true, table };
  } catch (error) {
    return { ok: false, error };
  }
}
