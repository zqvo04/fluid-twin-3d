import { useEffect } from 'react';
import { Scene } from './scene/Scene';
import { TopBar } from './ui/TopBar';
import { ControlPanel } from './ui/ControlPanel';
import { PressureChart } from './ui/PressureChart';
import { FlowDashboard } from './ui/FlowDashboard';
import { PlantOverview } from './ui/PlantOverview';
import { useAppStore } from './ui/store';

export default function App() {
  const scene = useAppStore((s) => s.scene);
  const page = useAppStore((s) => s.route.page);
  const syncFromHash = useAppStore((s) => s.syncFromHash);

  // Keep the store's route in sync with the URL hash (back/forward, deep links).
  useEffect(() => {
    syncFromHash();
    const onHash = () => syncFromHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [syncFromHash]);

  return (
    <div className="app">
      <div className="scene-layer">
        <Scene />
      </div>

      <TopBar />
      <ControlPanel />

      {scene === 'waterhammer' && (
        <div className="chart-dock">
          <PressureChart />
        </div>
      )}

      {scene === 'network' && page === 'plant' && <PlantOverview />}
      {scene === 'network' && page === 'section' && <FlowDashboard />}
    </div>
  );
}
