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
 *     C+ :  H_P = C_P - B Q_P     C_P = H[i-1] + B QD[i-1] - R QD[i-1]|QD[i-1]|
 *     C- :  H_P = C_M + B Q_P     C_M = H[i+1] - B QU[i+1] + R QU[i+1]|QU[i+1]|
 * Reservoir (node 0): H fixed, Q from C-. Valve (node N): C+ plus the valve
 * discharge law Q = (Cd Av) tau sqrt(H).
 *
 * Column separation / cavitation (Phase 4): when the head at a section would
 * fall below the vapor head, a Discrete Vapor Cavity Model (DVCM) pins the head
 * at the vapor level and tracks a local cavity volume from the mismatch between
 * the upstream (QU) and downstream (QD) flows. When the cavity refills to zero
 * it collapses and the rejoining columns produce a pressure spike — the
 * physical mechanism behind real column-separation damage.
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
  /**
   * Total-head level [m] at/below which the liquid cavitates (vapor pressure
   * referenced to the pipe elevation and atmosphere). When set, the DVCM
   * column-separation model is active; when omitted, the solver runs without
   * cavitation (heads may go unphysically negative — useful for the clean
   * Joukowsky comparison).
   */
  vaporHead?: number;
  /**
   * Optional surge-protection air chamber (air vessel) installed just upstream
   * of the valve. The trapped gas cushions the surge: liquid flows into the
   * vessel as the pressure rises, compressing the gas per a polytropic law
   * P*Vg^n = const. This is the "fix" in the find-fix-verify design loop.
   */
  airChamber?: {
    /** Initial trapped-gas volume [m^3]. */
    gasVolume: number;
    /** Polytropic exponent n (1.0 isothermal … 1.4 adiabatic; ~1.2 typical). */
    polytropic: number;
    /** Vessel/pipe elevation [m] (pressure datum). */
    elevation: number;
    /** Atmospheric pressure head [m] (absolute-pressure offset). */
    barometricHead: number;
  };
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
  /** Downstream-face flow at each node [m^3/s] (equals upstream flow off cavities). */
  Q: Float64Array;
  /** Cavity volume at each node [m^3] (0 where the liquid is intact). */
  cavityVolume: Float64Array;
  /** Elapsed simulation time [s]. */
  time = 0;

  private readonly B: number; // characteristic impedance a/(gA)
  private readonly R: number; // friction resistance per reach
  private readonly H0: number;
  private readonly Q0: number;
  private readonly length: number;
  private readonly waveSpeedValue: number;
  private readonly valveConst: number; // (Cd Av)^2 at full open
  private readonly vaporHead: number | null;

  // Air chamber (surge vessel) state, active only when configured.
  private readonly airChamber: WaterHammerConfig['airChamber'] | null;
  private chamberC0 = 0; // gas law constant P_abs * Vg^n
  /** Current trapped-gas volume [m^3] (0 when no chamber). */
  gasVolume = 0;
  private chamberFlowPrev = 0; // previous flow into the chamber [m^3/s]
  private gasVolumeNext = 0;
  private chamberFlowNext = 0;

  // Upstream-face flow (differs from Q only at an open cavity).
  private QU: Float64Array;

  // Scratch buffers for the next time level.
  private readonly Hn: Float64Array;
  private readonly Qn: Float64Array;
  private readonly QUn: Float64Array;
  private readonly cavN: Float64Array;

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
    this.vaporHead = cfg.vaporHead ?? null;

    this.H = new Float64Array(this.nodes);
    this.Q = new Float64Array(this.nodes);
    this.QU = new Float64Array(this.nodes);
    this.cavityVolume = new Float64Array(this.nodes);
    this.Hn = new Float64Array(this.nodes);
    this.Qn = new Float64Array(this.nodes);
    this.QUn = new Float64Array(this.nodes);
    this.cavN = new Float64Array(this.nodes);

    // Steady initial condition: uniform flow Q0, head dropping by the reach
    // friction loss along the line.
    for (let i = 0; i < this.nodes; i++) {
      this.Q[i] = this.Q0;
      this.QU[i] = this.Q0;
      this.H[i] = this.H0 - i * this.R * this.Q0 * Math.abs(this.Q0);
    }

    // Choose the valve coefficient so the given Q0 is the steady discharge at
    // the steady valve head — the sim therefore starts exactly in balance.
    const valveHeadSteady = this.H[this.nodes - 1];
    this.valveConst = valveHeadSteady > 0 ? (this.Q0 * this.Q0) / valveHeadSteady : 0;

    // Air chamber: initial gas law constant from the steady absolute pressure.
    this.airChamber = cfg.airChamber ?? null;
    if (this.airChamber) {
      this.gasVolume = this.airChamber.gasVolume;
      const absHeadSteady = valveHeadSteady - this.airChamber.elevation + this.airChamber.barometricHead;
      this.chamberC0 = absHeadSteady * Math.pow(this.gasVolume, this.airChamber.polytropic);
    }
  }

  /** Joukowsky instantaneous-closure surge [m]: dH = a*V0/g = B*Q0. */
  joukowskyHead(): number {
    return this.B * Math.abs(this.Q0);
  }

  /** Round-trip wave period 4L/a [s]. */
  wavePeriod(): number {
    return (4 * this.length) / this.waveSpeedValue;
  }

  /** True if any section currently holds an open vapor cavity. */
  hasCavity(): boolean {
    for (let i = 0; i < this.nodes; i++) if (this.cavityVolume[i] > 0) return true;
    return false;
  }

  /**
   * Advance one time step. `tau` is the dimensionless valve opening
   * (1 = fully open, 0 = shut), applied at the downstream boundary.
   */
  step(tau: number): void {
    const { H, Q, QU, Hn, Qn, QUn, cavN, cavityVolume, B, R, dt } = this;
    const N = this.nodes - 1;
    const hv = this.vaporHead;

    // Interior nodes.
    for (let i = 1; i < N; i++) {
      const cp = H[i - 1] + B * Q[i - 1] - R * Q[i - 1] * Math.abs(Q[i - 1]);
      const cm = H[i + 1] - B * QU[i + 1] + R * QU[i + 1] * Math.abs(QU[i + 1]);
      const hNormal = 0.5 * (cp + cm);

      if (hv !== null && (hNormal < hv || cavityVolume[i] > 0)) {
        // DVCM: pin head at vapor level, split the flow, grow/shrink the cavity.
        const qu = (cp - hv) / B; // upstream-face flow (from C+)
        const qd = (hv - cm) / B; // downstream-face flow (from C-)
        const vol = cavityVolume[i] + (qd - qu) * dt;
        if (vol <= 0) {
          // Cavity collapses this step: columns rejoin, revert to normal MOC.
          cavN[i] = 0;
          Hn[i] = hNormal;
          const q = (cp - cm) / (2 * B);
          Qn[i] = q;
          QUn[i] = q;
        } else {
          cavN[i] = vol;
          Hn[i] = hv;
          QUn[i] = qu;
          Qn[i] = qd;
        }
      } else {
        Hn[i] = hNormal;
        const q = (cp - cm) / (2 * B);
        Qn[i] = q;
        QUn[i] = q;
        cavN[i] = 0;
      }
    }

    // Upstream reservoir: constant head, flow from the C- characteristic.
    Hn[0] = this.H0;
    const cm0 = H[1] - B * QU[1] + R * QU[1] * Math.abs(QU[1]);
    const q0 = (Hn[0] - cm0) / B;
    Qn[0] = q0;
    QUn[0] = q0;
    cavN[0] = 0;

    // Downstream boundary: C+ characteristic from the last interior reach.
    const cp = H[N - 1] + B * Q[N - 1] - R * Q[N - 1] * Math.abs(Q[N - 1]);
    const cs = this.valveConst * tau * tau;

    if (this.airChamber) {
      // Surge vessel just upstream of the valve. Node continuity:
      //   Q_pipe = Q_valve + Q_chamber, with Q_pipe = (cp - H)/B,
      //   Q_valve = sqrt(cs*H), gas law H_abs*Vg^n = C0, and
      //   Q_chamber from the trapezoidal volume change. One nonlinear equation
      //   in H, solved by bisection (the residual is monotonic in H).
      const ac = this.airChamber;
      const n = ac.polytropic;
      const off = ac.barometricHead - ac.elevation; // H_abs = H + off
      const vgOf = (h: number) => Math.pow(this.chamberC0 / Math.max(h + off, 1e-3), 1 / n);
      const residual = (h: number) => {
        const vg = vgOf(h);
        const qCham = (2 * (this.gasVolume - vg)) / dt - this.chamberFlowPrev;
        const qValve = cs > 0 && h > 0 ? Math.sqrt(cs * h) : 0;
        const qPipe = (cp - h) / B;
        return qPipe - qValve - qCham;
      };

      let lo = 0.1;
      let hi = Math.max(cp, this.H0) + 1000;
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        // residual is monotonically decreasing in h.
        if (residual(mid) > 0) lo = mid;
        else hi = mid;
      }
      const hN = 0.5 * (lo + hi);
      const vg = vgOf(hN);
      const qCham = (2 * (this.gasVolume - vg)) / dt - this.chamberFlowPrev;
      const qValve = cs > 0 && hN > 0 ? Math.sqrt(cs * hN) : 0;

      Hn[N] = hN;
      QUn[N] = (cp - hN) / B; // flow arriving from the pipe
      Qn[N] = qValve; // flow discharged through the valve
      cavN[N] = 0;
      this.gasVolumeNext = vg;
      this.chamberFlowNext = qCham;
    } else {
      // Plain valve, with column separation (DVCM) at the valve.
      let qv: number;
      let hValve: number;
      if (cs <= 0) {
        qv = 0;
        hValve = cp;
      } else {
        qv = -0.5 * cs * B + Math.sqrt(0.25 * cs * cs * B * B + cs * cp);
        hValve = cp - B * qv;
      }

      if (hv !== null && (hValve < hv || cavityVolume[N] > 0)) {
        const qu = (cp - hv) / B; // upstream-face flow from C+
        const vol = cavityVolume[N] + (0 - qu) * dt;
        if (vol <= 0) {
          cavN[N] = 0;
          Qn[N] = qv;
          QUn[N] = qv;
          Hn[N] = hValve;
        } else {
          cavN[N] = vol;
          Hn[N] = hv;
          QUn[N] = qu;
          Qn[N] = 0;
        }
      } else {
        Qn[N] = qv;
        QUn[N] = qv;
        Hn[N] = hValve;
        cavN[N] = 0;
      }
    }

    if (this.airChamber) {
      this.gasVolume = this.gasVolumeNext;
      this.chamberFlowPrev = this.chamberFlowNext;
    }

    this.H.set(Hn);
    this.Q.set(Qn);
    this.QU.set(QUn);
    this.cavityVolume.set(cavN);
    this.time += dt;
  }
}
