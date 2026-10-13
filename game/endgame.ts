import { recordLedgerEntry } from './ledger';
import { calculateInventoryValuation } from './ledger';
import { totalDebt } from './finance';
import type { GameState, PrestigeCategory, PrestigeRecord, Product, RecurringGoal, CooperativeEvent } from './types';
import type { Rng } from './rng';
import type { LogLine } from './types';
import { money } from './state';

export interface PrestigeDefinition {
  id: string;
  title: string;
  category: PrestigeCategory;
  description: string;
  badge: string;
  check: (s: GameState) => boolean;
}

export const PRESTIGE_DEFINITIONS: PrestigeDefinition[] = [
  {
    id: 'top_exporter',
    title: 'Top Kaduna Exporter',
    category: 'export',
    description: 'Exported at least 1,500 kg of certified cargo to overseas ports.',
    badge: '🌍',
    check: s => (s.stats?.exportedKg ?? 0) >= 1_500,
  },
  {
    id: 'export_value',
    title: 'Commercial Pioneer',
    category: 'finance',
    description: 'Generated over ₦1,000,000 in net export and value-added sales.',
    badge: '💰',
    check: s => {
      const exportRev = s.ledger?.filter(t => t.category === 'exportSales').reduce((sum, t) => sum + t.amount, 0) ?? 0;
      return exportRev >= 1_000_000;
    },
  },
  {
    id: 'quality_master',
    title: 'Purity Excellence',
    category: 'quality',
    description: 'Delivered premium export lots with authoritative quality score of 90 or above.',
    badge: '🌟',
    check: s => s.shipments?.some(sh => sh.grade === 'A' && (sh.stage === 'delivered' || sh.stage === 'paid')),
  },
  {
    id: 'loss_prevention',
    title: 'Zero Spoilage Champion',
    category: 'agronomy',
    description: 'Safely sun-dried or solar-dried at least 500 kg down to 12% safe moisture.',
    badge: '☀️',
    check: s => (s.stats?.safeDriedKg ?? 0) >= 500,
  },
  {
    id: 'sustainable_pioneer',
    title: 'Regenerative Pioneer',
    category: 'agronomy',
    description: 'Integrated nitrogen-fixing soybean rotation or green manure into field soil.',
    badge: '🌱',
    check: s => s.plots?.some(p => p.cropHistory?.some(h => h.crop === 'soybean')),
  },
  {
    id: 'financial_prudence',
    title: 'Debt-Free Agribusiness Tycoon',
    category: 'finance',
    description: 'Accumulated over ₦1,500,000 in cash and inventory with zero outstanding debt across a full season.',
    badge: '🏦',
    check: s => (s.day >= 30 || !!s.sandboxMode) && totalDebt(s) === 0 && (s.cash + calculateInventoryValuation(s)) >= 1_500_000,
  },
  {
    id: 'community_pillar',
    title: 'Kafanchan Community Pillar',
    category: 'community',
    description: 'Successfully contributed to local village cooperatives and farmer solidarity.',
    badge: '🤝',
    check: s => (s.cooperativeEvents?.filter(e => e.status === 'accepted').length ?? 0) >= 2,
  },
];

/**
 * Checks all prestige milestones against current game state and unlocks new ones idempotently.
 */
export function checkPrestigeAchievements(s: GameState): GameState {
  const current = s.prestige ?? [];
  const existingIds = new Set(current.map(p => p.id));
  const newUnlocks: PrestigeRecord[] = [];

  for (const def of PRESTIGE_DEFINITIONS) {
    if (!existingIds.has(def.id) && def.check(s)) {
      newUnlocks.push({
        id: def.id,
        title: def.title,
        category: def.category,
        description: def.description,
        unlockedDay: s.day,
        badge: def.badge,
      });
    }
  }

  if (newUnlocks.length === 0) return s;

  const updatedPrestige = [...current, ...newUnlocks];
  const firstBadge = newUnlocks[0];
  const toastMsg = `🏆 Prestige Unlocked: ${firstBadge.title}!`;
  const logEntries = newUnlocks.map(u => ({
    day: s.day,
    text: `🏆 Agribusiness Prestige Awarded: "${u.title}" — ${u.description}`,
    severity: 'good' as const,
  }));

  return {
    ...s,
    prestige: updatedPrestige,
    reputation: s.reputation + newUnlocks.length * 3,
    toast: toastMsg,
    log: [...s.log, ...logEntries],
  };
}

/**
 * Generates recurring seasonal export goals for post-campaign or high-level farmers.
 */
export function generateRecurringExportGoals(s: GameState): RecurringGoal[] {
  const season = Math.floor((s.day - 1) / 30) + 1;
  const existing = s.recurringGoals ?? [];
  // Keep active goals that haven't expired
  const active = existing.filter(g => !g.completed && g.deadlineDay >= s.day);
  if (active.length >= 2) return existing;

  const seasonEnd = season * 30 + 10;
  const newGoals: RecurringGoal[] = [
    {
      id: `goal-s${season}-dried-${s.nextId}`,
      season,
      title: 'European Spice Consortium: Dried Lot',
      description: 'Export 500 kg of Grade A dried ginger (<= 12% moisture) to Rotterdam.',
      targetKg: 500,
      product: 'dried',
      minQuality: 80,
      buyer: 'Rotterdam Botanical Traders',
      deadlineDay: seasonEnd,
      rewardMoney: 220_000,
      rewardReputation: 4,
      progressKg: 0,
      completed: false,
    },
    {
      id: `goal-s${season}-powder-${s.nextId + 1}`,
      season,
      title: 'Gulf Essential Mills: Ultra-Fine Powder',
      description: 'Export 350 kg of sealed ginger powder for middle-eastern confectionery.',
      targetKg: 350,
      product: 'powder',
      minQuality: 80,
      buyer: 'Dubai Spice & Extracts',
      deadlineDay: seasonEnd + 5,
      rewardMoney: 260_000,
      rewardReputation: 5,
      progressKg: 0,
      completed: false,
    },
  ];

  return [...active, ...newGoals];
}

/**
 * Records progress towards active export goals when cargo is dispatched or delivered.
 */
export function recordGoalProgress(
  s: GameState,
  product: Product,
  kg: number,
  quality: number
): GameState {
  if (!s.recurringGoals || s.recurringGoals.length === 0) return s;

  let state = s;
  let anyCompleted = false;

  const updatedGoals = (state.recurringGoals ?? []).map(g => {
    if (g.completed || g.product !== product || quality < g.minQuality) {
      return g;
    }

    const newProgress = Math.min(g.targetKg, g.progressKg + kg);
    const nowDone = newProgress >= g.targetKg;

    if (nowDone && !g.completed) {
      anyCompleted = true;
      // Award goal rewards
      state = {
        ...state,
        cash: state.cash + g.rewardMoney,
        reputation: state.reputation + g.rewardReputation,
        toast: `🎯 Goal Fulfilled: ${g.title} (+${money(g.rewardMoney)})!`,
      };
      state = recordLedgerEntry(state, {
        id: `goal-reward-${g.id}`,
        day: state.day,
        category: 'exportSales',
        amount: g.rewardMoney,
        description: `Export objective completion bonus: ${g.title}`,
      });
    }

    return {
      ...g,
      progressKg: newProgress,
      completed: nowDone,
    };
  });

  return {
    ...state,
    recurringGoals: updatedGoals,
  };
}

/**
 * Generates local village cooperative solidarity events.
 */
export function generateCooperativeEvents(s: GameState, rng: Rng): CooperativeEvent[] {
  const existing = s.cooperativeEvents ?? [];
  const active = existing.filter(e => e.status === 'pending' && e.expiresDay >= s.day);
  if (active.length > 0) return existing;

  const events: CooperativeEvent[] = [];

  // Heatwave or low rainfall triggers water-sharing request from neighboring farmers
  if (s.weather === 'heatwave' || s.weather === 'sunny') {
    events.push({
      id: `coop-water-d${s.day}`,
      type: 'water_sharing',
      title: 'Village Water-Sharing Request',
      description: 'Neighboring ginger farmers along the ridge face dried boreholes in this heat. They appeal to your farm to share 1,500 L from your overhead tank.',
      costLabel: '1,500 Litres of Water',
      benefitLabel: '+5 Community Reputation & Goodwill',
      waterCost: 1_500,
      expiresDay: s.day + 2,
      status: 'pending',
    });
  } else {
    // Road repair cooperative event
    events.push({
      id: `coop-road-d${s.day}`,
      type: 'road_repair',
      title: 'Kafanchan Road-Grading Cooperative',
      description: 'The local haulage union is grading the flood-damaged Kafanchan-Kagoro road. Contributing ₦35,000 ensures smooth passage and reduces transit breakdown risks for 14 days.',
      costLabel: '₦35,000 Maintenance Contribution',
      benefitLabel: '60% Fewer Haulage Breakdowns (14 Days) & +3 Rep',
      cashCost: 35_000,
      expiresDay: s.day + 3,
      status: 'pending',
    });
  }

  return [...existing, ...events];
}

/**
 * Handles responding to a village cooperative event.
 */
export function respondToCooperativeEvent(
  s: GameState,
  eventId: string,
  choice: 'accept' | 'decline'
): GameState {
  const events = s.cooperativeEvents ?? [];
  const event = events.find(e => e.id === eventId);
  if (!event || event.status !== 'pending') return s;

  if (choice === 'decline') {
    return {
      ...s,
      cooperativeEvents: events.map(e => e.id === eventId ? { ...e, status: 'declined' } : e),
      log: [...s.log, { day: s.day, text: `Declined community request: ${event.title}.`, severity: 'info' }],
    };
  }

  // Acceptance logic
  let next = s;
  if (event.type === 'water_sharing') {
    const cost = event.waterCost ?? 1_500;
    if (next.water < cost) {
      return { ...next, toast: `Insufficient water: need ${cost.toLocaleString()} L in tank!` };
    }
    next = {
      ...next,
      water: next.water - cost,
      reputation: next.reputation + 5,
      toast: `Shared ${cost.toLocaleString()} L water with neighboring farms (+5 Reputation)!`,
      log: [...next.log, { day: next.day, text: `🤝 Community solidarity: Shared ${cost.toLocaleString()} L of tank water with neighbors during dry spell (+5 Rep).`, severity: 'good' }],
    };
  } else if (event.type === 'road_repair') {
    const cost = event.cashCost ?? 35_000;
    if (next.cash < cost) {
      return { ...next, toast: `Insufficient cash: need ₦${cost.toLocaleString()} to contribute!` };
    }
    next = {
      ...next,
      cash: next.cash - cost,
      reputation: next.reputation + 3,
      coopRoadBenefitDays: Math.max(next.coopRoadBenefitDays ?? 0, 14),
      toast: `Contributed ₦${cost.toLocaleString()} to road grading! Road transport risk reduced for 14 days.`,
      log: [...next.log, { day: next.day, text: `🤝 Road Cooperative: Contributed ₦${cost.toLocaleString()} to road maintenance. Haulage breakdown risk reduced by 60% for 14 days (+3 Rep).`, severity: 'good' }],
    };
    next = recordLedgerEntry(next, {
      id: `coop-road-${event.id}`,
      day: next.day,
      category: 'equipmentMaintenance',
      amount: cost,
      description: 'Village road-grading cooperative solidarity pool',
    });
  }

  const updatedEvents = events.map(e => e.id === eventId ? { ...e, status: 'accepted' as const } : e);
  next = { ...next, cooperativeEvents: updatedEvents };
  return checkPrestigeAchievements(next);
}

/**
 * Transitions the farm into the open-ended Agribusiness Sandbox mode post-campaign.
 * Retains all farm land, crops, machinery, crew, ledger, contracts, and progression.
 */
export function enterSandboxMode(s: GameState): GameState {
  let next: GameState = {
    ...s,
    sandboxMode: true,
    story: {
      speaker: null,
      title: 'Agribusiness Sandbox Unlocked',
      text: 'Congratulations on completing Farm to Fortune! Your Kafanchan estate is now an established commercial enterprise. You can continue expanding without limits: take on recurring export contracts, achieve Agribusiness Prestige, and support village cooperatives.',
    },
    toast: 'Welcome to the Agribusiness Sandbox! Endless growth unlocked.',
    log: [
      ...s.log,
      { day: s.day, text: '🏆 Farm to Fortune complete: Entered open-ended Agribusiness Sandbox mode!', severity: 'good' },
    ],
  };

  next = {
    ...next,
    recurringGoals: generateRecurringExportGoals(next),
  };
  return checkPrestigeAchievements(next);
}

/**
 * Daily tick for endgame systems: ticks cooperative benefit timers, generates events, and rechecks prestige.
 */
export function tickEndgame(s: GameState, rng: Rng, lines: LogLine[]): GameState {
  let st = s;

  // Tick road benefit days
  if ((st.coopRoadBenefitDays ?? 0) > 0) {
    const remaining = (st.coopRoadBenefitDays ?? 0) - 1;
    st = { ...st, coopRoadBenefitDays: remaining };
    if (remaining === 0) {
      lines.push({ text: 'Village road maintenance benefit has expired; roads returning to baseline condition.', severity: 'info' });
    }
  }

  // Periodically generate village cooperative events
  if ((s.day % 7 === 0 || s.weather === 'heatwave') && (!st.cooperativeEvents || st.cooperativeEvents.every(e => e.status !== 'pending'))) {
    st = {
      ...st,
      cooperativeEvents: generateCooperativeEvents(st, rng),
    };
  }

  // Generate recurring goals if in sandbox or post-level-6 and goals are low
  if (st.sandboxMode || st.level >= 6) {
    if (!st.recurringGoals || st.recurringGoals.filter(g => !g.completed && g.deadlineDay >= st.day).length === 0) {
      st = {
        ...st,
        recurringGoals: generateRecurringExportGoals(st),
      };
    }
  }

  // Re-evaluate prestige
  return checkPrestigeAchievements(st);
}
