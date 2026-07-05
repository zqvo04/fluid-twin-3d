/**
 * Default configuration for the Water Hammer Lab — a reservoir → pipe → valve
 * line built from real catalog data so the wave speed, friction, and surge are
 * physically meaningful rather than arbitrary.
 */

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
}

export const DEFAULT_LAB_INPUTS: LabInputs = {
  nps: '6"',
  schedule: '40',
  length: 600,
  reservoirHead: 150,
  velocity: 2.0,
  tempC: 20,
  segments: 48,
};

export function buildWaterHammerConfig(input: LabInputs = DEFAULT_LAB_INPUTS): WaterHammerConfig {
  const geo = pipeGeometry(input.nps, input.schedule);
  const fluid = waterProperties(input.tempC);
  const flow = input.velocity * geo.area;

  const a = waveSpeed(fluid.bulk, fluid.rho, geo.id, geo.wall, A106B.E);
  const re = reynolds(flow, geo.id, fluid.rho, fluid.mu);
  const f = churchillFriction(re, A106B.roughness / geo.id);

  return {
    length: input.length,
    diameter: geo.id,
    area: geo.area,
    waveSpeed: a,
    frictionFactor: f,
    reservoirHead: input.reservoirHead,
    initialFlow: flow,
    segments: input.segments,
  };
}
