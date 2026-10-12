import {
  FERTILIZER_COST, FERTILIZER_GAIN, FRESH_MOISTURE, LITRES_PER_FUEL_LITRE, PLOTS_PER_FIELD_WORKER, PREP,
  SAFE_MOISTURE, SEEDS, TREATMENTS, WATER_MOISTURE_GAIN, WATER_PER_PLOT,
} from './config';
import { autoIrrigate } from './irrigation';
import { isUnlocked } from './levels';
import { expectedQuality, expectedYieldKg } from './quality';
import { availableWorkers, clamp, fuelPrice, tankCapacity } from './state';
import type { AutomationSummary, Batch, GameState, Weather } from './types';
import type { Rng } from './rng';
import { isWet } from './weather';

export const emptyAutomationSummary = (): AutomationSummary => ({
  irrigatedPlots: 0, irrigationLitres: 0, pumpedLitres: 0, pumpingCost: 0,
  fertilizedPlots: 0, fertilizerCost: 0, coveredRacks: 0, irrigationNeedsRepair: false,
  plantedPlots: 0, plantedCost: 0, wateredPlots: 0, treatedPlots: 0, treatmentCost: 0,
  gapFilledPlots: 0, harvestedPlots: 0, harvestedKg: 0, openedRacks: 0, baggedRacks: 0,
});

/** Morning jobs by equipment, hired field labour, and processing workers. */
export function runAutomation(s: GameState, weather: Weather, rng: Rng) {
  const summary = emptyAutomationSummary();
  let next = s;

  // 1. Drip irrigation controller & borehole pump
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

  // Equipment auto-fertilize (via drip or tank)
  if (next.automation.autoFertilize && !isWet(weather) && (next.automation.fieldWorkers ?? 0) === 0) {
    let remaining = next.automation.fertilizerDailyLimit;
    const plots = next.plots.map(p => {
      if (remaining <= 0 || next.cash - summary.fertilizerCost < FERTILIZER_COST || (p.status !== 'growing' && p.status !== 'ready') || p.fertility >= 35) return p;
      remaining--; summary.fertilizedPlots++; summary.fertilizerCost += FERTILIZER_COST;
      return { ...p, fertility: Math.min(100, p.fertility + FERTILIZER_GAIN) };
    });
    if (summary.fertilizedPlots) next = { ...next, plots, cash: next.cash - summary.fertilizerCost, finance: { ...next.finance, expenses: next.finance.expenses + summary.fertilizerCost } };
  }

  // 2. Processing workers: drying rack protection & sun exposure ("cover and open when needed")
  const activeProcessing = Math.min(next.automation.processingWorkers ?? 0, availableWorkers(next));
  const canManageRacks = activeProcessing > 0 || next.automation.autoCoverRacks;
  if (canManageRacks) {
    if (isWet(weather)) {
      const uncovered = next.dryingJobs.filter(j => !j.covered).length;
      if (uncovered > 0) {
        next = { ...next, dryingJobs: next.dryingJobs.map(j => ({ ...j, covered: true })) };
        summary.coveredRacks = uncovered;
      }
    } else if (activeProcessing > 0 || next.automation.autoOpenRacks) {
      const covered = next.dryingJobs.filter(j => j.covered).length;
      if (covered > 0) {
        next = { ...next, dryingJobs: next.dryingJobs.map(j => ({ ...j, covered: false })) };
        summary.openedRacks = covered;
      }
    }

    // Optional: auto-bag safe dried ginger if bagged toggle is on and workers are stationed
    if (activeProcessing > 0 && next.automation.autoBagRacks) {
      const safeJobs = next.dryingJobs.filter(j => j.moisture <= SAFE_MOISTURE);
      for (const job of safeJobs) {
        const kg = job.dryMatterKg / (1 - job.moisture / 100);
        const cost = Math.round(kg * 20); // bulk jute packaging
        if (next.cash >= cost) {
          const batch: Batch = {
            id: next.nextId++,
            product: 'dried',
            kg,
            quality: job.quality,
            moisture: job.moisture,
            createdDay: next.day,
            packaging: 'bulk',
            soiled: job.soiled,
          };
          next = {
            ...next,
            cash: next.cash - cost,
            finance: { ...next.finance, expenses: next.finance.expenses + cost },
            dryingJobs: next.dryingJobs.filter(j => j.id !== job.id),
            batches: [...next.batches, batch],
            stats: { ...next.stats, safeDriedKg: next.stats.safeDriedKg + kg },
          };
          summary.baggedRacks = (summary.baggedRacks ?? 0) + 1;
        }
      }
    }
  }

  // 3. Hired field labours: automatically plant and maintain the plants
  const activeField = Math.min(next.automation.fieldWorkers ?? 0, availableWorkers(next));
  if (activeField > 0) {
    let remainingCapacity = activeField * PLOTS_PER_FIELD_WORKER;

    // A. Maintain growing and ready crops
    if (next.automation.autoMaintain ?? true) {
      const updatedPlots = next.plots.map(orig => {
        let p = { ...orig };

        // Auto-harvest ready crops if enabled
        if (next.automation.autoHarvest && p.status === 'ready') {
          const kg = expectedYieldKg(p), quality = expectedQuality(p);
          const moisture = FRESH_MOISTURE;
          const todays = next.batches.find(b => b.product === 'fresh' && b.createdDay === next.day);
          let batches: Batch[];
          if (todays) {
            const total = todays.kg + kg;
            const merged = { ...todays, kg: total, quality: (todays.quality * todays.kg + quality * kg) / total, moisture: (todays.moisture * todays.kg + moisture * kg) / total };
            batches = next.batches.map(b => (b.id === todays.id ? merged : b));
          } else {
            batches = [...next.batches, { id: next.nextId++, product: 'fresh', kg, quality, moisture, createdDay: next.day }];
          }
          next = { ...next, batches, stats: { ...next.stats, harvestedKg: next.stats.harvestedKg + kg } };
          summary.harvestedPlots = (summary.harvestedPlots ?? 0) + 1;
          summary.harvestedKg = (summary.harvestedKg ?? 0) + kg;
          return {
            ...p,
            status: 'empty' as const, growth: 0, health: 100, ridged: false, seed: null,
            stand: 0, germinated: false, daysReady: 0, issue: null,
            fertility: Math.max(10, p.fertility - 10),
          };
        }

        if (p.status !== 'growing' && p.status !== 'ready') return p;

        // Inspect and treat issues
        if (p.issue) {
          p.issue = { ...p.issue, detected: true };
          if (next.automation.autoTreat ?? true) {
            const t = TREATMENTS[p.issue.kind];
            if (next.cash >= t.cost) {
              next = { ...next, cash: next.cash - t.cost, finance: { ...next.finance, expenses: next.finance.expenses + t.cost } };
              const contained = p.issue.kind === 'rot' ? p.issue.severity * 0.4 : 0;
              p.issue = contained >= 15 ? { ...p.issue, severity: contained } : null;
              summary.treatedPlots = (summary.treatedPlots ?? 0) + 1;
              summary.treatmentCost = (summary.treatmentCost ?? 0) + t.cost;
            }
          }
        }

        if (p.status !== 'growing') return p;

        // Auto-water thirsty beds
        if ((next.automation.autoWater ?? true) && p.moisture < (next.automation.irrigationThreshold ?? 35)) {
          if (next.water >= WATER_PER_PLOT) {
            next = { ...next, water: next.water - WATER_PER_PLOT };
            p.moisture = clamp(p.moisture + WATER_MOISTURE_GAIN, 0, 100);
            summary.wateredPlots = (summary.wateredPlots ?? 0) + 1;
          }
        }

        // Auto-fertilize depleted beds
        if ((next.automation.autoFertilize ?? true) && !isWet(weather) && p.fertility < 35) {
          if (next.cash >= FERTILIZER_COST) {
            next = { ...next, cash: next.cash - FERTILIZER_COST, finance: { ...next.finance, expenses: next.finance.expenses + FERTILIZER_COST } };
            p.fertility = Math.min(100, p.fertility + FERTILIZER_GAIN);
            summary.fertilizedPlots = (summary.fertilizedPlots ?? 0) + 1;
            summary.fertilizerCost = (summary.fertilizerCost ?? 0) + FERTILIZER_COST;
          }
        }

        // Auto gap-fill patchy germination
        if ((next.automation.autoGapFill ?? true) && p.seed && p.germinated && p.stand < 0.9 && p.growth < 60) {
          const cost = Math.round(SEEDS[p.seed].cost * (1 - p.stand));
          if (next.cash >= cost) {
            next = { ...next, cash: next.cash - cost, finance: { ...next.finance, expenses: next.finance.expenses + cost } };
            p.stand = Math.min(0.95, p.stand + (1 - p.stand) * 0.8);
            p.growth = Math.max(0, p.growth - 8);
            summary.gapFilledPlots = (summary.gapFilledPlots ?? 0) + 1;
          }
        }

        return p;
      });
      next = { ...next, plots: updatedPlots };
    }

    // B. Auto-plant empty beds
    if (next.automation.autoPlant ?? true) {
      const prepMethod = next.automation.prepMethod ?? 'ridge';
      let seedTier = next.automation.plantSeed ?? 'improved';
      if (seedTier === 'certified' && !isUnlocked(next, 'certifiedSeed')) seedTier = 'improved';
      const prepCost = PREP[prepMethod].cost;
      const seedCost = SEEDS[seedTier].cost;
      const totalCost = prepCost + seedCost;

      const plots = next.plots.map(orig => {
        if (orig.status !== 'empty' || remainingCapacity <= 0) return orig;
        if (next.cash < totalCost) return orig;

        next = {
          ...next,
          cash: next.cash - totalCost,
          finance: { ...next.finance, expenses: next.finance.expenses + totalCost },
        };
        remainingCapacity--;
        summary.plantedPlots = (summary.plantedPlots ?? 0) + 1;
        summary.plantedCost = (summary.plantedCost ?? 0) + totalCost;

        return {
          ...orig,
          status: 'growing' as const,
          ridged: prepMethod === 'ridge',
          seed: seedTier,
          growth: 0,
          health: 100,
          stand: 0,
          germinated: false,
          daysReady: 0,
          issue: null,
        };
      });
      next = { ...next, plots };
    }
  }

  return { state: next, summary };
}
