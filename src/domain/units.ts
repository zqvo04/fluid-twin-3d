/**
 * Unit system. The entire engine works in SI internally
 * (m, m^3/s, Pa, kg, s, K). These helpers exist so the UI layer can present
 * engineering-friendly units (bar, m^3/h, inches) without leaking conversions
 * into the physics core.
 */

/** Standard gravitational acceleration [m/s^2]. */
export const G = 9.80665;

/** Standard atmospheric pressure [Pa]. */
export const ATM = 101_325;

// --- Length --------------------------------------------------------------
export const inchToM = (inch: number): number => inch * 0.0254;
export const mToInch = (m: number): number => m / 0.0254;
export const mmToM = (mm: number): number => mm / 1000;
export const mToMm = (m: number): number => m * 1000;

// --- Pressure ------------------------------------------------------------
export const barToPa = (bar: number): number => bar * 1e5;
export const paToBar = (pa: number): number => pa / 1e5;
export const psiToPa = (psi: number): number => psi * 6894.757;
export const paToPsi = (pa: number): number => pa / 6894.757;

// --- Flow ----------------------------------------------------------------
export const m3hToM3s = (q: number): number => q / 3600;
export const m3sToM3h = (q: number): number => q * 3600;
export const gpmToM3s = (gpm: number): number => gpm * 6.30902e-5;
export const m3sToGpm = (q: number): number => q / 6.30902e-5;

// --- Temperature ---------------------------------------------------------
export const celsiusToK = (c: number): number => c + 273.15;
export const kToCelsius = (k: number): number => k - 273.15;

/**
 * Convert a pressure [Pa] to an equivalent fluid head [m] for a given
 * density. head = p / (rho * g).
 */
export const pressureToHead = (pa: number, rho: number): number => pa / (rho * G);

/** Convert a head [m] to pressure [Pa] for a given density. */
export const headToPressure = (head: number, rho: number): number => head * rho * G;
