import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, SCHEMA_VERSION } from './serialize';
import { pumpSkidNetwork } from '../examples/demoNetworks';

describe('project serialization', () => {
  it('round-trips a network without loss', () => {
    const net = pumpSkidNetwork();
    const restored = deserializeProject(serializeProject(net));
    expect(restored.nodes).toHaveLength(net.nodes.length);
    expect(restored.links).toHaveLength(net.links.length);
    expect(restored.subAssemblies).toHaveLength(net.subAssemblies.length);
    expect(restored.temperatureC).toBe(net.temperatureC);
    // Pump coefficients survive the round trip.
    const pump = restored.links.find((l) => l.kind === 'pump');
    expect(pump && pump.kind === 'pump' && pump.spec.a0).toBeGreaterThan(0);
  });

  it('rejects non-JSON input', () => {
    expect(() => deserializeProject('{not json')).toThrow(/valid JSON/);
  });

  it('rejects an unsupported schema version', () => {
    const bad = JSON.stringify({ schemaVersion: 999, network: pumpSkidNetwork() });
    expect(() => deserializeProject(bad)).toThrow(/schema version/);
  });

  it('rejects a network missing required fields', () => {
    const bad = JSON.stringify({ schemaVersion: SCHEMA_VERSION, network: { nodes: [] } });
    expect(() => deserializeProject(bad)).toThrow(/required network fields/);
  });

  it('rejects a structurally invalid network (dangling link)', () => {
    const net = pumpSkidNetwork();
    net.links[0].to = 'NONEXISTENT';
    const bad = JSON.stringify({ schemaVersion: SCHEMA_VERSION, network: net });
    expect(() => deserializeProject(bad)).toThrow(/validation/);
  });
});
