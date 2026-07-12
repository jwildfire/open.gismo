import { PHASES } from './constants.js';
import { parseYamlMeta } from './parsers.js';

/**
 * Load the workflow index and parse YAML metadata for each workflow.
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
  const res = await fetch('status.json');
  if (!res.ok) throw new Error('No status data');
  return res.json();
}

export async function loadArtifact(artifactPath) {
  const res = await fetch(`output/${artifactPath}`);
  if (!res.ok) throw new Error(`Could not load artifact: ${artifactPath}`);
  return res.text();
}

export async function loadLog() {
  const res = await fetch('log.json');
  if (!res.ok) throw new Error('No log data');
  return res.json();
}

/**
 * Load the reports manifest written by og_run (reports.json) describing the
 * generated interactive KRI reports and static chart exports.
 * Returns { reports: [...], static_charts: [...] }.
 */
export async function loadReports() {
  const res = await fetch('output/4_modules/reports.json');
  if (!res.ok) throw new Error('No reports data');
  return res.json();
}
