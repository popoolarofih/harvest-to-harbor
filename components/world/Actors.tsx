'use client';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { NPCS, currentMission, type NpcId } from '../../game/simulation';
import { useGameStore, type StationId, type Target } from '../../stores/gameStore';
import { Okada } from './Buildings';
import { COLLIDERS, NPC_SPOTS, ROAD_X, STATIONS, TANK_POS, TRUCK_POS, WALK_BOUNDS, plotPosition, targetPosition, targetRadius } from './layout';
import { Character, Model, type CharacterAnim, type ModelId } from './models';
import { player, view, walkTo, zoomBy } from './playerState';

const WALK_SPEED = 4.2, SPRINT_SPEED = 7, BODY_RADIUS = 0.35;
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const ACTION_ANIM: Partial<Record<string, CharacterAnim>> = { harvest: 'pick-up', plant: 'pick-up', prepare: 'interact-right', water: 'interact-right', fertilize: 'interact-right', treat: 'interact-right', inspect: 'pick-up', pump: 'interact-right' };

function resolveCollisions(p: Vector3) {
  for (const [x0, z0, x1, z1] of COLLIDERS) {
    const a = x0 - BODY_RADIUS, b = z0 - BODY_RADIUS, c = x1 + BODY_RADIUS, d = z1 + BODY_RADIUS;
    if (p.x <= a || p.x >= c || p.z <= b || p.z >= d) continue;
    const push = [p.x - a, c - p.x, p.z - b, d - p.z];
    const min = Math.min(...push);
    if (min === push[0]) p.x = a; else if (min === push[1]) p.x = c; else if (min === push[2]) p.z = b; else p.z = d;
  }
  p.x = Math.max(WALK_BOUNDS.minX, Math.min(WALK_BOUNDS.maxX, p.x));
  p.z = Math.max(WALK_BOUNDS.minZ, Math.min(WALK_BOUNDS.maxZ, p.z));
  // The west fence only opens at the gate.
  if (p.x < -9.2 && p.x > -9.9 && (p.z < -10.5 || p.z > -7.5)) p.x = p.x > -9.55 ? -9.2 : -9.9;
}

function nearestTarget(pos: Vector3): Target | null {
  const plots = useGameStore.getState().plots;
  const targets: Target[] = [
    ...plots.map(p => ({ kind: 'plot', id: p.id }) as Target),
    ...(Object.keys(STATIONS) as StationId[]).map(id => ({ kind: 'station', id }) as Target),
    ...(Object.keys(NPC_SPOTS) as NpcId[]).map(id => ({ kind: 'npc', id }) as Target),
  ];
  let best: Target | null = null, bestD = Infinity;
  for (const t of targets) {
    const d = targetPosition(t, plots).distanceTo(pos) / targetRadius(t);
    if (d < 1 && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

export function Player() {
  const ref = useRef<Group>(null);
  const keys = useRef(new Set<string>());
  const animRef = useRef<CharacterAnim>('idle');
  const [anim, setAnim] = useState<CharacterAnim>('idle');
  const { camera, gl } = useThree();
  const fx = useGameStore(s => s.fx);

  useEffect(() => { if (fx && ACTION_ANIM[fx.kind]) player.busy = 1.1; }, [fx]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      keys.current.add(e.code);
      const s = useGameStore.getState();
      if (e.code === 'KeyE' || e.code === 'Enter') { if (s.nearby) s.interact(s.nearby); }
      if (e.code === 'Escape') s.closeOverlays();
      if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(1 / 1.15);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1.15);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      zoomBy(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0012)));
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    const el = gl.domElement;
    el.addEventListener('wheel', wheel, { passive: false });

    // Two-finger pinch on touch screens.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const pDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { pinchDist = spread(); player.goal = null; player.goalTarget = null; }
    };
    const pMove = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const d = spread();
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d;
      view.ignoreTapsUntil = performance.now() + 400;
    };
    const pUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      if (touches.size < 2) pinchDist = 0;
      if (touches.size > 0) view.ignoreTapsUntil = performance.now() + 400;
    };
    // iOS Safari fires its own gesture events; stop them from zooming the page.
    const gesture = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', pDown); el.addEventListener('pointermove', pMove);
    el.addEventListener('pointerup', pUp); el.addEventListener('pointercancel', pUp);
    el.addEventListener('gesturestart', gesture); el.addEventListener('gesturechange', gesture);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', pDown); el.removeEventListener('pointermove', pMove);
      el.removeEventListener('pointerup', pUp); el.removeEventListener('pointercancel', pUp);
      el.removeEventListener('gesturestart', gesture); el.removeEventListener('gesturechange', gesture);
    };
  }, [gl]);

  const camGoal = useMemo(() => new Vector3(), []), look = useMemo(() => new Vector3(), []), vel = useMemo(() => new Vector3(), []);
  useFrame(({ size }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current, held = (codes: string[]) => codes.some(c => k.has(c));
    vel.set((held(KEYS.right) ? 1 : 0) - (held(KEYS.left) ? 1 : 0), 0, (held(KEYS.down) ? 1 : 0) - (held(KEYS.up) ? 1 : 0));
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    if (vel.lengthSq() > 0) { player.goal = null; player.goalTarget = null; player.busy = 0; }
    else if (player.goal) {
      vel.subVectors(player.goal, player.pos).setY(0);
      const stop = player.goalTarget ? targetRadius(player.goalTarget) * 0.55 : 0.12;
      if (vel.length() <= stop) {
        const t = player.goalTarget;
        player.goal = null; player.goalTarget = null; vel.set(0, 0, 0);
        if (t) useGameStore.getState().interact(t);
      }
    }
    if (player.busy > 0) player.busy -= dt;
    const moving = vel.lengthSq() > 0;
    if (moving) {
      vel.normalize().multiplyScalar((sprint ? SPRINT_SPEED : WALK_SPEED) * dt);
      player.pos.add(vel);
      resolveCollisions(player.pos);
      const target = Math.atan2(vel.x, vel.z);
      let diff = target - player.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.heading += diff * Math.min(1, dt * 12);
    }
    if (ref.current) { ref.current.position.copy(player.pos); ref.current.rotation.y = player.heading; }

    const next: CharacterAnim = moving ? (sprint ? 'sprint' : 'walk') : player.busy > 0 ? 'interact-right' : 'idle';
    if (next !== animRef.current) { animRef.current = next; setAnim(next); }

    const s = useGameStore.getState();
    s.setNearby(nearestTarget(player.pos));
    // Walking away from what you were working on closes its panel.
    if (s.selectedPlot !== null && targetPosition({ kind: 'plot', id: s.selectedPlot }, s.plots).distanceTo(player.pos) > 3.2) s.select(null);
    if (s.talkingTo && targetPosition({ kind: 'npc', id: s.talkingTo }, s.plots).distanceTo(player.pos) > 3.2) s.select(null);
    if (s.tankOpen && targetPosition({ kind: 'station', id: 'tank' }, s.plots).distanceTo(player.pos) > 3.5) s.select(null);

    // Tall, narrow (portrait phone) screens see less of the farm side to side, so pull back a little.
    const fit = Math.min(1.45, Math.max(1, Math.sqrt(size.height / Math.max(1, size.width))));
    const dist = view.zoom * fit;
    camGoal.set(player.pos.x, 10.5 * dist, player.pos.z + 11 * dist);
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * 4));
    look.set(player.pos.x, 0.8, player.pos.z);
    camera.lookAt(look);
  });

  return (
    <group ref={ref}>
      <Character variant="male-e" tone={0} anim={anim} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.45, 20]} /><meshBasicMaterial color="#b4e16e" transparent opacity={0.35} /></mesh>
    </group>
  );
}

function Npc({ id }: { id: NpcId }) {
  const spot = NPC_SPOTS[id];
  const ref = useRef<Group>(null);
  const talking = useGameStore(s => s.talkingTo === id);
  const hasMission = useGameStore(s => currentMission(s)?.npc === id);
  const marker = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const d = player.pos.distanceTo(new Vector3(...spot.pos));
    const goal = d < 4 ? Math.atan2(player.pos.x - spot.pos[0], player.pos.z - spot.pos[2]) : spot.facing;
    let diff = goal - ref.current.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ref.current.rotation.y += diff * Math.min(1, dt * 5);
    if (marker.current) marker.current.position.y = 2.75 + Math.sin(performance.now() / 300) * 0.08;
  });
  return (
    <group position={spot.pos} onClick={e => { e.stopPropagation(); walkTo(new Vector3(...spot.pos), { kind: 'npc', id }); }}>
      <group ref={ref} rotation={[0, spot.facing, 0]}><Character variant={spot.variant} tone={spot.tone} anim={talking ? 'emote-yes' : 'idle'} /></group>
      <Billboard position={[0, 2, 0]}>
        <Text fontSize={0.26} color="#fff6dc" outlineWidth={0.02} outlineColor="#1a120b">{NPCS[id].name}</Text>
        <Text position={[0, -0.26, 0]} fontSize={0.15} color="#d8e8c4" outlineWidth={0.015} outlineColor="#1a120b">{NPCS[id].role}</Text>
      </Billboard>
      {/* Gold marker over whoever is giving the current campaign mission. */}
      {hasMission && <group ref={marker} position={[0, 2.75, 0]}><Billboard><Text fontSize={0.55} color="#ffd25a" outlineWidth={0.03} outlineColor="#3a2a00">!</Text></Billboard></group>}
    </group>
  );
}

const WORKER_VARIANTS = ['male-a', 'female-b', 'male-d', 'female-f', 'male-b', 'female-e'];

/** Hired hands wander between beds and the shed, pausing to work. Purely visual. */
function Worker({ index }: { index: number }) {
  const ref = useRef<Group>(null);
  const [anim, setAnim] = useState<CharacterAnim>('walk');
  const state = useRef({ goal: new Vector3(), wait: index * 0.8, pos: new Vector3(-2 + index, 0, -6) });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), st = state.current;
    if (st.wait > 0) {
      st.wait -= dt;
      if (st.wait <= 0) {
        const { plots } = useGameStore.getState();
        const pool = plots.some(p => p.status !== 'empty') ? plots.filter(p => p.status !== 'empty') : plots;
        const p = pool[Math.floor(Math.random() * pool.length)];
        const [x, , z] = Math.random() < 0.2 ? STATIONS.shed.pos : plotPosition(p.x, p.z);
        st.goal.set(x + (Math.random() - 0.5) * 1.4, 0, z + 0.95);
        setAnim('walk');
      }
    } else {
      const d = new Vector3().subVectors(st.goal, st.pos).setY(0);
      if (d.length() < 0.15) { st.wait = 3 + Math.random() * 4; setAnim(Math.random() < 0.5 ? 'interact-right' : 'pick-up'); }
      else { d.normalize().multiplyScalar(2.2 * dt); st.pos.add(d); if (ref.current) ref.current.rotation.y = Math.atan2(d.x, d.z); }
    }
    ref.current?.position.copy(st.pos);
  });
  return <group ref={ref}><Character variant={WORKER_VARIANTS[index % WORKER_VARIANTS.length]} tone={(index + 2) % 5} anim={anim} /></group>;
}

function Workers() {
  const count = useGameStore(s => Math.min(6, s.workers));
  return <>{Array.from({ length: count }, (_, i) => <Worker key={i} index={i} />)}</>;
}

/** Traffic on the Kafanchan road. */
function Vehicle({ model, lane, speed, offset, scale = 1.4 }: { model: ModelId | 'okada'; lane: number; speed: number; offset: number; scale?: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const span = 140, z = ((((clock.elapsedTime * speed + offset) % span) + span) % span) - span / 2;
    ref.current.position.set(ROAD_X + lane, 0, z);
    ref.current.rotation.y = speed > 0 ? 0 : Math.PI;
  });
  return (
    <group ref={ref}>
      {model === 'okada' ? <group><Okada /><Character variant="male-d" tone={3} anim="sit" position={[0, 0.35, -0.1]} scale={0.95} /></group> : <Model model={model} scale={scale} />}
    </group>
  );
}

const TRUCK_ROUTE = [new Vector3(...TRUCK_POS), new Vector3(TRUCK_POS[0], 0, -9), new Vector3(ROAD_X - 0.85, 0, -9), new Vector3(ROAD_X - 0.85, 0, 70)];
const TRUCK_LEG_SECONDS = [2.2, 2.5, 9];

/** The farm truck. After an export shipment it drives out of the gate and south toward Lagos, then comes back. */
function FarmTruck() {
  const ref = useRef<Group>(null), load = useRef<Group>(null);
  const fx = useGameStore(s => (s.fx?.kind === 'ship' ? s.fx : null));
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!ref.current) return;
    let t = fx ? (performance.now() - fx.at) / 1000 : Infinity;
    let leg = 0;
    while (leg < TRUCK_LEG_SECONDS.length && t > TRUCK_LEG_SECONDS[leg]) { t -= TRUCK_LEG_SECONDS[leg]; leg++; }
    if (load.current) load.current.visible = leg < TRUCK_LEG_SECONDS.length;
    if (leg >= TRUCK_LEG_SECONDS.length) { ref.current.position.copy(TRUCK_ROUTE[0]); ref.current.rotation.y = Math.PI; ref.current.visible = true; return; }
    const a = TRUCK_ROUTE[leg], b = TRUCK_ROUTE[leg + 1];
    p.lerpVectors(a, b, t / TRUCK_LEG_SECONDS[leg]);
    ref.current.position.copy(p);
    ref.current.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  });
  return (
    <group ref={ref} position={TRUCK_POS} onClick={e => { e.stopPropagation(); walkTo(new Vector3(...TRUCK_POS), { kind: 'station', id: 'truck' }); }}>
      <Model model="truck" scale={1.55} />
      <group ref={load} visible={false}>{[-0.35, 0.35].flatMap(x => [-0.6, 0].map(z => <Model key={`${x}${z}`} model="sack" tint="#f6f6f2" scale={1.4} position={[x, 1.1, z - 0.5]} />))}</group>
    </group>
  );
}

/** Invisible click targets for buildings, so the player can click a building to walk over and use it. */
function StationHitboxes() {
  return <>{(['office', 'warehouse', 'shed', 'tank'] as StationId[]).map(id => {
    const s = STATIONS[id];
    return (
      <mesh key={id} position={id === 'tank' ? [TANK_POS[0], 2.5, TANK_POS[2]] : [s.pos[0], 1.5, s.pos[2] - (id === 'office' || id === 'warehouse' ? 2.4 : 0)]}
        onClick={e => { e.stopPropagation(); walkTo(new Vector3(...s.pos), { kind: 'station', id }); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <boxGeometry args={id === 'shed' ? [5, 3, 4.4] : id === 'tank' ? [3.4, 5, 3] : [5.6, 3.4, 4.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  })}</>;
}

export default function Actors() {
  return (
    <>
      <Player />
      {(Object.keys(NPC_SPOTS) as NpcId[]).map(id => <Npc key={id} id={id} />)}
      <Workers />
      <FarmTruck />
      <StationHitboxes />
      <Vehicle model="van" lane={0.85} speed={6} offset={0} />
      <Vehicle model="pickup" lane={-0.85} speed={-5} offset={50} />
      <Vehicle model="okada" lane={-0.85} speed={-8.5} offset={95} />
      <Vehicle model="truck" lane={0.85} speed={4.5} offset={80} scale={1.6} />
    </>
  );
}
