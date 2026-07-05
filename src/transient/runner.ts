/**
 * TransientRunner — owns the transient worker and mediates the high-frequency
 * pressure stream. Frames (~40/s) are kept in plain fields (latestFrame,
 * history) that the 3D scene and chart read directly in their render loops,
 * bypassing React. Only a throttled numeric summary is pushed to React so the
 * control panel can show live stats without re-rendering at frame rate.
 *
 * This is the Phase 3 compute/render split in practice. (Field transport is
 * postMessage with transferred buffers here; the SharedArrayBuffer upgrade in
 * the roadmap is a drop-in for full-network fields at larger scale.)
 */

import { WaterHammerConfig } from '../physics/transient';
import { WorkerRequest, WorkerResponse, TransientFrame } from '../worker/protocol';

export interface TransientSummary {
  running: boolean;
  time: number;
  tau: number;
  valveHead: number;
  reservoirHead: number;
  peakHead: number;
  minHead: number;
  joukowsky: number;
  wavePeriod: number;
  done: boolean;
}

export interface HistoryPoint {
  t: number;
  valveHead: number;
}

const HISTORY_CAP = 6000;

class TransientRunner {
  latestFrame: TransientFrame | null = null;
  history: HistoryPoint[] = [];

  private worker: Worker | null = null;
  private requestId = 0;
  private summaryListeners = new Set<(s: TransientSummary) => void>();
  private frameCount = 0;
  private peakHead = -Infinity;
  private minHead = Infinity;

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
    if (msg.type !== 'TRANSIENT_FRAME') return;
    this.latestFrame = msg;
    this.history.push({ t: msg.time, valveHead: msg.valveHead });
    if (this.history.length > HISTORY_CAP) this.history.shift();
    this.peakHead = Math.max(this.peakHead, msg.valveHead);
    this.minHead = Math.min(this.minHead, msg.valveHead);

    // Throttle the React-facing summary to ~10 Hz.
    this.frameCount++;
    if (this.frameCount % 4 === 0 || msg.done) {
      this.emitSummary(!msg.done);
    }
  }

  private emitSummary(running: boolean) {
    const f = this.latestFrame;
    if (!f) return;
    const summary: TransientSummary = {
      running,
      time: f.time,
      tau: f.tau,
      valveHead: f.valveHead,
      reservoirHead: f.reservoirHead,
      peakHead: this.peakHead,
      minHead: this.minHead,
      joukowsky: f.joukowsky,
      wavePeriod: f.wavePeriod,
      done: f.done,
    };
    for (const l of this.summaryListeners) l(summary);
  }

  onSummary(fn: (s: TransientSummary) => void): () => void {
    this.summaryListeners.add(fn);
    return () => this.summaryListeners.delete(fn);
  }

  start(config: WaterHammerConfig, closureTime: number, stepsPerFrame: number, periods: number) {
    const worker = this.ensureWorker();
    this.latestFrame = null;
    this.history = [];
    this.frameCount = 0;
    this.peakHead = -Infinity;
    this.minHead = Infinity;
    const req: StartTransient = {
      type: 'START_TRANSIENT',
      requestId: this.requestId++,
      config,
      closureTime,
      stepsPerFrame,
      periods,
    };
    worker.postMessage(req);
  }

  stop() {
    if (!this.worker) return;
    const req: WorkerRequest = { type: 'STOP_TRANSIENT', requestId: this.requestId++ };
    this.worker.postMessage(req);
    this.emitSummary(false);
  }
}

type StartTransient = Extract<WorkerRequest, { type: 'START_TRANSIENT' }>;

export const transientRunner = new TransientRunner();
