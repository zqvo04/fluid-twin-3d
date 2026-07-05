import { Scene } from './scene/Scene';
import { ControlPanel } from './ui/ControlPanel';
import { PressureChart } from './ui/PressureChart';
import { FlowDashboard } from './ui/FlowDashboard';
import { useAppStore } from './ui/store';

export default function App() {
  const scene = useAppStore((s) => s.scene);
  return (
    <div className="app">
      <Scene />
      <ControlPanel />
      {scene === 'waterhammer' && (
        <div className="chart-dock">
          <PressureChart />
        </div>
      )}
      {scene === 'network' && <FlowDashboard />}
    </div>
  );
}
