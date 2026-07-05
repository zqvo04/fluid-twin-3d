/**
 * Pump catalog — centrifugal pump model.
 *
 * The head-flow curve is the quadratic H(Q) = a0 - a1*Q - a2*Q^2, fitted from
 * three catalogue points (shutoff, best-efficiency point, runout). The BEP is
 * carried explicitly so the analyzer can warn when the duty point drifts
 * outside the recommended 70-120% window (Hydraulic Institute guidance).
 *
 * NPSHr and rotor inertia are stored for the cavitation and pump-trip models
 * used in later phases; they are inert in steady state.
 */

import { solveLinearSystem } from '../../physics/linalg';

export interface PumpCurvePoint {
  /** Volumetric flow [m^3/s]. */
  q: number;
  /** Total head [m]. */
  h: number;
}

export interface PumpSpec {
  name: string;
  /** Head curve coefficients: H = a0 - a1*Q - a2*Q^2  (Q in m^3/s). */
  a0: number;
  a1: number;
  a2: number;
  /** Best-efficiency-point flow [m^3/s]. */
  bepFlow: number;
  /** NPSH required at BEP [m]. */
  npshrAtBep: number;
  /** Rotor polar moment of inertia [kg.m^2] (for trip transients). */
  inertia: number;
  /** Rated speed [rev/min]. */
  ratedRpm: number;
}

/**
 * Fit H(Q) = a0 - a1*Q - a2*Q^2 through three points. Returns {a0,a1,a2}.
 * Solves the 3x3 Vandermonde-like system:  H = a0 - a1*Q - a2*Q^2.
 */
export function fitPumpCurve(pts: [PumpCurvePoint, PumpCurvePoint, PumpCurvePoint]): {
  a0: number;
  a1: number;
  a2: number;
} {
  // Unknown vector x = [a0, a1, a2]; equation: a0 - a1*q - a2*q^2 = h.
  const A = pts.map((p) => [1, -p.q, -(p.q * p.q)]);
  const b = pts.map((p) => p.h);
  const x = solveLinearSystem(A, b);
  return { a0: x[0], a1: x[1], a2: x[2] };
}

/** Head [m] delivered by a pump at flow q [m^3/s] and speed ratio n (1 = rated). */
export function pumpHead(spec: PumpSpec, q: number, n = 1): number {
  // Affinity laws: H scales with n^2, Q with n. Evaluate the rated curve at
  // the equivalent rated flow q/n, then scale head by n^2.
  if (n <= 1e-6) return 0;
  const qEq = q / n;
  const hRated = spec.a0 - spec.a1 * qEq - spec.a2 * qEq * qEq;
  return n * n * hRated;
}

/** d(head)/dQ [m / (m^3/s)] at flow q and speed ratio n — used by the solver. */
export function pumpHeadSlope(spec: PumpSpec, q: number, n = 1): number {
  if (n <= 1e-6) return 0;
  const qEq = q / n;
  // dH/dQ = n^2 * d(hRated)/dqEq * dqEq/dQ = n^2 * (-a1 - 2 a2 qEq) * (1/n)
  return n * (-spec.a1 - 2 * spec.a2 * qEq);
}

/** Build a pump spec from three catalogue points plus metadata. */
export function makePump(
  name: string,
  points: [PumpCurvePoint, PumpCurvePoint, PumpCurvePoint],
  meta: { bepFlow: number; npshrAtBep: number; inertia: number; ratedRpm: number },
): PumpSpec {
  const { a0, a1, a2 } = fitPumpCurve(points);
  return { name, a0, a1, a2, ...meta };
}

/**
 * A representative end-suction process pump: ~50 m shutoff, BEP near
 * 100 m^3/h at ~45 m. Points are (shutoff, BEP, runout).
 */
export const PUMP_50M: PumpSpec = makePump(
  'Booster 50m',
  [
    { q: 0, h: 52 },
    { q: 100 / 3600, h: 45 },
    { q: 160 / 3600, h: 28 },
  ],
  { bepFlow: 100 / 3600, npshrAtBep: 3.5, inertia: 0.9, ratedRpm: 2950 },
);
