import { Vector3 } from 'three';
import type { NpcId } from '../../game/simulation';
import type { StationId, Target } from '../../stores/gameStore';

// World units: a character is ~1.5 units tall. +z points south (toward the stream), +x east.

export const PLOT_SPACING = 2.2;
export const plotPosition = (x: number, z: number): [number, number, number] => [(x - 1.5) * PLOT_SPACING, 0, (z - 1.5) * PLOT_SPACING];

export const STREAM_Z = 7.6;
export const ROAD_X = -12;
export const FARM_BOUNDS = { minX: -9.5, maxX: 15, minZ: -17.5, maxZ: 6.2 };
/** Where the player may walk: the fenced farm plus the road strip outside the gate. */
export const WALK_BOUNDS = { minX: -14.5, maxX: 14.4, minZ: -17, maxZ: 6 };
export const GATE = { x: FARM_BOUNDS.minX, z0: -10.5, z1: -7.5 };

export const BUILDINGS = {
  office: { pos: [-3.5, 0, -13.5] as const, size: [5.5, 4.2] as const, label: 'Farmhouse & office' },
  warehouse: { pos: [4.5, 0, -13.5] as const, size: [6, 4.6] as const, label: 'Warehouse' },
  shed: { pos: [11, 0, -6] as const, size: [5.2, 4.4] as const, label: 'Processing shed' },
};
export const TANK_POS = [12.2, 0, -0.6] as const;
export const BOREHOLE_POS = [13.6, 0, 1.4] as const;
export const TRUCK_POS = [-7.2, 0, -4.5] as const;

export const NPC_SPOTS: Record<NpcId, { pos: [number, number, number]; facing: number; variant: string; tone: number }> = {
  baba: { pos: [-6.5, 0, -10], facing: Math.PI * 0.8, variant: 'male-f', tone: 1 },
  amaka: { pos: [9.8, 0, -3.3], facing: -Math.PI * 0.6, variant: 'female-d', tone: 2 },
  chinedu: { pos: [-5.2, 0, -2.8], facing: Math.PI * 0.25, variant: 'male-c', tone: 3 },
};

export const STATIONS: Record<StationId, { pos: [number, number, number]; radius: number; label: string }> = {
  office: { pos: [-3.5, 0, -10.8], radius: 1.7, label: 'Open the farm office (business)' },
  warehouse: { pos: [4.5, 0, -10.6], radius: 1.9, label: 'Check the warehouse (storage & sales)' },
  shed: { pos: [11, 0, -6], radius: 3, label: 'Work the processing shed (drying)' },
  tank: { pos: [11.6, 0, 2.2], radius: 2, label: 'Use the water tank & borehole' },
  truck: { pos: [-7.2, 0, -4.5], radius: 2.5, label: 'Load the truck (buyers & market)' },
};

export const PLOT_RADIUS = 1.25;
export const NPC_RADIUS = 1.6;

/** Axis-aligned blockers on the ground plane: [minX, minZ, maxX, maxZ]. */
export const COLLIDERS: [number, number, number, number][] = [
  ...[BUILDINGS.office, BUILDINGS.warehouse].map(b => [b.pos[0] - b.size[0] / 2, b.pos[2] - b.size[1] / 2, b.pos[0] + b.size[0] / 2, b.pos[2] + b.size[1] / 2] as [number, number, number, number]),
  [TANK_POS[0] - 0.9, TANK_POS[2] - 0.9, TANK_POS[0] + 0.9, TANK_POS[2] + 0.9],
  [TRUCK_POS[0] - 1.2, TRUCK_POS[2] - 2.3, TRUCK_POS[0] + 1.2, TRUCK_POS[2] + 2.3],
  [BUILDINGS.shed.pos[0] - 1.9, BUILDINGS.shed.pos[2] - 1.4, BUILDINGS.shed.pos[0] + 1.9, BUILDINGS.shed.pos[2] + 0.6],
];

export function targetPosition(t: Target, plots: { x: number; z: number }[]): Vector3 {
  if (t.kind === 'plot') return new Vector3(...plotPosition(plots[t.id].x, plots[t.id].z));
  if (t.kind === 'npc') return new Vector3(...NPC_SPOTS[t.id].pos);
  return new Vector3(...STATIONS[t.id].pos);
}

export function targetRadius(t: Target) {
  return t.kind === 'plot' ? PLOT_RADIUS : t.kind === 'npc' ? NPC_RADIUS : STATIONS[t.id].radius;
}
