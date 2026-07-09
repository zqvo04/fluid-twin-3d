/**
 * Pure network-editing operations for the interactive builder. Every function
 * returns a new PipelineNetwork (immutable updates) so React/Zustand can diff
 * cheaply and undo is trivial to add later. Kept free of any UI/3D concern and
 * unit-tested independently.
 */

import {
  PipelineNetwork,
  NetworkNode,
  NetworkLink,
  PipeLink,
  ValveLink,
  PumpLink,
  Vec3,
  NodeType,
} from './network';
import { NominalSize, Schedule } from './catalog/pipes';
import { ValveType } from './catalog/valves';
import { PUMP_50M } from './catalog/pumps';

let counter = 0;

/** Generate an id unique within the network (prefixed, human-readable). */
export function genId(prefix: string, net: PipelineNetwork): string {
  const taken = new Set([...net.nodes.map((n) => n.id), ...net.links.map((l) => l.id)]);
  let id: string;
  do {
    counter += 1;
    id = `${prefix}${counter}`;
  } while (taken.has(id));
  return id;
}

export function addNode(net: PipelineNetwork, node: NetworkNode): PipelineNetwork {
  return { ...net, nodes: [...net.nodes, node] };
}

/** Create a node of a given type at a position with sensible defaults. */
export function makeNode(type: NodeType, position: Vec3, net: PipelineNetwork): NetworkNode {
  const id = genId(type === 'reservoir' ? 'TK' : 'J', net);
  if (type === 'reservoir') {
    return { id, type, position, fixedHead: position.y };
  }
  return { id, type, position, demand: 0 };
}

export interface LinkDefaults {
  kind: 'pipe' | 'valve' | 'pump';
  nps: NominalSize;
  schedule: Schedule;
  valveType: ValveType;
}

/** Build a link of the requested kind connecting two existing nodes. */
export function makeLink(
  from: string,
  to: string,
  defaults: LinkDefaults,
  net: PipelineNetwork,
): NetworkLink {
  const id = genId(defaults.kind === 'pump' ? 'PMP' : defaults.kind === 'valve' ? 'V' : 'P', net);
  if (defaults.kind === 'valve') {
    const link: ValveLink = {
      id,
      kind: 'valve',
      from,
      to,
      valveType: defaults.valveType,
      nps: defaults.nps,
      schedule: defaults.schedule,
      opening: 1,
    };
    return link;
  }
  if (defaults.kind === 'pump') {
    const link: PumpLink = { id, kind: 'pump', from, to, spec: PUMP_50M, speedRatio: 1 };
    return link;
  }
  const link: PipeLink = { id, kind: 'pipe', from, to, nps: defaults.nps, schedule: defaults.schedule };
  return link;
}

export function addLink(net: PipelineNetwork, link: NetworkLink): PipelineNetwork {
  return { ...net, links: [...net.links, link] };
}

/** Remove a link by id. */
export function removeLink(net: PipelineNetwork, linkId: string): PipelineNetwork {
  return {
    ...net,
    links: net.links.filter((l) => l.id !== linkId),
    subAssemblies: net.subAssemblies.map((s) => ({ ...s, linkIds: s.linkIds.filter((id) => id !== linkId) })),
  };
}

/** Remove a node and every link incident to it (cascade). */
export function removeNode(net: PipelineNetwork, nodeId: string): PipelineNetwork {
  return {
    ...net,
    nodes: net.nodes.filter((n) => n.id !== nodeId),
    links: net.links.filter((l) => l.from !== nodeId && l.to !== nodeId),
    subAssemblies: net.subAssemblies.map((s) => ({
      ...s,
      nodeIds: s.nodeIds.filter((id) => id !== nodeId),
    })),
  };
}

/** Remove a node or a link, whichever the id refers to. */
export function removeElement(net: PipelineNetwork, id: string): PipelineNetwork {
  if (net.nodes.some((n) => n.id === id)) return removeNode(net, id);
  return removeLink(net, id);
}

export function updateNode(net: PipelineNetwork, id: string, patch: Partial<NetworkNode>): PipelineNetwork {
  return { ...net, nodes: net.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Merge a patch into a link, preserving its kind. */
export function updateLink(net: PipelineNetwork, id: string, patch: Partial<NetworkLink>): PipelineNetwork {
  return {
    ...net,
    links: net.links.map((l) => (l.id === id ? ({ ...l, ...patch } as NetworkLink) : l)),
  };
}

/**
 * Split a pipe at a point, inserting a junction and replacing the pipe with two
 * pipes of the same spec (from→new, new→to). Enables Cities-Skylines-style
 * branching: click a pipe to tap into it. Returns the new junction id.
 */
export function splitPipe(
  net: PipelineNetwork,
  linkId: string,
  position: Vec3,
): { network: PipelineNetwork; newNodeId: string } {
  const link = net.links.find((l) => l.id === linkId);
  if (!link || link.kind !== 'pipe') return { network: net, newNodeId: '' };

  const node = makeNode('junction', position, net);
  const withNode: PipelineNetwork = { ...net, nodes: [...net.nodes, node] };

  const a: PipeLink = { ...link, id: genId('P', withNode), from: link.from, to: node.id, length: undefined };
  const b: PipeLink = { ...link, id: genId('P', { ...withNode, links: [...withNode.links, a] }), from: node.id, to: link.to, length: undefined };

  const network: PipelineNetwork = {
    ...withNode,
    links: [...withNode.links.filter((l) => l.id !== linkId), a, b],
  };
  return { network, newNodeId: node.id };
}

/** Replace a link with one of a different kind, preserving endpoints. */
export function changeLinkKind(
  net: PipelineNetwork,
  id: string,
  kind: 'pipe' | 'valve' | 'pump',
  defaults: LinkDefaults,
): PipelineNetwork {
  const existing = net.links.find((l) => l.id === id);
  if (!existing) return net;
  const rebuilt = makeLink(existing.from, existing.to, { ...defaults, kind }, net);
  rebuilt.id = id; // keep the id stable
  return { ...net, links: net.links.map((l) => (l.id === id ? rebuilt : l)) };
}
