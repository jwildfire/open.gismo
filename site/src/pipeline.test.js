import { describe, it, expect } from 'vitest';
import { makeCard, buildPipeline } from './pipeline.js';

describe('makeCard', () => {
  const baseItem = {
    ID: 'AE',
    Description: 'Map raw AE data',
    Priority: '1',
    GroupLevel: 'Site',
    AnalysisType: 'rate',
    _stem: 'AE',
    _path: 'workflows/1_mappings/AE.yaml',
  };

  it('renders a detailed card with ID, description, priority, group level, and analysis type', () => {
    const html = makeCard(baseItem, 1, false);
    expect(html).toContain('AE');
    expect(html).toContain('Map raw AE data');
    expect(html).toContain('P1');
    expect(html).toContain('Site');
    expect(html).toContain('rate');
  });

  it('renders a compact card with ID but without priority/group/analysis tags', () => {
    const html = makeCard(baseItem, 1, true);
    expect(html).toContain('AE');
    expect(html).toContain('card-compact');
    // Compact mode should not have tag elements for priority, group, analysis
    expect(html).not.toContain('tag-priority');
    expect(html).not.toContain('card-tags');
  });

  it('includes data-group and data-search attributes for filtering', () => {
    const html = makeCard(baseItem, 1, false);
    expect(html).toContain('data-group="Site"');
    expect(html).toContain('data-search=');
  });
});

describe('buildPipeline', () => {
  it('groups workflows by phase and renders phase headers', () => {
    const phases = {
      1: [
        { ID: 'AE', Description: 'AE mapping', Priority: '1', GroupLevel: 'Site', _stem: 'AE', _path: 'workflows/1_mappings/AE.yaml' },
      ],
      2: [
        { ID: 'kri0001', Description: 'KRI metric', Priority: '1', GroupLevel: 'Site', AnalysisType: 'rate', _stem: 'kri0001', _path: 'workflows/2_metrics/kri0001.yaml' },
      ],
    };
    const html = buildPipeline(phases, false);
    // Phase headers
    expect(html).toContain('Mappings');
    expect(html).toContain('Metrics');
    // Workflow cards
    expect(html).toContain('AE');
    expect(html).toContain('kri0001');
  });

  it('renders summary stats with workflow counts per phase', () => {
    const phases = {
      1: [
        { ID: 'AE', Priority: '0', _stem: 'AE', _path: 'workflows/1_mappings/AE.yaml' },
        { ID: 'DM', Priority: '0', _stem: 'DM', _path: 'workflows/1_mappings/DM.yaml' },
      ],
    };
    const html = buildPipeline(phases, false);
    // Stats section should show count 2
    expect(html).toContain('2');
    expect(html).toContain('Mappings');
  });
});

describe('makeCard — activation state', () => {
  const baseItem = {
    ID: 'kri0001',
    Description: 'AE Rate by Site',
    Priority: '1',
    GroupLevel: 'Site',
    AnalysisType: 'rate',
    _stem: 'kri0001',
    _path: 'workflows/2_metrics/kri0001.yaml',
  };

  it('renders a normal card with no activation badges when Active and GenerateRiskSignal are unset', () => {
    const html = makeCard(baseItem, 2, false);
    expect(html).not.toContain('Inactive');
    expect(html).not.toContain('Monitoring Only');
    expect(html).not.toContain('card-inactive');
  });

  it('renders card-inactive class and Inactive badge when Active is false', () => {
    const html = makeCard({ ...baseItem, Active: false }, 2, false);
    expect(html).toContain('card-inactive');
    expect(html).toContain('Inactive');
    expect(html).not.toContain('Monitoring Only');
  });

  it('renders Monitoring Only badge when Active is true but GenerateRiskSignal is false', () => {
    const html = makeCard({ ...baseItem, Active: true, GenerateRiskSignal: false }, 2, false);
    expect(html).toContain('Monitoring Only');
    expect(html).not.toContain('Inactive');
    expect(html).not.toContain('card-inactive');
  });

  it('inactive card in compact mode gets card-inactive class', () => {
    const html = makeCard({ ...baseItem, Active: false }, 2, true);
    expect(html).toContain('card-inactive');
    expect(html).toContain('card-compact');
    // Compact mode never shows tag text
    expect(html).not.toContain('Inactive');
  });

  it('Active: true with GenerateRiskSignal: true renders no activation badges', () => {
    const html = makeCard({ ...baseItem, Active: true, GenerateRiskSignal: true }, 2, false);
    expect(html).not.toContain('Inactive');
    expect(html).not.toContain('Monitoring Only');
  });

  it('does not render Monitoring Only badge when metric is inactive', () => {
    // Inactive takes precedence; Monitoring Only should not also appear
    const html = makeCard({ ...baseItem, Active: false, GenerateRiskSignal: false }, 2, false);
    expect(html).toContain('Inactive');
    expect(html).not.toContain('Monitoring Only');
  });
});
