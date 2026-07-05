/**
 * Modular assembly operations — the "lego" story. A SubAssembly (e.g. a pump
 * skid) can be cloned with fresh IDs and a spatial offset, then wired into the
 * larger network. This is how a single skid template is reused to build an
 * end-to-end pipeline.
 */

import { PipelineNetwork, NetworkNode, NetworkLink, Vec3, SubAssembly } from './network';

export interface CloneOptions {
  /** Appended to every cloned node/link/sub id to keep them unique. */
  idSuffix: string;
  /** Translation applied to every cloned node position. */
  offset: Vec3;
  /** Optional display name for the cloned sub-assembly. */
  name?: string;
}

export interface CloneResult {
  network: PipelineNetwork;
  newSubId: string;
  /**
   * Cloned nodes that connect to the outside world (were referenced by links
   * outside the source sub-assembly). These are the wiring points the caller
   * must connect to place the clone.
   */
  boundaryNodeIds: string[];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Clone a sub-assembly (its member nodes and internal links) into the network.
 * Only links whose both endpoints are inside the sub-assembly are cloned;
 * links crossing the boundary stay with the original and their cloned
 * endpoints become boundary nodes to be wired by the caller.
 */
export function cloneSubAssembly(net: PipelineNetwork, subId: string, opts: CloneOptions): CloneResult {
  const sub = net.subAssemblies.find((s) => s.id === subId);
  if (!sub) throw new Error(`Sub-assembly not found: ${subId}`);

  const memberNodeIds = new Set(sub.nodeIds);
  const idMap = new Map<string, string>();
  for (const id of sub.nodeIds) idMap.set(id, id + opts.idSuffix);

  // Clone member nodes with offset positions.
  const clonedNodes: NetworkNode[] = sub.nodeIds.map((oldId) => {
    const orig = net.nodes.find((n) => n.id === oldId);
    if (!orig) throw new Error(`Sub-assembly references missing node: ${oldId}`);
    return {
      ...orig,
      id: idMap.get(oldId)!,
      position: addVec(orig.position, opts.offset),
    };
  });

  // Clone only internal links (both endpoints inside the sub-assembly), and
  // record which original link ids were treated as internal.
  const clonedLinks: NetworkLink[] = [];
  const internalOrigLinkIds = new Set<string>();
  for (const linkId of sub.linkIds) {
    const orig = net.links.find((l) => l.id === linkId);
    if (!orig) throw new Error(`Sub-assembly references missing link: ${linkId}`);
    if (!memberNodeIds.has(orig.from) || !memberNodeIds.has(orig.to)) continue;
    internalOrigLinkIds.add(orig.id);
    clonedLinks.push({
      ...orig,
      id: orig.id + opts.idSuffix,
      from: idMap.get(orig.from)!,
      to: idMap.get(orig.to)!,
    } as NetworkLink);
  }

  // A member node is a boundary node if any incident link in the whole network
  // was not cloned as an internal link — i.e. it reaches outside the skid.
  const boundaryNodeIds: string[] = [];
  for (const oldId of sub.nodeIds) {
    const touchesExternal = net.links.some(
      (l) => (l.from === oldId || l.to === oldId) && !internalOrigLinkIds.has(l.id),
    );
    if (touchesExternal) boundaryNodeIds.push(idMap.get(oldId)!);
  }

  const newSub: SubAssembly = {
    id: sub.id + opts.idSuffix,
    name: opts.name ?? `${sub.name}${opts.idSuffix}`,
    nodeIds: clonedNodes.map((n) => n.id),
    linkIds: clonedLinks.map((l) => l.id),
  };

  const network: PipelineNetwork = {
    ...net,
    nodes: [...net.nodes, ...clonedNodes],
    links: [...net.links, ...clonedLinks],
    subAssemblies: [...net.subAssemblies, newSub],
  };

  return { network, newSubId: newSub.id, boundaryNodeIds };
}
