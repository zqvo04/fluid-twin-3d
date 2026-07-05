/**
 * UI/edit state (Zustand). Deliberately holds only low-frequency state:
 * the edited network, the current analysis result, selection, and view mode.
 * High-frequency simulation fields (Phase 3) will bypass this store and be
 * written straight to GPU buffers from the render loop.
 */

import { create } from 'zustand';
import { PipelineNetwork } from '../domain/network';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { SolveSteadyResponse } from '../worker/protocol';

export type ViewMode = 'global' | 'detail';

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

  setViewMode: (m: ViewMode) => void;
  select: (id: string | null) => void;
  setSolving: (v: boolean) => void;
  applyResult: (r: SolveSteadyResponse) => void;
}

export const useAppStore = create<AppState>((set) => ({
  network: pumpSkidNetwork(),
  viewMode: 'global',
  selectedId: null,
  result: null,
  solving: false,

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
}));
