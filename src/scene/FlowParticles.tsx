/**
 * Flow visualization for the Global (network) view. Once a steady solution
 * exists, arrow glyphs (cones) advect along each pipe pointing in the flow
 * direction, at a speed proportional to the computed velocity and colored by
 * velocity magnitude (blue slow → red fast). Rendered as a single InstancedMesh
 * and animated in useFrame, bypassing React.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3, Quaternion, Color } from 'three';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, nodeById } from '../domain/network';
import { pipeGeometry } from '../domain/catalog/pipes';
import { rampColor, normalize } from './colormap';

const VIS_SPEED = 2.2; // playback exaggeration so slow flows stay visible
const UP = new Vector3(0, 1, 0);
const FLIP = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);

interface Seg {
  id: string;
  a: Vector3;
  b: Vector3;
  length: number;
  radius: number;
  fwd: Quaternion; // cone orientation for +flow
  rev: Quaternion; // cone orientation for -flow
}

interface Particle {
  seg: number;
  phase: number;
}

export function FlowParticles({ network }: { network: PipelineNetwork }) {
  const meshRef = useRef<InstancedMesh>(null);
  const result = useAppStore((s) => s.result);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  const segs = useMemo<Seg[]>(() => {
    const out: Seg[] = [];
    for (const link of network.links) {
      if (link.kind !== 'pipe' && link.kind !== 'valve') continue;
      const a = nodeById(network, link.from).position;
      const b = nodeById(network, link.to).position;
      const av = new Vector3(a.x, a.y, a.z);
      const bv = new Vector3(b.x, b.y, b.z);
      const dir = bv.clone().sub(av).normalize();
      const fwd = new Quaternion().setFromUnitVectors(UP, dir);
      out.push({
        id: link.id,
        a: av,
        b: bv,
        length: av.distanceTo(bv) || 1,
        radius: Math.max(0.06, pipeGeometry(link.nps, link.schedule).od * 1.4),
        fwd,
        rev: fwd.clone().multiply(FLIP),
      });
    }
    return out;
  }, [network]);

  const perSeg = segs.length > 120 ? 2 : 6;
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
      part.phase += (v / seg.length) * dt * VIS_SPEED;
      part.phase = ((part.phase % 1) + 1) % 1;

      dummy.position.lerpVectors(seg.a, seg.b, part.phase);
      dummy.quaternion.copy(v >= 0 ? seg.fwd : seg.rev);
      const s = seg.radius;
      dummy.scale.set(s, s * 1.8, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(p, dummy.matrix);

      // Color by speed (0..3 m/s -> blue..red).
      color.copy(rampColor(normalize(Math.min(Math.abs(v), 3), 0, 3)));
      mesh.setColorAt(p, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (!result) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, particles.length)]}>
      <coneGeometry args={[0.5, 1.4, 10]} />
      <meshStandardMaterial emissive="#20303a" emissiveIntensity={0.5} metalness={0.2} roughness={0.5} />
    </instancedMesh>
  );
}
