/**
 * R3F canvas: lighting, ground grid, camera controls, and the active view —
 * either the steady-state network (Global View) or the transient Water Hammer
 * Lab. No external environment map: COEP require-corp (public/_headers) forbids
 * cross-origin asset fetches, so lighting is entirely local.
 *
 * Navigation uses CameraControls (orbit + pan + dolly with damping) plus view
 * presets and WASD/arrow keyboard nudges, registered on a small command bus so
 * the DOM panel buttons can drive the 3D camera.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraControls, Grid } from '@react-three/drei';
import { NetworkView } from './NetworkView';
import { WaterHammerScene } from './WaterHammerScene';
import { useAppStore } from '../ui/store';
import { registerCameraControls, keyboardNudge, CamControls, SceneBounds } from './cameraControl';
import { sectionBounds } from './sectionView';

function CameraRig({ bounds }: { bounds: SceneBounds }) {
  const ref = useRef<CameraControls>(null);

  useEffect(() => {
    registerCameraControls(ref.current as unknown as CamControls, () => bounds);
    return () => registerCameraControls(null, () => bounds);
  }, [bounds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/range.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (keyboardNudge(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <CameraControls ref={ref} makeDefault dampingFactor={0.06} />;
}

export function Scene() {
  const scene = useAppStore((s) => s.scene);
  const network = useAppStore((s) => s.network);
  const activeSectionId = useAppStore((s) => s.activeSectionId);

  // Scene bounds drive the camera presets / framing.
  const bounds = useMemo<SceneBounds>(() => {
    if (scene === 'waterhammer') return { cx: 17, cy: 8, cz: 0, radius: 20 };
    if (network.nodes.length === 0) return { cx: 10, cy: 10, cz: 0, radius: 20 };
    // On a section page, frame just that area (plus its tie-in neighbors).
    if (activeSectionId) {
      const sb = sectionBounds(network, activeSectionId);
      if (sb) return sb;
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const n of network.nodes) {
      minX = Math.min(minX, n.position.x); maxX = Math.max(maxX, n.position.x);
      minY = Math.min(minY, n.position.y); maxY = Math.max(maxY, n.position.y);
      minZ = Math.min(minZ, n.position.z); maxZ = Math.max(maxZ, n.position.z);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const radius = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2, 6);
    return { cx, cy, cz, radius };
  }, [scene, network, activeSectionId]);

  return (
    <Canvas camera={{ position: [18, 22, 40], fov: 50 }} shadows>
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#bcd4ff', '#20262e', 0.7]} />
      <directionalLight position={[20, 40, 20]} intensity={1.2} castShadow />
      <directionalLight position={[-25, 20, -15]} intensity={0.35} />
      <Grid
        args={[80, 80]}
        cellSize={2}
        cellColor="#2a3038"
        sectionColor="#39424d"
        position={[10, 0, 0]}
        infiniteGrid
        fadeDistance={140}
      />
      {scene === 'waterhammer' ? <WaterHammerScene /> : <NetworkView />}
      <CameraRig bounds={bounds} />
    </Canvas>
  );
}
