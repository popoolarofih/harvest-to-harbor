'use client';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import { currentStep } from '../../game/tutorial';
import { useGameStore, type Target } from '../../stores/gameStore';
import { reducedMotion, useSession } from '../../stores/session';
import { describeTarget } from '../hud/WorldCards';
import { NPC_SPOTS, STATIONS, plotPosition } from './layout';
import { view } from './playerState';

/** "plot:5" / "npc:baba" / "station:warehouse": a string, so the selector only re-renders when the target moves. */
function beaconKey(s: ReturnType<typeof useGameStore.getState>): string | null {
  const step = currentStep(s.tutorial);
  if (!step?.world || s.story) return null;
  const t = step.world(s.plots);
  return t ? `${t.kind}:${t.id}` : null;
}

const BEACON = {
  plot: { radius: 1.45, arrow: 2.1 },
  npc: { radius: 0.85, arrow: 3.45 },
  station: { radius: 1.5, arrow: 2.8 },
} as const;

/** A gold ring and a bobbing arrow over whatever the current tutorial step is about. */
export function TutorialBeacon() {
  const key = useGameStore(beaconKey);
  const playing = useSession(s => s.phase === 'playing');
  const plots = useGameStore(s => s.plots);
  const arrow = useRef<Group>(null), ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const still = reducedMotion(), t = clock.elapsedTime;
    if (arrow.current) arrow.current.position.y = arrow.current.userData.base + (still ? 0 : Math.sin(t * 3) * 0.15);
    if (ring.current) ring.current.scale.setScalar(still ? 1 : 1 + (Math.sin(t * 3) + 1) * 0.06);
  });
  if (!key || !playing) return null;
  const [kind, id] = key.split(':') as [keyof typeof BEACON, string];
  const pos = kind === 'plot' ? plotPosition(plots[Number(id)].x, plots[Number(id)].z) : kind === 'npc' ? NPC_SPOTS[id as keyof typeof NPC_SPOTS].pos : STATIONS[id as keyof typeof STATIONS].pos;
  const b = BEACON[kind];
  return (
    <group position={[pos[0], 0, pos[2]]}>
      <mesh ref={ring} position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[b.radius, b.radius + 0.1, 40]} />
        <meshBasicMaterial color="#ffd25a" transparent opacity={0.9} />
      </mesh>
      <group ref={arrow} position={[0, b.arrow, 0]} userData={{ base: b.arrow }}>
        <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.24, 0.5, 12]} /><meshBasicMaterial color="#ffd25a" /></mesh>
      </group>
    </group>
  );
}

/** Where the prompt sits: [x, y, z, offset]. It's pushed `offset` toward the camera so it never hides the thing's label. */
function promptAnchor(t: Target, plots: { x: number; z: number }[]): [number, number, number, number] {
  if (t.kind === 'plot') { const [x, , z] = plotPosition(plots[t.id].x, plots[t.id].z); return [x, 0.25, z, 1.2]; }
  if (t.kind === 'npc') { const [x, , z] = NPC_SPOTS[t.id].pos; return [x, 0.1, z, 0.9]; }
  const [x, , z] = STATIONS[t.id].pos;
  return [x, 0.4, z, 0.8];
}

/** "[E] Talk to Baba Musa", drawn next to the nearby object. Positioned by drei every frame without React renders. */
export function WorldPrompt() {
  const nearby = useGameStore(s => s.nearby);
  const label = useGameStore(s => (s.nearby ? describeTarget(s.nearby, s.plots) : ''));
  const busy = useGameStore(s => s.selectedPlot !== null || !!s.talkingTo || s.tankOpen || s.panel !== 'farm' || !!s.story);
  const playing = useSession(s => s.phase === 'playing');
  const plots = useGameStore(s => s.plots);
  const group = useRef<Group>(null);
  const anchor = nearby ? promptAnchor(nearby, plots) : null;
  // Follow the camera as it turns, so the prompt stays on the side facing the player's view.
  useFrame(() => {
    if (!group.current || !anchor) return;
    const [x, y, z, o] = anchor;
    group.current.position.set(x + Math.sin(view.yawNow) * o, y, z + Math.cos(view.yawNow) * o);
  });
  if (!nearby || !anchor || busy || !playing) return null;
  const [x, y, z, o] = anchor;
  return (
    <group ref={group} position={[x + Math.sin(view.yawNow) * o, y, z + Math.cos(view.yawNow) * o]}>
      <Html center zIndexRange={[5, 0]}>
        <button className="interact-prompt world" data-tut="prompt" onClick={e => { e.stopPropagation(); useGameStore.getState().interact(nearby); }}>
          <kbd className="hint-mouse">E</kbd><kbd className="hint-touch">Tap</kbd> {label}
        </button>
      </Html>
    </group>
  );
}
