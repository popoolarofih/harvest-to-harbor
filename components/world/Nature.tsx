'use client';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { ShaderMaterial } from 'three';
import { createRng } from '../../game/rng';
import { compoundSite, plotsAt } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';
import { FARM_BOUNDS, GATE, PLOT_SPACING, ROAD_X, STREAM_Z } from './layout';
import { Model, type ModelId } from './models';

const streamShader = {
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    void main(){
      float ripple = sin(vUv.x * 90.0 - uTime * 2.4 + sin(vUv.y * 9.0 + uTime) * 1.5) * 0.5 + 0.5;
      float glint = smoothstep(0.92, 1.0, ripple * (sin(vUv.x * 23.0 + uTime * 0.7) * 0.5 + 0.5));
      float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
      vec3 deep = vec3(0.13, 0.30, 0.33), shallow = vec3(0.34, 0.50, 0.44);
      vec3 col = mix(shallow, deep, edge) + glint * 0.25;
      gl_FragColor = vec4(col, 0.95);
      #include <colorspace_fragment>
    }`,
};

function Stream() {
  const mat = useRef<ShaderMaterial>(null);
  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt; });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, STREAM_Z]}>
        <planeGeometry args={[120, 2.2, 1, 1]} />
        <shaderMaterial ref={mat} args={[streamShader]} transparent />
      </mesh>
      {/* Muddy banks */}
      {[-1.35, 1.35].map(dz => <mesh key={dz} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, STREAM_Z + dz]}><planeGeometry args={[120, 0.6]} /><meshStandardMaterial color="#5b4a32" /></mesh>)}
      <Model model="bridge" position={[ROAD_X, 0, STREAM_Z]} scale={[3.2, 2, 3]} />
    </group>
  );
}

function Ground() {
  const site = useGameStore(s => s.site);
  const extraCols = useGameStore(s => Math.max(...plotsAt(s.plots, s.site).map(p => p.x)) - 3);
  const leased = extraCols > 0;
  // The tilled field grows east as hectares are leased.
  const fieldW = 10.5 + extraCols * PLOT_SPACING, fieldX = (extraCols * PLOT_SPACING) / 2;
  const grass = site ? compoundSite(site).ground : '#6d7a3e';
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color={grass} roughness={1} /></mesh>
      {/* Compound yard: bare laterite earth, swept clean. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3, 0.01, -9]} receiveShadow><planeGeometry args={[24, 14]} /><meshStandardMaterial color="#a2734b" roughness={1} /></mesh>
      {/* Field: tilled darker soil around the beds. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fieldX, 0.012, 0]} receiveShadow><planeGeometry args={[fieldW, 10.5]} /><meshStandardMaterial color="#5e4630" roughness={1} /></mesh>
      {!leased && !site && <group position={[6.6, 0, -4.6]}>
        <mesh position={[0, 0.7, 0]}><boxGeometry args={[0.08, 1.4, 0.08]} /><meshStandardMaterial color="#5a4330" /></mesh>
        <mesh position={[0, 1.35, 0]}><boxGeometry args={[1.3, 0.45, 0.05]} /><meshStandardMaterial color="#efe3c4" /></mesh>
        <Text position={[0, 1.35, 0.03]} fontSize={0.12} color="#5a2d10">LAND FOR LEASE · LV 5</Text>
      </group>}
      {/* Red laterite road to Kafanchan, and the track through the gate. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROAD_X, 0.015, 0]} receiveShadow><planeGeometry args={[3.4, 160]} /><meshStandardMaterial color="#9b5534" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(ROAD_X + FARM_BOUNDS.minX) / 2 + 1, 0.016, (GATE.z0 + GATE.z1) / 2]}><planeGeometry args={[6, 2.6]} /><meshStandardMaterial color="#9b5534" roughness={1} /></mesh>
      {/* Foot paths from the yard down to the field and the tank. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, -5.6]}><planeGeometry args={[1.4, 3]} /><meshStandardMaterial color="#8d6440" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8.5, 0.014, 1.6]} ><planeGeometry args={[7, 1.2]} /><meshStandardMaterial color="#8d6440" roughness={1} /></mesh>
    </group>
  );
}

function Fences() {
  const { minX, maxX, minZ, maxZ } = FARM_BOUNDS;
  const segments: { pos: [number, number, number]; rot: number }[] = [];
  const SEG = 2;
  for (let x = minX + SEG / 2; x < maxX; x += SEG) { segments.push({ pos: [x, 0, minZ], rot: 0 }); segments.push({ pos: [x, 0, maxZ], rot: 0 }); }
  for (let z = minZ + SEG / 2; z < maxZ; z += SEG) {
    segments.push({ pos: [maxX, 0, z], rot: Math.PI / 2 });
    if (z < GATE.z0 - 0.5 || z > GATE.z1 + 0.5) segments.push({ pos: [minX, 0, z], rot: Math.PI / 2 });
  }
  return <group>{segments.map((s, i) => <Model key={i} model="fence" position={s.pos} rotation={[0, s.rot, 0]} scale={[SEG, 2.2, 2]} />)}</group>;
}

function Vegetation() {
  const items = useMemo(() => {
    const rng = createRng(77);
    const out: { id: ModelId; pos: [number, number, number]; rot: number; scale: number }[] = [];
    const inside = (x: number, z: number) => x > FARM_BOUNDS.minX - 1 && x < FARM_BOUNDS.maxX + 1 && z > FARM_BOUNDS.minZ - 1 && z < FARM_BOUNDS.maxZ + 1;
    const nearRoad = (x: number) => Math.abs(x - ROAD_X) < 2.6;
    const nearStream = (z: number) => Math.abs(z - STREAM_Z) < 2;
    let guard = 0;
    while (out.length < 90 && guard++ < 2000) {
      const x = rng.range(-45, 45), z = rng.range(-40, 30);
      if (inside(x, z) || nearRoad(x) || nearStream(z)) continue;
      const roll = rng.next();
      // The camera looks north from the south, so tall trees just south of the farm would hide the player.
      const cameraSide = z > FARM_BOUNDS.maxZ && z < 22 && x > FARM_BOUNDS.minX - 6 && x < FARM_BOUNDS.maxX + 6;
      const id: ModelId = cameraSide ? rng.pick(['bush', 'bushLarge', 'grass', 'rock'] as const)
        : Math.abs(z - STREAM_Z) < 6 ? rng.pick(['palm', 'palmTall', 'palmBend', 'bushLarge'] as const)
        : roll < 0.35 ? rng.pick(['tree', 'oak', 'treeFat'] as const) : roll < 0.55 ? rng.pick(['palm', 'palmTall'] as const) : rng.pick(['bush', 'bushLarge', 'grass', 'rock'] as const);
      const big = id.startsWith('palm') || id === 'tree' || id === 'oak' || id === 'treeFat';
      out.push({ id, pos: [x, 0, z], rot: rng.range(0, Math.PI * 2), scale: big ? rng.range(3.2, 4.6) : rng.range(2.5, 4) });
    }
    return out;
  }, []);
  return <group>{items.map((it, i) => <Model key={i} model={it.id} position={it.pos} rotation={[0, it.rot, 0]} scale={it.scale} />)}</group>;
}

/** Things that make it look worked-in: tools, crates, firewood, a shade tree, the farm sign. */
function FarmClutter() {
  const site = useGameStore(s => s.site);
  const place = site ? compoundSite(site) : null;
  return (
    <group>
      <Model model="oak" position={[-8, 0, -12.4]} scale={3.2} />
      <Model model="palmTall" position={[13.6, 0, -15.6]} scale={4.2} />
      <Model model="palm" position={[-8.4, 0, -16]} scale={4} />
      <Model model="palmBend" position={[14, 0, -9.5]} scale={3.8} />
      <Model model="logs" position={[-1, 0, -16.2]} scale={3} rotation={[0, Math.PI / 2, 0]} />
      <Model model="hoe" position={[-5, 0, -5.8]} rotation={[0.25, 0, 0.1]} scale={3.4} />
      <Model model="shovel" position={[-4.6, 0, -5.9]} rotation={[0.2, 0.4, -0.1]} scale={3.4} />
      <Model model="boxLarge" position={[1, 0, -16.2]} scale={3} />
      {!site && <Model model="tractor" position={[12.6, 0, -13.8]} rotation={[0, -Math.PI / 2, 0]} scale={1.5} />}
      <group position={[FARM_BOUNDS.minX - 1.4, 0, GATE.z0 - 0.6]} rotation={[0, Math.PI / 2, 0]}>
        {[-1.3, 1.3].map(x => <mesh key={x} position={[x, 1.1, 0]}><boxGeometry args={[0.12, 2.2, 0.12]} /><meshStandardMaterial color="#5a4330" /></mesh>)}
        <mesh position={[0, 1.85, 0]}><boxGeometry args={[3, 0.8, 0.08]} /><meshStandardMaterial color="#f2ead2" /></mesh>
        {[1, -1].map(side => (
          <group key={side} position={[0, 1.85, side * 0.05]} rotation={[0, side < 0 ? Math.PI : 0, 0]}>
            <Text position={[0, 0.14, 0]} fontSize={0.2} color="#2a5a2a">{place ? place.name.toUpperCase() : 'HARVEST TO HARBOR FARMS'}</Text>
            <Text position={[0, -0.16, 0]} fontSize={0.14} color="#7a3b1e">{`GINGER · ${(place?.place ?? 'Kafanchan').toUpperCase()}, ${place?.id === 'jos' ? 'PLATEAU' : 'KADUNA'}`}</Text>
          </group>
        ))}
      </group>
    </group>
  );
}

export default function Nature() {
  return <><Ground /><Stream /><Fences /><Vegetation /><FarmClutter /></>;
}
