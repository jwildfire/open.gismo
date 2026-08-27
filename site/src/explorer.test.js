import { describe, it, expect, beforeEach } from 'vitest';
import { extractArtifacts, groupArtifacts, buildExplorer } from './explorer.js';

const mockStatus = {
  snapshot_id: 'ps-001',
  pipeline_status: 'completed',
  workflows: {
    Mapped_AE: {
      workflow_id: 'AE',
      workflow_type: 'Mapped',
      phase: '1_mappings',
      status: 'completed',
      steps: [
        { name: '=', output: 'Mapped_AE', status: 'completed', error: null },
      ],
    },
    Analysis_kri0001: {
      workflow_id: 'kri0001',
      workflow_type: 'Analysis',
      phase: '2_metrics',
      status: 'completed',
      steps: [
        { name: 'gsm.core::Input_Rate', output: 'Analysis_Input', status: 'completed', error: null },
        { name: 'gsm.core::Summarize', output: 'Analysis_Summary', status: 'completed', error: null },
      ],
    },
  },
};

describe('extractArtifacts', () => {
  it('extracts all completed output artifacts from status data', () => {
    const artifacts = extractArtifacts(mockStatus);
    expect(artifacts).toHaveLength(3);
    expect(artifacts.map(a => a.domain)).toEqual(['Mapped_AE', 'Analysis_Input', 'Analysis_Summary']);
  });

  it('includes correct path for each artifact', () => {
    const artifacts = extractArtifacts(mockStatus);
    expect(artifacts[0].path).toBe('1_mappings/AE/Mapped_AE.csv');
    expect(artifacts[1].path).toBe('2_metrics/kri0001/Analysis_Input.csv');
  });

  it('skips steps that are not completed', () => {
    const status = {
      workflows: {
        Mapped_AE: {
          workflow_id: 'AE', workflow_type: 'Mapped', phase: '1_mappings', status: 'failed',
          steps: [{ name: '=', output: 'Mapped_AE', status: 'failed', error: 'oops' }],
        },
      },
    };
    expect(extractArtifacts(status)).toHaveLength(0);
  });

  it('returns empty array when no workflows exist', () => {
    expect(extractArtifacts({})).toEqual([]);
    expect(extractArtifacts(null)).toEqual([]);
  });

  it('includes workflow metadata on each artifact', () => {
    const artifacts = extractArtifacts(mockStatus);
    expect(artifacts[0].workflowKey).toBe('Mapped_AE');
    expect(artifacts[0].phase).toBe('1_mappings');
    expect(artifacts[0].workflowId).toBe('AE');
    expect(artifacts[0].stepName).toBe('=');
  });
});

describe('groupArtifacts', () => {
  it('groups artifacts by phase and workflowId', () => {
    const artifacts = extractArtifacts(mockStatus);
    const tree = groupArtifacts(artifacts);
    expect(Object.keys(tree)).toEqual(['1_mappings', '2_metrics']);
    expect(Object.keys(tree['1_mappings'])).toEqual(['AE']);
    expect(Object.keys(tree['2_metrics'])).toEqual(['kri0001']);
    expect(tree['2_metrics']['kri0001']).toHaveLength(2);
  });

  it('returns empty object for empty input', () => {
    expect(groupArtifacts([])).toEqual({});
  });
});

describe('buildExplorer', () => {
  beforeEach(() => {
    // Mock fetch for artifact loading
    globalThis.fetch = async (url) => {
      if (url.includes('Mapped_AE.csv')) {
        return { ok: true, text: async () => 'SubjectID,AETerm\nSUBJ-001,Headache' };
      }
      return { ok: false };
    };
  });

  it('renders explorer layout with sidebar and viewer', () => {
    const el = buildExplorer(mockStatus, 'demo', 'ps-001');
    expect(el.className).toBe('explorer-layout');
    expect(el.querySelector('.explorer-sidebar')).toBeTruthy();
    expect(el.querySelector('.explorer-viewer')).toBeTruthy();
  });

  it('renders tree items for each artifact', () => {
    const el = buildExplorer(mockStatus, 'demo', 'ps-001');
    const items = el.querySelectorAll('.explorer-item');
    expect(items).toHaveLength(3);
    expect(items[0].dataset.domain).toBe('Mapped_AE');
    expect(items[1].dataset.domain).toBe('Analysis_Input');
    expect(items[2].dataset.domain).toBe('Analysis_Summary');
  });

  it('renders phase and workflow folder nodes', () => {
    const el = buildExplorer(mockStatus, 'demo', 'ps-001');
    const phases = el.querySelectorAll('.explorer-phase-header');
    const wfs = el.querySelectorAll('.explorer-wf-header');
    expect(phases).toHaveLength(2);
    expect(wfs).toHaveLength(2);
  });

  it('shows placeholder when no status data', () => {
    const el = buildExplorer({}, 'demo', 'ps-001');
    expect(el.querySelector('.explorer-empty')).toBeTruthy();
  });

  it('search filters items by name', () => {
    const el = buildExplorer(mockStatus, 'demo', 'ps-001');
    const input = el.querySelector('.explorer-search-input');
    input.value = 'summary';
    input.dispatchEvent(new Event('input'));
    const visible = el.querySelectorAll('.explorer-item:not([style*="display: none"])');
    expect(visible).toHaveLength(1);
    expect(visible[0].dataset.domain).toBe('Analysis_Summary');
  });

  it('clicking an item marks it as selected', async () => {
    const el = buildExplorer(mockStatus, 'demo', 'ps-001');
    const item = el.querySelector('.explorer-item');
    item.click();
    // Wait for async handler
    await new Promise(r => setTimeout(r, 10));
    expect(item.classList.contains('selected')).toBe(true);
  });
});
