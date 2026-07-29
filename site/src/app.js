/**
 * Application shell — a published study site.
 *
 * A collapsible left sidebar is the primary axis: Study Overview, one entry per
 * domain in the study config registry (RBQM, Safety), and Config, which houses
 * the pipeline-facing Workflows / Data / Reports / Packages views and sits last
 * because how the study is wired is a different question from what it is doing. A compact masthead above the view carries study identity, the
 * snapshot timeline and the provenance chip.
 *
 * All data is fetched from the static snapshot tree; picking a timeline dot
 * re-points every snapshot-scoped fetch at that tree (context.js) and re-renders
 * the current view in place.
 */

import './style.css';
import './vendor/gsm.viz/group-overview.css';
import { esc } from './utils.js';
import {
  loadWorkflows, loadWorkflowYaml, loadSnapshots, loadStudyConfig,
  loadReportingLayer, loadJson, loadCsv, loadSafetyCharts,
} from './data.js';
import {
  setSnapshots, getSnapshots, getCurrentSnapshot, getCurrentSnapshotId, setCurrentSnapshot,
  withBase, isLatest,
} from './context.js';
import { buildMasthead, wireMasthead } from './masthead.js';
import { buildExplorerNav, buildExplorerToolbar } from './domainnav.js';
import {
  buildSidebar, sidebarItems, wireSidebar, readCollapsed, applyCollapsed, readExpanded,
  markActive, sidebarSignature,
} from './sidebar.js';
import {
  parseRoute, buildHash, explorerTab, safetyChartId, safetyMetricId,
  rbqmReportId, rbqmSection, withSnapshot,
} from './router.js';
import { summarizeFlags, metricIndex, groupIndex, flagDeltas, studyFacts } from './flags.js';
import { chartCards, buildChartPage, mountChartFrame } from './gallery.js';
import {
  parseCensus, reviewQueue, buildSafetyOverview, buildSafetyStudyBlock,
  buildMetricPage, metricDetail, queueForMetric,
} from './safety.js';
import {
  buildRbqmView, buildModuleReportPage, buildChartsPage, buildMetricsPage,
} from './rbqm.js';
import { riskScoreRows, SCORE_NOISE } from './riskscore.js';
import { acceptableRanges } from './ranges.js';
import { domainContents } from './domaincontents.js';
import { groupOverviewInputs, mountGroupOverview, canRender, availableLevels } from './kritable.js';
import { buildOverview, overviewLoading } from './overview.js';
import { buildPipeline } from './pipeline.js';
import { buildPackagesTable } from './packages.js';
import { renderReports } from './reports.js';
import { setFilter, applyFilters, resetFilters } from './filters.js';
import { buildDetailView } from './detail.js';
import { parseYamlMeta } from './parsers.js';
import { buildExplorer, selectArtifact } from './explorer.js';

const state = {
  config: null,
  facts: {},
  route: null,
  compactMode: false,
  sidebarCollapsed: false,
  groupLevel: 'Site',
  workflows: null,
  bundles: new Map(),   // snapshotId -> loaded snapshot data
  renderedSnapshot: null,
  renderedSidebar: null,
};

const els = {};

/* ── data ─────────────────────────────────────────────────────────────────── */

/**
 * Everything the app reads from one snapshot tree, loaded once and cached.
 * Every fetch names its snapshot explicitly, so a bundle can be loaded for any
 * snapshot without disturbing the current context (the overview's change list
 * needs the previous one).
 */
async function snapshotBundle(id) {
  const key = id || '__root__';
  if (state.bundles.has(key)) return state.bundles.get(key);
  const promise = (async () => {
    const [status, manifest, safety, modules, reporting, censusJson] = await Promise.all([
      loadJson('status.json', id).catch(() => null),
      loadCsv('manifest.csv', id).catch(() => []),
      loadSafetyCharts(id).catch(() => null),
      loadJson('output/4_modules/reports.json', id).catch(() => null),
      loadReportingLayer(id).catch(() => ({ results: [], metrics: [], groups: [] })),
      loadJson('output/4_modules/safety_census.json', id).catch(() => null),
    ]);
    // The evidence behind each participant flag, keyed by metric then
    // participant. Discovered from the reporting layer, so a new
    // GroupLevel: Subject metric is picked up without touching this file.
    const evidence = await loadParticipantEvidence(reporting.metrics, id);
    const metrics = metricIndex(reporting.metrics);
    const groups = groupIndex(reporting.groups, 'Site');
    return {
      status,
      manifest,
      safety,
      modules,
      reporting,
      metrics,
      groups,
      census: parseCensus(censusJson),
      evidence,
      summary: summarizeFlags(reporting.results, 'Site'),
      facts: studyFacts(reporting.groups),
      cards: chartCards(safety),
      levels: availableLevels(reporting),
    };
  })();
  state.bundles.set(key, promise);
  return promise;
}

/**
 * Per-participant evidence for every GroupLevel: Subject metric in this
 * snapshot: `output/2_metrics/{ID}/Analysis_Input.csv`, keyed by metric ID then
 * participant. These are one row per participant — a few hundred rows — not the
 * mapped domains they were computed from.
 */
async function loadParticipantEvidence(metricRows, id) {
  const ids = (metricRows || [])
    .filter((m) => String(m.GroupLevel || '') === 'Subject')
    .map((m) => String(m.ID || ''))
    .filter(Boolean);
  const out = {};
  await Promise.all(ids.map(async (metricId) => {
    try {
      const rows = await loadCsv(`output/2_metrics/${metricId}/Analysis_Input.csv`, id);
      out[metricId] = new Map(rows.map((r) => [String(r.SubjectID ?? r.GroupID), r]));
    } catch {
      // A metric with no saved input still flags; it just cannot explain why.
    }
  }));
  return out;
}

/** A bundle for an arbitrary snapshot; the current context is irrelevant. */
const bundleFor = snapshotBundle;

/* ── chrome ───────────────────────────────────────────────────────────────── */

function renderMasthead(bundle) {
  els.masthead.innerHTML = buildMasthead({
    config: state.config,
    facts: bundle?.facts || {},
    snapshots: getSnapshots(),
    currentId: getCurrentSnapshotId(),
    snapshot: getCurrentSnapshot(),
    manifestRows: bundle?.manifest || [],
    pipelineStatus: bundle?.status?.pipeline_status || 'unknown',
  });
  wireMasthead(els.masthead, (id) => {
    if (!setCurrentSnapshot(id)) return;
    window.location.hash = withSnapshot(state.route, id);
    // hashchange may not fire when the hash is unchanged (same view, same
    // snapshot query) — render explicitly.
    render();
  });
}

function renderSidebar(bundle) {
  const domains = state.config?.domains || [];
  const items = sidebarItems(domains, domainContents(domains, bundle));
  const signature = sidebarSignature(items);
  // Rebuilt only when the nav's contents change — a new snapshot can add a
  // report module, and that changes the nested lists. Every other navigation
  // just moves the active marker, so keyboard focus survives it.
  if (state.renderedSidebar !== signature) {
    const remembered = readExpanded();
    els.sidebar.innerHTML = buildSidebar(
      items,
      state.route.view,
      state.sidebarCollapsed,
      remembered.length ? remembered : null,
    );
    applyCollapsed(els.sidebar, state.sidebarCollapsed);
    wireSidebar(els.sidebar, (collapsed) => { state.sidebarCollapsed = collapsed; });
    state.renderedSidebar = signature;
  }
  // The nested page owns the marker when the route is one; `hash` is the route
  // as the router would have built it, which is what the links carry.
  markActive(els.sidebar, state.route.view, state.route.hash);
  decorateLinks(els.sidebar);
}

/**
 * While the app is reading a historical snapshot, every in-app link carries the
 * snapshot forward — so navigating the site "as of ps-001" stays as of ps-001,
 * and any link can be copied out with its context intact.
 */
function decorateLinks(root) {
  const id = getCurrentSnapshotId();
  if (!root || !id || isLatest()) return;
  root.querySelectorAll('a[href^="#/"]').forEach((a) => {
    const r = parseRoute(a.getAttribute('href'));
    if (r.query.snapshot) return;
    a.setAttribute('href', buildHash(r.view, r.params, { ...r.query, snapshot: id }));
  });
}

/* ── views ────────────────────────────────────────────────────────────────── */

/** The snapshot published before the current one, or null at the first. */
function previousSnapshot() {
  const snaps = getSnapshots();
  const idx = snaps.findIndex((s) => s.snapshot_id === getCurrentSnapshotId());
  return idx > 0 ? snaps[idx - 1] : null;
}

/**
 * The needs-case-review queue for a snapshot, ranked. The previous snapshot is
 * loaded only to mark which participants are newly flagged; a first snapshot,
 * or an unreadable previous one, still produces the queue.
 */
async function participantQueue(bundle) {
  const prev = previousSnapshot();
  let prevResults = [];
  if (prev) {
    try {
      prevResults = (await bundleFor(prev.snapshot_id)).reporting.results;
    } catch {
      prevResults = [];
    }
  }
  return reviewQueue({
    results: bundle.reporting.results,
    prevResults,
    hasPrevious: Boolean(prev),
    metrics: bundle.reporting.metrics,
    evidence: bundle.evidence,
  });
}

async function renderOverview(bundle) {
  els.view.innerHTML = overviewLoading();
  const snaps = getSnapshots();
  const currentId = getCurrentSnapshotId();
  const idx = snaps.findIndex((s) => s.snapshot_id === currentId);
  const prevSnapshot = idx > 0 ? snaps[idx - 1] : null;

  let deltas = [];
  if (prevSnapshot) {
    try {
      const prevBundle = await bundleFor(prevSnapshot.snapshot_id);
      deltas = flagDeltas(prevBundle.reporting.results, bundle.reporting.results, 'Site');
    } catch {
      deltas = [];
    }
  }

  els.view.innerHTML = buildOverview({
    summary: bundle.summary,
    cards: bundle.cards,
    safetyBlock: buildSafetyStudyBlock({
      census: bundle.census,
      queue: await participantQueue(bundle),
    }),
    deltas,
    metrics: bundle.metrics,
    groups: bundle.groups,
    prevSnapshot,
    currentSnapshot: getCurrentSnapshot(),
    domains: state.config?.domains || [],
    pipelineStatus: bundle.status?.pipeline_status || 'unknown',
    packageCount: bundle.manifest?.length || 0,
    snapshotCount: snaps.length,
  });
  decorateLinks(els.view);
}

async function renderSafety(bundle) {
  const metricId = safetyMetricId(state.route);
  if (metricId) {
    const queue = queueForMetric(await participantQueue(bundle), metricId);
    els.view.innerHTML = buildMetricPage({
      metric: metricDetail(bundle.reporting.metrics, bundle.reporting.results, metricId),
      queue,
    });
    decorateLinks(els.view);
    return;
  }
  const chartId = safetyChartId(state.route);
  if (!chartId) {
    els.view.innerHTML = buildSafetyOverview({
      census: bundle.census,
      queue: await participantQueue(bundle),
      cards: bundle.cards,
      domain: domain('safety'),
    });
    decorateLinks(els.view);
    return;
  }
  const card = bundle.cards.find((c) => c.id === chartId) || null;
  els.view.innerHTML = buildChartPage(card, domain('safety'));
  decorateLinks(els.view);
  if (card) mountChartFrame(els.view, card, (p) => withBase(p));
}

/**
 * The risk-score rows and the acceptable ranges, derived once per snapshot and
 * kept on the bundle: the RBQM page re-renders on every group-level click, and
 * neither depends on the level being shown.
 */
function rbqmModel(bundle) {
  if (!bundle._rbqm) {
    const rows = riskScoreRows(bundle.reporting, { groupLevel: 'Site' });
    bundle._rbqm = {
      rows,
      ranges: acceptableRanges(bundle.reporting),
      // A "mover" is a site whose score changed by more than the noise floor —
      // the same threshold the chips use, so the tile and the rows agree.
      movers: rows.filter((r) => r.change !== null && Math.abs(r.change) > SCORE_NOISE).length,
      hasHistory: rows.some((r) => r.change !== null),
      previousDate: rows.find((r) => r.previousDate)?.previousDate || null,
    };
  }
  return bundle._rbqm;
}

/** The snapshot id of the snapshot before the one being read, if any. */
function previousSnapshotId() {
  const snaps = getSnapshots();
  const idx = snaps.findIndex((s) => s.snapshot_id === getCurrentSnapshotId());
  return idx > 0 ? snaps[idx - 1].snapshot_id : null;
}

function renderRbqm(bundle) {
  const section = rbqmSection(state.route);
  if (section === 'charts') {
    els.view.innerHTML = buildChartsPage(staticPaths(bundle.modules), domain('rbqm'));
    decorateLinks(els.view);
    return;
  }
  if (section === 'metrics') {
    els.view.innerHTML = buildMetricsPage(bundle.reporting?.metrics || [], domain('rbqm'));
    decorateLinks(els.view);
    return;
  }

  const reportId = rbqmReportId(state.route);
  if (reportId) {
    const report = (bundle.modules?.reports || []).find((r) => r.id === reportId) || null;
    els.view.innerHTML = buildModuleReportPage(report);
    if (report?.html) {
      const frame = els.view.querySelector('.chart-frame');
      const url = withBase(report.html);
      if (frame) frame.src = url;
      const open = els.view.querySelector('[data-chart-open]');
      if (open) open.href = url;
      const path = els.view.querySelector('.chart-frame-path');
      if (path) path.textContent = url;
    }
    decorateLinks(els.view);
    return;
  }

  const levels = bundle.levels?.length ? bundle.levels : ['Site'];
  if (!levels.includes(state.groupLevel)) state.groupLevel = levels[0];
  const inputs = groupOverviewInputs(bundle.reporting, { groupLevel: state.groupLevel });
  // The widget throws rather than degrades on an incomplete input set, so the
  // page decides up front whether it is showing a table or an empty state.
  const renderable = canRender(inputs);

  const model = rbqmModel(bundle);
  const previousLabel = model.previousDate
    ? (previousSnapshotId() || model.previousDate)
    : null;

  const paint = (error) => {
    els.view.innerHTML = buildRbqmView({
      summary: bundle.summary,
      moduleReports: staticPaths(bundle.modules),
      domain: domain('rbqm'),
      groupLevel: state.groupLevel,
      levels,
      groupCount: inputs.groupCount,
      metricCount: inputs.metricMetadata.length,
      empty: !renderable,
      error,
      riskRows: model.rows,
      ranges: model.ranges,
      hasHistory: model.hasHistory,
      previousLabel,
      movers: model.hasHistory ? model.movers : undefined,
      moversNote: model.hasHistory
        ? `risk score moved by more than ${SCORE_NOISE.toFixed(1)}`
        : undefined,
    });
    decorateLinks(els.view);
  };
  paint(null);

  // The widget mounts into the painted page, and remounts whenever the snapshot
  // or the group level changes.
  if (renderable) {
    const res = mountGroupOverview(els.view.querySelector('#kriTable'), inputs, {
      groupClickCallback: () => {},
      metricClickCallback: () => {},
    });
    if (res.error) paint(res.error.message);
  }

  els.view.querySelectorAll('[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.groupLevel = btn.dataset.level;
      renderRbqm(bundle);
    });
  });
}

/** Resolve the 4_modules payload's paths against the current snapshot. */
function staticPaths(modules) {
  if (!modules) return null;
  return {
    reports: modules.reports || [],
    static_charts: (modules.static_charts || []).map((c) => ({ ...c, png: withBase(c.png) })),
  };
}

/* ── data explorer (the original pipeline views, kept working) ────────────── */

async function renderExplorer(bundle) {
  const tab = explorerTab(state.route);
  let h = '<section class="domain-view"><div class="domain-head"><div>';
  h += '<h2 class="domain-title">Config</h2>';
  h += '<p class="domain-sub">How this study is wired: workflow definitions, output data, generated reports and the pinned environment.</p>';
  h += '</div></div>';
  h += buildExplorerNav(tab);
  if (tab === 'workflows') h += buildExplorerToolbar(state.compactMode);
  h += `<div id="explorerBody" class="explorer-body">${'<div class="loading"><span class="spinner"></span> Loading…</div>'}</div>`;
  h += '</section>';
  els.view.innerHTML = h;
  decorateLinks(els.view);

  const body = els.view.querySelector('#explorerBody');

  if (tab === 'workflows') {
    if (!state.workflows) {
      try {
        state.workflows = await loadWorkflows();
      } catch (err) {
        body.innerHTML = `<div class="error-msg">Error loading workflows: ${esc(err.message)}</div>`;
        return;
      }
    }
    mergeStatusIntoPhases(bundle.status);
    body.innerHTML = buildPipeline(state.workflows, state.compactMode);
    body.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => setFilter(btn.dataset.group));
    });
    resetFilters();
    const search = els.view.querySelector('#searchInput');
    if (search) search.addEventListener('input', applyFilters);
    const toggle = els.view.querySelector('#viewToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        state.compactMode = !state.compactMode;
        renderExplorer(bundle);
      });
    }
    body.addEventListener('click', (e) => onWorkflowCardClick(e, bundle));
    return;
  }

  if (tab === 'data') {
    if (!bundle.status) {
      body.innerHTML = '<div class="empty-state"><div class="empty-title">No status.json in this snapshot</div></div>';
      return;
    }
    body.innerHTML = '';
    body.appendChild(buildExplorer(bundle.status));
    return;
  }

  if (tab === 'reports') {
    const data = bundle.modules ? {
      reports: (bundle.modules.reports || []).map((r) => ({ ...r, html: withBase(r.html) })),
      static_charts: (bundle.modules.static_charts || []).map((c) => ({ ...c, png: withBase(c.png) })),
    } : null;
    renderReports(body, data);
    return;
  }

  if (tab === 'packages') {
    body.innerHTML = bundle.manifest?.length
      ? buildPackagesTable(bundle.manifest, getCurrentSnapshot()?.created_at || null)
      : '<div class="empty-state"><div class="empty-title">No manifest.csv in this snapshot</div></div>';
  }
}

function mergeStatusIntoPhases(status) {
  if (!state.workflows) return;
  for (const items of Object.values(state.workflows)) {
    for (const item of items) {
      const key = `${item.Type}_${item.ID}`;
      const wfStatus = status?.workflows?.[key];
      item._steps = wfStatus?.steps || null;
      item._wfStatus = wfStatus?.status || null;
    }
  }
}

function onWorkflowCardClick(e, bundle) {
  const infoBtn = e.target.closest('.card-info-btn');
  if (infoBtn && infoBtn.dataset.path) {
    e.stopPropagation();
    openDetail(infoBtn.dataset.path, bundle);
    return;
  }
  const dataBtn = e.target.closest('.card-data-btn');
  if (!dataBtn) return;
  e.stopPropagation();
  const wfKey = `${dataBtn.dataset.wfType}_${dataBtn.dataset.wfId}`;
  const wf = bundle.status?.workflows?.[wfKey];
  if (!wf?.steps?.length || !wf.phase) return;
  const firstOutput = wf.steps.find((s) => s.status === 'completed' && s.output);
  if (!firstOutput) return;
  const artifactPath = `${wf.phase}/${wf.workflow_id}/${firstOutput.output}.csv`;
  window.location.hash = buildHash('explorer', ['data'], { snapshot: state.route.query.snapshot });
  setTimeout(() => {
    const explorerEl = els.view.querySelector('.explorer-layout');
    if (explorerEl) selectArtifact(explorerEl, artifactPath);
  }, 0);
}

/* ── workflow detail modal ────────────────────────────────────────────────── */

async function openDetail(yamlPath, bundle) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailModalContent');
  modal.style.display = '';
  content.innerHTML = '<div class="loading"><span class="spinner"></span> Loading workflow…</div>';
  document.body.style.overflow = 'hidden';
  try {
    const text = await loadWorkflowYaml(yamlPath);
    let stepStatuses = null;
    if (bundle.status?.workflows) {
      const meta = parseYamlMeta(text);
      const wf = bundle.status.workflows[`${meta.Type}_${meta.ID}`];
      if (wf?.steps) stepStatuses = wf.steps;
    }
    content.innerHTML = buildDetailView(text, yamlPath, stepStatuses, null);
    content.querySelector('.modal-close')?.addEventListener('click', closeDetail);
    const yamlToggle = content.querySelector('.yaml-toggle');
    if (yamlToggle) {
      yamlToggle.addEventListener('click', () => {
        const parsed = content.querySelector('.detail-parsed');
        const yaml = content.querySelector('.detail-yaml');
        const showing = yaml.style.display !== 'none';
        parsed.style.display = showing ? '' : 'none';
        yaml.style.display = showing ? 'none' : '';
        yamlToggle.textContent = showing ? 'Show YAML' : 'Show Details';
      });
    }
  } catch (err) {
    content.innerHTML = `<div class="error-msg">Error loading workflow: ${esc(err.message)}</div>`;
  }
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  document.getElementById('detailModalContent').innerHTML = '';
  document.body.style.overflow = '';
}

/* ── render loop ──────────────────────────────────────────────────────────── */

function domain(key) {
  return (state.config?.domains || []).find((d) => d.key === key) || null;
}

async function render() {
  const previous = state.route;
  state.route = parseRoute(window.location.hash);

  // Moving to another view starts at the top of it; changing only the snapshot
  // (or re-rendering in place) keeps the reader where they were.
  const path = (r) => (r ? `${r.view}/${r.params.join('/')}` : null);
  if (path(previous) !== path(state.route)) window.scrollTo(0, 0);

  // A snapshot carried in the URL wins over the in-memory context.
  const wanted = state.route.query.snapshot;
  if (wanted) setCurrentSnapshot(wanted);

  let bundle;
  try {
    bundle = await snapshotBundle(getCurrentSnapshotId());
  } catch (err) {
    els.view.innerHTML = `<div class="error-msg">Could not read this snapshot: ${esc(err.message)}</div>`;
    return;
  }

  if (state.renderedSnapshot !== getCurrentSnapshotId()) {
    renderMasthead(bundle);
    state.renderedSnapshot = getCurrentSnapshotId();
  }
  renderSidebar(bundle);
  document.title = `${state.config?.study?.label || 'open.gismo'} — ${titleFor(state.route)}`;

  const view = state.route.view;
  if (view === 'safety') return renderSafety(bundle);
  if (view === 'rbqm') return renderRbqm(bundle);
  if (view === 'explorer') return renderExplorer(bundle);
  return renderOverview(bundle);
}

function titleFor(route) {
  const d = domain(route.view);
  if (d) return d.label;
  if (route.view === 'overview') return 'Study Overview';
  if (route.view === 'explorer') return 'Config';
  return route.view.charAt(0).toUpperCase() + route.view.slice(1);
}

/* ── boot ─────────────────────────────────────────────────────────────────── */

export async function boot() {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  els.masthead = document.getElementById('masthead');
  els.sidebar = document.getElementById('sidebar');
  els.view = document.getElementById('view');
  state.sidebarCollapsed = readCollapsed();

  const [config, snapshots] = await Promise.all([
    loadStudyConfig(),
    loadSnapshots().catch(() => []),
  ]);
  state.config = config;
  setSnapshots(snapshots);

  window.addEventListener('hashchange', () => { render(); });
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('detailModal').style.display !== 'none') closeDetail();
  });

  await render();
}
