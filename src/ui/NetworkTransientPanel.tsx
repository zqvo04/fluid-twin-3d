/**
 * Water-hammer control for the user-built network. Two scenarios:
 *   - Valve closure: slam a chosen valve shut.
 *   - Pump trip: a power failure — the motor torque vanishes and the rotor
 *     spins down under its inertia, the discharge check valve slams on flow
 *     reversal, and the surge propagates. Live pump speed is reported.
 * Pipes flash with the travelling pressure wave; peak surge / min head update
 * live.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { netTransientRunner, NetTransientSummary } from '../transient/netRunner';
import { paToBar, headToPressure } from '../domain/units';

type Scenario = 'valve' | 'pump';

export function NetworkTransientPanel() {
  const network = useAppStore((s) => s.network);
  const result = useAppStore((s) => s.result);
  const [summary, setSummary] = useState<NetTransientSummary | null>(null);
  const [scenario, setScenario] = useState<Scenario>('valve');
  const [valveId, setValveId] = useState<string>('');
  const [pumpId, setPumpId] = useState<string>('');
  const [userPicked, setUserPicked] = useState(false);
  const [closureTime, setClosureTime] = useState(0.2);

  const valves = network.links.filter((l) => l.kind === 'valve');
  const pumps = network.links.filter((l) => l.kind === 'pump');

  useEffect(() => netTransientRunner.onSummary(setSummary), []);

  useEffect(() => {
    if (!userPicked && valves.length > 0) {
      let best = valves[0].id;
      let bestVel = -1;
      for (const v of valves) {
        const vel = Math.abs(result?.links.get(v.id)?.velocity ?? 0);
        if (vel > bestVel) { bestVel = vel; best = v.id; }
      }
      if (best !== valveId) setValveId(best);
    }
    if (!pumpId && pumps.length > 0) setPumpId(pumps[0].id);
  }, [valves, pumps, valveId, pumpId, result, userPicked]);

  const run = () => {
    if (scenario === 'pump') {
      netTransientRunner.start(network, null, pumpId || null, 0, 4, 6);
    } else {
      netTransientRunner.start(network, valveId || null, null, closureTime, 4, 6);
    }
  };
  const stop = () => netTransientRunner.stop();

  const surgeBar = (m: number) => paToBar(headToPressure(m, 998)).toFixed(1);
  const canRun = scenario === 'valve' ? valves.length > 0 : pumps.length > 0;

  return (
    <div className="section">
      <h2>Water Hammer (transient)</h2>

      <div className="row segmented">
        <button className={scenario === 'valve' ? 'active' : ''} onClick={() => setScenario('valve')}>
          Valve closure
        </button>
        <button className={scenario === 'pump' ? 'active' : ''} onClick={() => setScenario('pump')}>
          Pump trip
        </button>
      </div>

      {!canRun ? (
        <p className="muted">
          {scenario === 'valve' ? 'Add a valve to trigger a surge.' : 'Add a pump to trip.'}
        </p>
      ) : scenario === 'valve' ? (
        <>
          <label className="ef">
            <span>Close valve</span>
            <select value={valveId} onChange={(e) => { setValveId(e.target.value); setUserPicked(true); }}>
              {valves.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Closure time: {closureTime.toFixed(2)} s</span>
            <input type="range" min={0.05} max={5} step={0.05} value={closureTime}
              onChange={(e) => setClosureTime(Number(e.target.value))} />
          </label>
          <div className="row">
            <button className="primary" onClick={run}>Slam Valve ▶ (network surge)</button>
          </div>
        </>
      ) : (
        <>
          <label className="ef">
            <span>Trip pump</span>
            <select value={pumpId} onChange={(e) => setPumpId(e.target.value)}>
              {pumps.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </label>
          <p className="hint">Power failure: the rotor spins down under its own inertia; the discharge check valve slams on flow reversal.</p>
          <div className="row">
            <button className="primary" onClick={run}>Trip Pump ▶ (power failure)</button>
          </div>
        </>
      )}

      {summary?.running && (
        <div className="row"><button className="wide" onClick={stop}>Stop</button></div>
      )}
      {summary && (
        <div className="predict">
          <div className="kv"><span>Sim time</span><span>{summary.time.toFixed(2)} s</span></div>
          {scenario === 'pump' && (
            <div className="kv"><span>Pump speed</span><span>{(summary.pumpSpeed * 100).toFixed(0)}% rated</span></div>
          )}
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
    </div>
  );
}
