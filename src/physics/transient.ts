/**
 * Transient (water hammer) solver — Method of Characteristics (MOC) for the
 * canonical single-line case: constant-head reservoir → pipe → downstream
 * valve. This is the textbook water-hammer configuration and the basis of the
 * "Water Hammer Lab" visualization.
 *
 * The compressible unsteady flow equations
 *     dH/dt + (a^2/gA) dQ/dx = 0
 *     dQ/dt + gA dH/dx + f Q|Q|/(2DA) = 0
 * transform along the characteristics dx/dt = +-a into the compatibility
 * equations solved here. The pipe is gridded at dx = a*dt (Courant number 1),
 * so information travels exactly one reach per time step.
 *
 * Interior node i:
 *     C+ :  H_P = C_P - B Q_P     C_P = H[i-1] + B Q[i-1] - R Q[i-1]|Q[i-1]|
 *     C- :  H_P = C_M + B Q_P     C_M = H[i+1] - B Q[i+1] + R Q[i+1]|Q[i+1]|
 * Reservoir (node 0): H fixed, Q from C-. Valve (node N): C+ plus the valve
 * discharge law Q = (Cd Av) tau sqrt(H).
 *
 * Extending this to branched networks (tees, pumps, junctions) is Phase 3b;
 * the boundary-condition structure here is written to generalize.
 */

import { G } from '../domain/units';

export interface WaterHammerConfig {
  /** Pipe length [m]. */
  length: number;
  /** Inside diameter [m]. */
  diameter: number;
  /** Flow area [m^2]. */
  area: number;
  /** Pressure wave speed [m/s]. */
  waveSpeed: number;
  /** Darcy friction factor (held constant over the transient at its steady value). */
  frictionFactor: number;
  /** Upstream reservoir total head [m]. */
  reservoirHead: number;
  /** Initial steady volumetric flow [m^3/s]. */
  initialFlow: number;
  /** Number of reaches (pipe is divided into this many segments). */
  segments: number;
}

export class WaterHammerSim {
  /** Fixed time step [s] set by the Courant condition dx = a*dt. */
  readonly dt: number;
  /** Node count = segments + 1. */
  readonly nodes: number;
  /** Reach length [m]. */
  readonly dx: number;

  /** Head at each node [m]. */
  H: Float64Array;
  /** Flow at each node [m^3/s]. */
  Q: Float64Array;
  /** Elapsed simulation time [s]. */
  time = 0;

  private readonly B: number; // characteristic impedance a/(gA)
  private readonly R: number; // friction resistance per reach
  private readonly H0: number;
  private readonly Q0: number;
  private readonly length: number;
  private readonly waveSpeedValue: number;
  private readonly valveConst: number; // (Q0/sqrt(H_valve_steady))^2, i.e. (Cd Av)^2 at full open

  // Scratch buffers for the next time level.
  private readonly Hn: Float64Array;
  private readonly Qn: Float64Array;

  constructor(cfg: WaterHammerConfig) {
    this.nodes = cfg.segments + 1;
    this.dx = cfg.length / cfg.segments;
    this.dt = this.dx / cfg.waveSpeed;
    this.B = cfg.waveSpeed / (G * cfg.area);
    this.R = (cfg.frictionFactor * this.dx) / (2 * G * cfg.diameter * cfg.area * cfg.area);
    this.H0 = cfg.reservoirHead;
    this.Q0 = cfg.initialFlow;
    this.length = cfg.length;
    this.waveSpeedValue = cfg.waveSpeed;

    this.H = new Float64Array(this.nodes);
    this.Q = new Float64Array(this.nodes);
    this.Hn = new Float64Array(this.nodes);
    this.Qn = new Float64Array(this.nodes);

    // Steady initial condition: uniform flow Q0, head dropping by the reach
    // friction loss along the line.
    for (let i = 0; i < this.nodes; i++) {
      this.Q[i] = this.Q0;
      this.H[i] = this.H0 - i * this.R * this.Q0 * Math.abs(this.Q0);
    }

    // Choose the valve coefficient so the given Q0 is the steady discharge at
    // the steady valve head — the sim therefore starts exactly in balance.
    const valveHeadSteady = this.H[this.nodes - 1];
    this.valveConst = valveHeadSteady > 0 ? (this.Q0 * this.Q0) / valveHeadSteady : 0;
  }

  /** Joukowsky instantaneous-closure surge [m]: dH = a*V0/g = B*Q0. */
  joukowskyHead(): number {
    return this.B * Math.abs(this.Q0);
  }

  /** Round-trip wave period 4L/a [s]. */
  wavePeriod(): number {
    return (4 * this.length) / this.waveSpeedValue;
  }

  /**
   * Advance one time step. `tau` is the dimensionless valve opening
   * (1 = fully open, 0 = shut), applied at the downstream boundary.
   */
  step(tau: number): void {
    const { H, Q, Hn, Qn, B, R } = this;
    const N = this.nodes - 1;

    // Interior nodes.
    for (let i = 1; i < N; i++) {
      const cp = H[i - 1] + B * Q[i - 1] - R * Q[i - 1] * Math.abs(Q[i - 1]);
      const cm = H[i + 1] - B * Q[i + 1] + R * Q[i + 1] * Math.abs(Q[i + 1]);
      Hn[i] = 0.5 * (cp + cm);
      Qn[i] = (cp - cm) / (2 * B);
    }

    // Upstream reservoir: constant head, flow from the C- characteristic.
    Hn[0] = this.H0;
    const cm0 = H[1] - B * Q[1] + R * Q[1] * Math.abs(Q[1]);
    Qn[0] = (Hn[0] - cm0) / B;

    // Downstream valve: C+ characteristic combined with the discharge law
    // Q = sqrt(cs * H), cs = valveConst * tau^2. Solving the quadratic in Q:
    //   Q^2 + cs*B*Q - cs*C_P = 0
    const cp = H[N - 1] + B * Q[N - 1] - R * Q[N - 1] * Math.abs(Q[N - 1]);
    const cs = this.valveConst * tau * tau;
    if (cs <= 0) {
      Qn[N] = 0;
      Hn[N] = cp;
    } else {
      const q = -0.5 * cs * B + Math.sqrt(0.25 * cs * cs * B * B + cs * cp);
      Qn[N] = q;
      Hn[N] = cp - B * q;
    }

    this.H.set(Hn);
    this.Q.set(Qn);
    this.time += this.dt;
  }
}
