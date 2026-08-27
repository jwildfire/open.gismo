import { describe, it, expect } from 'vitest';
import {
  directionOfBad, classifyChange, formatDelta, changeChip, renderChange, CHANGE_STATES,
} from './change.js';

describe('directionOfBad', () => {
  it('reads a one-sided high threshold as up-is-bad', () => {
    expect(directionOfBad({ Threshold: '2,3' })).toBe('up');
  });

  it('reads a one-sided low threshold as down-is-bad', () => {
    expect(directionOfBad({ Threshold: '-3,-2' })).toBe('down');
  });

  it('reads a two-sided threshold as having no good direction', () => {
    expect(directionOfBad({ Threshold: '-2,-1,2,3' })).toBe('both');
  });

  it('accepts the threshold string on its own', () => {
    expect(directionOfBad('-2,-1,2,3')).toBe('both');
  });

  it('defaults to up-is-bad when a metric declares no threshold', () => {
    expect(directionOfBad({})).toBe('up');
    expect(directionOfBad({ Threshold: 'NA' })).toBe('up');
  });
});

describe('classifyChange', () => {
  it('calls a rise on an up-is-bad metric worse', () => {
    expect(classifyChange(5, { badDirection: 'up' }).key).toBe('worse');
  });

  it('calls the same rise on a down-is-bad metric better', () => {
    expect(classifyChange(5, { badDirection: 'down' }).key).toBe('better');
  });

  it('keeps the glyph pointing the way the number went, not the way the news did', () => {
    // A down-is-bad metric that rose is good news and an upward arrow.
    const better = classifyChange(5, { badDirection: 'down' });
    expect(better.key).toBe('better');
    expect(better.glyph).toBe('▲');
  });

  it('calls a move on a two-sided metric neither better nor worse', () => {
    expect(classifyChange(-5, { badDirection: 'both' }).key).toBe('moved');
    expect(classifyChange(5, { badDirection: 'both' }).key).toBe('moved');
  });

  it('suppresses a change that does not clear the noise threshold', () => {
    const c = classifyChange(0.4, { badDirection: 'up', noise: 1 });
    expect(c.key).toBe('none');
    // The number survives suppression — it is on the chip's title, not lost.
    expect(c.delta).toBe(0.4);
  });

  it('treats a missing delta as no change and a new row as new', () => {
    expect(classifyChange(null).key).toBe('none');
    expect(classifyChange(undefined).key).toBe('none');
    expect(classifyChange(NaN).key).toBe('none');
    expect(classifyChange(3, { isNew: true }).key).toBe('new');
  });
});

describe('formatDelta', () => {
  it('always carries a sign', () => {
    expect(formatDelta(7.94)).toBe('+7.9');
    expect(formatDelta(-7.94)).toBe('−7.9');
  });

  it('does not render a rounding artefact as a fall', () => {
    expect(formatDelta(-0.01)).toBe('0.0');
  });

  it('renders an absent delta as an em dash', () => {
    expect(formatDelta(null)).toBe('—');
  });
});

describe('changeChip', () => {
  it('carries a glyph and a word, never colour alone', () => {
    const html = changeChip(classifyChange(7.9, { badDirection: 'up' }));
    expect(html).toContain('▲');
    expect(html).toContain('worse');
    expect(html).toContain('+7.9');
  });

  it('puts the exact number on the title when the change is suppressed', () => {
    const html = changeChip(classifyChange(0.4, { badDirection: 'up', noise: 1 }));
    expect(html).toContain('title="');
    expect(html).toContain('+0.40');
    expect(html).toContain('no change');
  });

  it('escapes a caller-supplied title', () => {
    const html = changeChip(CHANGE_STATES.none, { title: '<script>x</script>' });
    expect(html).not.toContain('<script>');
  });

  it('renderChange is classify + chip', () => {
    expect(renderChange(7.9, { badDirection: 'up' }))
      .toBe(changeChip(classifyChange(7.9, { badDirection: 'up' })));
  });
});
