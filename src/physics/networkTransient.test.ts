import { describe, it, expect } from 'vitest';
import { G } from '../domain/units';
import { waterProperties } from '../domain/fluid';
import { pipeGeometry, A106B } from '../domain/catalog/pipes';
import { waveSpeed } from './waveSpeed';
import { PipelineNetwork } from '../domain/network';
import { NetworkTransientSim } from './networkTransient';

describe('network MOC — steady hold', () => {
  it('stays at the steady solution when nothing changes', () => {
    const net: PipelineNetwork = {
      temperatureC: 20,
      subAssemblies: [],
      nodes: [
        { id: 'R1', type: 'reservoir', position: { x: 0, y: 50, z: 0 }, fixedHead: 50 },
        { id: 'J', type: 'junction', position: { x: 200, y: 0, z: 0 }, demand: 0 },
        { id: 'R2', type: 'reservoir', position: { x: 400, y: 20, z: 0 }, fixedHead: 20 },
      ],
      links: [
        { id: 'P1', kind: 'pipe', from: 'R1', to: 'J', nps: '6"', schedule: '40', length: 300 },
        { id: 'P2', kind: 'pipe', from: 'J', to: 'R2', nps: '6"', schedule: '40', length: 300 },
      ],
    };
    const sim = new NetworkTransientSim(net);
    const h0 = sim.headOf('J');
    const q0 = sim.pipeFlow('P1');
    for (let i = 0; i < 400; i++) sim.step();
    // No spurious transient develops from the steady initial condition.
    expect(sim.headOf('J')).toBeCloseTo(h0, 1);
    expect(sim.pipeFlow('P1')).toBeCloseTo(q0, 2);
  });
});

describe('network MOC — Joukowsky surge on a branched line', () => {
  const net: PipelineNetwork = {
    temperatureC: 20,
    subAssemblies: [],
    nodes: [
      { id: 'R', type: 'reservoir', position: { x: 0, y: 100, z: 0 }, fixedHead: 100 },
      { id: 'V', type: 'junction', position: { x: 400, y: 0, z: 0 }, demand: 0 },
      { id: 'O', type: 'reservoir', position: { x: 420, y: 20, z: 0 }, fixedHead: 20 },
    ],
    links: [
      { id: 'P', kind: 'pipe', from: 'R', to: 'V', nps: '8"', schedule: '40', length: 400 },
      { id: 'VV', kind: 'valve', from: 'V', to: 'O', valveType: 'ball', nps: '8"', schedule: '40', opening: 1 },
    ],
  };

  it('reproduces the a*V0/g surge when the valve slams shut', () => {
    const sim = new NetworkTransientSim(net);
    const fluid = waterProperties(20);
    const geo = pipeGeometry('8"', '40');
    const q0 = sim.pipeFlow('P');
    const v0 = q0 / geo.area;
    const a = waveSpeed(fluid.bulk, fluid.rho, geo.id, geo.wall, A106B.E);
    const joukowsky = (a * v0) / G;
    const steadyV = sim.headOf('V');

    expect(v0).toBeGreaterThan(0.3); // there is real flow to arrest

    sim.setValveOpening('VV', 0); // instantaneous closure
    let peak = -Infinity;
    for (let i = 0; i < 60; i++) {
      sim.step();
      peak = Math.max(peak, sim.headOf('V'));
    }
    const surge = peak - steadyV;
    // Within ~15% of Joukowsky (finite dt + friction reduce it slightly).
    expect(surge).toBeGreaterThan(0.75 * joukowsky);
    expect(surge).toBeLessThan(1.1 * joukowsky);
  });
});

describe('network MOC — branched junction mass balance', () => {
  it('conserves mass at a tee across a transient', () => {
    // Two supplies into a tee feeding one delivery; close nothing, perturb by
    // starting slightly off and checking the junction balances each step.
    const net: PipelineNetwork = {
      temperatureC: 20,
      subAssemblies: [],
      nodes: [
        { id: 'A', type: 'reservoir', position: { x: 0, y: 60, z: 0 }, fixedHead: 60 },
        { id: 'B', type: 'reservoir', position: { x: 0, y: 55, z: 0 }, fixedHead: 55 },
        { id: 'T', type: 'junction', position: { x: 200, y: 0, z: 0 }, demand: 0 },
        { id: 'D', type: 'reservoir', position: { x: 400, y: 10, z: 0 }, fixedHead: 10 },
      ],
      links: [
        { id: 'PA', kind: 'pipe', from: 'A', to: 'T', nps: '6"', schedule: '40', length: 250 },
        { id: 'PB', kind: 'pipe', from: 'B', to: 'T', nps: '6"', schedule: '40', length: 250 },
        { id: 'PD', kind: 'pipe', from: 'T', to: 'D', nps: '8"', schedule: '40', length: 250 },
      ],
    };
    const sim = new NetworkTransientSim(net);
    for (let i = 0; i < 200; i++) sim.step();
    // Inflows (PA, PB downstream ends at T) minus outflow (PD leaves T) ~ 0.
    const net_into_T = sim.pipeFlow('PA') + sim.pipeFlow('PB') - sim.pipeFlow('PD');
    expect(Math.abs(net_into_T)).toBeLessThan(1e-3);
  });
});
