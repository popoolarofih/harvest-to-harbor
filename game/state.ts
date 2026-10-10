import {
  BASE_ENERGY, BASE_PRICES, FUEL_PRICE, PLOT_COLS, PLOT_ROWS, PREP, STARTING_CASH, TANK_BASE_LITRES, TANK_UPGRADE_LITRES,
  WAREHOUSE_BASE_KG, WAREHOUSE_UPGRADE_KG, WORKER_ENERGY,
} from './config';
import { createRng } from './rng';
import type { GameState, LogLine, Mission, Plot } from './types';
import { buildForecast, initialWeatherQueue } from './weather';

const LOG_LIMIT = 60;

const baseMissions: Mission[] = [
  { id: 'plant', title: 'Start the season', description: 'Plant ginger on 4 plots.', target: 4, progress: 0, reward: 25_000, complete: false },
  { id: 'harvest', title: 'First harvest', description: 'Harvest 1,000 kg of fresh ginger.', target: 1_000, progress: 0, reward: 50_000, complete: false },
  { id: 'dry', title: 'Add value', description: 'Sun-dry 500 kg of fresh ginger.', target: 500, progress: 0, reward: 75_000, complete: false },
  { id: 'sell', title: 'Make your first sales', description: 'Earn ₦250,000 from ginger sales.', target: 250_000, progress: 0, reward: 100_000, complete: false },
];

/** Terrain is fixed: row D sits low by the stream (wet, fertile), row A is upland (dry, lean). */
export function createInitialPlots(): Plot[] {
  const rows = [
    { drainage: 0.85, fertility: 45, moisture: 38 },
    { drainage: 0.65, fertility: 55, moisture: 45 },
    { drainage: 0.45, fertility: 62, moisture: 55 },
    { drainage: 0.25, fertility: 72, moisture: 65 },
  ];
  return Array.from({ length: PLOT_COLS * PLOT_ROWS }, (_, id) => {
    const x = id % PLOT_COLS, z = Math.floor(id / PLOT_COLS), row = rows[z];
    return {
      id, x, z, status: 'empty', drainage: row.drainage, fertility: row.fertility + (x % 2 ? 4 : -3), moisture: row.moisture,
      health: 100, growth: 0, ridged: false, seed: null, stand: 0, germinated: false, daysReady: 0, issue: null,
    };
  });
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
    upgrades: { irrigation: false, warehouseLevel: 0, tankLevel: 0, insurance: false },
    weather: 'sunny', weatherQueue, forecast,
    market: { ...BASE_PRICES }, priceHistory: [{ day: 1, ...BASE_PRICES }],
    events: [], log: [{ day: 1, text: 'Your uncle hands you 2 hectares outside Kafanchan. The season starts now.', severity: 'info' }],
    lastReport: null, lastInspection: null,
    finance: { revenue: 0, expenses: 0, wages: 0, insurancePremiums: 0, insurancePayouts: 0 },
    missions: baseMissions.map(m => ({ ...m })),
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
export const levelFromXp = (xp: number) => Math.min(10, 1 + Math.floor(xp / 250));

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
export function addXp(s: GameState, xp: number): GameState {
  return { ...s, xp: s.xp + xp, level: levelFromXp(s.xp + xp) };
}
export function log(s: GameState, ...lines: LogLine[]): GameState {
  return { ...s, log: [...lines.map(l => ({ ...l, day: s.day })).reverse(), ...s.log].slice(0, LOG_LIMIT) };
}
export function updatePlot(s: GameState, id: number, patch: Partial<Plot>): GameState {
  return { ...s, plots: s.plots.map(p => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Advances a mission by `amount` (or sets it with `absolute`) and pays the reward on completion. */
export function progressMission(s: GameState, id: string, amount: number, absolute = false): GameState {
  let reward = 0, title = '';
  const missions = s.missions.map(m => {
    if (m.id !== id || m.complete) return m;
    const progress = Math.min(m.target, absolute ? amount : m.progress + amount);
    const complete = progress >= m.target;
    if (complete) { reward += m.reward; title = m.title; }
    return { ...m, progress, complete };
  });
  if (!reward) return { ...s, missions };
  const next = addXp({ ...s, missions, cash: s.cash + reward, reputation: s.reputation + 1, toast: `Mission complete: ${title}. +${money(reward)}` }, 40);
  return log(next, { text: `Mission complete: ${title} (+${money(reward)}).`, severity: 'good' });
}
