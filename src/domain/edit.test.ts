import { describe, it, expect } from 'vitest';
import {
  addNode,
  addLink,
  makeNode,
  makeLink,
  removeNode,
  removeElement,
  updateNode,
  updateLink,
  changeLinkKind,
  LinkDefaults,
} from './edit';
import { emptyNetwork, validateNetwork } from './network';
import { solveSteadyState } from '../physics/steadySolver';

const defaults: LinkDefaults = { kind: 'pipe', nps: '4"', schedule: '40', valveType: 'gate' };

describe('interactive network editing', () => {
  it('builds a solvable network from scratch (reservoir → pipe → tank)', () => {
    let net = emptyNetwork(20);
    const a = makeNode('reservoir', { x: 0, y: 30, z: 0 }, net);
    net = addNode(net, a);
    const b = makeNode('reservoir', { x: 50, y: 0, z: 0 }, net);
    net = addNode(net, b);
    const pipe = makeLink(a.id, b.id, defaults, net);
    net = addLink(net, pipe);

    expect(validateNetwork(net).filter((i) => i.severity === 'error')).toHaveLength(0);
    const res = solveSteadyState(net);
    expect(res.converged).toBe(true);
    // Flow from the high reservoir (30 m) to the low one (0 m).
    expect(res.links.get(pipe.id)!.flow).toBeGreaterThan(0);
  });

  it('assigns unique ids as components are added', () => {
    let net = emptyNetwork();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const n = makeNode('junction', { x: i, y: 0, z: 0 }, net);
      net = addNode(net, n);
      ids.add(n.id);
    }
    expect(ids.size).toBe(5);
    expect(net.nodes).toHaveLength(5);
  });

  it('cascade-deletes incident links when a node is removed', () => {
    let net = emptyNetwork();
    const a = makeNode('reservoir', { x: 0, y: 10, z: 0 }, net);
    const b = makeNode('junction', { x: 10, y: 0, z: 0 }, net);
    const c = makeNode('reservoir', { x: 20, y: 0, z: 0 }, net);
    net = addNode(addNode(addNode(net, a), b), c);
    net = addLink(net, makeLink(a.id, b.id, defaults, net));
    net = addLink(net, makeLink(b.id, c.id, defaults, net));
    expect(net.links).toHaveLength(2);

    net = removeNode(net, b.id);
    expect(net.nodes.find((n) => n.id === b.id)).toBeUndefined();
    expect(net.links).toHaveLength(0); // both links referenced b
  });

  it('removeElement handles both nodes and links', () => {
    let net = emptyNetwork();
    const a = makeNode('junction', { x: 0, y: 0, z: 0 }, net);
    const b = makeNode('junction', { x: 1, y: 0, z: 0 }, net);
    net = addNode(addNode(net, a), b);
    const link = makeLink(a.id, b.id, defaults, net);
    net = addLink(net, link);
    net = removeElement(net, link.id);
    expect(net.links).toHaveLength(0);
    expect(net.nodes).toHaveLength(2);
  });

  it('edits node and link properties', () => {
    let net = emptyNetwork();
    const a = makeNode('junction', { x: 0, y: 0, z: 0 }, net);
    net = addNode(net, a);
    net = updateNode(net, a.id, { demand: 0.05, position: { x: 5, y: 3, z: 0 } });
    expect(net.nodes[0].demand).toBe(0.05);
    expect(net.nodes[0].position.y).toBe(3);

    const b = makeNode('junction', { x: 10, y: 0, z: 0 }, net);
    net = addNode(net, b);
    const pipe = makeLink(a.id, b.id, defaults, net);
    net = addLink(net, pipe);
    net = updateLink(net, pipe.id, { nps: '8"' });
    expect((net.links[0] as { nps: string }).nps).toBe('8"');
  });

  it('changes a link kind while preserving endpoints and id', () => {
    let net = emptyNetwork();
    const a = makeNode('junction', { x: 0, y: 0, z: 0 }, net);
    const b = makeNode('junction', { x: 5, y: 0, z: 0 }, net);
    net = addNode(addNode(net, a), b);
    const pipe = makeLink(a.id, b.id, defaults, net);
    net = addLink(net, pipe);

    net = changeLinkKind(net, pipe.id, 'valve', { ...defaults, kind: 'valve', valveType: 'ball' });
    const link = net.links[0];
    expect(link.id).toBe(pipe.id);
    expect(link.kind).toBe('valve');
    expect(link.from).toBe(a.id);
    expect(link.to).toBe(b.id);
  });
});
