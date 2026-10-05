'use client';
import {create} from 'zustand';
import {advanceDay, harvestPlot, hireWorker, initialState, plantPlot, preparePlot, processGinger, sellDried, upgradeWarehouse} from '../game/simulation';
import type {GameState} from '../game/types';
interface Actions { prepare:(id:number)=>void; plant:(id:number)=>void; advance:()=>void; harvest:(id:number)=>void; process:()=>void; sell:()=>void; hire:()=>void; upgradeWarehouse:()=>void; clearToast:()=>void; reset:()=>void; }
export const useGameStore=create<GameState&Actions>((set)=>({...initialState(),prepare:(id)=>set(s=>preparePlot(s,id)),plant:(id)=>set(s=>plantPlot(s,id)),advance:()=>set(advanceDay),harvest:(id)=>set(s=>harvestPlot(s,id)),process:()=>set(s=>processGinger(s)),sell:()=>set(s=>sellDried(s)),hire:()=>set(s=>hireWorker(s)),upgradeWarehouse:()=>set(s=>upgradeWarehouse(s)),clearToast:()=>set({toast:''}),reset:()=>set(initialState())}));
