/**
 * The change chip — how this app says "what moved since the last snapshot".
 *
 * One convention, used by every domain page, settled once here so two pages
 * cannot disagree about what an arrow means:
 *
 *   1. **A glyph and a word, never colour alone.** Colour-only status fails
 *      WCAG 1.4.1, and red/green is the worst possible pair for the commonest
 *      colour vision deficiency. Every chip carries a mark and a word; colour
 *      is the third channel, not the first.
 *   2. **Direction of "bad" comes from the metric, not from the sign of the
 *      delta.** For many KRIs neither direction is inherently good — a query
 *      rate that halves is as much "outside expectation" as one that doubles.
 *      `directionOfBad()` reads that from the metric's own threshold vector.
 *   3. **A directional chip only when the change clears a noise threshold.**
 *      Everything else gets the neutral chip, with the number still available
 *      on hover. This is what keeps a change list short enough to be read:
 *      clinical decision support gives the cautionary base rate — 49–96% of
 *      alerts are overridden, and acceptance drops with every repeat.
 *
 * Three states plus a neutral, which is what EMA's eRMR settled on for the
 * same job.
 */

import { esc } from './utils.js';

/** The vocabulary. `sense` is what the chip says about the study, not the sign. */
export const CHANGE_STATES = {
  worse: { key: 'worse', word: 'worse', glyph: '▲' },
  better: { key: 'better', word: 'better', glyph: '▼' },
  moved: { key: 'moved', word: 'moved', glyph: '◆' },
  none: { key: 'none', word: 'no change', glyph: '=' },
  new: { key: 'new', word: 'new', glyph: '＋' },
};

/**
 * Which direction is bad for a metric, read from its threshold vector.
 *
 * gsm thresholds are signed: `"2,3"` flags only high values, `"-3,-2"` only
 * low ones, `"-2,-1,2,3"` flags both tails — and a both-tails metric has no
 * good direction, only "outside expectation".
 *
 * @param {object|string} metric a Reporting_Metrics row, or its Threshold
 * @returns {'up'|'down'|'both'}
 */
export function directionOfBad(metric) {
  const raw = typeof metric === 'string' ? metric : (metric?.Threshold ?? '');
  const parts = String(raw).split(',').map((p) => Number(p.trim())).filter(Number.isFinite);
  if (!parts.length) return 'up';
  const hasHigh = parts.some((p) => p > 0);
  const hasLow = parts.some((p) => p < 0);
  if (hasHigh && hasLow) return 'both';
  return hasLow ? 'down' : 'up';
}

/**
 * Classify a delta into one of the change states.
 *
 * @param {number|null|undefined} delta  current − previous
 * @param {object} [opts]
 * @param {'up'|'down'|'both'} [opts.badDirection='up']
 * @param {number} [opts.noise=0] deltas at or below this magnitude are neutral
 * @param {boolean} [opts.isNew] no previous value existed
 * @returns {{key:string, word:string, glyph:string, delta:number|null}}
 */
export function classifyChange(delta, opts = {}) {
  const { badDirection = 'up', noise = 0, isNew = false } = opts;
  if (isNew) return { ...CHANGE_STATES.new, delta: null };
  const d = Number(delta);
  if (!Number.isFinite(d)) return { ...CHANGE_STATES.none, delta: null };
  if (Math.abs(d) <= noise) return { ...CHANGE_STATES.none, delta: d };
  if (badDirection === 'both') return { ...CHANGE_STATES.moved, delta: d };
  const worse = badDirection === 'up' ? d > 0 : d < 0;
  const state = worse ? CHANGE_STATES.worse : CHANGE_STATES.better;
  // The glyph always points the way the number went, so a "better" chip on a
  // down-is-bad metric still reads as an increase.
  return { ...state, glyph: d > 0 ? '▲' : '▼', delta: d };
}

/** A delta formatted with its sign, at `digits` decimals. */
export function formatDelta(delta, digits = 1) {
  // Number(null) and Number('') are 0, which would print an absent delta as a
  // real one — the difference between "did not move" and "not known" matters.
  if (delta === null || delta === undefined || delta === '') return '—';
  const d = Number(delta);
  if (!Number.isFinite(d)) return '—';
  const rounded = d.toFixed(digits);
  // -0.0 is a rounding artefact, never a fall.
  if (Number(rounded) === 0) return `0.${'0'.repeat(digits)}`.slice(0, digits ? undefined : 1);
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`;
}

/**
 * Render a chip.
 *
 * @param {object} change from classifyChange
 * @param {object} [opts] { digits, title, showNumber }
 */
export function changeChip(change, opts = {}) {
  const { digits = 1, showNumber = true } = opts;
  const number = change.delta === null ? '' : formatDelta(change.delta, digits);
  // The exact number is on the chip when it is directional and on the title
  // when it is not, so a suppressed change is still auditable.
  const title = opts.title
    || (change.key === 'none' && change.delta !== null
      ? `${formatDelta(change.delta, Math.max(digits, 2))} — below the reporting threshold`
      : '');
  let h = `<span class="chip chip-${esc(change.key)}"${title ? ` title="${esc(title)}"` : ''}>`;
  h += `<span class="chip-glyph" aria-hidden="true">${esc(change.glyph)}</span>`;
  if (showNumber && number && change.key !== 'none') {
    h += `<span class="chip-num num">${esc(number)}</span>`;
  }
  h += `<span class="chip-word">${esc(change.word)}</span>`;
  h += '</span>';
  return h;
}

/** classifyChange + changeChip in one call, for the common case. */
export function renderChange(delta, opts = {}) {
  return changeChip(classifyChange(delta, opts), opts);
}
