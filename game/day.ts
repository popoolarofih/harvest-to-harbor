import {
  BASE_PRICES, BASE_YIELD_KG, FX_BASE, DRY_FLOOR_MOISTURE, INSURANCE_COVER, INSURANCE_PREMIUM, SAFE_MOISTURE, SEEDS, TREATMENTS,
  WAGE_PER_DAY, WATER_PER_PLOT, WEATHER_INFO,
} from './config';
import { checkCampaign, judgeStorm } from './campaign';
import { tickContracts, tickShipments } from './contracts';
import { maintenanceCost, tickLoans } from './finance';
import { createRng, type Rng } from './rng';
import {
  addXp, clamp, effectiveDrainage, hasEvent, log, maxEnergy, money, plotName, storedKg, tankCapacity, warehouseCapacity,
} from './state';
import type { ActiveEvent, Batch, GameState, IssueKind, LogLine, Plot, Product, Weather, WorkerProfile } from './types';
import { buildForecast, isWet, nextWeather } from './weather';
import { runAutomation } from './automation';
import { calculateCrewPerks, createWorkerCandidate, LEVEL_REQUIREMENTS, ROLE_DETAILS } from './workers';
import { recordLedgerEntry } from './ledger';
import { tickEndgame } from './endgame';

const ISSUE_GROWTH: Record<IssueKind, number> = { pest: 4, leafSpot: 4, rot: 5 };
const PRICE_HISTORY_DAYS = 30;
const list = (names: string[]) => names.join(', ');

/** End the current day and simulate the next morning. All randomness comes from `s.rng`. */
export function advanceDay(s: GameState): GameState {
  const rng = createRng(s.rng);
  const lines: LogLine[] = [];
  const weather = s.weatherQueue[0];
  const queueRest = s.weatherQueue.slice(1);
  const weatherQueue = [...queueRest, nextWeather(rng, queueRest[queueRest.length - 1] ?? weather)];
  const info = WEATHER_INFO[weather];
  lines.push({ text: `${info.icon} ${info.label} today.`, severity: weather === 'storm' || weather === 'heatwave' ? 'warning' : 'info' });

  let st: GameState = judgeStorm({ ...s, day: s.day + 1, weather, weatherQueue });
  st = tickEvents(st, rng, lines);
  st = updateMarket(st, rng, weather);
  st = collectRainwater(st, weather, lines);
  const grown = growPlots(st, rng, weather, lines);
  st = ageStock(grown.state, weather, lines);
  st = dryRacks(st, weather, lines);
  const paid = payBills(st, grown.insuredLoss, lines);
  st = paid.state;
  st = tickCrew(st, rng, lines);
  st = tickLoans(st, lines);
  st = tickContracts(st, rng, lines);
  st = tickShipments(st, rng, lines);
  st = tickEndgame(st, rng, lines);

  const report = { day: st.day, weather, lines, wages: paid.wages, insurance: paid.premium, payouts: paid.payout, automation: grown.automation };
  st = { ...st, forecast: buildForecast(rng, weatherQueue, st.day), rng: rng.state(), lastReport: report };
  st = { ...st, energy: maxEnergy(st) };
  st = log(st, ...lines.filter(l => l.severity !== 'info'));
  const headline = lines.find(l => l.severity === 'danger') ?? lines.find(l => l.severity === 'warning') ?? lines[0];
  return checkCampaign(addXp({ ...st, toast: `Day ${st.day}: ${headline.text}` }, 5));
}

function tickEvents(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  const ended: Record<ActiveEvent['kind'], string> = {
    priceCrash: 'Fresh ginger prices are recovering.',
    fuelSpike: 'Fuel prices are back to normal.',
    workerShortage: 'Your full crew is back at work.',
  };
  const events = s.events.map(e => ({ ...e, daysLeft: e.daysLeft - 1 })).filter(e => {
    if (e.daysLeft > 0) return true;
    lines.push({ text: ended[e.kind], severity: 'good' });
    return false;
  });
  let market = s.market;
  const has = (k: ActiveEvent['kind']) => events.some(e => e.kind === k);
  if (!has('priceCrash') && rng.chance(0.02)) {
    events.push({ kind: 'priceCrash', daysLeft: 5, magnitude: 0.7 });
    market = { ...market, fresh: Math.round(market.fresh * 0.7), dried: Math.round(market.dried * 0.88), powder: Math.round(market.powder * 0.93) };
    lines.push({ text: 'Price crash: a glut of fresh ginger hit the markets and fresh prices fell 30%. Dried ginger holds its value better.', severity: 'danger' });
  }
  if (!has('fuelSpike') && rng.chance(0.03)) {
    events.push({ kind: 'fuelSpike', daysLeft: 6, magnitude: 1.6 });
    lines.push({ text: 'Fuel prices jumped 60%. Pumping the borehole costs more; rainwater and a bigger tank help.', severity: 'warning' });
  }
  if (s.workers > 0 && !has('workerShortage') && rng.chance(0.03)) {
    events.push({ kind: 'workerShortage', daysLeft: 3, magnitude: 0.5 });
    lines.push({ text: 'Worker shortage: half your crew is away harvesting on neighbouring farms for 3 days.', severity: 'warning' });
  }
  return { ...s, events, market };
}

function updateMarket(s: GameState, rng: Rng, weather: Weather): GameState {
  const crash = hasEvent(s, 'priceCrash');
  const move = (product: Product) => {
    const base = BASE_PRICES[product];
    const target = crash ? base * (product === 'fresh' ? crash.magnitude : (1 + crash.magnitude) / 2) : base;
    let p = s.market[product];
    p += (target - p) * 0.15 + p * rng.range(-0.03, 0.03);
    if (weather === 'storm' && product === 'fresh') p *= 1.03; // supply worries
    return Math.round(clamp(p, base * 0.5, base * 1.6));
  };
  const market = { fresh: move('fresh'), dried: move('dried'), powder: move('powder'), soybean: move('soybean') };
  // The naira drifts against the dollar, which moves the value of every export contract.
  const fxRate = Math.round(clamp(s.fxRate + (FX_BASE - s.fxRate) * 0.05 + s.fxRate * rng.range(-0.012, 0.012), FX_BASE * 0.8, FX_BASE * 1.4));
  const priceHistory = [...s.priceHistory, { day: s.day, ...market }].slice(-PRICE_HISTORY_DAYS);
  return { ...s, market, fxRate, priceHistory };
}

function collectRainwater(s: GameState, weather: Weather, lines: LogLine[]): GameState {
  const caught = weather === 'rain' ? 600 : weather === 'heavyRain' || weather === 'storm' ? 1_000 : 0;
  if (!caught || s.water >= tankCapacity(s)) return s;
  const water = Math.min(tankCapacity(s), s.water + caught);
  lines.push({ text: `Rainwater harvesting added ${(water - s.water).toLocaleString()} L to the tank.`, severity: 'info' });
  return { ...s, water };
}

function growPlots(s: GameState, rng: Rng, weather: Weather, lines: LogLine[]) {
  const info = WEATHER_INFO[weather], wet = isWet(weather);
  let insuredLoss = 0, stormHit = 0;
  const waterlogged: string[] = [], dry: string[] = [], poorStand: string[] = [], matured: string[] = [], visible: string[] = [], died: string[] = [];

  const weatheredPlots = s.plots.map(orig => {
    const drainage = effectiveDrainage(orig);
    const om = orig.organicMatter ?? 35;
    // Organic matter buffers soil against water loss in dry/hot weather
    const dryBuff = info.moisture < 0 ? Math.max(0.65, 1 - (om - 25) * 0.008) : 1;
    let moisture = orig.moisture + info.moisture * dryBuff - (orig.status === 'growing' ? 2 : 0);
    if (moisture > 55) moisture -= (moisture - 55) * drainage * 0.5;
    return { ...orig, moisture: clamp(moisture, 5, 100) };
  });
  const automated = runAutomation({ ...s, plots: weatheredPlots }, weather, rng);
  let plots = automated.state.plots.map((orig): Plot => {
    const p = { ...orig };
    const drainage = effectiveDrainage(p);
    if ((p.status !== 'growing' && p.status !== 'ready') || (!p.seed && p.crop !== 'soybean')) return p;
    const isSoy = p.crop === 'soybean';
    const seed = p.seed ? SEEDS[p.seed] : { germination: 0.95, resistance: 0.3, yieldMult: 1 };

    if (p.status === 'growing') {
      const moistF = p.moisture >= 35 && p.moisture <= 80 ? 1 : p.moisture >= 25 && p.moisture <= 90 ? 0.6 : 0.3;
      const fertF = clamp(0.6 + 0.8 * p.fertility / 100, 0.6, 1.3);
      const healthF = 0.4 + 0.6 * p.health / 100;
      const growthMult = isSoy ? 1.35 : 1;
      p.growth = Math.min(100, p.growth + 5 * moistF * fertF * healthF * info.growth * growthMult);

      if (isSoy) {
        // Biological Nitrogen Fixation
        p.fertility = Math.min(100, p.fertility + 0.6);
      } else {
        p.fertility = Math.max(0, p.fertility - 1.5);
      }

      if (!p.germinated && p.growth >= 15) {
        const stand = seed.germination + rng.range(-0.08, 0.06) - (p.moisture < 25 ? 0.2 : 0) - (p.moisture > 88 ? 0.15 : 0);
        p.stand = clamp(stand, 0.2, 1);
        p.germinated = true;
        if (p.stand < 0.65) poorStand.push(`${plotName(p)} (${Math.round(p.stand * 100)}%)`);
      }
      if (p.growth >= 100) { p.status = 'ready'; p.daysReady = 0; matured.push(plotName(p)); }
    } else {
      p.daysReady++;
    }

    let dh = 1;
    if (p.moisture < 25) { dh -= 2.5; dry.push(plotName(p)); } else if (p.moisture < 35) dh -= 0.5;
    if (p.moisture > 90) { dh -= 6; waterlogged.push(plotName(p)); } else if (p.moisture > 82) dh -= 2;
    if (p.fertility < 20) dh -= 3;
    if (p.status === 'ready' && p.daysReady > 5) dh -= 2;

    let weatherLoss = 0;
    if (weather === 'storm' && p.growth > 40) { weatherLoss += rng.range(6, 16); stormHit++; }
    if ((weather === 'heavyRain' || weather === 'storm') && drainage < 0.5) weatherLoss += 3;

    if (p.issue) {
      const growth = ISSUE_GROWTH[p.issue.kind] * (1 - seed.resistance * 0.5)
        + (p.issue.kind === 'leafSpot' && wet ? 3 : 0)
        + (p.issue.kind === 'rot' ? (p.moisture > 82 ? 5 : p.moisture < 50 ? -3 : 0) : 0);
      const severity = clamp(p.issue.severity + growth, 1, 100);
      const detected = p.issue.detected || severity >= 45;
      if (detected && !p.issue.detected) visible.push(`${plotName(p)} (${TREATMENTS[p.issue.kind].name.toLowerCase()})`);
      p.issue = { ...p.issue, severity, detected };
      dh -= severity * 0.06;
    } else if (!isSoy) {
      const weights = {
        pest: 0.006 + (weather === 'sunny' || weather === 'heatwave' ? 0.006 : 0) + (p.diseasePressure?.pest ?? 0) * 0.0003,
        leafSpot: 0.004 + (wet ? 0.012 : 0) + (p.diseasePressure?.leafSpot ?? 0) * 0.0004,
        rot: (p.moisture > 82 ? 0.04 : 0.001) + (p.status === 'ready' ? 0.008 * p.daysReady : 0) + (p.diseasePressure?.rot ?? 0) * 0.0006,
      };
      const total = (weights.pest + weights.leafSpot + weights.rot) * (1 - seed.resistance);
      if (rng.chance(total)) p.issue = { kind: rng.weighted(weights), severity: 10, detected: false };
    }

    const floor = p.issue && p.issue.kind !== 'rot' && p.moisture >= 25 ? 20 : 0;
    p.health = clamp(p.health + dh - weatherLoss, Math.min(floor, p.health), 100);
    if (weatherLoss > 0 && s.upgrades.insurance) {
      const potentialKg = BASE_YIELD_KG * (p.germinated ? p.stand : seed.germination) * seed.yieldMult;
      insuredLoss += (weatherLoss / 100) * potentialKg * s.market.fresh;
    }
    if (p.health <= 5) {
      died.push(plotName(p));
      return {
        ...p,
        status: 'empty',
        growth: 0,
        health: 100,
        ridged: false,
        seed: null,
        crop: undefined,
        stand: 0,
        germinated: false,
        daysReady: 0,
        issue: null,
      };
    }
    return p;
  });

  const spreaders = plots.filter(p => p.issue && p.issue.severity > 40);
  plots = plots.map(p => {
    if (p.issue || !p.seed || (p.status !== 'growing' && p.status !== 'ready')) return p;
    const source = spreaders.find(q => Math.abs(q.x - p.x) + Math.abs(q.z - p.z) === 1);
    if (!source || !rng.chance(0.08 * (1 - SEEDS[p.seed].resistance))) return p;
    return { ...p, issue: { kind: source.issue!.kind, severity: 8, detected: false } };
  });

  const automation = automated.summary;
  if (automation.pumpedLitres) lines.push({ text: `Automation ran the borehole: ${automation.pumpedLitres.toLocaleString()} L added for ${money(automation.pumpingCost)}.`, severity: 'info' });
  if (automation.irrigatedPlots) lines.push({ text: `Drip irrigation watered ${automation.irrigatedPlots} plot${automation.irrigatedPlots > 1 ? 's' : ''} (${automation.irrigationLitres.toLocaleString()} L).`, severity: 'info' });
  if (automation.fertilizedPlots) lines.push({ text: `Automation fertilized ${automation.fertilizedPlots} low-fertility plot${automation.fertilizedPlots > 1 ? 's' : ''} (${money(automation.fertilizerCost)}).`, severity: 'info' });
  if (automation.plantedPlots) lines.push({ text: `Field labour prepared and planted ${automation.plantedPlots} plot${automation.plantedPlots > 1 ? 's' : ''} (${money(automation.plantedCost ?? 0)}).`, severity: 'info' });
  if (automation.treatedPlots) lines.push({ text: `Field labour treated ${automation.treatedPlots} crop problem${automation.treatedPlots > 1 ? 's' : ''} (${money(automation.treatmentCost ?? 0)}).`, severity: 'good' });
  if (automation.wateredPlots) lines.push({ text: `Field labour watered ${automation.wateredPlots} dry plot${automation.wateredPlots > 1 ? 's' : ''}.`, severity: 'info' });
  if (automation.gapFilledPlots) lines.push({ text: `Field labour gap-filled ${automation.gapFilledPlots} patchy young plot${automation.gapFilledPlots > 1 ? 's' : ''}.`, severity: 'info' });
  if (automation.harvestedPlots) lines.push({ text: `Field labour harvested ${automation.harvestedPlots} mature plot${automation.harvestedPlots > 1 ? 's' : ''} (${Math.round(automation.harvestedKg ?? 0)} kg fresh).`, severity: 'good' });
  if (automation.coveredRacks) lines.push({ text: `Processing crew covered ${automation.coveredRacks} drying rack${automation.coveredRacks > 1 ? 's' : ''} before the rain.`, severity: 'good' });
  if (automation.openedRacks) lines.push({ text: `Processing crew opened ${automation.openedRacks} drying rack${automation.openedRacks > 1 ? 's' : ''} to dry in the sun.`, severity: 'good' });
  if (automation.baggedRacks) lines.push({ text: `Processing crew bagged ${automation.baggedRacks} safe dried rack${automation.baggedRacks > 1 ? 's' : ''}.`, severity: 'good' });
  if (automation.milledBatches) lines.push({ text: `Processing factory milled ${automation.milledBatches} batch${automation.milledBatches > 1 ? 'es' : ''} (${Math.round(automation.milledKg ?? 0)} kg powder).`, severity: 'good' });
  if (automation.reservedKg) lines.push({ text: `Contract automation reserved ${Math.round(automation.reservedKg)} kg qualifying export stock.`, severity: 'info' });
  if (automation.blocked?.length) {
    for (const b of automation.blocked) lines.push({ text: b, severity: 'warning' });
  }
  if (automation.irrigationNeedsRepair) lines.push({ text: 'Drip lines are clogged and need repair before automatic watering can continue.', severity: 'warning' });
  if (stormHit) lines.push({ text: `Storm winds battered ${stormHit} plot${stormHit > 1 ? 's' : ''}, tearing leaves and costing health.`, severity: 'danger' });
  if (waterlogged.length) lines.push({ text: `Waterlogged: ${list(waterlogged)}. Ridged beds drain faster; rot risk is up.`, severity: 'warning' });
  if (dry.length) lines.push({ text: `Drought stress: ${list(dry)}. Water these plots.`, severity: 'warning' });
  if (poorStand.length) lines.push({ text: `Poor germination: ${list(poorStand)} emerged. Gap-fill early to recover yield.`, severity: 'warning' });
  if (visible.length) lines.push({ text: `Visible damage on ${list(visible)}. Inspect and treat before it spreads.`, severity: 'danger' });
  if (matured.length) lines.push({ text: `Ready to harvest: ${list(matured)}. Waiting adds a little yield but raises rot and storm risk.`, severity: 'good' });
  if (died.length) lines.push({ text: `Crop lost on ${list(died)}. Check plots regularly: problems start hidden.`, severity: 'danger' });
  return { state: { ...automated.state, plots }, insuredLoss, automation };
}

function ageStock(s: GameState, weather: Weather, lines: LogLine[]): GameState {
  const over = storedKg(s) > warehouseCapacity(s);
  if (over) lines.push({ text: `Storage over capacity (${Math.round(storedKg(s)).toLocaleString()}/${warehouseCapacity(s).toLocaleString()} kg). Stock left outside spoils fast.`, severity: 'warning' });
  const kept: Batch[] = [];
  for (const b of s.batches) {
    const next = { ...b };
    if (b.product === 'fresh') {
      next.kg *= 0.992;
      next.quality -= (over ? 3.5 : 1.5) + (over && isWet(weather) ? 4 : 0);
    } else {
      // Jute breathes: on wet days unsealed stock takes up moisture, much more if it's piled outside.
      if (isWet(weather) && b.packaging !== 'sealed') next.moisture += (over ? 1.5 : 0) + (b.product === 'powder' ? 0.8 : 0.4);
      next.quality -= next.moisture > SAFE_MOISTURE ? (next.moisture - SAFE_MOISTURE) * 0.8 : 0.1;
      if (next.moisture > SAFE_MOISTURE) lines.push({ text: `Mould spreading in damp dried batch #${b.id} (${next.moisture.toFixed(1)}% moisture).`, severity: 'warning' });
    }
    if (next.quality <= 15) {
      lines.push({ text: `Batch #${b.id} (${Math.round(b.kg)} kg ${b.product}) spoiled in storage and was thrown away.`, severity: 'danger' });
      continue;
    }
    kept.push(next);
  }
  return { ...s, batches: kept };
}

function dryRacks(s: GameState, weather: Weather, lines: LogLine[]): GameState {
  const info = WEATHER_INFO[weather], solar = s.upgrades.solarDryer;
  const perks = calculateCrewPerks(s.crew ?? []);
  const dryingJobs = s.dryingJobs.map(j => {
    if (j.covered) return { ...j, days: j.days + 1, quality: j.quality - 0.3 };
    // The solar tunnel keeps rain off and traps heat, so it keeps drying slowly even on wet days.
    const change = info.dryingMoisture < 0
      ? info.dryingMoisture * j.rate * (solar ? 1.3 : 1) * perks.dryingSpeedMult
      : solar
        ? -4 * j.rate * perks.dryingSpeedMult
        : info.dryingMoisture;
    const moisture = clamp(j.moisture + change, DRY_FLOOR_MOISTURE, 90);
    const quality = clamp(j.quality + (solar ? 0 : info.dryingQuality), 5, 100);
    if (isWet(weather) && !solar) lines.push({ text: `Rain soaked uncovered drying rack #${j.id}: moisture back up to ${moisture.toFixed(1)}%. Cover racks when rain is forecast.`, severity: 'warning' });
    else if (moisture <= SAFE_MOISTURE && j.moisture > SAFE_MOISTURE) lines.push({ text: `Rack #${j.id} reached ${moisture.toFixed(1)}% moisture. Safe to bag.`, severity: 'good' });
    return { ...j, days: j.days + 1, moisture, quality };
  });
  return { ...s, dryingJobs };
}

function payBills(s: GameState, insuredLoss: number, lines: LogLine[]) {
  let { cash, workers, reputation, upgrades } = s;
  let crew = [...(s.crew ?? [])];
  const finance = { ...s.finance };
  let billState = s;

  const payout = Math.round(insuredLoss * INSURANCE_COVER);
  if (payout > 0) {
    cash += payout; finance.insurancePayouts += payout;
    billState = recordLedgerEntry(billState, {
      id: `day-${s.day}-insurance-payout`,
      day: s.day,
      category: 'insurancePayout',
      amount: payout,
      description: 'Agricultural insurance storm compensation',
    });
    lines.push({ text: `Insurance paid ${money(payout)} for weather damage.`, severity: 'good' });
  }

  let wages = crew.length > 0 ? crew.reduce((sum, w) => sum + w.dailyWage, 0) : workers * WAGE_PER_DAY;
  if (cash < wages) {
    if (crew.length > 0) {
      let currentCost = wages;
      while (crew.length > 0 && currentCost > cash) {
        const removed = crew.pop();
        if (removed) currentCost -= removed.dailyWage;
      }
      const quit = workers - crew.length;
      workers = crew.length;
      wages = crew.reduce((sum, w) => sum + w.dailyWage, 0);
      reputation = Math.max(0, reputation - 2);
      lines.push({ text: `Not enough cash for payroll: ${quit} worker${quit > 1 ? 's' : ''} quit. Profit on paper is not cash in hand.`, severity: 'danger' });
    } else {
      const afford = Math.max(0, Math.floor(cash / WAGE_PER_DAY));
      const quit = workers - afford;
      workers = afford; wages = afford * WAGE_PER_DAY; reputation = Math.max(0, reputation - 2);
      lines.push({ text: `Not enough cash for payroll: ${quit} worker${quit > 1 ? 's' : ''} quit. Profit on paper is not cash in hand.`, severity: 'danger' });
    }
    let fieldWorkers = s.automation.fieldWorkers ?? 0;
    let processingWorkers = s.automation.processingWorkers ?? 0;
    while (fieldWorkers + processingWorkers > workers && fieldWorkers + processingWorkers > 0) {
      if (processingWorkers > 0) processingWorkers--;
      else if (fieldWorkers > 0) fieldWorkers--;
    }
    s = { ...s, automation: { ...s.automation, fieldWorkers, processingWorkers } };
  }
  cash -= wages; finance.wages += wages; finance.expenses += wages;
  if (wages > 0) {
    billState = recordLedgerEntry(billState, {
      id: `day-${s.day}-wages`,
      day: s.day,
      category: 'wages',
      amount: wages,
      description: 'Daily crew payroll',
    });
  }

  // Equipment needs looking after whether or not it is used.
  const upkeep = Math.min(Math.max(0, cash), maintenanceCost(s));
  if (upkeep < maintenanceCost(s)) lines.push({ text: 'Not enough cash for equipment maintenance this evening.', severity: 'warning' });
  cash -= upkeep; finance.maintenance += upkeep; finance.expenses += upkeep;
  if (upkeep > 0) {
    billState = recordLedgerEntry(billState, {
      id: `day-${s.day}-upkeep`,
      day: s.day,
      category: 'equipmentMaintenance',
      amount: upkeep,
      description: 'Daily equipment maintenance upkeep',
    });
  }

  let premium = 0;
  if (upgrades.insurance) {
    if (cash >= INSURANCE_PREMIUM) {
      premium = INSURANCE_PREMIUM; cash -= premium; finance.insurancePremiums += premium; finance.expenses += premium;
      billState = recordLedgerEntry(billState, {
        id: `day-${s.day}-insurance-premium`,
        day: s.day,
        category: 'insurancePremium',
        amount: premium,
        description: 'Daily agricultural insurance premium',
      });
    } else {
      upgrades = { ...upgrades, insurance: false };
      lines.push({ text: 'Insurance lapsed: you could not pay the premium.', severity: 'danger' });
    }
  }
  return { state: { ...billState, cash, workers, crew, reputation, upgrades, finance }, wages, premium, payout };
}

function tickCrew(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  if (!s.crew?.length) return s;

  let plots = s.plots;
  const perks = calculateCrewPerks(s.crew);

  // Agronomist passive detection
  if (perks.diseaseDetectionBoost > 0) {
    plots = plots.map(p => {
      if (p.issue && !p.issue.detected && rng.chance(perks.diseaseDetectionBoost)) {
        lines.push({ text: `Field scout detected hidden ${TREATMENTS[p.issue.kind].name} on Plot ${plotName(p)}.`, severity: 'warning' });
        return { ...p, issue: { ...p.issue, detected: true } };
      }
      return p;
    });
  }

  // Experience progression and promotions
  const crew: WorkerProfile[] = s.crew.map(w => {
    const nextXp = w.xp + 10;
    const daysEmployed = w.daysEmployed + 1;
    let level = w.level;
    let dailyWage = w.dailyWage;

    if (level === 'rookie' && nextXp >= LEVEL_REQUIREMENTS.experienced.minXp) {
      level = 'experienced';
      dailyWage = Math.round(dailyWage * 1.5);
      lines.push({ text: `🎉 Promotion: ${w.name} advanced to Experienced ${ROLE_DETAILS[w.role].title}!`, severity: 'good' });
    } else if (level === 'experienced' && nextXp >= LEVEL_REQUIREMENTS.master.minXp) {
      level = 'master';
      dailyWage = Math.round(dailyWage * 1.45);
      lines.push({ text: `🏆 Master Specialist: ${w.name} attained Master ${ROLE_DETAILS[w.role].title}!`, severity: 'good' });
    }

    return { ...w, xp: nextXp, daysEmployed, level, dailyWage };
  });

  // Replenish candidates
  let candidates = [...(s.candidates ?? [])];
  if (candidates.length < 3) {
    const nextCandId = Math.max(1, ...(candidates.map(c => c.id)), ...(crew.map(w => w.id))) + 1;
    candidates.push(createWorkerCandidate(rng, nextCandId));
  }

  return { ...s, plots, crew, candidates, workers: crew.length };
}
