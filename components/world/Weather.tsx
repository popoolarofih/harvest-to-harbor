'use client';
import { Cloud, Clouds, Sky } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Fog, Object3D, type AmbientLight, type DirectionalLight, type Group, type InstancedMesh } from 'three';
import type { Weather as WeatherKind } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';
import { player } from './playerState';

const LOOK: Record<WeatherKind, { sun: number; ambient: number; fog: string; sunColor: string; clouds: number; cloudColor: string; rain: number; turbidity: number }> = {
  heatwave: { sun: 3.1, ambient: 0.9, fog: '#e6d2a8', sunColor: '#ffe2b0', clouds: 1, cloudColor: '#ffffff', rain: 0, turbidity: 14 },
  sunny: { sun: 2.6, ambient: 0.9, fog: '#cfe0e8', sunColor: '#fff3dc', clouds: 3, cloudColor: '#ffffff', rain: 0, turbidity: 6 },
  cloudy: { sun: 1.5, ambient: 1.1, fog: '#b9c4c8', sunColor: '#eef0f0', clouds: 8, cloudColor: '#e4e7ea', rain: 0, turbidity: 10 },
  rain: { sun: 0.9, ambient: 1, fog: '#8d989c', sunColor: '#d8dde0', clouds: 10, cloudColor: '#9aa3a8', rain: 500, turbidity: 14 },
  heavyRain: { sun: 0.7, ambient: 0.9, fog: '#757f83', sunColor: '#c9cfd2', clouds: 12, cloudColor: '#7d868b', rain: 1000, turbidity: 18 },
  storm: { sun: 0.5, ambient: 0.75, fog: '#5d666b', sunColor: '#b9c0c4', clouds: 14, cloudColor: '#5f676c', rain: 1400, turbidity: 20 },
};
const MAX_DROPS = 1400;

function Rain({ count, wind }: { count: number; wind: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const drops = useMemo(() => Array.from({ length: MAX_DROPS }, () => ({ x: (Math.random() - 0.5) * 36, y: Math.random() * 16, z: (Math.random() - 0.5) * 36, v: 16 + Math.random() * 6 })), []);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame((_, rawDt) => {
    if (!mesh.current) return;
    const dt = Math.min(rawDt, 0.05);
    mesh.current.count = count;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.v * dt; d.x += wind * dt;
      if (d.y < 0) { d.y = 14 + Math.random() * 3; d.x = (Math.random() - 0.5) * 36; d.z = (Math.random() - 0.5) * 36; }
      dummy.position.set(player.pos.x + d.x, d.y, player.pos.z + d.z);
      dummy.rotation.z = -wind * 0.04;
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_DROPS]} frustumCulled={false} visible={count > 0}>
      <boxGeometry args={[0.018, 0.55, 0.018]} />
      <meshBasicMaterial color="#c4d6e4" transparent opacity={0.55} />
    </instancedMesh>
  );
}

function DriftingClouds({ count, color, speed }: { count: number; color: string; speed: number }) {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.x += dt * speed;
    if (group.current.position.x > 40) group.current.position.x = -40;
  });
  return (
    <group ref={group}>
      <Clouds limit={400}>
        {Array.from({ length: count }, (_, i) => (
          <Cloud key={i} seed={i + 1} position={[((i * 37) % 70) - 35, 16 + (i % 3) * 2, ((i * 23) % 50) - 35]} bounds={[8, 2, 4]} volume={6} segments={14} color={color} opacity={0.8} fade={30} />
        ))}
      </Clouds>
    </group>
  );
}

export default function Weather() {
  const weather = useGameStore(s => s.weather);
  const look = LOOK[weather];
  const sun = useRef<DirectionalLight>(null), ambient = useRef<AmbientLight>(null);
  const flash = useRef({ next: 5, until: 0 });
  const { scene } = useThree();
  useEffect(() => { scene.fog = new Fog(look.fog, 35, 95); scene.background = new Color(look.fog); }, [scene, look.fog]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sun.current) {
      // Keep the shadow frustum centred on the player.
      sun.current.position.set(player.pos.x + 14, 22, player.pos.z + 8);
      sun.current.target.position.set(player.pos.x, 0, player.pos.z);
      sun.current.target.updateMatrixWorld();
    }
    if (!ambient.current) return;
    let boost = 0;
    if (weather === 'storm') {
      if (t > flash.current.next) { flash.current.until = t + 0.12; flash.current.next = t + 4 + Math.random() * 6; }
      if (t < flash.current.until) boost = 3;
    }
    ambient.current.intensity = look.ambient + boost;
  });
  const wind = weather === 'storm' ? 6 : weather === 'heavyRain' ? 2.5 : 1;
  return (
    <>
      <Sky sunPosition={[30, weather === 'storm' ? 6 : 20, 10]} turbidity={look.turbidity} rayleigh={weather === 'sunny' || weather === 'heatwave' ? 1.6 : 3} mieCoefficient={0.01} />
      <hemisphereLight args={['#dbe8f5', '#6b5a3a', 0.6]} />
      <ambientLight ref={ambient} intensity={look.ambient} />
      <directionalLight ref={sun} castShadow intensity={look.sun} color={look.sunColor} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-far={70} />
      <DriftingClouds count={look.clouds} color={look.cloudColor} speed={wind * 0.4} />
      <Rain count={look.rain} wind={wind} />
    </>
  );
}
