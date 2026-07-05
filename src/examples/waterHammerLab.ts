/**
 * Default configuration for the Water Hammer Lab — a reservoir → pipe → valve
 * line built from real catalog data so the wave speed, friction, and surge are
 * physically meaningful rather than arbitrary.
 */

import { G, ATM } from '../domain/units';
import { waterProperties } from '../domain/fluid';
import { pipeGeometry, A106B, NominalSize, Schedule } from '../domain/catalog/pipes';
import { reynolds, churchillFriction } from '../physics/friction';
import { waveSpeed } from '../physics/waveSpeed';
import { WaterHammerConfig } from '../physics/transient';

export interface LabInputs {
  nps: NominalSize;
  schedule: Schedule;
  length: number; // m
  reservoirHead: number; // m
  velocity: number; // m/s (initial steady velocity)
  tempC: number;
  segments: number;
  /** Pipe centerline elevation [m] (the vapor-head datum). */
  pipeElevation: number;
}

export const DEFAULT_LAB_INPUTS: LabInputs = {
  nps: '6"',
  schedule: '40',
  length: 600,
  reservoirHead: 150,
  velocity: 2.0,
  tempC: 20,
  segments: 48,
  pipeElevation: 0,
};

export function buildWaterHammerConfig(input: LabInputs = DEFAULT_LAB_INPUTS): WaterHammerConfig {
  const geo = pipeGeometry(input.nps, input.schedule);
  const fluid = waterProperties(input.tempC);
  const flow = input.velocity * geo.area;

  const a = waveSpeed(fluid.bulk, fluid.rho, geo.id, geo.wall, A106B.E);
  const re = reynolds(flow, geo.id, fluid.rho, fluid.mu);
  const f = churchillFriction(re, A106B.roughness / geo.id);

  // Total-head level at which absolute pressure reaches vapor pressure at the
  // pipe elevation: H_vapor = z + (p_vapor - p_atm) / (rho*g).
  const vaporHead = input.pipeElevation + (fluid.pv - ATM) / (fluid.rho * G);

  return {
    length: input.length,
    diameter: geo.id,
    area: geo.area,
    waveSpeed: a,
    frictionFactor: f,
    reservoirHead: input.reservoirHead,
    initialFlow: flow,
    segments: input.segments,
    vaporHead,
  };
}
