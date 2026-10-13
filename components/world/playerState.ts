import { Vector3 } from 'three';
import type { Target } from '../../stores/gameStore';

/**
 * Per-frame player data lives outside React/Zustand so movement doesn't re-render the tree.
 * The camera, proximity checks and click-to-move all read and write this object.
 */
export const player = {
  pos: new Vector3(0, 0, -7.5),
  heading: 0,
  /** Click-to-move destination, if any. */
  goal: null as Vector3 | null,
  /** Interact with this once the player arrives at `goal`. */
  goalTarget: null as Target | null,
  /** Seconds left in a one-shot action animation (watering, harvesting...). */
  busy: 0,
};

export const ZOOM_MIN = 0.55, ZOOM_MAX = 1.7;
/** One press of a rotate key or button turns the camera by 45 degrees. */
export const ROTATE_STEP = Math.PI / 4;

export type CameraMode = 'follow' | 'inspect';

/** Camera framing, shared by the 3D camera rig, wheel/pinch/drag gestures and the HUD camera buttons. */
export const view = {
  zoom: 1.25,
  /**
   * Where the camera wants to be around the player, in radians. 0 = standing south of the player looking north;
   * positive values turn the world clockwise on screen. Never wrapped, so easing never takes the long way round.
   */
  yaw: 0,
  /** The eased heading the camera is actually at this frame. Movement and world prompts follow this one. */
  yawNow: 0,
  /** Taps are ignored until this timestamp (ms) so the end of a pinch doesn't also walk the player. */
  ignoreTapsUntil: 0,
  /** Camera mode: follow the farmer or freely inspect the whole farm. */
  mode: 'follow' as CameraMode,
  /** Focal center when orbiting in inspection mode. */
  inspectFocus: new Vector3(2, 0, -5),
};

export function setCameraMode(mode: CameraMode) {
  view.mode = mode;
  if (mode === 'inspect') {
    view.inspectFocus.copy(player.pos);
  }
}

export function toggleCameraMode() {
  setCameraMode(view.mode === 'inspect' ? 'follow' : 'inspect');
}

/** Multiply the camera distance: factor < 1 zooms in, > 1 zooms out. */
export function zoomBy(factor: number) {
  view.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
}

/** Free rotation (mouse drag, two-finger twist). */
export function rotateBy(radians: number) {
  view.yaw += radians;
}

/** Turn to the next 45 degree heading: dir -1 turns the world anticlockwise, +1 clockwise. */
export function rotateStep(dir: -1 | 1) {
  view.yaw = (Math.round(view.yaw / ROTATE_STEP) + dir) * ROTATE_STEP;
}

/** Back to the nearest "north is up" heading. */
export function faceNorth() {
  view.yaw = Math.round(view.yaw / (Math.PI * 2)) * Math.PI * 2;
}

export function walkTo(point: Vector3, target: Target | null = null) {
  if (performance.now() < view.ignoreTapsUntil) return;
  player.goal = point.clone().setY(0);
  player.goalTarget = target;
}

if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __player: typeof player }).__player = player;
