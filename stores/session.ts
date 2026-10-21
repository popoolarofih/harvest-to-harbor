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
/** auto follows the device; landscape/portrait keep the game that way up even if the device can't rotate the page. */
export type OrientationPref = 'auto' | 'landscape' | 'portrait';
const SETTINGS_KEY = 'h2h.settings';
export const useSettings = create<{ motion: MotionPref; orientation: OrientationPref; music: boolean; effects: boolean; ambience: boolean; voices: boolean; musicVolume: number; effectsVolume: number }>(() => ({ motion: 'system', orientation: 'auto', music: true, effects: true, ambience: true, voices: true, musicVolume: 0.55, effectsVolume: 0.65 }));

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
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const m = saved.motion, o = saved.orientation;
    if (m === 'reduce' || m === 'full' || m === 'system') useSettings.setState({ motion: m });
    if (o === 'auto' || o === 'landscape' || o === 'portrait') useSettings.setState({ orientation: o });
    if (typeof saved.music === 'boolean') useSettings.setState({ music: saved.music });
    if (typeof saved.effects === 'boolean') useSettings.setState({ effects: saved.effects });
    if (typeof saved.ambience === 'boolean') useSettings.setState({ ambience: saved.ambience });
    if (typeof saved.voices === 'boolean') useSettings.setState({ voices: saved.voices });
    if (typeof saved.musicVolume === 'number') useSettings.setState({ musicVolume: Math.min(1, Math.max(0, saved.musicVolume)) });
    if (typeof saved.effectsVolume === 'number') useSettings.setState({ effectsVolume: Math.min(1, Math.max(0, saved.effectsVolume)) });
  } catch { /* defaults */ }
  applyMotion();
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
  installScreenTurn();
}

function persistSettings() {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(useSettings.getState())); } catch { /* preference just won't stick */ }
}

export function setMotion(motion: MotionPref) {
  useSettings.setState({ motion });
  applyMotion();
  persistSettings();
}

export function setMusic(music: boolean) { useSettings.setState({ music }); persistSettings(); }
export function setEffects(effects: boolean) { useSettings.setState({ effects }); persistSettings(); }
export function setAmbienceOn(ambience: boolean) { useSettings.setState({ ambience }); persistSettings(); }
export function setVoices(voices: boolean) { useSettings.setState({ voices }); persistSettings(); }
export function setMusicVolume(musicVolume: number) { useSettings.setState({ musicVolume }); persistSettings(); }
export function setEffectsVolume(effectsVolume: number) { useSettings.setState({ effectsVolume }); persistSettings(); }

// ---- Screen orientation ----

/**
 * How far the whole game is turned with CSS to honour the orientation setting: 0, 90 (clockwise, landscape on an
 * upright phone) or -90 (anticlockwise, portrait on a sideways screen). Only used when the page itself is the
 * wrong way round, e.g. iOS or a phone with rotation lock on; if the browser can lock orientation natively,
 * the viewport already matches and this stays 0.
 */
export type ScreenTurn = 0 | 90 | -90;
export const useScreenTurn = create<{ turn: ScreenTurn }>(() => ({ turn: 0 }));
/** Plain getter for pointer handlers that need to map screen drags back into game directions. */
export const screenTurn = () => useScreenTurn.getState().turn;

export function screenTurnFor(pref: OrientationPref, width: number, height: number): ScreenTurn {
  if (pref === 'landscape' && height > width) return 90;
  if (pref === 'portrait' && width > height) return -90;
  return 0;
}

function applyScreenTurn() {
  if (typeof window === 'undefined') return;
  const turn = screenTurnFor(useSettings.getState().orientation, window.innerWidth, window.innerHeight);
  if (turn !== useScreenTurn.getState().turn) useScreenTurn.setState({ turn });
}

let turnInstalled = false;
function installScreenTurn() {
  if (turnInstalled) return;
  turnInstalled = true;
  applyScreenTurn();
  window.addEventListener('resize', applyScreenTurn);
  window.addEventListener('orientationchange', applyScreenTurn);
  nativeLock(useSettings.getState().orientation);
}

/** Ask the browser to lock orientation where it can (installed web apps, fullscreen on Android). Failing is fine: CSS takes over. */
function nativeLock(pref: OrientationPref) {
  if (typeof screen === 'undefined') return;
  const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }) | undefined;
  try {
    if (pref === 'auto') so?.unlock?.();
    else so?.lock?.(pref)?.catch(() => { /* not supported here */ });
  } catch { /* not supported here */ }
}

export function setOrientation(orientation: OrientationPref) {
  useSettings.setState({ orientation });
  persistSettings();
  nativeLock(orientation);
  applyScreenTurn();
}

/** The quick "Rotate screen" action: flip to whichever way the game isn't showing right now. */
export function rotateScreen() {
  if (typeof window === 'undefined') return;
  const wide = window.innerWidth > window.innerHeight;
  const showingLandscape = screenTurn() === 0 ? wide : !wide;
  setOrientation(showingLandscape ? 'portrait' : 'landscape');
}
