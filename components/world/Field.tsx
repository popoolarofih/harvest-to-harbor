'use client';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import { plotName } from '../../game/simulation';
import type { Plot as PlotState, Weather } from '../../game/types';
import { useGameStore, type Fx } from '../../stores/gameStore';
import { reducedMotion } from '../../stores/session';
import { plotPosition } from './layout';
import { Model } from './models';
import { walkTo } from './playerState';

const SWAY: Record<Weather, number> = { sunny: 0.04, cloudy: 0.05, heatwave: 0.02, rain: 0.09, heavyRain: 0.14, storm: 0.3 };
const CLUMPS = [-0.55, 0, 0.55].flatMap(x => [-0.55, 0, 0.55].map(z => [x, z] as const));

function cropTint(p: PlotState) {
  if (p.issue?.detected) return '#b0744a';
  if (p.crop === 'soybean') {
    return p.status === 'ready' ? '#9eb048' : '#327322';
  }
  if (p.status === 'ready') return '#e9d47a'; // ginger leaves yellow and dry back at maturity
  if (p.health < 55) return '#c9b064';
  if (p.health < 75) return '#dcd59a';
  if (p.moisture < 25) return '#d6cf8a';
  return undefined;
}

function Crops({ p }: { p: PlotState }) {
  const weather = useGameStore(s => s.weather);
  const group = useRef<Group>(null);
  const phase = p.id * 1.37;
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime, amp = reducedMotion() ? 0 : SWAY[weather];
    group.current.children.forEach((c, i) => {
      c.rotation.z = Math.sin(t * (1.6 + amp * 4) + phase + i * 0.7) * amp;
      c.rotation.x = Math.cos(t * 1.3 + phase + i) * amp * 0.5;
    });
  });
  const tall = p.growth >= 45;
  const scale = tall ? 0.85 + ((p.growth - 45) / 55) * 0.3 : 0.6 + (p.growth / 45) * 0.6;
  // After germination, gaps in the bed show how many setts actually came up.
  const visible = p.germinated ? Math.max(1, Math.round(CLUMPS.length * p.stand)) : CLUMPS.length;
  const tint = cropTint(p);
  return (
    <group ref={group}>
      {CLUMPS.slice(0, visible).map(([x, z], i) => (
        <group key={i} position={[x + ((i * 7) % 3) * 0.04, 0.09, z]}>
          <Model model={tall ? 'gingerTall' : 'gingerYoung'} scale={scale} rotation={[0, i * 1.9, 0]} tint={tint} />
        </group>
      ))}
    </group>
  );
}

const FX_COLORS: Record<Fx['kind'], string | null> = { water: '#6fb7e8', fertilize: '#f2f0e6', treat: '#9be07a', prepare: '#7a5a3a', harvest: '#d9b56a', plant: '#7a5a3a', inspect: null, pump: null, process: null, grind: null, ship: null };
const FX_COUNT = 24;

/** A short particle burst over a plot when the player works it. */
function PlotFx({ id }: { id: number }) {
  const fx = useGameStore(s => (s.fx?.plot === id ? s.fx : null));
  const mesh = useRef<InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: FX_COUNT }, (_, i) => new Vector3(Math.sin(i * 12.9) * 0.8, Math.abs(Math.sin(i * 4.1)), Math.cos(i * 7.3) * 0.8)), []);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(() => {
    if (!mesh.current) return;
    const age = fx ? (performance.now() - fx.at) / 1000 : 9;
    mesh.current.visible = age < 1.4 && !!fx && !!FX_COLORS[fx.kind];
    if (!mesh.current.visible || !fx) return;
    const rising = fx.kind === 'prepare' || fx.kind === 'harvest' || fx.kind === 'plant' || fx.kind === 'treat';
    seeds.forEach((s, i) => {
      const y = rising ? 0.2 + age * (0.8 + s.y) : 1.6 + s.y * 0.4 - age * 2.2;
      dummy.position.set(s.x * (rising ? 1 + age : 1), Math.max(0.1, y), s.z * (rising ? 1 + age : 1));
      dummy.scale.setScalar(fx.kind === 'treat' ? 0.12 + age * 0.15 : 0.05);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, FX_COUNT]} visible={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={(fx && FX_COLORS[fx.kind]) || '#fff'} transparent opacity={fx?.kind === 'treat' ? 0.35 : 0.9} />
    </instancedMesh>
  );
}

function Plot({ id }: { id: number }) {
  const p = useGameStore(s => s.plots[id]);
  const selected = useGameStore(s => s.selectedPlot === id);
  const near = useGameStore(s => s.nearby?.kind === 'plot' && s.nearby.id === id);
  const pos = plotPosition(p.x, p.z);
  const wet = Math.min(1, p.moisture / 100);
  const soil = p.status === 'empty' ? `hsl(28, 28%, ${30 - wet * 9}%)` : `hsl(26, 38%, ${33 - wet * 13}%)`;
  const cropped = p.status === 'growing' || p.status === 'ready';
  return (
    <group position={pos} onClick={e => { e.stopPropagation(); walkTo(new Vector3(...pos), { kind: 'plot', id }); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh receiveShadow position={[0, 0.04, 0]}><boxGeometry args={[1.86, 0.08, 1.86]} /><meshStandardMaterial color={soil} roughness={1} /></mesh>
      {p.ridged && [-0.6, 0, 0.6].map(z => <mesh key={z} position={[0, 0.12, z]} castShadow receiveShadow><boxGeometry args={[1.76, 0.12, 0.34]} /><meshStandardMaterial color={soil} roughness={1} /></mesh>)}
      {(selected || near) && <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}><ringGeometry args={[1.28, 1.36, 4]} /><meshBasicMaterial color={selected ? '#b4e16e' : '#f3f1e7'} transparent opacity={selected ? 1 : 0.5} /></mesh>}
      {cropped && <Crops p={p} />}
      {p.issue?.detected && <Billboard position={[0, 1.6, 0]}><Text fontSize={0.5} color="#ff7a5c" outlineWidth={0.03} outlineColor="#2a0f08">!</Text></Billboard>}
      {p.status === 'ready' && !p.issue?.detected && <Billboard position={[0, 1.5, 0]}><Text fontSize={0.32} color="#d7f5a8" outlineWidth={0.02} outlineColor="#1b2a12">READY</Text></Billboard>}
      <Text position={[-0.72, 0.1, 0.84]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#f1e6c8" anchorX="left">{plotName(p)}</Text>
      <PlotFx id={id} />
    </group>
  );
}

export default function Field() {
  const count = useGameStore(s => s.plots.length);
  return <group>{Array.from({ length: count }, (_, id) => <Plot key={id} id={id} />)}</group>;
}
