/**
 * Camera command bus. The R3F CameraRig registers its CameraControls instance
 * and a bounds provider here; the DOM control panel calls the preset helpers.
 * This decouples the 2D UI buttons from the 3D controls without prop drilling.
 *
 * Presets and keyboard nudges make the scene navigable for assembly work
 * (pan, orbit, dolly, framing) — a step toward the Phase 5 Global/Detail
 * fly-to.
 */

export type ViewPreset = 'iso' | 'top' | 'front' | 'side' | 'fit';

/** Minimal surface of the camera-controls instance we drive. */
export interface CamControls {
  setLookAt(
    px: number,
    py: number,
    pz: number,
    tx: number,
    ty: number,
    tz: number,
    enableTransition?: boolean,
  ): Promise<void>;
  truck(x: number, y: number, enableTransition?: boolean): void;
  forward(distance: number, enableTransition?: boolean): void;
  rotate(azimuth: number, polar: number, enableTransition?: boolean): void;
}

export interface SceneBounds {
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

let instance: CamControls | null = null;
let boundsFn: () => SceneBounds = () => ({ cx: 10, cy: 10, cz: 0, radius: 20 });

export function registerCameraControls(c: CamControls | null, bounds: () => SceneBounds) {
  instance = c;
  boundsFn = bounds;
}

/**
 * Fly the camera to focus a point (a selected component). This is the core of
 * the Global→Detail transition: click a component or an alarm and the camera
 * smoothly frames it.
 */
export function flyTo(x: number, y: number, z: number, focusRadius = 4) {
  if (!instance) return;
  const d = Math.max(focusRadius, 1.5) * 3.2;
  instance.setLookAt(x + d * 0.6, y + d * 0.5, z + d * 0.6, x, y, z, true);
}

/** Frame an explicit bounding sphere (used for section auto-fit, where the
 *  bounds must be exact and not depend on the command-bus registration timing). */
export function frameBounds(b: SceneBounds) {
  if (!instance) return;
  const d = Math.max(b.radius, 5) * 2.4;
  instance.setLookAt(b.cx + d * 0.7, b.cy + d * 0.6, b.cz + d * 0.7, b.cx, b.cy, b.cz, true);
}

export function applyPreset(preset: ViewPreset) {
  if (!instance) return;
  const { cx, cy, cz, radius } = boundsFn();
  const d = Math.max(radius, 5) * 2.4;
  switch (preset) {
    case 'top':
      instance.setLookAt(cx, cy + d * 1.6, cz + 0.001, cx, cy, cz, true);
      break;
    case 'front':
      instance.setLookAt(cx, cy, cz + d, cx, cy, cz, true);
      break;
    case 'side':
      instance.setLookAt(cx + d, cy, cz, cx, cy, cz, true);
      break;
    case 'iso':
    case 'fit':
      instance.setLookAt(cx + d * 0.7, cy + d * 0.6, cz + d * 0.7, cx, cy, cz, true);
      break;
  }
}

/** Keyboard nudge, mapped from a KeyboardEvent code. Returns true if handled. */
export function keyboardNudge(code: string): boolean {
  const c = instance;
  if (!c) return false;
  const { radius } = boundsFn();
  const step = Math.max(radius, 5) * 0.12;
  const rot = 0.18;
  switch (code) {
    case 'KeyW':
      c.forward(step, true);
      return true;
    case 'KeyS':
      c.forward(-step, true);
      return true;
    case 'KeyA':
      c.truck(-step, 0, true);
      return true;
    case 'KeyD':
      c.truck(step, 0, true);
      return true;
    case 'KeyQ':
      c.truck(0, step, true);
      return true;
    case 'KeyE':
      c.truck(0, -step, true);
      return true;
    case 'ArrowLeft':
      c.rotate(-rot, 0, true);
      return true;
    case 'ArrowRight':
      c.rotate(rot, 0, true);
      return true;
    case 'ArrowUp':
      c.rotate(0, -rot, true);
      return true;
    case 'ArrowDown':
      c.rotate(0, rot, true);
      return true;
    default:
      return false;
  }
}
