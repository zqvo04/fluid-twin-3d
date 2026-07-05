/**
 * Live flow dashboard for the Global view. Once a steady solution exists it
 * shows system-level metrics and a per-pipe flow list with animated "flowing"
 * bars whose stripe speed tracks the velocity — a real-time monitoring HUD.
 */

import { useMemo } from 'react';
import { useAppStore } from './store';
import { rampColor, normalize } from '../scene/colormap';
import { m3sToM3h } from '../domain/units';

export function FlowDashboard() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);

  const data = useMemo(() => {
    if (!result) return null;
    const pipes = network.links
      .filter((l) => l.kind === 'pipe' || l.kind === 'valve')
      .map((l) => {
        const r = result.links.get(l.id)!;
        return { id: l.id, flow: Math.abs(r.flow), velocity: Math.abs(r.velocity) };
      })
      .filter((p) => Number.isFinite(p.velocity))
      .sort((a, b) => b.flow - a.flow);

    const maxFlow = Math.max(1e-9, ...pipes.map((p) => p.flow));
    const maxVel = Math.max(1e-9, ...pipes.map((p) => p.velocity));
    const heads = [...result.heads.values()];
    const totalDemand = network.nodes.reduce((s, n) => s + Math.max(0, n.demand ?? 0), 0);

    return {
      pipes: pipes.slice(0, 8),
      maxFlow,
      maxVel,
      minHead: Math.min(...heads),
      maxHead: Math.max(...heads),
      totalDemand,
      pipeCount: pipes.length,
    };
  }, [network, result]);

  if (!data) return null;

  return (
    <div className="dashboard">
      <div className="dash-head">
        <span className="live-dot" /> LIVE FLOW
      </div>
      <div className="dash-metrics">
        <div className="metric"><b>{m3sToM3h(data.totalDemand).toFixed(0)}</b><span>m³/h demand</span></div>
        <div className="metric"><b>{data.maxVel.toFixed(1)}</b><span>m/s peak</span></div>
        <div className="metric"><b>{data.maxHead.toFixed(0)}</b><span>m max head</span></div>
      </div>
      <div className="dash-list">
        {data.pipes.map((p) => {
          const col = '#' + rampColor(normalize(p.velocity, 0, data.maxVel)).getHexString();
          const w = Math.max(4, (p.flow / data.maxFlow) * 100);
          const dur = Math.max(0.4, 2.4 / Math.max(0.2, p.velocity)); // faster flow = faster stripes
          const barStyle = { width: `${w}%`, '--c': col, animationDuration: `${dur}s` } as React.CSSProperties;
          return (
            <div key={p.id} className="dash-row">
              <span className="dash-id">{p.id}</span>
              <div className="dash-bar-track">
                <div className="dash-bar" style={barStyle} />
              </div>
              <span className="dash-val">{m3sToM3h(p.flow).toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
