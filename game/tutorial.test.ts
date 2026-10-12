import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL, signalsBetween, stepTutorial, type TutorialSnapshot } from './tutorial';
import { initialState } from './state';

/** The tutorial is driven by the real store, so these tests play through it with real actions. */
async function store() {
  vi.resetModules();
  const { useGameStore } = await import('../stores/gameStore');
  return { g: () => useGameStore.getState(), useGameStore };
}
const stepId = (s: { tutorial: { status: string; step: number } }) => (s.tutorial.status === 'active' ? TUTORIAL[s.tutorial.step].id : s.tutorial.status);

const snap = (patch: Partial<TutorialSnapshot> = {}): TutorialSnapshot => ({ day: 1, plots: initialState().plots, fx: null, nearby: null, talkingTo: null, panel: 'farm', ...patch });

describe('tutorial signals', () => {
  it('reads walking up to someone, talking, successful actions, day ticks and panels', () => {
    expect(signalsBetween(snap(), snap({ nearby: { kind: 'npc', id: 'baba' } }))).toEqual([{ kind: 'near', npc: 'baba' }]);
    expect(signalsBetween(snap(), snap({ talkingTo: 'amaka' }))).toEqual([{ kind: 'talk', npc: 'amaka' }]);
    expect(signalsBetween(snap(), snap({ fx: { kind: 'plant', at: 1 } }))).toEqual([{ kind: 'action', action: 'plant' }]);
    expect(signalsBetween(snap(), snap({ day: 2 }))).toEqual([{ kind: 'day' }]);
    expect(signalsBetween(snap(), snap({ panel: 'storage' }))).toEqual([{ kind: 'panel', panel: 'storage' }]);
  });
  it('staying next to the same person is not a new signal', () => {
    const near = snap({ nearby: { kind: 'npc', id: 'baba' } });
    expect(signalsBetween(near, { ...near })).toEqual([]);
  });
});

describe('tutorial walkthrough', () => {
  let t: Awaited<ReturnType<typeof store>>;
  beforeEach(async () => { t = await store(); });

  it('advances one instruction at a time as the player really does each thing', () => {
    const { g } = t;
    expect(stepId(g())).toBe('meet');
    g().setNearby({ kind: 'npc', id: 'baba' });
    expect(stepId(g())).toBe('talk');
    g().interact({ kind: 'npc', id: 'baba' });
    expect(stepId(g())).toBe('prepare');
    g().prepare(4, 'ridge');
    expect(stepId(g())).toBe('plant');
    g().plant(4, 'improved');
    expect(stepId(g())).toBe('inspect');
    g().inspect(4);
    expect(stepId(g())).toBe('care');
    g().irrigate(4);
    expect(stepId(g())).toBe('day');
    g().advance();
    expect(stepId(g())).toBe('harvest');
    t.useGameStore.setState(s => ({ plots: s.plots.map(p => (p.id === 4 ? { ...p, status: 'ready', growth: 100, germinated: true, stand: 0.9 } : p)) }));
    g().harvest(4);
    expect(stepId(g())).toBe('compare');
    g().openPanel('storage');
    expect(g().tutorial.status).toBe('done');
  });

  it('a refused action does not count', () => {
    const { g } = t;
    t.useGameStore.setState({ tutorial: { status: 'active', step: 2 }, cash: 0 });
    g().prepare(4, 'ridge');
    expect(g().plots[4].status).toBe('empty');
    expect(stepId(g())).toBe('prepare');
  });

  it('doing a different action than the one asked for does not count', () => {
    const { g } = t;
    t.useGameStore.setState({ tutorial: { status: 'active', step: 6 } });
    g().pump();
    g().openPanel('market');
    expect(stepId(g())).toBe('day');
  });

  it('can be skipped entirely, or one step at a time', () => {
    const { g } = t;
    g().skipTutorialStep();
    expect(stepId(g())).toBe('talk');
    g().skipTutorial();
    expect(g().tutorial.status).toBe('skipped');
    g().advance();
    expect(g().tutorial.status).toBe('skipped');
  });

  it('loading a later save does not count as the player ending a day', () => {
    const { g, useGameStore } = t;
    useGameStore.setState({ tutorial: { status: 'active', step: 6 } });
    const later = { ...initialState(), day: 30 };
    g().loadGame({ version: 1, savedAt: 0, game: later, meta: { reportSeenDay: 30, tutorial: { status: 'active', step: 6 } } });
    expect(g().day).toBe(30);
    expect(stepId(g())).toBe('day');
  });

  it('replaying on an established farm passes over steps that no longer apply', () => {
    const { g, useGameStore } = t;
    g().skipTutorial();
    useGameStore.setState(s => ({ plots: s.plots.map(p => ({ ...p, status: 'growing', growth: 40, germinated: true, stand: 0.9, seed: 'improved' })) }));
    g().replayTutorial();
    expect(stepId(g())).toBe('meet');
    g().setNearby({ kind: 'npc', id: 'baba' });
    g().interact({ kind: 'npc', id: 'baba' });
    expect(stepId(g())).toBe('inspect'); // no empty or prepared plots, so prepare and plant are passed over
  });

  it('stepTutorial returns the same object when nothing happened (so the store is not touched)', () => {
    const p = { status: 'active' as const, step: 0 };
    expect(stepTutorial(p, [], initialState().plots)).toBe(p);
  });
});
