/**
 * Darcy friction factor via the Churchill (1977) correlation.
 *
 * Churchill is a single explicit expression valid across laminar, transition,
 * and turbulent regimes, so it avoids the derivative discontinuity that a
 * regime switch would inject into the Newton iteration. It reduces exactly to
 * the laminar 64/Re at low Reynolds numbers and approaches Colebrook in the
 * turbulent regime.
 */

/** Reynolds number for pipe flow. Re = 4 * rho * |Q| / (pi * D * mu). */
export function reynolds(flow: number, diameter: number, rho: number, mu: number): number {
  return (4 * rho * Math.abs(flow)) / (Math.PI * diameter * mu);
}

/**
 * Darcy-Weisbach friction factor.
 * @param re          Reynolds number (>= 0).
 * @param relRough    Relative roughness eps/D (dimensionless).
 */
export function churchillFriction(re: number, relRough: number): number {
  // Guard the zero-flow limit: return a large-but-finite laminar-like value.
  const Re = Math.max(re, 1e-6);

  const A = Math.pow(
    2.457 * Math.log(1 / (Math.pow(7 / Re, 0.9) + 0.27 * relRough)),
    16,
  );
  const B = Math.pow(37530 / Re, 16);

  const term = Math.pow(8 / Re, 12) + 1 / Math.pow(A + B, 1.5);
  return 8 * Math.pow(term, 1 / 12);
}
