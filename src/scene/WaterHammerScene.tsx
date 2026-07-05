/**
 * Water Hammer Lab 3D view. A straight reservoir → pipe → valve line is drawn
 * as a strip of segment cylinders; each frame their colors are set from the
 * live head field (diverging ramp around the reservoir head) and the pipe is
 * displaced vertically by the local head so the pressure wave is visible as a
 * hump travelling back and forth. A translucent ribbon traces the running
 * peak-head envelope — the worst-case pressure profile.
 *
 * All per-frame updates read TransientRunner's plain fields in useFrame,
 * bypassing React entirely.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Object3D,
  Color,
  BufferGeometry,
  BufferAttribute,
  Line,
  LineBasicMaterial,
} from 'three';
import { transientRunner } from '../transient/runner';
import { divergingColor } from './colormap';
import { useAppStore } from '../ui/store';

const VISUAL_LENGTH = 34;
const BASE_Y = 8;
const HEIGHT_SCALE = 0.02; // metres of head -> world units of displacement

export function WaterHammerScene() {
  const segments = useAppStore((s) => s.labInputs.segments);
  const nodeCount = segments + 1;

  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  const xs = useMemo(
    () => Array.from({ length: nodeCount }, (_, i) => (i / (nodeCount - 1)) * VISUAL_LENGTH),
    [nodeCount],
  );

  // Static layout of the segment cylinders.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const segLen = VISUAL_LENGTH / segments;
    for (let i = 0; i < segments; i++) {
      dummy.position.set((xs[i] + xs[i + 1]) / 2, BASE_Y, 0);
      dummy.rotation.set(0, 0, Math.PI / 2); // lay the cylinder along X
      dummy.scale.set(0.5, segLen * 0.96, 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set('#8fa0b3'));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = segments;
  }, [segments, xs, dummy, color]);

  // Wave profile line (current head) and peak-envelope line. Built as THREE.Line
  // objects and mounted via <primitive> to avoid the R3F <line> / SVG collision.
  const waveLine = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(nodeCount * 3), 3));
    return new Line(g, new LineBasicMaterial({ color: '#ffffff' }));
  }, [nodeCount]);
  const envLine = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(nodeCount * 3), 3));
    return new Line(g, new LineBasicMaterial({ color: '#ff5a4d', transparent: true, opacity: 0.6 }));
  }, [nodeCount]);

  useFrame(() => {
    const frame = transientRunner.latestFrame;
    const mesh = meshRef.current;
    if (!frame || !mesh) return;
    const { head, maxEnvelope, reservoirHead, joukowsky } = frame;
    if (head.length !== nodeCount) return;
    const span = Math.max(joukowsky, 1);

    // Recolor segments and displace them by local head.
    const segLen = VISUAL_LENGTH / segments;
    for (let i = 0; i < segments; i++) {
      const h = 0.5 * (head[i] + head[i + 1]);
      color.copy(divergingColor(h, reservoirHead, span));
      mesh.setColorAt(i, color);
      dummy.position.set((xs[i] + xs[i + 1]) / 2, BASE_Y + (h - reservoirHead) * HEIGHT_SCALE, 0);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(0.5, segLen * 0.96, 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Wave profile line (current head) and peak envelope line.
    const wavePos = waveLine.geometry.getAttribute('position') as BufferAttribute;
    const envPos = envLine.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < nodeCount; i++) {
      wavePos.setXYZ(i, xs[i], BASE_Y + (head[i] - reservoirHead) * HEIGHT_SCALE + 1.1, 0);
      envPos.setXYZ(i, xs[i], BASE_Y + (maxEnvelope[i] - reservoirHead) * HEIGHT_SCALE + 1.1, 0);
    }
    wavePos.needsUpdate = true;
    envPos.needsUpdate = true;
  });

  return (
    <group>
      {/* Reservoir block at the upstream end. */}
      <mesh position={[-1.5, BASE_Y, 0]}>
        <boxGeometry args={[3, 6, 3]} />
        <meshStandardMaterial color="#3aa0a0" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Valve block at the downstream end. */}
      <mesh position={[VISUAL_LENGTH + 1, BASE_Y, 0]}>
        <boxGeometry args={[1.6, 2.4, 2.4]} />
        <meshStandardMaterial color="#e0a030" metalness={0.4} roughness={0.5} />
      </mesh>

      <instancedMesh ref={meshRef} args={[undefined, undefined, segments]}>
        <cylinderGeometry args={[1, 1, 1, 14]} />
        <meshStandardMaterial metalness={0.25} roughness={0.55} />
      </instancedMesh>

      {/* Live wave profile (current head) and peak-head envelope ribbon. */}
      <primitive object={waveLine} />
      <primitive object={envLine} />
    </group>
  );
}
