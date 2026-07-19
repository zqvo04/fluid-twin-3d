/**
 * Section manager — the workspace-panel control for the plant's areas. Lists
 * sections as clickable chips (each opens its page), creates new ones, and for
 * the active section lets the user rename, recolor, or delete it. When a node
 * is selected it also offers a one-click "assign to section", which is how a
 * plant gets partitioned: select nodes, drop them into an area.
 */

import { useAppStore } from './store';
import { plantSections } from '../domain/network';
import { nodesInSection, UNASSIGNED, unassignedCount } from '../domain/sections';

const COLOR_CHOICES = ['#4c8dff', '#28c19a', '#f4a63b', '#c77dff', '#ff6b8b', '#5ad1e6', '#9bd45a', '#ff9d5c'];

export function SectionManager() {
  const network = useAppStore((s) => s.network);
  const route = useAppStore((s) => s.route);
  const activeSectionId = useAppStore((s) => s.activeSectionId);
  const navigate = useAppStore((s) => s.navigate);
  const createSection = useAppStore((s) => s.createSection);
  const renameSection = useAppStore((s) => s.renameSection);
  const recolorSection = useAppStore((s) => s.recolorSection);
  const deleteSection = useAppStore((s) => s.deleteSection);
  const assignToSection = useAppStore((s) => s.assignToSection);
  const selectedId = useAppStore((s) => s.selectedId);

  const sections = plantSections(network);
  const active = sections.find((s) => s.id === activeSectionId) ?? null;
  const selectedNode = network.nodes.find((n) => n.id === selectedId);
  const unassigned = unassignedCount(network);

  return (
    <div className="section">
      <h2>Sections / Areas</h2>

      <div className="section-chips">
        {sections.map((s) => (
          <div
            key={s.id}
            className={`section-chip${route.sectionId === s.id ? ' active' : ''}`}
            onClick={() => navigate({ page: 'section', sectionId: s.id })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate({ page: 'section', sectionId: s.id })}
          >
            <span className="swatch" style={{ background: s.color }} />
            <span className="name">{s.name}</span>
            <span className="count">{nodesInSection(network, s.id).length}n</span>
          </div>
        ))}
        {unassigned > 0 && (
          <div className="section-chip" style={{ cursor: 'default' }}>
            <span className="swatch" style={{ background: '#6a7280' }} />
            <span className="name muted">Unassigned</span>
            <span className="count">{unassigned}n</span>
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="wide" onClick={createSection}>+ New Area</button>
      </div>

      {selectedNode && sections.length > 0 && (
        <label className="ef" style={{ marginTop: 8 }}>
          <span>Assign “{selectedNode.id}” →</span>
          <select
            value={selectedNode.sectionId ?? UNASSIGNED}
            onChange={(e) => assignToSection(selectedNode.id, e.target.value)}
          >
            <option value={UNASSIGNED}>Unassigned</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      )}

      {active && (
        <div className="predict" style={{ marginTop: 10 }}>
          <label className="ef">
            <span>Name</span>
            <input value={active.name} onChange={(e) => renameSection(active.id, e.target.value)} />
          </label>
          <div className="ef">
            <span>Color</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  aria-label={`color ${c}`}
                  onClick={() => recolorSection(active.id, c)}
                  style={{
                    width: 18,
                    height: 18,
                    padding: 0,
                    borderRadius: 5,
                    background: c,
                    border: active.color === c ? '2px solid var(--color-ink-0)' : '1px solid var(--color-line)',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="wide" onClick={() => deleteSection(active.id)}>
              Delete area (elements → Unassigned)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
