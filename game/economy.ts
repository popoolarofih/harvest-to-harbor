import {
  BUYERS, DRYING_COST_PER_KG, DRYING_RACK_KG, ENERGY, HIRE_COST, LITRES_PER_FUEL_LITRE, SAFE_MOISTURE, UPGRADES, WORKER_ENERGY,
  type UpgradeId,
} from './config';
import { checkSale, gradeForBatch, inspectBatchReport } from './quality';
import { addXp, blocked, earn, fail, fuelPrice, log, money, progressMission, spend, tankCapacity } from './state';
import type { GameState } from './types';

export function sellBatch(s: GameState, batchId: number, buyerId: string): GameState {
  const batch = s.batches.find(b => b.id === batchId), buyer = BUYERS.find(b => b.id === buyerId);
  if (!batch || !buyer) return fail(s, 'That sale is no longer available.');
  const check = checkSale(s, batch, buyer);
  if (!check.ok) {
    const rejected = check.reason.startsWith('Rejected');
    const next = rejected ? log({ ...s, reputation: Math.max(0, s.reputation - 1) }, { text: `${buyer.name}: ${check.reason}`, severity: 'warning' }) : s;
    return { ...next, toast: check.reason, lastInspection: rejected ? inspectBatchReport(batch, s.day) : s.lastInspection };
  }
  const grade = gradeForBatch(batch);
  const next = earn({ ...s, batches: s.batches.filter(b => b.id !== batchId) }, check.revenue);
  const logged = log(next, { text: `Sold ${Math.round(batch.kg)} kg Grade ${grade} ${batch.product} ginger to ${buyer.name} for ${money(check.revenue)}.`, severity: 'good' });
  const rep = { ...logged, reputation: s.reputation + (grade === 'A' ? 2 : 1), toast: `${buyer.name} paid ${money(check.revenue)} for Grade ${grade} ${batch.product} ginger.` };
  return progressMission(addXp(rep, batch.product === 'dried' ? 60 : 30), 'sell', check.revenue);
}

export const rackLoadKg = (s: GameState) => s.dryingJobs.reduce((sum, j) => sum + j.freshKg, 0);

export function startDrying(s: GameState, batchId: number): GameState {
  const batch = s.batches.find(b => b.id === batchId);
  if (!batch || batch.product !== 'fresh') return fail(s, 'Only fresh ginger can go on the drying racks.');
  if (rackLoadKg(s) + batch.kg > DRYING_RACK_KG) return fail(s, `Drying racks hold ${DRYING_RACK_KG.toLocaleString()} kg of fresh ginger. Finish a batch first.`);
  const cost = Math.round(batch.kg * DRYING_COST_PER_KG);
  const why = blocked(s, { energy: ENERGY.dry, cash: cost });
  if (why) return fail(s, why);
  const job = { id: s.nextId, freshKg: batch.kg, dryMatterKg: batch.kg * (1 - batch.moisture / 100), moisture: batch.moisture, quality: batch.quality, days: 0, covered: false };
  const next = { ...spend(s, cost, ENERGY.dry), nextId: s.nextId + 1, batches: s.batches.filter(b => b.id !== batchId), dryingJobs: [...s.dryingJobs, job] };
  return { ...next, toast: `Washed, peeled and sliced ${Math.round(batch.kg)} kg (${money(cost)}). Racks are drying in the sun.` };
}

export function toggleCover(s: GameState, jobId: number): GameState {
  const job = s.dryingJobs.find(j => j.id === jobId);
  if (!job) return s;
  const why = blocked(s, { energy: ENERGY.cover });
  if (why) return fail(s, why);
  const dryingJobs = s.dryingJobs.map(j => (j.id === jobId ? { ...j, covered: !j.covered } : j));
  return { ...spend(s, 0, ENERGY.cover), dryingJobs, toast: job.covered ? 'Tarpaulin off: the slices are drying again.' : 'Racks covered: protected from rain, but no drying while covered.' };
}

export function finishDrying(s: GameState, jobId: number): GameState {
  const job = s.dryingJobs.find(j => j.id === jobId);
  if (!job) return s;
  const kg = job.dryMatterKg / (1 - job.moisture / 100);
  const batch = { id: s.nextId, product: 'dried' as const, kg, quality: job.quality, moisture: job.moisture, createdDay: s.day };
  const report = inspectBatchReport(batch, s.day);
  const next = { ...s, nextId: s.nextId + 1, dryingJobs: s.dryingJobs.filter(j => j.id !== jobId), batches: [...s.batches, batch], lastInspection: report };
  const damp = job.moisture > SAFE_MOISTURE;
  const logged = log(next, { text: `Bagged ${Math.round(kg)} kg dried ginger at ${job.moisture.toFixed(1)}% moisture (Grade ${report.grade}).`, severity: damp ? 'warning' : 'good' });
  return progressMission(addXp({ ...logged, toast: damp ? `Bagged too early: ${job.moisture.toFixed(1)}% moisture.` : `Bagged ${Math.round(kg)} kg Grade ${report.grade} dried ginger.` }, 35), 'dry', job.freshKg);
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
  const why = blocked(s, { cash: HIRE_COST });
  if (why) return fail(s, why);
  return { ...spend(s, HIRE_COST), workers: s.workers + 1, toast: `Worker hired: +${WORKER_ENERGY} energy from tomorrow. Wages are paid every evening.` };
}

export function dismissWorker(s: GameState): GameState {
  if (!s.workers) return s;
  return { ...s, workers: s.workers - 1, reputation: Math.max(0, s.reputation - 1), toast: 'Worker let go. Lower wages, less labour.' };
}

export function buyUpgrade(s: GameState, id: UpgradeId): GameState {
  const u = UPGRADES[id];
  if (id === 'irrigation' && s.upgrades.irrigation) return fail(s, 'Drip irrigation is already installed.');
  const why = blocked(s, { cash: u.cost });
  if (why) return fail(s, why);
  const upgrades = { ...s.upgrades };
  if (id === 'irrigation') upgrades.irrigation = true;
  if (id === 'warehouse') upgrades.warehouseLevel++;
  if (id === 'tank') upgrades.tankLevel++;
  const next = log({ ...spend(s, u.cost), upgrades, reputation: s.reputation + 1 }, { text: `Invested in ${u.label.toLowerCase()} (${money(u.cost)}).`, severity: 'info' });
  return { ...next, toast: `${u.label} ready.` };
}

export function toggleInsurance(s: GameState): GameState {
  const insurance = !s.upgrades.insurance;
  return { ...s, upgrades: { ...s.upgrades, insurance }, toast: insurance ? 'Crop insurance active: premium charged daily, storm and flood losses partly covered.' : 'Insurance cancelled. Your crop is exposed to weather losses.' };
}
