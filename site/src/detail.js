import { esc } from './utils.js';
import { parseWorkflow } from './parsers.js';
import { PHASES } from './constants.js';
import { buildStatusBadge } from './status.js';
import { buildArtifactViewer } from './artifacts.js';
import { buildLogViewer } from './logs.js';

function phaseColor(yamlPath) {
  const rel = yamlPath.replace('workflows/', '');
  for (const p of PHASES) {
    if (rel.startsWith(p.prefix)) return p.color;
  }
  return '#94a3b8';
}

function buildMetaSection(meta) {
  const skip = new Set(['_stem', '_path']);
  const entries = Object.entries(meta).filter(([k]) => !skip.has(k));
  if (!entries.length) return '';
  let h = '<div class="detail-section"><div class="detail-section-title">Metadata</div><div class="detail-meta-grid">';
  entries.forEach(([k, v]) => {
    h += `<div class="detail-meta-key">${esc(k)}</div><div class="detail-meta-val">${esc(v)}</div>`;
  });
  return h + '</div></div>';
}

function buildSpecSection(spec) {
  const datasets = Object.keys(spec);
  if (!datasets.length) return '';
  let h = '<div class="detail-section"><div class="detail-section-title">Input Spec</div>';
  datasets.forEach(ds => {
    const cols = Object.entries(spec[ds]);
    h += `<div class="detail-spec-ds"><span class="detail-spec-ds-name">${esc(ds)}</span>`;
    if (cols.length) {
      h += '<div class="detail-spec-cols">';
      cols.forEach(([col, props]) => {
        const type = props.type || '';
        const req = props.required || '';
        let badges = '';
        if (type) badges += `<span class="tag tag-identity">${esc(type)}</span>`;
        if (req === 'true') badges += '<span class="tag tag-site">required</span>';
        h += `<div class="detail-spec-col"><span class="detail-spec-col-name">${esc(col)}</span>${badges}</div>`;
      });
      h += '</div>';
    }
    h += '</div>';
  });
  return h + '</div>';
}

function buildStepsSection(steps, stepStatuses) {
  if (!steps.length) return '';
  let h = '<div class="detail-section"><div class="detail-section-title">Steps</div><div class="detail-steps">';
  steps.forEach((step, i) => {
    const params = Object.entries(step.params);
    const statusData = stepStatuses ? stepStatuses[i] : null;
    let badgeHtml = '';
    if (statusData) {
      const tmp = document.createElement('div');
      tmp.appendChild(buildStatusBadge(statusData.status));
      badgeHtml = tmp.innerHTML;
    }
    h += `<div class="detail-step">`;
    h += `<div class="detail-step-num">${i + 1}</div>`;
    h += `<div class="detail-step-body">`;
    h += `<div class="detail-step-output">${esc(step.output)}${badgeHtml}</div>`;
    h += `<div class="detail-step-fn">${esc(step.name)}</div>`;
    if (params.length) {
      h += '<div class="detail-step-params">';
      params.forEach(([k, v]) => {
        h += `<div class="detail-param"><span class="detail-param-key">${esc(k)}:</span> <span class="detail-param-val">${esc(v)}</span></div>`;
      });
      h += '</div>';
    }
    if (statusData && statusData.status === 'failed' && statusData.error) {
      h += `<div class="detail-step-error">${esc(statusData.error)}</div>`;
    }
    // Render artifact viewer for the step (shows disabled state when no status)
    const artifactStep = statusData || { name: step.name, status: 'not_run' };
    const artifactEl = buildArtifactViewer(artifactStep);
    const tmp2 = document.createElement('div');
    tmp2.appendChild(artifactEl);
    h += tmp2.innerHTML;
    h += '</div></div>';
    if (i < steps.length - 1) {
      h += '<div class="detail-step-arrow"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div>';
    }
  });
  return h + '</div></div>';
}

export function buildDetailView(yamlText, yamlPath, stepStatuses, log) {
  const { meta, spec, steps } = parseWorkflow(yamlText);
  const color = phaseColor(yamlPath);
  const id = meta.ID || yamlPath.split('/').pop().replace('.yaml', '');
  const title = meta.Description || meta.Metric || meta.Name || id;
  const escapedYaml = esc(yamlText);
  const workflowKey = `${meta.Type || ''}_${meta.ID || ''}`.replace(/^_/, '');

  let h = '';
  h += `<div class="modal-header"><div class="modal-header-left"><div class="detail-id" style="color:${color}">${esc(id)}</div><div class="detail-title">${esc(title)}</div></div><div class="modal-header-right"><button class="toggle-btn yaml-toggle">Show YAML</button><button class="modal-close" aria-label="Close">&times;</button></div></div>`;
  h += `<div class="modal-body"><div class="detail-parsed">`;
  h += buildMetaSection(meta);
  h += buildSpecSection(spec);
  h += buildStepsSection(steps, stepStatuses);

  // Log viewer section
  const logEl = buildLogViewer(log || null, workflowKey);
  const logTmp = document.createElement('div');
  logTmp.appendChild(logEl);
  h += `<div class="detail-section"><div class="detail-section-title">Execution Log</div>${logTmp.innerHTML}</div>`;

  h += `</div><pre class="detail-yaml" style="display:none">${escapedYaml}</pre></div>`;
  return h;
}
