/**
 * Plant overview dashboard — the "whole plant at a glance" page. Each section
 * becomes a KPI card (demand, peak velocity, head range, element counts) that
 * drills into its workspace on click. A summary strip rolls the sections up to
 * plant totals, and an Unassigned card appears whenever elements are untagged,
 * nudging the user toward a fully partitioned model.
 */

import { useMemo } from 'react';
import { useAppStore } from './store';
import { plantSections } from '../domain/network';
import { sectionKpi, SectionKpi, UNASSIGNED, unassignedCount } from '../domain/sections';
import { m3sToM3h } from '../domain/units';

function fmt(v: number | null, digits = 1): string {
  return v === null ? '—' : v.toFixed(digits);
}

function KpiCard({ kpi, onOpen }: { kpi: SectionKpi; onOpen: () => void }) {
  return (
    <div
      className="kpi-card"
      style={{ ['--accent' as string]: kpi.color }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="kpi-name">
        <span className="swatch" style={{ background: kpi.color }} />
        {kpi.name}
      </div>
      <div className="kpi-metrics">
        <div className="kpi-metric">
          <b>{m3sToM3h(kpi.demand).toFixed(0)}</b>
          <span>m³/h demand</span>
        </div>
        <div className="kpi-metric">
          <b>{fmt(kpi.peakVelocity)}</b>
          <span>m/s peak</span>
        </div>
        <div className="kpi-metric">
          <b>{fmt(kpi.maxHead, 0)}</b>
          <span>m max head</span>
        </div>
        <div className="kpi-metric">
          <b>{kpi.nodeCount}·{kpi.linkCount}</b>
          <span>nodes · links</span>
        </div>
      </div>
      <div className="kpi-foot">
        <span className={`badge ${kpi.solved ? 'ok' : ''}`}>{kpi.solved ? 'Solved' : 'Not solved'}</span>
        <span>Open →</span>
      </div>
    </div>
  );
}

export function PlantOverview() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);
  const navigate = useAppStore((s) => s.navigate);
  const createSection = useAppStore((s) => s.createSection);

  const heads = result?.heads ?? new Map<string, number>();
  const links = result?.links ?? new Map();
  const sections = plantSections(network);

  const kpis = useMemo(
    () => sections.map((s) => sectionKpi(network, s.id, s.name, s.color, heads, links)),
    [network, sections, heads, links],
  );

  const unassigned = unassignedCount(network);
  const unassignedKpi = useMemo(
    () =>
      unassigned > 0
        ? sectionKpi(network, UNASSIGNED, 'Unassigned', '#6a7280', heads, links)
        : null,
    [network, unassigned, heads, links],
  );

  const totalDemand = kpis.reduce((s, k) => s + k.demand, 0) + (unassignedKpi?.demand ?? 0);
  const peakVel = Math.max(
    0,
    ...kpis.map((k) => k.peakVelocity ?? 0),
    unassignedKpi?.peakVelocity ?? 0,
  );

  return (
    <aside className="plant-dash">
      <div className="plant-dash-head">
        <h2>Plant Overview</h2>
        <button onClick={createSection}>+ Area</button>
      </div>

      <div className="dash-summary">
        <div className="metric">
          <b>{sections.length}</b>
          <span>sections</span>
        </div>
        <div className="metric">
          <b>{m3sToM3h(totalDemand).toFixed(0)}</b>
          <span>m³/h total</span>
        </div>
        <div className="metric">
          <b>{peakVel > 0 ? peakVel.toFixed(1) : '—'}</b>
          <span>m/s peak</span>
        </div>
      </div>

      {sections.length === 0 && !unassignedKpi && (
        <div className="empty-hint">
          No sections yet. Create an <b>Area</b> to partition this plant into
          zones you can view and analyze on their own — or just run the whole
          plant from the workspace panel.
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <KpiCard key={k.sectionId} kpi={k} onOpen={() => navigate({ page: 'section', sectionId: k.sectionId })} />
        ))}
      </div>

      {unassignedKpi && (
        <div style={{ marginTop: 'var(--space-sm)' }}>
          <div className="kpi-card" style={{ ['--accent' as string]: unassignedKpi.color, cursor: 'default' }}>
            <div className="kpi-name">
              <span className="swatch" style={{ background: unassignedKpi.color }} />
              Unassigned
              <span className="badge warn" style={{ marginLeft: 'auto' }}>{unassigned} nodes</span>
            </div>
            <div className="kpi-foot">
              <span>Assign these to a section from the workspace inspector.</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
