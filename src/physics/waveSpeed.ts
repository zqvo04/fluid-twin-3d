/**
 * Pressure-wave (acoustic) speed in a liquid-filled pipe — the Korteweg
 * formula. The pipe walls are elastic, so the effective celerity is lower than
 * the free-fluid sound speed sqrt(K/rho); a thicker or stiffer wall raises it.
 * This is why a 2" Sch 80 line and an 8" Sch 40 line carry water hammer at
 * different speeds, which the MOC discretization depends on.
 *
 *   a = sqrt( (K/rho) / (1 + (K*D)/(E*e) * psi) )
 *
 *   K   fluid bulk modulus [Pa]
 *   rho fluid density [kg/m^3]
 *   D   pipe inside diameter [m]
 *   E   pipe wall Young's modulus [Pa]
 *   e   wall thickness [m]
 *   psi restraint coefficient (~1 for a thin-walled line anchored against
 *       axial movement); kept as a parameter for later refinement.
 */

export function waveSpeed(
  bulk: number,
  rho: number,
  diameter: number,
  wall: number,
  E: number,
  psi = 1,
): number {
  const free = bulk / rho;
  const compliance = 1 + ((bulk * diameter) / (E * wall)) * psi;
  return Math.sqrt(free / compliance);
}
