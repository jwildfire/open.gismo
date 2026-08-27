import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseYaml,
  parseStudyConfig,
  defaultStudyConfig,
  coerceScalar,
  stripComment,
} from './yaml.js';

const REAL_CONFIG = `# study-config.yaml — study identity and the domain registry.
#
#   1. Identity. The flat StudyID keys are what the engine reads today.

StudyID: DEMO-301
StudyName: "DEMO-301"
StudyTitle: "DEMO-301 — Safety Review"

study:
  id: DEMO-301
  label: "DEMO-301 — Safety Review"
  phase: "Phase 2"
  synthetic: true
  source: "gsm.core example source"

domains:
  safety:
    label: Safety
    charts: safety.viz
    workflows: [1_mappings, 3_reports]
  rbqm:
    label: RBQM
    charts: gsm.viz
    workflows: [1_mappings, 2_metrics, 3_reporting, 4_modules]
`;

describe('stripComment', () => {
  it('removes a trailing comment', () => {
    expect(stripComment('key: value # trailing').trim()).toBe('key: value');
  });

  it('keeps a # inside a quoted string', () => {
    expect(stripComment('key: "a # b"').trim()).toBe('key: "a # b"');
  });

  it('drops a whole-line comment', () => {
    expect(stripComment('# just a comment').trim()).toBe('');
  });
});

describe('coerceScalar', () => {
  it('coerces booleans, null and numbers', () => {
    expect(coerceScalar('true')).toBe(true);
    expect(coerceScalar('false')).toBe(false);
    expect(coerceScalar('null')).toBe(null);
    expect(coerceScalar('42')).toBe(42);
    expect(coerceScalar('-1.5')).toBe(-1.5);
  });

  it('unquotes strings without coercing their contents', () => {
    expect(coerceScalar('"true"')).toBe('true');
    expect(coerceScalar("'DEMO-301'")).toBe('DEMO-301');
  });

  it('parses flow sequences', () => {
    expect(coerceScalar('[a, b, c]')).toEqual(['a', 'b', 'c']);
    expect(coerceScalar('[]')).toEqual([]);
  });
});

describe('parseYaml', () => {
  it('parses nested maps', () => {
    const out = parseYaml('a:\n  b:\n    c: 1\n');
    expect(out).toEqual({ a: { b: { c: 1 } } });
  });

  it('parses block sequences of scalars', () => {
    const out = parseYaml('phases:\n  - 1_mappings\n  - 2_metrics\n');
    expect(out.phases).toEqual(['1_mappings', '2_metrics']);
  });

  it('parses block sequences of maps', () => {
    const out = parseYaml('filters:\n  - value_col: SEX\n    label: Sex\n  - value_col: ARM\n    label: Arm\n');
    expect(out.filters).toEqual([
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'ARM', label: 'Arm' },
    ]);
  });

  it('ignores comments and blank lines', () => {
    const out = parseYaml('# header\n\nkey: value  # inline\n');
    expect(out).toEqual({ key: 'value' });
  });

  it('returns an empty object for empty or comment-only input', () => {
    expect(parseYaml('')).toEqual({});
    expect(parseYaml('# nothing here\n')).toEqual({});
    expect(parseYaml(null)).toEqual({});
  });

  it('keeps colons inside quoted values', () => {
    const out = parseYaml('url: "https://example.com/x"\n');
    expect(out.url).toBe('https://example.com/x');
  });
});

describe('parseStudyConfig', () => {
  it('reads identity from the flat keys', () => {
    const cfg = parseStudyConfig(REAL_CONFIG);
    expect(cfg.identity.id).toBe('DEMO-301');
    expect(cfg.identity.title).toBe('DEMO-301 — Safety Review');
  });

  it('reads the nested study block including the synthetic flag', () => {
    const cfg = parseStudyConfig(REAL_CONFIG);
    expect(cfg.study.phase).toBe('Phase 2');
    expect(cfg.study.synthetic).toBe(true);
    expect(cfg.study.source).toBe('gsm.core example source');
  });

  it('reads the domain registry in declaration order', () => {
    const cfg = parseStudyConfig(REAL_CONFIG);
    expect(cfg.domains.map((d) => d.key)).toEqual(['safety', 'rbqm']);
    expect(cfg.domains[0]).toEqual({
      key: 'safety',
      label: 'Safety',
      charts: 'safety.viz',
      workflows: ['1_mappings', '3_reports'],
    });
    expect(cfg.domains[1].workflows).toEqual(['1_mappings', '2_metrics', '3_reporting', '4_modules']);
  });

  it('falls back to the key when a domain has no label', () => {
    const cfg = parseStudyConfig('domains:\n  qtl:\n    charts: gsm.viz\n');
    expect(cfg.domains[0].label).toBe('qtl');
    expect(cfg.domains[0].workflows).toEqual([]);
  });

  it('yields an empty registry when domains are missing', () => {
    const cfg = parseStudyConfig('StudyID: X\n');
    expect(cfg.domains).toEqual([]);
    expect(cfg.study.label).toBe('X');
  });

  it('never throws on malformed input', () => {
    expect(() => parseStudyConfig(': : :\n\t- broken')).not.toThrow();
  });
});

describe('defaultStudyConfig', () => {
  it('carries the two launch domains', () => {
    expect(defaultStudyConfig().domains.map((d) => d.key)).toEqual(['safety', 'rbqm']);
  });
});

describe('parseYaml properties', () => {
  it('round-trips arbitrary flat string maps', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,10}$/),
          fc.stringMatching(/^[a-zA-Z0-9 _.-]{1,20}$/),
          { minKeys: 1, maxKeys: 6 },
        ),
        (obj) => {
          const text = Object.entries(obj).map(([k, v]) => `${k}: "${v}"`).join('\n');
          const parsed = parseYaml(text);
          for (const [k, v] of Object.entries(obj)) {
            expect(String(parsed[k])).toBe(v);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => parseYaml(s)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
