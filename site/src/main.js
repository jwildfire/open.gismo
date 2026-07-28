import './style.css';
import { esc } from './utils.js';
import { loadWorkflows, loadWorkflowYaml, loadStatus, loadLog, loadReports } from './data.js';
import { buildPipeline } from './pipeline.js';
import { buildPackagesTable, loadPackages, loadSnapshotDate } from './packages.js';
import { renderReports } from './reports.js';
import { setFilter, applyFilters, resetFilters } from './filters.js';
import { buildDetailView } from './detail.js';
import { parseYamlMeta } from './parsers.js';
import { buildExplorer, selectArtifact } from './explorer.js';

let currentPhases = null;
let compactMode = false;
let currentStatus = null;
let currentLog = null;

function showTab(name) {
  document.getElementById('workflowsTab').style.display = name === 'workflows' ? '' : 'none';
  document.getElementById('explorerTab').style.display = name === 'explorer' ? '' : 'none';
  document.getElementById('reportsTab').style.display = name === 'reports' ? '' : 'none';
  document.getElementById('packagesTab').style.display = name === 'packages' ? '' : 'none';
  document.querySelectorAll('.tab-btn').forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });
}

function renderExplorer() {
  const eTab = document.getElementById('explorerTab');
  if (!currentStatus) {
    eTab.innerHTML = '<div class="loading">No status.json available</div>';
    return;
  }
  eTab.innerHTML = '';
  const explorer = buildExplorer(currentStatus);
  eTab.appendChild(explorer);
}

function renderWorkflows() {
  if (!currentPhases) return;
  const wTab = document.getElementById('workflowsTab');

  wTab.innerHTML = buildPipeline(currentPhases, compactMode);
  wTab.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.group));
  });
  resetFilters();
  updateToggleBtn();
}

function updateToggleBtn() {
  const btn = document.getElementById('viewToggle');
  if (btn) btn.textContent = compactMode ? 'Detailed' : 'Compact';
}

function statusKeyForItem(item) {
  return `${item.Type}_${item.ID}`;
}

function mergeStatusIntoPhases() {
  if (!currentPhases) return;
  for (const items of Object.values(currentPhases)) {
    for (const item of items) {
      const key = statusKeyForItem(item);
      const wfStatus = currentStatus?.workflows?.[key];
      item._steps = wfStatus?.steps || null;
      item._wfStatus = wfStatus?.status || null;
    }
  }
}

async function openDetail(yamlPath) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailModalContent');
  modal.style.display = '';
  content.innerHTML = '<div class="loading"><span class="spinner"></span> Loading workflow…</div>';
  document.body.style.overflow = 'hidden';
  try {
    const text = await loadWorkflowYaml(yamlPath);
    // Look up step statuses for this workflow
    let stepStatuses = null;
    if (currentStatus?.workflows) {
      const meta = parseYamlMeta(text);
      const key = `${meta.Type}_${meta.ID}`;
      const wf = currentStatus.workflows[key];
      if (wf?.steps) stepStatuses = wf.steps;
    }
    content.innerHTML = buildDetailView(text, yamlPath, stepStatuses, currentLog);
    content.querySelector('.modal-close').addEventListener('click', closeDetail);
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

async function init() {
  const wTab = document.getElementById('workflowsTab');
  const pTab = document.getElementById('packagesTab');
  const rTab = document.getElementById('reportsTab');

  try {
    // Load workflows, status, log, packages, and reports in parallel
    const [phases, status, log, pkgResult, reportsResult] = await Promise.allSettled([
      loadWorkflows(),
      loadStatus(),
      loadLog(),
      Promise.all([loadPackages(), loadSnapshotDate()]),
      loadReports(),
    ]);

    // Store status and log
    currentStatus = status.status === 'fulfilled' ? status.value : null;
    currentLog = log.status === 'fulfilled' ? log.value : null;

    // Render workflows
    if (phases.status === 'fulfilled') {
      currentPhases = phases.value;
      if (Object.keys(currentPhases).length === 0) {
        wTab.innerHTML = '<div class="loading">No workflows found</div>';
      } else {
        mergeStatusIntoPhases();
        renderWorkflows();
        document.getElementById('searchInput').value = '';
      }
    } else {
      wTab.innerHTML = `<div class="error-msg">Error loading workflows: ${esc(phases.reason?.message || 'Unknown error')}</div>`;
    }

    // Render explorer
    renderExplorer();

    // Render packages tab
    if (pkgResult.status === 'fulfilled') {
      const [rows, snapDate] = pkgResult.value;
      pTab.innerHTML = buildPackagesTable(rows, snapDate);
    } else {
      pTab.innerHTML = '<div class="loading">No manifest.csv available</div>';
    }

    // Render reports tab (empty state when reports.json is missing)
    renderReports(rTab, reportsResult.status === 'fulfilled' ? reportsResult.value : null);
  } catch (err) {
    wTab.innerHTML = `<div class="error-msg">Could not load project: ${esc(err.message)}</div>`;
  }
}

// Wire up tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// Wire up compact/detailed toggle
document.getElementById('viewToggle').addEventListener('click', () => {
  compactMode = !compactMode;
  renderWorkflows();
});

// Wire up search
document.getElementById('searchInput').addEventListener('input', applyFilters);

// Delegate info-button and data-button clicks on the workflows tab
document.getElementById('workflowsTab').addEventListener('click', (e) => {
  const infoBtn = e.target.closest('.card-info-btn');
  if (infoBtn && infoBtn.dataset.path) {
    e.stopPropagation();
    openDetail(infoBtn.dataset.path);
    return;
  }
  const dataBtn = e.target.closest('.card-data-btn');
  if (dataBtn) {
    e.stopPropagation();
    const wfType = dataBtn.dataset.wfType;
    const wfId = dataBtn.dataset.wfId;
    const wfKey = `${wfType}_${wfId}`;
    const wf = currentStatus?.workflows?.[wfKey];
    if (wf?.steps?.length && wf.phase) {
      const firstOutput = wf.steps.find(s => s.status === 'completed' && s.output);
      if (firstOutput) {
        const artifactPath = `${wf.phase}/${wf.workflow_id}/${firstOutput.output}.csv`;
        showTab('explorer');
        const explorerEl = document.getElementById('explorerTab').querySelector('.explorer-layout');
        if (explorerEl) selectArtifact(explorerEl, artifactPath);
      }
    }
  }
});

// Close modal on overlay click or Escape
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('detailModal').style.display !== 'none') {
    closeDetail();
  }
});

init();
