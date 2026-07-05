# FluidTwin 3D

Industrial 3D pipeline digital twin and vulnerability analysis simulator. A
browser-based engineering tool for validating plant hydraulics and finding
transient vulnerabilities (water hammer, cavitation, pipe overstress) before
they happen.

See [`docs/ARCHITECTURE_AND_ROADMAP.md`](docs/ARCHITECTURE_AND_ROADMAP.md) for
the full physics/architecture design and the 7-phase roadmap.

## Status

| Phase | Scope | State |
|---|---|---|
| **0** | Scaffolding (Vite + React + R3F + Zustand + Web Worker + Vitest) | ✅ done |
| **1** | Domain core + steady-state solver (GGA / Newton-Raphson) | ✅ done |
| **2** | Modular assembly + InstancedMesh Global View + pump BEP warning | ✅ done |
| **3** | Transient MOC water-hammer engine + streamed Water Hammer Lab | ✅ done |
| **4** | Vulnerability analysis (cavitation, B31.3, NPSH, erosion) + navigation | ✅ done |
| 5 | Detail View, scenarios, surge-protection design loop | next |
| 6 | Engineering reports + example plants | planned |

## What Phase 1 delivers

A physics core that is fully decoupled from React/Three.js and independently
verified against textbook benchmarks:

- **Part catalog with real spec data** — ASME B36.10M pipe dimensions (2/4/6/8",
  Sch 40/80), Crane TP-410 K-factors for four valve types (gate, globe, ball,
  butterfly) with their inherent Cv characteristic curves, fitting losses, and
  a fitted centrifugal pump model (H-Q curve, BEP, NPSHr, inertia).
- **Temperature-dependent water properties** (density, viscosity, vapor
  pressure, bulk modulus) from 0–150 °C.
- **Steady-state solver** — the Global Gradient Algorithm (Todini & Pilati),
  the method behind EPANET: nonlinear network solve with gravity, Churchill
  friction (all-regime), pump curves, and partial-open valves, solved by Newton
  iteration on a symmetric positive-definite head system.
- **A minimal 3D Global View** — the demo pump-skid network rendered in R3F with
  the head field colored blue→red, plus a control panel that runs the analysis
  in the Web Worker and inspects component results.

## What Phase 2 adds

- **Modular assembly** — a SubAssembly (pump skid) can be cloned with fresh IDs
  and a spatial offset, then wired into a larger end-to-end network.
- **Project save/load** — the network serializes to versioned JSON with
  validation on load.
- **Connector checks** — flags NPS size changes at a node with no reducer.
- **InstancedMesh Global View** — every pipe draws in a single call; a
  procedural 480-pipe grid demonstrates the performance target (verified to
  render and solve in-browser with no errors).
- **Pump BEP warning (P4)** — classifies each pump's duty point against the
  70–120% BEP window (low-flow / ok / overload).
- **Live parameter editing** — valve opening and pump speed sliders in the
  inspector; edits invalidate the stale result so a re-solve is one click away.

## What Phase 3 adds

The **Water Hammer Lab** — the canonical reservoir → pipe → valve transient,
solved live by the Method of Characteristics:

- **MOC solver** (`physics/transient.ts`) — the compressible unsteady flow
  equations solved along characteristics at Courant number 1, with reservoir,
  valve-closure, and friction boundary conditions. Verified against the
  Joukowsky surge `a·V0/g`, the `4L/a` wave period, and gradual-closure
  attenuation.
- **Korteweg wave speed** — celerity from the fluid bulk modulus and the pipe's
  elastic wall, so each size/schedule carries the wave differently.
- **Worker streaming** — the transient runs in the Web Worker and streams
  pressure frames (transferred buffers) to the render thread; the 3D scene and
  the pressure chart read them in their own loops, bypassing React (the Phase 3
  compute/render split; a `SharedArrayBuffer` upgrade is a drop-in for
  full-network fields).
- **Live visualization** — the pipe deflects and recolors as the pressure wave
  travels back and forth; a red ribbon traces the worst-case (peak-head)
  envelope; a pressure-vs-time chart at the valve shows the surge against the
  Joukowsky reference lines. Sub-atmospheric head raises a column-separation /
  cavitation warning (modeled fully in Phase 4).

## What Phase 4 adds

Vulnerability analysis that turns the transient field into engineering
verdicts, plus assembly-friendly navigation:

- **Column separation / cavitation (DVCM)** — when the head would fall below the
  vapor level, a Discrete Vapor Cavity Model pins it and tracks a cavity volume
  from the upstream/downstream flow mismatch; on refill the cavity collapses and
  the rejoining columns produce a pressure spike. Verified: cavity forms at a
  closed valve, collapses, and the rejoinder drives the head *above* the initial
  surge — the mechanism behind real column-separation damage. Rendered as vapor
  bubbles at the affected sections.
- **ASME B31.3 hoop stress** — sustained and occasional (1.33 S) utilization from
  the steady and peak-surge pressure envelope, with a burst-risk warning.
- **Pump NPSH margin** and **API RP 14E erosional velocity** checks on the steady
  network, surfaced in the warnings panel.
- **Navigation** — CameraControls (orbit + pan + dolly with damping), view
  presets (Fit / Iso / Top / Front / Side), and WASD/QE + arrow-key movement, so
  the model can be inspected and assembled, not just spun.

## Deployment

Ships as a static SPA (all computation runs in the browser worker), so it hosts
free on either target:

- **Cloudflare Pages** (production target): build `npm run build`, output
  `dist`; `public/_headers` sets COOP/COEP.
- **Vercel** (used for live dev previews): `vercel.json` sets the same headers.

COOP/COEP make the page cross-origin isolated so `SharedArrayBuffer` is
available; the app is fully self-contained to stay COEP-safe.

## Verification

The steady solver is cross-checked against an **independent** scalar reference
(direct Darcy-Weisbach + bisection, a separate code path from the matrix
assembly):

- Churchill friction vs Moody-chart points (laminar 64/Re, smooth, rough).
- Single pipe between two reservoirs — head loss = reservoir difference; flow
  matches the reference to 5 decimals.
- **Three-reservoir problem** — mass balance and energy satisfied at the
  junction; junction head matches an independent scalar solve.
- **Pump/system duty point** — matches an independent scalar intersection solve.
- Valve throttling monotonically reduces flow.

```bash
npm install
npm test        # 22 tests: friction, catalog, steady-solver benchmarks
npm run dev     # launch the 3D app
npm run build   # typecheck + production bundle (worker split into its own chunk)
```

## Project layout

```
src/
  domain/      pure engineering model (units, fluid, catalog, network graph)
  physics/     solver core: linalg, Churchill friction, resistance, GGA solver
  worker/      simulation worker + message protocol
  scene/       react-three-fiber Global View + colormap
  ui/          Zustand store, worker hook, control panel
  examples/    demo networks (pump skid → elevated tank)
```

The `domain` and `physics` layers import nothing from React or Three.js, so the
entire engine runs and is tested under Node.
