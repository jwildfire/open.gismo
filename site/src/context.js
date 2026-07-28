/**
 * Snapshot data context.
 *
 * The published study tree has two addressing modes for the same contract:
 *   - root      (`status.json`, `output/…`)      → the current snapshot
 *   - `ps-NNN/` (`ps-001/status.json`, …)        → history
 *
 * Everything the app fetches that is snapshot-scoped goes through `withBase()`,
 * so switching the timeline dot re-points the whole app at another tree without
 * any per-module knowledge of snapshots. Workflow YAML (`workflows/…`,
 * `_index.json`) and study config are study-level, not snapshot-scoped, and are
 * always read from the root — the `ps-NNN/` trees carry only status, manifest
 * and output.
 */

let snapshots = [];
let currentId = null;

/**
 * Register the snapshot list (from snapshots.json), newest last.
 * The newest snapshot becomes the current context and resolves to the root.
 * @param {Array<object>} list
 */
export function setSnapshots(list) {
  snapshots = Array.isArray(list) ? [...list].filter((s) => s && s.snapshot_id) : [];
  snapshots.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  currentId = snapshots.length ? snapshots[snapshots.length - 1].snapshot_id : null;
  return snapshots;
}

/** All known snapshots, oldest first. */
export function getSnapshots() {
  return snapshots;
}

/** The newest snapshot id, or null when snapshots.json is absent. */
export function latestSnapshotId() {
  return snapshots.length ? snapshots[snapshots.length - 1].snapshot_id : null;
}

/** The snapshot the app is currently reading. */
export function getCurrentSnapshotId() {
  return currentId;
}

/** The snapshot record the app is currently reading, or null. */
export function getCurrentSnapshot() {
  return snapshots.find((s) => s.snapshot_id === currentId) || null;
}

/** Look up a snapshot record by id. */
export function getSnapshot(id) {
  return snapshots.find((s) => s.snapshot_id === id) || null;
}

/** True when the current context is the newest snapshot (served from root). */
export function isLatest() {
  return currentId !== null && currentId === latestSnapshotId();
}

/**
 * Switch the data context. Unknown ids are ignored (the context is left alone)
 * so a stale bookmark can never blank the app.
 * @param {string} id
 * @returns {boolean} whether the context changed
 */
export function setCurrentSnapshot(id) {
  if (!id || !snapshots.some((s) => s.snapshot_id === id)) return false;
  if (id === currentId) return false;
  currentId = id;
  return true;
}

/**
 * The path prefix for the given (or current) snapshot: '' for the newest
 * snapshot, `ps-NNN/` for history.
 * @param {string} [id]
 */
export function basePath(id = currentId) {
  if (!id || id === latestSnapshotId()) return '';
  return `${id}/`;
}

/**
 * Resolve a snapshot-scoped, root-relative path against the current context.
 * Absolute URLs and already-prefixed paths are returned untouched.
 * @param {string} path e.g. 'status.json' or 'output/3_reports/x/x.html'
 * @param {string} [id]
 */
export function withBase(path, id = currentId) {
  if (/^https?:\/\//i.test(path)) return path;
  const p = String(path || '').replace(/^(\.?\/)+/, '');
  const base = basePath(id);
  if (!base) return p;
  if (p.startsWith(base)) return p;
  return base + p;
}

/** Reset the module (tests, and the "no snapshots.json" case). */
export function resetContext() {
  snapshots = [];
  currentId = null;
}
