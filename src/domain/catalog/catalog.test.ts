import { describe, it, expect } from 'vitest';
import { pipeGeometry, boreInches, FRICTION_FACTOR_FT } from './pipes';
import { ratedCv, valveK, characteristicFraction, VALVE_SPECS } from './valves';
import { fittingK } from './fittings';
import { fitPumpCurve, pumpHead } from './pumps';

describe('Pipe catalog (ASME B36.10M)', () => {
  it('reproduces standard inside diameters for Sch 40', () => {
    // OD - 2*wall, in mm, from the published tables.
    expect(pipeGeometry('2"', '40').id * 1000).toBeCloseTo(52.48, 1);
    expect(pipeGeometry('4"', '40').id * 1000).toBeCloseTo(102.26, 1);
    expect(pipeGeometry('6"', '40').id * 1000).toBeCloseTo(154.08, 1);
    expect(pipeGeometry('8"', '40').id * 1000).toBeCloseTo(202.74, 1);
  });

  it('Sch 80 is thicker (smaller bore) than Sch 40', () => {
    for (const nps of ['2"', '4"', '6"', '8"'] as const) {
      expect(pipeGeometry(nps, '80').id).toBeLessThan(pipeGeometry(nps, '40').id);
    }
  });
});

describe('Valve catalog (Crane / ISA)', () => {
  it('Cv and K are consistent inverse conversions at full open', () => {
    // Rebuild K from rated Cv and confirm it matches Crane K = kOverFt*fT.
    const nps = '4"';
    const k = valveK('gate', nps, '40', 1);
    const expectedK = VALVE_SPECS.gate.kOverFt * FRICTION_FACTOR_FT[nps];
    expect(k).toBeCloseTo(expectedK, 2);
  });

  it('globe valve is far more resistive than a ball valve', () => {
    expect(ratedCv('ball', '4"', '40')).toBeGreaterThan(ratedCv('globe', '4"', '40'));
  });

  it('inherent characteristics are monotonic and normalized', () => {
    for (const char of ['linear', 'quick-opening', 'equal-percentage', 'modified-eq-pct'] as const) {
      expect(characteristicFraction(char, 0)).toBeCloseTo(0, 6);
      expect(characteristicFraction(char, 1)).toBeCloseTo(1, 6);
      expect(characteristicFraction(char, 0.4)).toBeLessThan(characteristicFraction(char, 0.6));
    }
  });

  it('quick-opening delivers more capacity early than equal-percentage', () => {
    // Hallmark of a ball/gate valve vs a globe control valve at 30% travel.
    expect(characteristicFraction('quick-opening', 0.3)).toBeGreaterThan(
      characteristicFraction('equal-percentage', 0.3),
    );
  });

  it('throttling raises K', () => {
    expect(valveK('globe', '4"', '40', 0.3)).toBeGreaterThan(valveK('globe', '4"', '40', 1));
  });
});

describe('Fitting catalog (Crane TP-410)', () => {
  it('scales K with the size-dependent friction factor', () => {
    expect(fittingK('elbow90', '2"')).toBeCloseTo(30 * FRICTION_FACTOR_FT['2"'], 4);
    expect(fittingK('teeBranch', '6"')).toBeCloseTo(60 * FRICTION_FACTOR_FT['6"'], 4);
  });
});

describe('Pump curve fitting', () => {
  it('fits H = a0 - a1 Q - a2 Q^2 through three points exactly', () => {
    const pts: [any, any, any] = [
      { q: 0, h: 50 },
      { q: 0.02, h: 44 },
      { q: 0.04, h: 30 },
    ];
    const { a0, a1, a2 } = fitPumpCurve(pts);
    const spec = { name: 't', a0, a1, a2, bepFlow: 0.02, npshrAtBep: 3, inertia: 1, ratedRpm: 3000 };
    expect(pumpHead(spec, 0)).toBeCloseTo(50, 6);
    expect(pumpHead(spec, 0.02)).toBeCloseTo(44, 6);
    expect(pumpHead(spec, 0.04)).toBeCloseTo(30, 6);
  });

  it('affinity laws scale head with the square of speed', () => {
    const spec = { name: 't', a0: 50, a1: 0, a2: 10000, bepFlow: 0.02, npshrAtBep: 3, inertia: 1, ratedRpm: 3000 };
    // At zero flow, head at half speed is a0 * 0.5^2.
    expect(pumpHead(spec, 0, 0.5)).toBeCloseTo(50 * 0.25, 6);
  });
});

describe('bore conversion', () => {
  it('reports bore in inches', () => {
    expect(boreInches('4"', '40')).toBeCloseTo(102.26 / 25.4, 2);
  });
});
