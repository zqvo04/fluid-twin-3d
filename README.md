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
| 2 | 3D assembly editor + Global View | next |
| 3 | Transient MOC engine + SharedArrayBuffer pipeline | planned |
| 4 | Vulnerability analysis + dynamic visualization | planned |
| 5 | Detail View, scenarios, surge-protection design loop | planned |
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
