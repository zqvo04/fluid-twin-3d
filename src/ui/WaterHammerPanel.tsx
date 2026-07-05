/**
 * Water Hammer Lab controls: pick the line, set the valve closure time, fire
 * the transient, and read live surge statistics. The Joukowsky prediction and
 * the critical closure time 2L/a are shown up front so the engineer can judge
 * whether a closure is "rapid" before running it.
 */

import { useTransient } from '../transient/useTransient';
import { useAppStore } from './store';
import { buildWaterHammerConfig } from '../examples/waterHammerLab';
import { NominalSize } from '../domain/catalog/pipes';
import { paToBar, headToPressure } from '../domain/units';

const SIZES: NominalSize[] = ['2"', '4"', '6"', '8"'];

export function WaterHammerPanel() {
  const { summary, start, stop } = useTransient();
  const labInputs = useAppStore((s) => s.labInputs);
  const setLabInputs = useAppStore((s) => s.setLabInputs);
  const closureTime = useAppStore((s) => s.closureTime);
  const setClosureTime = useAppStore((s) => s.setClosureTime);
  const stepsPerFrame = useAppStore((s) => s.stepsPerFrame);
  const setStepsPerFrame = useAppStore((s) => s.setStepsPerFrame);

  // Predicted quantities from the current inputs (before running).
  const cfg = buildWaterHammerConfig(labInputs);
  const v0 = cfg.initialFlow / cfg.area;
  const joukowsky = (cfg.waveSpeed * v0) / 9.80665;
  const criticalTime = (2 * cfg.length) / cfg.waveSpeed;
  const rapid = closureTime < criticalTime;
  const rho = 998;

  const surgeBar = (head: number) => paToBar(headToPressure(head, rho)).toFixed(1);

  return (
    <div className="section">
      <h2>Water Hammer Lab</h2>

      <div className="grid2">
        {SIZES.map((s) => (
          <button
            key={s}
            className={labInputs.nps === s ? 'active' : ''}
            onClick={() => setLabInputs({ nps: s })}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Flow velocity: {labInputs.velocity.toFixed(1)} m/s</span>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.1}
          value={labInputs.velocity}
          onChange={(e) => setLabInputs({ velocity: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>
          Valve closure: {closureTime.toFixed(2)} s{' '}
          <b className={rapid ? 'warn' : 'ok'}>({rapid ? 'RAPID' : 'gradual'})</b>
        </span>
        <input
          type="range"
          min={0.05}
          max={6}
          step={0.05}
          value={closureTime}
          onChange={(e) => setClosureTime(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>Playback speed: {stepsPerFrame}×</span>
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={stepsPerFrame}
          onChange={(e) => setStepsPerFrame(Number(e.target.value))}
        />
      </label>

      <div className="predict">
        <div className="kv"><span>Wave speed a</span><span>{cfg.waveSpeed.toFixed(0)} m/s</span></div>
        <div className="kv"><span>Critical 2L/a</span><span>{criticalTime.toFixed(2)} s</span></div>
        <div className="kv">
          <span>Joukowsky ΔH</span>
          <span>{joukowsky.toFixed(0)} m · {surgeBar(joukowsky)} bar</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={start}>Trigger Valve Closure ▶</button>
      </div>
      {summary?.running && (
        <div className="row">
          <button className="wide" onClick={stop}>Stop</button>
        </div>
      )}

      {summary && (
        <div className="predict">
          <div className="kv"><span>Sim time</span><span>{summary.time.toFixed(2)} s</span></div>
          <div className="kv"><span>Valve opening</span><span>{(summary.tau * 100).toFixed(0)}%</span></div>
          <div className="kv">
            <span>Valve head</span>
            <span>{summary.valveHead.toFixed(0)} m</span>
          </div>
          <div className="kv">
            <span>Peak surge</span>
            <span className="warn">
              +{(summary.peakHead - summary.reservoirHead).toFixed(0)} m · {surgeBar(summary.peakHead - summary.reservoirHead)} bar
            </span>
          </div>
          <div className="kv">
            <span>Min head</span>
            <span className={summary.minHead < 0 ? 'warn' : ''}>{summary.minHead.toFixed(0)} m</span>
          </div>
          {summary.minHead < 0 && (
            <p className="warn">⚠ Head fell below zero — column separation / cavitation risk (modeled in Phase 4).</p>
          )}
        </div>
      )}
    </div>
  );
}
