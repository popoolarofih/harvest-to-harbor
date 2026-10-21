'use client';
import { Cloud, Clouds, Sky } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Fog, Object3D, type AmbientLight, type DirectionalLight, type Group, type HemisphereLight, type InstancedMesh } from 'three';
import type { Weather as WeatherKind } from '../../game/types';
import { setAmbience } from '../../lib/audio';
import { useGameStore } from '../../stores/gameStore';
import { player } from './playerState';
import { clock, tickClock } from './timeOfDay';

const LOOK: Record<WeatherKind, { sun: number; ambient: number; fog: string; sunColor: string; clouds: number; cloudColor: string; rain: number; turbidity: number }> = {
  // Harmattan heatwave: a dusty amber haze and a pale amber sun.
  heatwave: { sun: 2.6, ambient: 0.85, fog: '#dcc08c', sunColor: '#ffd08a', clouds: 1, cloudColor: '#f3e3c4', rain: 0, turbidity: 18 },
  sunny: { sun: 2.6, ambient: 0.9, fog: '#cfe0e8', sunColor: '#fff3dc', clouds: 3, cloudColor: '#ffffff', rain: 0, turbidity: 6 },
  cloudy: { sun: 1.5, ambient: 1.1, fog: '#b9c4c8', sunColor: '#eef0f0', clouds: 8, cloudColor: '#e4e7ea', rain: 0, turbidity: 10 },
  rain: { sun: 0.9, ambient: 1, fog: '#8d989c', sunColor: '#d8dde0', clouds: 10, cloudColor: '#9aa3a8', rain: 500, turbidity: 14 },
  heavyRain: { sun: 0.7, ambient: 0.9, fog: '#757f83', sunColor: '#c9cfd2', clouds: 12, cloudColor: '#7d868b', rain: 1000, turbidity: 18 },
  storm: { sun: 0.5, ambient: 0.75, fog: '#5d666b', sunColor: '#b9c0c4', clouds: 14, cloudColor: '#5f676c', rain: 1400, turbidity: 20 },
};
const MAX_DROPS = 1400;
const MOTES = 260;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const bump = (h: number, centre: number, width: number) => Math.exp(-(((h - centre) / width) ** 2));
/** 0 at night, 1 at midday. */
const daylight = (h: number) => smooth((h - 5.3) / 1.7) * (1 - smooth((h - 17.4) / 1.8));

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

/** Harmattan dust drifting on the wind around the player. */
function DustMotes({ active }: { active: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const motes = useMemo(() => Array.from({ length: MOTES }, () => ({ x: (Math.random() - 0.5) * 40, y: Math.random() * 7, z: (Math.random() - 0.5) * 40, v: 0.6 + Math.random() * 1.2, s: 0.03 + Math.random() * 0.05 })), []);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame((_, rawDt) => {
    if (!mesh.current) return;
    mesh.current.visible = active;
    if (!active) return;
    const dt = Math.min(rawDt, 0.05);
    motes.forEach((m, i) => {
      m.x += m.v * dt; m.y += Math.sin(m.x * 0.7 + i) * 0.004;
      if (m.x > 20) m.x = -20;
      dummy.position.set(player.pos.x + m.x, m.y, player.pos.z + m.z);
      dummy.scale.setScalar(m.s);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MOTES]} frustumCulled={false} visible={false}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#e8c88a" transparent opacity={0.35} depthWrite={false} />
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

const NIGHT_FOG = new Color('#141b30'), DUSK_FOG = new Color('#e8935c'), MIST_FOG = new Color('#e4ebee');
const NIGHT_SUN = new Color('#8da4ff'), GOLD_SUN = new Color('#ff9a45');

interface SkyObject { material: { uniforms: { sunPosition: { value: { set: (x: number, y: number, z: number) => void } } } } }

export default function Weather() {
  const weather = useGameStore(s => s.weather);
  const look = LOOK[weather];
  const sun = useRef<DirectionalLight>(null), ambient = useRef<AmbientLight>(null), hemi = useRef<HemisphereLight>(null);
  const skyRef = useRef<SkyObject>(null);
  const flash = useRef({ next: 5, until: 0, audio: 0 });
  const { scene } = useThree();
  const tmp = useMemo(() => new Color(), []);
  useEffect(() => {
    clock.dayStartedAt = performance.now();
    scene.fog = new Fog(look.fog, 35, 95);
    scene.background = new Color(look.fog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useFrame(({ clock: three }, dt) => {
    const t = three.elapsedTime;
    tickClock(Math.min(dt, 0.1), performance.now());
    const h = clock.hour;
    const dl = daylight(h);
    const glow = Math.max(bump(h, 6.1, 0.9), bump(h, 18.5, 1.1));      // sunrise / sunset warmth
    const mist = bump(h, 6.0, 1.1) * (weather === 'sunny' || weather === 'cloudy' ? 1 : 0.4); // dawn mist off the plateau
    const haze = weather === 'heatwave' ? 1 : 0;

    // The sun arcs east to west and stays low near the ends of the day, so shadows grow long.
    const arc = clamp01((h - 5.8) / 12.4) * Math.PI;
    const sx = Math.cos(arc) * -22, sy = Math.max(3.2, Math.sin(arc) * 24), sz = 8;
    if (sun.current) {
      sun.current.position.set(player.pos.x + sx, sy, player.pos.z + sz);
      sun.current.target.position.set(player.pos.x, 0, player.pos.z);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = look.sun * dl * (haze ? 0.9 : 1) + 0.28 * (1 - dl);
      sun.current.color.set(look.sunColor).lerp(GOLD_SUN, glow * 0.75).lerp(NIGHT_SUN, 1 - dl);
    }
    skyRef.current?.material.uniforms.sunPosition.value.set(sx, dl > 0.05 ? Math.sin(arc) * 20 + 2 : -8, sz);

    let boost = 0;
    if (weather === 'storm') {
      if (t > flash.current.next) { flash.current.until = t + 0.12; flash.current.next = t + 4 + Math.random() * 6; }
      if (t < flash.current.until) boost = 3;
    }
    if (ambient.current) ambient.current.intensity = look.ambient * (0.32 + 0.68 * dl) + boost;
    if (hemi.current) hemi.current.intensity = 0.6 * (0.25 + 0.75 * dl);

    if (scene.fog instanceof Fog) {
      tmp.set(look.fog).lerp(NIGHT_FOG, 1 - dl).lerp(DUSK_FOG, glow * 0.55 * (weather === 'sunny' || weather === 'heatwave' ? 1 : 0.5)).lerp(MIST_FOG, mist * 0.7);
      scene.fog.color.copy(tmp);
      (scene.background as Color).copy(tmp);
      // Harmattan and dawn mist pull the fog in close; clear afternoons see to the ridges.
      scene.fog.near = 35 - haze * 24 - mist * 26 - (1 - dl) * 12;
      scene.fog.far = 95 - haze * 42 - mist * 40 - (1 - dl) * 25;
    }

    // Keep the sound bed matched to the sky, about twice a second.
    flash.current.audio -= dt;
    if (flash.current.audio <= 0) { flash.current.audio = 0.5; setAmbience(weather, h); }
  });
  const wind = weather === 'storm' ? 6 : weather === 'heavyRain' ? 2.5 : weather === 'heatwave' ? 2 : 1;
  return (
    <>
      <Sky ref={skyRef as never} sunPosition={[-20, 20, 8]} turbidity={look.turbidity} rayleigh={weather === 'sunny' ? 1.6 : weather === 'heatwave' ? 0.8 : 3} mieCoefficient={weather === 'heatwave' ? 0.03 : 0.01} />
      <hemisphereLight ref={hemi} args={['#dbe8f5', '#6b5a3a', 0.6]} />
      <ambientLight ref={ambient} intensity={look.ambient} />
      <directionalLight ref={sun} castShadow intensity={look.sun} color={look.sunColor} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-far={70} />
      <DriftingClouds count={look.clouds} color={look.cloudColor} speed={wind * 0.4} />
      <Rain count={look.rain} wind={wind} />
      <DustMotes active={weather === 'heatwave'} />
    </>
  );
}
