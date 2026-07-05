/**
 * 3D view of the pipeline network. Pipes are drawn in bulk via InstancedPipes
 * (one draw call); the far fewer valves, pumps, and nodes are individual
 * markers so they stay clickable and visually distinct — a P&ID-in-3D rather
 * than a bare graph. The selected pipe gets a highlight overlay.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, Quaternion, Mesh, Line, LineBasicMaterial, BufferGeometry, BufferAttribute } from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, NetworkNode, NetworkLink, nodeById } from '../domain/network';
import { pipeGeometry } from '../domain/catalog/pipes';
import { rampColor, normalize } from './colormap';
import { InstancedPipes } from './InstancedPipes';
import { FlowParticles } from './FlowParticles';
import { flyTo } from './cameraControl';

const UP = new Vector3(0, 1, 0);

function orient(a: NetworkNode, b: NetworkNode) {
  const av = new Vector3(a.position.x, a.position.y, a.position.z);
  const bv = new Vector3(b.position.x, b.position.y, b.position.z);
  const dir = bv.clone().sub(av);
  const length = dir.length();
  const mid = av.clone().add(bv).multiplyScalar(0.5);
  const quat = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return { mid, quat, length };
}

type HeadResult = ReturnType<typeof useAppStore.getState>['result'];

function headColor(result: HeadResult, from: string, to: string): string {
  if (!result) return '#8a8f98';
  const heads = [...result.heads.values()];
  const min = Math.min(...heads);
  const max = Math.max(...heads);
  const hA = result.heads.get(from) ?? min;
  const hB = result.heads.get(to) ?? min;
  return '#' + rampColor(normalize((hA + hB) / 2, min, max)).getHexString();
}

/** Valve and pump links: a body cylinder plus a distinct marker. */
function ComponentLink({ net, link }: { net: PipelineNetwork; link: NetworkLink }) {
  const handleLinkClick = useAppStore((s) => s.handleLinkClick);
  const editMode = useAppStore((s) => s.editMode);
  const selected = useAppStore((s) => s.selectedId === link.id);
  const result = useAppStore((s) => s.result);
  const { mid, quat, length } = orient(nodeById(net, link.from), nodeById(net, link.to));

  const radius =
    link.kind === 'valve' ? Math.max(0.06, pipeGeometry(link.nps, link.schedule).od * 1.4) : 0.14;
  const color = headColor(result, link.from, link.to);

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        handleLinkClick(link.id);
        if (!editMode) flyTo(mid.x, mid.y, mid.z, Math.max(2, length * 0.6));
      }}
    >
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[radius, radius, length, 12]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
      {link.kind === 'pump' ? (
        <mesh position={mid}>
          <sphereGeometry args={[0.5, 20, 20]} />
          <meshStandardMaterial
            color="#2b6cff"
            emissive={selected ? '#ffffff' : '#000000'}
            emissiveIntensity={selected ? 0.5 : 0}
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
      ) : (
        <mesh position={mid} quaternion={quat}>
          <boxGeometry args={[radius * 3, 0.5, radius * 3]} />
          <meshStandardMaterial
            color="#e0a030"
            emissive={selected ? '#ffffff' : '#000000'}
            emissiveIntensity={selected ? 0.5 : 0}
            metalness={0.4}
            roughness={0.5}
          />
        </mesh>
      )}
    </group>
  );
}

function NodeMesh({ node }: { node: NetworkNode }) {
  const handleNodeClick = useAppStore((s) => s.handleNodeClick);
  const editMode = useAppStore((s) => s.editMode);
  const selected = useAppStore((s) => s.selectedId === node.id);
  const isAnchor = useAppStore((s) => s.connectFrom === node.id || s.runFrom === node.id);
  const [hovered, setHovered] = useState(false);
  const isReservoir = node.type === 'reservoir';
  const highlight = selected || isAnchor || hovered;
  return (
    <mesh
      position={[node.position.x, node.position.y, node.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        handleNodeClick(node.id);
        if (!editMode) flyTo(node.position.x, node.position.y, node.position.z, 3);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
      scale={hovered ? 1.25 : 1}
    >
      {isReservoir ? <boxGeometry args={[1.4, 1.4, 1.4]} /> : <sphereGeometry args={[0.32, 16, 16]} />}
      <meshStandardMaterial
        color={isAnchor ? '#ffd24d' : isReservoir ? '#3aa0a0' : '#c0c4cc'}
        emissive={highlight ? '#ffffff' : '#000000'}
        emissiveIntensity={highlight ? 0.55 : 0}
      />
    </mesh>
  );
}

/**
 * Ground plane + build affordances. Captures clicks to place nodes (or extend a
 * Pipe Run) at the current elevation, snapped to a 1 m grid. Shows a ghost
 * marker following the cursor and, while a run is in progress, a rubber-band
 * line from the last node to the cursor — so building feels like drawing.
 */
function EditPlane() {
  const editMode = useAppStore((s) => s.editMode);
  const editTool = useAppStore((s) => s.editTool);
  const buildElevation = useAppStore((s) => s.buildElevation);
  const placeNodeAt = useAppStore((s) => s.placeNodeAt);
  const runClickAt = useAppStore((s) => s.runClickAt);
  const runFrom = useAppStore((s) => s.runFrom);
  const network = useAppStore((s) => s.network);

  const ghostRef = useRef<Mesh>(null);
  const rubber = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    return new Line(g, new LineBasicMaterial({ color: '#ffd24d' }));
  }, []);

  const isRun = editTool === 'run';
  const active = editMode && (editTool.startsWith('place') || isRun);
  if (!active) return null;

  const runFromNode = runFrom ? network.nodes.find((n) => n.id === runFrom) : null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const x = Math.round(e.point.x);
    const z = Math.round(e.point.z);
    if (ghostRef.current) ghostRef.current.position.set(x, buildElevation, z);
    if (isRun && runFromNode) {
      const pos = rubber.geometry.getAttribute('position') as BufferAttribute;
      pos.setXYZ(0, runFromNode.position.x, runFromNode.position.y, runFromNode.position.z);
      pos.setXYZ(1, x, buildElevation, z);
      pos.needsUpdate = true;
    }
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[10, buildElevation, 0]}
        onPointerMove={onMove}
        onClick={(e) => {
          e.stopPropagation();
          const pos = { x: Math.round(e.point.x), y: buildElevation, z: Math.round(e.point.z) };
          if (isRun) runClickAt(pos);
          else placeNodeAt(pos);
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0.05} color="#2b6cff" />
      </mesh>

      {/* Ghost placement marker following the cursor. */}
      <mesh ref={ghostRef} position={[0, buildElevation, 0]}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshStandardMaterial color="#ffd24d" emissive="#ffd24d" emissiveIntensity={0.5} transparent opacity={0.55} />
      </mesh>

      {isRun && runFromNode && <primitive object={rubber} />}
    </group>
  );
}

/** Highlight overlay for the selected pipe (instanced pipes can't self-emit). */
function SelectionHighlight({ net }: { net: PipelineNetwork }) {
  const selectedId = useAppStore((s) => s.selectedId);
  const link = net.links.find((l) => l.id === selectedId && l.kind === 'pipe');
  if (!link || link.kind !== 'pipe') return null;
  const { mid, quat, length } = orient(nodeById(net, link.from), nodeById(net, link.to));
  const radius = Math.max(0.05, pipeGeometry(link.nps, link.schedule).od * 1.4) * 1.35;
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, length * 1.02, 14]} />
      <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} transparent opacity={0.28} />
    </mesh>
  );
}

export function NetworkView() {
  const network = useAppStore((s) => s.network);
  const flowViz = useAppStore((s) => s.flowViz);
  const components = useMemo(
    () => network.links.filter((l) => l.kind === 'valve' || l.kind === 'pump'),
    [network],
  );

  // Esc ends an in-progress Pipe Run / connection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAppStore.getState().cancelBuild();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <group>
      <InstancedPipes network={network} />
      {components.map((l) => (
        <ComponentLink key={l.id} net={network} link={l} />
      ))}
      {network.nodes.map((n) => (
        <NodeMesh key={n.id} node={n} />
      ))}
      <SelectionHighlight net={network} />
      {flowViz && <FlowParticles network={network} />}
      <EditPlane />
    </group>
  );
}
