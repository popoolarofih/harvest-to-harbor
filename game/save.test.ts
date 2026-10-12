import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SAVE_VERSION, migrate, parseSave, restoreGame, serializeSave, type SaveMeta } from './save';
import { busyFarm } from './fixtures';
import { advanceDay, initialState } from './simulation';
import type { GameState } from './types';

const META: SaveMeta = { reportSeenDay: 1, tutorial: { status: 'active', step: 3 } };

const roundTrip = (s: GameState, meta = META) => {
  const r = parseSave(serializeSave(s, meta, 1_700_000_000_000));
  if (r.kind !== 'ok') throw new Error(r.kind === 'invalid' ? r.reason : 'no save');
  return r.save;
};
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) s = advanceDay(s); return s; };
const validJson = () => JSON.parse(serializeSave(busyFarm(), META));

describe('save round trip', () => {
  it('the busy fixture really has a contract, shipment, drying job and loan in flight', () => {
    const s = busyFarm();
    expect(s.shipments).toHaveLength(1);
    expect(['road', 'port', 'sea']).toContain(s.shipments[0].stage);
    expect(s.contracts[0].status).toBe('shipping');
    expect(s.dryingJobs).toHaveLength(1);
    expect(s.loans).toHaveLength(1);
    expect(s.plots.filter(p => p.status === 'growing')).toHaveLength(3);
  });

  it('restores every authoritative field exactly, and drops presentation-only ones', () => {
    const s = { ...busyFarm(), toast: 'hello', lastInspection: { title: 'x', grade: 'A' as const, stats: [], warnings: [], consequences: [] } };
    const save = roundTrip(s);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.meta).toEqual(META);
    expect(restoreGame(save)).toEqual({ ...s, toast: '', lastInspection: null });
    expect(serializeSave(s, META)).not.toContain('"toast"');
  });

  it('reloading changes nothing: no day passes, no money moves, no shipment or loan ticks', () => {
    const s = busyFarm();
    const r = restoreGame(roundTrip(s));
    expect(r.day).toBe(s.day);
    expect(r.cash).toBe(s.cash);
    expect(r.finance).toEqual(s.finance);
    expect(r.loans).toEqual(s.loans);
    expect(r.shipments).toEqual(s.shipments);
    expect(r.dryingJobs).toEqual(s.dryingJobs);
    expect(r.missions).toEqual(s.missions);
    expect(r.log).toEqual(s.log);
  });

  it('a reloaded season plays out identically to one that never reloaded (weather, events, payments)', () => {
    const s = busyFarm();
    const uninterrupted = days(s, 25);
    const reloaded = days(restoreGame(roundTrip(s)), 25);
    expect(reloaded).toEqual(uninterrupted);
    expect(uninterrupted.shipments[0].stage).not.toBe(s.shipments[0].stage); // the journey really moved on
  });

  it('reloading several times mid-journey does not pay a shipment or charge a loan twice', () => {
    let a = busyFarm(), b = busyFarm();
    for (let i = 0; i < 25; i++) { a = advanceDay(a); b = advanceDay(restoreGame(roundTrip(b))); }
    expect(b.cash).toBe(a.cash);
    expect(b.finance).toEqual(a.finance);
    expect(b.shipments).toEqual(a.shipments);
    expect(b.loans).toEqual(a.loans);
  });

  it('a fresh game round-trips too', () => {
    const s = initialState();
    expect(restoreGame(roundTrip(s))).toEqual({ ...s, toast: '' });
  });
});

describe('unreadable saves', () => {
  const reason = (raw: string | null) => { const r = parseSave(raw); return r.kind === 'invalid' ? r.reason : r.kind; };

  it('no save is not an error', () => {
    expect(parseSave(null).kind).toBe('none');
    expect(parseSave('').kind).toBe('none');
  });

  it('rejects broken JSON and non-objects, keeping the raw text for recovery', () => {
    const r = parseSave('{"version":1,"game":{');
    expect(r).toMatchObject({ kind: 'invalid', raw: '{"version":1,"game":{' });
    expect(reason('[1,2]')).toMatch(/not an object/);
    expect(reason('42')).toMatch(/not an object/);
  });

  it('rejects missing versions and saves from a newer build', () => {
    const j = validJson();
    expect(reason(JSON.stringify({ ...j, version: undefined }))).toMatch(/no version/);
    expect(reason(JSON.stringify({ ...j, version: SAVE_VERSION + 1 }))).toMatch(/newer version/);
  });

  it('names the field that is missing or has the wrong type', () => {
    const j = validJson();
    delete j.game.cash;
    expect(reason(JSON.stringify(j))).toBe('missing cash');
    const k = validJson();
    k.game.plots = 'lots';
    expect(reason(JSON.stringify(k))).toMatch(/plots should be array/);
    const l = validJson();
    l.game.plots[3].moisture = null; // NaN becomes null in JSON
    expect(reason(JSON.stringify(l))).toMatch(/plots\[3\]\.moisture should be number/);
    const m = validJson();
    delete m.game.shipments[0].stage;
    expect(reason(JSON.stringify(m))).toBe('missing shipments[0].stage');
  });

  it('catches broken invariants the shape check cannot see', () => {
    const j = validJson();
    j.game.missions = j.game.missions.slice(1);
    expect(reason(JSON.stringify(j))).toMatch(/missions/);
    const k = validJson();
    k.game.nextId = 1;
    expect(reason(JSON.stringify(k))).toMatch(/nextId/);
    const l = validJson();
    l.game.day = 0;
    expect(reason(JSON.stringify(l))).toMatch(/day/);
  });

  it('rejects malformed tutorial progress', () => {
    const j = validJson();
    j.meta.tutorial = { status: 'sideways', step: 1 };
    expect(reason(JSON.stringify(j))).toMatch(/tutorial/);
  });
});

describe('migrations', () => {
  /** Pretend version 2 added `creditBlocked`: a version-1 save lacks it. */
  const v1Save = () => { const j = validJson(); delete j.game.creditBlocked; return { ...j, version: 1 }; };
  const addCreditBlocked = { 1: (d: Record<string, unknown>) => ({ ...d, game: { ...(d.game as object), creditBlocked: false } }) };

  it('upgrades an older save through the registered steps', () => {
    const r = parseSave(JSON.stringify(v1Save()), addCreditBlocked, 2);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.migratedFrom).toBe(1);
    expect(r.save.version).toBe(2);
    expect(r.save.game.creditBlocked).toBe(false);
  });

  it('refuses an older save it has no migration for, instead of loading half a game', () => {
    expect(parseSave(JSON.stringify(v1Save()), {}, 2)).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/can't be upgraded/) });
  });

  it('runs steps in order', () => {
    const out = migrate({ trail: [] }, 1, { 1: d => ({ ...d, trail: [...(d.trail as number[]), 1] }), 2: d => ({ ...d, trail: [...(d.trail as number[]), 2] }) }, 3);
    expect(out).toEqual({ trail: [1, 2], version: 3 });
  });

  it('the current version needs no migrations', () => {
    expect(Object.keys(MIGRATIONS).map(Number).every(v => v < SAVE_VERSION)).toBe(true);
    expect(parseSave(serializeSave(initialState(), META))).toMatchObject({ kind: 'ok', migratedFrom: null });
  });
});
