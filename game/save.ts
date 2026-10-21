// Versioned save format. Plain TypeScript (no browser APIs) so it can be unit-tested in node;
// the browser storage adapter lives in stores/persistence.ts.
import { CAMPAIGN } from './missions';
import { pruneReservations } from './contracts';
import { DEFAULT_PROFILE } from './config';
import { initialState } from './state';
import { TUTORIAL_STATUSES, type TutorialProgress } from './tutorial';
import type { GameState } from './types';

export const SAVE_VERSION = 5;
export const SAVE_KEY = 'h2h.save';
/** Where an unreadable save is copied before anything else may overwrite the main slot. */
export const UNREADABLE_KEY = 'h2h.save.unreadable';

/** GameState fields that are presentation, not progress: never written, reset on load. */
export const TRANSIENT_KEYS = ['toast', 'lastInspection'] as const;

/** Store state that isn't part of the simulation but must survive a reload. */
export interface SaveMeta {
  /** Day of the morning report the player dismissed, so it doesn't pop up again. */
  reportSeenDay: number;
  tutorial: TutorialProgress;
}

export interface SaveFile { version: number; savedAt: number; game: GameState; meta: SaveMeta }

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; save: SaveFile; migratedFrom: number | null }
  | { kind: 'invalid'; reason: string; raw: string };

type Json = Record<string, unknown>;
/** Step `n` upgrades a version-n save to version n + 1. Add one whenever the saved shape changes. */
export type Migration = (data: Json) => Json;
export const MIGRATIONS: Record<number, Migration> = {
  1: (data: Json) => {
    const game = data.game as Json;
    return {
      ...data,
      game: {
        ...game,
        profile: { ...DEFAULT_PROFILE, ...((game?.profile as Json) || {}) },
      },
    };
  },
  2: (data: Json) => {
    const game = data.game as Json;
    return {
      ...data,
      game: {
        ...game,
        irrigationCondition: typeof game?.irrigationCondition === 'number' ? game.irrigationCondition : 100,
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
          autoHarvest: false,
          processingWorkers: 0,
          autoOpenRacks: true,
          autoBagRacks: false,
          bagPackaging: 'bulk',
          autoMill: false,
          millPackaging: 'sealed',
          autoReserve: false,
          ...((game?.automation as Json) || {}),
        },
        stock: { local: 0, improved: 0, certified: 0, soybean: 0, fertilizer: 0, compost: 0, ...((game?.stock as Json) || {}) },
        opSeq: typeof game?.opSeq === 'number' ? game.opSeq : 1,
        crew: Array.isArray(game?.crew) ? game.crew : [],
        candidates: Array.isArray(game?.candidates) ? game.candidates : [],
        ledger: Array.isArray(game?.ledger) ? game.ledger : [],
        prestige: Array.isArray(game?.prestige) ? game.prestige : [],
        recurringGoals: Array.isArray(game?.recurringGoals) ? game.recurringGoals : [],
        cooperativeEvents: Array.isArray(game?.cooperativeEvents) ? game.cooperativeEvents : [],
        coopRoadBenefitDays: typeof game?.coopRoadBenefitDays === 'number' ? game.coopRoadBenefitDays : 0,
        sandboxMode: typeof game?.sandboxMode === 'boolean' ? game.sandboxMode : false,
        difficulty: typeof game?.difficulty === 'string' ? game.difficulty : 'normal',
        lastReport: game?.lastReport ? { ...(game.lastReport as Json), automation: (game.lastReport as Json).automation ?? { irrigatedPlots: 0, irrigationLitres: 0, pumpedLitres: 0, pumpingCost: 0, fertilizedPlots: 0, fertilizerCost: 0, coveredRacks: 0, irrigationNeedsRepair: false } } : null,
      },
    };
  },
  // v4: new equipment, farm compounds, export office auto-shipping. Field crews now harvest by default.
  3: (data: Json) => {
    const game = data.game as Json;
    return {
      ...data,
      game: {
        ...game,
        upgrades: { solarPump: false, tractor: false, digger: false, companyTruck: false, exportOffice: false, ...((game?.upgrades as Json) || {}) },
        automation: { ...((game?.automation as Json) || {}), autoHarvest: true, autoShip: false },
        compounds: Array.isArray(game?.compounds) ? game.compounds : [],
      },
    };
  },
  // v5: Hauwa, the drying & quality supervisor, joins the farm.
  4: (data: Json) => {
    const game = data.game as Json;
    const flags = (game?.flags as Json) || {};
    return { ...data, game: { ...game, flags: { ...flags, talked: { hauwa: 0, ...((flags.talked as Json) || {}) } } } };
  },
};

export function serializeSave(game: GameState, meta: SaveMeta, now = Date.now()): string {
  const persisted: Json = { ...game };
  for (const k of TRANSIENT_KEYS) delete persisted[k];
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now, game: persisted, meta });
}

/** The state to resume from: the saved simulation plus fresh values for presentation-only fields. */
export function restoreGame(save: SaveFile): GameState {
  const g: GameState = { ...save.game, toast: '', lastInspection: null };
  return pruneReservations(g);
}

const kindOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Paths that may be null even though the fresh-game template has a value there. Array elements use `[]`. */
const NULLABLE = new Set(['story', 'story.speaker', 'missions[].npc']);
/** Arrays that start empty, so the template can't describe their elements: required keys instead. */
const ELEMENT_KEYS: Record<string, string[]> = {
  batches: ['id', 'product', 'kg', 'quality', 'moisture'],
  dryingJobs: ['id', 'freshKg', 'dryMatterKg', 'moisture', 'quality', 'days'],
  events: ['kind', 'daysLeft', 'magnitude'],
  contracts: ['id', 'buyerId', 'kg', 'status', 'deadlineDay'],
  shipments: ['id', 'contractId', 'stage', 'daysLeft'],
  loans: ['id', 'balance', 'dueDay'],
  crew: ['id', 'name', 'role', 'level'],
  candidates: ['id', 'name', 'role', 'hireCost'],
  ledger: ['id', 'day', 'category', 'amount'],
  prestige: ['id', 'title', 'category'],
  recurringGoals: ['id', 'title', 'targetKg'],
  cooperativeEvents: ['id', 'type', 'status'],
  compounds: ['site', 'boughtDay', 'leases'],
};
const SKIP = new Set<string>(TRANSIENT_KEYS);

/** Compares a value against the shape of a fresh game. Returns the first problem found, or null. */
function checkShape(value: unknown, template: unknown, path: string): string | null {
  const tk = kindOf(template), vk = kindOf(value);
  if (value === undefined) return `missing ${path}`;
  // Template null means "nothing yet" (e.g. no report, no seed): accept null or any concrete value.
  if (tk === 'null') return null;
  if (vk === 'null' && NULLABLE.has(path)) return null;
  if (vk !== tk) return `${path} should be ${tk}, found ${vk}`;
  if (vk === 'number' && !Number.isFinite(value)) return `${path} is not a finite number`;
  if (vk === 'object') {
    const v = value as Json, t = template as Json;
    for (const key of Object.keys(t)) {
      const p = path ? `${path}.${key}` : key;
      if (SKIP.has(p)) continue;
      const err = checkShape(v[key], t[key], p);
      if (err) return err;
    }
  }
  if (vk === 'array') {
    const v = value as unknown[], t = template as unknown[];
    const required = ELEMENT_KEYS[path];
    for (let i = 0; i < v.length; i++) {
      if (t.length) { const err = checkShape(v[i], t[0], `${path}[]`); if (err) return err.replace('[]', `[${i}]`); }
      else if (required) {
        if (kindOf(v[i]) !== 'object') return `${path}[${i}] should be object`;
        const missing = required.find(k => (v[i] as Json)[k] === undefined);
        if (missing) return `missing ${path}[${i}].${missing}`;
      }
    }
  }
  return null;
}

/** Structural and invariant checks on a saved game. Returns a reason it can't be loaded, or null. */
export function validateGame(game: unknown): string | null {
  const template = initialState();
  const shape = checkShape(game, template, '');
  if (shape) return shape;
  const g = game as GameState;
  if (!Number.isInteger(g.day) || g.day < 1) return 'day must be a whole number from 1';
  if (g.plots.length < template.plots.length) return 'plots are missing';
  if (g.plots.some((p, i) => p.id !== i)) return 'plot ids are out of order';
  if (g.missions.length !== CAMPAIGN.length || g.missions.some((m, i) => m.id !== CAMPAIGN[i].id)) return 'missions do not match this campaign';
  const ids = [...g.batches, ...g.dryingJobs, ...g.contracts, ...g.shipments, ...g.loans].map(x => x.id);
  if (ids.some(id => id >= g.nextId)) return 'an item id is ahead of nextId';
  return null;
}

function validateMeta(meta: unknown): string | null {
  if (kindOf(meta) !== 'object') return 'meta should be object';
  const m = meta as Json;
  if (typeof m.reportSeenDay !== 'number') return 'meta.reportSeenDay should be number';
  const t = m.tutorial as Json | undefined;
  if (kindOf(t) !== 'object' || !TUTORIAL_STATUSES.includes(t!.status as never) || !Number.isInteger(t!.step)) return 'meta.tutorial is malformed';
  return null;
}

/** Runs registered migrations until the data reaches `target`. Throws if a step is missing. */
export function migrate(data: Json, from: number, migrations: Record<number, Migration> = MIGRATIONS, target = SAVE_VERSION): Json {
  let out = data;
  for (let v = from; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`no migration from version ${v}`);
    out = { ...step(out), version: v + 1 };
  }
  return out;
}

/** Reads raw storage text into a loadable save, or explains why it can't be loaded. Never throws. */
export function parseSave(raw: string | null, migrations: Record<number, Migration> = MIGRATIONS, target = SAVE_VERSION): LoadResult {
  if (raw === null || raw === '') return { kind: 'none' };
  const invalid = (reason: string): LoadResult => ({ kind: 'invalid', reason, raw });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return invalid('the save file is not valid JSON'); }
  if (kindOf(data) !== 'object') return invalid('the save file is not an object');
  const version = (data as Json).version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return invalid('the save has no version');
  if (version > target) return invalid(`the save is from a newer version of the game (v${version})`);
  let migrated: Json;
  try { migrated = migrate(data as Json, version, migrations, target); } catch (e) { return invalid(`the save can't be upgraded: ${(e as Error).message}`); }
  if (migrated.game && typeof migrated.game === 'object') {
    const g = migrated.game as Json;
    if (g.automation && typeof g.automation === 'object') {
      g.automation = {
        fieldWorkers: 0,
        autoPlant: false,
        prepMethod: 'ridge',
        plantSeed: 'improved',
        autoMaintain: true,
        autoWater: true,
        autoTreat: true,
        autoGapFill: true,
        autoHarvest: false,
        processingWorkers: 0,
        autoOpenRacks: true,
        autoBagRacks: false,
        bagPackaging: 'bulk',
        autoMill: false,
        millPackaging: 'sealed',
        autoReserve: false,
        ...(g.automation as Json),
      };
    }
    g.stock = { local: 0, improved: 0, certified: 0, soybean: 0, fertilizer: 0, compost: 0, ...((g.stock as Json) || {}) };
    g.opSeq = typeof g.opSeq === 'number' ? g.opSeq : 1;
    if (!Array.isArray(g.crew)) g.crew = [];
    if (!Array.isArray(g.candidates)) g.candidates = [];
    if (!Array.isArray(g.ledger)) g.ledger = [];
    if (!Array.isArray(g.prestige)) g.prestige = [];
    if (!Array.isArray(g.recurringGoals)) g.recurringGoals = [];
    if (!Array.isArray(g.cooperativeEvents)) g.cooperativeEvents = [];
    if (typeof g.coopRoadBenefitDays !== 'number') g.coopRoadBenefitDays = 0;
    if (typeof g.sandboxMode !== 'boolean') g.sandboxMode = false;
    if (typeof g.difficulty !== 'string') g.difficulty = 'normal';
  }
  const problem = validateGame(migrated.game) ?? validateMeta(migrated.meta);
  if (problem) return invalid(problem);
  return { kind: 'ok', save: migrated as unknown as SaveFile, migratedFrom: version === target ? null : version };
}
