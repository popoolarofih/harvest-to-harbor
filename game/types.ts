export type PlotStatus = 'empty' | 'prepared' | 'growing' | 'ready';
export type QualityGrade = 'Premium' | 'A' | 'B' | 'C';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'heavyRain' | 'storm' | 'heatwave';
export type Product = 'fresh' | 'dried' | 'powder';
export type Packaging = 'bulk' | 'sealed';
export type WashMethod = 'rinse' | 'thorough';
export type SortLevel = 'none' | 'standard' | 'strict';
export type CutStyle = 'split' | 'sliced';
export type NpcId = 'baba' | 'amaka' | 'chinedu';
export type SeedTier = 'local' | 'improved' | 'certified';
export type PrepMethod = 'clear' | 'ridge';
export type IssueKind = 'pest' | 'leafSpot' | 'rot';
export type EventKind = 'priceCrash' | 'fuelSpike' | 'workerShortage';
export type Severity = 'info' | 'good' | 'warning' | 'danger';

export interface CropIssue { kind: IssueKind; severity: number; detected: boolean; }

export interface Plot {
  id: number; x: number; z: number;
  status: PlotStatus;
  /** 0-1: how fast excess water leaves the soil. Fixed by terrain, improved by ridging. */
  drainage: number;
  fertility: number;
  moisture: number;
  health: number;
  growth: number;
  ridged: boolean;
  seed: SeedTier | null;
  /** Fraction of planted setts that germinated; decided once growth passes 15%. */
  stand: number;
  germinated: boolean;
  daysReady: number;
  issue: CropIssue | null;
}

export interface Batch {
  id: number; product: Product;
  kg: number;
  /** 0-100 overall condition. Drives grade. */
  quality: number;
  /** % water content. Fresh ginger is ~80%; dried ginger should be <= 12%. */
  moisture: number;
  createdDay: number;
  /** How processed stock was bagged. Fresh ginger is never packaged. */
  packaging?: Packaging;
  /** Soil left on poorly washed ginger: a foreign-matter defect that caps the grade at B. */
  soiled?: boolean;
}

/** Choices made at the washing, sorting and slicing stations before ginger goes on the racks. */
export interface PrepChoices { wash: WashMethod; sort: SortLevel; cut: CutStyle; }

export interface DryingJob {
  id: number;
  freshKg: number;
  dryMatterKg: number;
  moisture: number;
  quality: number;
  days: number;
  covered: boolean;
  /** Drying speed multiplier from the cut style (peeled slices dry faster than split rhizomes). */
  rate: number;
  soiled: boolean;
}

export interface ForecastDay { day: number; weather: Weather; confidence: number; }
export interface ActiveEvent { kind: EventKind; daysLeft: number; magnitude: number; }
export interface LogLine { text: string; severity: Severity; }
export interface LogEntry extends LogLine { day: number; }

export interface DayReport {
  day: number; weather: Weather;
  lines: LogLine[];
  wages: number; insurance: number; payouts: number;
  automation: AutomationSummary;
}

export interface AutomationSettings {
  irrigationThreshold: number;
  irrigationDailyLimit: number;
  autoPump: boolean;
  autoFertilize: boolean;
  fertilizerDailyLimit: number;
  autoCoverRacks: boolean;
  fieldWorkers: number;
  autoPlant: boolean;
  prepMethod: PrepMethod;
  plantSeed: SeedTier;
  autoMaintain: boolean;
  autoWater: boolean;
  autoTreat: boolean;
  autoGapFill: boolean;
  autoHarvest: boolean;
  processingWorkers: number;
  autoOpenRacks: boolean;
  autoBagRacks: boolean;
}

export interface AutomationSummary {
  irrigatedPlots: number;
  irrigationLitres: number;
  pumpedLitres: number;
  pumpingCost: number;
  fertilizedPlots: number;
  fertilizerCost: number;
  coveredRacks: number;
  irrigationNeedsRepair: boolean;
  plantedPlots?: number;
  plantedCost?: number;
  wateredPlots?: number;
  treatedPlots?: number;
  treatmentCost?: number;
  gapFilledPlots?: number;
  harvestedPlots?: number;
  harvestedKg?: number;
  openedRacks?: number;
  baggedRacks?: number;
}

export interface InspectionReport {
  title: string;
  grade: QualityGrade;
  stats: { label: string; value: string; ok: boolean }[];
  warnings: string[];
  consequences: string[];
}

export interface Upgrades { irrigation: boolean; warehouseLevel: number; tankLevel: number; insurance: boolean; mill: boolean; solarDryer: boolean; factory: boolean; landLeased: number; }

export interface Finance { revenue: number; expenses: number; wages: number; insurancePremiums: number; insurancePayouts: number; interest: number; maintenance: number; logistics: number; }

export interface Mission {
  id: string; title: string; description: string; target: number; progress: number; reward: number; complete: boolean;
  /** Who gives the mission in the story. */
  npc: NpcId | null;
  /** What that character says when the mission starts. */
  intro: string;
  /** Short "what to do next" hint shown in the HUD. */
  hint: string;
}

/** Running totals the campaign measures progress against. */
export interface Stats { harvestedKg: number; freshSoldKg: number; processedKg: number; safeDriedKg: number; powderKg: number; exportedKg: number; }

export interface CampaignFlags {
  talked: Record<NpcId, number>;
  /** Day the campaign storm is due, while mission 3 is active. */
  stormDay: number | null;
  stormOutcome: 'protected' | 'exposed' | null;
  exportUnlocked: boolean;
  shipments: number;
}

export type ContractStatus = 'offered' | 'active' | 'shipping' | 'delivered' | 'paid' | 'failed';
export type PaymentTerms = 'advance' | 'onDelivery' | 'net30';

/** A buyer's order: deliver `kg` of `product` at `minGrade` or better by `deadlineDay`. */
export interface Contract {
  id: number;
  buyerId: string;
  product: Exclude<Product, 'fresh'>;
  minGrade: QualityGrade;
  kg: number;
  /** Export contracts are priced in US dollars per kg; domestic ones in naira. */
  currency: 'USD' | 'NGN';
  pricePerKg: number;
  deadlineDay: number;
  /** Fraction of the contract value deducted if delivered after the deadline. */
  latePenalty: number;
  terms: PaymentTerms;
  status: ContractStatus;
  offerExpiresDay: number;
  /** Advance already received (₦), refunded if the contract fails. */
  advancePaid: number;
  campaign?: boolean;
}

export type ShipmentStage = 'road' | 'port' | 'sea' | 'delivered' | 'paid' | 'lost';
export type Haulage = 'standard' | 'fleet';

export interface ShipmentEvent { day: number; text: string; severity: Severity; }

export interface Shipment {
  id: number;
  contractId: number;
  kg: number;
  grade: QualityGrade;
  stage: ShipmentStage;
  /** Days left in the current stage. */
  daysLeft: number;
  /** Days the current stage was planned to take (for map progress). */
  stageDays: number;
  haulage: Haulage;
  insured: boolean;
  /** Fraction of the cargo value lost to damage (insured or not). */
  damage: number;
  dispatchedDay: number;
  arrivedDay: number | null;
  payDay: number | null;
  /** Final payment in naira once it is known. */
  payout: number | null;
  events: ShipmentEvent[];
}

export interface Loan {
  id: number;
  kind: 'bank' | 'equipment';
  label: string;
  principal: number;
  balance: number;
  /** Interest added to the balance each day. */
  dailyRate: number;
  dueDay: number;
  defaulted: boolean;
}

export interface LevelUp { level: number; title: string | null; unlocks: string[]; }

/** A line of story dialogue the HUD shows as a card until dismissed. */
export interface Story { speaker: NpcId | null; title: string; text: string; }

export type ThemeId = 'emerald' | 'gold' | 'terracotta' | 'indigo' | 'palm';

export interface PlayerProfile {
  farmerName: string;
  farmName: string;
  exportBrand: string;
  avatar: string;
  skinTone: number;
  emblem: string;
  theme: ThemeId;
}

export interface GameState {
  day: number; cash: number; energy: number; xp: number; reputation: number; level: number;
  /** Seeded RNG state. All randomness flows through it so a run is reproducible. */
  rng: number;
  plots: Plot[];
  batches: Batch[];
  dryingJobs: DryingJob[];
  nextId: number;
  /** Litres in the farm water tank. */
  water: number;
  /** 0-100. Dirty emitters eventually stop the automatic drip lines until repaired. */
  irrigationCondition: number;
  automation: AutomationSettings;
  workers: number;
  upgrades: Upgrades;
  weather: Weather;
  /** The real upcoming weather. Hidden from the player; they only see `forecast`. */
  weatherQueue: Weather[];
  forecast: ForecastDay[];
  /** ₦ per kg. */
  market: Record<Product, number>;
  /** Naira per US dollar. Export contracts are paid in dollars, so this moves your revenue. */
  fxRate: number;
  priceHistory: ({ day: number } & Record<Product, number>)[];
  events: ActiveEvent[];
  log: LogEntry[];
  lastReport: DayReport | null;
  lastInspection: InspectionReport | null;
  finance: Finance;
  missions: Mission[];
  stats: Stats;
  flags: CampaignFlags;
  /** Value of the tracked stat when the current mission started, so progress counts from then. */
  missionBase: number;
  story: Story | null;
  contracts: Contract[];
  shipments: Shipment[];
  loans: Loan[];
  /** Set after a loan default; lenders refuse new credit until it's repaid. */
  creditBlocked: boolean;
  levelUp: LevelUp | null;
  toast: string;
  profile: PlayerProfile;
}
