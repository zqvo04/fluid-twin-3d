import { describe, it, expect } from 'vitest';
import { gridNetwork } from './largeNetwork';
import { solveSteadyState } from '../physics/steadySolver';

describe('grid network scalability', () => {
  it('builds ~480 pipes for a 16x16 grid', () => {
    const net = gridNetwork(16, 16);
    // Horizontal: 15*16, Vertical: 16*15 = 480.
    expect(net.links.length).toBe(480);
    expect(net.nodes.length).toBe(256);
  });

  it('solver converges on a looped grid and conserves mass globally', () => {
    const net = gridNetwork(8, 8);
    const res = solveSteadyState(net);
    expect(res.converged).toBe(true);

    // The single reservoir must supply exactly the sum of all junction demands.
    const totalDemand = net.nodes.reduce((s, n) => s + (n.demand ?? 0), 0);
    const reservoirId = 'N_0_0';
    let reservoirOutflow = 0;
    for (const link of net.links) {
      const r = res.links.get(link.id)!;
      if (link.from === reservoirId) reservoirOutflow += r.flow;
      if (link.to === reservoirId) reservoirOutflow -= r.flow;
    }
    expect(reservoirOutflow).toBeCloseTo(totalDemand, 6);
  });
});
