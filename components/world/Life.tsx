'use client';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MathUtils, Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import { plotsAt, storedKg } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';
import { BUILDINGS, LOAD_PILE, LORRY_STOP, PLOT_SPACING, ROAD_X, TROUGH_POS, plotPosition } from './layout';
import { Character, Model } from './models';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- Dispatch ceremony

const LANE_X = ROAD_X + 0.85;
const A = new Vector3(LANE_X, 0, -34), B = new Vector3(LANE_X, 0, -9), C = new Vector3(...LORRY_STOP), Z = new Vector3(LANE_X, 0, 80);
/** Seconds after the click. Matches the sound in lib/audio.ts playLorry(). */
const T = { arrive: 2.6, parked: 3.5, honk: 7, leave: 7.9, backed: 8.8, turned: 9.6, gone: 16.6 };
const LOAD_FROM = 3.8, LOAD_TO = 7;
const PILE = new Vector3(...LOAD_PILE), REAR = new Vector3(LORRY_STOP[0] - 2.1, 0, LORRY_STOP[2]);
const BAG_SLOTS: [number, number, number][] = [[-0.35, 1.1, -1.2], [0.35, 1.1, -1.2], [-0.35, 1.1, -0.7], [0.35, 1.1, -0.7], [-0.35, 1.1, -0.2], [0.35, 1.1, -0.2], [-0.35, 1.5, -1.2], [0.35, 1.5, -1.2]];

/**
 * The haulage lorry that collects an export order: it rolls down the red dirt road, swings in through the farm gate,
 * two hands load jute bags, the driver honks, and it backs out and heads south for Kaduna and Lagos.
 */
export function HaulageLorry() {
  const fx = useGameStore(s => (s.fx?.kind === 'ship' ? s.fx : null));
  const root = useRef<Group>(null), bags = useRef<Group>(null), honk = useRef<Group>(null), pile = useRef<Group>(null);
  const loaders = [useRef<Group>(null), useRef<Group>(null)], carried = [useRef<Group>(null), useRef<Group>(null)];
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const t = fx ? (performance.now() - fx.at) / 1000 : Infinity;
    g.visible = t < T.gone + 0.5;
    if (pile.current) pile.current.visible = g.visible && t < LOAD_TO + 0.3;
    if (!g.visible) return;
    let heading = 0;
    if (t < T.arrive) { g.position.lerpVectors(A, B, MathUtils.smootherstep(t / T.arrive, 0, 1) * 0.35 + (t / T.arrive) * 0.65); heading = 0; }
    else if (t < T.parked) { const k = MathUtils.smootherstep((t - T.arrive) / (T.parked - T.arrive), 0, 1); g.position.lerpVectors(B, C, k); heading = k * Math.PI / 2; }
    else if (t < T.leave) { g.position.copy(C); heading = Math.PI / 2; }
    else if (t < T.backed) { g.position.lerpVectors(C, B, MathUtils.smootherstep((t - T.leave) / (T.backed - T.leave), 0, 1)); heading = Math.PI / 2; }
    else if (t < T.turned) { g.position.copy(B); heading = (Math.PI / 2) * (1 - MathUtils.smootherstep((t - T.backed) / (T.turned - T.backed), 0, 1)); }
    else { const k = Math.min(1, (t - T.turned) / (T.gone - T.turned)); g.position.lerpVectors(B, Z, k * k); heading = 0; }
    g.rotation.y = heading;

    // Bags stack up in the bed as the loaders work.
    const loadedBags = t < LOAD_FROM ? 0 : Math.min(BAG_SLOTS.length, Math.floor((t - LOAD_FROM) / 0.45) + 1);
    bags.current?.children.forEach((c, i) => { c.visible = i < loadedBags; });
    pile.current?.children.forEach((c, i) => { c.visible = i < Math.max(0, 6 - Math.floor(loadedBags * 0.75)); });
    if (honk.current) honk.current.visible = t > T.honk && t < T.honk + 0.9;

    // Two loaders shuttle between the pile and the tailgate.
    loaders.forEach((r, k) => {
      const lg = r.current;
      if (!lg) return;
      const active = t > LOAD_FROM - 0.3 && t < LOAD_TO;
      lg.visible = active;
      if (!active) return;
      const phase = ((t - LOAD_FROM) / 1.5 + k * 0.5) % 1;
      const forward = phase < 0.5, u = forward ? phase * 2 : 1 - (phase - 0.5) * 2;
      // The lorry is parked at heading PI/2, so convert the loader's world position into the lorry's local frame.
      const wx = MathUtils.lerp(PILE.x, REAR.x, u) - g.position.x, wz = MathUtils.lerp(PILE.z, REAR.z, u) - g.position.z;
      const cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
      lg.position.set(wx * cos - wz * sin, 0, wx * sin + wz * cos);
      const worldHeading = forward ? Math.atan2(REAR.x - PILE.x, REAR.z - PILE.z) : Math.atan2(PILE.x - REAR.x, PILE.z - REAR.z);
      lg.rotation.y = worldHeading - g.rotation.y;
      const bag = carried[k].current;
      if (bag) bag.visible = forward;
    });
  });
  return (
    <>
      <group ref={root} visible={false}>
        <Model model="truck" scale={1.55} tint="#b8412d" />
        <group ref={bags}>{BAG_SLOTS.map((p, i) => <Model key={i} model="sack" tint="#d9c39a" scale={1.4} position={p} visible={false} />)}</group>
        <group ref={honk} position={[0, 3.3, 0.8]} visible={false}>
          <Billboard><Text fontSize={0.5} color="#ffd25a" outlineWidth={0.04} outlineColor="#2a1a00">HONK! HONK!</Text></Billboard>
        </group>
        {loaders.map((r, k) => (
          <group key={k} ref={r} visible={false}>
            <Character variant={k ? 'male-d' : 'male-a'} tone={k + 2} anim="walk" />
            <group ref={carried[k]} position={[0, 1.15, 0.3]}><Model model="sack" tint="#d9c39a" scale={1.3} /></group>
          </group>
        ))}
      </group>
      {/* The pile of bagged ginger beside the gate, shrinking as it goes onto the lorry. */}
      <group ref={pile} position={PILE.toArray()} visible={false}>
        {[0, 1, 2, 3, 4, 5].map(i => <Model key={i} model="sack" tint="#d9c39a" scale={1.5} position={[(i % 3) * 0.55, Math.floor(i / 3) * 0.32, 0]} />)}
      </group>
    </>
  );
}

// ---------------------------------------------------------------- Warehouse porter with a hand-truck

function HandTruck() {
  return (
    <group>
      {[-0.22, 0.22].map(x => <mesh key={x} position={[x, 0.55, 0]} rotation={[-0.2, 0, 0]} castShadow><boxGeometry args={[0.05, 1.1, 0.05]} /><meshStandardMaterial color="#8a5a2f" /></mesh>)}
      <mesh position={[0, 0.12, 0.2]}><boxGeometry args={[0.55, 0.04, 0.35]} /><meshStandardMaterial color="#7a4f28" /></mesh>
      <mesh position={[0, 0.9, -0.1]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, 0.5, 6]} /><meshStandardMaterial color="#555" metalness={0.5} /></mesh>
      {[-0.3, 0.3].map(x => <mesh key={x} position={[x, 0.16, 0.05]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.16, 0.16, 0.06, 12]} /><meshStandardMaterial color="#222" /></mesh>)}
    </group>
  );
}

/** A store hand who wheels bagged ginger from the drying shed to the warehouse and returns for more. */
export function Porter() {
  const active = useGameStore(s => !s.site && s.workers >= 2 && (storedKg(s) > 0 || s.dryingJobs.length > 0));
  const ref = useRef<Group>(null), loaded = useRef<Group>(null);
  const st = useRef({ pos: new Vector3(9.4, 0, -8.1), phase: 1, wait: 0.5 });
  const stops = useMemo(() => [new Vector3(9.4, 0, -8.1), new Vector3(BUILDINGS.warehouse.pos[0] + 0.4, 0, -8.7)], []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05), s = st.current, g = ref.current;
    if (!g) return;
    if (s.wait > 0) s.wait -= dt;
    else {
      const d = new Vector3().subVectors(stops[s.phase], s.pos);
      if (d.length() < 0.1) { s.phase = 1 - s.phase; s.wait = 1.6; }
      else { d.normalize(); s.pos.addScaledVector(d, 1.5 * dt); g.rotation.y = Math.atan2(d.x, d.z); }
    }
    g.position.copy(s.pos);
    // Bags ride on the way to the warehouse (phase 1 is "heading to the warehouse").
    if (loaded.current) loaded.current.visible = s.phase === 1;
  });
  if (!active) return null;
  return (
    <group ref={ref}>
      <Character variant="male-e" tone={4} anim="walk" />
      <group position={[0, 0, 0.85]}>
        <HandTruck />
        <group ref={loaded}>{[0, 1, 2].map(i => <Model key={i} model="sack" tint="#b58a5a" scale={1.35} position={[0, 0.2 + i * 0.3, 0.2]} rotation={[-0.2, 0, 0]} />)}</group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- Washing troughs (processing yard)

export function WashTroughs() {
  const home = useGameStore(s => !s.site);
  if (!home) return null;
  return (
    <group position={[TROUGH_POS[0], 0, TROUGH_POS[2]]}>
      {[0, 1.5].map(dx => (
        <group key={dx} position={[dx, 0, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow><boxGeometry args={[1.3, 0.5, 0.8]} /><meshStandardMaterial color="#8a5a2f" roughness={0.9} /></mesh>
          <mesh position={[0, 0.53, 0]}><boxGeometry args={[1.1, 0.04, 0.6]} /><meshStandardMaterial color="#6fb0cf" transparent opacity={0.8} roughness={0.15} /></mesh>
          {[0, 1, 2].map(i => <mesh key={i} position={[-0.3 + i * 0.3, 0.57, (i - 1) * 0.1]} rotation={[0, i, 0.2]}><capsuleGeometry args={[0.05, 0.16, 3, 6]} /><meshStandardMaterial color="#e6c37a" /></mesh>)}
        </group>
      ))}
      <Text position={[0.75, 1.1, 0]} fontSize={0.2} color="#f3ead2" outlineWidth={0.015} outlineColor="#1a120b">WASHING</Text>
    </group>
  );
}

// ---------------------------------------------------------------- Village life: hens, guinea fowl, egrets

interface Fowl { guinea: boolean; seed: number }
const FOWL: Fowl[] = [...Array.from({ length: 6 }, (_, i) => ({ guinea: false, seed: i })), ...Array.from({ length: 3 }, (_, i) => ({ guinea: true, seed: 10 + i }))];
const YARD = { x0: 5.4, x1: 9.6, z0: -1.4, z1: 4.8 };

function Bird({ guinea, seed }: Fowl) {
  const ref = useRef<Group>(null), head = useRef<Group>(null);
  const s = useRef({ pos: new Vector3(rand(YARD.x0, YARD.x1), 0, rand(YARD.z0, YARD.z1)), goal: new Vector3(), wait: seed * 0.4 });
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05), b = s.current, g = ref.current;
    if (!g) return;
    let hop = 0;
    if (b.wait > 0) {
      b.wait -= dt;
      // Pecking: the head dips again and again.
      if (head.current) head.current.rotation.x = 0.5 + Math.max(0, Math.sin(clock.elapsedTime * 9 + seed)) * 0.7;
      if (b.wait <= 0) b.goal.set(rand(YARD.x0, YARD.x1), 0, rand(YARD.z0, YARD.z1));
    } else {
      const d = new Vector3().subVectors(b.goal, b.pos).setY(0);
      if (d.length() < 0.1) b.wait = rand(1.5, 4.5);
      else {
        d.normalize();
        b.pos.addScaledVector(d, (guinea ? 1.1 : 0.8) * dt);
        g.rotation.y = Math.atan2(d.x, d.z);
        hop = Math.abs(Math.sin(clock.elapsedTime * 10 + seed)) * 0.04;
        if (head.current) head.current.rotation.x = Math.sin(clock.elapsedTime * 12 + seed) * 0.15;
      }
    }
    g.position.set(b.pos.x, hop, b.pos.z);
  });
  const body = guinea ? '#3b3f4a' : seed % 3 === 0 ? '#f0e6d2' : seed % 3 === 1 ? '#b5651d' : '#6b3a1e';
  return (
    <group ref={ref} scale={guinea ? 1.15 : 1}>
      <mesh position={[0, 0.22, 0]} scale={[0.75, 0.8, 1.1]} castShadow><sphereGeometry args={[0.16, 8, 8]} /><meshStandardMaterial color={body} roughness={0.9} /></mesh>
      <mesh position={[0, 0.3, -0.18]} rotation={[0.6, 0, 0]}><coneGeometry args={[0.07, 0.2, 5]} /><meshStandardMaterial color={guinea ? '#2a2d36' : body} /></mesh>
      <group ref={head} position={[0, 0.34, 0.15]}>
        <mesh position={[0, 0.06, 0.04]}><sphereGeometry args={[guinea ? 0.05 : 0.06, 6, 6]} /><meshStandardMaterial color={guinea ? '#5f8fb5' : body} /></mesh>
        <mesh position={[0, 0.05, 0.11]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.02, 0.06, 4]} /><meshStandardMaterial color="#e0a526" /></mesh>
        {!guinea && <mesh position={[0, 0.13, 0.03]}><boxGeometry args={[0.015, 0.05, 0.06]} /><meshStandardMaterial color="#c8281e" /></mesh>}
      </group>
      {[-0.05, 0.05].map(x => <mesh key={x} position={[x, 0.07, 0.02]}><cylinderGeometry args={[0.01, 0.01, 0.14, 4]} /><meshStandardMaterial color="#d9a23a" /></mesh>)}
      {guinea && [0, 1, 2, 3].map(i => <mesh key={i} position={[(i % 2 - 0.5) * 0.12, 0.28 + (i > 1 ? 0.03 : 0), (i < 2 ? -0.05 : 0.07)]}><sphereGeometry args={[0.012, 4, 4]} /><meshBasicMaterial color="#f2f2f2" /></mesh>)}
    </group>
  );
}

export function Poultry() {
  return <>{FOWL.map(f => <Bird key={f.seed} {...f} />)}</>;
}

const RAINY = new Set(['rain', 'heavyRain', 'storm', 'cloudy']);

/** Cattle egrets wheel overhead when rain is on the way. */
export function Egrets() {
  const coming = useGameStore(s => RAINY.has(s.weather) || s.forecast.slice(0, 2).some(f => f.weather === 'rain' || f.weather === 'heavyRain' || f.weather === 'storm'));
  const birds = useRef<Group[]>([]);
  useFrame(({ clock }) => {
    birds.current.forEach((b, i) => {
      if (!b) return;
      b.visible = coming;
      if (!coming) return;
      const a = clock.elapsedTime * (0.22 + i * 0.015) + i * 1.3, r = 15 + (i % 3) * 3;
      b.position.set(2 + Math.cos(a) * r, 9 + Math.sin(clock.elapsedTime * 0.7 + i) * 0.8, -4 + Math.sin(a) * r * 0.7);
      b.rotation.y = -a;
      const flap = Math.sin(clock.elapsedTime * 7 + i * 2) * 0.7;
      b.children[1].rotation.z = flap;
      b.children[2].rotation.z = -flap;
    });
  });
  return (
    <>{[0, 1, 2, 3, 4].map(i => (
      <group key={i} ref={el => { if (el) birds.current[i] = el; }} visible={false}>
        <mesh scale={[0.5, 0.6, 1.6]}><sphereGeometry args={[0.25, 6, 6]} /><meshBasicMaterial color="#f6f6f2" /></mesh>
        <mesh position={[-0.1, 0, 0]} scale={[1.2, 0.04, 0.4]}><boxGeometry args={[0.5, 1, 1]} /><meshBasicMaterial color="#ffffff" /></mesh>
        <mesh position={[0.1, 0, 0]} scale={[1.2, 0.04, 0.4]}><boxGeometry args={[0.5, 1, 1]} /><meshBasicMaterial color="#ffffff" /></mesh>
        <mesh position={[0, 0.05, 0.42]}><boxGeometry args={[0.05, 0.05, 0.25]} /><meshBasicMaterial color="#e9b730" /></mesh>
      </group>
    ))}</>
  );
}

// ---------------------------------------------------------------- Drip lines in action

const DRIP_PER = 26, DRIP_ROWS = [0, 1, 2, 3];

/** Tiny droplets falling off the drip tape while the pump runs or a bed is watered. */
export function DripDroplets() {
  const owned = useGameStore(s => !!s.upgrades.irrigation && !s.site);
  const fx = useGameStore(s => s.fx);
  const cols = useGameStore(s => 1 + Math.max(...plotsAt(s.plots).map(p => p.x)));
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const west = plotPosition(0, 0)[0] - PLOT_SPACING / 2 - 0.2, east = plotPosition(cols - 1, 0)[0] + PLOT_SPACING / 2 + 0.2;
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const on = owned && !!fx && (fx.kind === 'pump' || fx.kind === 'water') && performance.now() - fx.at < 7000;
    m.visible = on;
    if (!on) return;
    let n = 0;
    DRIP_ROWS.forEach(r => {
      const z = plotPosition(0, r)[2] + 0.85;
      for (let i = 0; i < DRIP_PER; i++) {
        const phase = (clock.elapsedTime * 1.1 + i * 0.37 + r * 0.21) % 1;
        dummy.position.set(west + ((i + 0.5) / DRIP_PER) * (east - west), 0.12 - phase * 0.11, z + 0.05);
        dummy.scale.setScalar(0.035 * (1 - phase * 0.5));
        dummy.updateMatrix();
        m.setMatrixAt(n++, dummy.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, DRIP_PER * DRIP_ROWS.length]} frustumCulled={false} visible={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color="#9fd8ff" emissive="#4aa8e8" emissiveIntensity={0.9} transparent opacity={0.9} />
    </instancedMesh>
  );
}
