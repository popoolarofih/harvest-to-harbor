import {
  BRAND_PREMIUM, CARGO_INSURANCE_RATE, DEMURRAGE_PER_DAY, ENERGY, EXPORT, EXPORT_FEES, GRADE_MULT, HAULAGE, PORT_DAYS, ROAD_DAYS,
  SAFE_MOISTURE, SEA_DAMAGE_CHANCE, TRADE_BUYERS, type TradeBuyer,
} from './config';
import { isUnlocked, lockedReason } from './levels';
import { gradeAtLeast, gradeForBatch } from './quality';
import type { Rng } from './rng';
import { addXp, blocked, earn, fail, log, money, spend } from './state';
import type { Batch, Contract, GameState, Haulage, LogLine, QualityGrade, Shipment } from './types';

export const buyerOf = (c: Pick<Contract, 'buyerId'>): TradeBuyer => TRADE_BUYERS.find(b => b.id === c.buyerId)!;
export const isExport = (c: Pick<Contract, 'buyerId'>) => !buyerOf(c).domestic;

export function buyerAvailable(s: GameState, b: TradeBuyer) {
  return b.unlock === 'campaign' ? s.flags.exportUnlocked : isUnlocked(s, b.unlock);
}

/** Contract value in naira today. Dollar contracts move with the exchange rate. */
export const contractValue = (s: GameState, c: Contract) => Math.round(c.kg * c.pricePerKg * (c.currency === 'USD' ? s.fxRate : 1));
export const formatPrice = (c: Contract) => (c.currency === 'USD' ? `$${c.pricePerKg.toFixed(2)}/kg` : `${money(c.pricePerKg)}/kg`);
export const formatValue = (c: Contract) => (c.currency === 'USD' ? `$${Math.round(c.kg * c.pricePerKg).toLocaleString()}` : money(c.kg * c.pricePerKg));

const PRODUCT_LABEL = { dried: 'dried ginger', powder: 'ginger powder' } as const;
export const contractProductLabel = (c: Contract) => (c.campaign ? 'dried ginger or powder' : PRODUCT_LABEL[c.product]);

/** Stock that meets the contract: right product and grade, safely dry; export also needs sealed, clean bags. */
export function eligibleBatches(s: GameState, c: Contract): Batch[] {
  const exportOrder = isExport(c);
  return s.batches.filter(b => {
    // The campaign's first order takes dried ginger or powder.
    if (c.campaign ? b.product === 'fresh' : b.product !== c.product) return false;
    if (b.moisture > SAFE_MOISTURE || !gradeAtLeast(gradeForBatch(b), c.minGrade)) return false;
    return !exportOrder || (b.packaging === 'sealed' && !b.soiled);
  });
}
export const eligibleKg = (s: GameState, c: Contract) => eligibleBatches(s, c).reduce((sum, b) => sum + b.kg, 0);

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
  return next;
}

export function acceptContract(s: GameState, id: number): GameState {
  const c = s.contracts.find(x => x.id === id);
  if (!c || c.status !== 'offered') return fail(s, 'That offer is no longer open.');
  if (s.contracts.filter(x => x.status === 'active').length >= 3) return fail(s, 'You already have 3 open contracts. Deliver one before taking more.');
  const advance = c.terms === 'advance' ? Math.round(contractValue(s, c) * 0.3) : 0;
  const next = earn({ ...s, contracts: s.contracts.map(x => (x.id === id ? { ...x, status: 'active' as const, advancePaid: advance } : x)) }, advance);
  return log({ ...next, toast: `Contract signed with ${buyerOf(c).name}.${advance ? ` ${money(advance)} advance received.` : ''}` }, { text: `Signed: ${c.kg.toLocaleString()} kg ${contractProductLabel(c)} for ${buyerOf(c).name}, due day ${c.deadlineDay}.`, severity: 'info' });
}

export function declineContract(s: GameState, id: number): GameState {
  return { ...s, contracts: s.contracts.filter(c => c.id !== id || c.status !== 'offered') };
}

export interface DispatchCosts { haulage: number; exportFees: number; insurance: number; total: number; }

export function dispatchCosts(s: GameState, c: Contract, haulage: Haulage, insured: boolean): DispatchCosts {
  const h = HAULAGE[haulage];
  const road = Math.round(h.base + h.perKg * c.kg);
  const exportFees = isExport(c) ? EXPORT_FEES : 0;
  const insurance = insured ? Math.round(contractValue(s, c) * CARGO_INSURANCE_RATE) : 0;
  return { haulage: road, exportFees, insurance, total: road + exportFees + insurance };
}

/** Load the truck: take eligible stock off the shelf and start the journey. */
export function dispatchContract(s: GameState, id: number, haulage: Haulage = 'standard', insured = false): GameState {
  const c = s.contracts.find(x => x.id === id);
  if (!c || c.status !== 'active') return fail(s, 'That contract is not open.');
  if (haulage === 'fleet' && !isUnlocked(s, 'fleet')) return fail(s, `Chinedu's fleet: ${lockedReason(s, 'fleet')}.`);
  if (insured && !isUnlocked(s, 'cargoInsurance')) return fail(s, `Cargo insurance: ${lockedReason(s, 'cargoInsurance')}.`);
  const stock = eligibleBatches(s, c).sort((a, b) => b.quality - a.quality);
  const have = stock.reduce((sum, b) => sum + b.kg, 0);
  if (have < c.kg) return fail(s, `You have ${Math.round(have)} of ${c.kg} kg that meets this contract.`);
  const costs = dispatchCosts(s, c, haulage, insured);
  const why = blocked(s, { energy: ENERGY.ship, cash: costs.total });
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
    events: [{ day: s.day, text: `Loaded ${c.kg.toLocaleString()} kg at the farm. ${HAULAGE[haulage].label} heading for ${exportOrder ? 'Lagos' : buyerOf(c).port}.`, severity: 'info' }],
  };
  const spent = spend(s, costs.total, ENERGY.ship);
  const next: GameState = {
    ...spent, batches, nextId: s.nextId + 1, shipments: [...s.shipments, shipment],
    contracts: s.contracts.map(x => (x.id === id ? { ...x, status: 'shipping' as const } : x)),
    flags: { ...s.flags, shipments: s.flags.shipments + 1 },
    stats: { ...s.stats, exportedKg: s.stats.exportedKg + (exportOrder ? c.kg : 0) },
    finance: { ...spent.finance, logistics: spent.finance.logistics + costs.total },
  };
  return addXp(log({ ...next, toast: `The truck is on its way${exportOrder ? ' to Lagos' : ''} with ${c.kg.toLocaleString()} kg for ${buyerOf(c).name}.` }, { text: `Dispatched ${c.kg.toLocaleString()} kg to ${buyerOf(c).name} (${money(costs.total)} logistics).`, severity: 'good' }), 80);
}

const STOPS = ['Kaduna', 'Abuja', 'Lokoja', 'Ibadan'];

/** Daily: move every shipment along farm → road → Lagos port → sea → buyer → payment, rolling for risks. */
export function tickShipments(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  let cash = s.cash, xp = 0, reputation = s.reputation;
  const finance = { ...s.finance };
  let contracts = s.contracts;
  const shipments = s.shipments.map((orig): Shipment => {
    if (orig.stage === 'paid' || orig.stage === 'lost') return orig;
    const sh: Shipment = { ...orig, events: [...orig.events] };
    const c = contracts.find(x => x.id === sh.contractId)!;
    const b = buyerOf(c);
    const event = (text: string, severity: LogLine['severity']) => { sh.events.push({ day: s.day, text, severity }); if (severity !== 'info') lines.push({ text: `${b.flag} ${text}`, severity }); };
    const charge = (amount: number) => { cash -= amount; finance.expenses += amount; finance.logistics += amount; };
    const deliver = () => {
      sh.stage = 'delivered'; sh.arrivedDay = s.day; sh.daysLeft = 0;
      sh.payDay = s.day + (c.terms === 'net30' ? 30 : 0);
      contracts = contracts.map(k => (k.id === c.id ? { ...k, status: 'delivered' as const } : k));
      const late = s.day > c.deadlineDay;
      event(`Delivered to ${b.name} in ${b.port}${late ? `, ${s.day - c.deadlineDay} days late` : ', on time'}. ${c.terms === 'net30' ? 'Payment due in 30 days.' : 'Payment on delivery.'}`, late ? 'warning' : 'good');
    };

    if (sh.stage === 'road') {
      if (rng.chance(HAULAGE[sh.haulage].breakdownChance)) { sh.daysLeft += 2; charge(40_000); event(`Truck broke down near ${rng.pick(STOPS)}. Two days lost and ₦40,000 in repairs.`, 'warning'); }
      else if (rng.chance(0.1)) { sh.daysLeft += 1; event('Checkpoints and a bad stretch of road: one day lost.', 'warning'); }
      else event(`On the road: passing ${STOPS[Math.min(STOPS.length - 1, Math.max(0, sh.stageDays - sh.daysLeft))]}.`, 'info');
      sh.daysLeft--;
      if (sh.daysLeft <= 0) {
        if (b.domestic) deliver();
        else { sh.stage = 'port'; sh.daysLeft = sh.stageDays = PORT_DAYS; event('Arrived at Apapa port, Lagos. Phytosanitary inspection and container stuffing.', 'info'); }
      }
    } else if (sh.stage === 'port') {
      if (rng.chance(0.2)) {
        const extra = rng.chance(0.5) ? 2 : 1;
        sh.daysLeft += extra; charge(DEMURRAGE_PER_DAY * extra);
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
      xp += Math.round(150 + c.kg * (isExport(c) ? 0.6 : 0.3));
      reputation += late ? 1 : 3;
      sh.stage = 'paid'; sh.payout = payout;
      contracts = contracts.map(x => (x.id === c.id ? { ...x, status: 'paid' as const } : x));
      event(`${b.name} paid ${money(payout)}${c.currency === 'USD' ? ` (at ₦${Math.round(s.fxRate).toLocaleString()}/$)` : ''}${late ? `, minus a ${Math.round(c.latePenalty * 100)}% late penalty` : ''}.`, 'good');
    }
    return sh;
  });
  return addXp({ ...s, cash, reputation, finance, contracts, shipments }, xp);
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
