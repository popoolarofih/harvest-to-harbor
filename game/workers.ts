import { WAGE_PER_DAY } from './config';
import type { Rng } from './rng';
import type { GameState, WorkerCandidate, WorkerLevel, WorkerProfile, WorkerRole, WorkerTrait } from './types';

export const ROLE_DETAILS: Record<WorkerRole, { title: string; icon: string; perkDesc: string }> = {
  general: {
    title: 'Farm Labourer',
    icon: '🧑‍🌾',
    perkDesc: 'Reliable all-round field and processing support (+8 daily labour points).',
  },
  agronomist: {
    title: 'Agronomist & Scout',
    icon: '🔬',
    perkDesc: '+35% passive disease detection, 25% lower spray/lime chemical costs, early rot warnings.',
  },
  tillageSpecialist: {
    title: 'Soil & Tillage Specialist',
    icon: '🚜',
    perkDesc: '+10% ridging quality, 25% less soil compaction, 1⚡ less energy per bed prepared.',
  },
  masterProcessor: {
    title: 'Master Dryer & Miller',
    icon: '⚙️',
    perkDesc: '+20% rack drying speed, prevents soiling defects on washed rhizomes, +5% powder yield.',
  },
  logisticsCaptain: {
    title: 'Logistics Fleet Captain',
    icon: '🚛',
    perkDesc: '50% fewer road haulage breakdowns, faster road transport to Lagos port, eliminates port demurrage.',
  },
};

export const TRAIT_DETAILS: Record<WorkerTrait, { label: string; icon: string; desc: string }> = {
  rainReader: { label: 'Rain Reader', icon: '🌦️', desc: 'Alerts you 1 day earlier to unseasonal storms.' },
  carefulHandler: { label: 'Careful Handler', icon: '🤲', desc: 'Reduces rhizome bruising during washing and packing.' },
  mechanic: { label: 'Mechanical Whiz', icon: '🔧', desc: 'Borehole pump irrigation breaks down 40% less often.' },
  stamina: { label: 'Northern Stamina', icon: '💪', desc: 'Generates +2 extra energy points per day for field work.' },
};

export const LEVEL_REQUIREMENTS: Record<WorkerLevel, { minXp: number; nextLevel: WorkerLevel | null; wageMult: number; bonusMult: number }> = {
  rookie: { minXp: 0, nextLevel: 'experienced', wageMult: 1.0, bonusMult: 1.0 },
  experienced: { minXp: 150, nextLevel: 'master', wageMult: 1.5, bonusMult: 1.35 },
  master: { minXp: 400, nextLevel: null, wageMult: 2.2, bonusMult: 1.7 },
};

const KADUNA_NAMES = [
  'Ibrahim Danladi', 'Blessing Okafor', 'Yakubu Audu', 'Zainab Bello', 'Emmanuel Eze',
  'Amina Garba', 'Chinedu Aliyu', 'Grace Bitrus', 'Musa Sani', 'Folake Adeleke',
  'Sunday Bako', 'Halima Mohammed', 'Daniel Dung', 'Fatima Shehu', 'Victor Yohanna',
];

const BIOS: Record<WorkerRole, string[]> = {
  general: [
    'Experienced seasonal worker from Manchok with 5 years in Southern Kaduna ginger fields.',
    'Hardworking labourer from Zonkwa, skilled in ridge tilling and harvesting.',
  ],
  agronomist: [
    'Graduate of Samaru College of Agriculture, specializing in ginger rhizome pathogen suppression.',
    'Former extension officer with Ahmadu Bello University, expert in Pythium soft rot diagnosis.',
  ],
  tillageSpecialist: [
    'Master tractor and oxen operator who knows how to break clay pans without destroying topsoil.',
    'Soil technician skilled in contour bunding and erosion control on sloping fields.',
  ],
  masterProcessor: [
    'Veteran drying yard supervisor from Kachia, master of slicing thickness and moisture control.',
    'Industrial food processing technician with 8 years operating hammer mills and solar dryers.',
  ],
  logisticsCaptain: [
    'Former long-haul driver on the Kaduna-Lagos expressway, knows every checkpoint and detour.',
    'Port clearance expediter from Apapa with contacts across export customs inspection bays.',
  ],
};

const ROLES: WorkerRole[] = ['general', 'agronomist', 'tillageSpecialist', 'masterProcessor', 'logisticsCaptain'];
const TRAITS: WorkerTrait[] = ['rainReader', 'carefulHandler', 'mechanic', 'stamina'];

export function createWorkerCandidate(rng: Rng, id: number): WorkerCandidate {
  const name = rng.pick(KADUNA_NAMES);
  const role = rng.pick(ROLES);
  const trait = rng.pick(TRAITS);
  const level: WorkerLevel = rng.chance(0.05) ? 'master' : rng.chance(0.2) ? 'experienced' : 'rookie';
  const baseWage = WAGE_PER_DAY;
  const dailyWage = Math.round(baseWage * LEVEL_REQUIREMENTS[level].wageMult * (role === 'general' ? 1 : 1.25));
  const hireCost = Math.round(dailyWage * (level === 'master' ? 8 : level === 'experienced' ? 5 : 3));
  const bios = BIOS[role];
  const bio = rng.pick(bios);

  return {
    id,
    name,
    role,
    level,
    dailyWage,
    hireCost,
    trait,
    bio,
  };
}

export function generateInitialCandidates(rng: Rng, count = 4): WorkerCandidate[] {
  const candidates: WorkerCandidate[] = [];
  for (let i = 1; i <= count; i++) {
    candidates.push(createWorkerCandidate(rng, i));
  }
  return candidates;
}

export interface CrewPerks {
  diseaseDetectionBoost: number;
  treatmentCostDiscount: number;
  ridgeDrainageBonus: number;
  compactionProtection: number;
  prepEnergyDiscount: number;
  dryingSpeedMult: number;
  cleanRinseBonus: boolean;
  powderYieldBonus: number;
  breakdownChanceMult: number;
  roadTransitDaysReduction: number;
  extraEnergy: number;
  irrigationBreakdownReduction: number;
}

export function calculateCrewPerks(crew: WorkerProfile[]): CrewPerks {
  let diseaseDetectionBoost = 0;
  let treatmentCostDiscount = 0;
  let ridgeDrainageBonus = 0;
  let compactionProtection = 0;
  let prepEnergyDiscount = 0;
  let dryingSpeedMult = 1.0;
  let cleanRinseBonus = false;
  let powderYieldBonus = 0;
  let breakdownChanceMult = 1.0;
  let roadTransitDaysReduction = 0;
  let extraEnergy = 0;
  let irrigationBreakdownReduction = 0;

  for (const w of crew) {
    const mult = LEVEL_REQUIREMENTS[w.level].bonusMult;
    if (w.role === 'agronomist') {
      diseaseDetectionBoost += 0.35 * mult;
      treatmentCostDiscount = Math.max(treatmentCostDiscount, 0.25 * mult);
    } else if (w.role === 'tillageSpecialist') {
      ridgeDrainageBonus += 0.05 * mult;
      compactionProtection += 0.25 * mult;
      prepEnergyDiscount = Math.max(prepEnergyDiscount, 1);
    } else if (w.role === 'masterProcessor') {
      dryingSpeedMult += 0.2 * mult;
      cleanRinseBonus = true;
      powderYieldBonus += 0.05 * mult;
    } else if (w.role === 'logisticsCaptain') {
      breakdownChanceMult *= (1 - 0.5 * mult);
      roadTransitDaysReduction = Math.max(roadTransitDaysReduction, 1);
    }

    if (w.trait === 'stamina') extraEnergy += 2;
    if (w.trait === 'mechanic') irrigationBreakdownReduction += 0.4;
  }

  return {
    diseaseDetectionBoost,
    treatmentCostDiscount: Math.min(0.5, treatmentCostDiscount),
    ridgeDrainageBonus,
    compactionProtection: Math.min(0.6, compactionProtection),
    prepEnergyDiscount,
    dryingSpeedMult,
    cleanRinseBonus,
    powderYieldBonus,
    breakdownChanceMult: Math.max(0.1, breakdownChanceMult),
    roadTransitDaysReduction,
    extraEnergy,
    irrigationBreakdownReduction: Math.min(0.8, irrigationBreakdownReduction),
  };
}
