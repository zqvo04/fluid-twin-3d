/**
 * R3F canvas: lighting, ground grid, camera controls, and the active view —
 * either the steady-state network (Global View) or the transient Water Hammer
 * Lab. No external environment map: COEP require-corp (public/_headers) forbids
 * cross-origin asset fetches, so lighting is entirely local.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { NetworkView } from './NetworkView';
import { WaterHammerScene } from './WaterHammerScene';
import { useAppStore } from '../ui/store';

export function Scene() {
  const scene = useAppStore((s) => s.scene);
  const target: [number, number, number] = scene === 'waterhammer' ? [17, 8, 0] : [10, 12, 0];

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
      <OrbitControls makeDefault target={target} />
    </Canvas>
  );
}
