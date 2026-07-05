/**
 * Flow visualization for the Global (network) view. Once solved, bright glowing
 * slugs travel through each pipe in the flow direction at a speed proportional
 * to velocity and colored by magnitude (blue slow → red fast). Rendered as a
 * single InstancedMesh, animated in useFrame (bypassing React).
 *
 * The slugs are a FIXED visible size (not scaled by the small pipe diameter, a
 * bug that made earlier flow markers invisible) and densely spaced, so flow
 * reads clearly at any zoom.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Vector3, Color } from 'three';
import { useAppStore } from '../ui/store';
import { PipelineNetwork, nodeById } from '../domain/network';
import { rampColor, normalize } from './colormap';

const VIS_SPEED = 2.4; // playback exaggeration so slow flows stay visible
const SLUG_SIZE = 0.5; // fixed world-size so slugs are always visible
const SPACING = 2.0; // one slug per ~2 world units of pipe

interface Seg {
  id: string;
  a: Vector3;
  b: Vector3;
  length: number;
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
      if (link.kind !== 'pipe' && link.kind !== 'valve' && link.kind !== 'pump') continue;
      const a = nodeById(network, link.from).position;
      const b = nodeById(network, link.to).position;
      const av = new Vector3(a.x, a.y, a.z);
      const bv = new Vector3(b.x, b.y, b.z);
      out.push({ id: link.id, a: av, b: bv, length: av.distanceTo(bv) || 1 });
    }
    return out;
  }, [network]);

  const particles = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let s = 0; s < segs.length; s++) {
      const n = Math.max(2, Math.min(14, Math.round(segs[s].length / SPACING)));
      for (let k = 0; k < n; k++) out.push({ seg: s, phase: k / n });
    }
    return out;
  }, [segs]);

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
      const v = r ? r.velocity : NaN;
      // Pumps report NaN velocity; use the downstream pipe feel via a token speed.
      const speed = Number.isFinite(v) ? v : 0;
      if (Math.abs(speed) < 1e-4) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(p, dummy.matrix);
        continue;
      }
      part.phase += (speed / seg.length) * dt * VIS_SPEED;
      part.phase = ((part.phase % 1) + 1) % 1;

      dummy.position.lerpVectors(seg.a, seg.b, part.phase);
      dummy.scale.setScalar(SLUG_SIZE);
      dummy.updateMatrix();
      mesh.setMatrixAt(p, dummy.matrix);

      color.copy(rampColor(normalize(Math.min(Math.abs(speed), 3), 0, 3)));
      mesh.setColorAt(p, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (!result) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, particles.length)]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial emissive="#43e6ff" emissiveIntensity={1.4} color="#0a2b33" toneMapped={false} />
    </instancedMesh>
  );
}
