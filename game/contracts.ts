import {
  BRAND_PREMIUM, CARGO_INSURANCE_RATE, COMPANY_TRUCK, DEMURRAGE_PER_DAY, ENERGY, EXPORT, EXPORT_FEES, EXPORT_OFFICE_FEE_DISCOUNT, GRADE_MULT, HAULAGE, PACKAGING,
  PORT_DAYS, ROAD_DAYS,
  SAFE_MOISTURE, SEA_DAMAGE_CHANCE, TRADE_BUYERS, type TradeBuyer,
} from './config';
import { isUnlocked, lockedReason } from './levels';
import { gradeAtLeast, gradeForBatch } from './quality';
import type { Rng } from './rng';
import { addXp, blocked, earn, fail, log, money, spend } from './state';
import type { Batch, Contract, GameState, Haulage, LogLine, Product, QualityGrade, Shipment } from './types';
import { calculateCrewPerks } from './workers';
import { recordLedgerEntry } from './ledger';
import { checkPrestigeAchievements, recordGoalProgress } from './endgame';
import { isReservedNow, packagingCost } from './economy';

export const buyerOf = (c: Pick<Contract, 'buyerId'>): TradeBuyer => TRADE_BUYERS.find(b => b.id === c.buyerId)!;
export const isExport = (c: Pick<Contract, 'buyerId'>) => !buyerOf(c).domestic;

export function buyerAvailable(s: GameState, b: TradeBuyer) {
  return b.unlock === 'campaign' ? s.flags.exportUnlocked : isUnlocked(s, b.unlock);
}

/** Contract value in naira today. Dollar contracts move with the exchange rate. */
export const contractValue = (s: GameState, c: Contract) => Math.round(c.kg * c.pricePerKg * (c.currency === 'USD' ? s.fxRate : 1));
export const formatPrice = (c: Contract) => (c.currency === 'USD' ? `$${c.pricePerKg.toFixed(2)}/kg` : `${money(c.pricePerKg)}/kg`);
export const formatValue = (c: Contract) => (c.currency === 'USD' ? `$${Math.round(c.kg * c.pricePerKg).toLocaleString()}` : money(c.kg * c.pricePerKg));

const PRODUCT_LABEL: Record<Exclude<Product, 'fresh'>, string> = { dried: 'dried ginger', powder: 'ginger powder', soybean: 'soybean grain' };
export const contractProductLabel = (c: Contract) => (c.campaign ? 'dried ginger or powder' : PRODUCT_LABEL[c.product]);

/** Stock that meets the contract: right product and grade, safely dry; export also needs sealed, clean bags. */
export function eligibleBatches(s: GameState, c: Contract): Batch[] {
  const exportOrder = isExport(c);
  return s.batches.filter(b => {
    // Stock reserved for another contract cannot be used
    if (b.reservedFor && b.reservedFor !== c.id && isReservedNow(s, b)) return false;
    // The campaign's first order takes dried ginger or powder.
    if (c.campaign ? b.product === 'fresh' : b.product !== c.product) return false;
    if (b.moisture > SAFE_MOISTURE || !gradeAtLeast(gradeForBatch(b), c.minGrade)) return false;
    return !exportOrder || (b.packaging === 'sealed' && !b.soiled);
  });
}
export const eligibleKg = (s: GameState, c: Contract) => eligibleBatches(s, c).reduce((sum, b) => sum + b.kg, 0);

export function getReservedKg(s: GameState, contractId: number): number {
  return s.batches.filter(b => b.reservedFor === contractId).reduce((sum, b) => sum + b.kg, 0);
}

export function getTotalReservedKg(s: GameState): number {
  return s.batches.filter(b => b.reservedFor != null).reduce((sum, b) => sum + b.kg, 0);
}

export function releaseReservation(s: GameState, contractId: number, batchId?: number): GameState {
  const matches = (b: Batch) => (batchId !== undefined ? b.id === batchId : b.reservedFor === contractId);
  const has = s.batches.some(matches);
  if (!has) {
    if (batchId !== undefined && s.batches.some(b => b.id === batchId && b.reservedFor != null)) {
      return {
        ...s,
        batches: s.batches.map(b => (b.id === batchId ? { ...b, reservedFor: null } : b)),
        toast: 'Batch reservation released.',
      };
    }
    return s;
  }
  const batches = s.batches.map(b => (matches(b) ? { ...b, reservedFor: null } : b));
  return { ...s, batches, toast: batchId !== undefined ? 'Batch reservation released.' : 'Stock reservation released.' };
}

/** Drop reservation tags that point at contracts which are no longer open (shipped, failed, paid), so that stock can be sold again. */
export function pruneReservations(s: GameState): GameState {
  if (!s.batches.some(b => b.reservedFor != null && !isReservedNow(s, b))) return s;
  return { ...s, batches: s.batches.map(b => (b.reservedFor != null && !isReservedNow(s, b) ? { ...b, reservedFor: null } : b)) };
}

export function reserveStock(s: GameState, contractId: number): GameState {
  s = pruneReservations(s);
  const c = s.contracts.find(x => x.id === contractId && x.status === 'active');
  if (!c) return fail(s, 'Only active contracts can reserve stock.');
  const already = getReservedKg(s, contractId);
  let needKg = c.kg - already;
  if (needKg <= 0) return fail(s, `Contract #${c.id} already has its required quantity reserved (${c.kg} kg).`);

  const eligible = eligibleBatches(s, c)
    .filter(b => !b.reservedFor)
    .sort((a, b) => b.quality - a.quality);

  if (!eligible.length) return fail(s, 'No unreserved stock eligible for this contract.');

  let reservedNow = 0;
  let nextId = s.nextId;
  const newBatches: Batch[] = [];

  for (const b of s.batches) {
    if (b.reservedFor || !eligible.some(eb => eb.id === b.id) || needKg <= 0) {
      newBatches.push(b);
      continue;
    }
    const take = Math.min(b.kg, needKg);
    needKg -= take;
    reservedNow += take;
    if (b.kg === take) {
      newBatches.push({ ...b, reservedFor: c.id });
    } else {
      newBatches.push({ ...b, kg: b.kg - take });
      newBatches.push({
        ...b,
        id: nextId++,
        kg: take,
        reservedFor: c.id,
      });
    }
  }

  return {
    ...s,
    batches: newBatches,
    nextId,
    toast: `Reserved ${Math.round(reservedNow)} kg for ${buyerOf(c).name} (${Math.round(already + reservedNow)}/${c.kg} kg total).`,
  };
}

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** Amaka's first export order, created when the campaign introduces London Spice Co. */
export function campaignContract(s: GameState): Contract {
  const pricePerKg = Math.round(((s.market.dried * EXPORT.priceMult * GRADE_MULT.A) / s.fxRate) * 100) / 100;
  return {
    id: s.nextId, buyerId: 'london', product: 'dried', minGrade: 'A', kg: EXPORT.minKg, currency: 'USD', pricePerKg,
    deadlineDay: s.day + 50, latePenalty: 0.08, terms: 'onDelivery', status: 'active', offerExpiresDay: s.day, advancePaid: 0, campaign: true,
  };
}

function makeOffer(s: GameState, rng: Rng): Contract | null {
  const buyers = TRADE_BUYERS.filter(b => buyerAvailable(s, b));
  if (!buyers.length) return null;
  const b = rng.pick(buyers);
  const products = b.products.filter(p => p === 'dried' || isUnlocked(s, 'mill'));
  if (!products.length) return null;
  const product = rng.pick(products);
  const kg = round50(rng.range(b.kg[0], b.kg[1]) * (1 + s.level / 60));
  const naira = s.market[product] * b.premium * GRADE_MULT[b.minGrade] * rng.range(0.95, 1.08);
  const exportOrder = !b.domestic;
  return {
    id: s.nextId, buyerId: b.id, product, minGrade: b.minGrade, kg,
    currency: exportOrder ? 'USD' : 'NGN',
    pricePerKg: exportOrder ? Math.round((naira / s.fxRate) * 100) / 100 : Math.round(naira),
    deadlineDay: s.day + Math.round(exportOrder ? rng.range(32, 50) : rng.range(15, 26)),
    latePenalty: exportOrder ? 0.08 : 0.05,
    terms: rng.weighted({ advance: 0.25, onDelivery: 0.45, net30: 0.3 }),
    status: 'offered', offerExpiresDay: s.day + 5, advancePaid: 0,
  };
}

/** Daily: expire stale offers, fail overdue contracts, maybe post a new offer. */
export function tickContracts(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  let { cash, reputation } = s;
  const contracts: Contract[] = [];
  for (const c of s.contracts) {
    if (c.status === 'offered' && s.day > c.offerExpiresDay) continue;
    if (c.status === 'active' && s.day > c.deadlineDay + 10) {
      cash -= c.advancePaid; reputation = Math.max(0, reputation - 5);
      lines.push({ text: `${buyerOf(c).name} cancelled your ${c.kg} kg contract: nothing shipped 10 days after the deadline.${c.advancePaid ? ` Advance of ${money(c.advancePaid)} refunded.` : ''}`, severity: 'danger' });
      contracts.push({ ...c, status: 'failed' });
      s = { ...s, batches: s.batches.map(b => (b.reservedFor === c.id ? { ...b, reservedFor: null } : b)) };
      continue;
    }
    contracts.push(c);
  }
  let next: GameState = { ...s, contracts, cash, reputation };
  const offered = contracts.filter(c => c.status === 'offered').length;
  if (offered < 1 + Math.floor(s.level / 10) && rng.chance(0.22)) {
    const offer = makeOffer(next, rng);
    if (offer) {
      next = { ...next, nextId: next.nextId + 1, contracts: [...next.contracts, offer] };
      const b = buyerOf(offer);
      lines.push({ text: `${b.flag} New contract offer from ${b.name}: ${offer.kg.toLocaleString()} kg ${contractProductLabel(offer)}, ${formatValue(offer)}.`, severity: 'info' });
    }
  }
  return pruneReservations(next);
}

export function acceptContract(s: GameState, id: number): GameState {
  const c = s.contracts.find(x => x.id === id);
  if (!c || c.status !== 'offered') return fail(s, 'That offer is no longer open.');
  if (s.contracts.filter(x => x.status === 'active').length >= 3) return fail(s, 'You already have 3 open contracts. Deliver one before taking more.');
  const advance = c.terms === 'advance' ? Math.round(contractValue(s, c) * 0.3) : 0;
  let next = earn({ ...s, contracts: s.contracts.map(x => (x.id === id ? { ...x, status: 'active' as const, advancePaid: advance } : x)) }, advance);
  if (advance > 0) {
    next = recordLedgerEntry(next, {
      id: `contract-advance-${c.id}`,
      day: s.day,
      category: isExport(c) ? 'exportSales' : 'domesticSales',
      amount: advance,
      referenceId: c.id,
      description: `Advance 30% payment for contract #${c.id} with ${buyerOf(c).name}`,
    });
  }
  return log({ ...next, toast: `Contract signed with ${buyerOf(c).name}.${advance ? ` ${money(advance)} advance received.` : ''}` }, { text: `Signed: ${c.kg.toLocaleString()} kg ${contractProductLabel(c)} for ${buyerOf(c).name}, due day ${c.deadlineDay}.`, severity: 'info' });
}

export function declineContract(s: GameState, id: number): GameState {
  return { ...s, contracts: s.contracts.filter(c => c.id !== id || c.status !== 'offered') };
}

export interface DispatchCosts { haulage: number; exportFees: number; insurance: number; total: number; }

/** Haulage option as the player sees it: with a company truck, "standard" means your own lorry. */
export function haulageInfo(s: Pick<GameState, 'upgrades'>, haulage: Haulage) {
  const h = HAULAGE[haulage];
  if (haulage !== 'standard' || !s.upgrades.companyTruck) return { label: h.label as string, base: h.base, perKg: h.perKg, breakdownChance: h.breakdownChance, blurb: h.blurb as string };
  return {
    label: 'Company truck', base: Math.round(h.base * COMPANY_TRUCK.baseMult), perKg: Math.round(h.perKg * COMPANY_TRUCK.perKgMult),
    breakdownChance: h.breakdownChance * COMPANY_TRUCK.breakdownMult, blurb: 'Your own lorry and driver: cheaper and well maintained.',
  };
}

export function dispatchCosts(s: GameState, c: Contract, haulage: Haulage, insured: boolean): DispatchCosts {
  const h = haulageInfo(s, haulage);
  const road = Math.round(h.base + h.perKg * c.kg);
  const exportFees = isExport(c) ? Math.round(EXPORT_FEES * (s.upgrades.exportOffice ? 1 - EXPORT_OFFICE_FEE_DISCOUNT : 1)) : 0;
  const insurance = insured ? Math.round(contractValue(s, c) * CARGO_INSURANCE_RATE) : 0;
  return { haulage: road, exportFees, insurance, total: road + exportFees + insurance };
}

/** Load the truck: take eligible stock off the shelf and start the journey. */
export function dispatchContract(s: GameState, id: number, haulage: Haulage = 'standard', insured = false, byCrew = false): GameState {
  const c = s.contracts.find(x => x.id === id);
  if (!c || c.status !== 'active') return fail(s, 'That contract is not open.');
  if (haulage === 'fleet' && !isUnlocked(s, 'fleet')) return fail(s, `Chinedu's fleet: ${lockedReason(s, 'fleet')}.`);
  if (insured && !isUnlocked(s, 'cargoInsurance')) return fail(s, `Cargo insurance: ${lockedReason(s, 'cargoInsurance')}.`);
  const stock = eligibleBatches(s, c).sort((a, b) => {
    const aRes = a.reservedFor === c.id ? 1 : 0;
    const bRes = b.reservedFor === c.id ? 1 : 0;
    if (aRes !== bRes) return bRes - aRes;
    return b.quality - a.quality;
  });
  const have = stock.reduce((sum, b) => sum + b.kg, 0);
  if (have < c.kg) return fail(s, `You have ${Math.round(have)} of ${c.kg} kg that meets this contract.`);
  const costs = dispatchCosts(s, c, haulage, insured);
  const why = blocked(s, { energy: byCrew ? 0 : ENERGY.ship, cash: costs.total });
  if (why) return fail(s, why);

  // Take the best stock first, splitting the last batch if needed.
  let need = c.kg, worst: QualityGrade = 'Premium';
  const taken = new Map<number, number>();
  for (const b of stock) {
    if (need <= 0) break;
    const kg = Math.min(b.kg, need);
    taken.set(b.id, kg); need -= kg;
    const g = gradeForBatch(b);
    if (!gradeAtLeast(g, worst)) worst = g;
  }
  const batches = s.batches.flatMap(b => {
    const kg = taken.get(b.id);
    if (kg === undefined) return [b];
    return b.kg - kg > 1 ? [{ ...b, kg: b.kg - kg }] : [];
  });
  const exportOrder = isExport(c);
  const shipment: Shipment = {
    id: s.nextId, contractId: c.id, kg: c.kg, grade: worst, stage: 'road',
    daysLeft: exportOrder ? ROAD_DAYS : 2, stageDays: exportOrder ? ROAD_DAYS : 2,
    haulage, insured, damage: 0, dispatchedDay: s.day, arrivedDay: null, payDay: null, payout: null,
    events: [{ day: s.day, text: `Loaded ${c.kg.toLocaleString()} kg at the farm. ${haulageInfo(s, haulage).label} heading for ${exportOrder ? 'Lagos' : buyerOf(c).port}.`, severity: 'info' }],
  };
  const spent = spend(s, costs.total, byCrew ? 0 : ENERGY.ship);
  let next: GameState = pruneReservations({
    ...spent, batches, nextId: s.nextId + 1, shipments: [...s.shipments, shipment],
    contracts: s.contracts.map(x => (x.id === id ? { ...x, status: 'shipping' as const } : x)),
    flags: { ...s.flags, shipments: s.flags.shipments + 1 },
    stats: { ...s.stats, exportedKg: s.stats.exportedKg + (exportOrder ? c.kg : 0) },
    finance: { ...spent.finance, logistics: spent.finance.logistics + costs.total },
  });
  if (costs.total > 0) {
    next = recordLedgerEntry(next, {
      id: `dispatch-shipment-${shipment.id}`,
      day: s.day,
      category: 'logistics',
      amount: costs.total,
      referenceId: shipment.id,
      description: `Freight & logistics dispatch for shipment #${shipment.id} to ${buyerOf(c).name}`,
    });
  }
  return addXp(log({ ...next, toast: `The truck is on its way${exportOrder ? ' to Lagos' : ''} with ${c.kg.toLocaleString()} kg for ${buyerOf(c).name}.` }, { text: `Dispatched ${c.kg.toLocaleString()} kg to ${buyerOf(c).name} (${money(costs.total)} logistics).`, severity: 'good' }), 80);
}

// ---- Export made easy: readiness checklist, repacking and one-click shipping ----

export interface ReadinessIssue { kind: 'packaging' | 'damp' | 'grade' | 'soiled' | 'short'; kg: number; text: string; fix: string }
export interface ExportReadiness {
  needKg: number;
  readyKg: number;
  /** Kg that only needs moving into sealed bags to qualify (and that this order needs). */
  repackKg: number;
  repackCost: number;
  /** Can "Prepare & ship" fill the order (after repacking) right now, cash aside? */
  canFill: boolean;
  issues: ReadinessIssue[];
}

/** Stock of the right product that isn't promised to another contract. */
function candidateBatches(s: GameState, c: Contract) {
  return s.batches.filter(b => (!b.reservedFor || b.reservedFor === c.id || !isReservedNow(s, b)) && (c.campaign ? b.product === 'dried' || b.product === 'powder' : b.product === c.product));
}

/** Batches that qualify once they are in sealed bags (export only). */
function repackable(s: GameState, c: Contract): Batch[] {
  if (!isExport(c)) return [];
  return candidateBatches(s, c).filter(b =>
    b.packaging !== 'sealed' && !b.soiled && b.moisture <= SAFE_MOISTURE && gradeAtLeast(gradeForBatch({ ...b, packaging: 'sealed' }), c.minGrade));
}

/** What stands between your warehouse and this contract, in plain language. */
export function exportReadiness(s: GameState, c: Contract): ExportReadiness {
  const ready = eligibleKg(s, c);
  const repack = repackable(s, c).sort((a, b) => b.quality - a.quality);
  let need = Math.max(0, c.kg - ready), repackKg = 0, repackCost = 0;
  for (const b of repack) {
    if (need <= 0) break;
    const kg = Math.min(b.kg, need);
    repackKg += kg; repackCost += packagingCost(s, kg, 'sealed'); need -= kg;
  }
  const exportOrder = isExport(c);
  const eligibleIds = new Set(eligibleBatches(s, c).map(b => b.id)), repackIds = new Set(repack.map(b => b.id));
  const rest = candidateBatches(s, c).filter(b => !eligibleIds.has(b.id) && !repackIds.has(b.id));
  const sum = (bs: Batch[]) => Math.round(bs.reduce((t, b) => t + b.kg, 0));
  const damp = rest.filter(b => b.moisture > SAFE_MOISTURE);
  const soiled = rest.filter(b => b.moisture <= SAFE_MOISTURE && exportOrder && b.soiled);
  const lowGrade = rest.filter(b => b.moisture <= SAFE_MOISTURE && !(exportOrder && b.soiled));
  const issues: ReadinessIssue[] = [];
  const allRepack = sum(repack);
  if (allRepack) issues.push({ kind: 'packaging', kg: allRepack, text: `${allRepack.toLocaleString()} kg is in ${PACKAGING.bulk.label.toLowerCase()}. Export buyers only take ${PACKAGING.sealed.label.toLowerCase()}.`, fix: 'Prepare & ship moves what this order needs into sealed bags for you.' });
  if (damp.length) issues.push({ kind: 'damp', kg: sum(damp), text: `${sum(damp).toLocaleString()} kg is above ${SAFE_MOISTURE}% moisture.`, fix: 'Damp ginger grows mould at sea. Dry it longer on the racks, and bag it sealed so it stays dry.' });
  if (soiled.length) issues.push({ kind: 'soiled', kg: sum(soiled), text: `${sum(soiled).toLocaleString()} kg still has soil on it from a quick rinse.`, fix: 'Use a thorough wash before drying: importers reject foreign matter.' });
  if (lowGrade.length) issues.push({ kind: 'grade', kg: sum(lowGrade), text: `${sum(lowGrade).toLocaleString()} kg grades below ${c.minGrade}.`, fix: 'Sell it locally. For higher grades, harvest on time, sort strictly and slice before drying.' });
  const short = c.kg - ready - repackKg;
  if (short > 0) issues.push({ kind: 'short', kg: Math.round(short), text: `You need ${Math.round(short).toLocaleString()} kg more qualifying ${contractProductLabel(c)}.`, fix: `Due day ${c.deadlineDay}: ${c.deadlineDay - s.day} days to harvest, process and bag it.` });
  return { needKg: c.kg, readyKg: Math.round(ready), repackKg: Math.round(repackKg), repackCost: Math.round(repackCost), canFill: short <= 0, issues };
}

/** Move otherwise-qualifying stock into sealed bags until the contract can be filled. */
export function repackForContract(s: GameState, id: number): GameState {
  const c = s.contracts.find(x => x.id === id && x.status === 'active');
  if (!c) return fail(s, 'That contract is not open.');
  let need = c.kg - eligibleKg(s, c);
  if (need <= 0) return s;
  let next = s, cost = 0, kgDone = 0;
  for (const b of repackable(s, c).sort((a, b2) => b2.quality - a.quality)) {
    if (need <= 0) break;
    const kg = Math.min(b.kg, need);
    const price = packagingCost(next, kg, 'sealed');
    if (next.cash < price) break;
    const split = kg < b.kg;
    const resealed: Batch = { ...b, kg, packaging: 'sealed', id: split ? next.nextId : b.id };
    const batches = split
      ? [...next.batches.map(x => (x.id === b.id ? { ...x, kg: x.kg - kg } : x)), resealed]
      : next.batches.map(x => (x.id === b.id ? resealed : x));
    next = { ...spend(next, price), batches, nextId: split ? next.nextId + 1 : next.nextId };
    cost += price; kgDone += kg; need -= kg;
  }
  if (!kgDone) return fail(s, 'Not enough cash to buy sealed bags.');
  next = recordLedgerEntry(next, {
    id: `repack-${c.id}-${s.day}-${s.nextId}`, day: s.day, category: 'processingPackaging', amount: cost, referenceId: c.id,
    description: `Repacked ${Math.round(kgDone)} kg into sealed export bags for contract #${c.id}`,
  });
  return log({ ...next, toast: `Repacked ${Math.round(kgDone).toLocaleString()} kg into sealed bags (${money(cost)}).` },
    { text: `Repacked ${Math.round(kgDone).toLocaleString()} kg into sealed export bags for ${buyerOf(c).name} (${money(cost)}).`, severity: 'info' });
}

/** The haulage and insurance a sensible exporter would pick today. */
export function recommendedDispatch(s: GameState, c: Contract): { haulage: Haulage; insured: boolean } {
  const haulage: Haulage = !s.upgrades.companyTruck && isUnlocked(s, 'fleet') ? 'fleet' : 'standard';
  return { haulage, insured: isExport(c) && isUnlocked(s, 'cargoInsurance') };
}

/** One click: repack what's needed, then load the truck with the recommended haulage. */
export function quickShip(s: GameState, id: number, byCrew = false): GameState {
  const c = s.contracts.find(x => x.id === id && x.status === 'active');
  if (!c) return fail(s, 'That contract is not open.');
  const ready = exportReadiness(s, c);
  if (!ready.canFill) return fail(s, ready.issues.find(i => i.kind === 'short')?.text ?? 'Not enough qualifying stock yet.');
  const { haulage, insured } = recommendedDispatch(s, c);
  const costs = dispatchCosts(s, c, haulage, insured);
  if (s.cash < costs.total + ready.repackCost) return fail(s, `You need ${money(costs.total + ready.repackCost)} for bags and logistics.`);
  if (!byCrew && s.energy < ENERGY.ship) return fail(s, 'Not enough energy today. Hire workers or advance the day.');
  const packed = ready.repackKg > 0 ? repackForContract(s, id) : s;
  const shipped = dispatchContract(packed, id, haulage, insured, byCrew);
  // If loading fails, undo the repacking too: nothing is half-done.
  return shipped.contracts.find(x => x.id === id)?.status === 'shipping' ? shipped : { ...s, toast: shipped.toast };
}

const STOPS = ['Kaduna', 'Abuja', 'Lokoja', 'Ibadan'];

/** Daily: move every shipment along farm → road → Lagos port → sea → buyer → payment, rolling for risks. */
export function tickShipments(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  let cash = s.cash, xp = 0, reputation = s.reputation;
  const finance = { ...s.finance };
  let contracts = s.contracts;
  let ledgerState = s;
  const shipments = s.shipments.map((orig): Shipment => {
    if (orig.stage === 'paid' || orig.stage === 'lost') return orig;
    const sh: Shipment = { ...orig, events: [...orig.events] };
    const c = contracts.find(x => x.id === sh.contractId)!;
    const b = buyerOf(c);
    const event = (text: string, severity: LogLine['severity']) => { sh.events.push({ day: s.day, text, severity }); if (severity !== 'info') lines.push({ text: `${b.flag} ${text}`, severity }); };
    const charge = (amount: number, reason: string) => {
      cash -= amount; finance.expenses += amount; finance.logistics += amount;
      ledgerState = recordLedgerEntry(ledgerState, {
        id: `shipment-incident-${sh.id}-${s.day}-${amount}`,
        day: s.day,
        category: 'logistics',
        amount,
        referenceId: sh.id,
        description: `${reason} for shipment #${sh.id}`,
      });
    };
    const deliver = () => {
      sh.stage = 'delivered'; sh.arrivedDay = s.day; sh.daysLeft = 0;
      sh.payDay = s.day + (c.terms === 'net30' ? 30 : 0);
      contracts = contracts.map(k => (k.id === c.id ? { ...k, status: 'delivered' as const } : k));
      const late = s.day > c.deadlineDay;
      event(`Delivered to ${b.name} in ${b.port}${late ? `, ${s.day - c.deadlineDay} days late` : ', on time'}. ${c.terms === 'net30' ? 'Payment due in 30 days.' : 'Payment on delivery.'}`, late ? 'warning' : 'good');
    };

    const perks = calculateCrewPerks(s.crew ?? []);
    if (sh.stage === 'road') {
      const roadBenefitMult = (s.coopRoadBenefitDays ?? 0) > 0 ? 0.4 : 1.0;
      const breakdownChance = haulageInfo(s, sh.haulage).breakdownChance * perks.breakdownChanceMult * roadBenefitMult;
      if (rng.chance(breakdownChance)) {
        sh.daysLeft += 2;
        charge(40_000, 'Road breakdown repairs');
        event(`Truck broke down near ${rng.pick(STOPS)}. Two days lost and ₦40,000 in repairs.`, 'warning');
      }
      else if (rng.chance((s.coopRoadBenefitDays ?? 0) > 0 ? 0.04 : 0.1)) {
        sh.daysLeft += 1;
        event('Checkpoints and a bad stretch of road: one day lost.', 'warning');
      }
      else event(`On the road: passing ${STOPS[Math.min(STOPS.length - 1, Math.max(0, sh.stageDays - sh.daysLeft))]}.`, 'info');
      sh.daysLeft--;
      if (sh.daysLeft <= 0) {
        if (b.domestic) deliver();
        else { sh.stage = 'port'; sh.daysLeft = sh.stageDays = PORT_DAYS; event('Arrived at Apapa port, Lagos. Phytosanitary inspection and container stuffing.', 'info'); }
      }
    } else if (sh.stage === 'port') {
      if (rng.chance(0.2)) {
        const extra = rng.chance(0.5) ? 2 : 1;
        sh.daysLeft += extra;
        charge(DEMURRAGE_PER_DAY * extra, 'Apapa port demurrage storage fee');
        event(`Port congestion at Apapa: ${extra} more day${extra > 1 ? 's' : ''}, ${money(DEMURRAGE_PER_DAY * extra)} in storage fees.`, 'warning');
      }
      sh.daysLeft--;
      if (sh.daysLeft <= 0) { sh.stage = 'sea'; sh.daysLeft = sh.stageDays = b.seaDays; event(`Container loaded. The ship sails from Lagos for ${b.port}, ${b.country}.`, 'good'); }
    } else if (sh.stage === 'sea') {
      if (sh.daysLeft === sh.stageDays && rng.chance(SEA_DAMAGE_CHANCE)) {
        sh.damage = 0.25;
        event(sh.insured ? 'Seawater got into the container: 25% of the cargo damaged. Cargo insurance covers most of it.' : 'Seawater got into the container: 25% of the cargo damaged, and it is not insured.', 'danger');
      }
      sh.daysLeft--;
      if (sh.daysLeft <= 0) deliver();
    } else if (sh.stage === 'delivered' && sh.payDay !== null && s.day >= sh.payDay) {
      const late = (sh.arrivedDay ?? 0) > c.deadlineDay;
      const lostShare = sh.damage * (sh.insured ? 0.1 : 1);
      const brand = isUnlocked(s, 'ownBrand') ? 1 + BRAND_PREMIUM : 1;
      const gross = contractValue(s, c) * (1 - lostShare) * brand * (late ? 1 - c.latePenalty : 1);
      const payout = Math.round(gross - c.advancePaid);
      cash += payout; finance.revenue += payout;
      if (payout > 0) {
        ledgerState = recordLedgerEntry(ledgerState, {
          id: `shipment-settlement-${sh.id}`,
          day: s.day,
          category: isExport(c) ? 'exportSales' : 'domesticSales',
          amount: payout,
          referenceId: sh.id,
          description: `Contract #${c.id} delivery payment from ${b.name}`,
        });
      }
      xp += Math.round(150 + c.kg * (isExport(c) ? 0.6 : 0.3));
      reputation += late ? 1 : 3;
      sh.stage = 'paid'; sh.payout = payout;
      contracts = contracts.map(x => (x.id === c.id ? { ...x, status: 'paid' as const } : x));
      event(`${b.name} paid ${money(payout)}${c.currency === 'USD' ? ` (at ₦${Math.round(s.fxRate).toLocaleString()}/$)` : ''}${late ? `, minus a ${Math.round(c.latePenalty * 100)}% late penalty` : ''}.`, 'good');
      ledgerState = recordGoalProgress(ledgerState, c.product, c.kg, sh.grade === 'A' ? 85 : 70);
    }
    return sh;
  });
  const next = addXp({ ...ledgerState, cash, reputation, finance, contracts, shipments }, xp);
  return checkPrestigeAchievements(next);
}

/** Where a shipment is along its whole journey, 0 (farm) to 1 (buyer), for the map. */
export function journeyProgress(sh: Shipment, b: TradeBuyer) {
  const legs = b.domestic ? [1, 0, 0] : [0.25, 0.1, 0.65];
  const done = sh.stageDays ? 1 - sh.daysLeft / sh.stageDays : 1;
  if (sh.stage === 'road') return legs[0] * Math.max(0, done);
  if (sh.stage === 'port') return legs[0] + legs[1] * Math.max(0, done);
  if (sh.stage === 'sea') return legs[0] + legs[1] + legs[2] * Math.max(0, done);
  return 1;
}
