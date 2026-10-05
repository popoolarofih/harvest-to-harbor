'use client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls, PerspectiveCamera, Sky, Text} from '@react-three/drei';
import {useGameStore} from '../stores/gameStore';

function Crop({growth,ready,health}:{growth:number;ready:boolean;health:number}){
  const scale=.45+growth/220;
  const leaf=health>80?'#5d9b43':health>60?'#819447':'#8f713f';
  return <group position={[0,.25,0]} scale={[scale,scale,scale]}>{[[-.22,0,0],[.22,0,.05],[0,0,-.18]].map((p,i)=><mesh key={i} position={p as [number,number,number]} rotation={[0,i*.7,0]}><coneGeometry args={[.18,.65,6]}/><meshStandardMaterial color={ready?'#c6a63e':leaf}/></mesh>)}</group>;
}
function Plot({id,x,z}:{id:number;x:number;z:number}){
 const p=useGameStore(s=>s.plots[id]); const prepare=useGameStore(s=>s.prepare); const plant=useGameStore(s=>s.plant); const harvest=useGameStore(s=>s.harvest);
 const action=()=>p.status==='empty'?prepare(id):p.status==='prepared'?plant(id):p.status==='ready'?harvest(id):undefined;
 const soil=p.status==='empty'?'#4b3826':p.status==='prepared'?'#654b2d':p.status==='ready'?'#705b30':'#4f7f3b';
 return <group position={[(x-1.5)*2.2,0,(z-1.5)*2.2]} onClick={action}><mesh receiveShadow><boxGeometry args={[1.82,.18,1.82]}/><meshStandardMaterial color={soil}/></mesh>{['planted','growing','ready'].includes(p.status)&&<Crop growth={p.growth} ready={p.status==='ready'} health={p.health}/>}<Text position={[0,.12,0]} rotation={[-Math.PI/2,0,0]} fontSize={.12} color="#efe7cf">{p.status==='empty'?'EMPTY':p.status==='prepared'?'PREPARE':p.status==='ready'?'HARVEST':`${Math.round(p.growth)}%`}</Text></group>;
}
function Tree({position}:{position:[number,number,number]}){return <group position={position}><mesh position={[0,1,0]}><cylinderGeometry args={[.12,.18,1.4,7]}/><meshStandardMaterial color="#61452c"/></mesh><mesh position={[0,2,0]}><icosahedronGeometry args={[.75,1]}/><meshStandardMaterial color="#345c36"/></mesh></group>}
function World(){const plots=useGameStore(s=>s.plots); const weather=useGameStore(s=>s.weather); return <><Sky sunPosition={weather==='storm'?[-5,5,-5]:[20,15,5]} turbidity={weather==='storm'?12:7} rayleigh={2}/><ambientLight intensity={weather==='storm'?0.7:1.5}/><directionalLight castShadow position={[5,9,4]} intensity={weather==='storm'?1:2.5} shadow-mapSize={[1024,1024]}/><mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[30,30]}/><meshStandardMaterial color="#263728"/></mesh><group>{plots.map(p=><Plot key={p.id} id={p.id} x={p.x} z={p.z}/>)}</group><Tree position={[-6,0,-5]}/><Tree position={[6,0,-4]}/><Tree position={[-6,0,5]}/><Tree position={[6,0,5]}/><group position={[0,.55,-5]}><mesh><boxGeometry args={[4,1.1,2.4]}/><meshStandardMaterial color="#8c6a42"/></mesh><mesh position={[0,.75,0]}><boxGeometry args={[4.2,.25,2.6]}/><meshStandardMaterial color="#283127"/></mesh></group><OrbitControls enablePan={false} maxPolarAngle={1.42} minDistance={8} maxDistance={18}/></>}
export default function FarmScene(){return <Canvas shadows dpr={[1,1.5]} camera={{position:[8,9,10],fov:45}}><PerspectiveCamera makeDefault position={[8,9,10]}/><World/></Canvas>}
