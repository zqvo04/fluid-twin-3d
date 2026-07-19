/**
 * Example networks for development and onboarding.
 *
 * `pumpSkidNetwork` demonstrates the modular assembly story: a reusable pump
 * skid (suction valve -> pump -> check + discharge valve) grouped as a
 * SubAssembly, wired end-to-end from a suction reservoir to an elevated tank.
 */

import { PipelineNetwork } from '../domain/network';
import { PUMP_50M } from '../domain/catalog/pumps';

export function pumpSkidNetwork(): PipelineNetwork {
  return {
    temperatureC: 20,
    sections: [
      { id: 'SUCTION', name: 'Suction', color: '#5ad1e6' },
      { id: 'PUMP_SKID', name: 'Pump Skid', color: '#4c8dff' },
      { id: 'DELIVERY', name: 'Delivery', color: '#f4a63b' },
    ],
    nodes: [
      // Suction side
      { id: 'SUCTION_TANK', type: 'reservoir', position: { x: -8, y: 2, z: 0 }, fixedHead: 2, sectionId: 'SUCTION' },
      { id: 'PUMP_IN', type: 'junction', position: { x: -3, y: 1, z: 0 }, demand: 0, sectionId: 'SUCTION' },
      // Pump skid internal
      { id: 'PUMP_OUT', type: 'junction', position: { x: 0, y: 1, z: 0 }, demand: 0, sectionId: 'PUMP_SKID' },
      { id: 'SKID_HDR', type: 'junction', position: { x: 3, y: 1, z: 0 }, demand: 0, sectionId: 'PUMP_SKID' },
      // Delivery
      { id: 'RISER_TOP', type: 'junction', position: { x: 20, y: 25, z: 0 }, demand: 0, sectionId: 'DELIVERY' },
      { id: 'ELEVATED_TANK', type: 'reservoir', position: { x: 28, y: 30, z: 0 }, fixedHead: 30, sectionId: 'DELIVERY' },
    ],
    links: [
      { id: 'SUCTION_LINE', kind: 'pipe', from: 'SUCTION_TANK', to: 'PUMP_IN', nps: '8"', schedule: '40', length: 6, fittings: ['entrance', 'elbow90'] },
      { id: 'SUCTION_VALVE', kind: 'valve', from: 'PUMP_IN', to: 'PUMP_OUT', valveType: 'gate', nps: '8"', schedule: '40', opening: 1 },
      { id: 'PUMP', kind: 'pump', from: 'PUMP_OUT', to: 'SKID_HDR', spec: PUMP_50M, speedRatio: 1 },
      { id: 'DISCHARGE_VALVE', kind: 'valve', from: 'SKID_HDR', to: 'RISER_TOP', valveType: 'globe', nps: '6"', schedule: '40', opening: 1 },
      { id: 'DELIVERY_LINE', kind: 'pipe', from: 'RISER_TOP', to: 'ELEVATED_TANK', nps: '6"', schedule: '40', length: 40, fittings: ['elbow90', 'elbow90', 'exit'] },
    ],
    subAssemblies: [
      {
        id: 'SKID_1',
        name: 'Pump Skid #1',
        nodeIds: ['PUMP_IN', 'PUMP_OUT', 'SKID_HDR'],
        linkIds: ['SUCTION_VALVE', 'PUMP', 'DISCHARGE_VALVE'],
      },
    ],
  };
}
