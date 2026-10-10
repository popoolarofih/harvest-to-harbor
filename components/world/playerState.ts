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

/** Camera framing, shared by the 3D camera rig, wheel/pinch gestures and the HUD zoom buttons. */
export const view = {
  zoom: 1.25,
  /** Taps are ignored until this timestamp (ms) so the end of a pinch doesn't also walk the player. */
  ignoreTapsUntil: 0,
};

/** Multiply the camera distance: factor < 1 zooms in, > 1 zooms out. */
export function zoomBy(factor: number) {
  view.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
}

export function walkTo(point: Vector3, target: Target | null = null) {
  if (performance.now() < view.ignoreTapsUntil) return;
  player.goal = point.clone().setY(0);
  player.goalTarget = target;
}

if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __player: typeof player }).__player = player;
