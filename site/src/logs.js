import { esc } from './utils.js';

/**
 * Build a single log entry element.
 * @param {{ timestamp: string, stream: 'stdout'|'stderr', message: string }} entry
 * @returns {HTMLElement}
 */
export function buildLogEntry(entry) {
  const el = document.createElement('div');
  const cssClass = entry.stream === 'stderr' ? 'log-stderr' : 'log-stdout';
  el.className = cssClass;

  const ts = document.createElement('span');
  ts.className = 'log-timestamp';
  const d = new Date(entry.timestamp);
  ts.textContent = d.toISOString().slice(11, 19);
  el.appendChild(ts);

  const msg = document.createElement('span');
  msg.className = 'log-message';
  msg.textContent = ' ' + entry.message;
  el.appendChild(msg);

  return el;
}

/**
 * Build a log viewer for a workflow within a project snapshot log.
 * @param {object|null|undefined} log - Full log.json object
 * @param {string} workflowId - Workflow key to display
 * @returns {HTMLElement}
 */
export function buildLogViewer(log, workflowId) {
  const el = document.createElement('div');
  el.className = 'log-viewer';

  // Guard: null/undefined log
  if (!log || !log.workflows) {
    el.textContent = 'No logs available.';
    return el;
  }

  const wf = log.workflows[workflowId];
  if (!wf) {
    el.textContent = 'No logs available.';
    return el;
  }

  // Check if there's any content at all
  const hasStdout = wf.stdout && wf.stdout.trim().length > 0;
  const hasStderr = wf.stderr && wf.stderr.trim().length > 0;
  const hasSteps = wf.steps && wf.steps.length > 0;
  const stepsHaveContent = hasSteps && wf.steps.some(
    s => (s.stdout && s.stdout.trim()) || (s.stderr && s.stderr.trim())
  );

  if (!hasStdout && !hasStderr && !stepsHaveContent) {
    el.textContent = 'No logs available.';
    return el;
  }

  // Workflow timing header
  const header = document.createElement('div');
  header.className = 'log-header';
  header.textContent = `${workflowId} — ${wf.duration_seconds}s`;
  el.appendChild(header);

  // Workflow-level stdout/stderr
  if (hasStdout) {
    wf.stdout.split('\n').forEach(line => {
      if (line.trim()) {
        el.appendChild(buildLogEntry({
          timestamp: wf.started_at,
          stream: 'stdout',
          message: line,
        }));
      }
    });
  }
  if (hasStderr) {
    wf.stderr.split('\n').forEach(line => {
      if (line.trim()) {
        el.appendChild(buildLogEntry({
          timestamp: wf.started_at,
          stream: 'stderr',
          message: line,
        }));
      }
    });
  }

  // Steps sorted by started_at (chronological)
  if (hasSteps) {
    const sorted = [...wf.steps].sort(
      (a, b) => new Date(a.started_at) - new Date(b.started_at)
    );

    sorted.forEach(step => {
      const stepSection = document.createElement('div');
      stepSection.className = 'log-step';

      const stepHeader = document.createElement('div');
      stepHeader.className = 'log-step-header';
      stepHeader.textContent = `${step.name} — ${step.duration_seconds}s`;
      stepSection.appendChild(stepHeader);

      if (step.stdout && step.stdout.trim()) {
        step.stdout.split('\n').forEach(line => {
          if (line.trim()) {
            stepSection.appendChild(buildLogEntry({
              timestamp: step.started_at,
              stream: 'stdout',
              message: line,
            }));
          }
        });
      }

      if (step.stderr && step.stderr.trim()) {
        step.stderr.split('\n').forEach(line => {
          if (line.trim()) {
            stepSection.appendChild(buildLogEntry({
              timestamp: step.started_at,
              stream: 'stderr',
              message: line,
            }));
          }
        });
      }

      el.appendChild(stepSection);
    });
  }

  return el;
}
