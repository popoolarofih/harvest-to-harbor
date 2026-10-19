import { describe, expect, it } from 'vitest';
import {
  COMPOUND_SITES, HARVEST_BEDS_PER_WORKER, MAINTENANCE, PREP, UPGRADES, advanceDay, buyCompound, buyUpgrade, campaignContract, compoundLeaseCost,
  createRng, dispatchCosts, exportReadiness, harvestCapacity, hireWorker, initialState, leaseCompoundLand, maintenanceCost, plotName, plotsAt,
  prepCost, preparePlot, pumpWater, quickShip, runAutomation,
} from './simulation';
import { MIGRATIONS, SAVE_VERSION, migrate, parseSave, serializeSave } from './save';
import type { Batch, Contract, GameState, Plot } from './types';

const ripe = (p: Plot): Plot => ({ ...p, status: 'ready', seed: 'improved', crop: 'ginger', growth: 100, germinated: true, stand: 0.9, health: 95, daysReady: 1 });

/** A farm with one hired hand on the field crew and `n` beds ready to lift. */
function readyFarm(n: number, extra: Partial<GameState> = {}): GameState {
  let s: GameState = { ...initialState(5), cash: 2_000_000, level: 20, ...extra };
  s = hireWorker(s);
  return { ...s, plots: s.plots.map(p => (p.id < n ? ripe(p) : p)) };
}

describe('field crews harvest on their own', () => {
  it('is on by default and lifts ready beds without spending the player\'s energy', () => {
    const s = readyFarm(3);
    expect(s.automation.autoHarvest).toBe(true);
    expect(s.automation.fieldWorkers).toBe(1);
    const { state, summary } = runAutomation(s, 'sunny', createRng(1));
    expect(summary.harvestedPlots).toBe(3);
    expect(summary.harvestedKg).toBeGreaterThan(200);
    expect(state.energy).toBe(s.energy);
    expect(state.plots.slice(0, 3).every(p => p.status === 'empty')).toBe(true);
    // Same consequences as a manual harvest: one fresh batch, crop history and soil changes.
    expect(state.batches.filter(b => b.product === 'fresh')).toHaveLength(1);
    expect(state.plots[0].cropHistory[0]).toMatchObject({ crop: 'ginger' });
    expect(state.stats.harvestedKg).toBeCloseTo(summary.harvestedKg!, 5);
  });

  it('respects crew capacity, and a mechanical digger triples it', () => {
    const n = HARVEST_BEDS_PER_WORKER + 4;
    const base = runAutomation(readyFarm(n), 'sunny', createRng(1));
    expect(base.summary.harvestedPlots).toBe(HARVEST_BEDS_PER_WORKER);
    expect(base.summary.blocked!.some(r => r.includes('left for tomorrow'))).toBe(true);
    const farm = readyFarm(n);
    const withDigger = { ...farm, upgrades: { ...farm.upgrades, digger: true } };
    expect(harvestCapacity(withDigger, 1)).toBe(HARVEST_BEDS_PER_WORKER * 3);
    expect(runAutomation(withDigger, 'sunny', createRng(1)).summary.harvestedPlots).toBe(n);
  });

  it('does nothing without a field crew or when switched off', () => {
    const none = { ...initialState(5), plots: initialState(5).plots.map(p => (p.id < 2 ? ripe(p) : p)) };
    expect(runAutomation(none, 'sunny', createRng(1)).summary.harvestedPlots).toBe(0);
    const off = readyFarm(2);
    expect(runAutomation({ ...off, automation: { ...off.automation, autoHarvest: false } }, 'sunny', createRng(1)).summary.harvestedPlots).toBe(0);
  });

  it('happens through a normal End day', () => {
    const next = advanceDay({ ...readyFarm(2), rng: 12345 });
    expect(next.events.some(e => e.kind === 'workerShortage')).toBe(false);
    expect(next.lastReport!.automation.harvestedPlots).toBe(2);
    expect(next.plots[0].status).toBe('empty');
  });

  it('explains in the morning report when a worker shortage leaves no one to harvest', () => {
    // Seed 5 rolls a worker shortage on the first night, sending the only worker away.
    const next = advanceDay(readyFarm(2));
    expect(next.events.some(e => e.kind === 'workerShortage')).toBe(true);
    expect(next.lastReport!.automation.harvestedPlots).toBe(0);
    expect(next.lastReport!.automation.blocked!.join(' ')).toMatch(/Worker shortage/);
  });
});

/** An active export contract, dried stock in jute sacks that would otherwise qualify, and a damp sealed batch. */
function exportFarm(sackKg: number) {
  let s: GameState = { ...initialState(9), level: 20, cash: 3_000_000, flags: { ...initialState(9).flags, exportUnlocked: true } };
  const c: Contract = { ...campaignContract(s), campaign: false, kg: 400 };
  s = { ...s, contracts: [c], nextId: s.nextId + 1 };
  const sack: Batch = { id: s.nextId, product: 'dried', kg: sackKg, quality: 88, moisture: 9, createdDay: s.day, packaging: 'bulk' };
  const damp: Batch = { id: s.nextId + 1, product: 'dried', kg: 120, quality: 88, moisture: 16, createdDay: s.day, packaging: 'sealed' };
  return { s: { ...s, batches: [sack, damp], nextId: s.nextId + 2 }, c };
}

describe('exporting made easier', () => {
  it('explains what is wrong with the stock in plain language', () => {
    const { s, c } = exportFarm(300);
    const r = exportReadiness(s, c);
    expect(r.readyKg).toBe(0);
    expect(r.repackKg).toBe(300);
    expect(r.canFill).toBe(false);
    expect(r.issues.map(i => i.kind)).toEqual(['packaging', 'damp', 'short']);
    expect(r.issues.find(i => i.kind === 'short')!.kg).toBe(100);
  });

  it('Prepare & ship repacks sacks into sealed bags and loads the truck in one go', () => {
    const { s, c } = exportFarm(500);
    const r = exportReadiness(s, c);
    expect(r.canFill).toBe(true);
    expect(r.repackKg).toBe(400);
    const shipped = quickShip(s, c.id);
    expect(shipped.contracts[0].status).toBe('shipping');
    expect(shipped.shipments).toHaveLength(1);
    // Only what the order needed was repacked; the rest stays in its sacks.
    expect(shipped.batches.find(b => b.product === 'dried' && b.packaging === 'bulk')!.kg).toBe(100);
    expect(shipped.cash).toBe(s.cash - r.repackCost - dispatchCosts(s, c, 'fleet', true).total);
  });

  it('refuses without changing anything when stock is short', () => {
    const { s, c } = exportFarm(300);
    const after = quickShip(s, c.id);
    expect(after.contracts[0].status).toBe('active');
    expect(after.batches).toEqual(s.batches);
    expect(after.cash).toBe(s.cash);
  });

  it('an export office halves paperwork fees and ships ready contracts each morning', () => {
    const { s, c } = exportFarm(500);
    const office = buyUpgrade(s, 'exportOffice');
    expect(office.automation.autoShip).toBe(true);
    expect(dispatchCosts(office, c, 'standard', false).exportFees).toBe(dispatchCosts(s, c, 'standard', false).exportFees / 2);
    const { state, summary } = runAutomation(office, 'sunny', createRng(1));
    expect(summary.shippedContracts).toBe(1);
    expect(state.contracts[0].status).toBe('shipping');
    expect(state.energy).toBe(office.energy);
  });

  it('a company truck makes standard haulage cheaper', () => {
    const { s, c } = exportFarm(500);
    const truck = { ...s, upgrades: { ...s.upgrades, companyTruck: true } };
    expect(dispatchCosts(truck, c, 'standard', false).haulage).toBeLessThan(dispatchCosts(s, c, 'standard', false).haulage * 0.7);
  });
});

describe('equipment that makes farming easier', () => {
  it('a solar pump fills the tank for free', () => {
    const s = { ...initialState(3), level: 10, water: 0 };
    expect(pumpWater(s).cash).toBeLessThan(s.cash);
    const solar = buyUpgrade({ ...s, cash: 1_000_000 }, 'solarPump');
    expect(solar.upgrades.solarPump).toBe(true);
    expect(pumpWater(solar).cash).toBe(solar.cash);
  });

  it('a tractor cuts land preparation cost', () => {
    const t = buyUpgrade({ ...initialState(3), level: 10, cash: 5_000_000 }, 'tractor');
    expect(prepCost(t, 'ridge')).toBe(Math.round(PREP.ridge.cost * 0.7));
    expect(preparePlot(t, 0, 'ridge').cash).toBe(t.cash - prepCost(t, 'ridge'));
  });

  it('new equipment is level-gated and adds running costs', () => {
    const s = { ...initialState(3), cash: 5_000_000 };
    expect(buyUpgrade(s, 'tractor').upgrades.tractor).toBeFalsy();
    const t = buyUpgrade({ ...s, level: 10 }, 'tractor');
    expect(t.cash).toBe(s.cash - UPGRADES.tractor.cost);
    expect(maintenanceCost(t)).toBe(MAINTENANCE.tractor);
  });
});

describe('buying a second farm compound', () => {
  const kachia = COMPOUND_SITES[0];

  it('adds 16 beds with the site\'s own soil, keeping plot ids in order', () => {
    const s = { ...initialState(4), level: kachia.minLevel, cash: 10_000_000 };
    const next = buyCompound(s, kachia.id);
    expect(next.compounds).toEqual([{ site: 'kachia', boughtDay: 1, leases: 0 }]);
    const beds = plotsAt(next.plots, 'kachia');
    expect(beds).toHaveLength(16);
    expect(plotsAt(next.plots)).toHaveLength(16);
    expect(next.plots.every((p, i) => p.id === i)).toBe(true);
    expect(beds[0].drainage).toBe(kachia.rows[0].drainage);
    expect(plotName(beds[0])).toBe('K-A1');
    expect(next.cash).toBe(s.cash - kachia.cost);
    expect(maintenanceCost(next)).toBe(kachia.upkeep);
    expect(next.story?.speaker).toBe('baba');
  });

  it('is level-gated and can only be bought once', () => {
    const s = { ...initialState(4), cash: 10_000_000 };
    expect(buyCompound(s, 'kachia').compounds).toEqual([]);
    const owned = buyCompound({ ...s, level: 30 }, 'kachia');
    expect(buyCompound(owned, 'kachia').compounds).toHaveLength(1);
  });

  it('can lease two more hectares beside it, each a little dearer', () => {
    let s = buyCompound({ ...initialState(4), level: 30, cash: 10_000_000 }, 'kachia');
    const first = compoundLeaseCost(s, 'kachia');
    s = leaseCompoundLand(s, 'kachia');
    expect(compoundLeaseCost(s, 'kachia')).toBeGreaterThan(first);
    s = leaseCompoundLand(s, 'kachia');
    expect(plotsAt(s.plots, 'kachia')).toHaveLength(32);
    expect(Math.max(...plotsAt(s.plots, 'kachia').map(p => p.x))).toBe(7);
    expect(leaseCompoundLand(s, 'kachia').plots).toHaveLength(s.plots.length);
    expect(s.plots.every((p, i) => p.id === i)).toBe(true);
  });

  it('crews work the new farm too, and it all survives a save and reload', () => {
    let s = buyCompound({ ...initialState(4), level: 30, cash: 10_000_000 }, 'kachia');
    s = hireWorker(s);
    const remote = plotsAt(s.plots, 'kachia')[0].id;
    s = { ...s, plots: s.plots.map(p => (p.id === remote ? ripe(p) : p)) };
    const { state, summary } = runAutomation(s, 'sunny', createRng(1));
    expect(summary.harvestedPlots).toBe(1);
    expect(state.plots[remote].status).toBe('empty');
    const r = parseSave(serializeSave(state, { reportSeenDay: 1, tutorial: { status: 'done', step: 0 } as never }));
    expect(r.kind).toBe('ok');
  });
});

describe('save version 4', () => {
  it('upgrades older saves: crews harvest, no compounds, new equipment not owned', () => {
    const game = initialState(1) as unknown as Record<string, unknown>;
    const automation: Record<string, unknown> = { ...(game.automation as Record<string, unknown>), autoHarvest: false };
    delete automation.autoShip;
    const old: Record<string, unknown> = {
      ...game, automation,
      upgrades: { irrigation: false, warehouseLevel: 0, tankLevel: 0, insurance: false, mill: false, solarDryer: false, factory: false, landLeased: 0 },
    };
    delete old.compounds;
    const out = migrate({ version: 3, game: old }, 3, MIGRATIONS, SAVE_VERSION) as unknown as { game: GameState };
    expect(out.game.compounds).toEqual([]);
    expect(out.game.automation.autoHarvest).toBe(true);
    expect(out.game.automation.autoShip).toBe(false);
    expect(out.game.upgrades.tractor).toBe(false);
  });
});
