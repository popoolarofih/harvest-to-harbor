import {
  BULK_DISCOUNTS, COMPOST_COST, FERTILIZER_COST, INPUT_KG, SEASON_DAYS, SEASONAL_AMPLITUDE, SEEDS,
  SOYBEAN_SEED_COST,
} from './config';
import { isUnlocked, lockedReason } from './levels';
import { blocked, fail, log, money, spend, storedKg, warehouseCapacity } from './state';
import { recordLedgerEntry } from './ledger';
import type { GameState, InputItem } from './types';

export interface PurchasePlan {
  item: InputItem;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  totalCost: number;
  weightKg: number;
  fits: boolean;
  canAfford: boolean;
  locked: string | null;
}

/** Base list price for an input item */
export function getBaseItemPrice(item: InputItem): number {
  if (item === 'fertilizer') return FERTILIZER_COST;
  if (item === 'compost') return COMPOST_COST;
  if (item === 'soybean') return SOYBEAN_SEED_COST;
  return SEEDS[item].cost;
}

/**
 * Seasonal unit price: follows a deterministic cosine curve over the 60-day season.
 * Peaks at day 1 (high planting demand), lowest around day 30 (mid-season lull).
 */
export function getInputUnitPrice(s: GameState, item: InputItem): number {
  const base = getBaseItemPrice(item);
  const seasonDay = (s.day - 1) % SEASON_DAYS;
  const amp =
    item === 'fertilizer'
      ? SEASONAL_AMPLITUDE.fertilizer
      : item === 'compost'
      ? SEASONAL_AMPLITUDE.compost
      : item === 'soybean'
      ? SEASONAL_AMPLITUDE.soybean
      : SEASONAL_AMPLITUDE.seed;
  // Cosine wave: +amp at day 0/60, -amp at day 30
  const seasonalFactor = 1 + amp * Math.cos((2 * Math.PI * seasonDay) / SEASON_DAYS);
  return Math.round(base * seasonalFactor);
}

/** Check price trend: returns 'rising' | 'falling' | 'stable' */
export function getInputPriceTrend(s: GameState): 'rising' | 'falling' | 'stable' {
  const dayInSeason = (s.day - 1) % SEASON_DAYS;
  // 0 -> 30: price is falling from peak. 30 -> 60: price is rising to peak.
  if (dayInSeason > 2 && dayInSeason < 28) return 'falling';
  if (dayInSeason > 32 && dayInSeason < 58) return 'rising';
  return 'stable';
}

/** Detailed calculation for buying `quantity` units of `item` */
export function previewPurchase(s: GameState, item: InputItem, quantity: number): PurchasePlan {
  const unitPrice = getInputUnitPrice(s, item);
  const grossCost = unitPrice * quantity;
  const discountRate = BULK_DISCOUNTS.find(d => quantity >= d.min)?.discount ?? 0;
  const discountAmount = Math.round(grossCost * discountRate);
  const totalCost = grossCost - discountAmount;
  const weightKg = quantity * INPUT_KG[item];
  const fits = storedKg(s) + weightKg <= warehouseCapacity(s);
  const canAfford = s.cash >= totalCost;
  const locked = item === 'certified' && !isUnlocked(s, 'certifiedSeed')
    ? lockedReason(s, 'certifiedSeed')
    : null;

  return {
    item,
    quantity,
    unitPrice,
    discountRate,
    discountAmount,
    totalCost,
    weightKg,
    fits,
    canAfford,
    locked,
  };
}

/** Buy inputs into warehouse storage */
export function buyInputStock(s: GameState, item: InputItem, quantity: number): GameState {
  if (quantity <= 0 || !Number.isInteger(quantity)) return fail(s, 'Please specify a valid quantity.');
  const plan = previewPurchase(s, item, quantity);
  if (plan.locked) return fail(s, plan.locked);
  if (!plan.fits) {
    const spaceLeft = Math.max(0, warehouseCapacity(s) - storedKg(s));
    return fail(s, `Warehouse capacity exceeded. Needs ${plan.weightKg} kg, only ${Math.round(spaceLeft)} kg free space.`);
  }
  const why = blocked(s, { cash: plan.totalCost });
  if (why) return fail(s, why);

  const stock = { ...s.stock, [item]: (s.stock?.[item] ?? 0) + quantity };
  const spent = spend(s, plan.totalCost);
  const label =
    item === 'fertilizer'
      ? 'fertilizer bag'
      : item === 'compost'
      ? 'compost bag'
      : item === 'soybean'
      ? 'soybean seed unit'
      : `${SEEDS[item].label} sett`;
  const plural = quantity > 1 ? `${label}s` : label;
  const savingNote = plan.discountRate > 0 ? ` (${Math.round(plan.discountRate * 100)}% bulk discount)` : '';

  const logged = log(
    { ...spent, stock },
    {
      text: `Purchased ${quantity} ${plural} for ${money(plan.totalCost)}${savingNote}. Added to warehouse storage.`,
      severity: 'info',
    }
  );

  const recorded = recordLedgerEntry(logged, {
    id: `buy-stock-${item}-${s.day}-${s.nextId}`,
    day: s.day,
    category: 'inputCost',
    amount: plan.totalCost,
    description: `Purchased ${quantity} ${plural} for warehouse storage`,
  });

  return {
    ...recorded,
    toast: `Purchased ${quantity} ${plural} for ${money(plan.totalCost)}.`,
  };
}
