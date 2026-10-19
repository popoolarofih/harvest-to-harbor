import {
  CONSECUTIVE_GINGER_ROT_PENALTY, CONSECUTIVE_GINGER_YIELD_PENALTY, DIGGER_YIELD_BONUS, EARLY_HARVEST_GROWTH, ENERGY, TRACTOR_PREP_DISCOUNT,
  FERTILIZER_COST, FERTILIZER_GAIN, FRESH_MOISTURE, PREP, SEEDS, SOYBEAN_BASE_YIELD_KG, SOYBEAN_NITROGEN_GAIN,
  SOYBEAN_OM_GAIN, SOYBEAN_ROT_SUPPRESSION, SOYBEAN_SEED_COST, TREATMENTS, WATER_MOISTURE_GAIN, WATER_PER_PLOT,
} from './config';
import { isUnlocked, lockedReason } from './levels';
import { expectedQuality, expectedYieldKg, gradeForBatch, inspectPlotReport } from './quality';
import { getConsecutiveGingerCount } from './soil';
import { addXp, blocked, clamp, fail, log, plotName, spend, updatePlot } from './state';
import type { Batch, CropHistoryEntry, CropType, GameState, PrepMethod, SeedTier } from './types';
import { isWet } from './weather';
import { recordLedgerEntry } from './ledger';

const findPlot = (s: GameState, id: number) => s.plots.find(p => p.id === id);

/** Land preparation cost after equipment: a tractor does the heavy work for less. */
export const prepCost = (s: GameState, method: PrepMethod) => Math.round(PREP[method].cost * (s.upgrades.tractor ? 1 - TRACTOR_PREP_DISCOUNT : 1));
/** Energy one harvest takes: a mechanical digger halves it. */
export const harvestEnergy = (s: GameState) => (s.upgrades.digger ? Math.ceil(ENERGY.harvest / 2) : ENERGY.harvest);

export function preparePlot(s: GameState, id: number, method: PrepMethod = 'clear'): GameState {
  const p = findPlot(s, id), prep = PREP[method], cost = prepCost(s, method);
  if (!p || p.status !== 'empty') return fail(s, 'That plot is not available.');
  const why = blocked(s, { energy: prep.energy, cash: cost });
  if (why) return fail(s, why);
  let next = updatePlot(spend(s, cost, prep.energy), id, { status: 'prepared', ridged: method === 'ridge' });
  if (cost > 0) {
    next = recordLedgerEntry(next, {
      id: `prep-plot-${id}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: cost,
      referenceId: id,
      description: `Land preparation (${prep.label}) for plot ${plotName(p)}`,
    });
  }
  return { ...next, toast: `Plot ${plotName(p)}: ${prep.label.toLowerCase()} done. Choose seed to plant.` };
}

export function plantPlot(
  s: GameState,
  id: number,
  seed: SeedTier = 'improved',
  crop: CropType = 'ginger'
): GameState {
  const p = findPlot(s, id);
  if (!p || p.status !== 'prepared') return fail(s, 'Prepare the soil before planting.');

  if (crop === 'soybean') {
    const hasStock = (s.stock?.soybean ?? 0) > 0;
    const cashCost = hasStock ? 0 : SOYBEAN_SEED_COST;
    const why = blocked(s, { energy: ENERGY.plant, cash: cashCost });
    if (why) return fail(s, why);

    const stock = hasStock ? { ...s.stock, soybean: s.stock.soybean - 1 } : s.stock;
    const spent = spend(s, cashCost, ENERGY.plant);
    let next = updatePlot({ ...spent, stock }, id, {
      status: 'growing',
      crop: 'soybean',
      seed: null,
      growth: 0,
      health: 100,
      stand: 0.95,
      germinated: true,
      daysReady: 0,
      issue: null,
    });
    if (cashCost > 0) {
      next = recordLedgerEntry(next, {
        id: `plant-plot-${id}-${s.day}`,
        day: s.day,
        category: 'inputCost',
        amount: cashCost,
        referenceId: id,
        description: `Purchased soybean seed for plot ${plotName(p)}`,
      });
    }
    return { ...next, toast: `Planted soybean on plot ${plotName(p)}${hasStock ? ' (from stock)' : ''}. Fixes nitrogen and rejuvenates soil.` };
  }

  // Ginger planting
  const info = SEEDS[seed];
  if (seed === 'certified' && !isUnlocked(s, 'certifiedSeed')) return fail(s, `Certified seed: ${lockedReason(s, 'certifiedSeed')}.`);
  const hasStock = (s.stock?.[seed] ?? 0) > 0;
  const cashCost = hasStock ? 0 : info.cost;
  const why = blocked(s, { energy: ENERGY.plant, cash: cashCost });
  if (why) return fail(s, why);

  const consecutive = getConsecutiveGingerCount(p);
  const diseasePressure = { ...(p.diseasePressure ?? { rot: 0, leafSpot: 0, pest: 0 }) };
  if (consecutive >= 1) {
    diseasePressure.rot = Math.min(100, diseasePressure.rot + CONSECUTIVE_GINGER_ROT_PENALTY);
  }

  const stock = hasStock ? { ...s.stock, [seed]: s.stock[seed] - 1 } : s.stock;
  const spent = spend(s, cashCost, ENERGY.plant);
  let next = updatePlot({ ...spent, stock }, id, {
    status: 'growing',
    crop: 'ginger',
    seed,
    growth: 0,
    health: 100,
    stand: 0,
    germinated: false,
    daysReady: 0,
    issue: null,
    diseasePressure,
  });
  if (cashCost > 0) {
    next = recordLedgerEntry(next, {
      id: `plant-plot-${id}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: cashCost,
      referenceId: id,
      description: `Purchased ${info.label} seed for plot ${plotName(p)}`,
    });
  }
  const monoWarn = consecutive >= 1 ? ` (⚠️ ${consecutive}x consecutive ginger: rot risk elevated)` : '';
  return { ...next, toast: `Planted ${info.label.toLowerCase()} on plot ${plotName(p)}${hasStock ? ' (from stock)' : ''}${monoWarn}.` };
}

export function waterPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p || p.status === 'empty') return fail(s, 'Nothing to water here.');
  if (s.water < WATER_PER_PLOT) return fail(s, 'The tank is empty. Pump water from the borehole first.');
  const why = blocked(s, { energy: ENERGY.water });
  if (why) return fail(s, why);
  const moisture = clamp(p.moisture + WATER_MOISTURE_GAIN, 0, 100);
  const next = updatePlot({ ...spend(s, 0, ENERGY.water), water: s.water - WATER_PER_PLOT }, id, { moisture });
  return { ...next, toast: moisture > 85 ? `Plot ${plotName(p)} is now waterlogged (${Math.round(moisture)}%). Too much water invites rot.` : `Watered plot ${plotName(p)}: soil moisture ${Math.round(moisture)}%.` };
}

export function fertilizePlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p || p.status === 'empty') return fail(s, 'Prepare the plot before applying fertilizer.');
  const hasStock = (s.stock?.fertilizer ?? 0) > 0;
  const cashCost = hasStock ? 0 : FERTILIZER_COST;
  const why = blocked(s, { energy: ENERGY.fertilize, cash: cashCost });
  if (why) return fail(s, why);
  const washed = isWet(s.weather);
  const fertility = p.fertility + FERTILIZER_GAIN * (washed ? 0.5 : 1);
  const burn = fertility > 95 && p.status !== 'prepared';
  const stock = hasStock ? { ...s.stock, fertilizer: s.stock.fertilizer - 1 } : s.stock;
  const spent = spend(s, cashCost, ENERGY.fertilize);
  let next = updatePlot({ ...spent, stock }, id, {
    fertility: Math.min(100, fertility), health: burn ? Math.max(0, p.health - 10) : p.health,
  });
  if (cashCost > 0) {
    next = recordLedgerEntry(next, {
      id: `fertilize-plot-${id}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: cashCost,
      referenceId: id,
      description: `Purchased fertilizer for plot ${plotName(p)}`,
    });
  }
  const toast = burn ? `Too much fertilizer on ${plotName(p)}: leaf burn cost 10% health.`
    : washed ? `Rain washed away half the fertilizer on ${plotName(p)}. Apply on dry days.`
    : `Fertilizer applied to ${plotName(p)}: fertility ${Math.round(Math.min(100, fertility))}%${hasStock ? ' (from stock)' : ''}.`;
  return { ...next, toast };
}

export function inspectPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p) return s;
  const why = blocked(s, { energy: ENERGY.inspect });
  if (why) return fail(s, why);
  const issue = p.issue ? { ...p.issue, detected: true } : null;
  const next = updatePlot(spend(s, 0, ENERGY.inspect), id, { issue });
  const report = inspectPlotReport({ ...p, issue });
  const found = p.issue && !p.issue.detected;
  return {
    ...(found ? log(next, { text: `Inspection found ${TREATMENTS[p.issue!.kind].name.toLowerCase()} on plot ${plotName(p)}.`, severity: 'warning' }) : next),
    lastInspection: report,
    toast: found ? `Problem found on plot ${plotName(p)}: ${TREATMENTS[p.issue!.kind].name}.` : `Inspected plot ${plotName(p)}.`,
  };
}

export function treatPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p?.issue || !p.issue.detected) return fail(s, 'Inspect the plot first: you can only treat a problem you have identified.');
  const t = TREATMENTS[p.issue.kind];
  const why = blocked(s, { energy: ENERGY.treat, cash: t.cost });
  if (why) return fail(s, why);
  const contained = p.issue.kind === 'rot' ? p.issue.severity * 0.4 : 0;
  const issue = contained >= 15 ? { ...p.issue, severity: contained } : null;
  let next = updatePlot(spend(s, t.cost, ENERGY.treat), id, { issue });
  if (t.cost > 0) {
    next = recordLedgerEntry(next, {
      id: `treat-plot-${id}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: t.cost,
      referenceId: id,
      description: `Purchased ${t.name} treatment for plot ${plotName(p)}`,
    });
  }
  return addXp({ ...next, toast: issue ? `${t.label} slowed the rot on ${plotName(p)}, but it is still there.` : `${t.label} cleared the ${t.name.toLowerCase()} on ${plotName(p)}.` }, 10);
}

/** Replant missing setts after poor germination. Costly, and late setts bulk less. */
export function gapFillPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p?.seed || !p.germinated || p.stand >= 0.9 || p.growth >= 60) return fail(s, 'Gap-filling only helps young crops with poor emergence.');
  const cost = Math.round(SEEDS[p.seed].cost * (1 - p.stand));
  const why = blocked(s, { energy: ENERGY.gapFill, cash: cost });
  if (why) return fail(s, why);
  const stand = Math.min(0.95, p.stand + (1 - p.stand) * 0.8);
  let next = updatePlot(spend(s, cost, ENERGY.gapFill), id, { stand, growth: Math.max(0, p.growth - 8) });
  if (cost > 0) {
    next = recordLedgerEntry(next, {
      id: `gapfill-plot-${id}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: cost,
      referenceId: id,
      description: `Gap-filling seed for plot ${plotName(p)}`,
    });
  }
  return { ...next, toast: `Gap-filled ${plotName(p)}: stand now ${Math.round(stand * 100)}%.` };
}

export function canHarvest(p: { status: string; growth: number }) {
  return p.status === 'ready' || (p.status === 'growing' && p.growth >= EARLY_HARVEST_GROWTH);
}

export function harvestPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p || !canHarvest(p)) return fail(s, `This crop is not ready. You can harvest early from ${EARLY_HARVEST_GROWTH}% growth.`);
  const energy = harvestEnergy(s);
  const why = blocked(s, { energy });
  if (why) return fail(s, why);

  if (p.crop === 'soybean') {
    const early = p.status !== 'ready';
    const kg = Math.round(SOYBEAN_BASE_YIELD_KG * (p.stand || 0.9) * (p.health / 100) * (early ? 0.8 : 1));
    const quality = Math.round(clamp(p.health, 20, 100));

    const todays = s.batches.find(b => b.product === 'soybean' && b.createdDay === s.day);
    let batches: Batch[], nextId = s.nextId;
    if (todays) {
      const total = todays.kg + kg;
      const merged = { ...todays, kg: total, quality: (todays.quality * todays.kg + quality * kg) / total };
      batches = s.batches.map(b => (b.id === todays.id ? merged : b));
    } else {
      batches = [...s.batches, { id: nextId++, product: 'soybean', kg, quality, moisture: 13, createdDay: s.day }];
    }

    const fertGain = SOYBEAN_NITROGEN_GAIN;
    const omGain = SOYBEAN_OM_GAIN;
    const rotPressure = Math.round((p.diseasePressure?.rot ?? 0) * SOYBEAN_ROT_SUPPRESSION);
    const pestPressure = Math.round((p.diseasePressure?.pest ?? 0) * 0.6);

    const historyEntry: CropHistoryEntry = {
      crop: 'soybean',
      season: Math.ceil(s.day / 60),
      harvestDay: s.day,
      yieldKg: kg,
      grade: gradeForBatch({ product: 'soybean', quality, moisture: 13 }),
      fertilityChange: fertGain,
      organicMatterChange: omGain,
      greenManured: false,
    };

    const next = updatePlot({ ...spend(s, 0, energy), batches, nextId }, id, {
      status: 'empty',
      crop: undefined,
      seed: null,
      growth: 0,
      health: 100,
      ridged: false,
      stand: 0,
      germinated: false,
      daysReady: 0,
      issue: null,
      fertility: Math.min(100, p.fertility + fertGain),
      organicMatter: Math.min(100, (p.organicMatter ?? 35) + omGain),
      compaction: Math.max(5, (p.compaction ?? 20) - 8),
      diseasePressure: {
        ...(p.diseasePressure ?? { rot: 0, leafSpot: 0, pest: 0 }),
        rot: rotPressure,
        pest: pestPressure,
      },
      cropHistory: [historyEntry, ...(p.cropHistory ?? [])].slice(0, 5),
    });

    return addXp({ ...next, toast: `Harvested ${kg} kg soybean grain from ${plotName(p)}. Soil gained +${fertGain} fertility and +${omGain}% organic matter!` }, 25);
  }

  // Ginger harvest
  const consecutive = getConsecutiveGingerCount(p);
  const penalty = consecutive > 0 && (p.organicMatter ?? 35) < 30 ? (1 - CONSECUTIVE_GINGER_YIELD_PENALTY) : 1;
  const kg = Math.round(expectedYieldKg(p) * penalty * (s.upgrades.digger ? 1 + DIGGER_YIELD_BONUS : 1));
  const quality = expectedQuality(p), early = p.status !== 'ready';
  const moisture = FRESH_MOISTURE + (early ? 4 : 0);

  // Everything harvested today goes into one batch so the player sells/dries a sensible lot.
  const todays = s.batches.find(b => b.product === 'fresh' && b.createdDay === s.day);
  let batches: Batch[], nextId = s.nextId;
  if (todays) {
    const total = todays.kg + kg;
    const merged = { ...todays, kg: total, quality: (todays.quality * todays.kg + quality * kg) / total, moisture: (todays.moisture * todays.kg + moisture * kg) / total };
    batches = s.batches.map(b => (b.id === todays.id ? merged : b));
  } else {
    batches = [...s.batches, { id: nextId++, product: 'fresh', kg, quality, moisture, createdDay: s.day }];
  }

  const diseasePressure = { ...(p.diseasePressure ?? { rot: 0, leafSpot: 0, pest: 0 }) };
  if (p.issue) {
    diseasePressure[p.issue.kind] = Math.min(100, (diseasePressure[p.issue.kind] ?? 0) + Math.round(p.issue.severity * 0.35));
  }

  const historyEntry: CropHistoryEntry = {
    crop: 'ginger',
    season: Math.ceil(s.day / 60),
    harvestDay: s.day,
    yieldKg: kg,
    grade: gradeForBatch({ product: 'fresh', quality, moisture }),
    fertilityChange: -10,
    organicMatterChange: -2,
    diseaseExperienced: p.issue ? [p.issue.kind] : [],
    greenManured: false,
  };

  const stats = { ...s.stats, harvestedKg: s.stats.harvestedKg + kg };
  const next = updatePlot({ ...spend(s, 0, energy), batches, nextId, stats }, id, {
    status: 'empty',
    crop: undefined,
    growth: 0,
    health: 100,
    ridged: false,
    seed: null,
    stand: 0,
    germinated: false,
    daysReady: 0,
    issue: null,
    fertility: Math.max(10, p.fertility - 10),
    organicMatter: Math.max(5, (p.organicMatter ?? 35) - 2),
    compaction: Math.min(100, (p.compaction ?? 20) + 6),
    diseasePressure,
    cropHistory: [historyEntry, ...(p.cropHistory ?? [])].slice(0, 5),
  });
  const note = early ? ' (early: smaller rhizomes)' : p.daysReady > 4 ? ' (left too long: fibrous)' : '';
  return addXp({ ...next, toast: `Harvested ${Math.round(kg)} kg from ${plotName(p)}${note}.` }, 20);
}
