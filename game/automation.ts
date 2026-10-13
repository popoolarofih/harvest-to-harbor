import {
  FERTILIZER_COST, FERTILIZER_GAIN, FRESH_MOISTURE, GRIND_MAX_MOISTURE, GRIND_YIELD,
  LITRES_PER_FUEL_LITRE, MILL_KG_PER_WORKER, PLOTS_PER_FIELD_WORKER, PREP,
  SAFE_MOISTURE, SEEDS, TREATMENTS, WATER_MOISTURE_GAIN, WATER_PER_PLOT,
} from './config';
import { getReservedKg, reserveStock } from './contracts';
import { dryKgOf, grindCost, packagingCost } from './economy';
import { autoIrrigate } from './irrigation';
import { isUnlocked } from './levels';
import { expectedQuality, expectedYieldKg } from './quality';
import { availableWorkers, clamp, fuelPrice, storedKg, tankCapacity, warehouseCapacity } from './state';
import type { AutomationSummary, Batch, GameState, Weather } from './types';
import type { Rng } from './rng';
import { isWet } from './weather';
import { recordLedgerEntry } from './ledger';

export const emptyAutomationSummary = (): AutomationSummary => ({
  irrigatedPlots: 0, irrigationLitres: 0, pumpedLitres: 0, pumpingCost: 0,
  fertilizedPlots: 0, fertilizerCost: 0, coveredRacks: 0, irrigationNeedsRepair: false,
  plantedPlots: 0, plantedCost: 0, wateredPlots: 0, treatedPlots: 0, treatmentCost: 0,
  gapFilledPlots: 0, harvestedPlots: 0, harvestedKg: 0, openedRacks: 0, baggedRacks: 0,
  milledBatches: 0, milledKg: 0, reservedKg: 0, blocked: [],
});

/** Morning jobs by equipment, hired field labour, and processing workers. */
export function runAutomation(s: GameState, weather: Weather, rng: Rng) {
  const summary = emptyAutomationSummary();
  const blockedReasons = new Set<string>();
  let next = s;

  // 1. Drip irrigation controller & borehole pump
  if (next.automation.autoPump && next.upgrades.irrigation && next.water < WATER_PER_PLOT) {
    const litres = tankCapacity(next) - next.water;
    const cost = Math.round(Math.ceil(litres / LITRES_PER_FUEL_LITRE) * fuelPrice(next));
    if (litres > 0) {
      if (next.cash >= cost) {
        next = { ...next, water: tankCapacity(next), cash: next.cash - cost, finance: { ...next.finance, expenses: next.finance.expenses + cost } };
        next = recordLedgerEntry(next, {
          id: `auto-pump-${s.day}`,
          day: s.day,
          category: 'fuelUtilities',
          amount: cost,
          description: `Borehole automated pumping fuel (${litres} L)`,
        });
        summary.pumpedLitres = litres; summary.pumpingCost = cost;
      } else {
        blockedReasons.add('Borehole pump could not run: insufficient cash for fuel.');
      }
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
      if (remaining <= 0 || (p.status !== 'growing' && p.status !== 'ready') || p.fertility >= 35) return p;
      const hasStock = (next.stock?.fertilizer ?? 0) > 0;
      const cost = hasStock ? 0 : FERTILIZER_COST;
      if (next.cash - summary.fertilizerCost < cost) {
        blockedReasons.add('Auto-fertilize stopped: insufficient cash for fertilizer.');
        return p;
      }
      remaining--; summary.fertilizedPlots++; summary.fertilizerCost += cost;
      if (hasStock) {
        next = { ...next, stock: { ...next.stock, fertilizer: next.stock.fertilizer - 1 } };
      }
      return { ...p, fertility: Math.min(100, p.fertility + FERTILIZER_GAIN) };
    });
    if (summary.fertilizedPlots) {
      next = { ...next, plots, cash: next.cash - summary.fertilizerCost, finance: { ...next.finance, expenses: next.finance.expenses + summary.fertilizerCost } };
      if (summary.fertilizerCost > 0) {
        next = recordLedgerEntry(next, {
          id: `auto-fertilize-${s.day}`,
          day: s.day,
          category: 'inputCost',
          amount: summary.fertilizerCost,
          description: `Drip automated fertilizer applied to ${summary.fertilizedPlots} plots`,
        });
      }
    }
  }

  // 2. Processing workers: drying rack protection, sun exposure, auto-bagging, auto-milling, contract reservations
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

    // Auto-bag safe dried ginger if enabled and workers are stationed
    if (activeProcessing > 0 && next.automation.autoBagRacks) {
      const safeJobs = next.dryingJobs.filter(j => j.moisture <= SAFE_MOISTURE);
      const packaging = next.automation.bagPackaging ?? 'bulk';
      for (const job of safeJobs) {
        const kg = dryKgOf(job);
        const cost = packagingCost(next, kg, packaging);
        if (storedKg(next) + kg > warehouseCapacity(next)) {
          blockedReasons.add(`Auto-bagging rack #${job.id} paused: warehouse storage full.`);
          continue;
        }
        if (next.cash < cost) {
          blockedReasons.add(`Auto-bagging rack #${job.id} paused: insufficient cash for packaging.`);
          continue;
        }
        const batch: Batch = {
          id: next.nextId++,
          product: 'dried',
          kg,
          quality: job.quality,
          moisture: job.moisture,
          createdDay: next.day,
          packaging,
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
        if (cost > 0) {
          next = recordLedgerEntry(next, {
            id: `auto-bag-${batch.id}`,
            day: s.day,
            category: 'processingPackaging',
            amount: cost,
            referenceId: batch.id,
            description: `Automated bagging of dried rack #${job.id}`,
          });
        }
        summary.baggedRacks = (summary.baggedRacks ?? 0) + 1;
      }
    }
  }

  // 3. Factory Auto-Milling
  if (next.automation.autoMill) {
    if (!next.upgrades.mill || !next.upgrades.factory) {
      blockedReasons.add('Auto-milling requires Hammer Mill and Processing Factory upgrades.');
    } else if (activeProcessing <= 0) {
      blockedReasons.add('Auto-milling paused: no processing workers assigned.');
    } else {
      let millCapacity = activeProcessing * MILL_KG_PER_WORKER;
      const millPkg = next.automation.millPackaging ?? 'sealed';
      const driedBatches = next.batches.filter(b => b.product === 'dried' && !b.reservedFor);

      for (const b of driedBatches) {
        if (millCapacity <= 0) break;
        if (b.moisture > GRIND_MAX_MOISTURE) {
          blockedReasons.add(`Batch #${b.id} moisture is ${b.moisture.toFixed(1)}%: auto-milling skipped to prevent caking (max ${GRIND_MAX_MOISTURE}%).`);
          continue;
        }
        const takeKg = Math.min(b.kg, millCapacity);
        const subBatch: Batch = { ...b, kg: takeKg };
        const cost = grindCost(next, subBatch, millPkg);
        if (next.cash < cost) {
          blockedReasons.add('Auto-milling paused: insufficient cash for diesel and packaging.');
          break;
        }
        const powderKg = takeKg * GRIND_YIELD;
        const powderQuality = clamp(b.quality - 2, 5, 100);
        const powder: Batch = {
          id: next.nextId++,
          product: 'powder',
          kg: powderKg,
          quality: powderQuality,
          moisture: Math.max(6, b.moisture - 1),
          createdDay: next.day,
          packaging: millPkg,
          soiled: b.soiled,
        };

        const remainingInBatch = b.kg - takeKg;
        const updatedBatches = remainingInBatch > 1
          ? next.batches.map(x => (x.id === b.id ? { ...x, kg: remainingInBatch } : x))
          : next.batches.filter(x => x.id !== b.id);

        next = {
          ...next,
          cash: next.cash - cost,
          finance: { ...next.finance, expenses: next.finance.expenses + cost },
          batches: [...updatedBatches, powder],
          stats: { ...next.stats, powderKg: next.stats.powderKg + powderKg },
        };
        if (cost > 0) {
          next = recordLedgerEntry(next, {
            id: `auto-mill-${powder.id}`,
            day: s.day,
            category: 'processingPackaging',
            amount: cost,
            referenceId: powder.id,
            description: `Automated hammer mill grinding of ${Math.round(takeKg)} kg dried ginger`,
          });
        }
        millCapacity -= takeKg;
        summary.milledBatches = (summary.milledBatches ?? 0) + 1;
        summary.milledKg = (summary.milledKg ?? 0) + powderKg;
      }
    }
  }

  // 4. Contract Auto-Reservation
  if (next.automation.autoReserve) {
    const activeContracts = next.contracts.filter(c => c.status === 'active');
    for (const c of activeContracts) {
      const already = getReservedKg(next, c.id);
      if (already < c.kg) {
        const res = reserveStock(next, c.id);
        const now = getReservedKg(res, c.id);
        if (now > already) {
          next = res;
          summary.reservedKg = (summary.reservedKg ?? 0) + (now - already);
        }
      }
    }
  }

  // 5. Hired field labours: automatically plant and maintain the plants
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
              if (t.cost > 0) {
                next = recordLedgerEntry(next, {
                  id: `auto-treat-${p.id}-${s.day}`,
                  day: s.day,
                  category: 'inputCost',
                  amount: t.cost,
                  referenceId: p.id,
                  description: `Field labour treatment (${t.name}) for plot ${p.id + 1}`,
                });
              }
              const contained = p.issue.kind === 'rot' ? p.issue.severity * 0.4 : 0;
              p.issue = contained >= 15 ? { ...p.issue, severity: contained } : null;
              summary.treatedPlots = (summary.treatedPlots ?? 0) + 1;
              summary.treatmentCost = (summary.treatmentCost ?? 0) + t.cost;
            } else {
              blockedReasons.add('Field labour treatment paused: insufficient cash.');
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
          } else {
            blockedReasons.add('Field labour watering paused: water tank is empty.');
          }
        }

        // Auto-fertilize depleted beds
        if ((next.automation.autoFertilize ?? true) && !isWet(weather) && p.fertility < 35) {
          const hasStock = (next.stock?.fertilizer ?? 0) > 0;
          const cost = hasStock ? 0 : FERTILIZER_COST;
          if (next.cash >= cost) {
            if (cost > 0) {
              next = { ...next, cash: next.cash - cost, finance: { ...next.finance, expenses: next.finance.expenses + cost } };
            }
            if (hasStock) {
              next = { ...next, stock: { ...next.stock, fertilizer: next.stock.fertilizer - 1 } };
            }
            p.fertility = Math.min(100, p.fertility + FERTILIZER_GAIN);
            summary.fertilizedPlots = (summary.fertilizedPlots ?? 0) + 1;
            summary.fertilizerCost = (summary.fertilizerCost ?? 0) + cost;
          } else {
            blockedReasons.add('Field labour fertilizing paused: out of cash.');
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

      const plots = next.plots.map(orig => {
        if (orig.status !== 'empty' || remainingCapacity <= 0) return orig;
        const hasStock = (next.stock?.[seedTier] ?? 0) > 0;
        const seedCost = hasStock ? 0 : SEEDS[seedTier].cost;
        const totalCost = prepCost + seedCost;

        if (next.cash < totalCost) {
          blockedReasons.add('Auto-planting paused: insufficient cash to prepare soil & buy seed.');
          return orig;
        }

        next = {
          ...next,
          cash: next.cash - totalCost,
          finance: { ...next.finance, expenses: next.finance.expenses + totalCost },
        };
        if (totalCost > 0) {
          next = recordLedgerEntry(next, {
            id: `auto-plant-${orig.id}-${s.day}`,
            day: s.day,
            category: 'inputCost',
            amount: totalCost,
            referenceId: orig.id,
            description: `Field labour land prep & ${seedTier} planting for plot ${orig.id + 1}`,
          });
        }
        if (hasStock) {
          next = { ...next, stock: { ...next.stock, [seedTier]: next.stock[seedTier] - 1 } };
        }
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

  summary.blocked = Array.from(blockedReasons);
  return { state: next, summary };
}
