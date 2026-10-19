import {
  COMPOST_COST, ENERGY, FERTILIZER_COST, PREP, SEEDS, SOYBEAN_SEED_COST, TREATMENTS, WATER_PER_PLOT,
} from './config';
import { isUnlocked, lockedReason } from './levels';
import {
  fertilizePlot, gapFillPlot, inspectPlot, plantPlot, prepCost, preparePlot, treatPlot, waterPlot,
} from './farm';
import { applyCompost, getConsecutiveGingerCount } from './soil';
import { blocked, fail, log, money, plotName } from './state';
import type { CropType, GameState, PrepMethod, SeedTier, Stock } from './types';
import { isWet } from './weather';

export type BulkActionKind = 'tillAndPlant' | 'water' | 'fertilize' | 'inspect' | 'treat' | 'gapFill' | 'compost';

export interface BulkOptions {
  prepMethod?: PrepMethod;
  plantSeed?: SeedTier;
  plantCrop?: CropType;
}

export interface BulkPreview {
  kind: BulkActionKind;
  eligibleCount: number;
  eligiblePlotIds: number[];
  skipped: { plotId: number; name: string; reason: string }[];
  reqCash: number;
  reqEnergy: number;
  reqWater: number;
  reqStock: Partial<Stock>;
  risks: string[];
  canAfford: boolean;
  blockReason: string | null;
  token: number;
}

export function previewBulk(s: GameState, kind: BulkActionKind, options: BulkOptions = {}): BulkPreview {
  const eligiblePlotIds: number[] = [];
  const skipped: { plotId: number; name: string; reason: string }[] = [];
  const risks: string[] = [];

  let reqCash = 0;
  let reqEnergy = 0;
  let reqWater = 0;
  const reqStock: Partial<Stock> = {};

  const prepMethod = options.prepMethod ?? 'ridge';
  const plantSeed = options.plantSeed ?? 'improved';

  // Copy stock to track what would be consumed
  const availStock = { ...s.stock };

  for (const p of s.plots) {
    const name = plotName(p);
    if (kind === 'tillAndPlant') {
      if (p.status !== 'empty') {
        skipped.push({ plotId: p.id, name, reason: `Status is ${p.status}` });
        continue;
      }
      if (plantSeed === 'certified' && !isUnlocked(s, 'certifiedSeed')) {
        skipped.push({ plotId: p.id, name, reason: lockedReason(s, 'certifiedSeed') ?? 'Locked' });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqCash += prepCost(s, prepMethod);
      reqEnergy += PREP[prepMethod].energy + ENERGY.plant;

      if (options.plantCrop === 'soybean') {
        if ((availStock.soybean ?? 0) > 0) {
          availStock.soybean = (availStock.soybean ?? 0) - 1;
          reqStock.soybean = (reqStock.soybean ?? 0) + 1;
        } else {
          reqCash += SOYBEAN_SEED_COST;
        }
      } else {
        const consecutive = getConsecutiveGingerCount(p);
        if (consecutive >= 1) {
          risks.push(`Plot ${name}: Consecutive ginger (${consecutive}x). Elevated root rot risk.`);
        }
        if ((availStock[plantSeed] ?? 0) > 0) {
          availStock[plantSeed] = (availStock[plantSeed] ?? 0) - 1;
          reqStock[plantSeed] = (reqStock[plantSeed] ?? 0) + 1;
        } else {
          reqCash += SEEDS[plantSeed].cost;
        }
      }
    } else if (kind === 'compost') {
      if (p.status !== 'empty' && p.status !== 'prepared') {
        skipped.push({ plotId: p.id, name, reason: 'Only empty or prepared beds can be composted' });
        continue;
      }
      if ((p.organicMatter ?? 35) >= 70) {
        skipped.push({ plotId: p.id, name, reason: `Organic matter already high (${Math.round(p.organicMatter)}%)` });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.fertilize;
      if ((availStock.compost ?? 0) > 0) {
        availStock.compost = (availStock.compost ?? 0) - 1;
        reqStock.compost = (reqStock.compost ?? 0) + 1;
      } else {
        reqCash += COMPOST_COST;
      }
    } else if (kind === 'water') {
      if (p.status === 'empty') {
        skipped.push({ plotId: p.id, name, reason: 'Empty plot' });
        continue;
      }
      if (p.moisture >= 65) {
        skipped.push({ plotId: p.id, name, reason: `Moisture already ${Math.round(p.moisture)}%` });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.water;
      reqWater += WATER_PER_PLOT;
      if (p.moisture > 50) {
        risks.push(`Plot ${name} moisture is ${Math.round(p.moisture)}%: watering may cause waterlogging.`);
      }
    } else if (kind === 'fertilize') {
      if (p.status === 'empty') {
        skipped.push({ plotId: p.id, name, reason: 'Unprepared plot' });
        continue;
      }
      if (p.fertility >= 70) {
        skipped.push({ plotId: p.id, name, reason: `Fertility already ${Math.round(p.fertility)}%` });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.fertilize;
      if ((availStock.fertilizer ?? 0) > 0) {
        availStock.fertilizer = (availStock.fertilizer ?? 0) - 1;
        reqStock.fertilizer = (reqStock.fertilizer ?? 0) + 1;
      } else {
        reqCash += FERTILIZER_COST;
      }
    } else if (kind === 'inspect') {
      if (p.status !== 'growing' && p.status !== 'ready') {
        skipped.push({ plotId: p.id, name, reason: 'No standing crop' });
        continue;
      }
      if (p.issue?.detected) {
        skipped.push({ plotId: p.id, name, reason: 'Problem already identified' });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.inspect;
    } else if (kind === 'treat') {
      if (!p.issue || !p.issue.detected) {
        skipped.push({ plotId: p.id, name, reason: 'No identified issue' });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.treat;
      reqCash += TREATMENTS[p.issue.kind].cost;
    } else if (kind === 'gapFill') {
      if (!p.seed || !p.germinated || p.stand >= 0.9 || p.growth >= 60) {
        skipped.push({ plotId: p.id, name, reason: 'Only young crops (<60% growth) with poor stand (<90%) qualify' });
        continue;
      }
      eligiblePlotIds.push(p.id);
      reqEnergy += ENERGY.gapFill;
      reqCash += Math.round(SEEDS[p.seed].cost * (1 - p.stand));
    }
  }

  if (kind === 'fertilize' && isWet(s.weather) && eligiblePlotIds.length > 0) {
    risks.push('Wet weather forecast: rain will wash away half the applied fertilizer.');
  }

  let blockReason: string | null = null;
  if (eligiblePlotIds.length === 0) {
    blockReason = 'No eligible beds found for this action.';
  } else if (s.energy < reqEnergy) {
    blockReason = `Not enough energy: need ${reqEnergy}⚡, currently have ${s.energy}⚡.`;
  } else if (s.cash < reqCash) {
    blockReason = `Not enough cash: need ${money(reqCash)}, currently have ${money(s.cash)}.`;
  } else if (reqWater > 0 && s.water < reqWater) {
    blockReason = `Not enough tank water: need ${reqWater.toLocaleString()} L, currently have ${s.water.toLocaleString()} L.`;
  }

  const canAfford = blockReason === null;

  return {
    kind,
    eligibleCount: eligiblePlotIds.length,
    eligiblePlotIds,
    skipped,
    reqCash,
    reqEnergy,
    reqWater,
    reqStock,
    risks,
    canAfford,
    blockReason,
    token: s.opSeq,
  };
}

export function executeBulk(
  s: GameState,
  kind: BulkActionKind,
  options: BulkOptions = {},
  allowPartial = false,
  token?: number
): GameState {
  if (token !== undefined && token !== s.opSeq) {
    return fail(s, 'This bulk action was already executed or is no longer valid.');
  }

  const preview = previewBulk(s, kind, options);
  if (preview.eligibleCount === 0) {
    return fail(s, 'No eligible beds to perform this action.');
  }
  if (!preview.canAfford && !allowPartial) {
    return fail(s, preview.blockReason ?? 'Cannot afford this bulk action.');
  }

  let current = s;
  let executedCount = 0;
  const initialCash = current.cash;
  const initialEnergy = current.energy;
  const initialWater = current.water;

  for (const id of preview.eligiblePlotIds) {
    let next: GameState;
    if (kind === 'tillAndPlant') {
      const prepMethod = options.prepMethod ?? 'ridge';
      const plantSeed = options.plantSeed ?? 'improved';
      const plantCrop = options.plantCrop ?? 'ginger';
      const prepared = preparePlot(current, id, prepMethod);
      if (prepared === current || prepared.plots.find(p => p.id === id)?.status !== 'prepared') {
        if (!allowPartial) return fail(s, prepared.toast || 'Failed to prepare plot in bulk.');
        break;
      }
      next = plantPlot(prepared, id, plantSeed, plantCrop);
      if (next === prepared || next.plots.find(p => p.id === id)?.status !== 'growing') {
        if (!allowPartial) return fail(s, next.toast || 'Failed to plant plot in bulk.');
        break;
      }
    } else if (kind === 'compost') {
      next = applyCompost(current, id);
      if (next === current) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to apply compost in bulk.');
        break;
      }
    } else if (kind === 'water') {
      next = waterPlot(current, id);
      if (next === current || next.water === current.water) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to water plot in bulk.');
        break;
      }
    } else if (kind === 'fertilize') {
      next = fertilizePlot(current, id);
      if (next === current) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to fertilize plot in bulk.');
        break;
      }
    } else if (kind === 'inspect') {
      next = inspectPlot(current, id);
      if (next === current) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to inspect plot in bulk.');
        break;
      }
    } else if (kind === 'treat') {
      next = treatPlot(current, id);
      if (next === current) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to treat plot in bulk.');
        break;
      }
    } else if (kind === 'gapFill') {
      next = gapFillPlot(current, id);
      if (next === current) {
        if (!allowPartial) return fail(s, next.toast || 'Failed to gap-fill plot in bulk.');
        break;
      }
    } else {
      break;
    }

    current = next;
    executedCount++;
  }

  if (executedCount === 0) {
    return fail(s, 'Bulk action could not execute on any plot.');
  }

  const cashSpent = initialCash - current.cash;
  const energySpent = initialEnergy - current.energy;
  const waterSpent = initialWater - current.water;

  const actionLabels: Record<BulkActionKind, string> = {
    tillAndPlant: options.plantCrop === 'soybean' ? 'Tilled & planted soybean on' : 'Tilled & planted',
    water: 'Watered',
    fertilize: 'Fertilized',
    inspect: 'Inspected',
    treat: 'Treated',
    gapFill: 'Gap-filled',
    compost: 'Composted',
  };

  const costSummary = [
    cashSpent > 0 ? money(cashSpent) : null,
    energySpent > 0 ? `${energySpent}⚡` : null,
    waterSpent > 0 ? `${waterSpent.toLocaleString()} L water` : null,
  ].filter(Boolean).join(', ');

  const summaryText = `${actionLabels[kind]} ${executedCount} plot${executedCount > 1 ? 's' : ''}${costSummary ? ` (${costSummary})` : ''}.`;

  const withSeq = {
    ...current,
    opSeq: s.opSeq + 1,
    toast: summaryText,
  };

  return log(withSeq, {
    text: `Bulk action: ${summaryText}`,
    severity: 'info',
  });
}
