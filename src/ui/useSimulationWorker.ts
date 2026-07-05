/**
 * React hook owning the simulation worker instance and the request/response
 * plumbing. Exposes `solve()` (steady-state) and `ping()` for the Phase 0
 * health check.
 */

import { useEffect, useRef, useCallback } from 'react';
import { WorkerRequest, WorkerResponse } from '../worker/protocol';
import { useAppStore } from './store';

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const applyResult = useAppStore((s) => s.applyResult);
  const setSolving = useAppStore((s) => s.setSolving);

  useEffect(() => {
    const worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'SOLVE_STEADY_RESULT') {
        applyResult(msg);
      } else if (msg.type === 'ERROR') {
        setSolving(false);
        // eslint-disable-next-line no-console
        console.error('Worker error:', msg.message);
      }
    };

    return () => worker.terminate();
  }, [applyResult, setSolving]);

  const solve = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    setSolving(true);
    const network = useAppStore.getState().network;
    const req: WorkerRequest = { type: 'SOLVE_STEADY', requestId: requestId.current++, network };
    worker.postMessage(req);
  }, [setSolving]);

  return { solve };
}
