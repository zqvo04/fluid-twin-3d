/**
 * InstancedMesh pipe renderer — draws every pipe/valve link in a single draw
 * call so the Global View holds 60 fps at the 500-pipe scale. Per-instance
 * transforms orient each cylinder along its link; per-instance colors carry the
 * steady-state head field. Clicks resolve through the instanceId back to the
 * link id for selection.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, Vector3, Quaternion, Color } from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, nodeById, PipeLink } from '../domain/network';
import { pipeGeometry } from '../domain/catalog/pipes';
import { rampColor, normalize, divergingColor } from './colormap';
import { flyTo } from './cameraControl';
import { netTransientRunner } from '../transient/netRunner';
import { sectionColors, GHOST, linkSectionId } from './sectionView';

const UP = new Vector3(0, 1, 0);

function pipeLinks(net: PipelineNetwork): PipeLink[] {
  return net.links.filter((l): l is PipeLink => l.kind === 'pipe');
}

export function InstancedPipes({ network }: { network: PipelineNetwork }) {
  const meshRef = useRef<InstancedMesh>(null);
  const result = useAppStore((s) => s.result);
  const handleLinkClick = useAppStore((s) => s.handleLinkClick);
  const editMode = useAppStore((s) => s.editMode);
  const activeSectionId = useAppStore((s) => s.activeSectionId);
  const sectionOverlay = useAppStore((s) => s.sectionOverlay);

  const links = useMemo(() => pipeLinks(network), [network]);
  const secColors = useMemo(() => sectionColors(network), [network]);
  const linkSections = useMemo(() => links.map((l) => linkSectionId(network, l)), [links, network]);

  // Static transforms depend only on geometry, so compute once per network.
  const transforms = useMemo(() => {
    const dummy = new Object3D();
    const out: Float32Array[] = [];
    for (const link of links) {
      const a = nodeById(network, link.from).position;
      const b = nodeById(network, link.to).position;
      const av = new Vector3(a.x, a.y, a.z);
      const bv = new Vector3(b.x, b.y, b.z);
      const dir = bv.clone().sub(av);
      const len = dir.length();
      dummy.position.copy(av).add(bv).multiplyScalar(0.5);
      dummy.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
      const radius = Math.max(0.16, pipeGeometry(link.nps, link.schedule).od * 2.6);
      dummy.scale.set(radius, len, radius);
      dummy.updateMatrix();
      out.push(new Float32Array(dummy.matrix.elements));
    }
    return out;
  }, [links, network]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    for (let i = 0; i < transforms.length; i++) {
      dummy.matrix.fromArray(transforms[i]);
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = transforms.length;
  }, [transforms]);

  // Recolor whenever the result, section focus, or overlay changes.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    const neutral = new Color('#8a8f98');
    // On the plant overview, the overlay tints by section; a section page always
    // shows the head field (with off-section pipes ghosted).
    const tintBySection = activeSectionId === null && sectionOverlay;

    let min = 0;
    let max = 1;
    if (result) {
      const heads = [...result.heads.values()];
      min = Math.min(...heads);
      max = Math.max(...heads);
    }

    let i = 0;
    for (const link of links) {
      if (tintBySection) {
        color.copy(secColors.get(linkSections[i]) ?? neutral);
      } else if (result) {
        const hA = result.heads.get(link.from) ?? min;
        const hB = result.heads.get(link.to) ?? min;
        color.copy(rampColor(normalize((hA + hB) / 2, min, max)));
      } else {
        color.copy(neutral);
      }
      // Ghost pipes that are outside the focused section.
      if (activeSectionId !== null && linkSections[i] !== activeSectionId) {
        color.lerp(GHOST, 0.85);
      }
      mesh.setColorAt(i, color);
      i++;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [result, links, activeSectionId, sectionOverlay, secColors, linkSections]);

  // Live recolor during a network water-hammer run: pipes flash with the
  // travelling pressure wave (diverging ramp around the mid of the live range).
  const liveColor = useMemo(() => new Color(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !netTransientRunner.active) return;
    const { headById, minHead, maxHead } = netTransientRunner;
    const ref = 0.5 * (minHead + maxHead);
    const span = Math.max((maxHead - minHead) / 2, 1);
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const hA = headById.get(link.from);
      const hB = headById.get(link.to);
      if (hA === undefined || hB === undefined) continue;
      liveColor.copy(divergingColor(0.5 * (hA + hB), ref, span));
      mesh.setColorAt(i, liveColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const link = links[e.instanceId];
    if (!link) return;
    handleLinkClick(link.id, { x: e.point.x, y: e.point.y, z: e.point.z });
    if (!editMode) {
      const a = nodeById(network, link.from).position;
      const b = nodeById(network, link.to).position;
      flyTo((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 4);
    }
  };

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, links.length)]} onClick={onClick}>
      <cylinderGeometry args={[1, 1, 1, 12]} />
      <meshStandardMaterial metalness={0.3} roughness={0.6} />
    </instancedMesh>
  );
}
