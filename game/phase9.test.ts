import { describe, expect, it } from 'vitest';
import { HIRE_COST, WAGE_PER_DAY, WORKER_ENERGY } from './config';
import { advanceDay } from './day';
import { dismissWorker, dismissWorkerById, hireCandidate, hireWorker } from './economy';
import { dailyFixedCosts, totalWages } from './finance';
import { createRng } from './rng';
import { initialState } from './state';
import type { GameState, WorkerProfile } from './types';
import { calculateCrewPerks, createWorkerCandidate, generateInitialCandidates, LEVEL_REQUIREMENTS } from './workers';

describe('Phase 9: Worker Profiles, Specialization & Experience', () => {
  it('initializes candidates and crew correctly on a new season', () => {
    const s = initialState(42);
    expect(s.workers).toBe(0);
    expect(s.crew).toEqual([]);
    expect(s.candidates.length).toBeGreaterThanOrEqual(3);
    const cand = s.candidates[0];
    expect(cand.id).toBeDefined();
    expect(cand.name).toBeDefined();
    expect(cand.role).toBeDefined();
    expect(cand.dailyWage).toBeGreaterThan(0);
    expect(cand.hireCost).toBeGreaterThan(0);
  });

  it('allows hiring a specialized candidate into the crew roster', () => {
    let s = initialState(42);
    s.cash = 100_000;
    const targetCand = s.candidates[0];
    const initialCandidatesCount = s.candidates.length;

    s = hireCandidate(s, targetCand.id);
    expect(s.workers).toBe(1);
    expect(s.crew.length).toBe(1);
    expect(s.crew[0].name).toBe(targetCand.name);
    expect(s.crew[0].role).toBe(targetCand.role);
    expect(s.crew[0].level).toBe(targetCand.level);
    expect(s.crew[0].dailyWage).toBe(targetCand.dailyWage);
    expect(s.candidates.length).toBe(initialCandidatesCount - 1);
    expect(s.cash).toBe(100_000 - targetCand.hireCost);
  });

  it('allows dismissing a specific worker by ID from the roster', () => {
    let s = initialState(42);
    s.cash = 200_000;
    s = hireCandidate(s, s.candidates[0].id);
    s = hireCandidate(s, s.candidates[0].id);
    expect(s.workers).toBe(2);
    expect(s.crew.length).toBe(2);

    const firstWorkerId = s.crew[0].id;
    const secondWorkerId = s.crew[1].id;

    s = dismissWorkerById(s, firstWorkerId);
    expect(s.workers).toBe(1);
    expect(s.crew.length).toBe(1);
    expect(s.crew[0].id).toBe(secondWorkerId);
  });

  it('computes cumulative crew perks accurately for specialized roles', () => {
    const crew: WorkerProfile[] = [
      {
        id: 1,
        name: 'Blessing Okafor',
        role: 'agronomist',
        level: 'rookie',
        xp: 0,
        dailyWage: 3750,
        daysEmployed: 1,
        trait: 'rainReader',
        morale: 100,
      },
      {
        id: 2,
        name: 'Musa Sani',
        role: 'masterProcessor',
        level: 'experienced',
        xp: 160,
        dailyWage: 5625,
        daysEmployed: 16,
        trait: 'carefulHandler',
        morale: 100,
      },
      {
        id: 3,
        name: 'Emmanuel Eze',
        role: 'logisticsCaptain',
        level: 'master',
        xp: 420,
        dailyWage: 8250,
        daysEmployed: 42,
        trait: 'stamina',
        morale: 100,
      },
    ];

    const perks = calculateCrewPerks(crew);
    // Agronomist gives disease detection and treatment discount
    expect(perks.diseaseDetectionBoost).toBeGreaterThan(0.3);
    expect(perks.treatmentCostDiscount).toBeGreaterThan(0.2);

    // Master processor gives faster drying and clean rinse
    expect(perks.dryingSpeedMult).toBeGreaterThan(1.2);
    expect(perks.cleanRinseBonus).toBe(true);

    // Logistics captain reduces breakdown chance
    expect(perks.breakdownChanceMult).toBeLessThan(0.6);
    expect(perks.roadTransitDaysReduction).toBeGreaterThanOrEqual(1);

    // Stamina trait grants extra energy
    expect(perks.extraEnergy).toBe(2);
  });

  it('progresses worker experience daily and promotes rookies to experienced and master', () => {
    let s = initialState(42);
    s.cash = 500_000;

    // Create a worker close to promotion
    const worker: WorkerProfile = {
      id: 99,
      name: 'Ibrahim Danladi',
      role: 'tillageSpecialist',
      level: 'rookie',
      xp: 145, // 5 XP shy of 150 (Experienced requirement)
      dailyWage: 3750,
      daysEmployed: 14,
      trait: 'stamina',
      morale: 100,
    };
    s.crew = [worker];
    s.workers = 1;

    // Advance 1 day: gains +10 XP -> 155 XP -> promotes to experienced!
    s = advanceDay(s);
    expect(s.crew[0].xp).toBe(155);
    expect(s.crew[0].daysEmployed).toBe(15);
    expect(s.crew[0].level).toBe('experienced');
    expect(s.crew[0].dailyWage).toBeGreaterThan(3750); // Wage adjusted for experienced level

    // Manually push XP to 395 (close to Master at 400 XP)
    s.crew[0].xp = 395;
    s = advanceDay(s);
    expect(s.crew[0].level).toBe('master');
    expect(s.crew[0].xp).toBe(405);
  });

  it('calculates total payroll and daily fixed costs using actual specialist wages', () => {
    let s = initialState(42);
    s.crew = [
      {
        id: 1,
        name: 'Amina',
        role: 'general',
        level: 'rookie',
        xp: 0,
        dailyWage: 3000,
        daysEmployed: 0,
        trait: 'stamina',
        morale: 100,
      },
      {
        id: 2,
        name: 'Chinedu',
        role: 'masterProcessor',
        level: 'experienced',
        xp: 200,
        dailyWage: 5500,
        daysEmployed: 20,
        trait: 'carefulHandler',
        morale: 100,
      },
    ];
    s.workers = 2;

    expect(totalWages(s)).toBe(8500);
    expect(dailyFixedCosts(s)).toBeGreaterThanOrEqual(8500);
  });

  it('maintains backwards compatibility for generic hireWorker and dismissWorker', () => {
    let s = initialState(42);
    s.cash = 100_000;

    // Standard hire
    s = hireWorker(s);
    expect(s.workers).toBe(1);
    expect(s.crew.length).toBe(1);

    // Standard dismiss
    s = dismissWorker(s);
    expect(s.workers).toBe(0);
    expect(s.crew.length).toBe(0);
  });
});
