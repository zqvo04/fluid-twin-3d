/**
 * UI/edit state (Zustand). Deliberately holds only low-frequency state:
 * the edited network, the current analysis result, selection, and view mode.
 * High-frequency simulation fields (Phase 3) will bypass this store and be
 * written straight to GPU buffers from the render loop.
 */

import { create } from 'zustand';
import { PipelineNetwork, NetworkNode, NetworkLink, NodeType, Vec3, emptyNetwork } from '../domain/network';
import { cloneSubAssembly } from '../domain/assembly';
import {
  addNode as addNodeOp,
  addLink as addLinkOp,
  makeNode,
  makeLink,
  removeElement,
  updateNode as updateNodeOp,
  updateLink as updateLinkOp,
  changeLinkKind as changeLinkKindOp,
  LinkDefaults,
} from '../domain/edit';
import { NominalSize, Schedule } from '../domain/catalog/pipes';
import { ValveType } from '../domain/catalog/valves';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { LabInputs, DEFAULT_LAB_INPUTS } from '../examples/waterHammerLab';
import { SolveSteadyResponse } from '../worker/protocol';

export type ViewMode = 'global' | 'detail';
export type SceneKind = 'network' | 'waterhammer';
export type EditTool = 'select' | 'place-junction' | 'place-reservoir' | 'connect' | 'delete';

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

  // Interactive builder state.
  editMode: boolean;
  editTool: EditTool;
  buildElevation: number;
  connectFrom: string | null;
  linkDefaults: LinkDefaults;

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

  // Builder actions.
  toggleEditMode: () => void;
  setEditTool: (t: EditTool) => void;
  setBuildElevation: (y: number) => void;
  setLinkDefaults: (patch: Partial<LinkDefaults>) => void;
  placeNodeAt: (position: Vec3) => void;
  handleNodeClick: (nodeId: string) => void;
  handleLinkClick: (linkId: string) => void;
  editNode: (id: string, patch: Partial<NetworkNode>) => void;
  editLink: (id: string, patch: Partial<NetworkLink>) => void;
  editLinkKind: (id: string, kind: 'pipe' | 'valve' | 'pump') => void;
  newBlankNetwork: () => void;
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

  editMode: false,
  editTool: 'select',
  buildElevation: 0,
  connectFrom: null,
  linkDefaults: { kind: 'pipe', nps: '4"', schedule: '40', valveType: 'gate' },

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

  // --- Builder ----------------------------------------------------------
  toggleEditMode: () =>
    set((s) => ({ editMode: !s.editMode, editTool: 'select', connectFrom: null, selectedId: null })),
  setEditTool: (t) => set({ editTool: t, connectFrom: null }),
  setBuildElevation: (y) => set({ buildElevation: y }),
  setLinkDefaults: (patch) => set({ linkDefaults: { ...get().linkDefaults, ...patch } }),

  placeNodeAt: (position) => {
    const { editTool, network } = get();
    const type: NodeType = editTool === 'place-reservoir' ? 'reservoir' : 'junction';
    const node = makeNode(type, position, network);
    set({ ...withStaleResult(addNodeOp(network, node)), selectedId: node.id });
  },

  handleNodeClick: (nodeId) => {
    const { editMode, editTool, network, connectFrom } = get();
    if (!editMode) {
      set({ selectedId: nodeId });
      return;
    }
    if (editTool === 'delete') {
      set({ ...withStaleResult(removeElement(network, nodeId)), selectedId: null });
      return;
    }
    if (editTool === 'connect') {
      if (!connectFrom) {
        set({ connectFrom: nodeId, selectedId: nodeId });
      } else if (connectFrom !== nodeId) {
        const link = makeLink(connectFrom, nodeId, get().linkDefaults, network);
        set({ ...withStaleResult(addLinkOp(network, link)), connectFrom: null, selectedId: link.id });
      }
      return;
    }
    set({ selectedId: nodeId });
  },

  handleLinkClick: (linkId) => {
    const { editMode, editTool, network } = get();
    if (editMode && editTool === 'delete') {
      set({ ...withStaleResult(removeElement(network, linkId)), selectedId: null });
      return;
    }
    set({ selectedId: linkId });
  },

  editNode: (id, patch) => set(withStaleResult(updateNodeOp(get().network, id, patch))),
  editLink: (id, patch) => set(withStaleResult(updateLinkOp(get().network, id, patch))),
  editLinkKind: (id, kind) =>
    set(withStaleResult(changeLinkKindOp(get().network, id, kind, get().linkDefaults))),

  newBlankNetwork: () => set({ ...withStaleResult(emptyNetwork(20)), selectedId: null, connectFrom: null }),
}));

// Re-export catalog types the UI needs alongside the store.
export type { NominalSize, Schedule, ValveType };
