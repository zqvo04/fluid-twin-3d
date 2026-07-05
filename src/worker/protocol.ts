/**
 * Message protocol between the main thread and the simulation worker.
 *
 * In Phase 1 the worker only runs the steady-state solve. The protocol is
 * shaped to grow: transient commands (valve trajectories, pump trips) and the
 * SharedArrayBuffer field stream will slot in as new message types without
 * changing the request/response envelope.
 */

import { PipelineNetwork } from '../domain/network';

export interface SolveSteadyRequest {
  type: 'SOLVE_STEADY';
  requestId: number;
  network: PipelineNetwork;
}

export interface PingRequest {
  type: 'PING';
  requestId: number;
}

export type WorkerRequest = SolveSteadyRequest | PingRequest;

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

export type WorkerResponse = SolveSteadyResponse | PongResponse | ErrorResponse;
