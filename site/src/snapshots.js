/**
 * Project Snapshot selector and change handler.
 *
 * buildSnapshotSelector renders a <select> dropdown with snapshots in
 * reverse chronological order (newest first). When only one snapshot
 * exists it is auto-selected and the callback fires immediately.
 *
 * onSnapshotChange is a thin async stub that downstream modules can
 * replace once status / artifact / log loading is wired up.
 */

/**
 * Build a snapshot selector element.
 *
 * @param {Array<{snapshot_id:string, created_at:string, input_data_version:string}>} snapshots
 * @param {(id:string)=>void} onSelect  callback when a snapshot is chosen
 * @returns {HTMLElement} wrapper element containing the <select>
 */
export function buildSnapshotSelector(snapshots, onSelect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'snapshot-selector';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Select project snapshot');

  // Sort reverse-chronological (newest first)
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  sorted.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.snapshot_id;
    opt.textContent = `${s.snapshot_id} — ${s.input_data_version} (${s.created_at})`;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    if (select.value) onSelect(select.value);
  });

  wrapper.appendChild(select);

  // Auto-select the latest snapshot (first in sorted order)
  if (sorted.length > 0) {
    select.value = sorted[0].snapshot_id;
    onSelect(sorted[0].snapshot_id);
  }

  return wrapper;
}

/**
 * Handle a snapshot selection change.
 *
 * Currently a lightweight async stub — returns a resolved promise so
 * callers can await it. Future tasks will wire this into status, artifact,
 * and log loading.
 *
 * @param {string} snapshotId
 * @returns {Promise<void>|undefined}
 */
export function onSnapshotChange(snapshotId) {
  if (!snapshotId) return undefined;
  return Promise.resolve();
}
