import { FERTILIZER_COST, FERTILIZER_GAIN, LITRES_PER_FUEL_LITRE, WATER_PER_PLOT } from './config';
import { autoIrrigate } from './irrigation';
import { clamp, fuelPrice, tankCapacity } from './state';
import type { AutomationSummary, GameState, Weather } from './types';
import type { Rng } from './rng';
import { isWet } from './weather';

export const emptyAutomationSummary = (): AutomationSummary => ({
  irrigatedPlots: 0, irrigationLitres: 0, pumpedLitres: 0, pumpingCost: 0,
  fertilizedPlots: 0, fertilizerCost: 0, coveredRacks: 0, irrigationNeedsRepair: false,
});

/** Morning equipment jobs happen before crop growth, so they affect today's outcome. */
export function runAutomation(s: GameState, weather: Weather, rng: Rng) {
  const summary = emptyAutomationSummary();
  let next = s;
  if (next.automation.autoPump && next.upgrades.irrigation && next.water < WATER_PER_PLOT) {
    const litres = tankCapacity(next) - next.water;
    const cost = Math.round(Math.ceil(litres / LITRES_PER_FUEL_LITRE) * fuelPrice(next));
    if (litres > 0 && next.cash >= cost) {
      next = { ...next, water: tankCapacity(next), cash: next.cash - cost, finance: { ...next.finance, expenses: next.finance.expenses + cost } };
      summary.pumpedLitres = litres; summary.pumpingCost = cost;
    }
  }
  const irrigation = autoIrrigate(next);
  next = irrigation.state;
  summary.irrigatedPlots = irrigation.irrigated;
  summary.irrigationLitres = irrigation.irrigated * WATER_PER_PLOT;
  if (irrigation.irrigated) {
    const clog = rng.chance(0.04) ? 20 : 0;
    const irrigationCondition = clamp(next.irrigationCondition - irrigation.irrigated * 0.6 - clog, 0, 100);
    next = { ...next, irrigationCondition };
    summary.irrigationNeedsRepair = irrigationCondition <= 20;
  }
  if (next.automation.autoFertilize && !isWet(weather)) {
    let remaining = next.automation.fertilizerDailyLimit;
    const plots = next.plots.map(p => {
      if (remaining <= 0 || next.cash - summary.fertilizerCost < FERTILIZER_COST || (p.status !== 'growing' && p.status !== 'ready') || p.fertility >= 35) return p;
      remaining--; summary.fertilizedPlots++; summary.fertilizerCost += FERTILIZER_COST;
      return { ...p, fertility: Math.min(100, p.fertility + FERTILIZER_GAIN) };
    });
    if (summary.fertilizedPlots) next = { ...next, plots, cash: next.cash - summary.fertilizerCost, finance: { ...next.finance, expenses: next.finance.expenses + summary.fertilizerCost } };
  }
  if (next.automation.autoCoverRacks && isWet(weather)) {
    const dryingJobs = next.dryingJobs.map(j => j.covered ? j : { ...j, covered: true });
    summary.coveredRacks = next.dryingJobs.filter(j => !j.covered).length;
    if (summary.coveredRacks) next = { ...next, dryingJobs };
  }
  return { state: next, summary };
}
