/**
 * Flow visualization for the Global (network) view. Once a steady solution
 * exists, bright markers advect along each pipe in the flow direction at a
 * speed proportional to the computed velocity — so the network shows *flow*,
 * not just a static pressure color. Rendered as a single InstancedMesh and
 * animated in useFrame, bypassing React.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3 } from 'three';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, nodeById } from '../domain/network';
import { pipeGeometry } from '../domain/catalog/pipes';

const VIS_SPEED = 2.2; // playback exaggeration so slow flows are still visible

interface Seg {
  id: string;
  a: Vector3;
  b: Vector3;
  length: number;
  radius: number;
}

interface Particle {
  seg: number;
  phase: number;
}

export function FlowParticles({ network }: { network: PipelineNetwork }) {
  const meshRef = useRef<InstancedMesh>(null);
  const result = useAppStore((s) => s.result);
  const dummy = useMemo(() => new Object3D(), []);

  // Sized links (pipes + valves) as geometric segments.
  const segs = useMemo<Seg[]>(() => {
    const out: Seg[] = [];
    for (const link of network.links) {
      if (link.kind !== 'pipe' && link.kind !== 'valve') continue;
      const a = nodeById(network, link.from).position;
      const b = nodeById(network, link.to).position;
      const av = new Vector3(a.x, a.y, a.z);
      const bv = new Vector3(b.x, b.y, b.z);
      out.push({
        id: link.id,
        a: av,
        b: bv,
        length: av.distanceTo(bv) || 1,
        radius: Math.max(0.05, pipeGeometry(link.nps, link.schedule).od * 1.4),
      });
    }
    return out;
  }, [network]);

  // Particle density scales down for large networks.
  const perSeg = segs.length > 120 ? 2 : 5;
  const particles = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let s = 0; s < segs.length; s++) {
      for (let k = 0; k < perSeg; k++) out.push({ seg: s, phase: k / perSeg });
    }
    return out;
  }, [segs, perSeg]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = particles.length;
  }, [particles]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !result) return;
    const dt = Math.min(delta, 0.05);

    for (let p = 0; p < particles.length; p++) {
      const part = particles[p];
      const seg = segs[part.seg];
      const r = result.links.get(seg.id);
      const v = r ? r.velocity : 0;
      if (!Number.isFinite(v) || Math.abs(v) < 1e-4) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(p, dummy.matrix);
        continue;
      }
      // Advance phase along the pipe; wrap in [0,1). Negative velocity reverses.
      part.phase += (v / seg.length) * dt * VIS_SPEED;
      part.phase = ((part.phase % 1) + 1) % 1;

      dummy.position.lerpVectors(seg.a, seg.b, part.phase);
      const s = seg.radius * 0.8;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(p, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!result) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, particles.length)]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial color="#8fe9ff" emissive="#4fd8ff" emissiveIntensity={0.7} />
    </instancedMesh>
  );
}
