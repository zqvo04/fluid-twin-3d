import { describe, it, expect } from 'vitest';
import { analyzePumpDuty } from './pumpDuty';
import { solveSteadyState } from '../physics/steadySolver';
import { PUMP_50M } from '../domain/catalog/pumps';
import { PipelineNetwork } from '../domain/network';

function pumpToTank(staticLift: number, pipeLength: number): PipelineNetwork {
  return {
    temperatureC: 20,
    subAssemblies: [],
    nodes: [
      { id: 'LOW', type: 'reservoir', position: { x: 0, y: 0, z: 0 }, fixedHead: 0 },
      { id: 'J', type: 'junction', position: { x: 1, y: 0, z: 0 }, demand: 0 },
      { id: 'HIGH', type: 'reservoir', position: { x: 300, y: staticLift, z: 0 }, fixedHead: staticLift },
    ],
    links: [
      { id: 'PUMP', kind: 'pump', from: 'LOW', to: 'J', spec: PUMP_50M, speedRatio: 1 },
      { id: 'DISCHARGE', kind: 'pipe', from: 'J', to: 'HIGH', nps: '4"', schedule: '40', length: pipeLength },
    ],
  };
}

describe('pump duty-point analysis (BEP window)', () => {
  it('classifies a near-BEP duty as ok', () => {
    // Tuned so the 4" discharge friction lands the duty point near BEP.
    const net = pumpToTank(30, 300);
    const res = solveSteadyState(net);
    const duty = analyzePumpDuty(net, res)[0];
    expect(duty.bepRatio).toBeGreaterThan(0.7);
    expect(duty.bepRatio).toBeLessThan(1.2);
    expect(duty.status).toBe('ok');
  });

  it('flags overload when the system resistance is very low (runout)', () => {
    // Almost no lift and a short fat-flow path pushes the pump past 120% BEP.
    const net = pumpToTank(2, 20);
    const res = solveSteadyState(net);
    const duty = analyzePumpDuty(net, res)[0];
    expect(duty.bepRatio).toBeGreaterThan(1.2);
    expect(duty.status).toBe('overload');
  });

  it('flags low-flow when the static lift approaches shutoff head', () => {
    // Lift near the ~52 m shutoff head throttles flow far below BEP.
    const net = pumpToTank(50, 300);
    const res = solveSteadyState(net);
    const duty = analyzePumpDuty(net, res)[0];
    expect(duty.bepRatio).toBeLessThan(0.7);
    expect(duty.status).toBe('low-flow');
  });
});
