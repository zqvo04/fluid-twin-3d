import { describe, it, expect } from 'vitest';
import { PipelineNetwork } from './network';
import {
  UNASSIGNED,
  nodeSectionId,
  linkSectionId,
  boundaryLinks,
  nodesInSection,
  linksInSection,
  unassignedCount,
  addSection,
  makeSection,
  removeSection,
  assignNodesToSection,
  sectionSubnetwork,
  sectionKpi,
} from './sections';

/** Two areas connected by one tie-in pipe, plus one unassigned node. */
function twoAreaNet(): PipelineNetwork {
  return {
    temperatureC: 20,
    subAssemblies: [],
    sections: [
      { id: 'A', name: 'Area A', color: '#111' },
      { id: 'B', name: 'Area B', color: '#222' },
    ],
    nodes: [
      { id: 'RA', type: 'reservoir', position: { x: 0, y: 10, z: 0 }, fixedHead: 30, sectionId: 'A' },
      { id: 'JA', type: 'junction', position: { x: 5, y: 0, z: 0 }, demand: 0.01, sectionId: 'A' },
      { id: 'JB', type: 'junction', position: { x: 10, y: 0, z: 0 }, demand: 0.02, sectionId: 'B' },
      { id: 'RB', type: 'reservoir', position: { x: 15, y: 0, z: 0 }, fixedHead: 5, sectionId: 'B' },
      { id: 'FREE', type: 'junction', position: { x: 20, y: 0, z: 0 }, demand: 0 }, // unassigned
    ],
    links: [
      { id: 'PA', kind: 'pipe', from: 'RA', to: 'JA', nps: '6"', schedule: '40', length: 10 },
      { id: 'TIE', kind: 'pipe', from: 'JA', to: 'JB', nps: '6"', schedule: '40', length: 10 }, // A→B tie-in
      { id: 'PB', kind: 'pipe', from: 'JB', to: 'RB', nps: '6"', schedule: '40', length: 10 },
    ],
  };
}

describe('section tagging', () => {
  it('reads a node section, defaulting to UNASSIGNED', () => {
    const net = twoAreaNet();
    expect(nodeSectionId(net.nodes.find((n) => n.id === 'JA')!)).toBe('A');
    expect(nodeSectionId(net.nodes.find((n) => n.id === 'FREE')!)).toBe(UNASSIGNED);
  });

  it('derives a link section from its upstream node', () => {
    const net = twoAreaNet();
    expect(linkSectionId(net, net.links.find((l) => l.id === 'PA')!)).toBe('A');
    expect(linkSectionId(net, net.links.find((l) => l.id === 'TIE')!)).toBe('A'); // from JA (A)
    expect(linkSectionId(net, net.links.find((l) => l.id === 'PB')!)).toBe('B');
  });

  it('groups nodes and links by section', () => {
    const net = twoAreaNet();
    expect(nodesInSection(net, 'A').map((n) => n.id).sort()).toEqual(['JA', 'RA']);
    expect(linksInSection(net, 'A').map((l) => l.id).sort()).toEqual(['PA', 'TIE']);
    expect(nodesInSection(net, UNASSIGNED).map((n) => n.id)).toEqual(['FREE']);
    expect(unassignedCount(net)).toBe(1);
  });

  it('identifies tie-ins as cross-section links only', () => {
    const net = twoAreaNet();
    const ties = boundaryLinks(net);
    expect(ties.map((t) => t.link.id)).toEqual(['TIE']);
    expect(ties[0].fromSection).toBe('A');
    expect(ties[0].toSection).toBe('B');
  });
});

describe('section CRUD', () => {
  it('adds and removes sections, orphaning members to Unassigned', () => {
    let net = twoAreaNet();
    const s = makeSection(net, 'Area C');
    net = addSection(net, s);
    expect(net.sections).toHaveLength(3);

    net = removeSection(net, 'A');
    expect(net.sections!.map((x) => x.id)).toEqual(['B', s.id]);
    // A's former members are now unassigned.
    expect(net.nodes.find((n) => n.id === 'JA')!.sectionId).toBeUndefined();
    expect(unassignedCount(net)).toBe(3); // FREE + RA + JA
  });

  it('assigns nodes to a section and back to Unassigned', () => {
    let net = twoAreaNet();
    net = assignNodesToSection(net, ['FREE'], 'B');
    expect(net.nodes.find((n) => n.id === 'FREE')!.sectionId).toBe('B');
    net = assignNodesToSection(net, ['FREE'], UNASSIGNED);
    expect(net.nodes.find((n) => n.id === 'FREE')!.sectionId).toBeUndefined();
  });
});

describe('section-scoped extraction', () => {
  it('pins cut boundary nodes as fixed-head reservoirs', () => {
    const net = twoAreaNet();
    const heads = new Map([['JB', 12]]); // last full solve gave JB = 12 m
    const { network: sub, boundaryNodeIds } = sectionSubnetwork(net, 'A', heads);

    // Section A's nodes plus the boundary node JB (from the tie-in) are present.
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['JA', 'JB', 'RA']);
    expect(boundaryNodeIds).toEqual(['JB']);

    const jb = sub.nodes.find((n) => n.id === 'JB')!;
    expect(jb.type).toBe('reservoir');
    expect(jb.fixedHead).toBe(12);

    // Internal + tie-in links are kept; PB (fully outside) is dropped.
    expect(sub.links.map((l) => l.id).sort()).toEqual(['PA', 'TIE']);
  });

  it('falls back to node elevation when a boundary head is unknown', () => {
    const net = twoAreaNet();
    const { network: sub } = sectionSubnetwork(net, 'A', new Map());
    const jb = sub.nodes.find((n) => n.id === 'JB')!;
    expect(jb.fixedHead).toBe(0); // JB elevation y = 0
  });
});

describe('section KPI rollup', () => {
  it('sums demand and reports head/velocity extremes', () => {
    const net = twoAreaNet();
    const heads = new Map([['RA', 30], ['JA', 25]]);
    const links = new Map([['PA', { flow: 0.03, velocity: 1.5, headLoss: 2 }], ['TIE', { flow: 0.01, velocity: 0.8, headLoss: 1 }]]);
    const kpi = sectionKpi(net, 'A', 'Area A', '#111', heads, links);

    expect(kpi.demand).toBeCloseTo(0.01);
    expect(kpi.nodeCount).toBe(2);
    expect(kpi.linkCount).toBe(2);
    expect(kpi.maxHead).toBe(30);
    expect(kpi.minHead).toBe(25);
    expect(kpi.peakVelocity).toBeCloseTo(1.5);
    expect(kpi.solved).toBe(true);
  });

  it('reports nulls for an unsolved section', () => {
    const net = twoAreaNet();
    const kpi = sectionKpi(net, 'B', 'Area B', '#222', new Map(), new Map());
    expect(kpi.solved).toBe(false);
    expect(kpi.maxHead).toBeNull();
    expect(kpi.peakVelocity).toBeNull();
    expect(kpi.demand).toBeCloseTo(0.02);
  });
});
