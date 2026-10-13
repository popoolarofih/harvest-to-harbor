import { describe, expect, it } from 'vitest';
import { initialState } from './state';
import {
  enterSandboxMode,
  checkPrestigeAchievements,
  generateRecurringExportGoals,
  recordGoalProgress,
  generateCooperativeEvents,
  respondToCooperativeEvent,
  tickEndgame,
  PRESTIGE_DEFINITIONS,
} from './endgame';
import { createRng } from './rng';
import { parseSave, serializeSave } from './save';
import { recordLedgerEntry } from './ledger';
import { view, setCameraMode, toggleCameraMode } from '../components/world/playerState';

describe('Phase 11: 3D Camera Modes and Visual Systems', () => {
  it('supports seamless inspection camera mode toggling and focus retention', () => {
    setCameraMode('follow');
    expect(view.mode).toBe('follow');

    toggleCameraMode();
    expect(view.mode).toBe('inspect');

    // Toggling again returns to follow
    toggleCameraMode();
    expect(view.mode).toBe('follow');

    // Explicit setting
    setCameraMode('inspect');
    expect(view.mode).toBe('inspect');
    setCameraMode('follow');
    expect(view.mode).toBe('follow');
  });
});

describe('Phase 12: Endgame Sandbox, Prestige and Village Cooperatives', () => {
  it('transitions into sandbox mode retaining all farm land, assets, and history', () => {
    let s = initialState(42);
    s.cash = 450_000;
    s.reputation = 25;
    s.upgrades.mill = true;
    s.upgrades.solarDryer = true;
    s.workers = 4;
    s.stats.exportedKg = 1_200;

    // Complete all missions
    s.missions = s.missions.map(m => ({ ...m, complete: true, progress: m.target }));

    s = enterSandboxMode(s);

    expect(s.sandboxMode).toBe(true);
    expect(s.cash).toBe(450_000);
    expect(s.upgrades.mill).toBe(true);
    expect(s.upgrades.solarDryer).toBe(true);
    expect(s.workers).toBe(4);
    expect(s.recurringGoals).toBeDefined();
    expect(s.recurringGoals!.length).toBeGreaterThan(0);
    expect(s.story?.title).toContain('Sandbox');
  });

  it('generates balanced recurring seasonal export goals and tracks progress', () => {
    let s = initialState(42);
    s.day = 32; // Season 2
    s.recurringGoals = generateRecurringExportGoals(s);

    expect(s.recurringGoals.length).toBeGreaterThanOrEqual(2);
    const driedGoal = s.recurringGoals.find(g => g.product === 'dried')!;
    expect(driedGoal).toBeDefined();
    expect(driedGoal.targetKg).toBe(500);
    expect(driedGoal.completed).toBe(false);

    const initialCash = s.cash;

    // Record partial delivery (300 kg)
    s = recordGoalProgress(s, 'dried', 300, 85);
    const updated1 = s.recurringGoals?.find(g => g.id === driedGoal.id)!;
    expect(updated1.progressKg).toBe(300);
    expect(updated1.completed).toBe(false);
    expect(s.cash).toBe(initialCash); // Not fulfilled yet

    // Record second delivery exceeding target (250 kg more = 550 kg total)
    s = recordGoalProgress(s, 'dried', 250, 85);
    const updated2 = s.recurringGoals?.find(g => g.id === driedGoal.id)!;
    expect(updated2.progressKg).toBe(500); // Clamped to target
    expect(updated2.completed).toBe(true);
    expect(s.cash).toBe(initialCash + driedGoal.rewardMoney);

    // Goal ledger entry recorded
    const rewardTxn = s.ledger.find(t => t.id === `goal-reward-${driedGoal.id}`);
    expect(rewardTxn).toBeDefined();
    expect(rewardTxn?.amount).toBe(driedGoal.rewardMoney);

    // Further deliveries to already completed goal do NOT award duplicate rewards
    const cashAfterFulfillment = s.cash;
    s = recordGoalProgress(s, 'dried', 200, 85);
    expect(s.cash).toBe(cashAfterFulfillment);
  });

  it('evaluates and awards prestige achievements idempotently', () => {
    let s = initialState(42);
    expect(s.prestige).toEqual([]);

    // 1. Top Exporter: requires 1,500 kg exported
    s.stats.exportedKg = 1_600;
    s = checkPrestigeAchievements(s);
    expect(s.prestige?.some(p => p.id === 'top_exporter')).toBe(true);
    const countAfterFirst = s.prestige?.length ?? 0;

    // Running again does NOT duplicate
    s = checkPrestigeAchievements(s);
    expect(s.prestige?.length).toBe(countAfterFirst);

    // 2. Sustainable Pioneer: requires soybean in plot cropHistory
    s.plots[0].cropHistory = [{ season: 1, crop: 'soybean', harvestDay: 1, yieldKg: 400, fertilityChange: 20, organicMatterChange: 10 }];
    s = checkPrestigeAchievements(s);
    expect(s.prestige?.some(p => p.id === 'sustainable_pioneer')).toBe(true);

    // 3. Export value: requires >= ₦1,000,000 in export sales ledger
    s = recordLedgerEntry(s, {
      id: 'big-export-test',
      day: s.day,
      category: 'exportSales',
      amount: 1_250_000,
      description: 'Major Rotterdam export container settlement',
    });
    s = checkPrestigeAchievements(s);
    expect(s.prestige?.some(p => p.id === 'export_value')).toBe(true);
  });

  it('supports village cooperative water-sharing with actual tank consumption and reputation reward', () => {
    let s = initialState(42);
    s.water = 4_000;
    const initialRep = s.reputation;
    const rng = createRng(42);
    s.weather = 'heatwave';
    s.cooperativeEvents = generateCooperativeEvents(s, rng);

    const waterEvent = s.cooperativeEvents.find(e => e.type === 'water_sharing');
    expect(waterEvent).toBeDefined();

    // Accept water sharing
    s = respondToCooperativeEvent(s, waterEvent!.id, 'accept');
    expect(s.water).toBe(4_000 - 1_500);
    expect(s.reputation).toBe(initialRep + 5);
    expect(s.cooperativeEvents?.find(e => e.id === waterEvent!.id)?.status).toBe('accepted');
  });

  it('rejects water sharing if tank water is insufficient', () => {
    let s = initialState(42);
    s.water = 800; // Less than 1,500 L
    const rng = createRng(42);
    s.weather = 'heatwave';
    s.cooperativeEvents = generateCooperativeEvents(s, rng);

    const waterEvent = s.cooperativeEvents?.find(e => e.type === 'water_sharing')!;
    const beforeWater = s.water;
    s = respondToCooperativeEvent(s, waterEvent.id, 'accept');

    // Did not consume, stayed pending
    expect(s.water).toBe(beforeWater);
    expect(s.cooperativeEvents?.find(e => e.id === waterEvent.id)?.status).toBe('pending');
    expect(s.toast).toContain('Insufficient water');
  });

  it('supports road-maintenance cooperative funding with opex logging and transit benefit timer', () => {
    let s = initialState(42);
    s.cash = 100_000;
    const initialRep = s.reputation;
    const rng = createRng(42);
    s.weather = 'cloudy';
    s.cooperativeEvents = generateCooperativeEvents(s, rng);

    const roadEvent = s.cooperativeEvents?.find(e => e.type === 'road_repair')!;
    expect(roadEvent).toBeDefined();

    s = respondToCooperativeEvent(s, roadEvent.id, 'accept');
    expect(s.cash).toBe(100_000 - 35_000);
    expect(s.reputation).toBe(initialRep + 3);
    expect(s.coopRoadBenefitDays).toBe(14);
    expect(s.cooperativeEvents?.find(e => e.id === roadEvent.id)?.status).toBe('accepted');

    // Ledger entry recorded for maintenance
    const coopTxn = s.ledger.find(t => t.id === `coop-road-${roadEvent.id}`);
    expect(coopTxn).toBeDefined();
    expect(coopTxn?.amount).toBe(35_000);
    expect(coopTxn?.category).toBe('equipmentMaintenance');

    // Daily tick decrements benefit days
    const lines: any[] = [];
    s = tickEndgame(s, rng, lines);
    expect(s.coopRoadBenefitDays).toBe(13);
  });

  it('preserves sandbox mode, prestige records and cooperative events across save/restore cycles', () => {
    let s = initialState(42);
    s.sandboxMode = true;
    s.coopRoadBenefitDays = 12;
    s.prestige = [
      {
        id: 'top_exporter',
        title: 'Top Kaduna Exporter',
        category: 'export',
        description: 'Certified cargo',
        unlockedDay: 28,
        badge: '🌍',
      },
    ];
    s.recurringGoals = [
      {
        id: 'goal-test-1',
        season: 1,
        title: 'Export Lot Test',
        description: 'Test description',
        targetKg: 500,
        product: 'dried',
        minQuality: 80,
        buyer: 'London Spice',
        deadlineDay: 40,
        rewardMoney: 150_000,
        rewardReputation: 3,
        progressKg: 200,
        completed: false,
      },
    ];
    s.cooperativeEvents = [
      {
        id: 'coop-1',
        type: 'road_repair',
        title: 'Road test',
        description: 'Road test desc',
        costLabel: '₦35,000',
        benefitLabel: 'Benefit',
        cashCost: 35_000,
        expiresDay: 35,
        status: 'accepted',
      },
    ];

    const json = serializeSave(s, { reportSeenDay: 1, tutorial: { status: 'skipped', step: 0 } });
    const parsed = parseSave(json);

    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;

    const restored = parsed.save.game;
    expect(restored.sandboxMode).toBe(true);
    expect(restored.coopRoadBenefitDays).toBe(12);
    expect(restored.prestige?.length).toBe(1);
    expect(restored.prestige?.[0].id).toBe('top_exporter');
    expect(restored.recurringGoals?.length).toBe(1);
    expect(restored.recurringGoals?.[0].progressKg).toBe(200);
    expect(restored.cooperativeEvents?.length).toBe(1);
    expect(restored.cooperativeEvents?.[0].status).toBe('accepted');
  });
});
