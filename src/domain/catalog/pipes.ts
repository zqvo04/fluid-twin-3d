/**
 * Pipe catalog — ASME B36.10M carbon-steel dimensions and material data.
 *
 * Only the sizes required by the spec (2", 4", 6", 8") are populated, with the
 * two schedules that matter for stress work (Sch 40 standard, Sch 80 heavy).
 * All geometry stored in SI [m]; roughness and material properties are used by
 * the friction model and the (later) B31.3 stress check.
 */

import { inchToM, mmToM } from '../units';

export type NominalSize = '2"' | '4"' | '6"' | '8"';
export type Schedule = '40' | '80';

export interface PipeMaterial {
  name: string;
  /** Young's modulus [Pa] — used for MOC wave speed. */
  E: number;
  /** Allowable stress S at design temperature [Pa] — B31.3 basis. */
  allowable: number;
  /** Absolute wall roughness [m]. */
  roughness: number;
  /** Corrosion allowance [m], subtracted from wall for stress checks. */
  corrosionAllowance: number;
}

/** ASTM A106 Grade B carbon steel — the workhorse of process piping. */
export const A106B: PipeMaterial = {
  name: 'ASTM A106-B',
  E: 200e9,
  allowable: 137.9e6, // 20 ksi at moderate temperature
  roughness: mmToM(0.045),
  corrosionAllowance: mmToM(1.5),
};

export interface PipeGeometry {
  nps: NominalSize;
  schedule: Schedule;
  /** Outside diameter [m]. */
  od: number;
  /** Wall thickness [m]. */
  wall: number;
  /** Inside diameter [m]. */
  id: number;
  /** Flow area [m^2]. */
  area: number;
}

// Outside diameters per NPS [mm] (schedule-independent).
const OD_MM: Record<NominalSize, number> = {
  '2"': 60.3,
  '4"': 114.3,
  '6"': 168.3,
  '8"': 219.1,
};

// Wall thickness [mm] per NPS and schedule (ASME B36.10M).
const WALL_MM: Record<Schedule, Record<NominalSize, number>> = {
  '40': { '2"': 3.91, '4"': 6.02, '6"': 7.11, '8"': 8.18 },
  '80': { '2"': 5.54, '4"': 8.56, '6"': 10.97, '8"': 12.7 },
};

/**
 * Crane TP-410 "fully turbulent" friction factor fT by nominal size, used to
 * scale valve/fitting resistance coefficients (K = n * fT). Independent of
 * schedule; a property of the nominal bore.
 */
export const FRICTION_FACTOR_FT: Record<NominalSize, number> = {
  '2"': 0.019,
  '4"': 0.017,
  '6"': 0.015,
  '8"': 0.014,
};

export function pipeGeometry(nps: NominalSize, schedule: Schedule): PipeGeometry {
  const od = mmToM(OD_MM[nps]);
  const wall = mmToM(WALL_MM[schedule][nps]);
  const id = od - 2 * wall;
  const area = (Math.PI / 4) * id * id;
  return { nps, schedule, od, wall, id, area };
}

export const NOMINAL_SIZES: NominalSize[] = ['2"', '4"', '6"', '8"'];

/** Bore diameter of a size in inches (for Cv/K conversions). */
export function boreInches(nps: NominalSize, schedule: Schedule): number {
  return pipeGeometry(nps, schedule).id / inchToM(1);
}
