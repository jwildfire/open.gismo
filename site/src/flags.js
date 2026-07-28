/**
 * Flag derivation over the gsm reporting layer.
 *
 * Source of truth is `output/3_reporting/Results/Reporting_Results.csv`
 * (long format: one row per GroupID × MetricID) with metric labels from
 * `Reporting_Metrics.csv` and group metadata from `Reporting_Groups.csv`
 * (long format: GroupID / Param / Value).
 *
 * Flag semantics (gsm.core Flag_* steps): an integer in -2..2 where the
 * magnitude is the severity and the sign is the direction against the metric's
 * threshold vector. |2| is a red flag, |1| an amber flag, 0 is on track, and a
 * blank/NA flag means the group was not evaluated at this snapshot (typically
 * below the metric's accrual threshold). Colour is never the only carrier —
 * every derived level ships with a `label` used in text and aria-labels.
 */

/**
 * `rank` orders levels for roll-up ("what is this group's worst cell?"), where
 * an evaluated on-track cell outranks an unevaluated one. `severity` is the
 * separate scale used to judge whether a change is better or worse: not
 * evaluated and on track are equally un-alarming, so a cell that becomes
 * evaluated and lands on track is a change, not a deterioration.
 */
export const FLAG_LEVELS = {
  red: { key: 'red', label: 'Red flag', short: 'Red', rank: 3, severity: 2 },
  amber: { key: 'amber', label: 'Amber flag', short: 'Amber', rank: 2, severity: 1 },
  ontrack: { key: 'ontrack', label: 'On track', short: 'On track', rank: 1, severity: 0 },
  none: { key: 'none', label: 'Not evaluated', short: 'n/a', rank: 0, severity: 0 },
};

/**
 * Classify a raw Flag cell into a level key.
 * @param {string|number} value
 * @returns {'red'|'amber'|'ontrack'|'none'}
 */
export function classifyFlag(value) {
  if (value === null || value === undefined) return 'none';
  const raw = String(value).trim();
  if (raw === '' || raw.toUpperCase() === 'NA' || raw.toUpperCase() === 'NAN') return 'none';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'none';
  const mag = Math.abs(n);
  if (mag >= 2) return 'red';
  if (mag >= 1) return 'amber';
  return 'ontrack';
}

/** Human label for a raw flag value, e.g. "Red flag (high)". */
export function flagLabel(value) {
  const level = classifyFlag(value);
  if (level === 'none') return FLAG_LEVELS.none.label;
  if (level === 'ontrack') return FLAG_LEVELS.ontrack.label;
  const n = Number(value);
  const dir = n > 0 ? 'high' : 'low';
  return `${FLAG_LEVELS[level].label} (${dir})`;
}

/** Rows of Reporting_Results.csv restricted to one group level. */
export function rowsForLevel(rows, groupLevel = 'Site') {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => String(r.GroupLevel || '') === groupLevel);
}

/**
 * Count group × metric cells by level, plus the distinct groups carrying at
 * least one red / amber flag (the number the Overview tiles headline).
 *
 * @param {Array<object>} rows Reporting_Results rows
 * @param {string} groupLevel  'Site' | 'Country' | 'Study'
 */
export function summarizeFlags(rows, groupLevel = 'Site') {
  const scoped = rowsForLevel(rows, groupLevel);
  const counts = { red: 0, amber: 0, ontrack: 0, none: 0 };
  const groupWorst = new Map();
  const groups = new Set();
  const metrics = new Set();

  for (const r of scoped) {
    const level = classifyFlag(r.Flag);
    counts[level] += 1;
    groups.add(r.GroupID);
    if (r.MetricID) metrics.add(r.MetricID);
    const rank = FLAG_LEVELS[level].rank;
    if (!groupWorst.has(r.GroupID) || rank > groupWorst.get(r.GroupID)) {
      groupWorst.set(r.GroupID, rank);
    }
  }

  let redGroups = 0;
  let amberGroups = 0;
  let clearGroups = 0;
  for (const rank of groupWorst.values()) {
    if (rank === FLAG_LEVELS.red.rank) redGroups += 1;
    else if (rank === FLAG_LEVELS.amber.rank) amberGroups += 1;
    else clearGroups += 1;
  }

  return {
    groupLevel,
    counts,
    red: counts.red,
    amber: counts.amber,
    onTrack: counts.ontrack,
    notEvaluated: counts.none,
    redGroups,
    amberGroups,
    clearGroups,
    groupCount: groups.size,
    metricCount: metrics.size,
    cellCount: scoped.length,
  };
}

/** MetricID → {id, abbreviation, name, groupLevel, threshold} from Reporting_Metrics.csv. */
export function metricIndex(metricRows) {
  const out = new Map();
  if (!Array.isArray(metricRows)) return out;
  for (const r of metricRows) {
    const id = r.MetricID || (r.ID ? `Analysis_${r.ID}` : '');
    if (!id) continue;
    out.set(id, {
      id,
      workflowId: r.ID || '',
      abbreviation: r.Abbreviation || r.ID || id,
      name: r.Metric || r.Abbreviation || id,
      groupLevel: r.GroupLevel || '',
      threshold: r.Threshold || '',
      priority: r.Priority || '',
    });
  }
  return out;
}

/** GroupID → {param: value} from the long-format Reporting_Groups.csv. */
export function groupIndex(groupRows, groupLevel = null) {
  const out = new Map();
  if (!Array.isArray(groupRows)) return out;
  for (const r of groupRows) {
    if (groupLevel && String(r.GroupLevel || '') !== groupLevel) continue;
    if (!r.GroupID) continue;
    if (!out.has(r.GroupID)) out.set(r.GroupID, {});
    out.get(r.GroupID)[r.Param] = r.Value;
  }
  return out;
}

/** A display name for a group: investigator site label, else the raw id. */
export function groupLabel(id, meta) {
  if (!meta) return String(id);
  const last = meta.InvestigatorLastName;
  const city = meta.City;
  if (last && city) return `${id} · ${last}, ${city}`;
  if (last) return `${id} · ${last}`;
  return String(id);
}

/**
 * Build the group × metric matrix.
 *
 * Groups are ordered worst-first (red before amber before clear, then by red
 * count, then id) so the matrix leads with what needs attention.
 *
 * @param {Array<object>} rows Reporting_Results rows
 * @param {object} opts { groupLevel, metrics: Map, flaggedOnly: boolean }
 */
export function buildMatrix(rows, opts = {}) {
  const groupLevel = opts.groupLevel || 'Site';
  const flaggedOnly = opts.flaggedOnly !== false;
  const scoped = rowsForLevel(rows, groupLevel);

  const metricIds = [];
  const cells = new Map(); // groupId -> Map(metricId -> {flag, level, score, metric})
  for (const r of scoped) {
    if (r.MetricID && !metricIds.includes(r.MetricID)) metricIds.push(r.MetricID);
    if (!cells.has(r.GroupID)) cells.set(r.GroupID, new Map());
    cells.get(r.GroupID).set(r.MetricID, {
      flag: r.Flag,
      level: classifyFlag(r.Flag),
      score: r.Score,
      metric: r.Metric,
      numerator: r.Numerator,
      denominator: r.Denominator,
    });
  }
  metricIds.sort();

  const groups = [...cells.keys()].map((id) => {
    const row = cells.get(id);
    let red = 0;
    let amber = 0;
    for (const cell of row.values()) {
      if (cell.level === 'red') red += 1;
      else if (cell.level === 'amber') amber += 1;
    }
    return { id, red, amber, worst: red ? 3 : amber ? 2 : 1 };
  });

  groups.sort((a, b) =>
    b.worst - a.worst || b.red - a.red || b.amber - a.amber || String(a.id).localeCompare(String(b.id)));

  const visible = flaggedOnly ? groups.filter((g) => g.red || g.amber) : groups;

  return {
    groupLevel,
    metricIds,
    groups: visible,
    allGroupCount: groups.length,
    flaggedGroupCount: groups.filter((g) => g.red || g.amber).length,
    cell: (groupId, metricId) => cells.get(groupId)?.get(metricId) || null,
  };
}

/**
 * Flag changes between two snapshots' Reporting_Results rows.
 *
 * Only cells whose level changed are reported (a score wobble inside the same
 * level is not a change worth a line). Cells present on one side only are
 * reported as added/removed.
 *
 * @returns {Array<{groupId, metricId, from, to, fromLevel, toLevel, kind, direction}>}
 */
/**
 * Better / worse / same for a level transition, on the severity scale — so
 * "not evaluated → on track" reads as a change, not a deterioration.
 */
export function direction(fromLevel, toLevel) {
  const d = FLAG_LEVELS[toLevel].severity - FLAG_LEVELS[fromLevel].severity;
  return d > 0 ? 'worse' : d < 0 ? 'better' : 'same';
}

export function flagDeltas(prevRows, currRows, groupLevel = 'Site') {
  const key = (r) => `${r.GroupID} ${r.MetricID}`;
  const prev = new Map(rowsForLevel(prevRows, groupLevel).map((r) => [key(r), r]));
  const curr = new Map(rowsForLevel(currRows, groupLevel).map((r) => [key(r), r]));
  const out = [];

  for (const [k, r] of curr) {
    const p = prev.get(k);
    const toLevel = classifyFlag(r.Flag);
    if (!p) {
      if (toLevel !== 'none') {
        out.push({
          groupId: r.GroupID, metricId: r.MetricID, from: null, to: r.Flag,
          fromLevel: 'none', toLevel, kind: 'added',
          direction: direction('none', toLevel),
        });
      }
      continue;
    }
    const fromLevel = classifyFlag(p.Flag);
    if (fromLevel === toLevel) continue;
    out.push({
      groupId: r.GroupID,
      metricId: r.MetricID,
      from: p.Flag,
      to: r.Flag,
      fromLevel,
      toLevel,
      kind: 'changed',
      direction: direction(fromLevel, toLevel),
    });
  }

  for (const [k, p] of prev) {
    if (curr.has(k)) continue;
    const fromLevel = classifyFlag(p.Flag);
    if (fromLevel === 'none') continue;
    out.push({
      groupId: p.GroupID, metricId: p.MetricID, from: p.Flag, to: null,
      fromLevel, toLevel: 'none', kind: 'removed', direction: direction(fromLevel, 'none'),
    });
  }

  const sev = { worse: 0, better: 1, same: 2 };
  out.sort((a, b) =>
    sev[a.direction] - sev[b.direction] ||
    FLAG_LEVELS[b.toLevel].rank - FLAG_LEVELS[a.toLevel].rank ||
    String(a.groupId).localeCompare(String(b.groupId)));
  return out;
}

/** Study-level facts from Reporting_Groups (participant/site counts). */
export function studyFacts(groupRows) {
  const idx = groupIndex(groupRows, 'Study');
  const first = idx.values().next();
  const params = first.done ? {} : first.value;
  return {
    studyId: [...idx.keys()][0] || '',
    participants: params.ParticipantCount || '',
    participantTarget: params.ParticipantTarget || params.num_plan_subj || '',
    sites: params.SiteCount || '',
    siteTarget: params.SiteTarget || params.num_plan_site || '',
    phase: params.phase || '',
    status: params.status || '',
    nickname: params.nickname || '',
    indication: params.protocol_indication || '',
    therapeuticArea: params.therapeutic_area || '',
  };
}
