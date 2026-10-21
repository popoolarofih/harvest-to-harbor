import { describe, expect, it } from 'vitest';
import { LOKOJA_TOLL, advanceDay, campaignContract, chooseFerry, dispatchContract, initialState, NPCS, NPC_QUIPS, npcAdvice } from './simulation';
import { MIGRATIONS, SAVE_VERSION } from './save';
import type { GameState } from './types';

/** An export contract with stock ready, dispatched, so the truck is on the road to Lagos. */
function shipped(seed: number): GameState {
  let s: GameState = { ...initialState(seed), level: 20, cash: 4_000_000, flags: { ...initialState(seed).flags, exportUnlocked: true } };
  const contract = { ...campaignContract(s), campaign: false };
  s = { ...s, contracts: [contract], nextId: s.nextId + 1 };
  s = { ...s, batches: [{ id: s.nextId, product: 'dried', kg: 800, quality: 95, moisture: 9, createdDay: s.day, packaging: 'sealed' }], nextId: s.nextId + 1 };
  return dispatchContract(s, contract.id);
}

describe('Lokoja ferry crossing', () => {
  it('starts undecided for a Lagos-bound truck', () => {
    const sh = shipped(5).shipments[0];
    expect(sh.ferry).toEqual({ choice: null, resolved: false });
  });

  it('paying the toll costs cash now and the crossing is clean', () => {
    const s = shipped(5), before = s.cash;
    const paid = chooseFerry(s, s.shipments[0].id, 'toll');
    expect(paid.cash).toBe(before - LOKOJA_TOLL);
    expect(paid.shipments[0].ferry?.choice).toBe('toll');
    const next = advanceDay(paid);
    expect(next.shipments[0].ferry?.resolved).toBe(true);
    expect(next.shipments[0].damage).toBe(0);
  });

  it('the bypass is free', () => {
    const s = shipped(5), before = s.cash;
    const out = chooseFerry(s, s.shipments[0].id, 'bypass');
    expect(out.cash).toBe(before);
    expect(out.shipments[0].ferry?.choice).toBe('bypass');
  });

  it('the choice can only be made once', () => {
    const s = chooseFerry(shipped(5), shipped(5).shipments[0].id, 'bypass');
    const again = chooseFerry(s, s.shipments[0].id, 'toll');
    expect(again.cash).toBe(s.cash);
    expect(again.shipments[0].ferry?.choice).toBe('bypass');
  });

  it('when the player says nothing, the driver pays the toll overnight', () => {
    const s = shipped(5), before = s.cash;
    const next = advanceDay(s);
    expect(next.shipments[0].ferry).toEqual({ choice: 'toll', resolved: true });
    expect(next.cash).toBeLessThan(before);
  });
});

describe('Hauwa and voices', () => {
  it('every character has a spoken greeting', () => {
    for (const id of Object.keys(NPCS) as (keyof typeof NPCS)[]) expect(NPC_QUIPS[id].length).toBeGreaterThan(10);
    expect(NPC_QUIPS.baba).toContain('Sannu da aiki');
  });

  it('Hauwa warns about wet racks', () => {
    let s = initialState(3);
    s = { ...s, dryingJobs: [{ id: 9, freshKg: 100, dryMatterKg: 25, moisture: 40, quality: 90, days: 1, covered: false, rate: 1, soiled: false }] };
    expect(npcAdvice(s, 'hauwa').join(' ')).toContain('Rack #9');
  });

  it('v4 saves gain a Hauwa talk counter without losing the others', () => {
    const out = MIGRATIONS[4]({ game: { flags: { talked: { baba: 2, amaka: 1, chinedu: 0 } } } }) as { game: { flags: { talked: Record<string, number> } } };
    expect(out.game.flags.talked).toEqual({ baba: 2, amaka: 1, chinedu: 0, hauwa: 0 });
    expect(SAVE_VERSION).toBe(5);
  });
});
