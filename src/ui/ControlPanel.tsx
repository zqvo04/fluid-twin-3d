/**
 * Overlay control panel: run the analysis, toggle Global/Detail view, and
 * inspect the selected component's results. Kept as a plain DOM overlay (not
 * in-canvas) so text stays crisp and accessible.
 */

import { useAppStore } from './store';
import { useSimulationWorker } from './useSimulationWorker';
import { paToBar, headToPressure } from '../domain/units';

function SelectionDetails() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);
  const selectedId = useAppStore((s) => s.selectedId);
  if (!selectedId) return <p className="muted">Click a component to inspect it.</p>;

  const node = network.nodes.find((n) => n.id === selectedId);
  const link = network.links.find((l) => l.id === selectedId);

  if (node) {
    const head = result?.heads.get(node.id);
    const rho = 998; // ~water at 20C; display-only conversion
    return (
      <div>
        <h3>{node.id}</h3>
        <div className="kv"><span>Type</span><span>{node.type}</span></div>
        <div className="kv"><span>Elevation</span><span>{node.position.y.toFixed(2)} m</span></div>
        {head !== undefined && (
          <>
            <div className="kv"><span>Total head</span><span>{head.toFixed(2)} m</span></div>
            <div className="kv">
              <span>Gauge pressure</span>
              <span>{paToBar(headToPressure(head - node.position.y, rho)).toFixed(2)} bar</span>
            </div>
          </>
        )}
      </div>
    );
  }

  if (link) {
    const r = result?.links.get(link.id);
    return (
      <div>
        <h3>{link.id}</h3>
        <div className="kv"><span>Kind</span><span>{link.kind}</span></div>
        {link.kind !== 'pump' && 'nps' in link && (
          <div className="kv"><span>Size</span><span>{link.nps} Sch {link.schedule}</span></div>
        )}
        {r && (
          <>
            <div className="kv"><span>Flow</span><span>{(r.flow * 3600).toFixed(1)} m³/h</span></div>
            {Number.isFinite(r.velocity) && (
              <div className="kv"><span>Velocity</span><span>{r.velocity.toFixed(2)} m/s</span></div>
            )}
            <div className="kv"><span>Head loss</span><span>{r.headLoss.toFixed(2)} m</span></div>
          </>
        )}
      </div>
    );
  }

  return null;
}

export function ControlPanel() {
  const { solve } = useSimulationWorker();
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const result = useAppStore((s) => s.result);
  const solving = useAppStore((s) => s.solving);
  const network = useAppStore((s) => s.network);

  return (
    <div className="panel">
      <h1>FluidTwin 3D</h1>
      <p className="subtitle">Pipeline Digital Twin · Phase 1</p>

      <div className="row">
        <button className="primary" onClick={solve} disabled={solving}>
          {solving ? 'Solving…' : 'Run Steady-State Analysis'}
        </button>
      </div>

      <div className="row segmented">
        <button className={viewMode === 'global' ? 'active' : ''} onClick={() => setViewMode('global')}>
          Global View
        </button>
        <button className={viewMode === 'detail' ? 'active' : ''} onClick={() => setViewMode('detail')}>
          Detail View
        </button>
      </div>

      {result && (
        <div className="status">
          {result.converged ? (
            <span className="ok">Converged in {result.iterations} iterations (residual {result.residual.toExponential(1)})</span>
          ) : (
            <span className="warn">Did not converge</span>
          )}
        </div>
      )}

      <div className="section">
        <h2>Network</h2>
        <div className="kv"><span>Nodes</span><span>{network.nodes.length}</span></div>
        <div className="kv"><span>Links</span><span>{network.links.length}</span></div>
        <div className="kv"><span>Sub-assemblies</span><span>{network.subAssemblies.length}</span></div>
        <div className="kv"><span>Fluid temp</span><span>{network.temperatureC} °C</span></div>
      </div>

      <div className="section">
        <h2>Inspector</h2>
        <SelectionDetails />
      </div>

      <p className="footnote">
        Head field colored blue→red across the network. Reservoirs are cubes, junctions spheres,
        pumps blue, valves amber.
      </p>
    </div>
  );
}
