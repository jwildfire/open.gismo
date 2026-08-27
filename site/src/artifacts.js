import { esc } from './utils.js';

/**
 * Parse CSV text into { headers: string[], rows: string[][] }.
 * Handles quoted fields containing commas.
 */
function parseCsvText(text) {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [], rows: [] };

  const lines = trimmed.split('\n');
  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

/**
 * Build a scrollable data table from CSV text.
 * @param {string} csvText - Raw CSV string
 * @returns {HTMLElement}
 */
export function buildDataTable(csvText) {
  const container = document.createElement('div');
  container.style.overflow = 'auto';

  const { headers, rows } = parseCsvText(csvText || '');

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

/**
 * Build an artifact viewer for a workflow step.
 * For completed/failed steps: lists inputs and outputs by domain.
 * For not_run steps: shows disabled state with "no artifacts" message.
 *
 * @param {object} step - Step object with name, status, inputs, outputs, error
 * @returns {HTMLElement}
 */
export function buildArtifactViewer(step) {
  const el = document.createElement('div');
  el.className = 'artifact-viewer';

  if (step.status === 'not_run') {
    el.classList.add('artifact-viewer-disabled');
    el.setAttribute('aria-disabled', 'true');
    const msg = document.createElement('p');
    msg.textContent = 'No artifacts available — step has not run.';
    el.appendChild(msg);
    return el;
  }

  // Inputs section
  const inputSection = document.createElement('div');
  inputSection.className = 'artifact-section';
  const inputTitle = document.createElement('div');
  inputTitle.className = 'artifact-section-title';
  inputTitle.textContent = 'Inputs';
  inputSection.appendChild(inputTitle);

  if (step.inputs && step.inputs.length) {
    step.inputs.forEach(artifact => {
      const item = document.createElement('div');
      item.className = 'artifact-item';
      item.textContent = artifact.domain;
      inputSection.appendChild(item);
    });
  }
  el.appendChild(inputSection);

  // Outputs section
  const outputSection = document.createElement('div');
  outputSection.className = 'artifact-section';
  const outputTitle = document.createElement('div');
  outputTitle.className = 'artifact-section-title';
  outputTitle.textContent = 'Outputs';
  outputSection.appendChild(outputTitle);

  if (step.outputs && step.outputs.length) {
    step.outputs.forEach(artifact => {
      const item = document.createElement('div');
      item.className = 'artifact-item';
      item.textContent = artifact.domain;
      outputSection.appendChild(item);
    });
  }
  el.appendChild(outputSection);

  return el;
}
