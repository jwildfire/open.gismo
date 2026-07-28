import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  setSnapshots,
  getSnapshots,
  getSnapshot,
  getCurrentSnapshot,
  getCurrentSnapshotId,
  latestSnapshotId,
  setCurrentSnapshot,
  isLatest,
  basePath,
  withBase,
  resetContext,
} from './context.js';

const SNAPS = [
  { snapshot_id: 'ps-001', created_at: '2026-07-28T18:31:14Z', input_data_version: 'cut-1', package_snapshot: 'local-2026-07-28' },
  { snapshot_id: 'ps-002', created_at: '2026-07-28T18:41:49Z', input_data_version: 'cut-2', package_snapshot: 'local-2026-07-28' },
];

beforeEach(() => resetContext());

describe('setSnapshots', () => {
  it('sorts oldest first and selects the newest as current', () => {
    setSnapshots([SNAPS[1], SNAPS[0]]);
    expect(getSnapshots().map((s) => s.snapshot_id)).toEqual(['ps-001', 'ps-002']);
    expect(getCurrentSnapshotId()).toBe('ps-002');
    expect(latestSnapshotId()).toBe('ps-002');
  });

  it('tolerates a missing or malformed list', () => {
    expect(setSnapshots(null)).toEqual([]);
    expect(getCurrentSnapshotId()).toBe(null);
    setSnapshots([{ nope: 1 }, null]);
    expect(getSnapshots()).toEqual([]);
  });
});

describe('withBase', () => {
  it('resolves the newest snapshot to the tree root', () => {
    setSnapshots(SNAPS);
    expect(basePath()).toBe('');
    expect(withBase('status.json')).toBe('status.json');
    expect(withBase('output/3_reporting/Results/Reporting_Results.csv'))
      .toBe('output/3_reporting/Results/Reporting_Results.csv');
  });

  it('prefixes ps-NNN/ for a historical snapshot', () => {
    setSnapshots(SNAPS);
    setCurrentSnapshot('ps-001');
    expect(basePath()).toBe('ps-001/');
    expect(withBase('status.json')).toBe('ps-001/status.json');
    expect(withBase('manifest.csv')).toBe('ps-001/manifest.csv');
    expect(withBase('output/3_reports/hep_explorer/hep_explorer.html'))
      .toBe('ps-001/output/3_reports/hep_explorer/hep_explorer.html');
  });

  it('accepts an explicit snapshot id independent of the current context', () => {
    setSnapshots(SNAPS);
    expect(withBase('status.json', 'ps-001')).toBe('ps-001/status.json');
    expect(withBase('status.json', 'ps-002')).toBe('status.json');
  });

  it('normalises leading slashes and never double-prefixes', () => {
    setSnapshots(SNAPS);
    setCurrentSnapshot('ps-001');
    expect(withBase('/status.json')).toBe('ps-001/status.json');
    expect(withBase('./status.json')).toBe('ps-001/status.json');
    expect(withBase('ps-001/status.json')).toBe('ps-001/status.json');
  });

  it('leaves absolute URLs untouched', () => {
    setSnapshots(SNAPS);
    setCurrentSnapshot('ps-001');
    expect(withBase('https://example.com/x.html')).toBe('https://example.com/x.html');
  });

  it('resolves to the root when no snapshots.json exists', () => {
    expect(withBase('status.json')).toBe('status.json');
    expect(basePath()).toBe('');
  });
});

describe('setCurrentSnapshot', () => {
  it('reports whether the context changed', () => {
    setSnapshots(SNAPS);
    expect(setCurrentSnapshot('ps-002')).toBe(false); // already current
    expect(setCurrentSnapshot('ps-001')).toBe(true);
    expect(setCurrentSnapshot('ps-001')).toBe(false);
  });

  it('ignores unknown ids and keeps the current context', () => {
    setSnapshots(SNAPS);
    expect(setCurrentSnapshot('ps-999')).toBe(false);
    expect(getCurrentSnapshotId()).toBe('ps-002');
    expect(setCurrentSnapshot('')).toBe(false);
    expect(getCurrentSnapshotId()).toBe('ps-002');
  });
});

describe('current snapshot record', () => {
  it('exposes the full record for the provenance chip', () => {
    setSnapshots(SNAPS);
    expect(getCurrentSnapshot().input_data_version).toBe('cut-2');
    setCurrentSnapshot('ps-001');
    expect(getCurrentSnapshot().input_data_version).toBe('cut-1');
    expect(isLatest()).toBe(false);
    expect(getSnapshot('ps-002').package_snapshot).toBe('local-2026-07-28');
    expect(getSnapshot('nope')).toBe(null);
  });
});

describe('withBase properties', () => {
  it('always yields a relative path under the selected snapshot', () => {
    setSnapshots(SNAPS);
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9_.\-/]{1,40}$/),
        fc.constantFrom('ps-001', 'ps-002'),
        (path, id) => {
          const out = withBase(path, id);
          expect(out.startsWith('/')).toBe(false);
          if (id === 'ps-001') expect(out.startsWith('ps-001/')).toBe(true);
          // idempotent
          expect(withBase(out, id)).toBe(out);
        },
      ),
      { numRuns: 100 },
    );
  });
});
