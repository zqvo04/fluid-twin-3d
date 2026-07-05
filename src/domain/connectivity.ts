/**
 * Connector consistency checks — the "snap fit" validation for the assembly
 * editor. Real flanged components must match line size; a size change at a
 * junction without a reducer is a modelling error worth flagging.
 */

import { PipelineNetwork, NetworkLink, ValidationIssue } from './network';
import { NominalSize } from './catalog/pipes';

/** Nominal size of a sized link (pipe or valve); pumps have no single bore. */
export function linkNominalSize(link: NetworkLink): NominalSize | null {
  if (link.kind === 'pipe' || link.kind === 'valve') return link.nps;
  return null;
}

/**
 * Flag nodes where sized links of differing NPS meet without a reducer. A tee
 * branch legitimately changes size, so we only warn (not error) and let the
 * engineer confirm a reducer is present.
 */
export function checkConnectors(net: PipelineNetwork): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const sizesAtNode = new Map<string, Set<NominalSize>>();
  for (const link of net.links) {
    const size = linkNominalSize(link);
    if (!size) continue;
    for (const nodeId of [link.from, link.to]) {
      if (!sizesAtNode.has(nodeId)) sizesAtNode.set(nodeId, new Set());
      sizesAtNode.get(nodeId)!.add(size);
    }
  }

  for (const [nodeId, sizes] of sizesAtNode) {
    if (sizes.size > 1) {
      issues.push({
        severity: 'warning',
        message: `Size change at node ${nodeId} (${[...sizes].join(', ')}); confirm a reducer is installed.`,
        ref: nodeId,
      });
    }
  }

  return issues;
}
