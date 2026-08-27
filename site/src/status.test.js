import { describe, it, expect, beforeEach } from 'vitest';
import { buildStatusBadge, buildStatusSummary } from './status.js';

describe('buildStatusBadge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a completed badge with checkmark icon, green color, and .status-completed class', () => {
    const el = buildStatusBadge('completed');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains('status-completed')).toBe(true);
    expect(el.textContent).toContain('✓');
    expect(el.style.color).toBe('rgb(34, 197, 94)'); // #22c55e
  });

  it('renders a failed badge with cross icon, red color, and .status-failed class', () => {
    const el = buildStatusBadge('failed');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains('status-failed')).toBe(true);
    expect(el.textContent).toContain('✗');
    expect(el.style.color).toBe('rgb(239, 68, 68)'); // #ef4444
  });

  it('renders a not_run badge with dash icon, gray color, and .status-not-run class', () => {
    const el = buildStatusBadge('not_run');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains('status-not-run')).toBe(true);
    expect(el.textContent).toContain('—');
    expect(el.style.color).toBe('rgb(156, 163, 184)'); // #9ca3b8
  });

  it('uses distinct CSS classes for each status', () => {
    const completed = buildStatusBadge('completed');
    const failed = buildStatusBadge('failed');
    const notRun = buildStatusBadge('not_run');
    const classes = [
      [...completed.classList],
      [...failed.classList],
      [...notRun.classList],
    ];
    // Each should have a unique status class
    expect(classes[0]).not.toEqual(classes[1]);
    expect(classes[1]).not.toEqual(classes[2]);
    expect(classes[0]).not.toEqual(classes[2]);
  });
});

describe('buildStatusSummary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders aggregate counts that sum to total steps', () => {
    const steps = [
      { name: 'step1', status: 'completed', error: null },
      { name: 'step2', status: 'completed', error: null },
      { name: 'step3', status: 'failed', error: 'some error' },
      { name: 'step4', status: 'not_run', error: null },
      { name: 'step5', status: 'not_run', error: null },
    ];
    const el = buildStatusSummary(steps);
    expect(el).toBeInstanceOf(HTMLElement);
    const text = el.textContent;
    // Should contain counts for each status
    expect(text).toContain('2');  // 2 completed
    expect(text).toContain('1');  // 1 failed
    // Total counts should sum to 5
    const numbers = text.match(/\d+/g).map(Number);
    const sum = numbers.reduce((a, b) => a + b, 0);
    // The sum of all status counts should equal total steps
    expect(sum).toBe(steps.length);
  });

  it('renders correct counts for all-completed steps', () => {
    const steps = [
      { name: 'step1', status: 'completed', error: null },
      { name: 'step2', status: 'completed', error: null },
      { name: 'step3', status: 'completed', error: null },
    ];
    const el = buildStatusSummary(steps);
    const text = el.textContent;
    expect(text).toContain('3');
  });

  it('renders correct counts for mixed statuses', () => {
    const steps = [
      { name: 'a', status: 'completed', error: null },
      { name: 'b', status: 'failed', error: 'err' },
      { name: 'c', status: 'not_run', error: null },
    ];
    const el = buildStatusSummary(steps);
    const text = el.textContent;
    // Each count should be 1
    expect(text).toMatch(/1/);
  });

  it('handles empty steps array', () => {
    const el = buildStatusSummary([]);
    expect(el).toBeInstanceOf(HTMLElement);
    // All counts should be 0, summing to 0
    const numbers = el.textContent.match(/\d+/g);
    if (numbers) {
      const sum = numbers.map(Number).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    }
  });
});

describe('failed status error message', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('displays error message for failed status when error is provided', () => {
    const steps = [
      { name: 'step1', status: 'failed', error: 'Error in Analyze: insufficient data' },
    ];
    const el = buildStatusSummary(steps);
    // The summary or its children should contain the error message
    // Check that the error message is accessible somewhere in the rendered output
    expect(el.textContent).toContain('Error in Analyze: insufficient data');
  });

  it('does not display error message for completed status', () => {
    const steps = [
      { name: 'step1', status: 'completed', error: null },
    ];
    const el = buildStatusSummary(steps);
    expect(el.textContent).not.toContain('Error');
  });
});

describe('status indicators in step execution order', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders status indicators in the same order as the steps array', () => {
    const steps = [
      { name: 'first_step', status: 'completed', error: null },
      { name: 'second_step', status: 'failed', error: 'fail msg' },
      { name: 'third_step', status: 'not_run', error: null },
    ];
    const el = buildStatusSummary(steps);
    // Find all status badge elements within the summary
    const badges = el.querySelectorAll('[class*="status-"]');
    expect(badges.length).toBeGreaterThanOrEqual(3);
    // Verify order matches: completed, failed, not_run
    const classOrder = [...badges].map(b => {
      if (b.classList.contains('status-completed')) return 'completed';
      if (b.classList.contains('status-failed')) return 'failed';
      if (b.classList.contains('status-not-run')) return 'not_run';
      return 'unknown';
    });
    expect(classOrder[0]).toBe('completed');
    expect(classOrder[1]).toBe('failed');
    expect(classOrder[2]).toBe('not_run');
  });

  it('preserves order with multiple steps of the same status', () => {
    const steps = [
      { name: 'a', status: 'not_run', error: null },
      { name: 'b', status: 'completed', error: null },
      { name: 'c', status: 'not_run', error: null },
      { name: 'd', status: 'failed', error: 'err' },
    ];
    const el = buildStatusSummary(steps);
    const badges = el.querySelectorAll('[class*="status-"]');
    expect(badges.length).toBeGreaterThanOrEqual(4);
    const classOrder = [...badges].map(b => {
      if (b.classList.contains('status-completed')) return 'completed';
      if (b.classList.contains('status-failed')) return 'failed';
      if (b.classList.contains('status-not-run')) return 'not_run';
      return 'unknown';
    });
    expect(classOrder[0]).toBe('not_run');
    expect(classOrder[1]).toBe('completed');
    expect(classOrder[2]).toBe('not_run');
    expect(classOrder[3]).toBe('failed');
  });
});
