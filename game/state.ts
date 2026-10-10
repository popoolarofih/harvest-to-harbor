import {
  BASE_ENERGY, BASE_PRICES, FX_BASE, FUEL_PRICE, PLOT_COLS, PLOT_ROWS, PREP, STARTING_CASH, TANK_BASE_LITRES, TANK_UPGRADE_LITRES,
  WAREHOUSE_BASE_KG, WAREHOUSE_UPGRADE_KG, WORKER_ENERGY,
} from './config';
import { createRng } from './rng';
import { initialMissions } from './campaign';
import { describeLevelUp, levelFromXp } from './levels';
import { CAMPAIGN } from './missions';
import type { GameState, LogLine, Plot } from './types';
import { buildForecast, initialWeatherQueue } from './weather';

const LOG_LIMIT = 60;

/** Terrain is fixed: row D sits low by the stream (wet, fertile), row A is upland (dry, lean). */
const ROWS = [
  { drainage: 0.85, fertility: 45, moisture: 38 },
  { drainage: 0.65, fertility: 55, moisture: 45 },
  { drainage: 0.45, fertility: 62, moisture: 55 },
  { drainage: 0.25, fertility: 72, moisture: 65 },
];

export function makePlot(id: number, x: number, z: number): Plot {
  const row = ROWS[z];
  return {
    id, x, z, status: 'empty', drainage: row.drainage, fertility: row.fertility + (x % 2 ? 4 : -3), moisture: row.moisture,
    health: 100, growth: 0, ridged: false, seed: null, stand: 0, germinated: false, daysReady: 0, issue: null,
  };
}

export function createInitialPlots(): Plot[] {
  return Array.from({ length: PLOT_COLS * PLOT_ROWS }, (_, id) => makePlot(id, id % PLOT_COLS, Math.floor(id / PLOT_COLS)));
}

/** A leased hectare adds two more columns of beds east of the field. */
export function leasedPlots(startId: number): Plot[] {
  return [PLOT_COLS, PLOT_COLS + 1].flatMap((x, ci) => Array.from({ length: PLOT_ROWS }, (_, z) => makePlot(startId + ci * PLOT_ROWS + z, x, z)));
}

export function initialState(seed = 20261010): GameState {
  const rng = createRng(seed);
  const weatherQueue = initialWeatherQueue(rng);
  const forecast = buildForecast(rng, weatherQueue, 1);
  return {
    day: 1, cash: STARTING_CASH, energy: BASE_ENERGY, xp: 0, reputation: 10, level: 1,
    rng: rng.state(),
    plots: createInitialPlots(), batches: [], dryingJobs: [], nextId: 1,
    water: TANK_BASE_LITRES, workers: 0,
    upgrades: { irrigation: false, warehouseLevel: 0, tankLevel: 0, insurance: false, mill: false, solarDryer: false, factory: false, landLeased: 0 },
    weather: 'sunny', weatherQueue, forecast,
    market: { ...BASE_PRICES }, fxRate: FX_BASE, priceHistory: [{ day: 1, ...BASE_PRICES }],
    events: [], log: [{ day: 1, text: 'Your uncle hands you 2 hectares outside Kafanchan. The season starts now.', severity: 'info' }],
    lastReport: null, lastInspection: null,
    finance: { revenue: 0, expenses: 0, wages: 0, insurancePremiums: 0, insurancePayouts: 0, interest: 0, maintenance: 0, logistics: 0 },
    missions: initialMissions(),
    stats: { harvestedKg: 0, freshSoldKg: 0, processedKg: 0, safeDriedKg: 0, powderKg: 0, exportedKg: 0 },
    flags: { talked: { baba: 0, amaka: 0, chinedu: 0 }, stormDay: null, stormOutcome: null, exportUnlocked: false, shipments: 0 },
    missionBase: 0,
    story: { speaker: CAMPAIGN[0].npc, title: `Mission 1: ${CAMPAIGN[0].title}`, text: CAMPAIGN[0].intro },
    contracts: [], shipments: [], loans: [], creditBlocked: false, levelUp: null,
    toast: 'Welcome to your first ginger season.',
  };
}

export const plotName = (p: Pick<Plot, 'x' | 'z'>) => `${'ABCD'[p.z]}${p.x + 1}`;
export const effectiveDrainage = (p: Plot) => Math.min(1, p.drainage + (p.ridged ? PREP.ridge.drainageBonus : 0));
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export const tankCapacity = (s: GameState) => TANK_BASE_LITRES + s.upgrades.tankLevel * TANK_UPGRADE_LITRES;
export const warehouseCapacity = (s: GameState) => WAREHOUSE_BASE_KG + s.upgrades.warehouseLevel * WAREHOUSE_UPGRADE_KG;
export const storedKg = (s: GameState) => s.batches.reduce((sum, b) => sum + b.kg, 0);
export const hasEvent = (s: GameState, kind: GameState['events'][number]['kind']) => s.events.find(e => e.kind === kind);
export const fuelPrice = (s: GameState) => FUEL_PRICE * (hasEvent(s, 'fuelSpike')?.magnitude ?? 1);
export const availableWorkers = (s: GameState) => Math.floor(s.workers * (hasEvent(s, 'workerShortage')?.magnitude ?? 1));
export const maxEnergy = (s: GameState) => BASE_ENERGY + availableWorkers(s) * WORKER_ENERGY;

/** Returns a reason the action can't happen, or null. */
export function blocked(s: GameState, need: { energy?: number; cash?: number }): string | null {
  if (need.energy && s.energy < need.energy) return 'Not enough energy today. Hire workers or advance the day.';
  if (need.cash && s.cash < need.cash) return `Not enough cash. You need ${money(need.cash)}.`;
  return null;
}
export const fail = (s: GameState, toast: string): GameState => ({ ...s, toast });

export function spend(s: GameState, cash: number, energy = 0): GameState {
  return { ...s, cash: s.cash - cash, energy: s.energy - energy, finance: { ...s.finance, expenses: s.finance.expenses + cash } };
}
export function earn(s: GameState, cash: number): GameState {
  return { ...s, cash: s.cash + cash, finance: { ...s.finance, revenue: s.finance.revenue + cash } };
}
/** Adds XP; crossing a level queues a level-up card listing what it unlocked. */
export function addXp(s: GameState, xp: number): GameState {
  const level = levelFromXp(s.xp + xp);
  if (level <= s.level) return { ...s, xp: s.xp + xp };
  const up = describeLevelUp(s.level, level);
  const merged = s.levelUp ? { ...up, unlocks: [...s.levelUp.unlocks, ...up.unlocks], title: up.title ?? s.levelUp.title } : up;
  return log({ ...s, xp: s.xp + xp, level, levelUp: merged }, { text: `Level ${level}${up.title ? `: ${up.title}` : ''}.${up.unlocks.length ? ` Unlocked: ${up.unlocks.join(', ')}.` : ''}`, severity: 'good' });
}
export function log(s: GameState, ...lines: LogLine[]): GameState {
  return { ...s, log: [...lines.map(l => ({ ...l, day: s.day })).reverse(), ...s.log].slice(0, LOG_LIMIT) };
}
export function updatePlot(s: GameState, id: number, patch: Partial<Plot>): GameState {
  return { ...s, plots: s.plots.map(p => (p.id === id ? { ...p, ...patch } : p)) };
}
