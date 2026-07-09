/**
 * NetworkTransientRunner — owns the worker for time-domain analysis of a
 * user-built network. Frames (~40/s) update plain id→value maps that the 3D
 * scene and dashboard read directly each render frame (bypassing React); only a
 * throttled numeric summary is pushed to React for the control panel.
 */

import { PipelineNetwork } from '../domain/network';
import { WorkerRequest, WorkerResponse } from '../worker/protocol';

export interface NetTransientSummary {
  running: boolean;
  time: number;
  peakSurge: number;
  minHead: number;
  maxHead: number;
  pumpSpeed: number;
  done: boolean;
}

class NetworkTransientRunner {
  active = false;
  headById = new Map<string, number>();
  flowById = new Map<string, number>();
  minHead = 0;
  maxHead = 1;

  private worker: Worker | null = null;
  private requestId = 0;
  private network: PipelineNetwork | null = null;
  private pipeIds: string[] = [];
  private listeners = new Set<(s: NetTransientSummary) => void>();
  private frameCount = 0;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
    }
    return this.worker;
  }

  private onMessage(msg: WorkerResponse) {
    if (msg.type !== 'NET_TRANSIENT_FRAME' || !this.network) return;
    const nodes = this.network.nodes;
    for (let i = 0; i < nodes.length && i < msg.heads.length; i++) {
      this.headById.set(nodes[i].id, msg.heads[i]);
    }
    for (let i = 0; i < this.pipeIds.length && i < msg.flows.length; i++) {
      this.flowById.set(this.pipeIds[i], msg.flows[i]);
    }
    this.minHead = msg.minHead;
    this.maxHead = msg.maxHead;
    this.active = !msg.done;

    this.frameCount++;
    if (this.frameCount % 3 === 0 || msg.done) {
      const summary: NetTransientSummary = {
        running: !msg.done,
        time: msg.time,
        peakSurge: msg.peakSurge,
        minHead: msg.minHead,
        maxHead: msg.maxHead,
        pumpSpeed: msg.pumpSpeed,
        done: msg.done,
      };
      for (const l of this.listeners) l(summary);
    }
  }

  onSummary(fn: (s: NetTransientSummary) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(
    network: PipelineNetwork,
    valveId: string | null,
    pumpTripId: string | null,
    closureTime: number,
    stepsPerFrame: number,
    seconds: number,
  ) {
    const worker = this.ensureWorker();
    this.network = network;
    this.pipeIds = network.links.filter((l) => l.kind === 'pipe').map((l) => l.id);
    this.headById.clear();
    this.flowById.clear();
    this.frameCount = 0;
    this.active = true;
    const req: WorkerRequest = {
      type: 'START_NET_TRANSIENT',
      requestId: this.requestId++,
      network,
      valveId,
      pumpTripId,
      closureTime,
      stepsPerFrame,
      seconds,
    };
    worker.postMessage(req);
  }

  stop() {
    this.active = false;
    if (this.worker) {
      const req: WorkerRequest = { type: 'STOP_TRANSIENT', requestId: this.requestId++ };
      this.worker.postMessage(req);
    }
  }
}

export const netTransientRunner = new NetworkTransientRunner();
