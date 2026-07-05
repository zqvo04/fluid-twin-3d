import { describe, it, expect } from 'vitest';
import { churchillFriction, reynolds } from './friction';

describe('Churchill friction factor', () => {
  it('reduces to laminar 64/Re at low Reynolds number', () => {
    // Churchill collapses to the exact laminar solution below transition.
    for (const re of [200, 500, 1000, 1500]) {
      const f = churchillFriction(re, 0.0001);
      expect(f).toBeCloseTo(64 / re, 4);
    }
  });

  it('matches Moody chart for a smooth pipe at Re = 1e5', () => {
    // Colebrook smooth-pipe value ~0.0180.
    const f = churchillFriction(1e5, 1e-6);
    expect(f).toBeGreaterThan(0.017);
    expect(f).toBeLessThan(0.019);
  });

  it('matches Moody chart for eps/D = 0.001 at Re = 1e6', () => {
    // Colebrook gives f ~ 0.0199 here.
    const f = churchillFriction(1e6, 0.001);
    expect(f).toBeCloseTo(0.0199, 3);
  });

  it('approaches the fully-rough asymptote at very high Re', () => {
    // For eps/D = 0.01, the rough-pipe limit is f ~ 0.0379 (von Karman).
    const f = churchillFriction(1e9, 0.01);
    expect(f).toBeCloseTo(0.0379, 2);
  });
});

describe('Reynolds number', () => {
  it('computes Re from flow and bore', () => {
    // 4" pipe, ID ~0.102 m, Q = 0.02 m^3/s water at 20C.
    const rho = 998.2;
    const mu = 1.002e-3;
    const re = reynolds(0.02, 0.1023, rho, mu);
    // v = Q/A = 0.02 / (pi/4 * 0.1023^2) = 2.43 m/s; Re = rho v D / mu.
    const v = 0.02 / ((Math.PI / 4) * 0.1023 ** 2);
    expect(re).toBeCloseTo((rho * v * 0.1023) / mu, 0);
  });
});
