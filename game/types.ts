export type PlotStatus = 'empty' | 'prepared' | 'growing' | 'ready';
export type QualityGrade = 'A' | 'B' | 'C';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'heavyRain' | 'storm' | 'heatwave';
export type Product = 'fresh' | 'dried';
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
}

export interface DryingJob {
  id: number;
  freshKg: number;
  dryMatterKg: number;
  moisture: number;
  quality: number;
  days: number;
  covered: boolean;
}

export interface ForecastDay { day: number; weather: Weather; confidence: number; }
export interface ActiveEvent { kind: EventKind; daysLeft: number; magnitude: number; }
export interface LogLine { text: string; severity: Severity; }
export interface LogEntry extends LogLine { day: number; }

export interface DayReport {
  day: number; weather: Weather;
  lines: LogLine[];
  wages: number; insurance: number; payouts: number;
}

export interface InspectionReport {
  title: string;
  grade: QualityGrade;
  stats: { label: string; value: string; ok: boolean }[];
  warnings: string[];
  consequences: string[];
}

export interface Upgrades { irrigation: boolean; warehouseLevel: number; tankLevel: number; insurance: boolean; }

export interface Finance { revenue: number; expenses: number; wages: number; insurancePremiums: number; insurancePayouts: number; }

export interface Mission { id: string; title: string; description: string; target: number; progress: number; reward: number; complete: boolean; }

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
  workers: number;
  upgrades: Upgrades;
  weather: Weather;
  /** The real upcoming weather. Hidden from the player; they only see `forecast`. */
  weatherQueue: Weather[];
  forecast: ForecastDay[];
  /** ₦ per kg. */
  market: { fresh: number; dried: number };
  priceHistory: { day: number; fresh: number; dried: number }[];
  events: ActiveEvent[];
  log: LogEntry[];
  lastReport: DayReport | null;
  lastInspection: InspectionReport | null;
  finance: Finance;
  missions: Mission[];
  toast: string;
}
