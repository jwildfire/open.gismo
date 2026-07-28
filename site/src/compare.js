/**
 * Snapshot comparison — a client-side diff of two published snapshot trees.
 *
 * The static-files contract means there is no directory listing and no server
 * to ask, so the comparison is built from what the trees actually publish:
 *
 *   inventory  — every artifact each snapshot's status.json says a completed
 *                step wrote, plus the rendered chart HTMLs each snapshot's
 *                reports.json declares. Added / removed are exact.
 *   content    — a bounded set of CSVs is fetched from both sides and compared
 *                byte-for-byte: the four Reporting_* tables and each metric's
 *                Analysis_Summary. Everything else is reported as
 *                "not compared" rather than silently counted as unchanged.
 *   flags      — level changes per group × metric, from the two
 *                Reporting_Results tables (see flags.flagDeltas).
 *
 * Honesty rule: `changed` only ever counts artifacts whose bytes were actually
 * fetched from both snapshots. `notCompared` is surfaced in the UI next to it.
 */

/** Artifacts whose content the comparison fetches from both snapshots. */
export function isComparable(artifact) {
  if (!artifact || artifact.kind !== 'csv') return false;
  if (artifact.phase === '3_reporting') return true;
  return artifact.phase === '2_metrics' && /Analysis_Summary$/.test(artifact.output || '');
}

/**
 * Flatten a snapshot's status.json (+ optional safety reports.json) into an
 * artifact inventory.
 *
 * @param {object} status status.json payload
 * @param {object} [safetyReports] output/3_reports/reports.json payload
 * @returns {Array<{path,phase,workflow,workflowKey,output,kind}>}
 */
export function artifactInventory(status, safetyReports) {
  const out = [];
  const workflows = status && status.workflows ? status.workflows : {};
  for (const [key, wf] of Object.entries(workflows)) {
    if (!wf || !Array.isArray(wf.steps)) continue;
    for (const step of wf.steps) {
      if (step.status !== 'completed' || !step.output) continue;
      const kind = step.name === 'html_report' ? 'html' : 'csv';
      out.push({
        path: `output/${wf.phase}/${wf.workflow_id}/${step.output}.${kind}`,
        phase: wf.phase,
        workflow: wf.workflow_id,
        workflowKey: key,
        output: step.output,
        kind,
      });
    }
  }
  const reports = safetyReports && Array.isArray(safetyReports.reports) ? safetyReports.reports : [];
  for (const r of reports) {
    if (!r || !r.html) continue;
    out.push({
      path: String(r.html).replace(/^(\.?\/)+/, ''),
      phase: '3_reports',
      workflow: r.id || '',
      workflowKey: `Report_${r.id || ''}`,
      output: r.id || '',
      kind: 'html',
      title: r.title || '',
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/**
 * Set difference of two inventories, keyed by artifact path.
 * @returns {{added: Array, removed: Array, common: Array}}
 */
export function diffInventory(prevInv, currInv) {
  const prev = new Map((prevInv || []).map((a) => [a.path, a]));
  const curr = new Map((currInv || []).map((a) => [a.path, a]));
  const added = [];
  const removed = [];
  const common = [];
  for (const [path, a] of curr) {
    if (prev.has(path)) common.push(a);
    else added.push(a);
  }
  for (const [path, a] of prev) {
    if (!curr.has(path)) removed.push(a);
  }
  return { added, removed, common };
}

/** The subset of common artifacts whose bytes the comparison will fetch. */
export function comparablePaths(common) {
  return (common || []).filter(isComparable).map((a) => a.path);
}

/**
 * Compare artifact content across snapshots.
 *
 * @param {Array<object>} common common artifacts (from diffInventory)
 * @param {(path: string, side: 'prev'|'curr') => Promise<string|null>} read
 *        fetches an artifact's text for one side; null/throw = unavailable
 * @returns {Promise<Map<string,{state:'changed'|'identical'|'unavailable'}>>}
 */
export async function compareContent(common, read) {
  const results = new Map();
  const targets = (common || []).filter(isComparable);
  await Promise.all(targets.map(async (a) => {
    let prevText = null;
    let currText = null;
    try { prevText = await read(a.path, 'prev'); } catch { prevText = null; }
    try { currText = await read(a.path, 'curr'); } catch { currText = null; }
    if (prevText == null || currText == null) {
      results.set(a.path, { state: 'unavailable' });
      return;
    }
    results.set(a.path, {
      state: prevText === currText ? 'identical' : 'changed',
      rowDelta: countRows(currText) - countRows(prevText),
    });
  }));
  return results;
}

function countRows(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return Math.max(0, t.split('\n').length - 1);
}

/**
 * Roll the diff and the content comparison into the summary chips.
 * `changed` counts only artifacts actually read from both snapshots.
 */
export function summarizeCompare(diff, contentResults) {
  const results = contentResults || new Map();
  let changed = 0;
  let identical = 0;
  let unavailable = 0;
  for (const r of results.values()) {
    if (r.state === 'changed') changed += 1;
    else if (r.state === 'identical') identical += 1;
    else unavailable += 1;
  }
  const compared = changed + identical;
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    changed,
    identical,
    unavailable,
    compared,
    common: diff.common.length,
    notCompared: diff.common.length - compared,
  };
}

const PHASE_ORDER = ['0_config', '1_mappings', '2_metrics', '3_reporting', '3_reports', '4_modules'];

/**
 * Per-workflow rows for the compare table: one row per phase × workflow, with
 * the artifact-level states rolled up and an honest note.
 */
export function buildCompareRows(diff, contentResults) {
  const results = contentResults || new Map();
  const rows = new Map();
  const touch = (a) => {
    const key = `${a.phase}/${a.workflow}`;
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        phase: a.phase,
        workflow: a.workflow,
        added: 0,
        removed: 0,
        changed: 0,
        identical: 0,
        notCompared: 0,
        artifacts: [],
      });
    }
    return rows.get(key);
  };

  for (const a of diff.added) { const r = touch(a); r.added += 1; r.artifacts.push({ ...a, state: 'added' }); }
  for (const a of diff.removed) { const r = touch(a); r.removed += 1; r.artifacts.push({ ...a, state: 'removed' }); }
  for (const a of diff.common) {
    const r = touch(a);
    const res = results.get(a.path);
    if (res && res.state === 'changed') { r.changed += 1; r.artifacts.push({ ...a, state: 'changed', rowDelta: res.rowDelta }); }
    else if (res && res.state === 'identical') { r.identical += 1; r.artifacts.push({ ...a, state: 'identical' }); }
    else { r.notCompared += 1; r.artifacts.push({ ...a, state: 'not-compared' }); }
  }

  const list = [...rows.values()].map((r) => ({ ...r, status: rowStatus(r), note: rowNote(r) }));
  list.sort((a, b) => {
    const pa = PHASE_ORDER.indexOf(a.phase);
    const pb = PHASE_ORDER.indexOf(b.phase);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.workflow.localeCompare(b.workflow);
  });
  return list;
}

function rowStatus(r) {
  if (r.changed) return 'changed';
  if (r.added && !r.identical && !r.notCompared) return 'added';
  if (r.removed && !r.identical && !r.notCompared) return 'removed';
  if (r.added || r.removed) return 'changed';
  if (r.identical) return 'identical';
  return 'not-compared';
}

function rowNote(r) {
  const bits = [];
  if (r.added) bits.push(`${r.added} added`);
  if (r.removed) bits.push(`${r.removed} removed`);
  if (r.changed) bits.push(`${r.changed} changed`);
  if (r.identical) bits.push(`${r.identical} identical`);
  if (r.notCompared) bits.push(`${r.notCompared} not compared`);
  return bits.join(' · ');
}

/** Only the rows worth showing by default: anything that is not identical. */
export function changedRows(rows) {
  return (rows || []).filter((r) => r.status !== 'identical');
}
