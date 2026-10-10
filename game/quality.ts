import {
  BASE_YIELD_KG, BUYERS, DRYING_COST_PER_KG, GRADE_MULT, SAFE_MOISTURE, SEEDS, TREATMENTS, type Buyer,
} from './config';
import { effectiveDrainage, money, plotName } from './state';
import type { Batch, GameState, InspectionReport, Plot, QualityGrade } from './types';

const GRADE_RANK: Record<QualityGrade, number> = { A: 3, B: 2, C: 1 };
export const gradeAtLeast = (g: QualityGrade, min: QualityGrade) => GRADE_RANK[g] >= GRADE_RANK[min];

export function gradeForBatch(b: Pick<Batch, 'product' | 'quality' | 'moisture'>): QualityGrade {
  const byQuality: QualityGrade = b.quality >= 80 ? 'A' : b.quality >= 60 ? 'B' : 'C';
  if (b.product === 'fresh') return byQuality;
  if (b.moisture > SAFE_MOISTURE + 2) return 'C';
  if (b.moisture > SAFE_MOISTURE && byQuality === 'A') return 'B';
  return byQuality;
}

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

export function inspectBatchReport(b: Batch, day: number): InspectionReport {
  const grade = gradeForBatch(b);
  const warnings: string[] = [], consequences: string[] = [];
  if (b.product === 'dried') {
    if (b.moisture > SAFE_MOISTURE) {
      warnings.push(`Moisture ${b.moisture.toFixed(1)}%: above the recommended ${SAFE_MOISTURE}% level.`);
      consequences.push('Lower shelf stability: mould can develop in storage', 'Premium buyers will reject the batch', 'Lower selling price');
    }
    if (b.quality < 60) { warnings.push('Slices are discoloured.'); consequences.push('Re-wetting by rain or slow drying darkens slices and lowers the grade.'); }
  } else if (b.quality < 60) {
    warnings.push('Rhizomes are shrivelled or bruised.');
    consequences.push('Fresh ginger loses quality every day in storage. Sell or process quickly.');
  }
  return {
    title: `${b.product === 'fresh' ? 'Fresh' : 'Dried'} ginger batch #${b.id}`, grade,
    stats: [
      { label: 'Weight', value: `${Math.round(b.kg).toLocaleString()} kg`, ok: true },
      { label: 'Moisture', value: `${b.moisture.toFixed(1)}%`, ok: b.product === 'fresh' || b.moisture <= SAFE_MOISTURE },
      { label: 'Quality score', value: `${Math.round(b.quality)}/100`, ok: b.quality >= 60 },
      { label: 'Days in storage', value: `${day - b.createdDay}`, ok: day - b.createdDay < 5 || b.product === 'dried' },
    ],
    warnings, consequences,
  };
}

export type SaleCheck = { ok: true; price: number; revenue: number } | { ok: false; reason: string };

export function checkSale(s: GameState, b: Batch, buyer: Buyer): SaleCheck {
  const grade = gradeForBatch(b);
  if (buyer.product !== b.product) return { ok: false, reason: `${buyer.name} only buys ${buyer.product} ginger.` };
  if (b.kg < buyer.minKg) return { ok: false, reason: `${buyer.name} needs at least ${buyer.minKg} kg.` };
  if (buyer.maxMoisture !== undefined && b.moisture > buyer.maxMoisture)
    return { ok: false, reason: `Rejected: moisture ${b.moisture.toFixed(1)}% is above their ${buyer.maxMoisture}% limit.` };
  if (!gradeAtLeast(grade, buyer.minGrade)) return { ok: false, reason: `Rejected: they need Grade ${buyer.minGrade} or better; this is Grade ${grade}.` };
  const price = s.market[b.product] * buyer.priceMult * GRADE_MULT[grade];
  return { ok: true, price, revenue: Math.round(price * b.kg) };
}

export interface ValueOption { id: 'sellFresh' | 'dry'; label: string; cost: number; revenue: number; net: number; risk: 'Low' | 'Medium' | 'Higher'; detail: string; }

/** The core "sell now or add value?" comparison for a fresh batch. Projections, not promises. */
export function valueOptions(s: GameState, b: Batch): ValueOption[] {
  if (b.product !== 'fresh') return [];
  const bestFresh = Math.max(0, ...BUYERS.map(x => checkSale(s, b, x)).map(r => (r.ok ? r.revenue : 0)));
  const dryKg = (b.kg * (1 - b.moisture / 100)) / (1 - 10 / 100);
  const dryCost = Math.round(b.kg * DRYING_COST_PER_KG);
  const dryGrade = gradeForBatch({ product: 'dried', quality: b.quality - 3, moisture: 10 });
  const bestDriedMult = Math.max(...BUYERS.filter(x => x.product === 'dried' && gradeAtLeast(dryGrade, x.minGrade)).map(x => x.priceMult));
  const dryRevenue = Math.round(dryKg * s.market.dried * GRADE_MULT[dryGrade] * bestDriedMult);
  return [
    { id: 'sellFresh', label: 'Sell fresh', cost: 0, revenue: bestFresh, net: bestFresh, risk: 'Low', detail: 'Cash today. Quality keeps falling while you wait.' },
    { id: 'dry', label: 'Sun-dry', cost: dryCost, revenue: dryRevenue, net: dryRevenue - dryCost, risk: 'Medium',
      detail: `≈${Math.round(dryKg)} kg at 10% moisture after ~5 dry days, projected Grade ${dryGrade} (${money(dryRevenue)}). Rain on uncovered racks lowers the grade.` },
  ];
}
