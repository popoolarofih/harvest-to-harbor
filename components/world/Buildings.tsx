'use client';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Shape, type Group, type Mesh } from 'three';
import { SAFE_MOISTURE, storedKg, warehouseCapacity } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';
import { BOREHOLE_POS, BUILDINGS, PLOT_SPACING, SIGNBOARD_POS, TANK_POS, plotPosition } from './layout';
import { Model } from './models';

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: [number, number]) {
  return useMemo(() => {
    const size = 128, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping; tex.repeat.set(...repeat); tex.colorSpace = SRGBColorSpace;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Corrugated zinc roofing with a few rust streaks: the roof of most farm buildings in Nigeria. */
function useZincTexture() {
  return useCanvasTexture((ctx, s) => {
    for (let x = 0; x < s; x++) { const v = 150 + 55 * Math.sin((x / s) * Math.PI * 16); ctx.fillStyle = `rgb(${v},${v + 4},${v + 8})`; ctx.fillRect(x, 0, 1, s); }
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#8a4b24';
    for (let i = 0; i < 6; i++) ctx.fillRect((i * 37) % s, 0, 5 + (i % 3) * 3, s * (0.4 + (i % 4) * 0.15));
  }, [3, 1]);
}

function GableRoof({ w, d, y, pitch = 0.42 }: { w: number; d: number; y: number; pitch?: number }) {
  const zinc = useZincTexture();
  const slope = d / 2 / Math.cos(pitch) + 0.35, rise = (d / 2) * Math.tan(pitch);
  const gable = useMemo(() => { const s = new Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, rise); s.closePath(); return s; }, [d, rise]);
  return (
    <group position={[0, y, 0]}>
      {[1, -1].map(side => (
        <mesh key={side} position={[0, rise / 2 + 0.05, side * d / 4]} rotation={[side * pitch, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.6, 0.06, slope]} />
          <meshStandardMaterial map={zinc} metalness={0.55} roughness={0.45} />
        </mesh>
      ))}
      {[1, -1].map(side => (
        <mesh key={side} position={[side * w / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <shapeGeometry args={[gable]} /><meshStandardMaterial color="#e3d5b6" side={2} />
        </mesh>
      ))}
    </group>
  );
}

/** Block house, plastered and painted with a darker dado band, burglar-proof windows and a zinc roof. */
function BlockBuilding({ w, d, h, wall, band, door = 'wood' }: { w: number; d: number; h: number; wall: string; band: string; door?: 'wood' | 'metal' | 'open' }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={wall} roughness={0.95} /></mesh>
      <mesh position={[0, 0.45, 0]}><boxGeometry args={[w + 0.02, 0.9, d + 0.02]} /><meshStandardMaterial color={band} roughness={0.95} /></mesh>
      <mesh position={[0, 0.06, d / 2 + 0.6]} receiveShadow><boxGeometry args={[w + 0.4, 0.12, 1.2]} /><meshStandardMaterial color="#9c968a" /></mesh>
      {door === 'open'
        ? <mesh position={[0, 1.1, d / 2 + 0.005]}><planeGeometry args={[2.2, 2.2]} /><meshStandardMaterial color="#231d17" /></mesh>
        : <mesh position={[0, 1, d / 2 + 0.03]}><boxGeometry args={[0.9, 2, 0.06]} /><meshStandardMaterial color={door === 'metal' ? '#3e5d73' : '#6b4226'} /></mesh>}
      {[-1, 1].map(side => (
        <group key={side} position={[side * w * 0.3, 1.45, d / 2 + 0.03]}>
          <mesh><boxGeometry args={[0.9, 0.8, 0.04]} /><meshStandardMaterial color="#26302b" /></mesh>
          {[-0.3, -0.1, 0.1, 0.3].map(x => <mesh key={x} position={[x, 0, 0.03]}><boxGeometry args={[0.03, 0.8, 0.03]} /><meshStandardMaterial color="#555" metalness={0.6} /></mesh>)}
        </group>
      ))}
      <GableRoof w={w} d={d} y={h} />
    </group>
  );
}

export function Farmhouse() {
  const b = BUILDINGS.office;
  return (
    <group position={[b.pos[0], 0, b.pos[2]]}>
      <BlockBuilding w={b.size[0]} d={b.size[1]} h={2.7} wall="#ead9b4" band="#a0563a" />
      <Text position={[0, 2.35, b.size[1] / 2 + 0.05]} fontSize={0.26} color="#3a2416" anchorX="center">FARM OFFICE</Text>
      <Model model="barrel" position={[2.1, 0, b.size[1] / 2 + 0.5]} scale={2.6} />
      <Model model="bucket" position={[1.6, 0, b.size[1] / 2 + 0.6]} scale={2.6} />
      <Okada position={[-2.3, 0, b.size[1] / 2 + 1.2]} rotation={[0, 0.4, 0]} />
    </group>
  );
}

export function Warehouse() {
  const b = BUILDINGS.warehouse;
  const batches = useGameStore(s => s.batches);
  const stock = useGameStore(s => s.stock);
  const totalKg = useGameStore(s => storedKg(s));
  const capacity = useGameStore(s => warehouseCapacity(s));
  const over = totalKg > capacity;
  const nearFull = !over && totalKg >= capacity * 0.85;

  // Sacks pile up: brown jute for fresh, beige for dried, white for sealed export bags,
  // golden flat for powder, green-tan for soybean.
  const sacks = batches.flatMap(x => Array.from({ length: Math.ceil(x.kg / (x.product === 'fresh' ? 100 : 50)) }, () => x)).slice(0, 40)
    .map(x => ({
      flat: x.product === 'powder',
      tint: x.product === 'fresh'
        ? '#b58a5a'
        : x.product === 'powder'
        ? '#f0cd73'
        : x.product === 'soybean'
        ? '#7ba05b'
        : x.packaging === 'sealed'
        ? '#f6f6f2'
        : '#d9c39a',
    }));

  const fertSacks = Math.min(6, stock?.fertilizer ?? 0);
  const compostSacks = Math.min(6, stock?.compost ?? 0);

  return (
    <group position={[b.pos[0], 0, b.pos[2]]}>
      <BlockBuilding w={b.size[0]} d={b.size[1]} h={3.2} wall="#d8d3c6" band="#3f6e8c" door="open" />
      <Text position={[0, 2.75, b.size[1] / 2 + 0.05]} fontSize={0.3} color="#22313b">STORE</Text>
      {sacks.map((sack, i) => {
        const layer = Math.floor(i / 20);
        const idx = i % 20;
        const row = Math.floor(idx / 5);
        const col = idx % 5;
        const y = layer * 0.35;
        return (
          <Model
            key={`sack-${i}`}
            model={sack.flat ? 'sackFlat' : 'sack'}
            tint={sack.tint}
            scale={sack.flat ? 1.3 : 1.55}
            position={[-2.4 + col * 0.58, y, b.size[1] / 2 + 0.5 + row * 0.55]}
            rotation={[0, (i * 1.7) % 0.6, 0]}
          />
        );
      })}
      {/* Input inventory stacks placed by the warehouse wall */}
      {Array.from({ length: fertSacks }, (_, i) => (
        <Model key={`fert-${i}`} model="sack" tint="#3a6ea5" scale={1.4} position={[2.4, i * 0.28, b.size[1] / 2 + 0.6]} rotation={[0, 0.4, 0]} />
      ))}
      {Array.from({ length: compostSacks }, (_, i) => (
        <Model key={`comp-${i}`} model="sack" tint="#4a3728" scale={1.4} position={[3.1, i * 0.28, b.size[1] / 2 + 0.6]} rotation={[0, -0.3, 0]} />
      ))}
      {over && <Text position={[0, 3.8, b.size[1] / 2]} fontSize={0.28} color="#e65100">OVER CAPACITY</Text>}
      {nearFull && <Text position={[0, 3.8, b.size[1] / 2]} fontSize={0.24} color="#f59e0b">STORE AT CAPACITY</Text>}
      <Model model="boxLarge" position={[3.3, 0, 1]} scale={3} />
      <Model model="box" position={[3.4, 0.75, 1]} scale={3} />
    </group>
  );
}

function DryingRack({ x, job }: { x: number; job?: { moisture: number; covered: boolean; quality: number } }) {
  const dryness = job ? Math.max(0, Math.min(1, (80 - job.moisture) / (80 - SAFE_MOISTURE))) : 0;
  const isWetFresh = job && job.moisture > 65;
  const isExportReady = job && job.moisture <= SAFE_MOISTURE && job.quality >= 75;
  const sliceColor = job ? `hsl(${42 - dryness * 10}, ${55 - (100 - job.quality) * 0.3}%, ${78 - dryness * 22}%)` : '#000';
  return (
    <group position={[x, 0, 0]}>
      {[[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]].map(([lx, lz]) => <mesh key={`${lx}${lz}`} position={[lx, 0.4, lz]}><boxGeometry args={[0.06, 0.8, 0.06]} /><meshStandardMaterial color="#6b4c2e" /></mesh>)}
      <mesh position={[0, 0.82, 0]} receiveShadow><boxGeometry args={[1.35, 0.04, 2]} /><meshStandardMaterial color="#77736a" wireframe /></mesh>
      {job && (
        <mesh position={[0, 0.85, 0]}>
          <boxGeometry args={[1.25, 0.03, 1.9]} />
          <meshStandardMaterial color={sliceColor} roughness={isWetFresh ? 0.25 : 0.95} metalness={isWetFresh ? 0.15 : 0} />
        </mesh>
      )}
      {/* Export ready stamp indicator on rack when safe moisture <= 12% and quality >= 75 */}
      {isExportReady && !job?.covered && (
        <group position={[0, 0.88, 0.88]}>
          <mesh><boxGeometry args={[0.65, 0.02, 0.15]} /><meshStandardMaterial color="#2d6a4f" /></mesh>
          <Text position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.08} color="#e8f5e9">EXPORT SAFE</Text>
        </group>
      )}
      {/* Realistic blue tarpaulin cover with draped ridge */}
      {job?.covered && (
        <group position={[0, 1.05, 0]}>
          <mesh><boxGeometry args={[1.45, 0.4, 2.1]} /><meshStandardMaterial color="#1f538d" roughness={0.5} /></mesh>
          <mesh position={[0, 0.22, 0]}><boxGeometry args={[1.4, 0.05, 2.05]} /><meshStandardMaterial color="#163e6b" roughness={0.6} /></mesh>
        </group>
      )}
    </group>
  );
}

export function ProcessingShed() {
  const b = BUILDINGS.shed;
  const jobs = useGameStore(s => s.dryingJobs);
  const mill = useGameStore(s => s.upgrades.mill), solar = useGameStore(s => s.upgrades.solarDryer);
  const fx = useGameStore(s => s.fx);
  const zinc = useZincTexture();
  const pulley = useRef<Mesh>(null), dust = useRef<Mesh>(null);
  useFrame(({ clock }, dt) => {
    const grinding = fx?.kind === 'grind' && performance.now() - fx.at < 4000;
    if (pulley.current) pulley.current.rotation.x += dt * (grinding ? 30 : 0);
    if (dust.current) { dust.current.visible = grinding; dust.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 20) * 0.15); }
  });
  const [w, d] = b.size;
  return (
    <group position={[b.pos[0], 0, b.pos[2]]}>
      <mesh position={[0, 0.05, 0]} receiveShadow><boxGeometry args={[w, 0.1, d]} /><meshStandardMaterial color="#a9a398" /></mesh>
      {[-1, 0, 1].flatMap(i => [-1, 1].map(j => <mesh key={`${i}${j}`} position={[i * (w / 2 - 0.15), 1.4, j * (d / 2 - 0.15)]} castShadow><boxGeometry args={[0.14, 2.8, 0.14]} /><meshStandardMaterial color="#5a4330" /></mesh>))}
      {solar ? <>
        {/* Solar tunnel conversion: clear polythene roof and walls trap the sun's heat and keep rain off. */}
        <mesh position={[0, 2.95, 0]} rotation={[0.12, 0, 0]}><boxGeometry args={[w + 0.6, 0.04, d + 0.8]} /><meshStandardMaterial color="#e8f4ff" transparent opacity={0.35} roughness={0.1} /></mesh>
        {[-1, 1].map(j => <mesh key={j} position={[0, 1.45, j * (d / 2 - 0.1)]}><boxGeometry args={[w, 2.8, 0.03]} /><meshStandardMaterial color="#e8f4ff" transparent opacity={0.22} roughness={0.1} /></mesh>)}
      </> : <mesh position={[0, 2.95, 0]} rotation={[0.12, 0, 0]} castShadow receiveShadow><boxGeometry args={[w + 0.6, 0.06, d + 0.8]} /><meshStandardMaterial map={zinc} metalness={0.55} roughness={0.45} /></mesh>}
      {[-1.6, 0, 1.6].map((x, i) => <DryingRack key={x} x={x} job={jobs[i]} />)}
      <Text position={[0, 2.55, d / 2 + 0.35]} fontSize={0.26} color="#f3ead2">{solar ? 'SOLAR DRYER' : 'PROCESSING'}</Text>
      {/* Hammer mill beside the shed, once bought: the belt pulley spins and dust flies while grinding. */}
      {mill && <group position={[w / 2 + 0.9, 0, 0.6]}>
        <mesh ref={dust} position={[0, 1.5, 0]} visible={false}><sphereGeometry args={[0.35, 10, 10]} /><meshStandardMaterial color="#e8cf8a" transparent opacity={0.45} /></mesh>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.8, 1, 0.7]} /><meshStandardMaterial color="#b23b2b" metalness={0.3} /></mesh>
        <mesh position={[0, 1.15, 0]}><cylinderGeometry args={[0.18, 0.3, 0.35, 8]} /><meshStandardMaterial color="#8d8d8d" metalness={0.6} /></mesh>
        <mesh ref={pulley} position={[0.45, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.28, 0.28, 0.08, 12]} /><meshStandardMaterial color="#333" metalness={0.7} /></mesh>
        <Text position={[0, 1.6, 0.4]} fontSize={0.16} color="#fff">MILL</Text>
      </group>}
      <Model model="grinder" position={[-w / 2 - 0.7, 0, 1]} scale={3} />
      <Model model="barrel" position={[-w / 2 - 0.6, 0, -0.6]} scale={3} />
      <Model model="bucket" position={[-w / 2 - 1.1, 0, 0.1]} scale={3} />
    </group>
  );
}

/** Overhead tank on a stand, a diesel-pumped borehole, and (once bought) drip lines to every bed. */
export function WaterSystem() {
  const irrigation = useGameStore(s => s.upgrades.irrigation);
  const water = useGameStore(s => s.water);
  const fx = useGameStore(s => s.fx);
  const jet = useRef<Mesh>(null), genset = useRef<Group>(null);
  useFrame(({ clock }) => {
    const pumping = fx?.kind === 'pump' && performance.now() - fx.at < 3500;
    if (jet.current) { jet.current.visible = pumping; jet.current.scale.y = 0.9 + Math.sin(clock.elapsedTime * 30) * 0.1; }
    if (genset.current) genset.current.position.y = pumping ? Math.sin(clock.elapsedTime * 60) * 0.015 : 0;
  });
  const cols = useGameStore(s => 1 + Math.max(...s.plots.map(p => p.x)));
  const rowZ = [0, 1, 2, 3].map(z => plotPosition(0, z)[2]);
  const fieldWest = plotPosition(0, 0)[0] - PLOT_SPACING / 2 - 0.2, fieldEast = plotPosition(cols - 1, 0)[0] + PLOT_SPACING / 2 + 0.2;
  return (
    <group>
      <group position={[TANK_POS[0], 0, TANK_POS[2]]}>
        <Model model="waterTower" scale={2.1} />
        <Text position={[0, 5.4, 0.95]} fontSize={0.22} color="#123">{`${(water / 1000).toFixed(1)}k L`}</Text>
      </group>
      <group position={[BOREHOLE_POS[0], 0, BOREHOLE_POS[2]]}>
        <mesh position={[0, 0.08, 0]} receiveShadow><boxGeometry args={[1.4, 0.16, 1.4]} /><meshStandardMaterial color="#9e998e" /></mesh>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.08, 0.08, 1, 8]} /><meshStandardMaterial color="#4b6a7a" metalness={0.5} /></mesh>
        <mesh position={[-0.6, 1.05, -0.5]} rotation={[0, Math.PI / 4, Math.PI / 2]}><cylinderGeometry args={[0.06, 0.06, 1.6, 8]} /><meshStandardMaterial color="#4b6a7a" metalness={0.5} /></mesh>
        <group ref={genset} position={[0.35, 0, 0.35]}>
          <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[0.6, 0.5, 0.45]} /><meshStandardMaterial color="#d8a21c" /></mesh>
          <mesh position={[0, 0.72, 0]}><boxGeometry args={[0.5, 0.1, 0.35]} /><meshStandardMaterial color="#222" /></mesh>
        </group>
        <mesh ref={jet} position={[-1.2, 2.4, -1]} visible={false}><cylinderGeometry args={[0.06, 0.12, 2.6, 8]} /><meshStandardMaterial color="#9fd3f0" transparent opacity={0.7} /></mesh>
      </group>
      {irrigation && <group>
        <mesh position={[(TANK_POS[0] + fieldEast) / 2, 0.08, TANK_POS[2]]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.06, 0.06, TANK_POS[0] - fieldEast, 6]} /><meshStandardMaterial color="#1c1c1c" /></mesh>
        <mesh position={[fieldEast, 0.08, (rowZ[0] + rowZ[3]) / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, rowZ[3] - rowZ[0] + 1, 6]} /><meshStandardMaterial color="#1c1c1c" /></mesh>
        {rowZ.map(z => <mesh key={z} position={[(fieldWest + fieldEast) / 2, 0.12, z + 0.85]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, fieldEast - fieldWest, 6]} /><meshStandardMaterial color="#1c1c1c" /></mesh>)}
      </group>}
    </group>
  );
}

/** A Nigerian okada (motorcycle taxi), built from primitives since no CC0 pack ships one. */
export function Okada(props: { position?: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group {...props}>
      {[-0.55, 0.55].map(z => <mesh key={z} position={[0, 0.3, z]} rotation={[0, Math.PI / 2, 0]} castShadow><torusGeometry args={[0.26, 0.07, 8, 16]} /><meshStandardMaterial color="#1a1a1a" /></mesh>)}
      <mesh position={[0, 0.62, 0]} castShadow><boxGeometry args={[0.22, 0.25, 0.9]} /><meshStandardMaterial color="#b51f1f" metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[0, 0.82, -0.12]}><boxGeometry args={[0.26, 0.1, 0.55]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0, 0.95, 0.5]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.025, 0.025, 0.7, 6]} /><meshStandardMaterial color="#aaa" metalness={0.8} /></mesh>
      <mesh position={[0, 0.75, 0.55]} rotation={[0.35, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.5, 6]} /><meshStandardMaterial color="#aaa" metalness={0.8} /></mesh>
    </group>
  );
}

/** Wooden signboard at the farm entrance displaying the customized farm name and emblem. */
export function FarmSignboard() {
  const profile = useGameStore(s => s.profile);
  const [x, y, z] = SIGNBOARD_POS;
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI * 0.45, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 1.8, 8]} />
        <meshStandardMaterial color="#5c432d" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.85, 0.1]} />
        <meshStandardMaterial color="#2d1e13" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.45, 0.055]}>
        <boxGeometry args={[2.26, 0.91, 0.02]} />
        <meshStandardMaterial color="#8a5e3b" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.45, 0.06]}>
        <planeGeometry args={[2.1, 0.75]} />
        <meshStandardMaterial color="#1f160e" roughness={0.9} />
      </mesh>
      <Text position={[0, 1.6, 0.08]} fontSize={0.19} color="#ffd25a" outlineWidth={0.015} outlineColor="#140d06" anchorX="center" anchorY="middle">
        {`${profile.emblem} ${profile.farmName}`}
      </Text>
      <Text position={[0, 1.34, 0.08]} fontSize={0.12} color="#e5dfcf" outlineWidth={0.01} outlineColor="#140d06" anchorX="center" anchorY="middle">
        Southern Kaduna · Ginger Farmland
      </Text>
    </group>
  );
}
