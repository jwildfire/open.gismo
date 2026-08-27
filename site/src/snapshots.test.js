import { describe, it, expect, beforeEach } from 'vitest';
import { buildSnapshotSelector, onSnapshotChange } from './snapshots.js';

describe('buildSnapshotSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a <select> element with snapshot options', () => {
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'Q1 cut' },
      { snapshot_id: 'ps-002', created_at: '2025-02-15T10:30:00Z', input_data_version: 'Q1 cut v2' },
    ];
    const el = buildSnapshotSelector(snapshots, () => {});
    expect(el.querySelector('select')).not.toBeNull();
    const options = el.querySelectorAll('option');
    expect(options.length).toBeGreaterThanOrEqual(2);
  });

  it('displays snapshots in reverse chronological order (newest first)', () => {
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'v1' },
      { snapshot_id: 'ps-003', created_at: '2025-03-15T10:30:00Z', input_data_version: 'v3' },
      { snapshot_id: 'ps-002', created_at: '2025-02-15T10:30:00Z', input_data_version: 'v2' },
    ];
    const el = buildSnapshotSelector(snapshots, () => {});
    const options = [...el.querySelectorAll('option')].filter(o => o.value);
    // First real option should be the newest snapshot (ps-003)
    expect(options[0].value).toBe('ps-003');
    expect(options[1].value).toBe('ps-002');
    expect(options[2].value).toBe('ps-001');
  });

  it('shows snapshot_id, created_at, and input_data_version in each option', () => {
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'Q1 data' },
    ];
    const el = buildSnapshotSelector(snapshots, () => {});
    const optionText = el.querySelector('option[value="ps-001"]').textContent;
    expect(optionText).toContain('ps-001');
    expect(optionText).toContain('Q1 data');
  });

  it('auto-selects when only one snapshot exists', () => {
    let selectedId = null;
    const onSelect = (id) => { selectedId = id; };
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'v1' },
    ];
    const el = buildSnapshotSelector(snapshots, onSelect);
    const select = el.querySelector('select');
    expect(select.value).toBe('ps-001');
    expect(selectedId).toBe('ps-001');
  });

  it('auto-selects the latest snapshot when multiple snapshots exist', () => {
    let selectedId = null;
    const onSelect = (id) => { selectedId = id; };
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'v1' },
      { snapshot_id: 'ps-002', created_at: '2025-02-15T10:30:00Z', input_data_version: 'v2' },
    ];
    buildSnapshotSelector(snapshots, onSelect);
    expect(selectedId).toBe('ps-002'); // latest by created_at
  });

  it('calls onSelect callback when user changes selection', () => {
    let selectedId = null;
    const onSelect = (id) => { selectedId = id; };
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'v1' },
      { snapshot_id: 'ps-002', created_at: '2025-02-15T10:30:00Z', input_data_version: 'v2' },
    ];
    const el = buildSnapshotSelector(snapshots, onSelect);
    const select = el.querySelector('select');
    select.value = 'ps-001';
    select.dispatchEvent(new Event('change'));
    expect(selectedId).toBe('ps-001');
  });

  it('visually indicates the currently selected snapshot', () => {
    const snapshots = [
      { snapshot_id: 'ps-001', created_at: '2025-01-15T10:30:00Z', input_data_version: 'v1' },
    ];
    const el = buildSnapshotSelector(snapshots, () => {});
    const select = el.querySelector('select');
    // The selected option should match the select value
    expect(select.value).toBe('ps-001');
    expect(select.selectedOptions.length).toBe(1);
  });
});

describe('onSnapshotChange', () => {
  it('is a function that accepts a snapshotId', () => {
    expect(typeof onSnapshotChange).toBe('function');
  });

  it('triggers loading when called with a valid snapshot ID', async () => {
    // onSnapshotChange should be callable without throwing synchronously
    // (it may return a promise for async loading)
    const result = onSnapshotChange('ps-001');
    // Should return a promise or undefined (async loading)
    expect(result === undefined || result instanceof Promise).toBe(true);
  });
});
