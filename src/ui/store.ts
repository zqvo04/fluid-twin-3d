/**
 * UI/edit state (Zustand). Deliberately holds only low-frequency state:
 * the edited network, the current analysis result, selection, and view mode.
 * High-frequency simulation fields (Phase 3) will bypass this store and be
 * written straight to GPU buffers from the render loop.
 */

import { create } from 'zustand';
import { PipelineNetwork, NetworkNode, NetworkLink, NodeType, Vec3, emptyNetwork } from '../domain/network';
import {
  makeSection,
  addSection as addSectionOp,
  updateSection as updateSectionOp,
  removeSection as removeSectionOp,
  assignNodesToSection,
} from '../domain/sections';
import { Route, PLANT_ROUTE, parseHash, formatHash, routesEqual } from './routing';
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
  splitPipe as splitPipeOp,
  LinkDefaults,
} from '../domain/edit';
import { NominalSize, Schedule } from '../domain/catalog/pipes';
import { ValveType } from '../domain/catalog/valves';
import { pumpSkidNetwork } from '../examples/demoNetworks';
import { LabInputs, DEFAULT_LAB_INPUTS } from '../examples/waterHammerLab';
import { SolveSteadyResponse } from '../worker/protocol';

export type ViewMode = 'global' | 'detail';
export type SceneKind = 'network' | 'waterhammer';
export type EditTool = 'select' | 'run' | 'place-junction' | 'place-reservoir' | 'connect' | 'delete';

export interface AnalysisResult {
  converged: boolean;
  iterations: number;
  residual: number;
  heads: Map<string, number>;
  links: Map<string, { flow: number; velocity: number; headLoss: number }>;
  /**
   * Section this result was solved in isolation for, with its boundaries pinned
   * as fixed heads. null/undefined = a full-network solve. The UI badges a
   * section-scoped result so it is never mistaken for the whole plant.
   */
  scopeSectionId?: string | null;
}

interface AppState {
  network: PipelineNetwork;
  viewMode: ViewMode;
  selectedId: string | null;
  result: AnalysisResult | null;
  solving: boolean;

  // Multi-view platform: which page is shown and which section is active.
  route: Route;
  /** Active section id when on a section page, else null (plant overview). */
  activeSectionId: string | null;

  // Water Hammer Lab (transient) controls.
  scene: SceneKind;
  labInputs: LabInputs;
  closureTime: number;
  stepsPerFrame: number;
  periods: number;

  /** Animate flow particles in the Global view. */
  flowViz: boolean;
  /** On the plant overview, tint the scene by section instead of head field. */
  sectionOverlay: boolean;

  // Interactive builder state.
  editMode: boolean;
  editTool: EditTool;
  buildElevation: number;
  connectFrom: string | null;
  /** Previous node in an in-progress "Pipe Run" chain. */
  runFrom: string | null;
  linkDefaults: LinkDefaults;

  setViewMode: (m: ViewMode) => void;
  select: (id: string | null) => void;
  setSolving: (v: boolean) => void;
  applyResult: (r: SolveSteadyResponse, scopeSectionId?: string | null) => void;

  // Routing + sections.
  navigate: (route: Route) => void;
  syncFromHash: () => void;
  createSection: () => void;
  renameSection: (id: string, name: string) => void;
  recolorSection: (id: string, color: string) => void;
  deleteSection: (id: string) => void;
  assignToSection: (nodeId: string, sectionId: string) => void;

  setNetwork: (net: PipelineNetwork) => void;
  updateValveOpening: (linkId: string, opening: number) => void;
  updatePumpSpeed: (linkId: string, ratio: number) => void;
  cloneFirstSkid: () => void;

  setScene: (s: SceneKind) => void;
  setLabInputs: (patch: Partial<LabInputs>) => void;
  setClosureTime: (t: number) => void;
  setStepsPerFrame: (n: number) => void;
  toggleFlowViz: () => void;
  toggleSectionOverlay: () => void;

  // Builder actions.
  toggleEditMode: () => void;
  setEditTool: (t: EditTool) => void;
  setBuildElevation: (y: number) => void;
  setLinkDefaults: (patch: Partial<LinkDefaults>) => void;
  placeNodeAt: (position: Vec3) => void;
  runClickAt: (position: Vec3) => void;
  cancelBuild: () => void;
  /** Raise/lower the build work-plane by delta [m] (snaps to nearby heights). */
  nudgeBuildHeight: (delta: number) => void;
  /** Move a node vertically by delta [m] (turns its pipes into risers). */
  nudgeNodeElevation: (id: string, delta: number) => void;
  handleNodeClick: (nodeId: string) => void;
  handleLinkClick: (linkId: string, point?: Vec3) => void;
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

  route: typeof window !== 'undefined' ? parseHash(window.location.hash) : PLANT_ROUTE,
  activeSectionId:
    typeof window !== 'undefined' ? parseHash(window.location.hash).sectionId : null,

  scene: 'network',
  labInputs: DEFAULT_LAB_INPUTS,
  closureTime: 0.5,
  stepsPerFrame: 2,
  periods: 8,
  flowViz: true,
  sectionOverlay: true,

  editMode: false,
  editTool: 'select',
  buildElevation: 0,
  connectFrom: null,
  runFrom: null,
  linkDefaults: { kind: 'pipe', nps: '4"', schedule: '40', valveType: 'gate' },

  setViewMode: (m) => set({ viewMode: m }),
  select: (id) => set({ selectedId: id }),
  setSolving: (v) => set({ solving: v }),
  applyResult: (r, scopeSectionId = null) =>
    set({
      solving: false,
      result: {
        converged: r.converged,
        iterations: r.iterations,
        residual: r.residual,
        heads: new Map(r.heads),
        links: new Map(r.links),
        scopeSectionId,
      },
    }),

  navigate: (route) => {
    if (typeof window !== 'undefined') {
      const next = formatHash(route);
      if (window.location.hash !== next) window.location.hash = next;
    }
    set({ route, activeSectionId: route.sectionId, selectedId: null });
  },

  syncFromHash: () => {
    if (typeof window === 'undefined') return;
    const route = parseHash(window.location.hash);
    if (!routesEqual(route, get().route)) {
      set({ route, activeSectionId: route.sectionId, selectedId: null });
    }
  },

  createSection: () => {
    const net = get().network;
    const section = makeSection(net);
    set({ ...withStaleResult(addSectionOp(net, section)) });
    get().navigate({ page: 'section', sectionId: section.id });
  },

  renameSection: (id, name) => set({ network: updateSectionOp(get().network, id, { name }) }),
  recolorSection: (id, color) => set({ network: updateSectionOp(get().network, id, { color }) }),

  deleteSection: (id) => {
    set({ ...withStaleResult(removeSectionOp(get().network, id)) });
    if (get().activeSectionId === id) get().navigate(PLANT_ROUTE);
  },

  assignToSection: (nodeId, sectionId) =>
    set({ ...withStaleResult(assignNodesToSection(get().network, [nodeId], sectionId)) }),

  setNetwork: (net) => {
    // A fresh network may not contain the active section; return to the plant
    // overview so we never strand the user on an empty section page.
    if (typeof window !== 'undefined' && window.location.hash !== formatHash(PLANT_ROUTE)) {
      window.location.hash = formatHash(PLANT_ROUTE);
    }
    set({ ...withStaleResult(net), selectedId: null, route: PLANT_ROUTE, activeSectionId: null });
  },

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
  toggleSectionOverlay: () => set({ sectionOverlay: !get().sectionOverlay }),

  // --- Builder ----------------------------------------------------------
  toggleEditMode: () =>
    set((s) => ({ editMode: !s.editMode, editTool: 'select', connectFrom: null, runFrom: null, selectedId: null })),
  setEditTool: (t) => set({ editTool: t, connectFrom: null, runFrom: null }),
  setBuildElevation: (y) => set({ buildElevation: y }),
  setLinkDefaults: (patch) => set({ linkDefaults: { ...get().linkDefaults, ...patch } }),
  cancelBuild: () => set({ connectFrom: null, runFrom: null }),

  nudgeBuildHeight: (delta) => {
    const { network, buildElevation } = get();
    // Snap the work-plane to a nearby existing node height for easy alignment.
    let y = buildElevation + delta;
    for (const n of network.nodes) {
      if (Math.abs(n.position.y - y) < 0.8) {
        y = n.position.y;
        break;
      }
    }
    set({ buildElevation: Math.round(y * 10) / 10 });
  },

  nudgeNodeElevation: (id, delta) => {
    const { network } = get();
    const node = network.nodes.find((n) => n.id === id);
    if (!node) return;
    const newY = node.position.y + delta;
    const patch: Partial<NetworkNode> = { position: { ...node.position, y: newY } };
    // A tank sitting at its free surface rises with its elevation.
    if (node.type === 'reservoir' && (node.fixedHead ?? node.position.y) === node.position.y) {
      patch.fixedHead = newY;
    }
    set(withStaleResult(updateNodeOp(network, id, patch)));
  },

  placeNodeAt: (position) => {
    const { editTool, network, activeSectionId } = get();
    const type: NodeType = editTool === 'place-reservoir' ? 'reservoir' : 'junction';
    // On a section page, new elements are born into that section.
    const node = { ...makeNode(type, position, network), sectionId: activeSectionId ?? undefined };
    set({ ...withStaleResult(addNodeOp(network, node)), selectedId: node.id });
  },

  // Pipe Run: click points to draw a connected pipeline. Snaps to a nearby
  // existing node so runs can branch off or close loops.
  runClickAt: (position) => {
    const { network, runFrom, linkDefaults, activeSectionId } = get();
    const SNAP = 1.6;
    const near = network.nodes.find((n) => {
      const dx = n.position.x - position.x;
      const dy = n.position.y - position.y;
      const dz = n.position.z - position.z;
      return dx * dx + dy * dy + dz * dz < SNAP * SNAP;
    });

    let net = network;
    let targetId: string;
    if (near) {
      targetId = near.id;
    } else {
      const node = { ...makeNode('junction', position, net), sectionId: activeSectionId ?? undefined };
      net = addNodeOp(net, node);
      targetId = node.id;
    }
    if (runFrom && runFrom !== targetId) {
      const link = makeLink(runFrom, targetId, linkDefaults, net);
      net = addLinkOp(net, link);
    }
    set({ ...withStaleResult(net), runFrom: targetId, selectedId: targetId });
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
    if (editTool === 'run') {
      const { runFrom, linkDefaults } = get();
      if (runFrom && runFrom !== nodeId) {
        const link = makeLink(runFrom, nodeId, linkDefaults, network);
        set({ ...withStaleResult(addLinkOp(network, link)), runFrom: nodeId, selectedId: nodeId });
      } else {
        set({ runFrom: nodeId, selectedId: nodeId });
      }
      return;
    }
    set({ selectedId: nodeId });
  },

  handleLinkClick: (linkId, point) => {
    const { editMode, editTool, network } = get();
    if (editMode && editTool === 'delete') {
      set({ ...withStaleResult(removeElement(network, linkId)), selectedId: null });
      return;
    }
    // Cities-Skylines tap-in: in Run mode, clicking a pipe splits it at the
    // click point and continues the run from the new junction.
    if (editMode && editTool === 'run' && point) {
      const link = network.links.find((l) => l.id === linkId);
      if (link && link.kind === 'pipe') {
        const { network: net2, newNodeId } = splitPipeOp(network, linkId, point);
        const { runFrom, linkDefaults } = get();
        let net3 = net2;
        if (runFrom && newNodeId && runFrom !== newNodeId) {
          net3 = addLinkOp(net2, makeLink(runFrom, newNodeId, linkDefaults, net2));
        }
        set({ ...withStaleResult(net3), runFrom: newNodeId, selectedId: newNodeId });
        return;
      }
    }
    set({ selectedId: linkId });
  },

  editNode: (id, patch) => set(withStaleResult(updateNodeOp(get().network, id, patch))),
  editLink: (id, patch) => set(withStaleResult(updateLinkOp(get().network, id, patch))),
  editLinkKind: (id, kind) =>
    set(withStaleResult(changeLinkKindOp(get().network, id, kind, get().linkDefaults))),

  newBlankNetwork: () => {
    if (typeof window !== 'undefined' && window.location.hash !== formatHash(PLANT_ROUTE)) {
      window.location.hash = formatHash(PLANT_ROUTE);
    }
    set({
      ...withStaleResult(emptyNetwork(20)),
      selectedId: null,
      connectFrom: null,
      route: PLANT_ROUTE,
      activeSectionId: null,
    });
  },
}));

// Re-export catalog types the UI needs alongside the store.
export type { NominalSize, Schedule, ValveType };
