/// <reference lib="webworker" />
/**
 * Simulation worker — runs hydraulic analysis off the main thread so the
 * render loop keeps 60 fps. Phase 1 handles the steady-state solve; the
 * transient (MOC) loop and SharedArrayBuffer field stream arrive in Phase 3.
 */

import { solveSteadyState } from '../physics/steadySolver';
import { WaterHammerSim } from '../physics/transient';
import { WorkerRequest, WorkerResponse, StartTransientRequest } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// --- Transient run state (a single active run at a time) ------------------
let transientTimer: ReturnType<typeof setTimeout> | null = null;

function stopTransient() {
  if (transientTimer !== null) {
    clearTimeout(transientTimer);
    transientTimer = null;
  }
}

function runTransient(req: StartTransientRequest) {
  stopTransient();
  const sim = new WaterHammerSim(req.config);
  const joukowsky = sim.joukowskyHead();
  const period = sim.wavePeriod();
  const endTime = req.periods * period;
  const frameMs = 25;

  // Per-node running envelope of head extremes over the whole run.
  const maxEnv = Float32Array.from(sim.H);
  const minEnv = Float32Array.from(sim.H);

  const tick = () => {
    for (let k = 0; k < req.stepsPerFrame; k++) {
      const tau = req.closureTime > 0 ? Math.max(0, 1 - sim.time / req.closureTime) : 0;
      sim.step(tau);
      for (let i = 0; i < sim.nodes; i++) {
        if (sim.H[i] > maxEnv[i]) maxEnv[i] = sim.H[i];
        if (sim.H[i] < minEnv[i]) minEnv[i] = sim.H[i];
      }
    }

    const done = sim.time >= endTime;
    const tauNow = req.closureTime > 0 ? Math.max(0, 1 - sim.time / req.closureTime) : 0;
    const head = Float32Array.from(sim.H);
    const maxCopy = Float32Array.from(maxEnv);
    const minCopy = Float32Array.from(minEnv);
    const frame: WorkerResponse = {
      type: 'TRANSIENT_FRAME',
      requestId: req.requestId,
      time: sim.time,
      tau: tauNow,
      head,
      maxEnvelope: maxCopy,
      minEnvelope: minCopy,
      valveHead: sim.H[sim.nodes - 1],
      reservoirHead: req.config.reservoirHead,
      joukowsky,
      wavePeriod: period,
      done,
    };
    ctx.postMessage(frame, [head.buffer, maxCopy.buffer, minCopy.buffer]);

    if (done) {
      transientTimer = null;
    } else {
      transientTimer = setTimeout(tick, frameMs);
    }
  };

  transientTimer = setTimeout(tick, frameMs);
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'PING': {
        const res: WorkerResponse = { type: 'PONG', requestId: msg.requestId };
        ctx.postMessage(res);
        break;
      }
      case 'START_TRANSIENT': {
        runTransient(msg);
        break;
      }
      case 'STOP_TRANSIENT': {
        stopTransient();
        break;
      }
      case 'SOLVE_STEADY': {
        const result = solveSteadyState(msg.network);
        const res: WorkerResponse = {
          type: 'SOLVE_STEADY_RESULT',
          requestId: msg.requestId,
          converged: result.converged,
          iterations: result.iterations,
          residual: result.residual,
          heads: Array.from(result.heads.entries()),
          links: Array.from(result.links.entries()).map(([id, r]) => [
            id,
            { flow: r.flow, velocity: r.velocity, headLoss: r.headLoss },
          ]),
        };
        ctx.postMessage(res);
        break;
      }
    }
  } catch (err) {
    const res: WorkerResponse = {
      type: 'ERROR',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(res);
  }
};
