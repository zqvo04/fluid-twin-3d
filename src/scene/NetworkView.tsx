/**
 * 3D view of the pipeline network. Renders each node as a marker and each link
 * as an oriented cylinder colored by the steady-state head field. Pumps and
 * valves get distinct component markers so the Global View reads as a real
 * P&ID-in-3D rather than a bare graph.
 *
 * Phase 2 will replace per-link meshes with InstancedMesh + an axial pressure
 * shader; this direct form keeps the Phase 1 seed legible.
 */

import { useMemo } from 'react';
import { Vector3, Quaternion } from 'three';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, NetworkNode, nodeById } from '../domain/network';
import { pipeGeometry } from '../domain/catalog/pipes';
import { rampColor, normalize } from './colormap';

const UP = new Vector3(0, 1, 0);

function nodeVec(n: NetworkNode): Vector3 {
  return new Vector3(n.position.x, n.position.y, n.position.z);
}

function LinkMesh({ net, linkId }: { net: PipelineNetwork; linkId: string }) {
  const link = net.links.find((l) => l.id === linkId)!;
  const result = useAppStore((s) => s.result);
  const select = useAppStore((s) => s.select);
  const selected = useAppStore((s) => s.selectedId === linkId);

  const a = nodeVec(nodeById(net, link.from));
  const b = nodeVec(nodeById(net, link.to));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const quat = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());

  // Color by mean head along the link, normalized over the whole field.
  let color = '#8a8f98';
  if (result) {
    const heads = [...result.heads.values()];
    const min = Math.min(...heads);
    const max = Math.max(...heads);
    const hA = result.heads.get(link.from) ?? min;
    const hB = result.heads.get(link.to) ?? min;
    color = '#' + rampColor(normalize((hA + hB) / 2, min, max)).getHexString();
  }

  const radius =
    link.kind === 'pipe' || link.kind === 'valve'
      ? Math.max(0.06, pipeGeometry(link.nps, link.schedule).od * 1.4)
      : 0.18;

  return (
    <group>
      <mesh
        position={mid}
        quaternion={quat}
        onClick={(e) => {
          e.stopPropagation();
          select(linkId);
        }}
      >
        <cylinderGeometry args={[radius, radius, length, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? '#ffffff' : '#000000'}
          emissiveIntensity={selected ? 0.4 : 0}
          metalness={0.3}
          roughness={0.6}
        />
      </mesh>
      {link.kind === 'pump' && (
        <mesh position={mid}>
          <sphereGeometry args={[0.5, 20, 20]} />
          <meshStandardMaterial color="#2b6cff" metalness={0.5} roughness={0.4} />
        </mesh>
      )}
      {link.kind === 'valve' && (
        <mesh position={mid} quaternion={quat}>
          <boxGeometry args={[radius * 3, 0.5, radius * 3]} />
          <meshStandardMaterial color="#e0a030" metalness={0.4} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

function NodeMesh({ node }: { node: NetworkNode }) {
  const select = useAppStore((s) => s.select);
  const selected = useAppStore((s) => s.selectedId === node.id);
  const isReservoir = node.type === 'reservoir';
  return (
    <mesh
      position={nodeVec(node)}
      onClick={(e) => {
        e.stopPropagation();
        select(node.id);
      }}
    >
      {isReservoir ? <boxGeometry args={[1.4, 1.4, 1.4]} /> : <sphereGeometry args={[0.28, 16, 16]} />}
      <meshStandardMaterial
        color={isReservoir ? '#3aa0a0' : '#c0c4cc'}
        emissive={selected ? '#ffffff' : '#000000'}
        emissiveIntensity={selected ? 0.5 : 0}
      />
    </mesh>
  );
}

export function NetworkView() {
  const network = useAppStore((s) => s.network);
  const linkIds = useMemo(() => network.links.map((l) => l.id), [network]);

  return (
    <group>
      {network.nodes.map((n) => (
        <NodeMesh key={n.id} node={n} />
      ))}
      {linkIds.map((id) => (
        <LinkMesh key={id} net={network} linkId={id} />
      ))}
    </group>
  );
}
