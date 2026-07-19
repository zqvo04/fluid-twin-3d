/**
 * React hook owning the simulation worker instance and the request/response
 * plumbing. Exposes `solve()` (full-network steady-state) and `solveSection()`
 * (a single section solved in isolation with its boundaries pinned as fixed
 * heads from the last full solve).
 */

import { useEffect, useRef, useCallback } from 'react';
import { WorkerRequest, WorkerResponse } from '../worker/protocol';
import { sectionSubnetwork } from '../domain/sections';
import { useAppStore } from './store';

export function useSimulationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  /** requestId -> section it was scoped to (null = full-network solve). */
  const scopes = useRef<Map<number, string | null>>(new Map());
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
        const scope = scopes.current.get(msg.requestId) ?? null;
        scopes.current.delete(msg.requestId);
        applyResult(msg, scope);
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
    const id = requestId.current++;
    scopes.current.set(id, null);
    const req: WorkerRequest = { type: 'SOLVE_STEADY', requestId: id, network };
    worker.postMessage(req);
  }, [setSolving]);

  const solveSection = useCallback((sectionId: string) => {
    const worker = workerRef.current;
    if (!worker) return;
    const { network, result } = useAppStore.getState();
    // Seed cut-boundary heads from the last full-network solve when available.
    const boundaryHeads =
      result && !result.scopeSectionId ? result.heads : new Map<string, number>();
    const { network: sub } = sectionSubnetwork(network, sectionId, boundaryHeads);
    setSolving(true);
    const id = requestId.current++;
    scopes.current.set(id, sectionId);
    const req: WorkerRequest = { type: 'SOLVE_STEADY', requestId: id, network: sub };
    worker.postMessage(req);
  }, [setSolving]);

  return { solve, solveSection };
}
