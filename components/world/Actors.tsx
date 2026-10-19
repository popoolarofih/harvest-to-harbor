'use client';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { NPCS, currentMission, type NpcId } from '../../game/simulation';
import { useGameStore, type StationId, type Target } from '../../stores/gameStore';
import { isPlaying, reducedMotion, screenTurn } from '../../stores/session';
import { Okada } from './Buildings';
import { COLLIDERS, NPC_SPOTS, ROAD_X, STATIONS, TANK_POS, TRUCK_POS, WALK_BOUNDS, plotPosition, targetPosition, targetRadius } from './layout';
import { Character, Model, type CharacterAnim, type ModelId } from './models';
import { player, rotateBy, rotateStep, setCameraMode, toggleCameraMode, view, walkTo, zoomBy } from './playerState';

const WALK_SPEED = 4.2, SPRINT_SPEED = 7, BODY_RADIUS = 0.35;
/** What the camera circles behind the title screen: roughly the middle of the farm. */
const TITLE_CENTER = new Vector3(2, 0, -5);
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const ACTION_ANIM: Partial<Record<string, CharacterAnim>> = { harvest: 'pick-up', plant: 'pick-up', prepare: 'interact-right', water: 'interact-right', fertilize: 'interact-right', treat: 'interact-right', inspect: 'pick-up', pump: 'interact-right' };
/** Radians of camera turn per pixel of right/middle-mouse drag. */
const DRAG_ROTATE = 0.008;
/** A two-finger gesture only starts turning the camera after this much twist, so a plain pinch doesn't wobble it. */
const TWIST_DEADZONE = 0.12;

/** Horizontal drag distance as the player sees it, even when the whole game is turned sideways by the orientation setting. */
function userDx(dx: number, dy: number) {
  const turn = screenTurn();
  return turn === 90 ? dy : turn === -90 ? -dy : dx;
}

function resolveCollisions(p: Vector3) {
  // Bought compounds have no office, warehouse or shed to walk around.
  for (const [x0, z0, x1, z1] of useGameStore.getState().site ? [] : COLLIDERS) {
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
  const { plots, site } = useGameStore.getState();
  const targets: Target[] = [
    ...plots.filter(p => p.compound === site).map(p => ({ kind: 'plot', id: p.id }) as Target),
    // Stations and characters only exist on the home farm.
    ...(site ? [] : (Object.keys(STATIONS) as StationId[]).map(id => ({ kind: 'station', id }) as Target)),
    ...(site ? [] : (Object.keys(NPC_SPOTS) as NpcId[]).map(id => ({ kind: 'npc', id }) as Target)),
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
  // Travelling to another farm puts the farmer at its gate path, facing the field.
  const site = useGameStore(s => s.site);
  const firstSite = useRef(true);
  useEffect(() => {
    if (firstSite.current) { firstSite.current = false; return; }
    player.pos.set(0, 0, -7.5); player.goal = null; player.goalTarget = null; player.heading = 0;
  }, [site]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      // Menus and the story intro own the keyboard until the game is being played.
      if (typing(e) || !isPlaying()) return;
      keys.current.add(e.code);
      const s = useGameStore.getState();
      if (e.code === 'KeyE' || e.code === 'Enter') { if (s.nearby) s.interact(s.nearby); }
      if (e.code === 'Escape') {
        if (view.mode === 'inspect') setCameraMode('follow');
        s.closeOverlays();
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(1 / 1.15);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1.15);
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (plain && e.code === 'KeyC') toggleCameraMode();
      if (plain && e.code === 'KeyQ') rotateStep(-1);
      if (plain && e.code === 'KeyR') rotateStep(1);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!isPlaying()) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      zoomBy(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0012)));
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    const el = gl.domElement;
    el.addEventListener('wheel', wheel, { passive: false });

    // Right- or middle-button drag turns the camera. Left clicks stay free for walking and using things.
    let drag: { id: number; x: number; y: number } | null = null;
    const contextMenu = (e: Event) => e.preventDefault();

    // Two fingers: pinch to zoom, twist to turn.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDist = 0, twistAngle = 0, twistAcc = 0, twisting = false;
    const pair = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }; };
    const pDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) {
        e.preventDefault();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        el.setPointerCapture?.(e.pointerId);
        return;
      }
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const p = pair();
        pinchDist = p.d; twistAngle = p.angle; twistAcc = 0; twisting = false;
        player.goal = null; player.goalTarget = null;
      }
    };
    const pMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        if (isPlaying()) rotateBy(userDx(e.clientX - drag.x, e.clientY - drag.y) * DRAG_ROTATE);
        drag.x = e.clientX; drag.y = e.clientY;
        return;
      }
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || !isPlaying()) return;
      const { d, angle } = pair();
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d;
      // Fingers turning clockwise on screen turn the world clockwise with them, like a map.
      const turn = Math.atan2(Math.sin(angle - twistAngle), Math.cos(angle - twistAngle));
      twistAngle = angle;
      if (twisting) rotateBy(turn);
      else if (Math.abs(twistAcc += turn) > TWIST_DEADZONE) { twisting = true; rotateBy(twistAcc); }
      view.ignoreTapsUntil = performance.now() + 400;
    };
    const pUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) { drag = null; return; }
      if (!touches.delete(e.pointerId)) return;
      if (touches.size < 2) { pinchDist = 0; twisting = false; twistAcc = 0; }
      if (touches.size > 0) view.ignoreTapsUntil = performance.now() + 400;
    };
    // iOS Safari fires its own gesture events; stop them from zooming the page.
    const gesture = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', pDown); el.addEventListener('pointermove', pMove);
    el.addEventListener('pointerup', pUp); el.addEventListener('pointercancel', pUp);
    el.addEventListener('gesturestart', gesture); el.addEventListener('gesturechange', gesture);
    el.addEventListener('contextmenu', contextMenu);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', pDown); el.removeEventListener('pointermove', pMove);
      el.removeEventListener('pointerup', pUp); el.removeEventListener('pointercancel', pUp);
      el.removeEventListener('gesturestart', gesture); el.removeEventListener('gesturechange', gesture);
      el.removeEventListener('contextmenu', contextMenu);
    };
  }, [gl]);

  const camGoal = useMemo(() => new Vector3(), []), look = useMemo(() => new Vector3(), []), vel = useMemo(() => new Vector3(), []);
  useFrame(({ size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (!isPlaying()) {
      // Title screen: a slow orbit of the farm. Play resumes by easing back to the follow camera.
      keys.current.clear();
      const a = reducedMotion() ? 0.45 : 0.45 + clock.elapsedTime * 0.04;
      camera.position.set(TITLE_CENTER.x + Math.sin(a) * 22, 17, TITLE_CENTER.z + Math.cos(a) * 22);
      camera.lookAt(TITLE_CENTER);
      if (ref.current) { ref.current.position.copy(player.pos); ref.current.rotation.y = player.heading; }
      return;
    }
    const inspect = view.mode === 'inspect';
    const k = keys.current, held = (codes: string[]) => codes.some(c => k.has(c));
    // Ease the camera heading toward where the player turned it.
    view.yawNow = reducedMotion() ? view.yaw : view.yawNow + (view.yaw - view.yawNow) * (1 - Math.exp(-dt * 9));
    if (Math.abs(view.yaw - view.yawNow) < 1e-4) view.yawNow = view.yaw;
    const sinY = Math.sin(view.yawNow), cosY = Math.cos(view.yawNow);

    // Keys are read as screen directions (up = away from the camera), then turned into world directions.
    const ix = (held(KEYS.right) ? 1 : 0) - (held(KEYS.left) ? 1 : 0), iz = (held(KEYS.down) ? 1 : 0) - (held(KEYS.up) ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');

    if (inspect) {
      if (ix !== 0 || iz !== 0) {
        const panSpeed = (sprint ? 16 : 9) * dt;
        view.inspectFocus.x = Math.max(-16, Math.min(24, view.inspectFocus.x + (ix * cosY + iz * sinY) * panSpeed));
        view.inspectFocus.z = Math.max(-22, Math.min(18, view.inspectFocus.z + (iz * cosY - ix * sinY) * panSpeed));
      }
    } else {
      vel.set(ix * cosY + iz * sinY, 0, iz * cosY - ix * sinY);
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
      const next: CharacterAnim = moving ? (sprint ? 'sprint' : 'walk') : player.busy > 0 ? 'interact-right' : 'idle';
      if (next !== animRef.current) { animRef.current = next; setAnim(next); }
    }
    if (ref.current) { ref.current.position.copy(player.pos); ref.current.rotation.y = player.heading; }

    const s = useGameStore.getState();
    s.setNearby(inspect ? null : nearestTarget(player.pos));
    if (!inspect) {
      if (s.selectedPlot !== null && targetPosition({ kind: 'plot', id: s.selectedPlot }, s.plots).distanceTo(player.pos) > 3.2) s.select(null);
      if (s.talkingTo && targetPosition({ kind: 'npc', id: s.talkingTo }, s.plots).distanceTo(player.pos) > 3.2) s.select(null);
      if (s.tankOpen && targetPosition({ kind: 'station', id: 'tank' }, s.plots).distanceTo(player.pos) > 3.5) s.select(null);
    }

    // Tall, narrow (portrait phone) screens see less of the farm side to side, so pull back a little.
    const fit = Math.min(1.45, Math.max(1, Math.sqrt(size.height / Math.max(1, size.width))));
    const dist = view.zoom * fit;
    const focus = inspect ? view.inspectFocus : player.pos;
    camGoal.set(focus.x + sinY * 11 * dist, 10.5 * dist, focus.z + cosY * 11 * dist);
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * (inspect ? 6 : 4)));
    look.set(focus.x, 0.8, focus.z);
    camera.lookAt(look);
  });

  const profile = useGameStore(s => s.profile);
  return (
    <group ref={ref}>
      <Character variant={profile.avatar} tone={profile.skinTone} anim={anim} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.45, 20]} /><meshBasicMaterial color="#b4e16e" transparent opacity={0.35} /></mesh>
      <Billboard position={[0, 2.05, 0]}>
        <Text fontSize={0.22} color="#fff6dc" outlineWidth={0.02} outlineColor="#1a120b">{profile.farmerName}</Text>
      </Billboard>
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
  // At a bought compound there is no shed: everyone works the field.
  const isProcessing = useGameStore(s => !s.site && index < (s.automation.processingWorkers ?? 0));
  const state = useRef({
    goal: new Vector3(),
    wait: index * 0.8,
    pos: new Vector3(isProcessing ? STATIONS.shed.pos[0] + index : -2 + index, 0, isProcessing ? STATIONS.shed.pos[2] + 2 : -6),
  });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), st = state.current;
    if (st.wait > 0) {
      st.wait -= dt;
      if (st.wait <= 0) {
        if (isProcessing) {
          const rackX = [-1.6, 0, 1.6][Math.floor(Math.random() * 3)];
          st.goal.set(STATIONS.shed.pos[0] + rackX + (Math.random() - 0.5) * 0.4, 0, STATIONS.shed.pos[2] + (Math.random() - 0.5) * 1.2);
        } else {
          const { plots: all, site } = useGameStore.getState();
          const plots = all.filter(p => p.compound === site);
          const pool = plots.some(p => p.status !== 'empty') ? plots.filter(p => p.status !== 'empty') : plots;
          const p = pool[Math.floor(Math.random() * pool.length)];
          const [x, , z] = Math.random() < 0.1 && !site ? STATIONS.shed.pos : plotPosition(p.x, p.z);
          st.goal.set(x + (Math.random() - 0.5) * 1.4, 0, z + 0.95);
        }
        setAnim('walk');
      }
    } else {
      const d = new Vector3().subVectors(st.goal, st.pos).setY(0);
      if (d.length() < 0.15) {
        st.wait = 3 + Math.random() * 4;
        setAnim(isProcessing ? 'interact-right' : Math.random() < 0.5 ? 'interact-right' : 'pick-up');
      } else {
        d.normalize().multiplyScalar(2.2 * dt);
        st.pos.add(d);
        if (ref.current) ref.current.rotation.y = Math.atan2(d.x, d.z);
      }
    }
    ref.current?.position.copy(st.pos);
  });
  const isWorking = anim !== 'walk';
  const toolModel: ModelId | null = isProcessing
    ? (index % 2 === 0 ? 'box' : 'bucket')
    : (index % 2 === 0 ? 'hoe' : 'shovel');

  return (
    <group ref={ref}>
      <Character variant={WORKER_VARIANTS[index % WORKER_VARIANTS.length]} tone={(index + 2) % 5} anim={anim} />
      {toolModel && (
        <group position={isWorking ? [0.25, 0.45, 0.25] : [0.2, 0.35, -0.1]} rotation={isWorking ? [0.2, 0, -0.3] : [0.1, 0, 0.2]}>
          <Model model={toolModel} scale={toolModel === 'hoe' || toolModel === 'shovel' ? 1.5 : 0.8} />
        </group>
      )}
    </group>
  );
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
  return <>{(['office', 'warehouse', 'shed', 'tank', 'signboard'] as StationId[]).map(id => {
    const s = STATIONS[id];
    return (
      <mesh key={id} position={id === 'signboard' ? [-9.2, 1.4, -6.8] : id === 'tank' ? [TANK_POS[0], 2.5, TANK_POS[2]] : [s.pos[0], 1.5, s.pos[2] - (id === 'office' || id === 'warehouse' ? 2.4 : 0)]}
        onClick={e => { e.stopPropagation(); walkTo(new Vector3(...s.pos), { kind: 'station', id }); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        <boxGeometry args={id === 'signboard' ? [2.4, 1.8, 1.2] : id === 'shed' ? [5, 3, 4.4] : id === 'tank' ? [3.4, 5, 3] : [5.6, 3.4, 4.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    );
  })}</>;
}

export default function Actors() {
  const home = useGameStore(s => !s.site);
  return (
    <>
      <Player />
      {home && (Object.keys(NPC_SPOTS) as NpcId[]).map(id => <Npc key={id} id={id} />)}
      <Workers />
      {home && <FarmTruck />}
      {home && <StationHitboxes />}
      <Vehicle model="van" lane={0.85} speed={6} offset={0} />
      <Vehicle model="pickup" lane={-0.85} speed={-5} offset={50} />
      <Vehicle model="okada" lane={-0.85} speed={-8.5} offset={95} />
      <Vehicle model="truck" lane={0.85} speed={4.5} offset={80} scale={1.6} />
    </>
  );
}
