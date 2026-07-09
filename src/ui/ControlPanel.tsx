/**
 * Overlay control panel: run analysis, manage the project (save/load), assemble
 * (clone a skid, load the stress grid), toggle Global/Detail view, inspect and
 * edit the selected component, and surface pump BEP warnings. Kept as a plain
 * DOM overlay so text stays crisp and accessible.
 */

import { useMemo, useRef } from 'react';
import { useAppStore, AnalysisResult, ViewMode } from './store';
import { useSimulationWorker } from './useSimulationWorker';
import { paToBar, headToPressure } from '../domain/units';
import { serializeProject, deserializeProject } from '../domain/serialize';
import { checkConnectors } from '../domain/connectivity';
import { analyzePumpDuty, PumpDuty } from '../analysis/pumpDuty';
import { analyzeNetworkVulnerability } from '../analysis/networkVulnerability';
import { waterProperties } from '../domain/fluid';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { WaterHammerPanel } from './WaterHammerPanel';
import { BuildPanel } from './BuildPanel';
import { NetworkTransientPanel } from './NetworkTransientPanel';
import { ReportPanel } from './ReportPanel';
import { EXAMPLE_PLANTS } from '../examples/examplePlants';
import { PipelineNetwork, ValidationIssue } from '../domain/network';
import { applyPreset, flyTo, ViewPreset } from '../scene/cameraControl';

const VIEW_PRESETS: ViewPreset[] = ['fit', 'iso', 'top', 'front', 'side'];

function FlowToggle() {
  const flowViz = useAppStore((s) => s.flowViz);
  const toggleFlowViz = useAppStore((s) => s.toggleFlowViz);
  const result = useAppStore((s) => s.result);
  if (!result) return null;
  return (
    <div className="row">
      <button className={flowViz ? 'wide active' : 'wide'} onClick={toggleFlowViz}>
        {flowViz ? '● Flow animation: ON' : '○ Flow animation: OFF'}
      </button>
    </div>
  );
}

function NavBar() {
  return (
    <div className="section navbar">
      <h2>View</h2>
      <div className="preset-row">
        {VIEW_PRESETS.map((p) => (
          <button key={p} onClick={() => applyPreset(p)}>
            {p === 'fit' ? 'Fit' : p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
      <p className="hint">Drag = orbit · Right-drag / Shift-drag = pan · Wheel = zoom · WASD/QE move · Arrows rotate</p>
    </div>
  );
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Inspector() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);
  const selectedId = useAppStore((s) => s.selectedId);
  const updateValveOpening = useAppStore((s) => s.updateValveOpening);
  const updatePumpSpeed = useAppStore((s) => s.updatePumpSpeed);
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
        {link.kind === 'valve' && (
          <label className="field">
            <span>Opening: {(link.opening * 100).toFixed(0)}%</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={link.opening}
              onChange={(e) => updateValveOpening(link.id, Number(e.target.value))}
            />
          </label>
        )}
        {link.kind === 'pump' && (
          <label className="field">
            <span>Speed: {(link.speedRatio * 100).toFixed(0)}%</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={link.speedRatio}
              onChange={(e) => updatePumpSpeed(link.id, Number(e.target.value))}
            />
          </label>
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
  const setNetwork = useAppStore((s) => s.setNetwork);
  const cloneFirstSkid = useAppStore((s) => s.cloneFirstSkid);
  const scene = useAppStore((s) => s.scene);
  const setScene = useAppStore((s) => s.setScene);
  const fileInput = useRef<HTMLInputElement>(null);

  const connectorWarnings = useMemo(() => checkConnectors(network), [network]);
  const duties = useMemo(
    () => (result ? analyzePumpDuty(network, result) : []),
    [network, result],
  );
  const dutyWarnings = duties.filter((d) => d.status !== 'ok');

  const vuln = useMemo(
    () => (result ? analyzeNetworkVulnerability(network, result, waterProperties(network.temperatureC)) : null),
    [network, result],
  );
  const vulnWarnings: string[] = [];
  if (vuln) {
    for (const v of vuln.valveCavitation) {
      if (v.cavitating) {
        vulnWarnings.push(`${v.linkId}: valve cavitating (σ ${v.sigma.toFixed(1)} < ${v.sigmaIncipient}) at ΔP ${v.headLoss.toFixed(1)} m — throttle less or resize.`);
      }
    }
    for (const e of vuln.erosion) {
      vulnWarnings.push(`${e.linkId}: velocity ${e.velocity.toFixed(1)} m/s exceeds erosional limit ${e.limit.toFixed(1)} m/s (API RP 14E).`);
    }
    for (const n of vuln.npsh) {
      if (!n.ok) vulnWarnings.push(`${n.linkId}: NPSH margin ${n.margin.toFixed(1)} m (avail ${n.npshAvailable.toFixed(1)} < req+margin) — cavitation risk.`);
    }
  }

  const onLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setNetwork(deserializeProject(String(reader.result)));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to load project.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="panel">
      <h1>FluidTwin 3D</h1>
      <p className="subtitle">Pipeline Digital Twin · Phase 3</p>

      <div className="row segmented">
        <button className={scene === 'network' ? 'active' : ''} onClick={() => setScene('network')}>
          Network (Steady)
        </button>
        <button className={scene === 'waterhammer' ? 'active' : ''} onClick={() => setScene('waterhammer')}>
          Water Hammer
        </button>
      </div>

      <NavBar />

      {scene === 'waterhammer' ? (
        <WaterHammerPanel />
      ) : (
        <NetworkControls
          solve={solve}
          solving={solving}
          result={result}
          viewMode={viewMode}
          setViewMode={setViewMode}
          cloneFirstSkid={cloneFirstSkid}
          setNetwork={setNetwork}
          network={network}
          fileInput={fileInput}
          onLoadFile={onLoadFile}
          dutyWarnings={dutyWarnings}
          connectorWarnings={connectorWarnings}
          vulnWarnings={vulnWarnings}
        />
      )}
    </div>
  );
}

interface NetworkControlsProps {
  solve: () => void;
  solving: boolean;
  result: AnalysisResult | null;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  cloneFirstSkid: () => void;
  setNetwork: (net: PipelineNetwork) => void;
  network: PipelineNetwork;
  fileInput: React.RefObject<HTMLInputElement>;
  onLoadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dutyWarnings: PumpDuty[];
  connectorWarnings: ValidationIssue[];
  vulnWarnings: string[];
}

function NetworkControls({
  solve,
  solving,
  result,
  viewMode,
  setViewMode,
  cloneFirstSkid,
  setNetwork,
  network,
  fileInput,
  onLoadFile,
  dutyWarnings,
  connectorWarnings,
  vulnWarnings,
}: NetworkControlsProps) {
  const select = useAppStore((s) => s.select);

  // Click an alarm -> select and fly the camera to the offending component.
  const focusLink = (linkId: string) => {
    const link = network.links.find((l) => l.id === linkId);
    if (!link) return;
    select(linkId);
    const a = network.nodes.find((n) => n.id === link.from)?.position;
    const b = network.nodes.find((n) => n.id === link.to)?.position;
    if (a && b) flyTo((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 4);
  };
  const focusNode = (nodeId: string) => {
    const n = network.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    select(nodeId);
    flyTo(n.position.x, n.position.y, n.position.z, 3);
  };

  const editMode = useAppStore((s) => s.editMode);
  const toggleEditMode = useAppStore((s) => s.toggleEditMode);

  return (
    <>
      <div className="row" style={{ marginTop: 10 }}>
        <button className={editMode ? 'wide active' : 'wide'} onClick={toggleEditMode}>
          {editMode ? '✎ Build Mode: ON' : '✎ Build / Edit Pipeline'}
        </button>
      </div>

      {editMode && <BuildPanel />}

      <div className="row">
        <button className="primary" onClick={solve} disabled={solving}>
          {solving ? 'Solving…' : 'Run Steady-State Analysis'}
        </button>
      </div>

      {!editMode && (
        <div className="row segmented">
          <button className={viewMode === 'global' ? 'active' : ''} onClick={() => setViewMode('global')}>
            Global View
          </button>
          <button className={viewMode === 'detail' ? 'active' : ''} onClick={() => setViewMode('detail')}>
            Detail View
          </button>
        </div>
      )}

      {result && (
        <div className="status">
          {result.converged ? (
            <span className="ok">Converged in {result.iterations} iterations (residual {result.residual.toExponential(1)})</span>
          ) : (
            <span className="warn">Did not converge</span>
          )}
        </div>
      )}

      <FlowToggle />

      <div className="section">
        <h2>Assemble</h2>
        <label className="ef">
          <span>Example plant</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const p = EXAMPLE_PLANTS.find((x) => x.id === e.target.value);
              if (p) setNetwork(p.build());
              e.target.value = '';
            }}
          >
            <option value="" disabled>Load…</option>
            {EXAMPLE_PLANTS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <button onClick={cloneFirstSkid} disabled={network.subAssemblies.length === 0}>Clone Skid</button>
          <button onClick={() => setNetwork(pumpSkidNetwork())}>Reset Demo</button>
          <button onClick={() => download('pipeline-project.json', serializeProject(network))}>Save JSON</button>
          <button onClick={() => fileInput.current?.click()}>Load JSON…</button>
        </div>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={onLoadFile} />
      </div>

      <div className="section">
        <h2>Network</h2>
        <div className="kv"><span>Nodes</span><span>{network.nodes.length}</span></div>
        <div className="kv"><span>Links</span><span>{network.links.length}</span></div>
        <div className="kv"><span>Sub-assemblies</span><span>{network.subAssemblies.length}</span></div>
        <div className="kv"><span>Fluid temp</span><span>{network.temperatureC} °C</span></div>
      </div>

      <NetworkTransientPanel />

      <ReportPanel />

      {(dutyWarnings.length > 0 || connectorWarnings.length > 0 || vulnWarnings.length > 0) && (
        <div className="section">
          <h2>Warnings</h2>
          {dutyWarnings.map((d) => (
            <p key={d.linkId} className="warn click" onClick={() => focusLink(d.linkId)}>⚠ {d.linkId}: {d.message}</p>
          ))}
          {vulnWarnings.map((w, i) => {
            const id = w.split(':')[0];
            return (
              <p key={`v${i}`} className="warn click" onClick={() => focusLink(id)}>⚠ {w}</p>
            );
          })}
          {connectorWarnings.slice(0, 4).map((w, i) => (
            <p key={i} className="warn click" onClick={() => w.ref && focusNode(w.ref)}>⚠ {w.message}</p>
          ))}
          {connectorWarnings.length > 4 && (
            <p className="muted">…and {connectorWarnings.length - 4} more size warnings.</p>
          )}
        </div>
      )}

      <div className="section">
        <h2>Inspector</h2>
        <Inspector />
      </div>

      <p className="footnote">
        Head field colored blue→red. Reservoirs are cubes, junctions spheres, pumps blue, valves
        amber. Pipes render via a single InstancedMesh draw call.
      </p>
    </>
  );
}
