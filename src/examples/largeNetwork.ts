/**
 * Procedural grid network for the InstancedMesh performance target — a looped
 * pipe grid fed by a single reservoir, with a small demand at every interior
 * junction. A 16x16 grid yields ~480 pipes / ~256 nodes, exercising the Global
 * View at the "500 pipes @ 60 fps" scale.
 */

import { PipelineNetwork, NetworkNode, NetworkLink } from '../domain/network';

export function gridNetwork(nx = 16, ny = 16, spacing = 4): PipelineNetwork {
  const nodes: NetworkNode[] = [];
  const links: NetworkLink[] = [];
  const id = (i: number, j: number) => `N_${i}_${j}`;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const isSource = i === 0 && j === 0;
      nodes.push({
        id: id(i, j),
        type: isSource ? 'reservoir' : 'junction',
        position: { x: i * spacing, y: 2 + ((i + j) % 3), z: j * spacing },
        fixedHead: isSource ? 60 : undefined,
        demand: isSource ? undefined : 0.0015,
      });
    }
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (i < nx - 1) {
        links.push({ id: `H_${i}_${j}`, kind: 'pipe', from: id(i, j), to: id(i + 1, j), nps: '4"', schedule: '40', length: spacing });
      }
      if (j < ny - 1) {
        links.push({ id: `V_${i}_${j}`, kind: 'pipe', from: id(i, j), to: id(i, j + 1), nps: '4"', schedule: '40', length: spacing });
      }
    }
  }

  return { nodes, links, subAssemblies: [], temperatureC: 20 };
}
