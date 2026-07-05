/**
 * Temperature-dependent fluid properties.
 *
 * Water properties are tabulated from 0-150 C at saturation and linearly
 * interpolated. Covers the four quantities the solvers need:
 *   - density         rho   [kg/m^3]
 *   - dynamic viscosity mu  [Pa.s]
 *   - vapor pressure   pv   [Pa]      (for NPSH / cavitation in later phases)
 *   - bulk modulus     K    [Pa]      (for MOC wave speed in later phases)
 *
 * Sources: IAPWS-derived engineering tables (values good to <1% over range).
 */

export interface FluidState {
  /** Density [kg/m^3]. */
  rho: number;
  /** Dynamic viscosity [Pa.s]. */
  mu: number;
  /** Saturation / vapor pressure [Pa, absolute]. */
  pv: number;
  /** Isothermal bulk modulus [Pa]. */
  bulk: number;
}

interface WaterRow {
  tempC: number;
  rho: number;
  mu: number;
  pv: number;
  bulk: number;
}

// Saturated liquid water. mu in Pa.s, pv in Pa (abs), bulk in Pa.
const WATER_TABLE: WaterRow[] = [
  { tempC: 0, rho: 999.8, mu: 1.792e-3, pv: 611, bulk: 2.02e9 },
  { tempC: 10, rho: 999.7, mu: 1.307e-3, pv: 1228, bulk: 2.10e9 },
  { tempC: 20, rho: 998.2, mu: 1.002e-3, pv: 2339, bulk: 2.18e9 },
  { tempC: 30, rho: 995.7, mu: 0.7977e-3, pv: 4246, bulk: 2.23e9 },
  { tempC: 40, rho: 992.2, mu: 0.6532e-3, pv: 7384, bulk: 2.27e9 },
  { tempC: 50, rho: 988.0, mu: 0.5471e-3, pv: 12_349, bulk: 2.29e9 },
  { tempC: 60, rho: 983.2, mu: 0.4665e-3, pv: 19_946, bulk: 2.28e9 },
  { tempC: 70, rho: 977.8, mu: 0.4040e-3, pv: 31_201, bulk: 2.25e9 },
  { tempC: 80, rho: 971.8, mu: 0.3544e-3, pv: 47_414, bulk: 2.20e9 },
  { tempC: 90, rho: 965.3, mu: 0.3145e-3, pv: 70_182, bulk: 2.14e9 },
  { tempC: 100, rho: 958.4, mu: 0.2818e-3, pv: 101_325, bulk: 2.07e9 },
  { tempC: 110, rho: 951.0, mu: 0.2548e-3, pv: 143_380, bulk: 1.99e9 },
  { tempC: 120, rho: 943.1, mu: 0.2321e-3, pv: 198_540, bulk: 1.91e9 },
  { tempC: 130, rho: 934.8, mu: 0.2129e-3, pv: 270_130, bulk: 1.82e9 },
  { tempC: 140, rho: 926.1, mu: 0.1965e-3, pv: 361_380, bulk: 1.73e9 },
  { tempC: 150, rho: 916.9, mu: 0.1825e-3, pv: 476_160, bulk: 1.64e9 },
];

function interp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * Water properties at a given temperature [C], clamped to the table range
 * and linearly interpolated between rows.
 */
export function waterProperties(tempC: number): FluidState {
  const t = Math.max(WATER_TABLE[0].tempC, Math.min(tempC, WATER_TABLE[WATER_TABLE.length - 1].tempC));

  let lo = WATER_TABLE[0];
  let hi = WATER_TABLE[WATER_TABLE.length - 1];
  for (let i = 0; i < WATER_TABLE.length - 1; i++) {
    if (t >= WATER_TABLE[i].tempC && t <= WATER_TABLE[i + 1].tempC) {
      lo = WATER_TABLE[i];
      hi = WATER_TABLE[i + 1];
      break;
    }
  }

  return {
    rho: interp(t, lo.tempC, hi.tempC, lo.rho, hi.rho),
    mu: interp(t, lo.tempC, hi.tempC, lo.mu, hi.mu),
    pv: interp(t, lo.tempC, hi.tempC, lo.pv, hi.pv),
    bulk: interp(t, lo.tempC, hi.tempC, lo.bulk, hi.bulk),
  };
}

/** Kinematic viscosity nu = mu / rho [m^2/s]. */
export const kinematicViscosity = (f: FluidState): number => f.mu / f.rho;
