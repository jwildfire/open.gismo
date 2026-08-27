import { describe, it, expect } from 'vitest';
import { parseYamlMeta, parseWorkflow, parseCsv } from './parsers.js';

// --- parseYamlMeta ---

describe('parseYamlMeta', () => {
  it('extracts key-value pairs from the meta section', () => {
    const yaml = `meta:\n  Type: "Mapping"\n  ID: "AE"\n  Description: "Map raw AE data"\n  Priority: 1\nsteps:\n  - output: Mapped_AE`;
    const meta = parseYamlMeta(yaml);
    expect(meta.Type).toBe('Mapping');
    expect(meta.ID).toBe('AE');
    expect(meta.Description).toBe('Map raw AE data');
    expect(meta.Priority).toBe('1');
  });

  it('returns empty object when no meta section exists', () => {
    const yaml = `steps:\n  - output: Foo`;
    expect(parseYamlMeta(yaml)).toEqual({});
  });

  it('stops parsing meta at the next top-level key', () => {
    const yaml = `meta:\n  ID: "X"\nspec:\n  Raw:\n    col:\n      type: character`;
    const meta = parseYamlMeta(yaml);
    expect(meta.ID).toBe('X');
    expect(Object.keys(meta)).toHaveLength(1);
  });

  it('handles unquoted values', () => {
    const yaml = `meta:\n  Type: Metric\n  ID: kri0001`;
    const meta = parseYamlMeta(yaml);
    expect(meta.Type).toBe('Metric');
    expect(meta.ID).toBe('kri0001');
  });

  it('returns empty object for empty string', () => {
    expect(parseYamlMeta('')).toEqual({});
  });
});

// --- parseWorkflow ---

describe('parseWorkflow', () => {
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

  it('parses meta, spec, and steps from a full workflow YAML', () => {
    const result = parseWorkflow(sampleYaml);
    expect(result.meta.Type).toBe('Mapping');
    expect(result.meta.ID).toBe('AE');
    expect(result.meta.GroupLevel).toBe('Site');
    expect(result.spec).toHaveProperty('Raw_AE');
    expect(result.spec.Raw_AE).toHaveProperty('SubjectID');
    expect(result.spec.Raw_AE.SubjectID.type).toBe('character');
    expect(result.spec.Raw_AE.SubjectID.required).toBe('true');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].output).toBe('Mapped_AE');
    expect(result.steps[0].name).toBe('gsm.mapping::AE_Map_Raw');
    expect(result.steps[0].params.dfInput).toBe('Raw_AE');
  });

  it('handles workflow with multiple steps', () => {
    const yaml = `meta:\n  Type: Metric\n  ID: kri0001\nsteps:\n  - output: Analysis_Input\n    name: gsm.core::Input_Rate\n    params:\n      dfInput: Mapped_AE\n  - output: Analysis_Summary\n    name: gsm.core::Analyze_NormalApprox\n    params:\n      dfInput: Analysis_Input`;
    const result = parseWorkflow(yaml);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].output).toBe('Analysis_Input');
    expect(result.steps[1].output).toBe('Analysis_Summary');
  });

  it('returns empty steps and spec when sections are absent', () => {
    const yaml = `meta:\n  ID: simple`;
    const result = parseWorkflow(yaml);
    expect(result.steps).toEqual([]);
    expect(result.spec).toEqual({});
    expect(result.meta.ID).toBe('simple');
  });

  it('returns empty result for empty string', () => {
    const result = parseWorkflow('');
    expect(result.meta).toEqual({});
    expect(result.steps).toEqual([]);
    expect(result.spec).toEqual({});
  });
});

// --- parseCsv ---

describe('parseCsv', () => {
  it('parses a simple CSV with headers and rows', () => {
    const csv = `package,version,org\ngsm.core,2.2.0,Gilead\nworkr,1.0.0,Gilead-BioStats`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].package).toBe('gsm.core');
    expect(rows[0].version).toBe('2.2.0');
    expect(rows[1].org).toBe('Gilead-BioStats');
  });

  it('strips double quotes from field values', () => {
    const csv = `"name","value"\n"hello","world"`;
    const rows = parseCsv(csv);
    expect(rows[0].name).toBe('hello');
    expect(rows[0].value).toBe('world');
  });

  it('handles headers that shadow object prototype keys', () => {
    const csv = `__proto__,value\nheader-safe,ok`;
    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]['__proto__']).toBe('header-safe');
    expect(rows[0].value).toBe('ok');
  });

  it('returns empty array for single-line CSV (header only)', () => {
    expect(parseCsv('package,version')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('handles missing trailing fields with empty strings', () => {
    const csv = `a,b,c\n1,2`;
    const rows = parseCsv(csv);
    expect(rows[0].c).toBe('');
  });

  it('keeps commas inside quoted fields — gsm threshold vectors', () => {
    const csv = 'Type,ID,Threshold,MetricID\n"Analysis","kri0001","-2,-1,2,3","Analysis_kri0001"';
    const rows = parseCsv(csv);
    expect(rows[0].Threshold).toBe('-2,-1,2,3');
    expect(rows[0].MetricID).toBe('Analysis_kri0001');
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const rows = parseCsv(['a', '"say ""hi"""'].join('\n'));
    expect(rows[0].a).toBe('say "hi"');
  });

  it('keeps newlines inside quoted fields', () => {
    const rows = parseCsv(['a,b', '"line1', 'line2",x'].join('\n'));
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toBe('line1\nline2');
    expect(rows[0].b).toBe('x');
  });

  it('tolerates a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(1);
  });

  it('handles CSV with whitespace around values', () => {
    const csv = `col1 , col2\n val1 , val2 `;
    const rows = parseCsv(csv);
    expect(rows[0]['col1']).toBe('val1');
    expect(rows[0]['col2']).toBe('val2');
  });
});
