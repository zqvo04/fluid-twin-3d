/**
 * Plant sections — the multi-view platform's partition layer.
 *
 * A section is a named, colored group of nodes (a process area / unit). The
 * network graph stays a single source of truth: every node carries an optional
 * `sectionId`, and a link's section is *derived* from its `from` node. Two
 * consequences fall out of that choice and are the reason it was taken over
 * per-section graphs:
 *
 *   - A tie-in between areas is simply a link whose endpoints live in
 *     different sections — nothing to store, nothing to keep in sync.
 *   - The full-network solver is untouched; sections are a view/aggregation
 *     unit. A section can also be solved on its own by extracting its
 *     subnetwork and pinning the cut boundary nodes as fixed-head reservoirs.
 *
 * This module is pure (no React/Three) so it runs under Node in tests.
 */

import {
  PipelineNetwork,
  NetworkNode,
  NetworkLink,
  PlantSection,
  plantSections,
} from './network';

/** Sentinel id used in the UI for nodes/links with no section assigned. */
export const UNASSIGNED = '__unassigned__';

/** The section id of a node, normalized to UNASSIGNED when unset. */
export function nodeSectionId(node: NetworkNode): string {
  return node.sectionId ?? UNASSIGNED;
}

/**
 * The section id of a link, derived from its upstream (`from`) node. A link is
 * considered to "belong" to the section that feeds it, which keeps ownership
 * unambiguous when its two ends sit in different areas.
 */
export function linkSectionId(net: PipelineNetwork, link: NetworkLink): string {
  const from = net.nodes.find((n) => n.id === link.from);
  return from ? nodeSectionId(from) : UNASSIGNED;
}

/** Nodes that belong to a section (UNASSIGNED collects the untagged ones). */
export function nodesInSection(net: PipelineNetwork, sectionId: string): NetworkNode[] {
  return net.nodes.filter((n) => nodeSectionId(n) === sectionId);
}

/** Links whose upstream node belongs to a section. */
export function linksInSection(net: PipelineNetwork, sectionId: string): NetworkLink[] {
  return net.links.filter((l) => linkSectionId(net, l) === sectionId);
}

export interface BoundaryLink {
  link: NetworkLink;
  fromSection: string;
  toSection: string;
}

/**
 * Tie-in links: those whose two endpoints live in different sections. These are
 * the physical connections between plant areas and are drawn specially in the
 * scene. Derived on demand, never stored.
 */
export function boundaryLinks(net: PipelineNetwork): BoundaryLink[] {
  const secOf = new Map(net.nodes.map((n) => [n.id, nodeSectionId(n)]));
  const out: BoundaryLink[] = [];
  for (const link of net.links) {
    const a = secOf.get(link.from);
    const b = secOf.get(link.to);
    if (a !== undefined && b !== undefined && a !== b) {
      out.push({ link, fromSection: a, toSection: b });
    }
  }
  return out;
}

/** Count of nodes not yet assigned to any section. */
export function unassignedCount(net: PipelineNetwork): number {
  return net.nodes.reduce((n, node) => n + (node.sectionId ? 0 : 1), 0);
}

/**
 * True when a section has at least one node — used to hide empty "Unassigned"
 * buckets from the UI.
 */
export function sectionHasNodes(net: PipelineNetwork, sectionId: string): boolean {
  return net.nodes.some((n) => nodeSectionId(n) === sectionId);
}

// --- Section CRUD (pure) -------------------------------------------------

let sectionSeq = 0;
const SECTION_PALETTE = [
  '#4c8dff', // cobalt
  '#28c19a', // teal
  '#f4a63b', // amber
  '#c77dff', // violet
  '#ff6b8b', // rose
  '#5ad1e6', // cyan
  '#9bd45a', // lime
  '#ff9d5c', // coral
];

/** Next palette color for a new section, cycling through the fixed set. */
export function nextSectionColor(net: PipelineNetwork): string {
  return SECTION_PALETTE[plantSections(net).length % SECTION_PALETTE.length];
}

export function makeSection(net: PipelineNetwork, name?: string): PlantSection {
  const n = plantSections(net).length + 1;
  return {
    id: `SEC_${Date.now().toString(36)}_${sectionSeq++}`,
    name: name ?? `Area ${n}`,
    color: nextSectionColor(net),
  };
}

export function addSection(net: PipelineNetwork, section: PlantSection): PipelineNetwork {
  return { ...net, sections: [...plantSections(net), section] };
}

export function updateSection(
  net: PipelineNetwork,
  id: string,
  patch: Partial<PlantSection>,
): PipelineNetwork {
  return {
    ...net,
    sections: plantSections(net).map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

/** Remove a section; its member nodes fall back to Unassigned. */
export function removeSection(net: PipelineNetwork, id: string): PipelineNetwork {
  return {
    ...net,
    sections: plantSections(net).filter((s) => s.id !== id),
    nodes: net.nodes.map((n) => (n.sectionId === id ? { ...n, sectionId: undefined } : n)),
  };
}

/** Assign a set of nodes to a section (or to Unassigned when id is UNASSIGNED). */
export function assignNodesToSection(
  net: PipelineNetwork,
  nodeIds: Iterable<string>,
  sectionId: string,
): PipelineNetwork {
  const set = new Set(nodeIds);
  const target = sectionId === UNASSIGNED ? undefined : sectionId;
  return {
    ...net,
    nodes: net.nodes.map((n) => (set.has(n.id) ? { ...n, sectionId: target } : n)),
  };
}

// --- Section-scoped solve extraction -------------------------------------

/**
 * Extract a standalone subnetwork for a single section so it can be solved on
 * its own. Nodes inside the section are kept as-is. A boundary node (one that
 * is outside the section but connected to it by a tie-in) is pulled in and
 * converted to a fixed-head reservoir, its head taken from `boundaryHeads`
 * (typically the most recent full-network solution). Tie-in links are kept so
 * the section still "sees" its supply/return.
 *
 * The returned network reuses the original node/link ids, so a result solved on
 * it maps straight back onto the full model.
 */
export function sectionSubnetwork(
  net: PipelineNetwork,
  sectionId: string,
  boundaryHeads: Map<string, number>,
): { network: PipelineNetwork; boundaryNodeIds: string[] } {
  const inside = new Set(nodesInSection(net, sectionId).map((n) => n.id));

  // Links touching the section: internal (both ends inside) or tie-ins.
  const keptLinks = net.links.filter((l) => inside.has(l.from) || inside.has(l.to));

  // Boundary nodes = endpoints of kept links that are outside the section.
  const boundaryIds = new Set<string>();
  for (const l of keptLinks) {
    if (!inside.has(l.from)) boundaryIds.add(l.from);
    if (!inside.has(l.to)) boundaryIds.add(l.to);
  }

  const nodes: NetworkNode[] = [];
  for (const n of net.nodes) {
    if (inside.has(n.id)) {
      nodes.push(n);
    } else if (boundaryIds.has(n.id)) {
      // Pin the cut boundary at its last-known head as a reservoir.
      const head = boundaryHeads.get(n.id) ?? n.fixedHead ?? n.position.y;
      nodes.push({ ...n, type: 'reservoir', fixedHead: head, demand: undefined });
    }
  }

  return {
    network: {
      nodes,
      links: keptLinks,
      subAssemblies: [],
      sections: plantSections(net).filter((s) => s.id === sectionId),
      temperatureC: net.temperatureC,
    },
    boundaryNodeIds: [...boundaryIds],
  };
}

// --- Section KPI aggregation ---------------------------------------------

export interface LinkResultLite {
  flow: number;
  velocity: number;
  headLoss: number;
}

export interface SectionKpi {
  sectionId: string;
  name: string;
  color: string;
  nodeCount: number;
  linkCount: number;
  /** Sum of positive junction demands in the section [m^3/s]. */
  demand: number;
  /** Peak absolute velocity across the section's links [m/s], or null. */
  peakVelocity: number | null;
  /** Max total head among the section's nodes [m], or null. */
  maxHead: number | null;
  /** Min total head among the section's nodes [m], or null. */
  minHead: number | null;
  /** True once a solution's heads cover the section (i.e. it has been solved). */
  solved: boolean;
}

/**
 * Per-section rollup of the current solution. `heads`/`links` are the solved
 * fields keyed by node/link id (empty maps = unsolved). Kept generic so the
 * store's AnalysisResult can pass its Maps without this module importing UI.
 */
export function sectionKpi(
  net: PipelineNetwork,
  sectionId: string,
  name: string,
  color: string,
  heads: Map<string, number>,
  links: Map<string, LinkResultLite>,
): SectionKpi {
  const nodes = nodesInSection(net, sectionId);
  const secLinks = linksInSection(net, sectionId);

  let demand = 0;
  let maxHead = -Infinity;
  let minHead = Infinity;
  let solvedNodes = 0;
  for (const n of nodes) {
    demand += Math.max(0, n.demand ?? 0);
    const h = heads.get(n.id);
    if (h !== undefined) {
      solvedNodes++;
      if (h > maxHead) maxHead = h;
      if (h < minHead) minHead = h;
    }
  }

  let peakVelocity = -Infinity;
  for (const l of secLinks) {
    const r = links.get(l.id);
    if (r && Number.isFinite(r.velocity)) {
      peakVelocity = Math.max(peakVelocity, Math.abs(r.velocity));
    }
  }

  return {
    sectionId,
    name,
    color,
    nodeCount: nodes.length,
    linkCount: secLinks.length,
    demand,
    peakVelocity: peakVelocity === -Infinity ? null : peakVelocity,
    maxHead: maxHead === -Infinity ? null : maxHead,
    minHead: minHead === Infinity ? null : minHead,
    solved: solvedNodes > 0,
  };
}

