import type { GameState, LevelUp } from './types';

export const MAX_LEVEL = 50;

/** Total XP needed to reach `level`. Quadratic, so early levels come fast and Level 50 is a long-term goal. */
export const xpForLevel = (level: number) => 25 * (level - 1) ** 2;
export const levelFromXp = (xp: number) => Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(xp / 25)));

export const TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Smallholder' },
  { level: 5, title: 'Commercial Farmer' },
  { level: 10, title: 'Agricultural Processor' },
  { level: 20, title: 'Agribusiness Owner' },
  { level: 30, title: 'Exporter' },
  { level: 50, title: 'International Agricultural Supplier' },
];
export const titleFor = (level: number) => [...TITLES].reverse().find(t => level >= t.level)!.title;

export type UnlockId =
  | 'certifiedSeed' | 'forwardContracts' | 'solarDryer' | 'landExpansion' | 'bankLoans' | 'mill' | 'warehouse'
  | 'factory' | 'supermarket' | 'equipmentFinance' | 'fleet' | 'cargoInsurance' | 'europeBuyers' | 'ownBrand' | 'gulfBuyers' | 'americasBuyers'
  | 'solarPump' | 'tractor' | 'digger' | 'kachiaFarm' | 'companyTruck' | 'exportOffice' | 'zonkwaFarm' | 'josFarm';

/** What each level unlocks. Real capabilities, not just "+100 XP". */
export const UNLOCKS: { level: number; id: UnlockId; title: string; detail: string }[] = [
  { level: 2, id: 'certifiedSeed', title: 'Certified seed', detail: 'Disease-free planting material from certified suppliers.' },
  { level: 3, id: 'forwardContracts', title: 'Forward contracts', detail: 'Nigerian processors offer contracts on the Trade board.' },
  { level: 4, id: 'solarPump', title: 'Solar borehole pump', detail: 'Pump water with sunshine instead of diesel.' },
  { level: 4, id: 'solarDryer', title: 'Solar tunnel dryer', detail: 'Faster drying, and rain can no longer ruin a rack.' },
  { level: 5, id: 'landExpansion', title: 'Land expansion', detail: 'Lease another hectare next to your field: +8 plots.' },
  { level: 5, id: 'bankLoans', title: 'Bank loans', detail: 'Bank of Agriculture working-capital loans.' },
  { level: 6, id: 'mill', title: 'Hammer mill', detail: 'Grind dried ginger into powder.' },
  { level: 7, id: 'tractor', title: 'Tractor & ridger', detail: 'Field crews prepare and plant twice as many beds, for less.' },
  { level: 8, id: 'warehouse', title: 'Warehouse extensions', detail: 'Expand covered storage.' },
  { level: 9, id: 'digger', title: 'Mechanical ginger digger', detail: 'Faster, gentler harvests with more weight per bed.' },
  { level: 10, id: 'kachiaFarm', title: 'A second farm: Kachia Valley', detail: 'Buy a whole new farm compound with 16 beds of fertile valley land.' },
  { level: 10, id: 'factory', title: 'Processing Factory', detail: 'A second drying line (double rack capacity) and a packaging line that cuts sealed-bag costs by 40%.' },
  { level: 10, id: 'supermarket', title: 'Supermarket supply', detail: 'Abuja supermarkets buy your sealed powder.' },
  { level: 12, id: 'companyTruck', title: 'Company truck', detail: 'Your own lorry: cheaper, more reliable haulage.' },
  { level: 15, id: 'exportOffice', title: 'Export office', detail: 'Half-price export paperwork, and contracts that ship themselves.' },
  { level: 15, id: 'equipmentFinance', title: 'Equipment financing', detail: 'Buy equipment with 25% down and pay the rest over 120 days.' },
  { level: 16, id: 'zonkwaFarm', title: 'Zonkwa Ridge Farm', detail: 'A free-draining upland compound where rot rarely takes hold.' },
  { level: 20, id: 'fleet', title: "Chinedu's fleet", detail: 'Premium haulage to Lagos: newer trucks, far fewer breakdowns.' },
  { level: 20, id: 'cargoInsurance', title: 'Cargo insurance', detail: 'Insure shipments against damage at sea.' },
  { level: 24, id: 'josFarm', title: 'Jos Plateau Estate', detail: 'Cool, balanced plateau soil: the best land in the game.' },
  { level: 30, id: 'europeBuyers', title: 'European buyers', detail: 'Rotterdam and Hamburg spice importers send bigger contracts.' },
  { level: 40, id: 'ownBrand', title: 'Your own brand', detail: 'Branded, sealed products earn 10% more from every buyer.' },
  { level: 40, id: 'gulfBuyers', title: 'Gulf buyers', detail: 'Dubai importers via Jebel Ali.' },
  { level: 50, id: 'americasBuyers', title: 'American buyers', detail: 'US organic food companies, the largest contracts in the game.' },
];

export const unlockLevel = (id: UnlockId) => UNLOCKS.find(u => u.id === id)!.level;
export const isUnlocked = (s: Pick<GameState, 'level'>, id: UnlockId) => s.level >= unlockLevel(id);
export const lockedReason = (s: Pick<GameState, 'level'>, id: UnlockId) => (isUnlocked(s, id) ? null : `Unlocks at Level ${unlockLevel(id)}`);

/** More staff as the business grows. */
export const maxWorkers = (level: number) => 2 + Math.floor(level / 3);

export function describeLevelUp(from: number, to: number): LevelUp {
  const unlocks = UNLOCKS.filter(u => u.level > from && u.level <= to).map(u => u.title);
  const reachedTitle = TITLES.filter(t => t.level > from && t.level <= to).pop();
  if (maxWorkers(to) > maxWorkers(from)) unlocks.push(`Staff limit: ${maxWorkers(to)} workers`);
  return { level: to, title: reachedTitle?.title ?? null, unlocks };
}
