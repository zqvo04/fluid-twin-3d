/**
 * Water Hammer Lab 3D view.
 *
 * The pipe is geometrically STATIC (a real pipe does not move). Instead:
 *   - each segment is colored by its local pressure (diverging ramp), and
 *   - segments whose hoop stress exceeds the B31.3 occasional allowable (1.33 S)
 *     are highlighted with a pulsing red "overstress sleeve" — the danger zone.
 *   - cavitating sections show vapor bubbles.
 * The pressure wave itself is shown as a separate diagnostic graph floating
 * above the pipe (a white "current head" trace and a red peak-envelope trace),
 * so the dynamics are visible without deforming the pipe.
 *
 * An installed surge air-chamber is drawn as a vertical vessel near the valve.
 * All per-frame updates read TransientRunner's plain fields in useFrame,
 * bypassing React.
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
import { pipeGeometry, A106B } from '../domain/catalog/pipes';
import { G } from '../domain/units';
import { OCCASIONAL_FACTOR } from '../analysis/stress';

const VISUAL_LENGTH = 34;
const PIPE_Y = 6; // static pipe centerline
const GRAPH_Y = 13; // baseline of the floating pressure graph (= reservoir head)
const GRAPH_SCALE = 0.018; // metres of head -> world units in the graph
const RHO = 998;

export function WaterHammerScene() {
  const labInputs = useAppStore((s) => s.labInputs);
  const segments = labInputs.segments;
  const nodeCount = segments + 1;

  const meshRef = useRef<InstancedMesh>(null);
  const hotRef = useRef<InstancedMesh>(null);
  const cavRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  // Pipe wall stress constants for the current line.
  const stressConst = useMemo(() => {
    const geo = pipeGeometry(labInputs.nps, labInputs.schedule);
    const t = geo.wall - A106B.corrosionAllowance;
    // sigma = P * OD / (2 t); util = sigma / (1.33 S). Combine into a factor on P.
    const utilPerPressure = geo.od / (2 * t) / (OCCASIONAL_FACTOR * A106B.allowable);
    return { utilPerPressure };
  }, [labInputs.nps, labInputs.schedule]);

  const xs = useMemo(
    () => Array.from({ length: nodeCount }, (_, i) => (i / (nodeCount - 1)) * VISUAL_LENGTH),
    [nodeCount],
  );

  // Static segment layout (never moves).
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const hot = hotRef.current;
    const segLen = VISUAL_LENGTH / segments;
    if (mesh) {
      for (let i = 0; i < segments; i++) {
        dummy.position.set((xs[i] + xs[i + 1]) / 2, PIPE_Y, 0);
        dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(0.5, segLen * 0.96, 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.set('#8fa0b3'));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = segments;
    }
    if (hot) {
      dummy.scale.set(0, 0, 0);
      for (let i = 0; i < segments; i++) {
        dummy.position.set((xs[i] + xs[i + 1]) / 2, PIPE_Y, 0);
        dummy.updateMatrix();
        hot.setMatrixAt(i, dummy.matrix);
      }
      hot.instanceMatrix.needsUpdate = true;
      hot.count = segments;
    }
    const cav = cavRef.current;
    if (cav) {
      dummy.scale.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < nodeCount; i++) {
        dummy.position.set(xs[i], PIPE_Y, 0);
        dummy.updateMatrix();
        cav.setMatrixAt(i, dummy.matrix);
      }
      cav.instanceMatrix.needsUpdate = true;
    }
  }, [segments, nodeCount, xs, dummy, color]);

  // Floating diagnostic graph lines (wave + peak envelope).
  const waveLine = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(nodeCount * 3), 3));
    return new Line(g, new LineBasicMaterial({ color: '#ffffff' }));
  }, [nodeCount]);
  const envLine = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(nodeCount * 3), 3));
    return new Line(g, new LineBasicMaterial({ color: '#ff5a4d', transparent: true, opacity: 0.7 }));
  }, [nodeCount]);

  useFrame(({ clock }) => {
    const frame = transientRunner.latestFrame;
    const mesh = meshRef.current;
    const hot = hotRef.current;
    if (!frame || !mesh) return;
    const { head, maxEnvelope, reservoirHead, joukowsky } = frame;
    if (head.length !== nodeCount) return;
    const span = Math.max(joukowsky, 1);
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 8);
    const segLen = VISUAL_LENGTH / segments;

    // Color segments by pressure; highlight overstressed ones. Pipe is static.
    for (let i = 0; i < segments; i++) {
      const h = 0.5 * (head[i] + head[i + 1]);
      color.copy(divergingColor(h, reservoirHead, span));
      mesh.setColorAt(i, color);

      if (hot) {
        const gauge = h - labInputs.pipeElevation;
        const util = Math.max(0, gauge) * RHO * G * stressConst.utilPerPressure;
        const over = util > 1;
        const s = over ? 0.62 + 0.12 * pulse : 0;
        dummy.position.set((xs[i] + xs[i + 1]) / 2, PIPE_Y, 0);
        dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(s, segLen, s);
        dummy.updateMatrix();
        hot.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = false;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (hot) hot.instanceMatrix.needsUpdate = true;

    // Floating graph: current head trace + peak envelope trace.
    const wavePos = waveLine.geometry.getAttribute('position') as BufferAttribute;
    const envPos = envLine.geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < nodeCount; i++) {
      wavePos.setXYZ(i, xs[i], GRAPH_Y + (head[i] - reservoirHead) * GRAPH_SCALE, 0);
      envPos.setXYZ(i, xs[i], GRAPH_Y + (maxEnvelope[i] - reservoirHead) * GRAPH_SCALE, 0);
    }
    wavePos.needsUpdate = true;
    envPos.needsUpdate = true;

    // Cavitation bubbles at cavitating sections (on the static pipe).
    const cav = cavRef.current;
    if (cav && frame.cavity && frame.cavity.length === nodeCount) {
      for (let i = 0; i < nodeCount; i++) {
        const v = frame.cavity[i];
        const s = v > 1e-7 ? Math.min(1.6, 0.4 + Math.cbrt(v) * 2.2) : 0;
        dummy.position.set(xs[i], PIPE_Y, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        cav.setMatrixAt(i, dummy.matrix);
      }
      cav.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Reservoir block at the upstream end. */}
      <mesh position={[-1.5, PIPE_Y, 0]}>
        <boxGeometry args={[3, 6, 3]} />
        <meshStandardMaterial color="#3aa0a0" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Valve block at the downstream end. */}
      <mesh position={[VISUAL_LENGTH + 1, PIPE_Y, 0]}>
        <boxGeometry args={[1.6, 2.4, 2.4]} />
        <meshStandardMaterial color="#e0a030" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Surge air chamber (when installed) just upstream of the valve. */}
      {labInputs.airChamber && (
        <group position={[VISUAL_LENGTH - 3, PIPE_Y + 3.5, 0]}>
          <mesh>
            <cylinderGeometry args={[1.1, 1.1, 5, 20]} />
            <meshStandardMaterial color="#7fb2d9" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[0, -3, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 2, 12]} />
            <meshStandardMaterial color="#9aa4b0" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* Static pipe segments, colored by pressure. */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, segments]}>
        <cylinderGeometry args={[1, 1, 1, 14]} />
        <meshStandardMaterial metalness={0.25} roughness={0.55} />
      </instancedMesh>

      {/* Overstress highlight sleeves (B31.3 occasional exceedance). */}
      <instancedMesh ref={hotRef} args={[undefined, undefined, segments]}>
        <cylinderGeometry args={[1, 1, 1, 14]} />
        <meshStandardMaterial color="#ff2a1a" emissive="#ff3020" emissiveIntensity={1.1} transparent opacity={0.55} />
      </instancedMesh>

      {/* Cavitation bubbles. */}
      <instancedMesh ref={cavRef} args={[undefined, undefined, nodeCount]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial color="#eaf6ff" emissive="#a9d8ff" emissiveIntensity={0.6} transparent opacity={0.85} />
      </instancedMesh>

      {/* Floating diagnostic pressure graph (wave + peak envelope). */}
      <primitive object={waveLine} />
      <primitive object={envLine} />
    </group>
  );
}
