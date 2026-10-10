'use client';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Actors from './world/Actors';
import { Farmhouse, ProcessingShed, Warehouse, WaterSystem } from './world/Buildings';
import Field from './world/Field';
import Nature from './world/Nature';
import Weather from './world/Weather';
import { walkTo } from './world/playerState';

/** Invisible ground plane: click anywhere to walk there. */
function WalkPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} onClick={e => { e.stopPropagation(); walkTo(e.point); }}>
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export default function FarmScene() {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 10.5, 3.5], fov: 45, near: 0.5, far: 200 }}
      onCreated={({ gl }) => { if (process.env.NODE_ENV !== 'production') (window as unknown as { __gl: typeof gl }).__gl = gl; }}>
      <Weather />
      <Suspense fallback={null}>
        <Nature />
        <Field />
        <Farmhouse />
        <Warehouse />
        <ProcessingShed />
        <WaterSystem />
        <Actors />
      </Suspense>
      <WalkPlane />
    </Canvas>
  );
}
