'use client';
import { create } from 'zustand';
import { SAVE_KEY, TRANSIENT_KEYS, UNREADABLE_KEY, parseSave, serializeSave, type LoadResult } from '../game/save';
import { GAME_KEYS, gameOf, metaOf, useGameStore, type Store } from './gameStore';

/** The subset of the Web Storage API the save system uses (localStorage in the browser, a Map in tests). */
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';
interface SaveStatus { state: SaveState; savedAt: number | null; error: string | null }

/** Save indicator state. Kept apart from the game store so saving never re-renders the HUD. */
export const useSaveStatus = create<SaveStatus>(() => ({ state: 'idle', savedAt: null, error: null }));

export type ReadResult = LoadResult | { kind: 'unavailable' };

/** Quiet period after the last change before writing, and the longest a change may wait during constant play. */
export const SAVE_DEBOUNCE_MS = 800;
export const SAVE_MAX_WAIT_MS = 4000;

/** Fields whose change means there is progress to save: the simulation (minus presentation) plus saved UI meta. */
const WATCHED: (keyof Store)[] = [...GAME_KEYS.filter(k => !(TRANSIENT_KEYS as readonly string[]).includes(k)), 'reportSeenDay', 'tutorial'];

let kv: KeyValueStore | null | undefined;
let enabled = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingSince: number | null = null;

/** localStorage if this browser lets us use it (private modes and blocked site data may not), else null. */
function browserStorage(): KeyValueStore | null {
  try {
    const ls = window.localStorage, probe = 'h2h.probe';
    ls.setItem(probe, '1'); ls.removeItem(probe);
    return ls;
  } catch { return null; }
}

function storage(): KeyValueStore | null {
  if (kv === undefined) kv = typeof window === 'undefined' ? null : browserStorage();
  return kv;
}

/** Tests inject an in-memory store; pass `undefined` to go back to detecting localStorage. */
export function setStorage(store: KeyValueStore | null | undefined) { kv = store; }

export const storageAvailable = () => storage() !== null;

const setStatus = (patch: Partial<SaveStatus>) => {
  const cur = useSaveStatus.getState();
  if (Object.entries(patch).some(([k, v]) => cur[k as keyof SaveStatus] !== v)) useSaveStatus.setState(patch);
};

function describeError(e: unknown): string {
  const err = e as { name?: string; code?: number };
  if (err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err?.code === 22) {
    return 'Browser storage is full. Free some space for this site, or progress since the last save will be lost.';
  }
  return 'The browser refused to save. Progress since the last save will be lost if you close this tab.';
}

/** Reads the save slot. An unreadable save is copied aside first so nothing later can overwrite the only copy. */
export function readSave(): ReadResult {
  const store = storage();
  if (!store) return { kind: 'unavailable' };
  let raw: string | null;
  try { raw = store.getItem(SAVE_KEY); } catch { return { kind: 'unavailable' }; }
  const result = parseSave(raw);
  if (result.kind === 'invalid') {
    try { if (store.getItem(UNREADABLE_KEY) !== result.raw) store.setItem(UNREADABLE_KEY, result.raw); } catch { /* the original is still in the main slot */ }
  }
  if (result.kind === 'ok') setStatus({ savedAt: result.save.savedAt });
  return result;
}

/** The preserved copy of the last save that failed to load, if any. */
export function readUnreadable(): string | null {
  try { return storage()?.getItem(UNREADABLE_KEY) ?? null; } catch { return null; }
}

/** Writes the current game immediately. Returns false (and sets an error status) if the browser refused. */
export function saveNow(): boolean {
  if (timer) { clearTimeout(timer); timer = null; }
  pendingSince = null;
  const store = storage();
  if (!store) { setStatus({ state: 'error', error: 'This browser is blocking site storage, so progress can\'t be saved.' }); return false; }
  const now = Date.now(), s = useGameStore.getState();
  try {
    store.setItem(SAVE_KEY, serializeSave(gameOf(s), metaOf(s), now));
    setStatus({ state: 'saved', savedAt: now, error: null });
    return true;
  } catch (e) {
    setStatus({ state: 'error', error: describeError(e) });
    return false;
  }
}

/** Writes now if a change is waiting. Safe to call any time (page hide, leaving to the menu). */
export function flushSave() { if (enabled && pendingSince !== null) saveNow(); }

function schedule() {
  const now = Date.now();
  if (pendingSince === null) pendingSince = now;
  setStatus({ state: 'pending' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(saveNow, Math.max(0, Math.min(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS - (now - pendingSince))));
}

/**
 * Autosave only runs while a game is being played. Until the player picks Continue or New Season
 * the store may hold a preview or a fresh default game, which must never overwrite the save slot.
 */
export function setAutosave(on: boolean) {
  if (!on) { flushSave(); if (timer) clearTimeout(timer); timer = null; pendingSince = null; }
  enabled = on;
}

export function deleteSave() {
  setAutosave(false);
  try { storage()?.removeItem(SAVE_KEY); } catch { /* nothing to delete */ }
  setStatus({ state: 'idle', savedAt: null, error: null });
}

let installed = false;
/** Subscribes autosave to the game store and to page lifecycle events. Idempotent. */
export function installAutosave() {
  if (installed) return;
  installed = true;
  // Every sim action returns new objects only for the fields it changed, so a reference check is enough
  // and cheap: per-frame UI updates (nearby target, fx) don't touch any watched field.
  useGameStore.subscribe((s, prev) => { if (enabled && WATCHED.some(k => s[k] !== prev[k])) schedule(); });
  if (typeof window === 'undefined') return;
  // Best effort on the way out; the debounced writes above don't depend on these firing.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
}
