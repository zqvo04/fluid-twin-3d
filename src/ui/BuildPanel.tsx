/**
 * Interactive builder panel. Place tanks/junctions on the ground, connect them
 * with pipes / valves (gate, globe, ball, butterfly) / pumps, edit every
 * property, and delete. The user constructs their own plant and runs steady +
 * vulnerability analysis on it.
 */

import { useAppStore, EditTool } from './store';
import { NOMINAL_SIZES, NominalSize, Schedule } from '../domain/catalog/pipes';
import { VALVE_TYPES, ValveType } from '../domain/catalog/valves';

const TOOLS: { id: EditTool; label: string; hint: string }[] = [
  { id: 'run', label: '✏ Pipe Run', hint: 'Click the ground to draw a connected run. Click a node to start/continue from it, or click a pipe to tap in (branch). Esc to finish.' },
  { id: 'place-reservoir', label: '+ Tank', hint: 'Click the ground to drop a tank/reservoir.' },
  { id: 'place-junction', label: '+ Junction', hint: 'Click the ground to drop a junction.' },
  { id: 'connect', label: 'Connect', hint: 'Click two nodes to join them with a component.' },
  { id: 'select', label: 'Select', hint: 'Click a component to edit it.' },
  { id: 'delete', label: 'Delete', hint: 'Click a node or component to remove it.' },
];

function EditableInspector() {
  const network = useAppStore((s) => s.network);
  const selectedId = useAppStore((s) => s.selectedId);
  const editNode = useAppStore((s) => s.editNode);
  const editLink = useAppStore((s) => s.editLink);
  const editLinkKind = useAppStore((s) => s.editLinkKind);
  if (!selectedId) return <p className="muted">Nothing selected.</p>;

  const node = network.nodes.find((n) => n.id === selectedId);
  const link = network.links.find((l) => l.id === selectedId);

  if (node) {
    return (
      <div>
        <h3>{node.id}</h3>
        <label className="ef">
          <span>Type</span>
          <select
            value={node.type}
            onChange={(e) => editNode(node.id, { type: e.target.value as 'junction' | 'reservoir' })}
          >
            <option value="junction">Junction</option>
            <option value="reservoir">Tank / Reservoir</option>
          </select>
        </label>
        <label className="ef">
          <span>Elevation (m)</span>
          <input
            type="number"
            value={node.position.y}
            step={1}
            onChange={(e) =>
              editNode(node.id, { position: { ...node.position, y: Number(e.target.value) } })
            }
          />
        </label>
        {node.type === 'reservoir' ? (
          <label className="ef">
            <span>Fixed head (m)</span>
            <input
              type="number"
              value={node.fixedHead ?? node.position.y}
              step={1}
              onChange={(e) => editNode(node.id, { fixedHead: Number(e.target.value) })}
            />
          </label>
        ) : (
          <label className="ef">
            <span>Demand (m³/h)</span>
            <input
              type="number"
              value={((node.demand ?? 0) * 3600).toFixed(1)}
              step={1}
              onChange={(e) => editNode(node.id, { demand: Number(e.target.value) / 3600 })}
            />
          </label>
        )}
      </div>
    );
  }

  if (link) {
    const sized = link.kind === 'pipe' || link.kind === 'valve';
    return (
      <div>
        <h3>{link.id}</h3>
        <label className="ef">
          <span>Component</span>
          <select value={link.kind} onChange={(e) => editLinkKind(link.id, e.target.value as 'pipe' | 'valve' | 'pump')}>
            <option value="pipe">Pipe</option>
            <option value="valve">Valve</option>
            <option value="pump">Pump</option>
          </select>
        </label>
        {sized && (
          <>
            <label className="ef">
              <span>Size</span>
              <select value={link.nps} onChange={(e) => editLink(link.id, { nps: e.target.value as NominalSize })}>
                {NOMINAL_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="ef">
              <span>Schedule</span>
              <select value={link.schedule} onChange={(e) => editLink(link.id, { schedule: e.target.value as Schedule })}>
                <option value="40">Sch 40</option>
                <option value="80">Sch 80</option>
              </select>
            </label>
          </>
        )}
        {link.kind === 'valve' && (
          <label className="ef">
            <span>Valve type</span>
            <select value={link.valveType} onChange={(e) => editLink(link.id, { valveType: e.target.value as ValveType })}>
              {VALVE_TYPES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  }

  return null;
}

export function BuildPanel() {
  const editTool = useAppStore((s) => s.editTool);
  const setEditTool = useAppStore((s) => s.setEditTool);
  const buildElevation = useAppStore((s) => s.buildElevation);
  const setBuildElevation = useAppStore((s) => s.setBuildElevation);
  const linkDefaults = useAppStore((s) => s.linkDefaults);
  const setLinkDefaults = useAppStore((s) => s.setLinkDefaults);
  const newBlankNetwork = useAppStore((s) => s.newBlankNetwork);
  const connectFrom = useAppStore((s) => s.connectFrom);

  const hint = TOOLS.find((t) => t.id === editTool)?.hint ?? '';

  return (
    <div className="section">
      <h2>Build</h2>
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button key={t.id} className={editTool === t.id ? 'active' : ''} onClick={() => setEditTool(t.id)}>
            {t.label}
          </button>
        ))}
        <button onClick={newBlankNetwork}>New (blank)</button>
      </div>
      <p className="hint">{connectFrom && editTool === 'connect' ? 'Now click the second node…' : hint}</p>

      {(editTool.startsWith('place') || editTool === 'run') && (
        <label className="ef">
          <span>Place elevation (m)</span>
          <input
            type="number"
            value={buildElevation}
            step={1}
            onChange={(e) => setBuildElevation(Number(e.target.value))}
          />
        </label>
      )}

      {(editTool === 'connect' || editTool === 'run') && (
        <div className="predict" style={{ marginTop: 8 }}>
          <label className="ef">
            <span>New component</span>
            <select value={linkDefaults.kind} onChange={(e) => setLinkDefaults({ kind: e.target.value as 'pipe' | 'valve' | 'pump' })}>
              <option value="pipe">Pipe</option>
              <option value="valve">Valve</option>
              <option value="pump">Pump</option>
            </select>
          </label>
          {linkDefaults.kind !== 'pump' && (
            <>
              <label className="ef">
                <span>Size</span>
                <select value={linkDefaults.nps} onChange={(e) => setLinkDefaults({ nps: e.target.value as NominalSize })}>
                  {NOMINAL_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              {linkDefaults.kind === 'valve' && (
                <label className="ef">
                  <span>Valve type</span>
                  <select value={linkDefaults.valveType} onChange={(e) => setLinkDefaults({ valveType: e.target.value as ValveType })}>
                    {VALVE_TYPES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      )}

      <div className="section" style={{ marginTop: 10 }}>
        <h2>Edit selected</h2>
        <EditableInspector />
      </div>
    </div>
  );
}
