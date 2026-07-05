import { describe, it, expect } from 'vitest';
import { G } from '../domain/units';
import { WaterHammerSim, WaterHammerConfig } from './transient';
import { waveSpeed } from './waveSpeed';

function baseConfig(overrides: Partial<WaterHammerConfig> = {}): WaterHammerConfig {
  const diameter = 0.5;
  const area = (Math.PI / 4) * diameter * diameter;
  return {
    length: 600,
    diameter,
    area,
    waveSpeed: 1200,
    frictionFactor: 0, // frictionless for the clean Joukowsky comparison
    reservoirHead: 150,
    initialFlow: 1.0 * area, // V0 = 1 m/s
    segments: 40,
    ...overrides,
  };
}

describe('MOC water hammer solver', () => {
  it('stays in steady state when the valve is left fully open', () => {
    const sim = new WaterHammerSim(baseConfig({ frictionFactor: 0.02 }));
    const H0valve = sim.H[sim.nodes - 1];
    const Q0 = sim.Q[0];
    for (let i = 0; i < 200; i++) sim.step(1);
    // No spurious transient should develop.
    expect(sim.H[sim.nodes - 1]).toBeCloseTo(H0valve, 6);
    expect(sim.Q[0]).toBeCloseTo(Q0, 6);
  });

  it('reproduces the Joukowsky surge on instantaneous closure', () => {
    const cfg = baseConfig();
    const sim = new WaterHammerSim(cfg);
    const V0 = cfg.initialFlow / cfg.area;
    const joukowsky = (cfg.waveSpeed * V0) / G; // a*V0/g

    // Slam the valve shut and take one step: the valve head jumps by a*V0/g.
    sim.step(0);
    const surge = sim.H[sim.nodes - 1] - cfg.reservoirHead;

    expect(sim.joukowskyHead()).toBeCloseTo(joukowsky, 6);
    expect(surge).toBeCloseTo(joukowsky, 3);
  });

  it('propagates the wave with the correct 4L/a period (frictionless)', () => {
    const cfg = baseConfig();
    const sim = new WaterHammerSim(cfg);
    const joukowsky = sim.joukowskyHead();
    const L = cfg.length;
    const a = cfg.waveSpeed;

    // Record valve head over time after an instantaneous closure.
    sim.step(0);
    const valve = sim.nodes - 1;
    const samples: Array<{ t: number; h: number }> = [{ t: sim.time, h: sim.H[valve] }];
    const totalTime = (4 * L) / a; // one full period
    while (sim.time < totalTime * 1.05) {
      sim.step(0);
      samples.push({ t: sim.time, h: sim.H[valve] });
    }

    const at = (target: number) =>
      samples.reduce((best, s) => (Math.abs(s.t - target) < Math.abs(best.t - target) ? s : best)).h;

    // Frictionless square wave at the valve: +dH for 0<t<2L/a, -dH for 2L/a<t<4L/a.
    const high = at((1.0 * L) / a) - cfg.reservoirHead; // mid first half
    const low = at((3.0 * L) / a) - cfg.reservoirHead; // mid second half
    const backHigh = at((4.05 * L) / a) - cfg.reservoirHead; // just after one period

    expect(high).toBeCloseTo(joukowsky, 1);
    expect(low).toBeCloseTo(-joukowsky, 1);
    // After a full period the valve head has returned to the high state.
    expect(backHigh).toBeGreaterThan(0.5 * joukowsky);
  });

  it('gives a lower peak for slow (gradual) closure than instantaneous', () => {
    const cfg = baseConfig({ frictionFactor: 0 });
    const sim = new WaterHammerSim(cfg);
    const joukowsky = sim.joukowskyHead();

    // Close linearly over 6 * (2L/a): a slow closure well past the critical time.
    const criticalTime = (2 * cfg.length) / cfg.waveSpeed;
    const closeTime = 6 * criticalTime;
    let peak = 0;
    while (sim.time < closeTime * 1.2) {
      const tau = Math.max(0, 1 - sim.time / closeTime);
      sim.step(tau);
      peak = Math.max(peak, sim.H[sim.nodes - 1] - cfg.reservoirHead);
    }
    // Gradual closure must stay well below the instantaneous Joukowsky surge.
    expect(peak).toBeLessThan(0.5 * joukowsky);
    expect(peak).toBeGreaterThan(0);
  });
});

describe('MOC column separation (DVCM cavitation)', () => {
  // High velocity + low reservoir head guarantees the down-surge drives the
  // head below the vapor level, forcing a vapor cavity to form.
  function cavConfig(vaporHead: number | undefined): WaterHammerConfig {
    const diameter = 0.3;
    const area = (Math.PI / 4) * diameter * diameter;
    return {
      length: 500,
      diameter,
      area,
      waveSpeed: 1200,
      frictionFactor: 0.03,
      reservoirHead: 60,
      initialFlow: 1.0 * area, // V0 = 1 m/s -> Joukowsky ~122 m, downsurge below vapor
      segments: 32,
      vaporHead,
    };
  }

  it('clamps the head at the vapor level instead of going unphysically negative', () => {
    const withCav = new WaterHammerSim(cavConfig(-10));
    const noCav = new WaterHammerSim(cavConfig(undefined));

    let minWith = Infinity;
    let minNo = Infinity;
    for (let i = 0; i < 400; i++) {
      withCav.step(0);
      noCav.step(0);
      for (let n = 0; n < withCav.nodes; n++) minWith = Math.min(minWith, withCav.H[n]);
      for (let n = 0; n < noCav.nodes; n++) minNo = Math.min(minNo, noCav.H[n]);
    }

    // Without cavitation the head dives well below vapor; with it, it holds.
    expect(minNo).toBeLessThan(-40);
    expect(minWith).toBeGreaterThan(-10 - 1e-6);
  });

  it('forms a valve cavity, collapses it, and produces a rejoinder pressure spike', () => {
    const sim = new WaterHammerSim(cavConfig(-10));
    const valve = sim.nodes - 1;
    let formed = false;
    let collapsedAfterForming = false;
    let peakAfterCollapse = -Infinity;

    for (let i = 0; i < 400; i++) {
      sim.step(0);
      const cav = sim.cavityVolume[valve];
      if (cav > 1e-6) formed = true;
      if (formed && cav === 0 && !collapsedAfterForming) collapsedAfterForming = true;
      if (collapsedAfterForming) peakAfterCollapse = Math.max(peakAfterCollapse, sim.H[valve]);
    }

    // A cavity forms at the closed valve and later collapses (columns rejoin).
    expect(formed).toBe(true);
    expect(collapsedAfterForming).toBe(true);
    // The rejoining columns drive the valve head back above the reservoir head
    // (the rejoinder shock — the mechanism behind column-separation damage).
    expect(peakAfterCollapse).toBeGreaterThan(60);
  });
});

describe('Korteweg wave speed', () => {
  it('is below the free-fluid sound speed and rises with wall stiffness', () => {
    const K = 2.18e9;
    const rho = 998;
    const free = Math.sqrt(K / rho); // ~1478 m/s
    const steel = waveSpeed(K, rho, 0.15, 0.007, 200e9);
    const thicker = waveSpeed(K, rho, 0.15, 0.012, 200e9);
    expect(steel).toBeLessThan(free);
    expect(steel).toBeGreaterThan(900);
    expect(thicker).toBeGreaterThan(steel); // stiffer wall -> faster wave
  });
});
