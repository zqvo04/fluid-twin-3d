import { describe, it, expect } from 'vitest';
import { G } from '../domain/units';
import { pipeGeometry, A106B } from '../domain/catalog/pipes';
import { hoopStress, analyzeHoopStress, OCCASIONAL_FACTOR } from './stress';

describe('B31.3 hoop stress', () => {
  it('matches the Barlow formula on the corroded wall', () => {
    const geo = pipeGeometry('6"', '40');
    const P = 2e6; // 2 MPa (~20 bar)
    const t = geo.wall - A106B.corrosionAllowance;
    const expected = (P * geo.od) / (2 * t);
    expect(hoopStress(P, geo, A106B)).toBeCloseTo(expected, 3);
  });

  it('passes at a modest operating pressure and fails only when peak exceeds 1.33 S', () => {
    const geo = pipeGeometry('6"', '40');
    const rho = 998;
    // Steady 40 bar-ish head; a surge that stays under the occasional allowable.
    const steadyHead = 200; // m -> ~19.6 bar
    const okPeak = 500; // m
    const ok = analyzeHoopStress(steadyHead, okPeak, geo, A106B, rho);
    expect(ok.sustainedUtil).toBeLessThan(1);

    // A peak head large enough to exceed 1.33 S must be flagged.
    const t = geo.wall - A106B.corrosionAllowance;
    // Head that yields sigma = 1.33 S exactly:
    const pAt133 = (OCCASIONAL_FACTOR * A106B.allowable * 2 * t) / geo.od;
    const headAt133 = pAt133 / (rho * G);
    const over = analyzeHoopStress(steadyHead, headAt133 * 1.1, geo, A106B, rho);
    expect(over.occasionalUtil).toBeGreaterThan(1);
    expect(over.pass).toBe(false);
  });

  it('sustained and occasional utilizations scale with pressure', () => {
    const geo = pipeGeometry('4"', '80');
    const rho = 998;
    const a = analyzeHoopStress(100, 300, geo, A106B, rho);
    const b = analyzeHoopStress(200, 600, geo, A106B, rho);
    expect(b.sustainedUtil).toBeCloseTo(2 * a.sustainedUtil, 6);
    expect(b.occasionalUtil).toBeCloseTo(2 * a.occasionalUtil, 6);
  });
});
