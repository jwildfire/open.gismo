import { describe, it, expect } from 'vitest';
import {
  studyMean, limitAt, classifyPoint, funnelGeometry, buildFunnel, FUNNEL_LIMITS,
} from './funnel.js';

/** A site as riskscore.js hands it over. */
const site = (id, n, score, numerator, denominator = 178) =>
  ({ id, n, score, numerator, denominator });

describe('studyMean', () => {
  it('pools the numerators and denominators rather than averaging site rates', () => {
    // A two-participant site with a huge score must not drag the centre line.
    const points = [site('A', 100, 5, 89), site('B', 2, 50, 89)];
    const pooled = ((89 + 89) / (178 + 178)) * 100;
    expect(studyMean(points)).toBeCloseTo(pooled, 6);
  });

  it('is zero with nothing to pool', () => {
    expect(studyMean([])).toBe(0);
    expect(studyMean([site('A', 3, 5, 1, 0)])).toBe(0);
  });
});

describe('limitAt', () => {
  it('widens as precision falls', () => {
    const few = limitAt(10, 2, 1.96);
    const many = limitAt(10, 100, 1.96);
    expect(few.upper - few.lower).toBeGreaterThan(many.upper - many.lower);
  });

  it('is wider at 99.8% than at 95%', () => {
    const inner = limitAt(10, 20, FUNNEL_LIMITS[0].z);
    const outer = limitAt(10, 20, FUNNEL_LIMITS[1].z);
    expect(outer.upper).toBeGreaterThan(inner.upper);
  });

  it('stays inside 0–100', () => {
    const l = limitAt(1, 1, 3.09);
    expect(l.lower).toBeGreaterThanOrEqual(0);
    expect(l.upper).toBeLessThanOrEqual(100);
  });

  it('refuses to pretend precision it does not have', () => {
    expect(limitAt(10, 0, 1.96)).toEqual({ lower: 0, upper: 100 });
  });
});

describe('classifyPoint', () => {
  it('leaves a high-scoring, low-precision site inside the funnel', () => {
    // The whole point: 50 on two participants is not evidence.
    expect(classifyPoint({ n: 2, score: 50 }, 10)).toBe('inside');
  });

  it('puts a high-scoring, well-enrolled site outside it', () => {
    expect(classifyPoint({ n: 200, score: 50 }, 10)).toBe('outer');
  });

  it('reports the band a point clears, not just in-or-out', () => {
    const mean = 10;
    const inner = limitAt(mean, 60, FUNNEL_LIMITS[0].z).upper;
    const outer = limitAt(mean, 60, FUNNEL_LIMITS[1].z).upper;
    expect(classifyPoint({ n: 60, score: (inner + outer) / 2 }, mean)).toBe('inner');
  });
});

describe('funnelGeometry', () => {
  const points = [site('BIG', 28, 28.9, 51), site('SMALL', 2, 14.9, 27), site('MID', 31, 28.1, 50)];

  it('drops points it cannot place rather than drawing them at zero', () => {
    const geo = funnelGeometry([...points, site('NONE', 0, 5, 9), { id: 'X', n: 4 }]);
    expect(geo.points.map((p) => p.id)).toEqual(['BIG', 'SMALL', 'MID']);
  });

  it('scales the axes to the data', () => {
    const geo = funnelGeometry(points);
    expect(geo.maxN).toBe(31);
    expect(geo.maxY).toBeGreaterThanOrEqual(28.9);
  });

  it('covers the widest limit so the funnel mouth is not clipped', () => {
    const geo = funnelGeometry(points);
    const widest = limitAt(geo.mean, 1, FUNNEL_LIMITS[1].z).upper;
    expect(geo.maxY).toBeGreaterThanOrEqual(Math.min(widest, 100));
  });

  it('draws a band as a smooth sweep, not a polyline through the sites', () => {
    const geo = funnelGeometry(points);
    expect(geo.bands).toHaveLength(2);
    expect(geo.bands[0].path.length).toBeGreaterThan(points.length);
  });

  it('puts a higher score higher on the page', () => {
    const geo = funnelGeometry(points);
    const big = geo.points.find((p) => p.id === 'BIG');
    const small = geo.points.find((p) => p.id === 'SMALL');
    expect(big.cy).toBeLessThan(small.cy);
    expect(big.cx).toBeGreaterThan(small.cx);
  });
});

describe('buildFunnel', () => {
  const points = [site('BIG', 28, 28.9, 51), site('SMALL', 2, 14.9, 27), site('MID', 31, 8.1, 14)];

  it('labels only the sites outside the funnel', () => {
    const svg = buildFunnel(points);
    const labelled = [...svg.matchAll(/class="funnel-point-label"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(labelled).not.toContain('SMALL');
    expect(labelled.length).toBeLessThan(points.length);
  });

  it('names the study mean in the accessible description', () => {
    expect(buildFunnel(points)).toContain('control limits around a study mean');
  });

  it('gives every point a title a hover can read', () => {
    const svg = buildFunnel(points);
    expect(svg).toContain('n=2');
    expect(svg).toContain('inside the funnel');
  });

  it('shows an empty state rather than an empty chart', () => {
    expect(buildFunnel([])).toContain('No scored sites');
  });
});
