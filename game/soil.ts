import {
  COMPOST_COMPACTION_REDUCTION,
  COMPOST_COST,
  COMPOST_FERTILITY_GAIN,
  COMPOST_OM_GAIN,
  ENERGY,
  SOYBEAN_NITROGEN_GAIN,
  SOYBEAN_OM_GAIN,
  SOYBEAN_ROT_SUPPRESSION,
} from './config';
import { blocked, fail, log, money, plotName, spend, updatePlot } from './state';
import { recordLedgerEntry } from './ledger';
import type { CropHistoryEntry, CropType, GameState, Plot } from './types';

/** Counts consecutive ginger crops in recent history */
export function getConsecutiveGingerCount(p: Plot): number {
  let count = 0;
  for (const h of p.cropHistory) {
    if (h.crop === 'ginger') count++;
    else break;
  }
  return count;
}

/** Composite soil health score (0-100) */
export function getSoilHealthScore(p: Plot): number {
  const fertPart = (Math.min(100, p.fertility) / 100) * 35;
  const omPart = (Math.min(60, p.organicMatter ?? 35) / 60) * 35;
  const compPart = (1 - Math.min(100, p.compaction ?? 20) / 100) * 15;
  const pathogenTotal =
    (p.diseasePressure?.rot ?? 0) +
    (p.diseasePressure?.leafSpot ?? 0) +
    (p.diseasePressure?.pest ?? 0);
  const cleanPart = Math.max(0, (1 - pathogenTotal / 250)) * 15;

  return Math.round(fertPart + omPart + compPart + cleanPart);
}

export function getSoilHealthRating(score: number): 'Depleted' | 'Degraded' | 'Fair' | 'Healthy' | 'Prime' {
  if (score < 35) return 'Depleted';
  if (score < 55) return 'Degraded';
  if (score < 72) return 'Fair';
  if (score < 88) return 'Healthy';
  return 'Prime';
}

export interface RotationAdvice {
  recommendedCrop: CropType;
  consecutiveGinger: number;
  warning: string | null;
  benefits: string[];
}

export function getRotationAdvice(p: Plot): RotationAdvice {
  const consecutiveGinger = getConsecutiveGingerCount(p);
  const om = p.organicMatter ?? 35;
  const rotRisk = p.diseasePressure?.rot ?? 0;
  const benefits: string[] = [];
  let warning: string | null = null;
  let recommendedCrop: CropType = 'ginger';

  if (consecutiveGinger >= 1 || rotRisk >= 25 || p.fertility < 35) {
    recommendedCrop = 'soybean';
    if (consecutiveGinger >= 1) {
      warning = `Consecutive ginger monoculture (${consecutiveGinger} season${consecutiveGinger > 1 ? 's' : ''}). Soilborne rot pathogens have built up in the root zone (+${consecutiveGinger * 20}% rot risk).`;
    } else if (rotRisk >= 25) {
      warning = `High soilborne rot pressure (${rotRisk}%). Planting ginger now invites rhizome soft rot.`;
    } else {
      warning = `Soil nitrogen depleted (fertility ${Math.round(p.fertility)}%). Chemical fertilizer alone cannot rebuild biological humus.`;
    }
  }

  if (recommendedCrop === 'soybean') {
    benefits.push('Fixes +20 natural nitrogen from atmosphere without fertilizer cost.');
    benefits.push('Adds +10% root organic matter and loosens compacted subsoil.');
    benefits.push('Cuts soilborne ginger soft rot pathogens by 50%.');
    benefits.push('Short ~30 day cycle, harvestable for cash or green manure.');
  } else {
    benefits.push('Soil is clean and fertile: ready for high-grade ginger cultivation.');
  }

  return { recommendedCrop, consecutiveGinger, warning, benefits };
}

/** Apply organic village compost/manure to build humus and fertility */
export function applyCompost(s: GameState, plotId: number): GameState {
  const p = s.plots.find(x => x.id === plotId);
  if (!p || (p.status !== 'empty' && p.status !== 'prepared')) {
    return fail(s, 'Compost can only be incorporated into empty or prepared soil.');
  }

  const hasStock = (s.stock?.compost ?? 0) > 0;
  const cashCost = hasStock ? 0 : COMPOST_COST;
  const why = blocked(s, { energy: ENERGY.fertilize, cash: cashCost });
  if (why) return fail(s, why);

  const stock = hasStock ? { ...s.stock, compost: s.stock.compost - 1 } : s.stock;
  const spent = spend(s, cashCost, ENERGY.fertilize);

  const updatedPlot: Partial<Plot> = {
    organicMatter: Math.min(100, (p.organicMatter ?? 35) + COMPOST_OM_GAIN),
    fertility: Math.min(100, p.fertility + COMPOST_FERTILITY_GAIN),
    compaction: Math.max(5, (p.compaction ?? 20) - COMPOST_COMPACTION_REDUCTION),
  };

  let next = updatePlot({ ...spent, stock }, plotId, updatedPlot);
  if (cashCost > 0) {
    next = recordLedgerEntry(next, {
      id: `compost-plot-${plotId}-${s.day}`,
      day: s.day,
      category: 'inputCost',
      amount: cashCost,
      referenceId: plotId,
      description: `Purchased compost for plot ${plotName(p)}`,
    });
  }
  const source = hasStock ? ' (from stock)' : '';
  const text = `Applied farmyard compost to ${plotName(p)}${source}: +${COMPOST_OM_GAIN}% organic matter, +${COMPOST_FERTILITY_GAIN} fertility.`;

  return log({ ...next, toast: text }, { text, severity: 'good' });
}

/** Till mature soybean crop directly under as high-fertility green manure */
export function greenManurePlot(s: GameState, plotId: number): GameState {
  const p = s.plots.find(x => x.id === plotId);
  if (!p || p.crop !== 'soybean' || (p.status !== 'ready' && p.growth < 70)) {
    return fail(s, 'Only mature soybean crops can be incorporated as green manure.');
  }

  const why = blocked(s, { energy: ENERGY.harvest });
  if (why) return fail(s, why);

  const fertGain = 30;
  const omGain = 18;
  const rotSuppression = 0.4; // 60% reduction

  const historyEntry: CropHistoryEntry = {
    crop: 'soybean',
    season: Math.ceil(s.day / 60),
    harvestDay: s.day,
    fertilityChange: fertGain,
    organicMatterChange: omGain,
    greenManured: true,
  };

  const updatedPlot: Partial<Plot> = {
    status: 'prepared', // Tilled directly into ready seedbed!
    growth: 0,
    health: 100,
    seed: null,
    crop: undefined,
    stand: 0,
    germinated: false,
    daysReady: 0,
    issue: null,
    fertility: Math.min(100, p.fertility + fertGain),
    organicMatter: Math.min(100, (p.organicMatter ?? 35) + omGain),
    compaction: Math.max(5, (p.compaction ?? 20) - 12),
    diseasePressure: {
      rot: Math.round((p.diseasePressure?.rot ?? 0) * rotSuppression),
      leafSpot: Math.round((p.diseasePressure?.leafSpot ?? 0) * 0.5),
      pest: Math.round((p.diseasePressure?.pest ?? 0) * 0.5),
    },
    cropHistory: [historyEntry, ...(p.cropHistory ?? [])].slice(0, 5),
  };

  const next = updatePlot(spend(s, 0, ENERGY.harvest), plotId, updatedPlot);
  const text = `Tilled soybean crop on ${plotName(p)} under as green manure: +${fertGain} fertility, +${omGain}% organic matter. Bed is prepared for planting!`;

  return log({ ...next, toast: text }, { text, severity: 'good' });
}
