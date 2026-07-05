/**
 * Pipe wall stress judgment per ASME B31.3 (Process Piping).
 *
 * Internal pressure produces a circumferential (hoop) stress
 *     sigma_h = P * D / (2 * t)
 * evaluated on the corroded wall (design thickness minus corrosion allowance)
 * and, conservatively, the outside diameter. B31.3 allows the basic material
 * stress S for sustained loads, but permits an occasional overstress to 1.33*S
 * for short-duration events such as a pressure surge. We therefore report two
 * utilizations:
 *   - sustained  = sigma(steady pressure)  / S
 *   - occasional = sigma(peak surge)       / (1.33 * S)
 * A utilization > 1 in either is a violation.
 */

import { G } from '../domain/units';
import { PipeGeometry, PipeMaterial } from '../domain/catalog/pipes';

/** Occasional-load allowable multiplier (B31.3 para. 302.3.6). */
export const OCCASIONAL_FACTOR = 1.33;

export interface StressResult {
  /** Hoop stress at the steady operating pressure [Pa]. */
  sustainedStress: number;
  /** Hoop stress at the peak surge pressure [Pa]. */
  occasionalStress: number;
  /** sustainedStress / S. */
  sustainedUtil: number;
  /** occasionalStress / (1.33 S). */
  occasionalUtil: number;
  /** True if both utilizations are within allowable. */
  pass: boolean;
}

/** Hoop stress [Pa] from gauge pressure P [Pa] on the corroded wall. */
export function hoopStress(pressure: number, geo: PipeGeometry, material: PipeMaterial): number {
  const t = geo.wall - material.corrosionAllowance;
  if (t <= 0) return Infinity;
  return (Math.max(0, pressure) * geo.od) / (2 * t);
}

/**
 * Evaluate B31.3 hoop-stress utilization from steady and peak heads.
 * Heads are gauge pressure heads [m] at the pipe (i.e. head above the pipe
 * elevation); they are converted to pressure with the fluid density.
 */
export function analyzeHoopStress(
  steadyHeadGauge: number,
  peakHeadGauge: number,
  geo: PipeGeometry,
  material: PipeMaterial,
  rho: number,
): StressResult {
  const pSteady = steadyHeadGauge * rho * G;
  const pPeak = peakHeadGauge * rho * G;

  const sustainedStress = hoopStress(pSteady, geo, material);
  const occasionalStress = hoopStress(pPeak, geo, material);
  const sustainedUtil = sustainedStress / material.allowable;
  const occasionalUtil = occasionalStress / (OCCASIONAL_FACTOR * material.allowable);

  return {
    sustainedStress,
    occasionalStress,
    sustainedUtil,
    occasionalUtil,
    pass: sustainedUtil <= 1 && occasionalUtil <= 1,
  };
}
