/**
 * Funnel plot — the standard statistical answer to "is this site really an
 * outlier".
 *
 * Spiegelhalter's 2005 paper proposes funnel plots specifically to *avoid*
 * ranking institutions into league tables: a site's indicator is plotted
 * against its precision, and control limits that widen as precision falls make
 * the difference between "high score" and "high score on two participants"
 * visible without arithmetic. Goldstein and Spiegelhalter had already shown
 * that once uncertainty is accounted for, ranks largely dissolve.
 *
 * One honest caveat, stated on the panel as well as here: the site risk score
 * is a weighted flag sum expressed as a percentage, not a rate with a
 * participant denominator. The limits below treat it as a percentage whose
 * precision grows with the site's participant count — a normal approximation,
 * and the reason this chart is a check on the ranking rather than a test.
 *
 * Everything is drawn as inline SVG from pure geometry, so the shape is
 * testable without a browser.
 */

import { esc } from './utils.js';

/** Spiegelhalter's usual pair: 95% and 99.8% (2 and 3 sigma, near enough). */
export const FUNNEL_LIMITS = [
  { key: 'inner', z: 1.96, label: '95%' },
  { key: 'outer', z: 3.09, label: '99.8%' },
];

/**
 * The study mean the funnel is centred on: the total weight actually flagged
 * across all sites over the total that could have been, which is the pooled
 * rate rather than the mean of the site rates. A mean of rates would let a
 * two-participant site pull the centre line.
 *
 * @param {Array<{score:number, n:number, numerator:number, denominator:number}>} points
 * @returns {number} percentage
 */
export function studyMean(points) {
  const rows = (points || []).filter((p) => Number.isFinite(p.numerator) && Number.isFinite(p.denominator) && p.denominator > 0);
  if (!rows.length) return 0;
  const num = rows.reduce((a, p) => a + p.numerator, 0);
  const den = rows.reduce((a, p) => a + p.denominator, 0);
  return (num / den) * 100;
}

/**
 * The control limit at a given precision.
 *
 * @param {number} meanPct centre line, as a percentage
 * @param {number} n participants at the site
 * @param {number} z standard deviations
 * @returns {{lower:number, upper:number}} percentages, clamped to [0, 100]
 */
export function limitAt(meanPct, n, z) {
  const p = Math.min(1, Math.max(0, meanPct / 100));
  if (!Number.isFinite(n) || n <= 0) return { lower: 0, upper: 100 };
  const se = Math.sqrt((p * (1 - p)) / n);
  return {
    lower: Math.max(0, (p - z * se) * 100),
    upper: Math.min(100, (p + z * se) * 100),
  };
}

/** Where a point sits relative to the limits: inside, or out at which band. */
export function classifyPoint(point, meanPct) {
  const outer = limitAt(meanPct, point.n, FUNNEL_LIMITS[1].z);
  if (point.score > outer.upper) return 'outer';
  const inner = limitAt(meanPct, point.n, FUNNEL_LIMITS[0].z);
  if (point.score > inner.upper) return 'inner';
  return 'inside';
}

/**
 * Everything needed to draw the plot, in user units and in pixels.
 *
 * @param {Array<{id:string, label?:string, n:number, score:number, numerator:number, denominator:number}>} points
 * @param {object} [opts] { width, height, padding }
 */
export function funnelGeometry(points, opts = {}) {
  const width = opts.width ?? 460;
  const height = opts.height ?? 300;
  const pad = { top: 16, right: 16, bottom: 40, left: 44, ...(opts.padding || {}) };
  const rows = (points || []).filter((p) => Number.isFinite(p.n) && p.n > 0 && Number.isFinite(p.score));
  const mean = studyMean(rows);

  const maxN = Math.max(1, ...rows.map((p) => p.n));
  // The y range has to cover the widest limit, or the funnel mouth is clipped
  // exactly where the low-precision sites it exists to explain are drawn.
  const widest = limitAt(mean, Math.max(1, Math.min(...rows.map((p) => p.n), maxN)), FUNNEL_LIMITS[1].z);
  const maxY = Math.max(
    10,
    Math.ceil(Math.max(widest.upper, ...rows.map((p) => p.score)) / 5) * 5,
  );

  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const x = (n) => pad.left + (n / maxN) * plotW;
  const y = (score) => pad.top + plotH - (score / maxY) * plotH;

  // The bands are drawn over a smooth sweep of n, not over the observed
  // denominators, so the mouth reads as a curve rather than a polyline.
  const steps = 48;
  const bands = FUNNEL_LIMITS.map(({ key, z, label }) => {
    const path = [];
    for (let i = 1; i <= steps; i += 1) {
      const n = (i / steps) * maxN;
      path.push({ n, ...limitAt(mean, n, z) });
    }
    return { key, z, label, path };
  });

  const plotted = rows.map((p) => ({
    ...p,
    band: classifyPoint(p, mean),
    cx: x(p.n),
    cy: y(p.score),
  }));

  return { width, height, pad, mean, maxN, maxY, x, y, bands, points: plotted, plotW, plotH };
}

/** An SVG polyline for one edge of a band. */
function edgePath(geo, band, edge) {
  return band.path
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${geo.x(p.n).toFixed(1)},${geo.y(p[edge]).toFixed(1)}`)
    .join(' ');
}

/**
 * Render the funnel.
 *
 * Only out-of-funnel sites are labelled — labelling every point is what turns
 * a funnel back into the league table it exists to replace.
 */
export function buildFunnel(points, opts = {}) {
  const geo = funnelGeometry(points, opts);
  if (!geo.points.length) {
    return '<div class="empty-state"><div class="empty-title">No scored sites in this snapshot</div></div>';
  }
  const { width, height, pad } = geo;
  let h = `<svg class="funnel" viewBox="0 0 ${width} ${height}" role="img" `
    + `aria-label="Site risk score against participants enrolled, with 95% and 99.8% control limits around a study mean of ${geo.mean.toFixed(1)} percent">`;

  // Axes.
  h += `<line class="funnel-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" />`;
  h += `<line class="funnel-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" />`;

  // Bands, widest first so the tighter one draws on top.
  for (const band of [...geo.bands].reverse()) {
    h += `<path class="funnel-band funnel-band-${band.key}" d="${edgePath(geo, band, 'upper')}" />`;
    h += `<path class="funnel-band funnel-band-${band.key}" d="${edgePath(geo, band, 'lower')}" />`;
  }

  // Centre line.
  const meanY = geo.y(geo.mean).toFixed(1);
  h += `<line class="funnel-mean" x1="${pad.left}" y1="${meanY}" x2="${width - pad.right}" y2="${meanY}" />`;
  h += `<text class="funnel-mean-label" x="${width - pad.right}" y="${Number(meanY) - 5}" text-anchor="end">study mean ${geo.mean.toFixed(1)}</text>`;

  // Points. Out-of-funnel sites are labelled; everything else is a dot.
  for (const p of geo.points) {
    const cls = `funnel-point funnel-point-${p.band}`;
    const title = `${p.label || p.id} · n=${p.n} · score ${p.score.toFixed(1)}`
      + (p.band === 'inside' ? ' · inside the funnel' : ` · outside the ${p.band === 'outer' ? '99.8%' : '95%'} limit`);
    h += `<circle class="${cls}" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${p.band === 'inside' ? 3 : 4.5}">`
      + `<title>${esc(title)}</title></circle>`;
    if (p.band !== 'inside') {
      const anchor = p.cx > width * 0.7 ? 'end' : 'start';
      const dx = anchor === 'end' ? -7 : 7;
      h += `<text class="funnel-point-label" x="${(p.cx + dx).toFixed(1)}" y="${(p.cy + 3.5).toFixed(1)}" text-anchor="${anchor}">${esc(p.id)}</text>`;
    }
  }

  // Axis labels.
  h += `<text class="funnel-axis-label" x="${pad.left + geo.plotW / 2}" y="${height - 8}" text-anchor="middle">participants enrolled →</text>`;
  h += `<text class="funnel-axis-label" x="${-(pad.top + geo.plotH / 2)}" y="12" transform="rotate(-90)" text-anchor="middle">risk score</text>`;
  h += `<text class="funnel-tick" x="${pad.left - 6}" y="${pad.top + 4}" text-anchor="end">${geo.maxY}</text>`;
  h += `<text class="funnel-tick" x="${pad.left - 6}" y="${height - pad.bottom}" text-anchor="end">0</text>`;
  h += `<text class="funnel-tick" x="${width - pad.right}" y="${height - pad.bottom + 14}" text-anchor="end">${geo.maxN}</text>`;
  h += '</svg>';
  return h;
}
