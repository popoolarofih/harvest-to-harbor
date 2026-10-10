import { describe, expect, it } from 'vitest';
import {
  BASE_ENERGY, BUYERS, PREP, SEEDS, WAGE_PER_DAY, WORKER_ENERGY, advanceDay, buyUpgrade, checkSale, expectedYieldKg, fertilizePlot,
  finishDrying, gradeForBatch, harvestPlot, hireWorker, initialState, inspectPlot, plantPlot, preparePlot, pumpWater, sellBatch,
  startDrying, toggleCover, treatPlot, valueOptions, waterPlot,
} from './simulation';
import type { Batch, GameState, Plot, Weather } from './types';

const withPlot = (s: GameState, id: number, patch: Partial<Plot>): GameState => ({ ...s, plots: s.plots.map(p => (p.id === id ? { ...p, ...patch } : p)) });
const withWeather = (s: GameState, ...weather: Weather[]): GameState => ({ ...s, weatherQueue: [...weather, ...s.weatherQueue].slice(0, 5) });
const freshBatch = (patch: Partial<Batch> = {}): Batch => ({ id: 99, product: 'fresh', kg: 1_000, quality: 85, moisture: 80, createdDay: 1, ...patch });
const ready = (s: GameState, id = 0, patch: Partial<Plot> = {}) =>
  withPlot(s, id, { status: 'ready', seed: 'improved', growth: 100, germinated: true, stand: 0.9, health: 90, fertility: 60, ...patch });

describe('determinism', () => {
  it('replays the same season from the same seed', () => {
    let a = initialState(42), b = initialState(42);
    for (let i = 0; i < 20; i++) { a = advanceDay(a); b = advanceDay(b); }
    expect(a).toEqual(b);
  });
  it('different seeds produce different markets', () => {
    let a = initialState(1), b = initialState(2);
    for (let i = 0; i < 15; i++) { a = advanceDay(a); b = advanceDay(b); }
    expect(a.priceHistory).not.toEqual(b.priceHistory);
  });
});

describe('planting choices', () => {
  it('ridging costs more than clearing but improves drainage', () => {
    const s = initialState();
    const cleared = preparePlot(s, 12, 'clear'), ridged = preparePlot(s, 12, 'ridge');
    expect(s.cash - cleared.cash).toBe(PREP.clear.cost);
    expect(s.cash - ridged.cash).toBe(PREP.ridge.cost);
    expect(ridged.plots[12].ridged).toBe(true);
  });
  it('seed tier sets cost and needs prepared soil', () => {
    let s = initialState();
    expect(plantPlot(s, 0, 'certified').plots[0].status).toBe('empty');
    s = preparePlot(s, 0);
    const planted = plantPlot(s, 0, 'certified');
    expect(planted.plots[0].status).toBe('growing');
    expect(s.cash - planted.cash).toBe(SEEDS.certified.cost);
  });
  it('low-lying plots hold more water than upland plots', () => {
    const s = initialState();
    expect(s.plots[12].drainage).toBeLessThan(s.plots[0].drainage);
    expect(s.plots[12].moisture).toBeGreaterThan(s.plots[0].moisture);
  });
});

describe('crop care', () => {
  it('watering uses tank water and pumping refills it for fuel', () => {
    let s = preparePlot(initialState(), 0);
    const before = s.plots[0].moisture;
    s = waterPlot(s, 0);
    expect(s.plots[0].moisture).toBeGreaterThan(before);
    const cash = s.cash;
    s = pumpWater(s);
    expect(s.water).toBe(4_000);
    expect(s.cash).toBeLessThan(cash);
  });
  it('fertilizer applied in rain is half as effective', () => {
    const dry = fertilizePlot(preparePlot(initialState(), 0), 0);
    const wet = fertilizePlot({ ...preparePlot(initialState(), 0), weather: 'rain' }, 0);
    expect(wet.plots[0].fertility).toBeLessThan(dry.plots[0].fertility);
  });
  it('hidden problems must be found by inspection before they can be treated', () => {
    let s = withPlot(initialState(), 0, { status: 'growing', seed: 'local', growth: 40, issue: { kind: 'pest', severity: 20, detected: false } });
    expect(treatPlot(s, 0).plots[0].issue).not.toBeNull();
    s = inspectPlot(s, 0);
    expect(s.plots[0].issue?.detected).toBe(true);
    expect(s.lastInspection?.warnings.join(' ')).toMatch(/Shoot borer/);
    expect(treatPlot(s, 0).plots[0].issue).toBeNull();
  });
  it('severe soft rot can only be contained, not cured', () => {
    const s = withPlot(initialState(), 0, { status: 'growing', seed: 'local', growth: 40, issue: { kind: 'rot', severity: 80, detected: true } });
    expect(treatPlot(s, 0).plots[0].issue?.severity).toBeCloseTo(32);
  });
});

describe('growth and weather', () => {
  it('crops germinate and mature over the season', () => {
    let s = plantPlot(preparePlot(initialState(), 4), 4);
    for (let i = 0; i < 40 && s.plots[4].status !== 'ready'; i++) s = advanceDay({ ...s, plots: s.plots.map(p => ({ ...p, issue: null, moisture: 55 })) });
    expect(s.plots[4].germinated).toBe(true);
    expect(s.plots[4].status).toBe('ready');
  });
  it('a storm damages growing crops', () => {
    const base = withPlot(initialState(), 0, { status: 'growing', seed: 'improved', growth: 60, germinated: true, stand: 0.9, moisture: 55 });
    const calm = advanceDay(withWeather(base, 'cloudy')), storm = advanceDay(withWeather(base, 'storm'));
    expect(storm.plots[0].health).toBeLessThan(calm.plots[0].health);
    expect(storm.lastReport?.lines.some(l => /Storm/.test(l.text))).toBe(true);
  });
  it('insurance pays out part of storm losses', () => {
    const base = withPlot(initialState(), 0, { status: 'growing', seed: 'improved', growth: 60, germinated: true, stand: 0.9, moisture: 55 });
    const insured = advanceDay(withWeather({ ...base, upgrades: { ...base.upgrades, insurance: true } }, 'storm'));
    expect(insured.lastReport?.payouts).toBeGreaterThan(0);
    expect(insured.finance.insurancePayouts).toBe(insured.lastReport?.payouts);
  });
  it('ridged beds drain heavy rain faster than flat beds in the low field', () => {
    const flat = withPlot(initialState(), 12, { status: 'prepared', moisture: 80 });
    const ridge = withPlot(initialState(), 12, { status: 'prepared', moisture: 80, ridged: true });
    expect(advanceDay(withWeather(ridge, 'heavyRain')).plots[12].moisture).toBeLessThan(advanceDay(withWeather(flat, 'heavyRain')).plots[12].moisture);
  });
  it('the forecast covers five days and is less confident further out', () => {
    const s = initialState();
    expect(s.forecast).toHaveLength(5);
    expect(s.forecast[0].confidence).toBeGreaterThan(s.forecast[4].confidence);
  });
});

describe('harvest timing', () => {
  it('harvesting early yields less than a mature crop, and very young crops cannot be harvested', () => {
    const s = initialState();
    const early = withPlot(s, 0, { status: 'growing', seed: 'improved', growth: 75, germinated: true, stand: 0.9, health: 90, fertility: 60 });
    expect(expectedYieldKg(early.plots[0])).toBeLessThan(expectedYieldKg(ready(s).plots[0]));
    expect(harvestPlot(withPlot(s, 0, { status: 'growing', seed: 'improved', growth: 50 }), 0).batches).toHaveLength(0);
  });
  it('waiting after maturity adds yield but lowers quality when left too long', () => {
    const s = initialState();
    const day0 = harvestPlot(ready(s), 0).batches[0], day8 = harvestPlot(ready(s, 0, { daysReady: 8 }), 0).batches[0];
    expect(day8.kg).toBeGreaterThan(day0.kg);
    expect(day8.quality).toBeLessThan(day0.quality);
  });
  it('same-day harvests merge into one batch and the plot is cleared', () => {
    let s = ready(ready(initialState(), 0), 1);
    s = harvestPlot(harvestPlot(s, 0), 1);
    expect(s.batches).toHaveLength(1);
    expect(s.plots[0].status).toBe('empty');
  });
});

describe('selling and processing', () => {
  it('aggregator rejects small or low-grade lots; market takes anything for less', () => {
    const s = initialState();
    const aggregator = BUYERS.find(b => b.id === 'aggregator')!, market = BUYERS.find(b => b.id === 'market')!;
    expect(checkSale(s, freshBatch({ kg: 200 }), aggregator).ok).toBe(false);
    expect(checkSale(s, freshBatch({ quality: 40 }), aggregator).ok).toBe(false);
    const good = checkSale(s, freshBatch(), aggregator), cheap = checkSale(s, freshBatch(), market);
    expect(good.ok && cheap.ok && good.revenue > cheap.revenue).toBe(true);
  });
  it('2 tonnes of Grade B fresh ginger sells for ₦1.2m', () => {
    const r = checkSale(initialState(), freshBatch({ kg: 2_000, quality: 70 }), BUYERS.find(b => b.id === 'aggregator')!);
    expect(r.ok && r.revenue).toBe(1_200_000);
  });
  it('selling removes the batch and books revenue', () => {
    const s = sellBatch({ ...initialState(), batches: [freshBatch()] }, 99, 'aggregator');
    expect(s.batches).toHaveLength(0);
    expect(s.finance.revenue).toBeGreaterThan(0);
  });
  it('value options compare selling fresh with drying', () => {
    const [fresh, dry] = valueOptions(initialState(), freshBatch({ kg: 2_000 }));
    expect(fresh.cost).toBe(0);
    expect(dry.cost).toBeGreaterThan(0);
    expect(dry.net).toBeGreaterThan(fresh.net);
  });
  it('sun-drying in good weather reaches safe moisture and Grade A', () => {
    let s = startDrying({ ...initialState(), batches: [freshBatch()] }, 99);
    expect(s.dryingJobs).toHaveLength(1);
    for (let i = 0; i < 6; i++) s = advanceDay(withWeather(s, 'sunny'));
    s = finishDrying(s, s.dryingJobs[0].id);
    const dried = s.batches.find(b => b.product === 'dried')!;
    expect(dried.moisture).toBeLessThanOrEqual(12);
    expect(dried.kg).toBeGreaterThan(200);
    expect(dried.kg).toBeLessThan(250);
    expect(gradeForBatch(dried)).toBe('A');
  });
  it('bagging damp ginger produces a warning report and the premium buyer rejects it', () => {
    let s = startDrying({ ...initialState(), batches: [freshBatch()] }, 99);
    for (let i = 0; i < 4; i++) s = advanceDay(withWeather(s, 'sunny'));
    s = finishDrying(s, s.dryingJobs[0].id);
    expect(s.lastInspection?.warnings[0]).toMatch(/above the recommended 12%/);
    expect(s.lastInspection?.consequences).toContain('Premium buyers will reject the batch');
    const dried = s.batches.find(b => b.product === 'dried')!;
    const after = sellBatch(s, dried.id, 'processor');
    expect(after.batches).toContainEqual(dried);
    expect(after.reputation).toBe(s.reputation - 1);
  });
  it('covering racks protects them from rain', () => {
    let s = startDrying({ ...initialState(), batches: [freshBatch()] }, 99);
    const id = s.dryingJobs[0].id;
    const open = advanceDay(withWeather(s, 'heavyRain'));
    s = advanceDay(withWeather(toggleCover(s, id), 'heavyRain'));
    expect(s.dryingJobs[0].moisture).toBeLessThan(open.dryingJobs[0].moisture);
    expect(s.dryingJobs[0].quality).toBeGreaterThan(open.dryingJobs[0].quality);
  });
  it('fresh stock decays in storage and faster when over capacity', () => {
    const normal = advanceDay({ ...initialState(), batches: [freshBatch()] });
    const over = advanceDay({ ...initialState(), batches: [freshBatch({ kg: 4_000 })] });
    expect(normal.batches[0].quality).toBeLessThan(85);
    expect(over.batches[0].quality).toBeLessThan(normal.batches[0].quality);
  });
});

describe('money and labour', () => {
  it('workers add daily energy and cost wages every evening', () => {
    let s = hireWorker(initialState());
    const cash = s.cash;
    s = advanceDay(s);
    expect(s.energy).toBe(BASE_ENERGY + WORKER_ENERGY);
    expect(cash - s.cash).toBe(WAGE_PER_DAY);
  });
  it('workers quit when payroll cannot be met', () => {
    const s = advanceDay({ ...initialState(), cash: 4_000, workers: 3 });
    expect(s.workers).toBe(1);
    expect(s.lastReport?.lines.some(l => /payroll/.test(l.text))).toBe(true);
  });
  it('upgrades cost cash and change capabilities', () => {
    expect(buyUpgrade(initialState(), 'irrigation').upgrades.irrigation).toBe(true);
    expect(buyUpgrade({ ...initialState(), cash: 10 }, 'irrigation').upgrades.irrigation).toBe(false);
  });
  it('drip irrigation waters dry plots automatically', () => {
    const base = withPlot(initialState(), 0, { status: 'growing', seed: 'improved', growth: 30, moisture: 30 });
    const irrigated = advanceDay(withWeather({ ...base, upgrades: { ...base.upgrades, irrigation: true } }, 'sunny'));
    expect(irrigated.plots[0].moisture).toBeGreaterThan(advanceDay(withWeather(base, 'sunny')).plots[0].moisture);
    expect(irrigated.water).toBeLessThan(base.water);
  });
});

describe('npc advice', () => {
  it('Baba Musa points at a hidden problem the player has not inspected', async () => {
    const { npcAdvice } = await import('./simulation');
    const s = withPlot(initialState(), 5, { status: 'growing', seed: 'local', growth: 40, issue: { kind: 'pest', severity: 30, detected: false } });
    expect(npcAdvice(s, 'baba')[0]).toMatch(/B2.*shoot borer/);
  });
  it('Amaka warns against bagging damp ginger and compares sell vs dry', async () => {
    const { npcAdvice } = await import('./simulation');
    const s = { ...initialState(), batches: [freshBatch()], dryingJobs: [{ id: 3, freshKg: 500, dryMatterKg: 100, moisture: 20, quality: 80, days: 4, covered: false }] };
    const tips = npcAdvice(s, 'amaka');
    expect(tips[0]).toMatch(/20\.0% moisture/);
    expect(tips.some(t => /Drying costs/.test(t))).toBe(true);
  });
  it('every NPC always has something to say', async () => {
    const { npcAdvice } = await import('./simulation');
    for (const id of ['baba', 'amaka', 'chinedu'] as const) expect(npcAdvice(initialState(), id).length).toBeGreaterThan(0);
  });
});
