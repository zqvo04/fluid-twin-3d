/**
 * Water-hammer control for the user-built network. Pick a valve to slam shut,
 * set the closure time, and run a time-domain MOC analysis on the whole
 * network. Pipes flash with the travelling pressure wave and the live peak
 * surge is reported — the transient dashboard for an arbitrary plant.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { netTransientRunner, NetTransientSummary } from '../transient/netRunner';
import { paToBar, headToPressure } from '../domain/units';

export function NetworkTransientPanel() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);
  const [summary, setSummary] = useState<NetTransientSummary | null>(null);
  const [valveId, setValveId] = useState<string>('');
  const [userPicked, setUserPicked] = useState(false);
  const [closureTime, setClosureTime] = useState(0.2);

  const valves = network.links.filter((l) => l.kind === 'valve');

  useEffect(() => netTransientRunner.onSummary(setSummary), []);

  // Until the user picks, default to the highest-velocity valve (most surge
  // potential); re-evaluate once a steady result provides velocities.
  useEffect(() => {
    if (userPicked || valves.length === 0) return;
    let best = valves[0].id;
    let bestVel = -1;
    for (const v of valves) {
      const vel = Math.abs(result?.links.get(v.id)?.velocity ?? 0);
      if (vel > bestVel) { bestVel = vel; best = v.id; }
    }
    if (best !== valveId) setValveId(best);
  }, [valves, valveId, result, userPicked]);

  const run = () => {
    netTransientRunner.start(network, valveId || null, closureTime, 4, 6);
  };
  const stop = () => netTransientRunner.stop();

  const surgeBar = (m: number) => paToBar(headToPressure(m, 998)).toFixed(1);

  return (
    <div className="section">
      <h2>Water Hammer (transient)</h2>
      {valves.length === 0 ? (
        <p className="muted">Add a valve to the network to trigger a surge.</p>
      ) : (
        <>
          <label className="ef">
            <span>Close valve</span>
            <select
              value={valveId}
              onChange={(e) => {
                setValveId(e.target.value);
                setUserPicked(true);
              }}
            >
              {valves.map((v) => (
                <option key={v.id} value={v.id}>{v.id}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Closure time: {closureTime.toFixed(2)} s</span>
            <input
              type="range"
              min={0.05}
              max={5}
              step={0.05}
              value={closureTime}
              onChange={(e) => setClosureTime(Number(e.target.value))}
            />
          </label>
          <div className="row">
            <button className="primary" onClick={run}>Slam Valve ▶ (network surge)</button>
          </div>
          {summary?.running && (
            <div className="row"><button className="wide" onClick={stop}>Stop</button></div>
          )}
          {summary && (
            <div className="predict">
              <div className="kv"><span>Sim time</span><span>{summary.time.toFixed(2)} s</span></div>
              <div className="kv">
                <span>Peak surge</span>
                <span className="warn">+{summary.peakSurge.toFixed(0)} m · {surgeBar(summary.peakSurge)} bar</span>
              </div>
              <div className="kv">
                <span>Min head</span>
                <span className={summary.minHead < 0 ? 'warn' : ''}>{summary.minHead.toFixed(0)} m</span>
              </div>
              {summary.minHead < 0 && (
                <p className="warn">⚠ Sub-atmospheric head — cavitation / column separation risk.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
