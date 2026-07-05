/**
 * R3F canvas: lighting, ground grid, camera controls, and the network view.
 * The Global/Detail view switch (Phase 5) will drive the camera through this
 * component; for now OrbitControls gives free inspection.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { NetworkView } from './NetworkView';

export function Scene() {
  return (
    <Canvas camera={{ position: [18, 22, 34], fov: 50 }} shadows>
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 40, 20]} intensity={1.1} castShadow />
      <Grid
        args={[80, 80]}
        cellSize={2}
        cellColor="#2a3038"
        sectionColor="#39424d"
        position={[10, 0, 0]}
        infiniteGrid
        fadeDistance={120}
      />
      <NetworkView />
      <Environment preset="city" />
      <OrbitControls makeDefault target={[10, 12, 0]} />
    </Canvas>
  );
}
