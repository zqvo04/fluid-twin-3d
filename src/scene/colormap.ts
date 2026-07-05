/**
 * Scalar-to-color mapping for field visualization. A perceptually ordered
 * blue -> cyan -> green -> yellow -> red ramp maps a normalized value 0..1 to
 * an RGB triple. Used here for the steady-state head field; the same ramp
 * drives the pressure shader and stress heatmap in later phases.
 */

import { Color } from 'three';

const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [0.10, 0.20, 0.70]], // deep blue (low)
  [0.25, [0.10, 0.75, 0.90]], // cyan
  [0.5, [0.20, 0.80, 0.30]], // green
  [0.75, [0.95, 0.85, 0.15]], // yellow
  [1.0, [0.90, 0.15, 0.10]], // red (high)
];

export function rampColor(t: number): Color {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / (t1 - t0);
      return new Color(
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      );
    }
  }
  return new Color(...STOPS[STOPS.length - 1][1]);
}

/** Normalize a value against a [min,max] range, guarding a zero span. */
export function normalize(value: number, min: number, max: number): number {
  if (max - min < 1e-9) return 0.5;
  return (value - min) / (max - min);
}
