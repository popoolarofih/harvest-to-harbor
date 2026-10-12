import {
  BUYERS, CUT, DRYING_COST_PER_KG, DRYING_RACK_KG, ENERGY, FACTORY_SEALED_DISCOUNT, GRIND_COST_PER_KG, GRIND_FUEL_PER_KG, GRIND_MAX_MOISTURE, GRIND_YIELD,
  HIRE_COST, IRRIGATION_REPAIR_COST, LITRES_PER_FUEL_LITRE, MAX_LAND_LEASES, PACKAGING, SAFE_MOISTURE, SORT, UPGRADES, WASH, WATER_PER_PLOT, WORKER_ENERGY, type UpgradeId,
} from './config';
import { lockedReason, maxWorkers, type UnlockId } from './levels';
import { checkSale, gradeForBatch, gradeLabel, inspectBatchReport } from './quality';
import { addXp, blocked, clamp, earn, fail, fuelPrice, leasedPlots, log, money, spend, tankCapacity } from './state';
import type { Batch, DryingJob, GameState, Packaging, PrepChoices } from './types';
import { autoIrrigate } from './irrigation';

const PRODUCT_NAME = { fresh: 'fresh ginger', dried: 'dried ginger', powder: 'ginger powder' } as const;

export function sellBatch(s: GameState, batchId: number, buyerId: string): GameState {
  const batch = s.batches.find(b => b.id === batchId), buyer = BUYERS.find(b => b.id === buyerId);
  if (!batch || !buyer) return fail(s, 'That sale is no longer available.');
  const check = checkSale(s, batch, buyer);
  if (!check.ok) {
    const rejected = check.reason.startsWith('Rejected');
    const next = rejected ? log({ ...s, reputation: Math.max(0, s.reputation - 1) }, { text: `${buyer.name}: ${check.reason}`, severity: 'warning' }) : s;
    return { ...next, toast: check.reason, lastInspection: rejected ? inspectBatchReport(batch, s.day) : s.lastInspection };
  }
  const grade = gradeForBatch(batch), label = gradeLabel(grade);
  const stats = batch.product === 'fresh' ? { ...s.stats, freshSoldKg: s.stats.freshSoldKg + batch.kg } : s.stats;
  const next = earn({ ...s, stats, batches: s.batches.filter(b => b.id !== batchId) }, check.revenue);
  const logged = log(next, { text: `Sold ${Math.round(batch.kg)} kg ${label} ${PRODUCT_NAME[batch.product]} to ${buyer.name} for ${money(check.revenue)}.`, severity: 'good' });
  const rep = { ...logged, reputation: s.reputation + (grade === 'C' ? 0 : grade === 'B' ? 1 : 2), toast: `${buyer.name} paid ${money(check.revenue)} for ${label} ${PRODUCT_NAME[batch.product]}.` };
  return addXp(rep, batch.product === 'fresh' ? 30 : 60);
}

export const rackLoadKg = (s: GameState) => s.dryingJobs.reduce((sum, j) => sum + j.freshKg, 0);
/** The Processing Factory adds a second drying line. */
export const rackCapacity = (s: GameState) => DRYING_RACK_KG * (s.upgrades.factory ? 2 : 1);
export const rackSpaceKg = (s: GameState) => Math.max(0, rackCapacity(s) - rackLoadKg(s));

export const DEFAULT_PREP: PrepChoices = { wash: 'thorough', sort: 'standard', cut: 'sliced' };

/** What the washing, sorting and slicing stations will do to `kg` of a fresh batch. Used for the UI preview too. */
export function prepPlan(b: Batch, c: PrepChoices, kg = b.kg) {
  return {
    kg,
    keptKg: kg * SORT[c.sort].keep,
    cost: Math.round(kg * (DRYING_COST_PER_KG + WASH[c.wash].costPerKg + SORT[c.sort].costPerKg + CUT[c.cut].costPerKg)),
    litres: Math.round(kg * WASH[c.wash].litresPerKg),
    quality: clamp(b.quality + SORT[c.sort].quality + CUT[c.cut].quality, 5, 100),
    dryMatterKg: kg * SORT[c.sort].keep * (1 - b.moisture / 100) * CUT[c.cut].dryMatter,
    rate: CUT[c.cut].rate,
    soiled: c.wash === 'rinse',
  };
}

/** Wash → sort → slice, then onto the drying racks. Processes as much of the batch as the racks can hold. */
export function startProcessing(s: GameState, batchId: number, choices: PrepChoices = DEFAULT_PREP): GameState {
  const batch = s.batches.find(b => b.id === batchId);
  if (!batch || batch.product !== 'fresh') return fail(s, 'Only fresh ginger can be washed, sliced and dried.');
  const kg = Math.min(batch.kg, rackSpaceKg(s));
  if (kg < 50) return fail(s, `The drying racks are full (${rackCapacity(s).toLocaleString()} kg). Bag a batch first.`);
  const plan = prepPlan(batch, choices, kg);
  if (plan.litres > s.water) return fail(s, `A thorough wash needs ${plan.litres.toLocaleString()} L of clean water; the tank has ${s.water.toLocaleString()} L. Pump the borehole, or just rinse.`);
  const why = blocked(s, { energy: ENERGY.dry, cash: plan.cost });
  if (why) return fail(s, why);
  const job: DryingJob = { id: s.nextId, freshKg: plan.keptKg, dryMatterKg: plan.dryMatterKg, moisture: batch.moisture, quality: plan.quality, days: 0, covered: false, rate: plan.rate, soiled: plan.soiled };
  const rest = batch.kg - kg;
  const batches = rest > 1 ? s.batches.map(b => (b.id === batchId ? { ...b, kg: rest } : b)) : s.batches.filter(b => b.id !== batchId);
  const next: GameState = {
    ...spend(s, plan.cost, ENERGY.dry), water: s.water - plan.litres, nextId: s.nextId + 1, batches, dryingJobs: [...s.dryingJobs, job],
    stats: { ...s.stats, processedKg: s.stats.processedKg + kg },
  };
  const culled = kg - plan.keptKg;
  return { ...next, toast: `${WASH[choices.wash].label}, ${SORT[choices.sort].label.toLowerCase()}${culled > 1 ? ` (${Math.round(culled)} kg culled)` : ''}, ${CUT[choices.cut].label.toLowerCase()}: ${Math.round(plan.keptKg)} kg on the racks for ${money(plan.cost)}.${rest > 1 ? ` ${Math.round(rest)} kg left in store.` : ''}` };
}
/** Kept for callers that only need the default processing choices. */
export const startDrying = (s: GameState, batchId: number) => startProcessing(s, batchId);

export function toggleCover(s: GameState, jobId: number): GameState {
  const job = s.dryingJobs.find(j => j.id === jobId);
  if (!job) return s;
  const why = blocked(s, { energy: ENERGY.cover });
  if (why) return fail(s, why);
  const dryingJobs = s.dryingJobs.map(j => (j.id === jobId ? { ...j, covered: !j.covered } : j));
  return { ...spend(s, 0, ENERGY.cover), dryingJobs, toast: job.covered ? 'Tarpaulin off: the slices are drying again.' : 'Racks covered: protected from rain, but no drying while covered.' };
}

export const dryKgOf = (j: DryingJob) => j.dryMatterKg / (1 - j.moisture / 100);
/** The factory packaging line makes sealed bags cheaper. */
export const packagingCost = (s: GameState, kg: number, p: Packaging) =>
  Math.round(kg * PACKAGING[p].costPerKg * (p === 'sealed' && s.upgrades.factory ? 1 - FACTORY_SEALED_DISCOUNT : 1));

/** Quality control and packing: take a rack off, inspect it, and bag it. */
export function finishDrying(s: GameState, jobId: number, packaging: Packaging = 'bulk'): GameState {
  const job = s.dryingJobs.find(j => j.id === jobId);
  if (!job) return s;
  const kg = dryKgOf(job), cost = packagingCost(s, kg, packaging);
  const why = blocked(s, { energy: ENERGY.bag, cash: cost });
  if (why) return fail(s, why);
  const batch: Batch = { id: s.nextId, product: 'dried', kg, quality: job.quality, moisture: job.moisture, createdDay: s.day, packaging, soiled: job.soiled };
  const report = inspectBatchReport(batch, s.day);
  const damp = job.moisture > SAFE_MOISTURE;
  const next: GameState = {
    ...spend(s, cost, ENERGY.bag), nextId: s.nextId + 1, dryingJobs: s.dryingJobs.filter(j => j.id !== jobId), batches: [...s.batches, batch], lastInspection: report,
    stats: damp ? s.stats : { ...s.stats, safeDriedKg: s.stats.safeDriedKg + kg },
  };
  const logged = log(next, { text: `Bagged ${Math.round(kg)} kg dried ginger in ${PACKAGING[packaging].label.toLowerCase()} at ${job.moisture.toFixed(1)}% moisture (${gradeLabel(report.grade)}).`, severity: damp ? 'warning' : 'good' });
  return addXp({ ...logged, toast: damp ? `Bagged too early: ${job.moisture.toFixed(1)}% moisture.` : `Bagged ${Math.round(kg)} kg ${gradeLabel(report.grade)} dried ginger.` }, 35);
}

/** Total cost of grinding a dried batch: labour, diesel for the mill, and packaging. */
export function grindCost(s: GameState, b: Batch, packaging: Packaging) {
  return Math.round(b.kg * GRIND_COST_PER_KG + b.kg * GRIND_FUEL_PER_KG * fuelPrice(s) + packagingCost(s, b.kg * GRIND_YIELD, packaging));
}

/** Grinding dried ginger into powder on the hammer mill. Damp slices cake and clog. */
export function grindBatch(s: GameState, batchId: number, packaging: Packaging = 'sealed'): GameState {
  if (!s.upgrades.mill) return fail(s, 'You need a hammer mill to make powder. Buy one in Business.');
  const b = s.batches.find(x => x.id === batchId);
  if (!b || b.product !== 'dried') return fail(s, 'Only dried ginger can be milled.');
  const cost = grindCost(s, b, packaging);
  const why = blocked(s, { energy: ENERGY.grind, cash: cost });
  if (why) return fail(s, why);
  const caking = b.moisture > GRIND_MAX_MOISTURE ? 8 + (b.moisture - GRIND_MAX_MOISTURE) * 4 : 0;
  const powder: Batch = {
    id: s.nextId, product: 'powder', kg: b.kg * GRIND_YIELD, quality: clamp(b.quality - 2 - caking, 5, 100),
    moisture: Math.max(6, b.moisture - 1), createdDay: s.day, packaging, soiled: b.soiled,
  };
  const report = inspectBatchReport(powder, s.day);
  if (caking) report.warnings.unshift(`Ginger went into the mill at ${b.moisture.toFixed(1)}% moisture: the powder caked and clumped.`);
  const next: GameState = {
    ...spend(s, cost, ENERGY.grind), nextId: s.nextId + 1, batches: [...s.batches.filter(x => x.id !== batchId), powder], lastInspection: report,
    stats: { ...s.stats, powderKg: s.stats.powderKg + powder.kg },
  };
  const logged = log(next, { text: `Milled ${Math.round(powder.kg)} kg ginger powder (${gradeLabel(report.grade)}) for ${money(cost)}.`, severity: caking ? 'warning' : 'good' });
  return addXp({ ...logged, toast: `Milled ${Math.round(powder.kg)} kg ${gradeLabel(report.grade)} ginger powder.` }, 50);
}

export function inspectBatch(s: GameState, batchId: number): GameState {
  const b = s.batches.find(x => x.id === batchId);
  return b ? { ...s, lastInspection: inspectBatchReport(b, s.day) } : s;
}

export function pumpWater(s: GameState): GameState {
  const litres = tankCapacity(s) - s.water;
  if (litres <= 0) return fail(s, 'The tank is already full.');
  const cost = Math.round(Math.ceil(litres / LITRES_PER_FUEL_LITRE) * fuelPrice(s));
  const why = blocked(s, { energy: ENERGY.pump, cash: cost });
  if (why) return fail(s, why);
  return { ...spend(s, cost, ENERGY.pump), water: tankCapacity(s), toast: `Borehole pump filled the tank: ${litres.toLocaleString()} L for ${money(cost)} in fuel.` };
}

export function hireWorker(s: GameState): GameState {
  if (s.workers >= maxWorkers(s.level)) return fail(s, `You can manage ${maxWorkers(s.level)} workers at Level ${s.level}. Grow the business to take on more.`);
  const why = blocked(s, { cash: HIRE_COST });
  if (why) return fail(s, why);
  let fieldWorkers = s.automation.fieldWorkers ?? 0;
  let processingWorkers = s.automation.processingWorkers ?? 0;
  if (fieldWorkers === 0 && processingWorkers === 0) fieldWorkers = 1;
  else if (processingWorkers === 0 && s.workers === 1) processingWorkers = 1;
  return { ...spend(s, HIRE_COST), workers: s.workers + 1, automation: { ...s.automation, fieldWorkers, processingWorkers }, toast: `Worker hired: +${WORKER_ENERGY} energy from tomorrow. Wages are paid every evening.` };
}

export function dismissWorker(s: GameState): GameState {
  if (!s.workers) return s;
  const newCount = s.workers - 1;
  let fieldWorkers = s.automation.fieldWorkers ?? 0;
  let processingWorkers = s.automation.processingWorkers ?? 0;
  while (fieldWorkers + processingWorkers > newCount && fieldWorkers + processingWorkers > 0) {
    if (processingWorkers > 0) processingWorkers--;
    else if (fieldWorkers > 0) fieldWorkers--;
  }
  return { ...s, workers: newCount, automation: { ...s.automation, fieldWorkers, processingWorkers }, reputation: Math.max(0, s.reputation - 1), toast: 'Worker let go. Lower wages, less labour.' };
}

/** Which level unlock (if any) gates each upgrade. */
export const UPGRADE_UNLOCK: Partial<Record<UpgradeId, UnlockId>> = { solarDryer: 'solarDryer', mill: 'mill', warehouse: 'warehouse', factory: 'factory', land: 'landExpansion' };

export function ownsUpgrade(s: GameState, id: UpgradeId) {
  if (id === 'irrigation' || id === 'mill' || id === 'solarDryer' || id === 'factory') return s.upgrades[id];
  if (id === 'land') return s.upgrades.landLeased >= MAX_LAND_LEASES;
  return false;
}

/** Why an upgrade can't be bought right now (ignoring cash), or null. */
export function upgradeBlocked(s: GameState, id: UpgradeId): string | null {
  if (ownsUpgrade(s, id)) return `${UPGRADES[id].label} is already ${id === 'land' ? 'leased' : 'installed'}.`;
  const unlock = UPGRADE_UNLOCK[id];
  return unlock ? lockedReason(s, unlock) : null;
}

/** Install an upgrade without charging for it (callers handle payment or financing). */
export function applyUpgrade(s: GameState, id: UpgradeId): GameState {
  const upgrades = { ...s.upgrades };
  let plots = s.plots;
  if (id === 'warehouse') upgrades.warehouseLevel++;
  else if (id === 'tank') upgrades.tankLevel++;
  else if (id === 'land') { upgrades.landLeased++; plots = [...s.plots, ...leasedPlots(s.plots.length)]; }
  else upgrades[id] = true;
  return { ...s, upgrades, plots, reputation: s.reputation + 1 };
}

export function buyUpgrade(s: GameState, id: UpgradeId): GameState {
  const u = UPGRADES[id];
  const no = upgradeBlocked(s, id);
  if (no) return fail(s, no);
  const why = blocked(s, { cash: u.cost });
  if (why) return fail(s, why);
  let next = applyUpgrade(spend(s, u.cost), id);
  const irrigation = id === 'irrigation' ? autoIrrigate(next) : { state: next, irrigated: 0 };
  next = irrigation.state;
  const installLine = irrigation.irrigated
    ? ` Drip lines started on ${irrigation.irrigated} dry plot${irrigation.irrigated > 1 ? 's' : ''}, using ${(irrigation.irrigated * WATER_PER_PLOT).toLocaleString()} L.`
    : '';
  next = log(next, { text: `Invested in ${u.label.toLowerCase()} (${money(u.cost)}).${installLine}`, severity: 'info' });
  return addXp({ ...next, toast: `${u.label} ready.${installLine}` }, 40);
}

export function repairIrrigation(s: GameState): GameState {
  if (!s.upgrades.irrigation) return fail(s, 'Install drip irrigation before servicing it.');
  if (s.irrigationCondition >= 100) return fail(s, 'Drip lines are already in good condition.');
  if (s.cash < IRRIGATION_REPAIR_COST) return fail(s, `You need ${money(IRRIGATION_REPAIR_COST)} to service the drip lines.`);
  const next = spend(s, IRRIGATION_REPAIR_COST);
  return { ...next, irrigationCondition: 100, toast: `Drip lines serviced for ${money(IRRIGATION_REPAIR_COST)}. Automatic watering is ready.` };
}

export function toggleInsurance(s: GameState): GameState {
  const insurance = !s.upgrades.insurance;
  return { ...s, upgrades: { ...s.upgrades, insurance }, toast: insurance ? 'Crop insurance active: premium charged daily, storm and flood losses partly covered.' : 'Insurance cancelled. Your crop is exposed to weather losses.' };
}
