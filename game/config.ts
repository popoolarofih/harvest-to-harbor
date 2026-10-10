import type { IssueKind, PrepMethod, Product, QualityGrade, SeedTier, Weather } from './types';

// Values are tuned for gameplay and loosely anchored to Southern Kaduna ginger farming.
// They are not live prices or agronomic advice.

export const STARTING_CASH = 500_000;
export const PLOT_COLS = 4;
export const PLOT_ROWS = 4;

export const BASE_ENERGY = 100;
export const WORKER_ENERGY = 30;
export const ENERGY = { plant: 2, water: 1, fertilize: 2, inspect: 1, treat: 2, gapFill: 2, harvest: 4, dry: 3, cover: 1, pump: 2 } as const;

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

export const DRYING_COST_PER_KG = 110;
export const DRYING_RACK_KG = 1_500;
export const SAFE_MOISTURE = 12;
export const DRY_FLOOR_MOISTURE = 7;

export const WAREHOUSE_BASE_KG = 2_500;
export const WAREHOUSE_UPGRADE_KG = 2_500;

export const UPGRADES = {
  irrigation: { label: 'Drip irrigation', cost: 180_000, blurb: 'Automatically waters any plot below 45% moisture each morning, using tank water.' },
  warehouse: { label: 'Warehouse extension', cost: 150_000, blurb: `+${WAREHOUSE_UPGRADE_KG.toLocaleString()} kg dry, covered storage. Stock over capacity spoils fast.` },
  tank: { label: 'Bigger water tank', cost: 90_000, blurb: `+${TANK_UPGRADE_LITRES.toLocaleString()} L. Fewer borehole runs and more rainwater caught.` },
} as const;
export type UpgradeId = keyof typeof UPGRADES;

/** ₦ per kg baseline the market mean-reverts toward. */
export const BASE_PRICES: Record<Product, number> = { fresh: 600, dried: 4_500 };
export const GRADE_MULT: Record<QualityGrade, number> = { A: 1.12, B: 1, C: 0.72 };

export interface Buyer {
  id: string; name: string; place: string; product: Product;
  minGrade: QualityGrade; minKg: number; priceMult: number; maxMoisture?: number; blurb: string;
}
export const BUYERS: Buyer[] = [
  { id: 'market', name: 'Kafanchan market traders', place: 'Kafanchan', product: 'fresh', minGrade: 'C', minKg: 0, priceMult: 0.85, blurb: 'Buys any grade, any amount. Pays below the market price.' },
  { id: 'aggregator', name: 'Kaduna ginger aggregator', place: 'Kaduna', product: 'fresh', minGrade: 'B', minKg: 500, priceMult: 1, blurb: 'Full market price, but only for Grade B or better, 500 kg minimum.' },
  { id: 'dryTraders', name: 'Kafanchan dried-ginger traders', place: 'Kafanchan', product: 'dried', minGrade: 'C', minKg: 0, priceMult: 0.8, blurb: 'Accepts damp or low-grade dried ginger at a steep discount.' },
  { id: 'processor', name: 'Abuja spice processor', place: 'Abuja', product: 'dried', minGrade: 'B', minKg: 100, priceMult: 1.05, maxMoisture: SAFE_MOISTURE, blurb: `Premium buyer. Rejects anything above ${SAFE_MOISTURE}% moisture.` },
];

export const WEATHER_INFO: Record<Weather, { label: string; icon: string; moisture: number; dryingMoisture: number; dryingQuality: number; growth: number }> = {
  heatwave: { label: 'Heatwave', icon: '🔥', moisture: -12, dryingMoisture: -16, dryingQuality: 0, growth: 0.75 },
  sunny: { label: 'Sunny', icon: '☀️', moisture: -6, dryingMoisture: -13, dryingQuality: 0, growth: 1 },
  cloudy: { label: 'Cloudy', icon: '⛅', moisture: -2, dryingMoisture: -7, dryingQuality: 0, growth: 0.9 },
  rain: { label: 'Rain', icon: '🌧️', moisture: 16, dryingMoisture: 4, dryingQuality: -2, growth: 1 },
  heavyRain: { label: 'Heavy rain', icon: '🌧️', moisture: 28, dryingMoisture: 8, dryingQuality: -4, growth: 0.95 },
  storm: { label: 'Storm', icon: '⛈️', moisture: 30, dryingMoisture: 10, dryingQuality: -7, growth: 0.7 },
};
/** Ordered dry → wet so a forecast "miss" lands on a neighbouring kind of weather. */
export const WEATHER_SCALE: Weather[] = ['heatwave', 'sunny', 'cloudy', 'rain', 'heavyRain', 'storm'];
export const WEATHER_BASE_WEIGHTS: Record<Weather, number> = { sunny: 0.3, cloudy: 0.26, rain: 0.22, heavyRain: 0.1, storm: 0.06, heatwave: 0.06 };
export const FORECAST_ACCURACY = [0.95, 0.85, 0.7, 0.55, 0.45];
