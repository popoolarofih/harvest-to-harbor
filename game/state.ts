import {
  COMPOUND_SITES, compoundSite, BASE_ENERGY, BASE_PRICES, DEFAULT_PROFILE, FX_BASE, FUEL_PRICE, LITRES_PER_FUEL_LITRE, PLOT_COLS, PLOT_ROWS, PREP, STARTING_CASH, TANK_BASE_LITRES, TANK_UPGRADE_LITRES,
  WAREHOUSE_BASE_KG, WAREHOUSE_UPGRADE_KG, WORKER_ENERGY,
} from './config';
import { createRng } from './rng';
import { initialMissions } from './campaign';
import { describeLevelUp, levelFromXp } from './levels';
import { CAMPAIGN } from './missions';
import type { CompoundSiteId, GameState, LogLine, PlayerProfile, Plot } from './types';
import { buildForecast, initialWeatherQueue } from './weather';
import { calculateCrewPerks, generateInitialCandidates } from './workers';

const LOG_LIMIT = 60;

/** Terrain is fixed: row D sits low by the stream (wet, fertile), row A is upland (dry, lean). */
const ROWS = [
  { drainage: 0.85, fertility: 45, moisture: 38 },
  { drainage: 0.65, fertility: 55, moisture: 45 },
  { drainage: 0.45, fertility: 62, moisture: 55 },
  { drainage: 0.25, fertility: 72, moisture: 65 },
];

export function makePlot(id: number, x: number, z: number, compound?: CompoundSiteId): Plot {
  const site = compound ? compoundSite(compound).rows[z] : null;
  const row = site ?? ROWS[z];
  const plot: Plot = {
    id, x, z, status: 'empty', drainage: row.drainage, fertility: row.fertility + (x % 2 ? 4 : -3), moisture: row.moisture,
    health: 100, growth: 0, ridged: false, seed: null, stand: 0, germinated: false, daysReady: 0, issue: null,
    organicMatter: (site?.organicMatter ?? 35 + z * 3) + (x % 2 ? 2 : -2),
    compaction: 20 - (z * 2),
    diseasePressure: { rot: 0, leafSpot: 0, pest: 0 },
    cropHistory: [],
  };
  return compound ? { ...plot, compound } : plot;
}

export function createInitialPlots(): Plot[] {
  return Array.from({ length: PLOT_COLS * PLOT_ROWS }, (_, id) => makePlot(id, id % PLOT_COLS, Math.floor(id / PLOT_COLS)));
}

/** A leased hectare adds two more columns of beds east of a field. Plot ids always equal their index in `plots`. */
export function leasedPlots(startId: number, compound?: CompoundSiteId, firstCol = PLOT_COLS): Plot[] {
  return [firstCol, firstCol + 1].flatMap((x, ci) => Array.from({ length: PLOT_ROWS }, (_, z) => makePlot(startId + ci * PLOT_ROWS + z, x, z, compound)));
}

/** The 16 beds of a newly bought compound. */
export function compoundPlots(startId: number, compound: CompoundSiteId): Plot[] {
  return Array.from({ length: PLOT_COLS * PLOT_ROWS }, (_, i) => makePlot(startId + i, i % PLOT_COLS, Math.floor(i / PLOT_COLS), compound));
}

/** Beds on one farm: the home farm when `compound` is undefined. */
export const plotsAt = (plots: Plot[], compound?: CompoundSiteId) => plots.filter(p => p.compound === compound);

export function initialState(seed = 20261010): GameState {
  const rng = createRng(seed);
  const weatherQueue = initialWeatherQueue(rng);
  const forecast = buildForecast(rng, weatherQueue, 1);
  return {
    day: 1, cash: STARTING_CASH, energy: BASE_ENERGY, xp: 0, reputation: 10, level: 1,
    rng: rng.state(),
    plots: createInitialPlots(), batches: [], dryingJobs: [], nextId: 1,
    water: TANK_BASE_LITRES, irrigationCondition: 100,
    automation: {
      irrigationThreshold: 45,
      irrigationDailyLimit: 4,
      autoPump: false,
      autoFertilize: false,
      fertilizerDailyLimit: 2,
      autoCoverRacks: false,
      fieldWorkers: 0,
      autoPlant: false,
      prepMethod: 'ridge',
      plantSeed: 'improved',
      autoMaintain: true,
      autoWater: true,
      autoTreat: true,
      autoGapFill: true,
      autoHarvest: true,
      processingWorkers: 0,
      autoOpenRacks: true,
      autoBagRacks: false,
      bagPackaging: 'bulk',
      autoMill: false,
      millPackaging: 'sealed',
      autoReserve: false,
      autoShip: false,
    },
    stock: { local: 0, improved: 0, certified: 0, soybean: 0, fertilizer: 0, compost: 0 },
    opSeq: 1,
    workers: 0,
    crew: [],
    candidates: generateInitialCandidates(rng),
    ledger: [],
    prestige: [],
    recurringGoals: [],
    cooperativeEvents: [],
    coopRoadBenefitDays: 0,
    sandboxMode: false,
    difficulty: 'normal',
    upgrades: {
      irrigation: false, warehouseLevel: 0, tankLevel: 0, insurance: false, mill: false, solarDryer: false, factory: false, landLeased: 0,
      solarPump: false, tractor: false, digger: false, companyTruck: false, exportOffice: false,
    },
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
    contracts: [], shipments: [], loans: [], compounds: [], creditBlocked: false, levelUp: null,
    toast: 'Welcome to your first ginger season.',
    profile: { ...DEFAULT_PROFILE },
  };
}

export const plotName = (p: Pick<Plot, 'x' | 'z'> & { compound?: CompoundSiteId }) =>
  `${p.compound ? `${compoundSite(p.compound).code}-` : ''}${'ABCD'[p.z]}${p.x + 1}`;
export const COMPOUND_IDS = COMPOUND_SITES.map(c => c.id);
export const effectiveDrainage = (p: Plot) =>
  Math.max(0.1, Math.min(1, (p.drainage + (p.ridged ? PREP.ridge.drainageBonus : 0)) * (1 - (p.compaction ?? 20) * 0.003)));
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export const tankCapacity = (s: GameState) => TANK_BASE_LITRES + s.upgrades.tankLevel * TANK_UPGRADE_LITRES;
export const warehouseCapacity = (s: GameState) => WAREHOUSE_BASE_KG + s.upgrades.warehouseLevel * WAREHOUSE_UPGRADE_KG;
export const stockKg = (s: GameState) =>
  s.stock
    ? (s.stock.local ?? 0) * 20 +
      (s.stock.improved ?? 0) * 20 +
      (s.stock.certified ?? 0) * 20 +
      (s.stock.soybean ?? 0) * 15 +
      (s.stock.fertilizer ?? 0) * 50 +
      (s.stock.compost ?? 0) * 25
    : 0;
export const storedKg = (s: GameState) => s.batches.reduce((sum, b) => sum + b.kg, 0) + stockKg(s);
export const hasEvent = (s: GameState, kind: GameState['events'][number]['kind']) => s.events.find(e => e.kind === kind);
/** Diesel to refill the tank from empty-ish; zero with a solar pump. */
export const pumpCost = (s: GameState, litres: number) => (s.upgrades.solarPump ? 0 : Math.round(Math.ceil(litres / LITRES_PER_FUEL_LITRE) * fuelPrice(s)));
export const fuelPrice = (s: GameState) => FUEL_PRICE * (hasEvent(s, 'fuelSpike')?.magnitude ?? 1);
export const availableWorkers = (s: GameState) => Math.floor(s.workers * (hasEvent(s, 'workerShortage')?.magnitude ?? 1));
export const maxEnergy = (s: GameState) => BASE_ENERGY + availableWorkers(s) * WORKER_ENERGY + calculateCrewPerks(s.crew ?? []).extraEnergy;

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

export function updateProfile(s: GameState, patch: Partial<PlayerProfile>): GameState {
  return { ...s, profile: { ...s.profile, ...patch }, toast: 'Profile updated.' };
}
