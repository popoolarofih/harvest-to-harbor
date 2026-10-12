'use client';
import { create } from 'zustand';
import { useGameStore } from './gameStore';
import { deleteSave, installAutosave, readSave, saveNow, setAutosave, type ReadResult } from './persistence';

/**
 * boot: server render and first client render, before storage has been read (keeps hydration stable).
 * title: main menu over the farm. intro: story cards for a new season. playing: the game and its HUD.
 */
export type Phase = 'boot' | 'title' | 'intro' | 'playing';
interface Session { phase: Phase; save: ReadResult | null }

export const useSession = create<Session>(() => ({ phase: 'boot', save: null }));
export const isPlaying = () => useSession.getState().phase === 'playing';

/** Client-only, once: read the save slot before anything is allowed to write to it. */
export function boot() {
  if (useSession.getState().phase !== 'boot') return;
  loadSettings();
  installAutosave();
  const save = readSave();
  // Show the player's own farm behind the title screen. Autosave is still off, so nothing is written.
  if (save.kind === 'ok') useGameStore.getState().loadGame(save.save);
  useSession.setState({ phase: 'title', save });
}

export function continueGame(): boolean {
  // Read again rather than trusting the boot copy: another tab may have saved since.
  const save = readSave();
  if (save.kind !== 'ok') { useSession.setState({ save }); return false; }
  useGameStore.getState().loadGame(save.save);
  setAutosave(true);
  useSession.setState({ phase: 'playing', save });
  return true;
}

/** The player has confirmed replacing any existing farm, so the new season becomes the save right away. */
export function startNewSeason() {
  useGameStore.getState().reset();
  setAutosave(true);
  saveNow();
  useSession.setState({ phase: 'intro', save: readSave() });
}

export function finishIntro(withTutorial: boolean) {
  if (!withTutorial) useGameStore.getState().skipTutorial();
  useSession.setState({ phase: 'playing' });
}

export function toTitle() {
  setAutosave(false); // flushes anything pending first
  useGameStore.getState().closeOverlays();
  useSession.setState({ phase: 'title', save: readSave() });
}

/** Deletes the save slot and leaves an unsaved fresh farm behind the title screen. */
export function resetSave() {
  deleteSave();
  useGameStore.getState().reset();
  useSession.setState({ phase: 'title', save: { kind: 'none' } });
}

// ---- Settings: per-device preferences, not part of the game save. ----

export type MotionPref = 'system' | 'reduce' | 'full';
const SETTINGS_KEY = 'h2h.settings';
export const useSettings = create<{ motion: MotionPref }>(() => ({ motion: 'system' }));

const systemReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Read by per-frame animation code, so it's a plain getter rather than a hook. */
export const reducedMotion = () => {
  const m = useSettings.getState().motion;
  return m === 'system' ? systemReduced() : m === 'reduce';
};
const applyMotion = () => { if (typeof document !== 'undefined') document.documentElement.dataset.motion = reducedMotion() ? 'reduce' : 'full'; };

function loadSettings() {
  if (typeof window === 'undefined') return;
  try {
    const m = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}').motion;
    if (m === 'reduce' || m === 'full' || m === 'system') useSettings.setState({ motion: m });
  } catch { /* defaults */ }
  applyMotion();
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
}

export function setMotion(motion: MotionPref) {
  useSettings.setState({ motion });
  applyMotion();
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ motion })); } catch { /* preference just won't stick */ }
}
