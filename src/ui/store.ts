/**
 * UI/edit state (Zustand). Deliberately holds only low-frequency state:
 * the edited network, the current analysis result, selection, and view mode.
 * High-frequency simulation fields (Phase 3) will bypass this store and be
 * written straight to GPU buffers from the render loop.
 */

import { create } from 'zustand';
import { PipelineNetwork } from '../domain/network';
import { cloneSubAssembly } from '../domain/assembly';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { LabInputs, DEFAULT_LAB_INPUTS } from '../examples/waterHammerLab';
import { SolveSteadyResponse } from '../worker/protocol';

export type ViewMode = 'global' | 'detail';
export type SceneKind = 'network' | 'waterhammer';

export interface AnalysisResult {
  converged: boolean;
  iterations: number;
  residual: number;
  heads: Map<string, number>;
  links: Map<string, { flow: number; velocity: number; headLoss: number }>;
}

interface AppState {
  network: PipelineNetwork;
  viewMode: ViewMode;
  selectedId: string | null;
  result: AnalysisResult | null;
  solving: boolean;

  // Water Hammer Lab (transient) controls.
  scene: SceneKind;
  labInputs: LabInputs;
  closureTime: number;
  stepsPerFrame: number;
  periods: number;

  /** Animate flow particles in the Global view. */
  flowViz: boolean;

  setViewMode: (m: ViewMode) => void;
  select: (id: string | null) => void;
  setSolving: (v: boolean) => void;
  applyResult: (r: SolveSteadyResponse) => void;

  setNetwork: (net: PipelineNetwork) => void;
  updateValveOpening: (linkId: string, opening: number) => void;
  updatePumpSpeed: (linkId: string, ratio: number) => void;
  cloneFirstSkid: () => void;

  setScene: (s: SceneKind) => void;
  setLabInputs: (patch: Partial<LabInputs>) => void;
  setClosureTime: (t: number) => void;
  setStepsPerFrame: (n: number) => void;
  toggleFlowViz: () => void;
}

/** Editing the network invalidates any prior analysis result. */
function withStaleResult(net: PipelineNetwork) {
  return { network: net, result: null };
}

export const useAppStore = create<AppState>((set, get) => ({
  network: pumpSkidNetwork(),
  viewMode: 'global',
  selectedId: null,
  result: null,
  solving: false,

  scene: 'network',
  labInputs: DEFAULT_LAB_INPUTS,
  closureTime: 0.5,
  stepsPerFrame: 2,
  periods: 8,
  flowViz: true,

  setViewMode: (m) => set({ viewMode: m }),
  select: (id) => set({ selectedId: id }),
  setSolving: (v) => set({ solving: v }),
  applyResult: (r) =>
    set({
      solving: false,
      result: {
        converged: r.converged,
        iterations: r.iterations,
        residual: r.residual,
        heads: new Map(r.heads),
        links: new Map(r.links),
      },
    }),

  setNetwork: (net) => set({ ...withStaleResult(net), selectedId: null }),

  updateValveOpening: (linkId, opening) => {
    const net = get().network;
    const links = net.links.map((l) =>
      l.id === linkId && l.kind === 'valve' ? { ...l, opening } : l,
    );
    set(withStaleResult({ ...net, links }));
  },

  updatePumpSpeed: (linkId, ratio) => {
    const net = get().network;
    const links = net.links.map((l) =>
      l.id === linkId && l.kind === 'pump' ? { ...l, speedRatio: ratio } : l,
    );
    set(withStaleResult({ ...net, links }));
  },

  cloneFirstSkid: () => {
    const net = get().network;
    if (net.subAssemblies.length === 0) return;
    const n = net.subAssemblies.length + 1;
    const { network } = cloneSubAssembly(net, net.subAssemblies[0].id, {
      idSuffix: `__${n}`,
      offset: { x: 0, y: 0, z: 14 * (n - 1) },
      name: `Pump Skid #${n}`,
    });
    set({ ...withStaleResult(network), selectedId: null });
  },

  setScene: (s) => set({ scene: s }),
  setLabInputs: (patch) => set({ labInputs: { ...get().labInputs, ...patch } }),
  setClosureTime: (t) => set({ closureTime: t }),
  setStepsPerFrame: (n) => set({ stepsPerFrame: n }),
  toggleFlowViz: () => set({ flowViz: !get().flowViz }),
}));
