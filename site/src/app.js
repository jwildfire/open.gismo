/**
 * Application shell — Direction C: a published study site.
 *
 * The masthead (study identity + snapshot timeline + provenance chip) is global
 * chrome; under it a domain switcher selects Overview, one view per domain in
 * the study config registry, Compare, or Explorer (which houses the original
 * pipeline-facing Workflows / Data / Reports / Packages views).
 *
 * All data is fetched from the static snapshot tree; picking a timeline dot
 * re-points every snapshot-scoped fetch at that tree (context.js) and re-renders
 * the current view in place.
 */

import './style.css';
import { esc } from './utils.js';
import {
  loadWorkflows, loadWorkflowYaml, loadSnapshots, loadStudyConfig,
  loadReportingLayer, loadJson, loadCsv, loadText,
} from './data.js';
import {
  setSnapshots, getSnapshots, getCurrentSnapshot, getCurrentSnapshotId, setCurrentSnapshot,
  getSnapshot, withBase, isLatest,
} from './context.js';
import { buildMasthead, wireMasthead } from './masthead.js';
import { buildDomainNav, buildExplorerNav, buildExplorerToolbar } from './domainnav.js';
import { parseRoute, buildHash, explorerTab, safetyChartId, rbqmReportId, withSnapshot } from './router.js';
import {
  summarizeFlags, buildMatrix, metricIndex, groupIndex, flagDeltas, studyFacts,
} from './flags.js';
import { chartCards, buildGallery, buildChartPage, mountChartFrame } from './gallery.js';
import { buildRbqmView, buildModuleReportPage } from './rbqm.js';
import { buildOverview, overviewLoading } from './overview.js';
import { buildCompareView } from './compareview.js';
import {
  artifactInventory, diffInventory, compareContent, summarizeCompare, buildCompareRows, changedRows,
} from './compare.js';
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
  flaggedOnly: true,
  workflows: null,
  bundles: new Map(),   // snapshotId -> loaded snapshot data
  compare: { fromId: null, toId: null, result: null, loading: false, error: null },
  renderedSnapshot: null,
};

const els = {};

/* ── data ─────────────────────────────────────────────────────────────────── */

/**
 * Everything the app reads from one snapshot tree, loaded once and cached.
 * Every fetch names its snapshot explicitly, so a bundle can be loaded for any
 * snapshot without disturbing the current context (the compare view needs two).
 */
async function snapshotBundle(id) {
  const key = id || '__root__';
  if (state.bundles.has(key)) return state.bundles.get(key);
  const promise = (async () => {
    const [status, manifest, safety, modules, reporting] = await Promise.all([
      loadJson('status.json', id).catch(() => null),
      loadCsv('manifest.csv', id).catch(() => []),
      loadJson('output/3_reports/reports.json', id).catch(() => null),
      loadJson('output/4_modules/reports.json', id).catch(() => null),
      loadReportingLayer(id).catch(() => ({ results: [], metrics: [], groups: [] })),
    ]);
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
      summary: summarizeFlags(reporting.results, 'Site'),
      facts: studyFacts(reporting.groups),
      cards: chartCards(safety),
    };
  })();
  state.bundles.set(key, promise);
  return promise;
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

function renderNav() {
  els.nav.innerHTML = buildDomainNav(state.config?.domains || [], state.route.view);
  decorateLinks(els.nav);
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
    deltas,
    metrics: bundle.metrics,
    groups: bundle.groups,
    prevSnapshot,
    currentSnapshot: getCurrentSnapshot(),
    domains: state.config?.domains || [],
  });
  decorateLinks(els.view);
}

function renderSafety(bundle) {
  const chartId = safetyChartId(state.route);
  if (!chartId) {
    els.view.innerHTML = buildGallery(bundle.cards, domain('safety'));
    decorateLinks(els.view);
    return;
  }
  const card = bundle.cards.find((c) => c.id === chartId) || null;
  els.view.innerHTML = buildChartPage(card, domain('safety'));
  decorateLinks(els.view);
  if (card) mountChartFrame(els.view, card, (p) => withBase(p));
}

function renderRbqm(bundle) {
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

  const matrix = buildMatrix(bundle.reporting.results, {
    groupLevel: 'Site',
    flaggedOnly: state.flaggedOnly,
  });
  els.view.innerHTML = buildRbqmView({
    summary: bundle.summary,
    matrix,
    metrics: bundle.metrics,
    groups: bundle.groups,
    moduleReports: bundle.modules,
    domain: domain('rbqm'),
    flaggedOnly: state.flaggedOnly,
  });
  decorateLinks(els.view);
  const toggle = els.view.querySelector('#matrixToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.flaggedOnly = !state.flaggedOnly;
      renderRbqm(bundle);
    });
  }
}

async function renderCompare(bundle) {
  const snaps = getSnapshots();
  if (snaps.length < 2) {
    els.view.innerHTML = '<section class="domain-view"><div class="domain-head"><div>'
      + '<h2 class="domain-title">Compare snapshots</h2>'
      + '<p class="domain-sub">A client-side diff of two published snapshot trees.</p></div></div>'
      + '<div class="empty-state"><div class="empty-title">Only one snapshot is published</div>'
      + '<div class="empty-hint">Comparison needs a second entry in <span class="mono">snapshots.json</span>.</div></div></section>';
    return;
  }

  const q = state.route.query;
  const toId = q.to && getSnapshot(q.to) ? q.to : snaps[snaps.length - 1].snapshot_id;
  const fromId = q.from && getSnapshot(q.from) ? q.from : snaps[snaps.length - 2].snapshot_id;
  state.compare.fromId = fromId;
  state.compare.toId = toId;

  const paint = (extra) => {
    els.view.innerHTML = buildCompareView({
      snapshots: snaps, fromId, toId, groupLevel: 'Site', ...extra,
    });
    decorateLinks(els.view);
    wireCompareControls();
  };

  if (fromId === toId) { paint({}); return; }
  paint({ loading: true });

  try {
    const [prev, curr] = await Promise.all([bundleFor(fromId), bundleFor(toId)]);
    const prevInv = artifactInventory(prev.status, prev.safety);
    const currInv = artifactInventory(curr.status, curr.safety);
    const diff = diffInventory(prevInv, currInv);
    const read = (path, side) => loadText(path, side === 'prev' ? fromId : toId);
    const content = await compareContent(diff.common, read);
    const summary = summarizeCompare(diff, content);
    const rows = changedRows(buildCompareRows(diff, content));
    const deltas = flagDeltas(prev.reporting.results, curr.reporting.results, 'Site');
    paint({ summary, rows, deltas, metrics: curr.metrics, groups: curr.groups });
  } catch (err) {
    paint({ error: `Could not compare snapshots: ${err.message}` });
  }
}

function wireCompareControls() {
  const from = els.view.querySelector('#compareFrom');
  const to = els.view.querySelector('#compareTo');
  const go = () => {
    window.location.hash = buildHash('compare', [], {
      from: from.value,
      to: to.value,
      snapshot: state.route.query.snapshot,
    });
  };
  if (from) from.addEventListener('change', go);
  if (to) to.addEventListener('change', go);
}

/* ── explorer (the original pipeline views, kept working) ─────────────────── */

async function renderExplorer(bundle) {
  const tab = explorerTab(state.route);
  let h = '<section class="domain-view"><div class="domain-head"><div>';
  h += '<h2 class="domain-title">Explorer</h2>';
  h += '<p class="domain-sub">The pipeline behind the domains: workflow definitions, output data, generated reports and the pinned environment.</p>';
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
  if (wanted && getSnapshot(wanted)) setCurrentSnapshot(wanted);

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
  renderNav();
  document.title = `${state.config?.study?.label || 'open.gismo'} — ${titleFor(state.route)}`;

  const view = state.route.view;
  if (view === 'safety') return renderSafety(bundle);
  if (view === 'rbqm') return renderRbqm(bundle);
  if (view === 'compare') return renderCompare(bundle);
  if (view === 'explorer') return renderExplorer(bundle);
  return renderOverview(bundle);
}

function titleFor(route) {
  const d = domain(route.view);
  if (d) return d.label;
  return route.view.charAt(0).toUpperCase() + route.view.slice(1);
}

/* ── boot ─────────────────────────────────────────────────────────────────── */

export async function boot() {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  els.masthead = document.getElementById('masthead');
  els.nav = document.getElementById('domainNav');
  els.view = document.getElementById('view');

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
