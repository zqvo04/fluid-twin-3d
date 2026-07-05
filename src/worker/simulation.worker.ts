/// <reference lib="webworker" />
/**
 * Simulation worker — runs hydraulic analysis off the main thread so the
 * render loop keeps 60 fps. Phase 1 handles the steady-state solve; the
 * transient (MOC) loop and SharedArrayBuffer field stream arrive in Phase 3.
 */

import { solveSteadyState } from '../physics/steadySolver';
import { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'PING': {
        const res: WorkerResponse = { type: 'PONG', requestId: msg.requestId };
        ctx.postMessage(res);
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
