/**
 * Hash router.
 *
 * The app is a single static file served from a snapshot branch root, so every
 * view is addressed by hash — deep links survive a refresh and can be pasted
 * into a review comment. The snapshot context rides in the query part so a link
 * carries both "what" and "as of when":
 *
 *   #/overview
 *   #/safety                      #/safety/hep_explorer
 *   #/rbqm                        #/rbqm/report/report_kri_site
 *   #/explorer/workflows | data | reports | packages
 *   …any route + ?snapshot=ps-001
 */

export const VIEWS = ['overview', 'safety', 'rbqm', 'explorer'];
export const EXPLORER_TABS = ['workflows', 'data', 'reports', 'packages'];
export const DEFAULT_VIEW = 'overview';

/**
 * @param {string} hash e.g. '#/safety/hep_explorer?snapshot=ps-001'
 * @returns {{view:string, params:string[], query:object, hash:string}}
 */
/** decodeURIComponent that never throws on a malformed hash. */
function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').map((s) => decode(s.trim())).filter(Boolean);
  const view = VIEWS.includes(segments[0]) ? segments[0] : DEFAULT_VIEW;
  const params = segments.slice(1);
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      query[decode(k)] = decode(v);
    }
  }
  return { view, params, query, hash: buildHash(view, params, query) };
}

/** Inverse of parseRoute. */
export function buildHash(view, params = [], query = {}) {
  const segs = [view, ...params.filter((p) => p !== null && p !== undefined && p !== '')]
    .map((s) => encodeURIComponent(String(s)));
  const q = Object.entries(query)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `#/${segs.join('/')}${q ? `?${q}` : ''}`;
}

/** The explorer sub-tab for a route, defaulting to workflows. */
export function explorerTab(route) {
  const t = route.params[0];
  return EXPLORER_TABS.includes(t) ? t : 'workflows';
}

/** The chart id a safety route points at, or null for the gallery. */
export function safetyChartId(route) {
  if (route.view !== 'safety' || !route.params.length) return null;
  // `#/safety/metric/saf0001` is a metric page, not a chart called "metric".
  if (route.params[0] === 'metric') return null;
  return route.params[0];
}

/** The participant-metric id a safety route points at, or null. */
export function safetyMetricId(route) {
  if (route.view !== 'safety') return null;
  if (route.params[0] !== 'metric') return null;
  return route.params[1] || null;
}

/** The module-report id an rbqm route points at, or null for the monitor. */
export function rbqmReportId(route) {
  if (route.view !== 'rbqm') return null;
  if (route.params[0] !== 'report') return null;
  return route.params[1] || null;
}

/** RBQM sub-pages that are not a report: the chart index and the metric list. */
export const RBQM_SECTIONS = ['charts', 'metrics'];

/** The rbqm sub-page a route points at, or null for the domain home. */
export function rbqmSection(route) {
  if (route.view !== 'rbqm') return null;
  return RBQM_SECTIONS.includes(route.params[0]) ? route.params[0] : null;
}

/**
 * Rewrite a route's snapshot query without touching the rest of it — used when
 * the timeline dot changes while a deep view is open.
 */
export function withSnapshot(route, snapshotId) {
  const query = { ...route.query };
  if (snapshotId) query.snapshot = snapshotId;
  else delete query.snapshot;
  return buildHash(route.view, route.params, query);
}
