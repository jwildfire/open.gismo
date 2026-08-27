import { describe, it, expect, beforeEach } from 'vitest';
import { buildArtifactViewer, buildDataTable } from './artifacts.js';

/* ── helpers ─────────────────────────────────────────────────── */

function completedStep(overrides = {}) {
  return {
    name: 'gsm.mapping::AE_Map_Raw',
    status: 'completed',
    inputs: [{ domain: 'Raw_AE', path: 'input/Raw_AE.csv' }],
    outputs: [{ domain: 'Mapped_AE', path: '1_mappings/AE/Mapped_AE.csv' }],
    error: null,
    ...overrides,
  };
}

function failedStep(overrides = {}) {
  return {
    name: 'gsm.core::Analyze_NormalApprox',
    status: 'failed',
    inputs: [{ domain: 'Analysis_Input', path: '2_metrics/kri0001/Analysis_Input.csv' }],
    outputs: [{ domain: 'Analysis_Summary', path: '2_metrics/kri0001/Analysis_Summary.csv' }],
    error: 'Error in Analyze_NormalApprox: insufficient data',
    ...overrides,
  };
}

function notRunStep(overrides = {}) {
  return {
    name: 'gsm.reporting::Report_KRI',
    status: 'not_run',
    inputs: [],
    outputs: [],
    error: null,
    ...overrides,
  };
}




/* ── buildArtifactViewer — completed steps ───────────────────── */

describe('buildArtifactViewer — completed step', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns an HTMLElement', () => {
    const el = buildArtifactViewer(completedStep());
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('lists every input artifact by domain name', () => {
    const step = completedStep({
      inputs: [
        { domain: 'Raw_AE', path: 'input/Raw_AE.csv' },
        { domain: 'Raw_DM', path: 'input/Raw_DM.csv' },
      ],
    });
    const el = buildArtifactViewer(step);
    const text = el.textContent;
    expect(text).toContain('Raw_AE');
    expect(text).toContain('Raw_DM');
  });

  it('lists every output artifact by domain name', () => {
    const step = completedStep({
      outputs: [
        { domain: 'Mapped_AE', path: '1_mappings/AE/Mapped_AE.csv' },
        { domain: 'Mapped_DM', path: '1_mappings/DM/Mapped_DM.csv' },
      ],
    });
    const el = buildArtifactViewer(step);
    const text = el.textContent;
    expect(text).toContain('Mapped_AE');
    expect(text).toContain('Mapped_DM');
  });

  it('contains an inputs section and an outputs section', () => {
    const el = buildArtifactViewer(completedStep());
    const html = el.innerHTML.toLowerCase();
    expect(html).toContain('input');
    expect(html).toContain('output');
  });

  it('displays artifact path information', () => {
    const step = completedStep();
    const el = buildArtifactViewer(step);
    const text = el.textContent;
    expect(text).toContain('Raw_AE');
    expect(text).toContain('Mapped_AE');
  });
});

/* ── buildArtifactViewer — failed steps (partial outputs) ──── */

describe('buildArtifactViewer — failed step with partial outputs', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns an HTMLElement for a failed step', () => {
    const el = buildArtifactViewer(failedStep());
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('lists input artifacts for a failed step', () => {
    const el = buildArtifactViewer(failedStep());
    expect(el.textContent).toContain('Analysis_Input');
  });

  it('lists partial output artifacts produced before failure', () => {
    const step = failedStep({
      outputs: [
        { domain: 'Partial_Result', path: '2_metrics/kri0001/Partial_Result.csv' },
      ],
    });
    const el = buildArtifactViewer(step);
    expect(el.textContent).toContain('Partial_Result');
  });

  it('shows output artifacts even when step failed', () => {
    const step = failedStep();
    const el = buildArtifactViewer(step);
    // The output section should still be present and list the artifact
    expect(el.textContent).toContain('Analysis_Summary');
  });
});

/* ── buildArtifactViewer — not_run step (disabled) ──────────── */

describe('buildArtifactViewer — not_run step', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns an HTMLElement for a not_run step', () => {
    const el = buildArtifactViewer(notRunStep());
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('displays a message indicating no artifacts are available', () => {
    const el = buildArtifactViewer(notRunStep());
    const text = el.textContent.toLowerCase();
    expect(text).toMatch(/no artifacts|not available|disabled/);
  });

  it('does not list any input or output artifact domains', () => {
    const step = notRunStep({
      inputs: [{ domain: 'ShouldNotShow', path: 'x.csv' }],
      outputs: [{ domain: 'AlsoHidden', path: 'y.csv' }],
    });
    const el = buildArtifactViewer(step);
    expect(el.textContent).not.toContain('ShouldNotShow');
    expect(el.textContent).not.toContain('AlsoHidden');
  });

  it('has a disabled visual indicator (CSS class or attribute)', () => {
    const el = buildArtifactViewer(notRunStep());
    const isDisabled =
      el.classList.contains('artifact-viewer-disabled') ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.querySelector('[disabled]') !== null;
    expect(isDisabled).toBe(true);
  });
});

/* ── buildDataTable ─────────────────────────────────────────── */

describe('buildDataTable', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const simpleCsv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';

  it('returns an HTMLElement', () => {
    const el = buildDataTable(simpleCsv);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('renders a <table> element inside the container', () => {
    const el = buildDataTable(simpleCsv);
    const table = el.querySelector('table');
    expect(table).not.toBeNull();
  });

  it('renders header cells matching CSV column names', () => {
    const el = buildDataTable(simpleCsv);
    const ths = el.querySelectorAll('th');
    const headers = [...ths].map(th => th.textContent.trim());
    expect(headers).toContain('name');
    expect(headers).toContain('age');
    expect(headers).toContain('city');
  });

  it('renders one data row per CSV data line', () => {
    const el = buildDataTable(simpleCsv);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('renders correct cell values', () => {
    const el = buildDataTable(simpleCsv);
    const cells = el.querySelectorAll('tbody td');
    const values = [...cells].map(td => td.textContent.trim());
    expect(values).toContain('Alice');
    expect(values).toContain('30');
    expect(values).toContain('NYC');
    expect(values).toContain('Bob');
    expect(values).toContain('25');
    expect(values).toContain('LA');
  });

  it('handles quoted CSV fields', () => {
    const csv = '"col1","col2"\n"hello, world","test"';
    const el = buildDataTable(csv);
    const cells = el.querySelectorAll('tbody td');
    const values = [...cells].map(td => td.textContent.trim());
    expect(values).toContain('hello, world');
    expect(values).toContain('test');
  });

  it('is scrollable (has overflow styling or wrapper)', () => {
    const el = buildDataTable(simpleCsv);
    const style = el.style.overflow || el.style.overflowX || el.style.overflowY;
    const hasScrollClass = el.classList.contains('data-table-scroll') ||
      el.classList.contains('scrollable');
    expect(style === 'auto' || style === 'scroll' || hasScrollClass).toBe(true);
  });

  it('handles empty CSV gracefully', () => {
    const el = buildDataTable('');
    expect(el).toBeInstanceOf(HTMLElement);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(0);
  });

  it('handles CSV with only headers (no data rows)', () => {
    const el = buildDataTable('col1,col2,col3');
    expect(el).toBeInstanceOf(HTMLElement);
    const ths = el.querySelectorAll('th');
    expect(ths.length).toBeGreaterThanOrEqual(1);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(0);
  });
});
