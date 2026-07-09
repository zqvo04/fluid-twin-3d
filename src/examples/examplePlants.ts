/**
 * Bundled example plants the user can load and study. Each is a realistic small
 * system exercising a different feature: gravity/elevation, water hammer, loops.
 */

import { PipelineNetwork } from '../domain/network';
import { PUMP_50M } from '../domain/catalog/pumps';
import { pumpSkidNetwork } from './demoNetworks';
import { gridNetwork } from './largeNetwork';

/** High reservoir → long buried main → end valve → delivery tank. The classic
 *  water-hammer configuration: slamming the end valve surges the whole main. */
export function gravityMain(): PipelineNetwork {
  return {
    temperatureC: 20,
    subAssemblies: [],
    nodes: [
      { id: 'SOURCE', type: 'reservoir', position: { x: 0, y: 120, z: 0 }, fixedHead: 120 },
      { id: 'BREAK', type: 'junction', position: { x: 40, y: 60, z: 0 }, demand: 0 },
      { id: 'VALVE_IN', type: 'junction', position: { x: 90, y: 12, z: 0 }, demand: 0 },
      { id: 'DELIVERY', type: 'reservoir', position: { x: 100, y: 10, z: 0 }, fixedHead: 15 },
    ],
    links: [
      { id: 'MAIN_1', kind: 'pipe', from: 'SOURCE', to: 'BREAK', nps: '8"', schedule: '40', length: 500, fittings: ['entrance', 'elbow90'] },
      { id: 'MAIN_2', kind: 'pipe', from: 'BREAK', to: 'VALVE_IN', nps: '8"', schedule: '40', length: 500, fittings: ['elbow90'] },
      { id: 'END_VALVE', kind: 'valve', from: 'VALVE_IN', to: 'DELIVERY', valveType: 'butterfly', nps: '8"', schedule: '40', opening: 1 },
    ],
  };
}

/** Pumped cooling-water loop: a sump makes up losses, a pump circulates through
 *  a ring serving three heat loads (junction demands). */
export function coolingLoop(): PipelineNetwork {
  return {
    temperatureC: 30,
    subAssemblies: [],
    nodes: [
      { id: 'SUMP', type: 'reservoir', position: { x: -10, y: 2, z: 0 }, fixedHead: 2 },
      { id: 'PUMP_OUT', type: 'junction', position: { x: 0, y: 3, z: 0 }, demand: 0 },
      { id: 'HX1', type: 'junction', position: { x: 14, y: 3, z: 10 }, demand: 40 / 3600 },
      { id: 'HX2', type: 'junction', position: { x: 28, y: 3, z: 0 }, demand: 40 / 3600 },
      { id: 'HX3', type: 'junction', position: { x: 14, y: 3, z: -10 }, demand: 40 / 3600 },
    ],
    links: [
      { id: 'PUMP', kind: 'pump', from: 'SUMP', to: 'PUMP_OUT', spec: PUMP_50M, speedRatio: 1 },
      { id: 'SUPPLY', kind: 'valve', from: 'PUMP_OUT', to: 'HX1', valveType: 'globe', nps: '6"', schedule: '40', opening: 1 },
      { id: 'RING_1', kind: 'pipe', from: 'HX1', to: 'HX2', nps: '6"', schedule: '40', length: 20, fittings: ['elbow90'] },
      { id: 'RING_2', kind: 'pipe', from: 'HX2', to: 'HX3', nps: '6"', schedule: '40', length: 24, fittings: ['elbow90'] },
      { id: 'RING_3', kind: 'pipe', from: 'HX3', to: 'HX1', nps: '6"', schedule: '40', length: 20, fittings: ['elbow90'] },
    ],
  };
}

export interface ExamplePlant {
  id: string;
  name: string;
  build: () => PipelineNetwork;
}

export const EXAMPLE_PLANTS: ExamplePlant[] = [
  { id: 'skid', name: 'Pump Skid → Elevated Tank', build: pumpSkidNetwork },
  { id: 'gravity', name: 'Gravity Main (water hammer)', build: gravityMain },
  { id: 'cooling', name: 'Cooling Water Loop', build: coolingLoop },
  { id: 'grid', name: '480-Pipe Stress Grid', build: () => gridNetwork(16, 16) },
];
