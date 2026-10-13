import {
  BASE_YIELD_KG, BUYERS, CUT, DRYING_COST_PER_KG, EXPORT, GRADE_MULT, GRIND_COST_PER_KG, GRIND_YIELD, PACKAGING,
  PREMIUM_MAX_MOISTURE, PREMIUM_MIN_QUALITY, SAFE_MOISTURE, SEEDS, SORT, TREATMENTS, WASH, type Buyer,
} from './config';
import { effectiveDrainage, plotName } from './state';
import type { Batch, GameState, InspectionReport, Plot, QualityGrade } from './types';

const GRADE_RANK: Record<QualityGrade, number> = { Premium: 4, A: 3, B: 2, C: 1 };
export const gradeAtLeast = (g: QualityGrade, min: QualityGrade) => GRADE_RANK[g] >= GRADE_RANK[min];
export const gradeLabel = (g: QualityGrade) => (g === 'Premium' ? 'Premium' : `Grade ${g}`);

type Gradable = Pick<Batch, 'product' | 'quality' | 'moisture'> & Partial<Pick<Batch, 'packaging' | 'soiled'>>;

export function gradeForBatch(b: Gradable): QualityGrade {
  let grade: QualityGrade = b.quality >= 80 ? 'A' : b.quality >= 60 ? 'B' : 'C';
  if (b.product === 'fresh') return grade;
  if (b.moisture > SAFE_MOISTURE + 2) return 'C';
  if (b.moisture > SAFE_MOISTURE && grade === 'A') grade = 'B';
  // Soil left by a quick rinse is a foreign-matter defect.
  if (b.soiled && grade === 'A') grade = 'B';
  // Premium needs excellent processing *and* packaging that keeps it that way.
  if (grade === 'A' && !b.soiled && b.packaging === 'sealed' && b.quality >= PREMIUM_MIN_QUALITY && b.moisture <= PREMIUM_MAX_MOISTURE) return 'Premium';
  return grade;
}

/** Ready for London Spice Co.: Grade A or better, sealed, safely dry. */
export function isExportReady(b: Batch) {
  return b.product !== 'fresh' && b.packaging === 'sealed' && b.moisture <= SAFE_MOISTURE && gradeAtLeast(gradeForBatch(b), EXPORT.minGrade);
}
export const exportReadyKg = (s: GameState) => s.batches.filter(isExportReady).reduce((sum, b) => sum + b.kg, 0);
export const exportValue = (s: GameState, b: Batch) => Math.round(b.kg * s.market[b.product] * EXPORT.priceMult * GRADE_MULT[gradeForBatch(b)]);

export function maturityFactor(p: Plot) {
  return p.status === 'ready' ? 1 + Math.min(0.12, 0.03 * p.daysReady) : p.growth / 100;
}

/** Fresh kg the plot would give if harvested right now. */
export function expectedYieldKg(p: Plot) {
  if (!p.seed || (p.status !== 'growing' && p.status !== 'ready')) return 0;
  const stand = p.germinated ? p.stand : SEEDS[p.seed].germination;
  const fertility = 0.85 + 0.3 * Math.min(100, p.fertility) / 100;
  return BASE_YIELD_KG * stand * SEEDS[p.seed].yieldMult * maturityFactor(p) * (0.35 + 0.65 * p.health / 100) * fertility;
}

/** Quality of the rhizomes if harvested right now. Immature or over-mature ginger loses quality. */
export function expectedQuality(p: Plot) {
  const immature = p.growth < 100 ? (100 - p.growth) * 0.6 : 0;
  const overMature = Math.max(0, p.daysReady - 4) * 4;
  const disease = p.issue ? p.issue.severity * 0.3 : 0;
  return Math.max(5, Math.min(100, p.health - immature - overMature - disease));
}

export function inspectPlotReport(p: Plot): InspectionReport {
  // Grade the crop's condition, not today's immature harvest, so a healthy young crop doesn't read as "C".
  const condition = p.health - (p.issue ? p.issue.severity * 0.3 : 0);
  const grade = gradeForBatch({ product: 'fresh', quality: condition, moisture: 80 });
  const warnings: string[] = [], consequences: string[] = [];
  if (p.moisture < 30) { warnings.push(`Soil is dry (${Math.round(p.moisture)}%).`); consequences.push('Drought stress slows growth and costs health every day.'); }
  if (p.moisture > 85) { warnings.push(`Soil is waterlogged (${Math.round(p.moisture)}%).`); consequences.push('Waterlogged rhizomes are prone to soft rot.'); }
  if (p.fertility < 30) { warnings.push(`Nutrients are low (${Math.round(p.fertility)}%).`); consequences.push('Low fertility slows bulking and reduces yield.'); }
  if (p.germinated && p.stand < 0.7) { warnings.push(`Only ${Math.round(p.stand * 100)}% of setts emerged.`); consequences.push('Gaps in the bed mean fewer rhizomes at harvest. Gap-fill early.'); }
  if (p.issue) {
    const t = TREATMENTS[p.issue.kind];
    warnings.push(`${t.name} detected (severity ${Math.round(p.issue.severity)}%).`);
    consequences.push(t.lesson);
  }
  if (p.status === 'ready' && p.daysReady > 3) { warnings.push(`Mature for ${p.daysReady} days.`); consequences.push('Rhizomes are turning fibrous and rot risk climbs every day in the ground.'); }
  return {
    title: `Plot ${plotName(p)} inspection`, grade,
    stats: [
      { label: 'Growth', value: `${Math.round(p.growth)}%`, ok: true },
      { label: 'Health', value: `${Math.round(p.health)}%`, ok: p.health >= 70 },
      { label: 'Soil moisture', value: `${Math.round(p.moisture)}%`, ok: p.moisture >= 30 && p.moisture <= 85 },
      { label: 'Fertility', value: `${Math.round(p.fertility)}%`, ok: p.fertility >= 30 },
      { label: 'Drainage', value: `${Math.round(effectiveDrainage(p) * 100)}%${p.ridged ? ' (ridged)' : ''}`, ok: effectiveDrainage(p) >= 0.5 },
      { label: 'Yield if harvested now', value: `${Math.round(expectedYieldKg(p))} kg`, ok: true },
    ],
    warnings, consequences,
  };
}

const PRODUCT_LABEL = { fresh: 'Fresh ginger', dried: 'Dried ginger', powder: 'Ginger powder', soybean: 'Soybean grain' } as const;

export function inspectBatchReport(b: Batch, day: number): InspectionReport {
  const grade = gradeForBatch(b);
  const warnings: string[] = [], consequences: string[] = [];
  if (b.product !== 'fresh') {
    if (b.moisture > SAFE_MOISTURE) {
      warnings.push(`Moisture ${b.moisture.toFixed(1)}%: above the recommended ${SAFE_MOISTURE}% level.`);
      consequences.push('Lower shelf stability: mould can develop in storage', 'Premium buyers will reject the batch', 'Lower selling price');
    }
    if (b.soiled) { warnings.push('Soil and grit found in the product (foreign matter).'); consequences.push('A quick rinse leaves dirt in the crevices. It caps the grade at B and export buyers reject it outright.'); }
    if (b.quality < 60) { warnings.push(b.product === 'powder' ? 'Powder is dull and clumped.' : 'Slices are discoloured.'); consequences.push('Re-wetting by rain, slow drying or grinding damp ginger lowers the grade.'); }
    if (b.packaging === 'bulk') consequences.push(`Jute sacks breathe: on wet days the ${b.product === 'powder' ? 'powder cakes' : 'ginger takes up moisture'}. Sealed bags are needed for Premium grade and export.`);
    if (grade === 'Premium') consequences.push('Premium grade: excellent processing and sealed packaging. This is what export buyers pay most for.');
  } else if (b.quality < 60) {
    warnings.push('Rhizomes are shrivelled or bruised.');
    consequences.push('Fresh ginger loses quality every day in storage. Sell or process quickly.');
  }
  return {
    title: `${PRODUCT_LABEL[b.product]} · batch #${b.id}`, grade,
    stats: [
      { label: 'Weight', value: `${Math.round(b.kg).toLocaleString()} kg`, ok: true },
      { label: 'Moisture', value: `${b.moisture.toFixed(1)}%`, ok: b.product === 'fresh' || b.moisture <= SAFE_MOISTURE },
      { label: 'Quality score', value: `${Math.round(b.quality)}/100`, ok: b.quality >= 60 },
      ...(b.product !== 'fresh' ? [{ label: 'Packaging', value: b.packaging ? PACKAGING[b.packaging].label : '-', ok: b.packaging === 'sealed' }] : []),
      { label: 'Days in storage', value: `${day - b.createdDay}`, ok: day - b.createdDay < 5 || b.product !== 'fresh' },
    ],
    warnings, consequences,
  };
}

export type SaleCheck = { ok: true; price: number; revenue: number } | { ok: false; reason: string };

export function checkSale(s: GameState, b: Batch, buyer: Buyer): SaleCheck {
  const grade = gradeForBatch(b);
  if (buyer.product !== b.product) return { ok: false, reason: `${buyer.name} only buys ${PRODUCT_LABEL[buyer.product].toLowerCase()}.` };
  if (b.kg < buyer.minKg) return { ok: false, reason: `${buyer.name} needs at least ${buyer.minKg} kg.` };
  if (buyer.maxMoisture !== undefined && b.moisture > buyer.maxMoisture)
    return { ok: false, reason: `Rejected: moisture ${b.moisture.toFixed(1)}% is above their ${buyer.maxMoisture}% limit.` };
  if (buyer.sealedOnly && b.packaging !== 'sealed') return { ok: false, reason: 'Rejected: they only take sealed, shelf-ready packaging.' };
  if (!gradeAtLeast(grade, buyer.minGrade)) return { ok: false, reason: `Rejected: they need Grade ${buyer.minGrade} or better; this is ${gradeLabel(grade)}.` };
  const price = s.market[b.product] * buyer.priceMult * GRADE_MULT[grade];
  return { ok: true, price, revenue: Math.round(price * b.kg) };
}

export interface ValueOption {
  id: 'sellFresh' | 'dry' | 'powder'; label: string; cost: number; revenue: number; net: number;
  risk: 'Low' | 'Medium' | 'Higher'; detail: string; locked?: string;
}

const bestMult = (product: 'dried' | 'powder', grade: QualityGrade, sealed: boolean) =>
  Math.max(0, ...BUYERS.filter(x => x.product === product && gradeAtLeast(grade, x.minGrade) && (!x.sealedOnly || sealed)).map(x => x.priceMult));

/**
 * The central "sell now or add value?" decision for a fresh batch: fresh vs dried vs powder.
 * Projections assume a thorough wash, standard sort, peeled slices and good drying weather.
 */
export function valueOptions(s: GameState, b: Batch): ValueOption[] {
  if (b.product !== 'fresh') return [];
  const bestFresh = Math.max(0, ...BUYERS.map(x => checkSale(s, b, x)).map(r => (r.ok ? r.revenue : 0)));
  const keptKg = b.kg * SORT.standard.keep;
  const prepCost = b.kg * (DRYING_COST_PER_KG + WASH.thorough.costPerKg + SORT.standard.costPerKg + CUT.sliced.costPerKg);
  const quality = Math.min(100, b.quality + SORT.standard.quality + CUT.sliced.quality - 3);
  const dryKg = (keptKg * (1 - b.moisture / 100) * CUT.sliced.dryMatter) / 0.9;
  const dryGrade = gradeForBatch({ product: 'dried', quality, moisture: 10, packaging: 'bulk' });
  const dryCost = Math.round(prepCost + dryKg * PACKAGING.bulk.costPerKg);
  const dryRevenue = Math.round(dryKg * s.market.dried * GRADE_MULT[dryGrade] * bestMult('dried', dryGrade, false));
  const powderKg = dryKg * GRIND_YIELD;
  const powderGrade = gradeForBatch({ product: 'powder', quality: quality - 2, moisture: 9, packaging: 'sealed' });
  const powderCost = Math.round(prepCost + dryKg * GRIND_COST_PER_KG + powderKg * PACKAGING.sealed.costPerKg);
  const powderRevenue = Math.round(powderKg * s.market.powder * GRADE_MULT[powderGrade] * bestMult('powder', powderGrade, true));
  return [
    { id: 'sellFresh', label: 'Sell fresh', cost: 0, revenue: bestFresh, net: bestFresh, risk: 'Low', detail: 'Cash today, no processing. Quality keeps falling while you wait.' },
    { id: 'dry', label: 'Dry', cost: dryCost, revenue: dryRevenue, net: dryRevenue - dryCost, risk: 'Medium',
      detail: `≈${Math.round(dryKg)} kg dried, ${gradeLabel(dryGrade)}. Needs ~5 dry days; rain on open racks lowers the grade.` },
    { id: 'powder', label: 'Ginger powder', cost: powderCost, revenue: powderRevenue, net: powderRevenue - powderCost, risk: 'Higher',
      detail: `≈${Math.round(powderKg)} kg powder, ${gradeLabel(powderGrade)}, sealed. Most value, most cost, and every stage has to go right.`,
      locked: s.upgrades.mill ? undefined : 'Needs a hammer mill (Business)' },
  ];
}

