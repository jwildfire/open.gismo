import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  classifyFlag,
  flagLabel,
  summarizeFlags,
  flagDeltas,
  metricIndex,
  groupIndex,
  direction,
  groupLabel,
  studyFacts,
  rowsForLevel,
  FLAG_LEVELS,
} from './flags.js';

const row = (GroupID, MetricID, Flag, GroupLevel = 'Site', extra = {}) =>
  ({ GroupID, MetricID, Flag: String(Flag), GroupLevel, Score: '1.2', ...extra });

describe('classifyFlag', () => {
  it('maps |2| to red, |1| to amber, 0 to on track', () => {
    expect(classifyFlag('2')).toBe('red');
    expect(classifyFlag('-2')).toBe('red');
    expect(classifyFlag('1')).toBe('amber');
    expect(classifyFlag('-1')).toBe('amber');
    expect(classifyFlag('0')).toBe('ontrack');
    expect(classifyFlag(0)).toBe('ontrack');
  });

  it('treats blank, NA and non-numeric cells as not evaluated', () => {
    expect(classifyFlag('')).toBe('none');
    expect(classifyFlag('NA')).toBe('none');
    expect(classifyFlag('na')).toBe('none');
    expect(classifyFlag(null)).toBe('none');
    expect(classifyFlag(undefined)).toBe('none');
    expect(classifyFlag('abc')).toBe('none');
  });
});

describe('flagLabel', () => {
  it('always produces a text label carrying direction', () => {
    expect(flagLabel('2')).toBe('Red flag (high)');
    expect(flagLabel('-2')).toBe('Red flag (low)');
    expect(flagLabel('1')).toBe('Amber flag (high)');
    expect(flagLabel('0')).toBe('On track');
    expect(flagLabel('NA')).toBe('Not evaluated');
  });
});

describe('rowsForLevel', () => {
  it('restricts rows to one group level', () => {
    const rows = [row('A', 'M1', 0), row('UK', 'M1', 0, 'Country')];
    expect(rowsForLevel(rows, 'Site')).toHaveLength(1);
    expect(rowsForLevel(rows, 'Country')).toHaveLength(1);
    expect(rowsForLevel(null)).toEqual([]);
  });
});

describe('summarizeFlags', () => {
  const rows = [
    row('S1', 'M1', 2), row('S1', 'M2', 0), row('S1', 'M3', 'NA'),
    row('S2', 'M1', 1), row('S2', 'M2', -1),
    row('S3', 'M1', 0), row('S3', 'M2', 0),
    row('UK', 'M1', 2, 'Country'),
  ];

  it('counts cells by level within the requested group level', () => {
    const s = summarizeFlags(rows, 'Site');
    expect(s.red).toBe(1);
    expect(s.amber).toBe(2);
    expect(s.onTrack).toBe(3);
    expect(s.notEvaluated).toBe(1);
    expect(s.cellCount).toBe(7);
  });

  it('rolls cells up to worst-per-group counts', () => {
    const s = summarizeFlags(rows, 'Site');
    expect(s.redGroups).toBe(1);   // S1
    expect(s.amberGroups).toBe(1); // S2
    expect(s.clearGroups).toBe(1); // S3
    expect(s.groupCount).toBe(3);
    expect(s.metricCount).toBe(3);
  });

  it('scopes to Country when asked', () => {
    const s = summarizeFlags(rows, 'Country');
    expect(s.red).toBe(1);
    expect(s.groupCount).toBe(1);
  });

  it('handles empty input', () => {
    const s = summarizeFlags([], 'Site');
    expect(s.red + s.amber + s.onTrack + s.notEvaluated).toBe(0);
    expect(s.groupCount).toBe(0);
  });
});

describe('flagDeltas', () => {
  it('reports only level changes, tagged with direction', () => {
    const prev = [row('S1', 'M1', 1), row('S2', 'M1', 2), row('S3', 'M1', 0)];
    const curr = [row('S1', 'M1', 2), row('S2', 'M1', 0), row('S3', 'M1', 0)];
    const d = flagDeltas(prev, curr);
    expect(d).toHaveLength(2);
    const s1 = d.find((x) => x.groupId === 'S1');
    expect(s1.fromLevel).toBe('amber');
    expect(s1.toLevel).toBe('red');
    expect(s1.direction).toBe('worse');
    const s2 = d.find((x) => x.groupId === 'S2');
    expect(s2.direction).toBe('better');
  });

  it('ignores score wobble inside the same level', () => {
    const prev = [row('S1', 'M1', 2, 'Site', { Score: '3.0' })];
    const curr = [row('S1', 'M1', 2, 'Site', { Score: '9.9' })];
    expect(flagDeltas(prev, curr)).toEqual([]);
  });

  it('does not call a newly evaluated on-track cell worse', () => {
    const prev = [row('S1', 'M1', 'NA')];
    const curr = [row('S1', 'M1', 0)];
    const d = flagDeltas(prev, curr);
    expect(d).toHaveLength(1);
    expect(d[0].direction).toBe('same');
    expect(d[0].toLevel).toBe('ontrack');
  });

  it('reports newly evaluated and dropped cells', () => {
    const prev = [row('S1', 'M1', 2)];
    const curr = [row('S2', 'M1', 1)];
    const d = flagDeltas(prev, curr);
    expect(d.find((x) => x.groupId === 'S2').kind).toBe('added');
    expect(d.find((x) => x.groupId === 'S1').kind).toBe('removed');
  });

  it('does not report cells that were and remain unevaluated', () => {
    const prev = [row('S1', 'M1', 'NA')];
    const curr = [row('S1', 'M1', '')];
    expect(flagDeltas(prev, curr)).toEqual([]);
  });

  it('sorts worsening changes first', () => {
    const prev = [row('S1', 'M1', 2), row('S2', 'M1', 0)];
    const curr = [row('S1', 'M1', 0), row('S2', 'M1', 2)];
    const d = flagDeltas(prev, curr);
    expect(d[0].direction).toBe('worse');
  });
});

describe('direction', () => {
  it('judges on severity, not on the roll-up rank', () => {
    expect(direction('ontrack', 'amber')).toBe('worse');
    expect(direction('amber', 'red')).toBe('worse');
    expect(direction('red', 'ontrack')).toBe('better');
    expect(direction('amber', 'none')).toBe('better');
  });

  it('treats a newly evaluated on-track cell as a change, not a deterioration', () => {
    expect(direction('none', 'ontrack')).toBe('same');
    expect(direction('ontrack', 'none')).toBe('same');
  });
});

describe('metricIndex / groupIndex', () => {
  it('indexes metrics by MetricID with a display name', () => {
    const idx = metricIndex([
      { MetricID: 'Analysis_kri0001', ID: 'kri0001', Abbreviation: 'AE', Metric: 'Adverse Event Rate', GroupLevel: 'Site', Threshold: '-2,-1,2,3' },
    ]);
    expect(idx.get('Analysis_kri0001').abbreviation).toBe('AE');
    expect(idx.get('Analysis_kri0001').name).toBe('Adverse Event Rate');
    expect(idx.get('Analysis_kri0001').threshold).toBe('-2,-1,2,3');
  });

  it('pivots the long-format group table into per-group params', () => {
    const idx = groupIndex([
      { GroupID: '37728', Param: 'InvestigatorLastName', Value: 'Smith', GroupLevel: 'Site' },
      { GroupID: '37728', Param: 'City', Value: 'Boston', GroupLevel: 'Site' },
      { GroupID: 'AA-AA', Param: 'nickname', Value: 'OAK-38', GroupLevel: 'Study' },
    ], 'Site');
    expect(idx.get('37728')).toEqual({ InvestigatorLastName: 'Smith', City: 'Boston' });
    expect(idx.has('AA-AA')).toBe(false);
  });

  it('builds a readable group label with a raw-id fallback', () => {
    expect(groupLabel('37728', { InvestigatorLastName: 'Smith', City: 'Boston' })).toBe('37728 · Smith, Boston');
    expect(groupLabel('37728', { InvestigatorLastName: 'Smith' })).toBe('37728 · Smith');
    expect(groupLabel('37728', null)).toBe('37728');
  });
});

describe('studyFacts', () => {
  it('extracts participant and site counts for the masthead', () => {
    const facts = studyFacts([
      { GroupID: 'AA-AA', Param: 'ParticipantCount', Value: '765', GroupLevel: 'Study' },
      { GroupID: 'AA-AA', Param: 'ParticipantTarget', Value: '1000', GroupLevel: 'Study' },
      { GroupID: 'AA-AA', Param: 'SiteCount', Value: '148', GroupLevel: 'Study' },
      { GroupID: 'S1', Param: 'City', Value: 'Boston', GroupLevel: 'Site' },
    ]);
    expect(facts.participants).toBe('765');
    expect(facts.participantTarget).toBe('1000');
    expect(facts.sites).toBe('148');
  });

  it('degrades to blanks when the group table is missing', () => {
    expect(studyFacts([]).participants).toBe('');
    expect(studyFacts(null).sites).toBe('');
  });
});

describe('flag properties', () => {
  it('classifies every integer flag into a known level', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 5 }), (n) => {
        const level = classifyFlag(n);
        expect(Object.keys(FLAG_LEVELS)).toContain(level);
        expect(FLAG_LEVELS[level].label.length).toBeGreaterThan(0);
      }),
    );
  });

  it('summary cell counts always add up to the scoped row count', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            GroupID: fc.constantFrom('S1', 'S2', 'S3'),
            MetricID: fc.constantFrom('M1', 'M2'),
            Flag: fc.constantFrom('-2', '-1', '0', '1', '2', 'NA', ''),
          }),
          { maxLength: 30 },
        ),
        (rows) => {
          const scoped = rows.map((r) => ({ ...r, GroupLevel: 'Site' }));
          const s = summarizeFlags(scoped, 'Site');
          expect(s.red + s.amber + s.onTrack + s.notEvaluated).toBe(scoped.length);
          expect(s.redGroups + s.amberGroups + s.clearGroups).toBe(s.groupCount);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('a snapshot compared against itself yields no deltas', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            GroupID: fc.constantFrom('S1', 'S2'),
            MetricID: fc.constantFrom('M1', 'M2'),
            Flag: fc.constantFrom('-2', '0', '1', 'NA'),
          }),
          { maxLength: 12 },
        ),
        (rows) => {
          const scoped = rows.map((r) => ({ ...r, GroupLevel: 'Site' }));
          expect(flagDeltas(scoped, scoped)).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });
});
