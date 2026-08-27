import { describe, it, expect } from 'vitest';
import { buildDetailView } from './detail.js';

const sampleYaml = `meta:
  Type: "Mapping"
  ID: "AE"
  Description: "Map raw AE data"
  Priority: 1
  GroupLevel: Site

spec:
  Raw_AE:
    SubjectID:
      type: character
      required: true
    AEStartDate:
      type: Date
      required: true

steps:
  - output: Mapped_AE
    name: gsm.mapping::AE_Map_Raw
    params:
      dfInput: Raw_AE
      lMeta: lMeta`;

describe('buildDetailView', () => {
  it('contains all metadata key-value pairs', () => {
    const html = buildDetailView(sampleYaml, 'workflows/1_mappings/AE.yaml');
    expect(html).toContain('Type');
    expect(html).toContain('Mapping');
    expect(html).toContain('ID');
    expect(html).toContain('AE');
    expect(html).toContain('Description');
    expect(html).toContain('Map raw AE data');
    expect(html).toContain('Priority');
    expect(html).toContain('GroupLevel');
    expect(html).toContain('Site');
  });

  it('contains spec dataset names and column names', () => {
    const html = buildDetailView(sampleYaml, 'workflows/1_mappings/AE.yaml');
    expect(html).toContain('Raw_AE');
    expect(html).toContain('SubjectID');
    expect(html).toContain('AEStartDate');
    expect(html).toContain('character');
    expect(html).toContain('Date');
  });

  it('contains step function name, output, and parameters', () => {
    const html = buildDetailView(sampleYaml, 'workflows/1_mappings/AE.yaml');
    expect(html).toContain('Mapped_AE');
    expect(html).toContain('gsm.mapping::AE_Map_Raw');
    expect(html).toContain('dfInput');
    expect(html).toContain('Raw_AE');
    expect(html).toContain('lMeta');
  });

  it('renders steps in execution order', () => {
    const multiStepYaml = `meta:\n  ID: multi\nsteps:\n  - output: Step1Out\n    name: pkg::fn1\n    params:\n      x: y\n  - output: Step2Out\n    name: pkg::fn2\n    params:\n      a: b`;
    const html = buildDetailView(multiStepYaml, 'workflows/2_metrics/multi.yaml');
    const idx1 = html.indexOf('Step1Out');
    const idx2 = html.indexOf('Step2Out');
    expect(idx1).toBeLessThan(idx2);
    expect(html).toContain('pkg::fn1');
    expect(html).toContain('pkg::fn2');
  });

  it('includes YAML toggle button and raw YAML section', () => {
    const html = buildDetailView(sampleYaml, 'workflows/1_mappings/AE.yaml');
    expect(html).toContain('Show YAML');
    expect(html).toContain('detail-yaml');
  });

  it('uses phase color from the yaml path prefix', () => {
    const html = buildDetailView(sampleYaml, 'workflows/1_mappings/AE.yaml');
    // Phase 1 (Mappings) color is #1d4ed8 in the espresso/paper scale
    expect(html).toContain('#1d4ed8');
  });
});
