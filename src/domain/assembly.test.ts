import { describe, it, expect } from 'vitest';
import { cloneSubAssembly } from './assembly';
import { checkConnectors } from './connectivity';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { validateNetwork } from './network';

describe('sub-assembly cloning', () => {
  it('clones member nodes and internal links with fresh ids and an offset', () => {
    const net = pumpSkidNetwork();
    const sub = net.subAssemblies[0];
    const before = net.nodes.length;

    const { network, newSubId, boundaryNodeIds } = cloneSubAssembly(net, sub.id, {
      idSuffix: '__2',
      offset: { x: 0, y: 0, z: 12 },
    });

    // All member nodes cloned.
    expect(network.nodes.length).toBe(before + sub.nodeIds.length);
    expect(newSubId).toBe(sub.id + '__2');

    // Cloned node positions are offset by z + 12.
    const origIn = net.nodes.find((n) => n.id === 'PUMP_IN')!;
    const cloneIn = network.nodes.find((n) => n.id === 'PUMP_IN__2')!;
    expect(cloneIn.position.z).toBeCloseTo(origIn.position.z + 12, 6);
    expect(cloneIn.position.x).toBeCloseTo(origIn.position.x, 6);

    // Internal links are remapped to cloned endpoints.
    const clonedPump = network.links.find((l) => l.id === 'PUMP__2')!;
    expect(clonedPump.from).toBe('PUMP_OUT__2');
    expect(clonedPump.to).toBe('SKID_HDR__2');

    // Boundary nodes (touch external lines) are reported for wiring.
    expect(boundaryNodeIds).toContain('PUMP_IN__2'); // fed by SUCTION_LINE
    expect(boundaryNodeIds).toContain('SKID_HDR__2'); // feeds DISCHARGE side

    // The clone alone (unwired) has no dangling-reference errors within itself.
    const clonedNodeIds = new Set(network.nodes.map((n) => n.id));
    expect(clonedNodeIds.has('PUMP_OUT__2')).toBe(true);
  });

  it('keeps the whole network structurally valid after cloning', () => {
    const net = pumpSkidNetwork();
    const { network } = cloneSubAssembly(net, net.subAssemblies[0].id, {
      idSuffix: '__2',
      offset: { x: 0, y: 0, z: 12 },
    });
    const errors = validateNetwork(network).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('throws for an unknown sub-assembly id', () => {
    const net = pumpSkidNetwork();
    expect(() => cloneSubAssembly(net, 'NOPE', { idSuffix: '_x', offset: { x: 0, y: 0, z: 0 } })).toThrow();
  });
});

describe('connector consistency checks', () => {
  it('flags a size change at a node without a reducer', () => {
    // Two directly-connected pipes of different NPS meeting at junction J.
    const net = pumpSkidNetwork();
    // Introduce a genuine mismatch: make the suction pipe 8" meet a 4" valve
    // at PUMP_IN (no unsized component between them).
    const valve = net.links.find((l) => l.id === 'SUCTION_VALVE')!;
    if (valve.kind === 'valve') valve.nps = '4"'; // SUCTION_LINE is 8"

    const issues = checkConnectors(net);
    const pumpIn = issues.find((i) => i.ref === 'PUMP_IN');
    expect(pumpIn).toBeDefined();
    expect(pumpIn!.severity).toBe('warning');
    expect(pumpIn!.message).toMatch(/reducer/);
  });

  it('reports no size warnings on the well-formed demo network', () => {
    // In the demo the pump (unsized) sits at the 8"->6" transition, so no node
    // sees two different sized links directly.
    const net = pumpSkidNetwork();
    const issues = checkConnectors(net);
    expect(issues).toHaveLength(0);
  });
});
