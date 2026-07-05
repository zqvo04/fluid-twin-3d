/**
 * Valve catalog — the four industrial valve types with their inherent flow
 * characteristics and Crane TP-410 resistance data.
 *
 * Two independent ways to get a resistance coefficient K for a valve:
 *   1. Fully-open K = n * fT   (Crane, n tabulated per type below).
 *   2. From a rated Cv and the position-dependent inherent characteristic.
 *
 * The inherent characteristic maps fractional opening theta (0..1) to a
 * fraction of rated Cv, and differs sharply by valve type — this is what makes
 * a ball valve a water-hammer hazard (quick opening) and a globe valve a good
 * control valve (near-linear / equal-percentage).
 */

import { mToMm } from '../units';
import { FRICTION_FACTOR_FT, NominalSize, Schedule, boreInches, pipeGeometry } from './pipes';

export type ValveType = 'gate' | 'globe' | 'ball' | 'butterfly';

export type FlowCharacteristic = 'quick-opening' | 'linear' | 'equal-percentage' | 'modified-eq-pct';

export interface ValveSpec {
  type: ValveType;
  characteristic: FlowCharacteristic;
  /** Crane resistance multiplier: K_open = kOverFt * fT. */
  kOverFt: number;
  /**
   * Cavitation index sigma at which incipient cavitation begins. Compared
   * against sigma = (p1 - pv) / (p1 - p2) at run time. Lower = more resistant.
   */
  sigmaIncipient: number;
}

export const VALVE_SPECS: Record<ValveType, ValveSpec> = {
  gate: { type: 'gate', characteristic: 'quick-opening', kOverFt: 8, sigmaIncipient: 1.3 },
  globe: { type: 'globe', characteristic: 'equal-percentage', kOverFt: 340, sigmaIncipient: 2.5 },
  ball: { type: 'ball', characteristic: 'quick-opening', kOverFt: 3, sigmaIncipient: 1.5 },
  butterfly: { type: 'butterfly', characteristic: 'modified-eq-pct', kOverFt: 45, sigmaIncipient: 2.0 },
};

/**
 * Inherent flow characteristic: fraction of rated Cv (0..1) at a fractional
 * opening theta (0..1). Equal-percentage uses rangeability R=50 (ISA typical).
 */
export function characteristicFraction(char: FlowCharacteristic, theta: number): number {
  const t = Math.max(0, Math.min(1, theta));
  switch (char) {
    case 'linear':
      return t;
    case 'quick-opening':
      // Most capacity delivered early in the stroke (sqrt shape).
      return Math.sqrt(t);
    case 'equal-percentage': {
      const R = 50;
      // Normalised so f(0)=0, f(1)=1.
      return (Math.pow(R, t) - 1) / (R - 1);
    }
    case 'modified-eq-pct': {
      // Butterfly: equal-percentage for the first ~60% of travel, linear after.
      const R = 30;
      const eq = (Math.pow(R, t) - 1) / (R - 1);
      return 0.5 * eq + 0.5 * t;
    }
  }
}

/**
 * Fully-open flow coefficient Cv for a line-size valve, derived from the Crane
 * resistance. Cv = 29.9 * d^2 / sqrt(K) with d in inches (US units,
 * gpm / psi^0.5). Returned Cv is the rated (100% open) value.
 */
export function ratedCv(type: ValveType, nps: NominalSize, schedule: Schedule): number {
  const spec = VALVE_SPECS[type];
  const fT = FRICTION_FACTOR_FT[nps];
  const kOpen = spec.kOverFt * fT;
  const d = boreInches(nps, schedule);
  return (29.9 * d * d) / Math.sqrt(kOpen);
}

/**
 * Resistance coefficient K of a valve at a given fractional opening.
 * Converts the position-scaled Cv back to K via K = 0.00214 * d_mm^4 / Cv^2.
 * As theta -> 0 the valve chokes and K -> infinity; callers cap this.
 */
export function valveK(type: ValveType, nps: NominalSize, schedule: Schedule, theta: number): number {
  const spec = VALVE_SPECS[type];
  const cvRated = ratedCv(type, nps, schedule);
  const frac = characteristicFraction(spec.characteristic, theta);
  if (frac <= 1e-6) return Infinity; // effectively closed
  const cv = cvRated * frac;
  const dMm = mToMm(pipeGeometry(nps, schedule).id);
  return (0.00214 * Math.pow(dMm, 4)) / (cv * cv);
}

export const VALVE_TYPES: ValveType[] = ['gate', 'globe', 'ball', 'butterfly'];
