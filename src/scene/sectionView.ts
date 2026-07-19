/**
 * Scene-side helpers for the multi-view platform: mapping sections to colors,
 * deciding what is "in focus" on a section page, and framing a section for the
 * camera. Pure functions over the network + the active section id, so the R3F
 * components stay thin.
 */

import { Color } from 'three';
import { PipelineNetwork, plantSections } from '../domain/network';
import { nodeSectionId, linkSectionId, nodesInSection, UNASSIGNED } from '../domain/sections';
import { SceneBounds } from './cameraControl';

/** Ghost color for elements outside the focused section. */
export const GHOST = new Color('#2b313b');
/** Fallback tint for Unassigned elements under the section overlay. */
export const UNASSIGNED_TINT = new Color('#6a7280');

export function sectionColors(net: PipelineNetwork): Map<string, Color> {
  const m = new Map<string, Color>();
  for (const s of plantSections(net)) m.set(s.id, new Color(s.color));
  m.set(UNASSIGNED, UNASSIGNED_TINT.clone());
  return m;
}

/** A node/link is in focus when no section is active, or it is in that section. */
export function inFocus(activeSectionId: string | null, elementSectionId: string): boolean {
  return activeSectionId === null || elementSectionId === activeSectionId;
}

export function nodeInFocus(net: PipelineNetwork, activeSectionId: string | null, nodeId: string): boolean {
  if (activeSectionId === null) return true;
  const node = net.nodes.find((n) => n.id === nodeId);
  return node ? nodeSectionId(node) === activeSectionId : true;
}

export function linkInFocus(net: PipelineNetwork, activeSectionId: string | null, from: string): boolean {
  if (activeSectionId === null) return true;
  const node = net.nodes.find((n) => n.id === from);
  return node ? nodeSectionId(node) === activeSectionId : true;
}

export { nodeSectionId, linkSectionId };

/**
 * Bounding sphere of a section's nodes (plus one ring of tie-in neighbors so the
 * boundary is visible), for the camera to frame when a section page opens.
 * Returns null for an empty section.
 */
export function sectionBounds(net: PipelineNetwork, sectionId: string): SceneBounds | null {
  const inside = nodesInSection(net, sectionId);
  if (inside.length === 0) return null;

  const core = new Set(inside.map((n) => n.id));
  const ids = new Set(core);
  // Include *immediate* tie-in neighbors so the section's connections are framed.
  // Test membership against the frozen core, never the growing set, or the pass
  // would chain neighbor-of-neighbor and pull in the whole network.
  for (const l of net.links) {
    if (core.has(l.from) && !core.has(l.to)) ids.add(l.to);
    else if (core.has(l.to) && !core.has(l.from)) ids.add(l.from);
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const n of net.nodes) {
    if (!ids.has(n.id)) continue;
    minX = Math.min(minX, n.position.x); maxX = Math.max(maxX, n.position.x);
    minY = Math.min(minY, n.position.y); maxY = Math.max(maxY, n.position.y);
    minZ = Math.min(minZ, n.position.z); maxZ = Math.max(maxZ, n.position.z);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const radius = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2, 5);
  return { cx, cy, cz, radius };
}
