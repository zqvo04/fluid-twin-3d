/**
 * R3F canvas: lighting, ground grid, camera controls, and the network view.
 * The Global/Detail view switch (Phase 5) will drive the camera through this
 * component; for now OrbitControls gives free inspection.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { NetworkView } from './NetworkView';

// No external environment map: COEP require-corp (see public/_headers) forbids
// cross-origin asset fetches, so lighting is entirely local.
export function Scene() {
  return (
    <Canvas camera={{ position: [18, 22, 34], fov: 50 }} shadows>
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
      <NetworkView />
      <OrbitControls makeDefault target={[10, 12, 0]} />
    </Canvas>
  );
}
