import { PHASES } from './constants.js';
import { parseYamlMeta, parseCsv } from './parsers.js';
import { withBase } from './context.js';
import { parseStudyConfig, defaultStudyConfig } from './yaml.js';

/**
 * Fetch layer over the published snapshot tree.
 *
 * Two address spaces (see context.js):
 *   study-level    — `_index.json`, `workflows/…`, `config/…`, `snapshots.json`;
 *                    always read from the tree root
 *   snapshot-level — `status.json`, `manifest.csv`, `output/…`;
 *                    read through withBase(), so the timeline dot re-points them
 */

/**
 * Load the workflow index and parse YAML metadata for each workflow.
 * Workflow definitions are study-level: they live at the root, not in ps-NNN/.
 * Returns { [phaseIdx]: meta[] }
 */
export async function loadWorkflows() {
  const indexRes = await fetch('_index.json');
  if (!indexRes.ok) throw new Error('No _index.json found');
  const yamlPaths = await indexRes.json();

  const filesByPhase = {};
  yamlPaths.forEach(p => {
    const rel = p.replace('workflows/', '');
    for (const phase of PHASES) {
      if (rel.startsWith(phase.prefix)) {
        (filesByPhase[phase.idx] = filesByPhase[phase.idx] || []).push(p);
        break;
      }
    }
  });

  const phases = {};
  for (const idx of Object.keys(filesByPhase).map(Number).sort()) {
    const paths = filesByPhase[idx];
    const contents = await Promise.all(
      paths.map(p => fetch(p).then(r => r.text()))
    );
    phases[idx] = contents.map((text, i) => {
      const meta = parseYamlMeta(text);
      meta._stem = paths[i].split('/').pop().replace('.yaml', '');
      meta._path = paths[i];
      return meta;
    });
  }
  return phases;
}

export async function loadWorkflowYaml(yamlPath) {
  const res = await fetch(yamlPath);
  if (!res.ok) throw new Error(`Could not load ${yamlPath}`);
  return res.text();
}

export async function loadStatus() {
  const res = await fetch(withBase('status.json'));
  if (!res.ok) throw new Error('No status data');
  return res.json();
}

export async function loadArtifact(artifactPath) {
  const res = await fetch(withBase(`output/${artifactPath}`));
  if (!res.ok) throw new Error(`Could not load artifact: ${artifactPath}`);
  return res.text();
}

export async function loadLog() {
  const res = await fetch(withBase('log.json'));
  if (!res.ok) throw new Error('No log data');
  return res.json();
}

/**
 * Load the reports manifest written by og_run (reports.json) describing the
 * generated interactive KRI reports and static chart exports.
 * Returns { reports: [...], static_charts: [...] }.
 */
export async function loadReports() {
  const res = await fetch(withBase('output/4_modules/reports.json'));
  if (!res.ok) throw new Error('No reports data');
  return res.json();
}

/**
 * Paths the safety domain's rendered chart manifest has lived at, newest first.
 *
 * The safety chart workflows moved from a `3_reports` phase directory into the
 * standard `4_modules` (hub#136), and their manifest moved with them — to
 * `charts.json`, beside og_run's own `reports.json` rather than on top of it.
 * Snapshots are immutable once published, so trees written before that rename
 * still carry the old path and have to keep rendering.
 */
export const SAFETY_CHART_MANIFESTS = [
  'output/4_modules/charts.json',
  'output/3_reports/reports.json',
];

/** The safety domain's rendered chart manifest, from whichever path exists. */
export async function loadSafetyCharts(snapshotId) {
  for (const path of SAFETY_CHART_MANIFESTS) {
    try {
      const res = await fetch(withBase(path, snapshotId));
      if (res.ok) return res.json();
    } catch { /* try the next path */ }
  }
  throw new Error('No safety chart data');
}

/** @deprecated Use {@link loadSafetyCharts}; kept for the current-tree caller. */
export const loadSafetyReports = loadSafetyCharts;

/** The published snapshot index — study-level, always at the root. */
export async function loadSnapshots() {
  const res = await fetch('snapshots.json');
  if (!res.ok) throw new Error('No snapshots.json');
  const data = await res.json();
  return Array.isArray(data?.snapshots) ? data.snapshots : [];
}

/**
 * Study identity + domain registry. Falls back to the two launch domains so a
 * missing or unreadable config never blanks the app.
 */
export async function loadStudyConfig() {
  try {
    const res = await fetch('config/study-config.yaml');
    if (!res.ok) return defaultStudyConfig();
    const cfg = parseStudyConfig(await res.text());
    return cfg.domains.length ? cfg : { ...cfg, domains: defaultStudyConfig().domains };
  } catch {
    return defaultStudyConfig();
  }
}

/** The package manifest for the current snapshot. */
export async function loadManifest() {
  const res = await fetch(withBase('manifest.csv'));
  if (!res.ok) throw new Error('No manifest.csv');
  return parseCsv(await res.text());
}

/** A snapshot-scoped CSV, parsed. */
export async function loadCsv(path, snapshotId) {
  const res = await fetch(withBase(path, snapshotId));
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return parseCsv(await res.text());
}

/** A snapshot-scoped file as raw text — used by the byte-level snapshot diff. */
export async function loadText(path, snapshotId) {
  const res = await fetch(withBase(path, snapshotId));
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.text();
}

/** A snapshot-scoped JSON file (status.json / reports.json for either side). */
export async function loadJson(path, snapshotId) {
  const res = await fetch(withBase(path, snapshotId));
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

/** The reporting layer the RBQM monitor and the overview run on. */
export async function loadReportingLayer(snapshotId) {
  const [results, metrics, groups] = await Promise.all([
    loadCsv('output/3_reporting/Results/Reporting_Results.csv', snapshotId).catch(() => []),
    loadCsv('output/3_reporting/Metrics/Reporting_Metrics.csv', snapshotId).catch(() => []),
    loadCsv('output/3_reporting/Groups/Reporting_Groups.csv', snapshotId).catch(() => []),
  ]);
  return { results, metrics, groups };
}
