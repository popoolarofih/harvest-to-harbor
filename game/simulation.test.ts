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
    let s = { ...initialState(), level: 2 };
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
    expect(dried.kg).toBeGreaterThan(180);
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
  it('drip irrigation starts watering dry planted plots as soon as it is installed', () => {
    const base = withPlot(initialState(), 0, { status: 'growing', seed: 'improved', growth: 30, moisture: 30 });
    const installed = buyUpgrade(base, 'irrigation');
    expect(installed.plots[0].moisture).toBe(55);
    expect(installed.water).toBe(base.water - 400);
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
    const s = { ...initialState(), batches: [freshBatch()], dryingJobs: [{ id: 3, freshKg: 500, dryMatterKg: 100, moisture: 20, quality: 80, days: 4, covered: false, rate: 1, soiled: false }] };
    const tips = npcAdvice(s, 'amaka');
    expect(tips[0]).toMatch(/20\.0% moisture/);
    expect(tips.some(t => /Drying costs/.test(t))).toBe(true);
  });
  it('every NPC always has something to say', async () => {
    const { npcAdvice } = await import('./simulation');
    for (const id of ['baba', 'amaka', 'chinedu'] as const) expect(npcAdvice(initialState(), id).length).toBeGreaterThan(0);
  });
});

describe('processing chain', () => {
  const withFresh = (patch: Partial<Batch> = {}) => ({ ...initialState(), batches: [freshBatch(patch)] });
  it('strict sorting keeps fewer kilos but raises quality', async () => {
    const { prepPlan } = await import('./simulation');
    const b = freshBatch();
    const none = prepPlan(b, { wash: 'thorough', sort: 'none', cut: 'sliced' }), strict = prepPlan(b, { wash: 'thorough', sort: 'strict', cut: 'sliced' });
    expect(strict.keptKg).toBeLessThan(none.keptKg);
    expect(strict.quality).toBeGreaterThan(none.quality);
  });
  it('a thorough wash needs tank water; a rinse leaves soil that caps the grade at B', async () => {
    const { startProcessing, finishDrying } = await import('./simulation');
    expect(startProcessing({ ...withFresh(), water: 0 }, 99).dryingJobs).toHaveLength(0);
    let s = startProcessing(withFresh({ quality: 95 }), 99, { wash: 'rinse', sort: 'strict', cut: 'sliced' });
    expect(s.water).toBe(4_000);
    s = { ...s, dryingJobs: s.dryingJobs.map(j => ({ ...j, moisture: 9 })) };
    s = finishDrying(s, s.dryingJobs[0].id, 'sealed');
    const dried = s.batches.find(b => b.product === 'dried')!;
    expect(dried.soiled).toBe(true);
    expect(gradeForBatch(dried)).toBe('B');
    expect(s.lastInspection?.warnings.join(' ')).toMatch(/foreign matter/);
  });
  it('peeled slices dry faster than split rhizomes', async () => {
    const { startProcessing } = await import('./simulation');
    const sliced = advanceDay(withWeather(startProcessing(withFresh(), 99, { wash: 'thorough', sort: 'standard', cut: 'sliced' }), 'sunny'));
    const split = advanceDay(withWeather(startProcessing(withFresh(), 99, { wash: 'thorough', sort: 'standard', cut: 'split' }), 'sunny'));
    expect(sliced.dryingJobs[0].moisture).toBeLessThan(split.dryingJobs[0].moisture);
  });
  it('excellent processing in sealed bags is Premium; the same ginger in jute is Grade A', () => {
    const base = { product: 'dried' as const, quality: 94, moisture: 9 };
    expect(gradeForBatch({ ...base, packaging: 'sealed' })).toBe('Premium');
    expect(gradeForBatch({ ...base, packaging: 'bulk' })).toBe('A');
  });
  it('jute-bagged stock takes up moisture on wet days; sealed bags do not', () => {
    const s = { ...initialState(), batches: [
      { id: 1, product: 'dried' as const, kg: 100, quality: 90, moisture: 10, createdDay: 1, packaging: 'bulk' as const },
      { id: 2, product: 'dried' as const, kg: 100, quality: 90, moisture: 10, createdDay: 1, packaging: 'sealed' as const },
    ] };
    const next = advanceDay(withWeather(s, 'heavyRain'));
    expect(next.batches[0].moisture).toBeGreaterThan(10);
    expect(next.batches[1].moisture).toBe(10);
  });
  it('the solar dryer stops rain re-wetting the racks', async () => {
    const { startProcessing } = await import('./simulation');
    const s = startProcessing(withFresh(), 99);
    const open = advanceDay(withWeather(s, 'heavyRain'));
    const solar = advanceDay(withWeather({ ...s, upgrades: { ...s.upgrades, solarDryer: true } }, 'heavyRain'));
    expect(solar.dryingJobs[0].moisture).toBeLessThan(open.dryingJobs[0].moisture);
    expect(solar.dryingJobs[0].quality).toBeGreaterThan(open.dryingJobs[0].quality);
  });
  it('racks take what fits and leave the rest of a big batch in store', async () => {
    const { startProcessing, DRYING_RACK_KG } = await import('./simulation');
    const s = startProcessing(withFresh({ kg: 2_000 }), 99);
    expect(s.batches[0].kg).toBeCloseTo(2_000 - DRYING_RACK_KG);
    expect(s.stats.processedKg).toBe(DRYING_RACK_KG);
  });
  it('grinding needs a mill, and grinding damp ginger cakes the powder', async () => {
    const { grindBatch } = await import('./simulation');
    const dried = (moisture: number): GameState => ({ ...initialState(), batches: [{ id: 5, product: 'dried', kg: 200, quality: 90, moisture, createdDay: 1, packaging: 'bulk' }] });
    expect(grindBatch(dried(9), 5).batches[0].product).toBe('dried');
    const withMill = (s: GameState): GameState => ({ ...s, upgrades: { ...s.upgrades, mill: true } });
    const good = grindBatch(withMill(dried(9)), 5), damp = grindBatch(withMill(dried(13)), 5);
    expect(good.batches[0].product).toBe('powder');
    expect(good.batches[0].kg).toBeCloseTo(194);
    expect(damp.batches[0].quality).toBeLessThan(good.batches[0].quality - 10);
    expect(damp.lastInspection?.warnings[0]).toMatch(/caked/);
  });
  it('the supermarket only takes sealed powder', () => {
    const supermarket = BUYERS.find(b => b.id === 'supermarket')!;
    const powder = (packaging: 'bulk' | 'sealed'): Batch => ({ id: 1, product: 'powder', kg: 100, quality: 90, moisture: 8, createdDay: 1, packaging });
    expect(checkSale(initialState(), powder('bulk'), supermarket).ok).toBe(false);
    expect(checkSale(initialState(), powder('sealed'), supermarket).ok).toBe(true);
  });
  it('value options compare fresh, dried and powder, with powder locked until there is a mill', () => {
    const opts = valueOptions(initialState(), freshBatch({ kg: 2_000, quality: 80 }));
    expect(opts.map(o => o.id)).toEqual(['sellFresh', 'dry', 'powder']);
    expect(opts[2].locked).toBeTruthy();
    expect(opts[2].revenue).toBeGreaterThan(opts[1].revenue);
    expect(opts[1].revenue).toBeGreaterThan(opts[0].revenue);
  });
});

describe('Farm to Fortune campaign', () => {
  const at = async (id: string, patch: Partial<GameState> = {}): Promise<GameState> => {
    const { CAMPAIGN } = await import('./simulation');
    const idx = CAMPAIGN.findIndex(m => m.id === id);
    const s = initialState();
    return { ...s, missions: s.missions.map((m, i) => (i < idx ? { ...m, complete: true, progress: m.target } : m)), story: null, ...patch };
  };
  it('opens with Baba Musa, and talking to him starts the planting mission', async () => {
    const { talkTo, currentMission } = await import('./simulation');
    const s = initialState();
    expect(s.story?.speaker).toBe('baba');
    const next = talkTo(s, 'baba');
    expect(next.missions[0].complete).toBe(true);
    expect(currentMission(next)?.id).toBe('plant');
    expect(next.story?.title).toMatch(/Mission 2/);
  });
  it('mission 3 schedules a real storm and rewards a protected farm more', async () => {
    const { checkCampaign } = await import('./simulation');
    let s = await at('plant');
    for (const id of [0, 1, 2, 12]) { s = preparePlot(s, id, 'clear'); s = plantPlot(s, id, 'improved'); }
    s = checkCampaign(s);
    expect(s.forecast[2].weather).toBe('storm');
    expect(s.weatherQueue[2]).toBe('storm');
    const run = (start: GameState) => { let x = start; for (let i = 0; i < 3; i++) x = advanceDay(x); return x; };
    const exposed = run(s), insured = run({ ...s, upgrades: { ...s.upgrades, insurance: true } });
    expect(exposed.flags.stormOutcome).toBe('exposed');
    expect(insured.flags.stormOutcome).toBe('protected');
    expect(insured.missions[2].complete && exposed.missions[2].complete).toBe(true);
    expect(insured.log.some(l => l.text.includes('A storm is coming (+₦60,000)'))).toBe(true);
    expect(exposed.log.some(l => l.text.includes('act on the forecast'))).toBe(true);
  });
  it('the first-offer mission completes whether you sell fresh or process', async () => {
    const { checkCampaign, startProcessing, currentMission } = await import('./simulation');
    const base = checkCampaign(await at('offer', { batches: [freshBatch({ kg: 600 })] }));
    expect(currentMission(checkCampaign(sellBatch(base, 99, 'aggregator')))?.id).toBe('drying');
    expect(currentMission(checkCampaign(startProcessing(base, 99)))?.id).toBe('drying');
  });
  it('meeting Amaka creates the London contract; the lot counts only sealed, dry, Grade A+ stock; dispatching it ends the campaign', async () => {
    const { checkCampaign, talkTo, dispatchContract, eligibleKg, currentMission } = await import('./simulation');
    const good: Batch = { id: 1, product: 'dried', kg: 300, quality: 92, moisture: 9, createdDay: 1, packaging: 'sealed' };
    let s = talkTo(await at('buyer', { cash: 2_000_000, batches: [
      good, { ...good, id: 2, kg: 150, product: 'powder' }, { ...good, id: 3, packaging: 'bulk' }, { ...good, id: 4, moisture: 14 },
    ] }), 'amaka');
    const london = s.contracts.find(c => c.campaign)!;
    expect(london.status).toBe('active');
    expect(eligibleKg(s, london)).toBe(450);
    s = checkCampaign(s);
    expect(currentMission(s)?.id).toBe('ship');
    const shipped = checkCampaign(dispatchContract(s, london.id));
    expect(shipped.batches.find(b => b.id === 2)?.kg).toBe(50); // 400 taken: best quality first, last batch split
    expect(shipped.shipments).toHaveLength(1);
    expect(currentMission(shipped)).toBeNull();
    expect(shipped.story?.title).toMatch(/complete/);
  });
});

describe('contracts and the export journey', () => {
  const exportState = (patch: Partial<GameState> = {}): GameState => {
    const s = { ...initialState(), cash: 3_000_000, flags: { ...initialState().flags, exportUnlocked: true } };
    return { ...s, contracts: [{ ...campaignContractFor(s), campaign: false }], batches: [{ id: 50, product: 'dried', kg: 500, quality: 92, moisture: 9, createdDay: 1, packaging: 'sealed' }], ...patch };
  };
  let campaignContractFor: (s: GameState) => GameState['contracts'][number];
  it('loads helpers', async () => { ({ campaignContract: campaignContractFor } = await import('./simulation')); });

  it('a shipment goes road → port → sea → delivered, then the buyer pays in dollars at the day\'s rate', async () => {
    const { dispatchContract, contractValue } = await import('./simulation');
    let s = dispatchContract(exportState(), 1);
    expect(s.shipments[0].stage).toBe('road');
    const seen = new Set<string>();
    for (let i = 0; i < 40 && s.shipments[0].stage !== 'paid'; i++) { s = advanceDay(s); seen.add(s.shipments[0].stage); }
    expect([...seen]).toEqual(expect.arrayContaining(['port', 'sea', 'paid']));
    const c = s.contracts[0];
    expect(c.status).toBe('paid');
    expect(s.shipments[0].payout).toBeGreaterThan(contractValue(s, c) * 0.6);
  });
  it('dispatch is refused without enough eligible stock or cash for logistics', async () => {
    const { dispatchContract } = await import('./simulation');
    expect(dispatchContract(exportState({ batches: [] }), 1).shipments).toHaveLength(0);
    expect(dispatchContract(exportState({ cash: 1_000 }), 1).shipments).toHaveLength(0);
  });
  it('premium haulage and cargo insurance are level unlocks', async () => {
    const { dispatchContract } = await import('./simulation');
    expect(dispatchContract(exportState(), 1, 'fleet').shipments).toHaveLength(0);
    expect(dispatchContract(exportState({ level: 20 }), 1, 'fleet', true).shipments[0].insured).toBe(true);
  });
  it('a contract with nothing shipped 10 days past its deadline fails and costs reputation', async () => {
    const s = exportState();
    const late = advanceDay({ ...s, day: s.contracts[0].deadlineDay + 10 });
    expect(late.contracts[0].status).toBe('failed');
    expect(late.reputation).toBeLessThan(s.reputation);
  });
  it('offers appear on the board once forward contracts unlock, and accepting an advance-terms contract pays 30% up front', async () => {
    const { acceptContract } = await import('./simulation');
    let s: GameState = { ...initialState(), level: 3 };
    for (let i = 0; i < 40 && !s.contracts.length; i++) s = advanceDay(s);
    expect(s.contracts[0]?.status).toBe('offered');
    const advance = { ...s, contracts: [{ ...s.contracts[0], terms: 'advance' as const }] };
    const accepted = acceptContract(advance, advance.contracts[0].id);
    expect(accepted.contracts[0].status).toBe('active');
    expect(accepted.cash).toBeGreaterThan(advance.cash);
  });
});

describe('loans and cash flow', () => {
  it('bank loans need Level 5, accrue interest and are collected when due', async () => {
    const { takeLoan } = await import('./simulation');
    expect(takeLoan(initialState(), 0).loans).toHaveLength(0);
    let s = takeLoan({ ...initialState(), level: 5 }, 0);
    expect(s.cash).toBe(1_000_000);
    s = advanceDay(s);
    expect(s.loans[0].balance).toBeGreaterThan(500_000);
    s = advanceDay({ ...s, day: s.loans[0].dueDay });
    expect(s.loans).toHaveLength(0);
    expect(s.cash).toBeLessThan(500_000);
  });
  it('a loan that cannot be repaid defaults and blocks new credit', async () => {
    const { takeLoan } = await import('./simulation');
    let s = takeLoan({ ...initialState(), level: 5 }, 0);
    s = advanceDay({ ...s, cash: 10_000, day: s.loans[0].dueDay });
    expect(s.loans[0].defaulted).toBe(true);
    expect(s.creditBlocked).toBe(true);
    expect(takeLoan(s, 0).loans).toHaveLength(1);
  });
  it('equipment financing installs now with 25% down', async () => {
    const { financeUpgrade, UPGRADES } = await import('./simulation');
    const s = financeUpgrade({ ...initialState(), level: 15, cash: 300_000 }, 'factory');
    expect(s.upgrades.factory).toBe(true);
    expect(s.cash).toBe(300_000 - UPGRADES.factory.cost * 0.25);
    expect(s.loans[0].balance).toBe(UPGRADES.factory.cost * 0.75);
  });
  it('the cash forecast includes wages, maintenance and loan repayments', async () => {
    const { cashForecast, takeLoan } = await import('./simulation');
    const s = takeLoan({ ...initialState(), level: 5, workers: 2, upgrades: { ...initialState().upgrades, mill: true } }, 0);
    const f = cashForecast(s, 60);
    expect(f[1].cash).toBe(s.cash - 2 * 3_000 - 1_500);
    expect(f.some(p => p.note?.includes('due'))).toBe(true);
  });
});

describe('levels and unlocks', () => {
  it('XP crosses levels, names titles and lists what was unlocked', async () => {
    const { addXp, xpForLevel } = await import('./simulation');
    const s = addXp(initialState(), xpForLevel(5));
    expect(s.level).toBe(5);
    expect(s.levelUp?.title).toBe('Commercial Farmer');
    expect(s.levelUp?.unlocks).toEqual(expect.arrayContaining(['Certified seed', 'Land expansion', 'Bank loans']));
  });
  it('locked features are refused until their level', async () => {
    const { buyUpgrade } = await import('./simulation');
    const rich = { ...initialState(), cash: 5_000_000 };
    expect(buyUpgrade(rich, 'mill').upgrades.mill).toBe(false);
    expect(buyUpgrade({ ...rich, level: 6 }, 'mill').upgrades.mill).toBe(true);
    expect(plantPlot(preparePlot(rich, 0), 0, 'certified').plots[0].status).toBe('prepared');
  });
  it('leasing land at Level 5 adds 8 plots', async () => {
    const { buyUpgrade } = await import('./simulation');
    const s = buyUpgrade({ ...initialState(), level: 5 }, 'land');
    expect(s.plots).toHaveLength(24);
    expect(s.plots[16]).toMatchObject({ id: 16, x: 4, z: 0 });
  });
  it('the Processing Factory doubles rack capacity', async () => {
    const { rackCapacity, buyUpgrade, DRYING_RACK_KG } = await import('./simulation');
    expect(rackCapacity(buyUpgrade({ ...initialState(), level: 10, cash: 2_000_000 }, 'factory'))).toBe(DRYING_RACK_KG * 2);
  });
  it('the worker cap grows with level', () => {
    let s = initialState();
    for (let i = 0; i < 4; i++) s = hireWorker(s);
    expect(s.workers).toBe(2);
  });
});
