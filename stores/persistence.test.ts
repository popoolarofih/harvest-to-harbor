import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, UNREADABLE_KEY, parseSave } from '../game/save';
import type { KeyValueStore } from './persistence';

/** In-memory stand-in for localStorage that counts writes and can be told to fail. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore & { data: Map<string, string>; writes: number; failWith: Error | null } = {
    data, writes: 0, failWith: null,
    getItem: k => data.get(k) ?? null,
    setItem(k, v) { if (store.failWith) throw store.failWith; store.writes++; data.set(k, v); },
    removeItem: k => { data.delete(k); },
  };
  return store;
}

/** A fresh copy of the app's modules: what a page reload gives you. */
async function freshApp(storage: KeyValueStore | null) {
  vi.resetModules();
  const persistence = await import('./persistence');
  persistence.setStorage(storage);
  const session = await import('./session');
  const { useGameStore, gameOf } = await import('./gameStore');
  return { ...persistence, ...session, useGameStore, gameOf, game: () => useGameStore.getState() };
}

const savedDay = (s: { data: Map<string, string> }) => {
  const r = parseSave(s.data.get(SAVE_KEY) ?? null);
  return r.kind === 'ok' ? r.save.game.day : null;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('startup and restore', () => {
  it('a first visit shows the title with no save, and writes nothing until a season starts', async () => {
    const mem = memoryStorage();
    const app = await freshApp(mem);
    app.boot();
    expect(app.useSession.getState()).toMatchObject({ phase: 'title', save: { kind: 'none' } });
    app.game().advance();
    vi.runAllTimers();
    expect(mem.writes).toBe(0);
  });

  it('booting never overwrites an existing save, even though the store starts as a fresh game', async () => {
    const mem = memoryStorage();
    let app = await freshApp(mem);
    app.boot(); app.startNewSeason(); app.finishIntro(true);
    app.game().advance(); app.game().advance();
    vi.runAllTimers();
    const before = mem.data.get(SAVE_KEY);
    app = await freshApp(mem);
    app.game().advance(); // module-level store activity before boot
    app.boot();
    vi.runAllTimers();
    expect(mem.data.get(SAVE_KEY)).toBe(before);
    expect(app.useSession.getState().save?.kind).toBe('ok');
  });

  it('continue restores the exact game, tutorial step and dismissed report, without advancing anything', async () => {
    const mem = memoryStorage();
    let app = await freshApp(mem);
    app.boot(); app.startNewSeason(); app.finishIntro(true);
    const g = app.game();
    g.setNearby({ kind: 'npc', id: 'baba' });
    g.interact({ kind: 'npc', id: 'baba' });
    g.prepare(4, 'ridge');
    g.plant(4, 'improved');
    g.advance(); g.advance();
    app.game().dismissReport();
    vi.runAllTimers();
    const played = app.gameOf(app.game());
    const tutorial = app.game().tutorial;
    expect(tutorial.step).toBeGreaterThan(3);

    app = await freshApp(mem);
    app.boot();
    expect(app.continueGame()).toBe(true);
    expect(app.useSession.getState().phase).toBe('playing');
    expect({ ...app.gameOf(app.game()), toast: '' }).toEqual({ ...played, toast: '', lastInspection: null });
    expect(app.game().tutorial).toEqual(tutorial);
    expect(app.game().reportSeenDay).toBe(played.day);
    vi.runAllTimers();
    expect(savedDay(mem)).toBe(played.day); // continuing alone doesn't tick a day
  });

  it('a corrupted save is kept aside, never overwritten by booting, and reported for recovery', async () => {
    const mem = memoryStorage({ [SAVE_KEY]: '{"version":1,"game":' });
    const app = await freshApp(mem);
    app.boot();
    expect(app.useSession.getState().save).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/JSON/) });
    expect(mem.data.get(UNREADABLE_KEY)).toBe('{"version":1,"game":');
    expect(mem.data.get(SAVE_KEY)).toBe('{"version":1,"game":');
    expect(app.continueGame()).toBe(false);
    expect(app.readUnreadable()).toBe('{"version":1,"game":');
    // Starting over replaces the main slot but the unreadable copy survives for recovery.
    app.startNewSeason();
    expect(savedDay(mem)).toBe(1);
    expect(mem.data.get(UNREADABLE_KEY)).toBe('{"version":1,"game":');
  });

  it('reports storage that is unavailable instead of failing silently', async () => {
    const app = await freshApp(null);
    app.boot();
    expect(app.useSession.getState().save).toEqual({ kind: 'unavailable' });
    app.startNewSeason();
    expect(app.useSaveStatus.getState()).toMatchObject({ state: 'error', error: expect.stringMatching(/blocking site storage/) });
    expect(app.useSession.getState().phase).toBe('intro'); // still playable
  });
});

describe('autosave', () => {
  async function playing() {
    const mem = memoryStorage();
    const app = await freshApp(mem);
    app.boot(); app.startNewSeason(); app.finishIntro(false);
    vi.runAllTimers();
    mem.writes = 0;
    return { mem, app };
  }

  it('saves shortly after a meaningful action, showing "pending" until then', async () => {
    const { mem, app } = await playing();
    app.game().prepare(0, 'clear');
    expect(app.useSaveStatus.getState().state).toBe('pending');
    expect(mem.writes).toBe(0);
    vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS);
    expect(mem.writes).toBe(1);
    expect(app.useSaveStatus.getState()).toMatchObject({ state: 'saved', savedAt: expect.any(Number) });
  });

  it('debounces bursts of actions into one write', async () => {
    const { mem, app } = await playing();
    for (const id of [0, 1, 2, 3]) app.game().prepare(id, 'clear');
    vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS);
    expect(mem.writes).toBe(1);
  });

  it('constant activity still saves within the max wait', async () => {
    const { mem, app } = await playing();
    for (let i = 0; i < 12; i++) { app.game().prepare(i, 'clear'); vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS / 2); }
    expect(app.game().plots.filter(p => p.status === 'prepared')).toHaveLength(12);
    // 12 actions 400 ms apart never leave a quiet 800 ms gap, but the 4 s cap forces a write.
    expect(mem.writes).toBeGreaterThanOrEqual(1);
  });

  it('presentation-only changes (walking past things, opening panels, failed actions) do not save', async () => {
    const { mem, app } = await playing();
    const g = app.game();
    g.setNearby({ kind: 'plot', id: 3 });
    g.select(3);
    g.openPanel('market');
    g.openPanel('farm');
    g.plant(3, 'improved'); // not prepared yet: refused with a toast
    vi.runAllTimers();
    expect(mem.writes).toBe(0);
  });

  it('every kind of meaningful action triggers a save', async () => {
    const { mem, app } = await playing();
    const actions: [string, () => void][] = [
      ['prepare', () => app.game().prepare(0, 'clear')],
      ['plant', () => app.game().plant(0, 'local')],
      ['water', () => app.game().irrigate(0)],
      ['fertilize', () => app.game().fertilize(0)],
      ['inspect', () => app.game().inspect(0)],
      ['end day', () => app.game().advance()],
      ['hire', () => app.game().hire()],
      ['buy upgrade', () => app.game().upgrade('tank')],
      ['talk', () => app.game().interact({ kind: 'npc', id: 'baba' })],
      ['dismiss story', () => app.game().dismissStory()],
    ];
    for (const [name, run] of actions) {
      const before = mem.writes;
      run();
      vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS);
      expect(mem.writes, name).toBe(before + 1);
    }
  });

  it('a full storage reports the error and keeps the game running', async () => {
    const { mem, app } = await playing();
    mem.failWith = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    app.game().prepare(0, 'clear');
    vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS);
    expect(app.useSaveStatus.getState()).toMatchObject({ state: 'error', error: expect.stringMatching(/storage is full/) });
    expect(app.game().plots[0].status).toBe('prepared');
    mem.failWith = null;
    app.game().prepare(1, 'clear');
    vi.advanceTimersByTime(app.SAVE_DEBOUNCE_MS);
    expect(app.useSaveStatus.getState()).toMatchObject({ state: 'saved', error: null });
  });

  it('leaving to the menu flushes a pending save immediately', async () => {
    const { mem, app } = await playing();
    app.game().advance();
    expect(mem.writes).toBe(0);
    app.toTitle();
    expect(mem.writes).toBe(1);
    expect(savedDay(mem)).toBe(2);
    app.game().advance(); // nothing is saved from the title screen
    vi.runAllTimers();
    expect(savedDay(mem)).toBe(2);
  });

  it('reset save deletes the slot and does not resave the fresh farm behind the menu', async () => {
    const { mem, app } = await playing();
    app.resetSave();
    vi.runAllTimers();
    expect(mem.data.has(SAVE_KEY)).toBe(false);
    expect(app.useSession.getState()).toMatchObject({ phase: 'title', save: { kind: 'none' } });
  });

  it('a long played season still produces a valid save', async () => {
    const { mem, app } = await playing();
    const g = () => app.game();
    for (const p of g().plots) { g().prepare(p.id, 'clear'); g().plant(p.id, 'improved'); }
    for (let d = 0; d < 45; d++) {
      for (const p of g().plots) if (p.status === 'ready') g().harvest(p.id);
      for (const b of g().batches.filter(b => b.product === 'fresh')) g().process(b.id, { wash: 'rinse', sort: 'none', cut: 'split' });
      for (const j of g().dryingJobs) if (j.moisture <= 12) g().bag(j.id, 'sealed');
      g().advance();
    }
    vi.runAllTimers();
    const r = parseSave(mem.data.get(SAVE_KEY) ?? null);
    expect(r.kind === 'invalid' ? r.reason : r.kind).toBe('ok');
    expect(g().stats.harvestedKg).toBeGreaterThan(0);
  });
});
