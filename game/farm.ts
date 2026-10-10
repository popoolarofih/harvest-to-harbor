import {
  EARLY_HARVEST_GROWTH, ENERGY, FERTILIZER_COST, FERTILIZER_GAIN, FRESH_MOISTURE, PREP, SEEDS, TREATMENTS,
  WATER_MOISTURE_GAIN, WATER_PER_PLOT,
} from './config';
import { expectedQuality, expectedYieldKg, inspectPlotReport } from './quality';
import { addXp, blocked, clamp, fail, log, plotName, progressMission, spend, updatePlot } from './state';
import type { Batch, GameState, PrepMethod, SeedTier } from './types';
import { isWet } from './weather';

const findPlot = (s: GameState, id: number) => s.plots.find(p => p.id === id);
const isCropped = (status: string) => status === 'growing' || status === 'ready';

export function preparePlot(s: GameState, id: number, method: PrepMethod = 'clear'): GameState {
  const p = findPlot(s, id), prep = PREP[method];
  if (!p || p.status !== 'empty') return fail(s, 'That plot is not available.');
  const why = blocked(s, { energy: prep.energy, cash: prep.cost });
  if (why) return fail(s, why);
  const next = updatePlot(spend(s, prep.cost, prep.energy), id, { status: 'prepared', ridged: method === 'ridge' });
  return { ...next, toast: `Plot ${plotName(p)}: ${prep.label.toLowerCase()} done. Choose seed to plant.` };
}

export function plantPlot(s: GameState, id: number, seed: SeedTier = 'improved'): GameState {
  const p = findPlot(s, id), info = SEEDS[seed];
  if (!p || p.status !== 'prepared') return fail(s, 'Prepare the soil before planting.');
  const why = blocked(s, { energy: ENERGY.plant, cash: info.cost });
  if (why) return fail(s, why);
  const next = updatePlot(spend(s, info.cost, ENERGY.plant), id, {
    status: 'growing', seed, growth: 0, health: 100, stand: 0, germinated: false, daysReady: 0, issue: null,
  });
  const planted = next.plots.filter(x => isCropped(x.status)).length;
  return progressMission({ ...next, toast: `Planted ${info.label.toLowerCase()} on plot ${plotName(p)}.` }, 'plant', planted, true);
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
  const why = blocked(s, { energy: ENERGY.fertilize, cash: FERTILIZER_COST });
  if (why) return fail(s, why);
  const washed = isWet(s.weather);
  const fertility = p.fertility + FERTILIZER_GAIN * (washed ? 0.5 : 1);
  const burn = fertility > 95 && p.status !== 'prepared';
  const next = updatePlot(spend(s, FERTILIZER_COST, ENERGY.fertilize), id, {
    fertility: Math.min(100, fertility), health: burn ? Math.max(0, p.health - 10) : p.health,
  });
  const toast = burn ? `Too much fertilizer on ${plotName(p)}: leaf burn cost 10% health.`
    : washed ? `Rain washed away half the fertilizer on ${plotName(p)}. Apply on dry days.`
    : `Fertilizer applied to ${plotName(p)}: fertility ${Math.round(Math.min(100, fertility))}%.`;
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
  const next = updatePlot(spend(s, t.cost, ENERGY.treat), id, { issue });
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
  const next = updatePlot(spend(s, cost, ENERGY.gapFill), id, { stand, growth: Math.max(0, p.growth - 8) });
  return { ...next, toast: `Gap-filled ${plotName(p)}: stand now ${Math.round(stand * 100)}%.` };
}

export function canHarvest(p: { status: string; growth: number }) {
  return p.status === 'ready' || (p.status === 'growing' && p.growth >= EARLY_HARVEST_GROWTH);
}

export function harvestPlot(s: GameState, id: number): GameState {
  const p = findPlot(s, id);
  if (!p || !canHarvest(p)) return fail(s, `This crop is not ready. You can harvest early from ${EARLY_HARVEST_GROWTH}% growth.`);
  const why = blocked(s, { energy: ENERGY.harvest });
  if (why) return fail(s, why);
  const kg = expectedYieldKg(p), quality = expectedQuality(p), early = p.status !== 'ready';
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

  const next = updatePlot({ ...spend(s, 0, ENERGY.harvest), batches, nextId }, id, {
    status: 'empty', growth: 0, health: 100, ridged: false, seed: null, stand: 0, germinated: false, daysReady: 0, issue: null,
    fertility: Math.max(10, p.fertility - 10),
  });
  const note = early ? ' (early: smaller rhizomes)' : p.daysReady > 4 ? ' (left too long: fibrous)' : '';
  return progressMission(addXp({ ...next, toast: `Harvested ${Math.round(kg)} kg from ${plotName(p)}${note}.` }, 20), 'harvest', kg);
}
