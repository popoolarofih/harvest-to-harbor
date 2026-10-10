import type { CutStyle, IssueKind, Packaging, PrepMethod, Product, QualityGrade, SeedTier, SortLevel, WashMethod, Weather } from './types';

// Values are tuned for gameplay and loosely anchored to Southern Kaduna ginger farming.
// They are not live prices or agronomic advice.

export const STARTING_CASH = 500_000;
export const PLOT_COLS = 4;
export const PLOT_ROWS = 4;

export const BASE_ENERGY = 100;
export const WORKER_ENERGY = 30;
export const ENERGY = { plant: 2, water: 1, fertilize: 2, inspect: 1, treat: 2, gapFill: 2, harvest: 4, dry: 3, cover: 1, pump: 2, bag: 2, grind: 3, ship: 4 } as const;

/** Fresh kg from one plot with perfect stand, health and maturity. 16 plots ≈ 2 tonnes. */
export const BASE_YIELD_KG = 125;
/** Earliest growth % at which the player may harvest (immature, lower yield). */
export const EARLY_HARVEST_GROWTH = 70;
export const FRESH_MOISTURE = 80;

export const PREP: Record<PrepMethod, { label: string; cost: number; energy: number; drainageBonus: number; blurb: string }> = {
  clear: { label: 'Clear & till', cost: 8_000, energy: 3, drainageBonus: 0, blurb: 'Cheap and quick. Water sits on flat beds after heavy rain.' },
  ridge: { label: 'Raised ridges', cost: 15_000, energy: 6, drainageBonus: 0.35, blurb: 'Costs more labour, but excess water drains away and rot risk falls.' },
};

export const SEEDS: Record<SeedTier, { label: string; cost: number; germination: number; yieldMult: number; resistance: number; blurb: string }> = {
  local: { label: 'Farm-saved setts', cost: 5_000, germination: 0.72, yieldMult: 0.85, resistance: 0, blurb: 'Cheap, but patchy emergence and no disease protection.' },
  improved: { label: 'Improved variety', cost: 11_000, germination: 0.88, yieldMult: 1, resistance: 0.25, blurb: 'Reliable emergence and a bit of resistance.' },
  certified: { label: 'Certified disease-free', cost: 19_000, germination: 0.96, yieldMult: 1.12, resistance: 0.55, blurb: 'Expensive. Best yield and strongly resists pests and rot.' },
};

export const FERTILIZER_COST = 4_000;
export const FERTILIZER_GAIN = 35;
export const WATER_PER_PLOT = 400;
export const WATER_MOISTURE_GAIN = 25;
export const TANK_BASE_LITRES = 4_000;
export const TANK_UPGRADE_LITRES = 3_000;
export const LITRES_PER_FUEL_LITRE = 700;
export const FUEL_PRICE = 1_100;

export const TREATMENTS: Record<IssueKind, { label: string; cost: number; name: string; lesson: string }> = {
  pest: { name: 'Shoot borer', label: 'Insecticide spray', cost: 7_000, lesson: 'Borers tunnel into shoots. Caught early, one spray clears them.' },
  leafSpot: { name: 'Leaf spot', label: 'Fungicide spray', cost: 6_000, lesson: 'Leaf spot is a fungus that spreads in wet weather. Spraying stops it, but leaf damage already done stays.' },
  rot: { name: 'Soft rot', label: 'Remove infected rhizomes & lime soil', cost: 5_000, lesson: 'Soft rot cannot be cured, only contained. Prevention (drainage, clean seed) is the real fix.' },
};

export const WAGE_PER_DAY = 3_000;
export const HIRE_COST = 5_000;
export const INSURANCE_PREMIUM = 2_500;
export const INSURANCE_COVER = 0.7;

/** Base labour to wash, cut and spread fresh ginger, per fresh kg. Prep choices add to it. */
export const DRYING_COST_PER_KG = 100;

// ---- Processing chain: FRESH → WASH → SORT → SLICE → DRY → (GRIND) → QC → PACK ----
export const WASH: Record<WashMethod, { label: string; costPerKg: number; litresPerKg: number; blurb: string }> = {
  rinse: { label: 'Quick rinse', costPerKg: 0, litresPerKg: 0, blurb: 'Free and fast, but soil stays in the crevices: a foreign-matter defect that caps the grade at B.' },
  thorough: { label: 'Thorough wash', costPerKg: 15, litresPerKg: 0.6, blurb: 'Scrubbed in clean water from your tank. Required for Grade A and export.' },
};
export const SORT: Record<SortLevel, { label: string; costPerKg: number; keep: number; quality: number; blurb: string }> = {
  none: { label: 'No sorting', costPerKg: 0, keep: 1, quality: -6, blurb: 'Keeps every kilo, bruised and diseased pieces included. They drag the batch down.' },
  standard: { label: 'Standard sort', costPerKg: 5, keep: 0.95, quality: 4, blurb: 'Removes the obviously damaged 5%.' },
  strict: { label: 'Strict sort', costPerKg: 10, keep: 0.88, quality: 9, blurb: 'Only the best 88% goes on. Fewer kilos, better grade.' },
};
export const CUT: Record<CutStyle, { label: string; costPerKg: number; rate: number; quality: number; dryMatter: number; blurb: string }> = {
  split: { label: 'Split, unpeeled', costPerKg: 0, rate: 0.85, quality: 0, dryMatter: 1, blurb: 'Traditional Nigerian split ginger. Cheap, but dries slowly.' },
  sliced: { label: 'Peeled & sliced', costPerKg: 30, rate: 1.2, quality: 6, dryMatter: 0.96, blurb: 'More labour and a little weight lost to peeling, but dries fast and evenly and buyers pay more.' },
};
export const PACKAGING: Record<Packaging, { label: string; costPerKg: number; blurb: string }> = {
  bulk: { label: 'Jute sacks', costPerKg: 20, blurb: 'Cheap. Breathes, so it picks up moisture on wet days.' },
  sealed: { label: 'Lined, sealed bags', costPerKg: 120, blurb: 'Keeps damp out. Required for Premium grade and export.' },
};
export const GRIND_COST_PER_KG = 150;
/** Diesel the hammer mill burns per kg ground. */
export const GRIND_FUEL_PER_KG = 0.02;
export const GRIND_YIELD = 0.97;
/** Grinding above this moisture makes powder cake and clump. */
export const GRIND_MAX_MOISTURE = 10;
export const PREMIUM_MIN_QUALITY = 90;
export const PREMIUM_MAX_MOISTURE = 10;
export const DRYING_RACK_KG = 1_500;
export const SAFE_MOISTURE = 12;
export const DRY_FLOOR_MOISTURE = 7;

export const WAREHOUSE_BASE_KG = 2_500;
export const WAREHOUSE_UPGRADE_KG = 2_500;

export const UPGRADES = {
  irrigation: { label: 'Drip irrigation', cost: 180_000, blurb: 'Automatically waters any plot below 45% moisture each morning, using tank water.' },
  warehouse: { label: 'Warehouse extension', cost: 150_000, blurb: `+${WAREHOUSE_UPGRADE_KG.toLocaleString()} kg dry, covered storage. Stock over capacity spoils fast.` },
  tank: { label: 'Bigger water tank', cost: 90_000, blurb: `+${TANK_UPGRADE_LITRES.toLocaleString()} L. Fewer borehole runs and more rainwater caught.` },
  mill: { label: 'Hammer mill', cost: 200_000, blurb: 'Grinds dried ginger into powder, the highest-value product. Runs on diesel.' },
  solarDryer: { label: 'Solar tunnel dryer', cost: 250_000, blurb: 'A plastic-covered drying tunnel: dries 30% faster and rain can no longer re-wet the racks.' },
  factory: { label: 'Processing Factory', cost: 900_000, blurb: 'A second drying line (double rack capacity) and a packaging line that cuts sealed-bag costs by 40%.' },
  land: { label: 'Lease another hectare', cost: 400_000, blurb: '+8 plots beside your field, on a long lease from the village.' },
} as const;

/** Daily running costs of equipment. */
export const MAINTENANCE: Partial<Record<UpgradeId, number>> = { irrigation: 500, mill: 1_500, solarDryer: 400, factory: 2_500 };
export const LAND_PLOTS_PER_LEASE = 8;
export const MAX_LAND_LEASES = 1;
export const FACTORY_SEALED_DISCOUNT = 0.4;

// ---- Money ----
export const FX_BASE = 1_500;
export const BANK_LOANS = [
  { amount: 500_000, days: 60, annualRate: 0.18 },
  { amount: 1_500_000, days: 120, annualRate: 0.2 },
];
export const EQUIPMENT_FINANCE = { downPayment: 0.25, days: 120, annualRate: 0.22 };
export const DEFAULT_PENALTY = 0.1;

// ---- Logistics: farm → Lagos → port → sea ----
export const HAULAGE = {
  standard: { label: 'Standard haulage', base: 120_000, perKg: 60, breakdownChance: 0.1, blurb: 'Hired truck. Cheaper, but old trucks break down.' },
  fleet: { label: "Chinedu's fleet", base: 180_000, perKg: 90, breakdownChance: 0.02, blurb: 'Newer trucks and a driver who knows the checkpoints.' },
} as const;
export const ROAD_DAYS = 3;
export const PORT_DAYS = 2;
export const EXPORT_FEES = 220_000; // documentation, phytosanitary certificate, port handling, container
export const DEMURRAGE_PER_DAY = 25_000;
export const CARGO_INSURANCE_RATE = 0.02;
export const SEA_DAMAGE_CHANCE = 0.03;
export const BRAND_PREMIUM = 0.1;

export interface TradeBuyer {
  id: string; name: string; country: string; flag: string; port: string;
  /** Days at sea from Lagos; 0 for domestic buyers (truck only). */
  seaDays: number;
  domestic: boolean;
  unlock: 'forwardContracts' | 'campaign' | 'europeBuyers' | 'gulfBuyers' | 'americasBuyers' | 'supermarket';
  products: ('dried' | 'powder')[];
  minGrade: QualityGrade;
  /** Multiplier on the local market price, before grade. */
  premium: number;
  kg: [number, number];
}
export const TRADE_BUYERS: TradeBuyer[] = [
  { id: 'abujaSpice', name: 'Abuja Spice Processors', country: 'Nigeria', flag: '🇳🇬', port: 'Abuja', seaDays: 0, domestic: true, unlock: 'forwardContracts', products: ['dried'], minGrade: 'B', premium: 1.08, kg: [150, 400] },
  { id: 'lagosFoods', name: 'Lagos Foods Ltd', country: 'Nigeria', flag: '🇳🇬', port: 'Lagos', seaDays: 0, domestic: true, unlock: 'supermarket', products: ['powder'], minGrade: 'A', premium: 1.12, kg: [100, 300] },
  { id: 'london', name: 'London Spice Co.', country: 'United Kingdom', flag: '🇬🇧', port: 'Felixstowe', seaDays: 14, domestic: false, unlock: 'campaign', products: ['dried', 'powder'], minGrade: 'A', premium: 1.35, kg: [400, 900] },
  { id: 'rotterdam', name: 'Rotterdam Botanicals', country: 'Netherlands', flag: '🇳🇱', port: 'Rotterdam', seaDays: 15, domestic: false, unlock: 'europeBuyers', products: ['dried'], minGrade: 'A', premium: 1.4, kg: [800, 1_800] },
  { id: 'hamburg', name: 'Hamburger Gewürzhaus', country: 'Germany', flag: '🇩🇪', port: 'Hamburg', seaDays: 16, domestic: false, unlock: 'europeBuyers', products: ['powder'], minGrade: 'Premium', premium: 1.45, kg: [500, 1_200] },
  { id: 'dubai', name: 'Gulf Fresh Trading', country: 'UAE', flag: '🇦🇪', port: 'Jebel Ali', seaDays: 18, domestic: false, unlock: 'gulfBuyers', products: ['dried', 'powder'], minGrade: 'A', premium: 1.45, kg: [1_000, 2_500] },
  { id: 'savannah', name: 'Atlantic Organics', country: 'USA', flag: '🇺🇸', port: 'Savannah', seaDays: 20, domestic: false, unlock: 'americasBuyers', products: ['dried', 'powder'], minGrade: 'Premium', premium: 1.6, kg: [1_500, 3_000] },
];
export type UpgradeId = keyof typeof UPGRADES;

/** ₦ per kg baseline the market mean-reverts toward. */
export const BASE_PRICES: Record<Product, number> = { fresh: 600, dried: 4_500, powder: 5_800 };
export const GRADE_MULT: Record<QualityGrade, number> = { Premium: 1.3, A: 1.12, B: 1, C: 0.72 };

export interface Buyer {
  id: string; name: string; place: string; product: Product;
  minGrade: QualityGrade; minKg: number; priceMult: number; maxMoisture?: number; sealedOnly?: boolean; blurb: string;
}
export const BUYERS: Buyer[] = [
  { id: 'market', name: 'Kafanchan market traders', place: 'Kafanchan', product: 'fresh', minGrade: 'C', minKg: 0, priceMult: 0.85, blurb: 'Buys any grade, any amount. Pays below the market price.' },
  { id: 'aggregator', name: 'Kaduna ginger aggregator', place: 'Kaduna', product: 'fresh', minGrade: 'B', minKg: 500, priceMult: 1, blurb: 'Full market price, but only for Grade B or better, 500 kg minimum.' },
  { id: 'dryTraders', name: 'Kafanchan dried-ginger traders', place: 'Kafanchan', product: 'dried', minGrade: 'C', minKg: 0, priceMult: 0.8, blurb: 'Accepts damp or low-grade dried ginger at a steep discount.' },
  { id: 'processor', name: 'Abuja spice processor', place: 'Abuja', product: 'dried', minGrade: 'B', minKg: 100, priceMult: 1.05, maxMoisture: SAFE_MOISTURE, blurb: `Premium buyer. Rejects anything above ${SAFE_MOISTURE}% moisture.` },
  { id: 'spiceSellers', name: 'Kaduna spice sellers', place: 'Kaduna', product: 'powder', minGrade: 'C', minKg: 0, priceMult: 0.8, blurb: 'Market stalls. Take any powder, any packaging.' },
  { id: 'supermarket', name: 'Abuja supermarket chain', place: 'Abuja', product: 'powder', minGrade: 'A', minKg: 50, priceMult: 1.1, maxMoisture: SAFE_MOISTURE, sealedOnly: true, blurb: 'Shelf-ready only: Grade A or Premium, in sealed bags.' },
];

/** The export buyer Amaka introduces in the campaign. Reached by shipping through Lagos, not a local sale. */
export const EXPORT = {
  buyer: 'London Spice Co.', minKg: 400, minGrade: 'A' as QualityGrade, priceMult: 1.35, haulage: 150_000,
  blurb: 'Grade A or Premium dried ginger or powder, sealed, at or below 12% moisture.',
};

export const WEATHER_INFO: Record<Weather, { label: string; icon: string; moisture: number; dryingMoisture: number; dryingQuality: number; growth: number }> = {
  heatwave: { label: 'Heatwave', icon: '🔥', moisture: -12, dryingMoisture: -16, dryingQuality: 0, growth: 0.75 },
  sunny: { label: 'Sunny', icon: '☀️', moisture: -6, dryingMoisture: -13, dryingQuality: 0, growth: 1 },
  cloudy: { label: 'Cloudy', icon: '⛅', moisture: 0, dryingMoisture: -7, dryingQuality: 0, growth: 0.9 },
  rain: { label: 'Rain', icon: '🌧️', moisture: 16, dryingMoisture: 4, dryingQuality: -2, growth: 1 },
  heavyRain: { label: 'Heavy rain', icon: '🌧️', moisture: 28, dryingMoisture: 8, dryingQuality: -4, growth: 0.95 },
  storm: { label: 'Storm', icon: '⛈️', moisture: 30, dryingMoisture: 10, dryingQuality: -7, growth: 0.7 },
};
/** Ordered dry → wet so a forecast "miss" lands on a neighbouring kind of weather. */
export const WEATHER_SCALE: Weather[] = ['heatwave', 'sunny', 'cloudy', 'rain', 'heavyRain', 'storm'];
export const WEATHER_BASE_WEIGHTS: Record<Weather, number> = { sunny: 0.3, cloudy: 0.26, rain: 0.22, heavyRain: 0.1, storm: 0.06, heatwave: 0.06 };
export const FORECAST_ACCURACY = [0.95, 0.85, 0.7, 0.55, 0.45];
