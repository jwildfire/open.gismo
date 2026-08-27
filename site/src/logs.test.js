import { describe, it, expect, beforeEach } from 'vitest';
import { buildLogViewer, buildLogEntry } from './logs.js';

/* ── helpers ─────────────────────────────────────────────────── */

function makeLog(overrides = {}) {
  return {
    snapshot_id: 'ps-001',
    started_at: '2025-01-15T10:30:00Z',
    ended_at: '2025-01-15T10:45:23Z',
    duration_seconds: 923,
    workflows: {
      Mapping_AE: {
        started_at: '2025-01-15T10:30:05Z',
        ended_at: '2025-01-15T10:30:12Z',
        duration_seconds: 7,
        stdout: '[INFO] Initializing Mapping_AE Workflow\n[INFO] Done',
        stderr: '',
        steps: [
          {
            name: 'gsm.mapping::AE_Map_Raw',
            started_at: '2025-01-15T10:30:06Z',
            ended_at: '2025-01-15T10:30:12Z',
            duration_seconds: 6,
            stdout: '[INFO] Calling gsm.mapping::AE_Map_Raw\n[INFO] 150x8 data.frame saved',
            stderr: '',
          },
        ],
      },
      ...overrides,
    },
  };
}

function makeFailedLog() {
  return {
    snapshot_id: 'ps-001',
    started_at: '2025-01-15T10:30:00Z',
    ended_at: '2025-01-15T10:45:23Z',
    duration_seconds: 923,
    workflows: {
      Metric_kri0001: {
        started_at: '2025-01-15T10:31:00Z',
        ended_at: '2025-01-15T10:31:15Z',
        duration_seconds: 15,
        stdout: '[INFO] Initializing Metric_kri0001',
        stderr: 'Error in Analyze_NormalApprox: insufficient data for analysis',
        steps: [
          {
            name: 'gsm.core::Input_Rate',
            started_at: '2025-01-15T10:31:01Z',
            ended_at: '2025-01-15T10:31:08Z',
            duration_seconds: 7,
            stdout: '[INFO] Calling gsm.core::Input_Rate',
            stderr: '',
          },
          {
            name: 'gsm.core::Analyze_NormalApprox',
            started_at: '2025-01-15T10:31:08Z',
            ended_at: '2025-01-15T10:31:15Z',
            duration_seconds: 7,
            stdout: '[INFO] Calling gsm.core::Analyze_NormalApprox',
            stderr: 'Error in Analyze_NormalApprox: insufficient data for analysis',
          },
        ],
      },
    },
  };
}

const WORKFLOW_ID = 'Mapping_AE';

/* ── buildLogViewer — renders log entries in chronological order ── */

describe('buildLogViewer — chronological order', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns an HTMLElement', () => {
    const el = buildLogViewer(makeLog(), WORKFLOW_ID);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('renders workflow-level stdout content', () => {
    const el = buildLogViewer(makeLog(), WORKFLOW_ID);
    expect(el.textContent).toContain('[INFO] Initializing Mapping_AE Workflow');
  });

  it('renders step log entries', () => {
    const el = buildLogViewer(makeLog(), WORKFLOW_ID);
    expect(el.textContent).toContain('gsm.mapping::AE_Map_Raw');
  });

  it('renders step stdout content', () => {
    const el = buildLogViewer(makeLog(), WORKFLOW_ID);
    expect(el.textContent).toContain('[INFO] Calling gsm.mapping::AE_Map_Raw');
  });

  it('renders entries in chronological order (earlier timestamps first)', () => {
    const log = {
      snapshot_id: 'ps-001',
      started_at: '2025-01-15T10:30:00Z',
      ended_at: '2025-01-15T10:45:00Z',
      duration_seconds: 900,
      workflows: {
        MultiStep: {
          started_at: '2025-01-15T10:30:00Z',
          ended_at: '2025-01-15T10:35:00Z',
          duration_seconds: 300,
          stdout: '',
          stderr: '',
          steps: [
            {
              name: 'step_first',
              started_at: '2025-01-15T10:30:01Z',
              ended_at: '2025-01-15T10:30:05Z',
              duration_seconds: 4,
              stdout: 'first output',
              stderr: '',
            },
            {
              name: 'step_second',
              started_at: '2025-01-15T10:30:06Z',
              ended_at: '2025-01-15T10:30:10Z',
              duration_seconds: 4,
              stdout: 'second output',
              stderr: '',
            },
            {
              name: 'step_third',
              started_at: '2025-01-15T10:30:11Z',
              ended_at: '2025-01-15T10:30:15Z',
              duration_seconds: 4,
              stdout: 'third output',
              stderr: '',
            },
          ],
        },
      },
    };
    const el = buildLogViewer(log, 'MultiStep');
    const text = el.textContent;
    const idxFirst = text.indexOf('first output');
    const idxSecond = text.indexOf('second output');
    const idxThird = text.indexOf('third output');
    expect(idxFirst).toBeLessThan(idxSecond);
    expect(idxSecond).toBeLessThan(idxThird);
  });

  it('displays execution timing information', () => {
    const el = buildLogViewer(makeLog(), WORKFLOW_ID);
    const text = el.textContent;
    // Should contain some timing info (duration or timestamps)
    expect(text).toMatch(/\d/); // at minimum contains numeric timing data
  });

  it('handles null log gracefully with "no logs available" message', () => {
    const el = buildLogViewer(null, WORKFLOW_ID);
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });

  it('handles empty workflows object with "no logs available" message', () => {
    const log = {
      snapshot_id: 'ps-001',
      started_at: '2025-01-15T10:30:00Z',
      ended_at: '2025-01-15T10:30:00Z',
      duration_seconds: 0,
      workflows: {},
    };
    const el = buildLogViewer(log, 'NonExistent');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });

  it('handles missing workflowId in log with "no logs available" message', () => {
    const el = buildLogViewer(makeLog(), 'NonExistentWorkflow');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });
});

/* ── buildLogEntry — stdout/stderr with distinct CSS classes ──── */

describe('buildLogEntry — stdout/stderr styling', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns an HTMLElement', () => {
    const entry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stdout',
      message: 'Hello from stdout',
    };
    const el = buildLogEntry(entry);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('renders stdout entry with a stdout CSS class', () => {
    const entry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stdout',
      message: 'Standard output message',
    };
    const el = buildLogEntry(entry);
    const hasStdoutClass =
      el.classList.contains('log-stdout') ||
      el.querySelector('.log-stdout') !== null;
    expect(hasStdoutClass).toBe(true);
  });

  it('renders stderr entry with a stderr CSS class', () => {
    const entry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stderr',
      message: 'Error output message',
    };
    const el = buildLogEntry(entry);
    const hasStderrClass =
      el.classList.contains('log-stderr') ||
      el.querySelector('.log-stderr') !== null;
    expect(hasStderrClass).toBe(true);
  });

  it('uses distinct CSS classes for stdout vs stderr', () => {
    const stdoutEntry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stdout',
      message: 'stdout msg',
    };
    const stderrEntry = {
      timestamp: '2025-01-15T10:30:07Z',
      stream: 'stderr',
      message: 'stderr msg',
    };
    const stdoutEl = buildLogEntry(stdoutEntry);
    const stderrEl = buildLogEntry(stderrEntry);

    const stdoutClasses = [...stdoutEl.classList].join(' ') +
      [...stdoutEl.querySelectorAll('*')].map(e => [...e.classList].join(' ')).join(' ');
    const stderrClasses = [...stderrEl.classList].join(' ') +
      [...stderrEl.querySelectorAll('*')].map(e => [...e.classList].join(' ')).join(' ');

    // stdout should have log-stdout but not log-stderr
    expect(stdoutClasses).toContain('log-stdout');
    expect(stdoutClasses).not.toContain('log-stderr');
    // stderr should have log-stderr but not log-stdout
    expect(stderrClasses).toContain('log-stderr');
    expect(stderrClasses).not.toContain('log-stdout');
  });

  it('renders the message content', () => {
    const entry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stdout',
      message: 'This is the log message content',
    };
    const el = buildLogEntry(entry);
    expect(el.textContent).toContain('This is the log message content');
  });

  it('renders the timestamp', () => {
    const entry = {
      timestamp: '2025-01-15T10:30:06Z',
      stream: 'stdout',
      message: 'msg',
    };
    const el = buildLogEntry(entry);
    expect(el.textContent).toContain('10:30:06');
  });
});

/* ── failed step log entries — highlighted error sections ──────── */

describe('buildLogViewer — failed step error highlighting', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('highlights stderr content in failed step logs', () => {
    const log = makeFailedLog();
    const el = buildLogViewer(log, 'Metric_kri0001');
    // The stderr content should be present
    expect(el.textContent).toContain('Error in Analyze_NormalApprox: insufficient data for analysis');
  });

  it('applies error/highlight CSS class to stderr sections', () => {
    const log = makeFailedLog();
    const el = buildLogViewer(log, 'Metric_kri0001');
    const html = el.innerHTML;
    // Should have error-related CSS class on stderr content
    const hasErrorClass =
      html.includes('log-stderr') ||
      html.includes('log-error') ||
      html.includes('log-highlight');
    expect(hasErrorClass).toBe(true);
  });

  it('renders both stdout and stderr for a failed step', () => {
    const log = makeFailedLog();
    const el = buildLogViewer(log, 'Metric_kri0001');
    const text = el.textContent;
    // Should contain stdout from the failed step
    expect(text).toContain('[INFO] Calling gsm.core::Analyze_NormalApprox');
    // Should contain stderr from the failed step
    expect(text).toContain('Error in Analyze_NormalApprox: insufficient data for analysis');
  });

  it('distinguishes error sections from normal output visually', () => {
    const log = makeFailedLog();
    const el = buildLogViewer(log, 'Metric_kri0001');
    // Find elements with stderr/error styling
    const errorEls = el.querySelectorAll('.log-stderr, .log-error, .log-highlight');
    expect(errorEls.length).toBeGreaterThan(0);
  });
});

/* ── not_run step — "no logs available" message ──────────────── */

describe('buildLogViewer — not_run / no logs available', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows "no logs available" when log is null', () => {
    const el = buildLogViewer(null, 'AnyWorkflow');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });

  it('shows "no logs available" when log is undefined', () => {
    const el = buildLogViewer(undefined, 'AnyWorkflow');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });

  it('shows "no logs available" when workflow has no entry in log', () => {
    const log = makeLog();
    const el = buildLogViewer(log, 'WorkflowThatDoesNotExist');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });

  it('shows "no logs available" when workflow steps array is empty', () => {
    const log = {
      snapshot_id: 'ps-001',
      started_at: '2025-01-15T10:30:00Z',
      ended_at: '2025-01-15T10:30:00Z',
      duration_seconds: 0,
      workflows: {
        EmptyWorkflow: {
          started_at: '2025-01-15T10:30:00Z',
          ended_at: '2025-01-15T10:30:00Z',
          duration_seconds: 0,
          stdout: '',
          stderr: '',
          steps: [],
        },
      },
    };
    const el = buildLogViewer(log, 'EmptyWorkflow');
    expect(el).toBeInstanceOf(HTMLElement);
    // With empty steps and empty stdout/stderr, should indicate no meaningful logs
    expect(el.textContent.toLowerCase()).toMatch(/no logs/);
  });
});
