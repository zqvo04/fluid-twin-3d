/**
 * Fitting catalog — Crane TP-410 resistance coefficients for the standard
 * bends and branches. Each fitting's K is a multiple of the size-dependent
 * fully-turbulent friction factor fT.
 */

import { FRICTION_FACTOR_FT, NominalSize } from './pipes';

export type FittingType = 'elbow90' | 'elbow45' | 'teeRun' | 'teeBranch' | 'entrance' | 'exit';

// K = kOverFt * fT, except entrance/exit which are (near) Reynolds-independent.
const K_OVER_FT: Record<FittingType, number> = {
  elbow90: 30,
  elbow45: 16,
  teeRun: 20,
  teeBranch: 60,
  entrance: 0, // handled as fixed K below
  exit: 0,
};

// Fixed K values independent of fT.
const K_FIXED: Partial<Record<FittingType, number>> = {
  entrance: 0.5, // sharp-edged inlet
  exit: 1.0, // discharge to a large reservoir
};

export function fittingK(type: FittingType, nps: NominalSize): number {
  const fixed = K_FIXED[type];
  if (fixed !== undefined) return fixed;
  return K_OVER_FT[type] * FRICTION_FACTOR_FT[nps];
}
