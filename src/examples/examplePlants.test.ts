import { describe, it, expect } from 'vitest';
import { EXAMPLE_PLANTS } from './examplePlants';
import { validateNetwork } from '../domain/network';
import { solveSteadyState } from '../physics/steadySolver';

describe('bundled example plants', () => {
  for (const plant of EXAMPLE_PLANTS) {
    it(`"${plant.name}" is valid and solves`, () => {
      const net = plant.build();
      expect(validateNetwork(net).filter((i) => i.severity === 'error')).toHaveLength(0);
      const res = solveSteadyState(net);
      expect(res.converged).toBe(true);
    });
  }
});
