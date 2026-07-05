/**
 * Message protocol between the main thread and the simulation worker.
 *
 * In Phase 1 the worker only runs the steady-state solve. The protocol is
 * shaped to grow: transient commands (valve trajectories, pump trips) and the
 * SharedArrayBuffer field stream will slot in as new message types without
 * changing the request/response envelope.
 */

import { PipelineNetwork } from '../domain/network';
import { WaterHammerConfig } from '../physics/transient';

export interface SolveSteadyRequest {
  type: 'SOLVE_STEADY';
  requestId: number;
  network: PipelineNetwork;
}

export interface PingRequest {
  type: 'PING';
  requestId: number;
}

/**
 * Start a transient (water hammer) run. The worker steps the MOC solver on a
 * fixed cadence and streams pressure frames back until it reaches the run
 * duration or a STOP arrives. `stepsPerFrame` sets the slow-motion factor.
 */
export interface StartTransientRequest {
  type: 'START_TRANSIENT';
  requestId: number;
  config: WaterHammerConfig;
  /** Valve closure time [s]; the valve ramps tau 1->0 over this interval. */
  closureTime: number;
  /** MOC steps advanced per streamed frame (higher = faster playback). */
  stepsPerFrame: number;
  /** Number of wave periods (4L/a) to simulate before stopping. */
  periods: number;
}

export interface StopTransientRequest {
  type: 'STOP_TRANSIENT';
  requestId: number;
}

export type WorkerRequest =
  | SolveSteadyRequest
  | PingRequest
  | StartTransientRequest
  | StopTransientRequest;

export interface SolveSteadyResponse {
  type: 'SOLVE_STEADY_RESULT';
  requestId: number;
  converged: boolean;
  iterations: number;
  residual: number;
  /** Node id -> total head [m]. */
  heads: Array<[string, number]>;
  /** Link id -> { flow, velocity, headLoss }. */
  links: Array<[string, { flow: number; velocity: number; headLoss: number }]>;
}

export interface PongResponse {
  type: 'PONG';
  requestId: number;
}

export interface ErrorResponse {
  type: 'ERROR';
  requestId: number;
  message: string;
}

/**
 * One streamed transient frame. `head` is the head [m] at every node along the
 * pipe; `maxEnvelope`/`minEnvelope` are the running per-node extremes (the
 * worst-case pressure profile). Buffers are transferred, not copied.
 */
export interface TransientFrame {
  type: 'TRANSIENT_FRAME';
  requestId: number;
  time: number;
  tau: number;
  head: Float32Array;
  maxEnvelope: Float32Array;
  minEnvelope: Float32Array;
  /** Vapor cavity volume [m^3] at each node (0 = intact liquid). */
  cavity: Float32Array;
  valveHead: number;
  reservoirHead: number;
  joukowsky: number;
  wavePeriod: number;
  /** Peak cavity volume seen anywhere over the whole run [m^3]. */
  peakCavity: number;
  done: boolean;
}

export type WorkerResponse = SolveSteadyResponse | PongResponse | ErrorResponse | TransientFrame;
