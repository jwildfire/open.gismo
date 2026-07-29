import { describe, it, expect } from 'vitest';
import { loadStatus } from './data.js';

// ── loadStatus tests ─────────────────────────────────────────────────────────

describe('loadStatus', () => {
  it('fetches status.json and returns workflow status map', async () => {
    const mockStatus = {
      pipeline_status: 'completed',
      workflows: {
        Mapping_AE: {
          workflow_id: 'AE',
          workflow_type: 'Mapping',
          status: 'completed',
          steps: [{ name: 'gsm.mapping::AE_Map_Raw', output: 'Mapped_AE', status: 'completed', error: null }],
        },
      },
    };
    globalThis.fetch = async (url) => {
      if (url === 'status.json') {
        return { ok: true, json: async () => mockStatus };
      }
      return { ok: false };
    };
    const result = await loadStatus();
    expect(result).toHaveProperty('workflows');
    expect(result.workflows).toHaveProperty('Mapping_AE');
    expect(result.workflows.Mapping_AE.status).toBe('completed');
  });

  it('throws an error when status.json is not found', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    await expect(loadStatus()).rejects.toThrow();
  });
});

// Test phase grouping logic (from data.js loadWorkflows)
// The grouping assigns workflows to phases based on directory prefix
import { PHASES } from './constants.js';

function groupByPhase(yamlPaths) {
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
  return filesByPhase;
}

describe('workflow phase grouping', () => {
  it('assigns workflows to correct phases based on directory prefix', () => {
    const paths = [
      'workflows/1_mappings/AE.yaml',
      'workflows/1_mappings/DM.yaml',
      'workflows/2_metrics/kri0001.yaml',
      'workflows/3_reporting/report.yaml',
    ];
    const grouped = groupByPhase(paths);
    expect(grouped[1]).toHaveLength(2); // 1_mappings
    expect(grouped[2]).toHaveLength(1); // 2_metrics
    expect(grouped[3]).toHaveLength(1); // 3_reporting
  });

  it('assigns each workflow to exactly one phase', () => {
    const paths = [
      'workflows/0_config/setup.yaml',
      'workflows/1_mappings/AE.yaml',
      'workflows/2_metrics/kri0001.yaml',
      'workflows/4_modules/output.yaml',
    ];
    const grouped = groupByPhase(paths);
    const totalAssigned = Object.values(grouped).flat().length;
    expect(totalAssigned).toBe(paths.length);
  });

  it('handles empty path list', () => {
    expect(groupByPhase([])).toEqual({});
  });

  it('counts match the number of paths with each prefix', () => {
    const paths = [
      'workflows/2_metrics/kri0001.yaml',
      'workflows/2_metrics/kri0002.yaml',
      'workflows/2_metrics/kri0003.yaml',
    ];
    const grouped = groupByPhase(paths);
    expect(grouped[2]).toHaveLength(3);
  });
});

// ── loadSafetyCharts tests (hub#136 — the 3_reports -> 4_modules rename) ─────

import { loadSafetyCharts, SAFETY_CHART_MANIFESTS } from './data.js';

describe('loadSafetyCharts', () => {
  const MANIFEST = { reports: [{ id: 'hep_explorer', status: 'completed' }] };

  it('prefers the current path, output/4_modules/charts.json', async () => {
    const seen = [];
    globalThis.fetch = async (url) => {
      seen.push(url);
      return { ok: url.includes('4_modules/charts.json'), json: async () => MANIFEST };
    };
    expect(await loadSafetyCharts()).toEqual(MANIFEST);
    // The legacy path is never requested when the current one answers.
    expect(seen).toEqual(['output/4_modules/charts.json']);
  });

  it('falls back to output/3_reports/reports.json for pre-rename snapshots', async () => {
    globalThis.fetch = async (url) => ({
      ok: url.includes('3_reports/reports.json'),
      json: async () => MANIFEST,
    });
    expect(await loadSafetyCharts()).toEqual(MANIFEST);
  });

  it('keeps looking when an earlier path throws rather than 404s', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('4_modules')) throw new TypeError('network');
      return { ok: true, json: async () => MANIFEST };
    };
    expect(await loadSafetyCharts()).toEqual(MANIFEST);
  });

  it('throws when no manifest path answers', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    await expect(loadSafetyCharts()).rejects.toThrow('No safety chart data');
  });

  it('lists the manifest paths newest first', () => {
    expect(SAFETY_CHART_MANIFESTS[0]).toContain('4_modules');
    expect(SAFETY_CHART_MANIFESTS.at(-1)).toContain('3_reports');
  });
});
