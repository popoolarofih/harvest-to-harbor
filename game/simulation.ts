import type { GameState, Mission, Plot, QualityGrade, Weather } from './types';

export const STARTING_CASH = 500_000;
export const PLOT_COUNT = 16;
export const PREPARE_COST = 8_000;
export const PROCESS_COST = 12_000;
export const WORKER_COST = 35_000;
export const WAREHOUSE_COST = 150_000;
export const GINGER_PER_PLOT = 0.42;

const baseMissions: Mission[] = [
  { id:'plant', title:'Start the season', description:'Plant ginger on 4 plots.', target:4, progress:0, reward:25_000, complete:false },
  { id:'harvest', title:'First harvest', description:'Harvest 1 tonne of fresh ginger.', target:1, progress:0, reward:50_000, complete:false },
  { id:'process', title:'Add value', description:'Process 0.5 tonnes of fresh ginger.', target:.5, progress:0, reward:75_000, complete:false },
  { id:'sell', title:'Make your first sale', description:'Earn ₦250,000 from ginger sales.', target:250_000, progress:0, reward:100_000, complete:false },
];

export function createInitialPlots(): Plot[] {
  return Array.from({length:PLOT_COUNT},(_,i)=>({id:i,x:i%4,z:Math.floor(i/4),status:'empty',growth:0,moisture:48,health:100}));
}
export function initialState(): GameState {
  return { day:1,cash:STARTING_CASH,energy:100,xp:0,reputation:10,level:1,plots:createInitialPlots(),freshGinger:0,driedGinger:0,gingerPowder:0,processing:0,warehouse:2,workers:0,weather:'sunny',marketPrice:2_900_000,lastRevenue:0,totalRevenue:0,totalExports:0,missions:baseMissions.map(m=>({...m})),toast:'Welcome to your first ginger season.' };
}

function mission(s:GameState, id:string, amount:number): GameState {
  let reward = 0;
  const missions = s.missions.map(m => {
    if(m.id !== id || m.complete) return m;
    const progress = Math.min(m.target,m.progress+amount);
    const complete = progress >= m.target;
    if(complete) reward += m.reward;
    return {...m,progress,complete};
  });
  if(!reward) return {...s,missions};
  return {...s,missions,cash:s.cash+reward,xp:s.xp+40,reputation:s.reputation+1,toast:`Mission complete. +₦${reward.toLocaleString()}`};
}

function levelFromXp(xp:number){ return Math.min(10,1+Math.floor(xp/250)); }
export function preparePlot(s:GameState,id:number):GameState {
  const p=s.plots.find(x=>x.id===id);
  if(!p||p.status!=='empty') return {...s,toast:'That plot is not available.'};
  if(s.energy<5) return {...s,toast:'You are out of energy. Advance the day.'};
  if(s.cash<PREPARE_COST) return {...s,toast:'Not enough cash to prepare this plot.'};
  return {...s,cash:s.cash-PREPARE_COST,energy:s.energy-5,plots:s.plots.map(x=>x.id===id?{...x,status:'prepared'}:x),toast:'Plot prepared. Plant ginger next.'};
}
export function plantPlot(s:GameState,id:number):GameState {
  const p=s.plots.find(x=>x.id===id);
  if(!p||p.status!=='prepared') return {...s,toast:'Prepare the soil before planting.'};
  if(s.energy<4) return {...s,toast:'You are out of energy. Advance the day.'};
  const next={...s,energy:s.energy-4,plots:s.plots.map(x=>x.id===id?{...x,status:'planted',growth:0,health:100}:x),toast:'Ginger planted. Advance the day to grow it.'};
  const planted=next.plots.filter(p=>['planted','growing','ready'].includes(p.status)).length;
  return mission(next,'plant',planted);
}

export function advanceDay(s:GameState, roll=Math.random()):GameState {
  const weather:Weather = roll>.82?'storm':roll>.55?'rain':'sunny';
  const plots=s.plots.map(p=>{
    if(!['planted','growing'].includes(p.status)) return p;
    const growth=Math.min(100,p.growth+(weather==='storm'?12:weather==='rain'?23:18));
    const moisture=Math.max(20,Math.min(95,p.moisture+(weather==='storm'?35:weather==='rain'?22:-11)));
    const health=Math.max(35,Math.min(100,p.health+(moisture>82?-5:moisture<30?-3:1)));
    return {...p,status:growth>=100?'ready':'growing',growth,moisture,health};
  });
  const marketShift = weather==='storm' ? 1.08 : weather==='rain' ? .99 : 1.01;
  const marketPrice=Math.round(Math.max(1_900_000,Math.min(3_800_000,s.marketPrice*marketShift)));
  const next={...s,day:s.day+1,energy:100,plots,weather,marketPrice,xp:s.xp+5,level:levelFromXp(s.xp+5),toast:weather==='storm'?'Storm warning. Inspect drainage and protect harvested stock.':weather==='rain'?'Rain across the farm. Moisture is rising.':'Clear weather. Your crops are growing steadily.'};
  return next;
}
export function harvestPlot(s:GameState,id:number):GameState {
  const p=s.plots.find(x=>x.id===id);
  if(!p||p.status!=='ready') return {...s,toast:'This crop is not ready for harvest.'};
  if(s.energy<6) return {...s,toast:'You are out of energy. Advance the day.'};
  const tonnes=GINGER_PER_PLOT*(p.health/100);
  const next={...s,energy:s.energy-6,freshGinger:s.freshGinger+tonnes,plots:s.plots.map(x=>x.id===id?{...x,status:'empty',growth:0,health:100}:x),xp:s.xp+20,level:levelFromXp(s.xp+20),toast:`Harvested ${tonnes.toFixed(2)}t fresh ginger.`};
  return mission(next,'harvest',tonnes);
}
export function processGinger(s:GameState):GameState {
  if(s.freshGinger<.5) return {...s,toast:'You need at least 0.5t of fresh ginger.'};
  if(s.cash<PROCESS_COST) return {...s,toast:'Not enough cash for processing.'};
  const tonnes=Math.min(s.freshGinger,Math.min(2,s.warehouse));
  const dried=tonnes*.22;
  const next={...s,cash:s.cash-PROCESS_COST,freshGinger:s.freshGinger-tonnes,driedGinger:s.driedGinger+dried,processing:s.processing+tonnes,xp:s.xp+35,level:levelFromXp(s.xp+35),reputation:s.reputation+1,toast:`Processed ${tonnes.toFixed(2)}t fresh ginger into ${dried.toFixed(2)}t dried ginger.`};
  return mission(next,'process',tonnes);
}
export function gradeForHealth(health:number):QualityGrade{return health>=85?'A':health>=65?'B':'C';}
export function sellDried(s:GameState):GameState {
  if(s.driedGinger<=0) return {...s,toast:'No dried ginger is ready for sale.'};
  const grade=gradeForHealth(Math.min(100,70+s.reputation));
  const multiplier=grade==='A'?1.08:grade==='B'?.92:.72;
  const revenue=Math.round(s.driedGinger*s.marketPrice*multiplier);
  const next={...s,cash:s.cash+revenue,lastRevenue:revenue,totalRevenue:s.totalRevenue+revenue,driedGinger:0,xp:s.xp+60,level:levelFromXp(s.xp+60),reputation:s.reputation+3,toast:`Buyer accepted your ${grade}-grade dried ginger for ₦${revenue.toLocaleString()}.`};
  return mission(next,'sell',revenue);
}
export function hireWorker(s:GameState):GameState {
  if(s.cash<WORKER_COST) return {...s,toast:'Not enough cash to hire a worker.'};
  return {...s,cash:s.cash-WORKER_COST,workers:s.workers+1,reputation:s.reputation+1,toast:'Worker hired. Future seasons will have more productive operations.'};
}
export function upgradeWarehouse(s:GameState):GameState {
  if(s.cash<WAREHOUSE_COST) return {...s,toast:'You need ₦150,000 for a warehouse upgrade.'};
  return {...s,cash:s.cash-WAREHOUSE_COST,warehouse:s.warehouse+3,reputation:s.reputation+2,toast:'Warehouse upgraded. Processing capacity increased.'};
}
