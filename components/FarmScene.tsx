'use client';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Actors from './world/Actors';
import { Equipment, Farmhouse, FarmSignboard, Outpost, ProcessingShed, Warehouse, WaterSystem } from './world/Buildings';
import Field from './world/Field';
import { TutorialBeacon, WorldPrompt } from './world/Guides';
import Nature from './world/Nature';
import Weather from './world/Weather';
import { view, walkTo } from './world/playerState';
import { useGameStore } from '../stores/gameStore';

/** Invisible ground plane: click anywhere to walk there. */
function WalkPlane() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.005, 0]}
      onClick={e => {
        e.stopPropagation();
        if (view.mode === 'inspect') return;
        walkTo(e.point);
      }}
    >
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The home farm's buildings, or a bought compound's caretaker hut. */
function Site() {
  const site = useGameStore(s => s.site);
  if (site) return <Outpost site={site} />;
  return <><Farmhouse /><Warehouse /><ProcessingShed /><WaterSystem /><FarmSignboard /><Equipment /></>;
}

export default function FarmScene() {
  return (
    // offsetSize: measure the layout box, not the on-screen bounding box, so a CSS-rotated screen keeps the right aspect.
    <Canvas shadows dpr={[1, 1.5]} resize={{ offsetSize: true }} camera={{ position: [0, 10.5, 3.5], fov: 45, near: 0.5, far: 200 }}
      onCreated={({ gl }) => { if (process.env.NODE_ENV !== 'production') (window as unknown as { __gl: typeof gl }).__gl = gl; }}>
      <Weather />
      <Suspense fallback={null}>
        <Nature />
        <Field />
        <Site />
        <Actors />
      </Suspense>
      <TutorialBeacon />
      <WorldPrompt />
      <WalkPlane />
    </Canvas>
  );
}
