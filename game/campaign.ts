import { CAMPAIGN, CAMPAIGN_END } from './missions';
import { campaignContract, eligibleKg } from './contracts';
import { exportReadyKg } from './quality';
import { addXp, log, money } from './state';
import type { GameState, Mission, NpcId } from './types';

export function initialMissions(): Mission[] {
  return CAMPAIGN.map(m => ({ ...m, progress: 0, complete: false }));
}

export const currentMission = (s: GameState) => s.missions.find(m => !m.complete) ?? null;

/** Missions measured from a running total count from when they started; the rest read current state. */
const RELATIVE = new Set(['land', 'harvest', 'offer', 'drying', 'buyer']);

function measure(s: GameState, id: string): number {
  switch (id) {
    case 'land': return s.flags.talked.baba;
    case 'plant': return s.plots.filter(p => p.status === 'growing' || p.status === 'ready').length;
    case 'storm': return s.flags.stormOutcome ? 1 : 0;
    case 'harvest': return s.stats.harvestedKg;
    case 'offer': return s.stats.freshSoldKg + s.stats.processedKg;
    case 'drying': return s.stats.safeDriedKg;
    case 'facility': return s.upgrades.mill || s.upgrades.solarDryer ? 1 : 0;
    case 'buyer': return s.flags.talked.amaka;
    case 'lot': { const c = s.contracts.find(x => x.campaign && x.status === 'active'); return c ? eligibleKg(s, c) : exportReadyKg(s); }
    case 'ship': return s.contracts.some(x => x.campaign && x.status !== 'active' && x.status !== 'offered' && x.status !== 'failed') ? 1 : 0;
    default: return 0;
  }
}

function startMission(s: GameState, m: Mission): GameState {
  const index = s.missions.indexOf(m);
  let next: GameState = { ...s, missionBase: measure(s, m.id), story: { speaker: m.npc, title: `Mission ${index + 1}: ${m.title}`, text: m.intro } };
  if (m.id === 'storm') {
    // Schedule a real storm three days out and make sure the forecast shows it.
    const weatherQueue = [...next.weatherQueue];
    weatherQueue[2] = 'storm';
    const forecast = next.forecast.map((f, i) => (i === 2 ? { ...f, weather: 'storm' as const, confidence: 0.9 } : f));
    next = { ...next, weatherQueue, forecast, flags: { ...next.flags, stormDay: next.day + 3, stormOutcome: null } };
  }
  return next;
}

function completeMission(s: GameState, m: Mission): GameState {
  let reward = m.reward;
  const lines: { text: string; severity: 'good' | 'warning' }[] = [];
  let flags = s.flags;
  if (m.id === 'storm' && s.flags.stormOutcome === 'exposed') {
    reward = 15_000;
    lines.push({ text: 'The storm hit an unprotected crop. Lesson: act on the forecast before the weather arrives.', severity: 'warning' });
  }
  let extra: Partial<GameState> = {};
  if (m.id === 'buyer') {
    flags = { ...flags, exportUnlocked: true };
    // Amaka's introduction becomes a real, signed contract on the Trade board.
    extra = { contracts: [...s.contracts, campaignContract(s)], nextId: s.nextId + 1 };
  }
  lines.unshift({ text: `Mission complete: ${m.title}${reward ? ` (+${money(reward)})` : ''}.`, severity: 'good' });
  const missions = s.missions.map(x => (x.id === m.id ? { ...x, progress: x.target, complete: true } : x));
  const next = addXp({ ...s, ...extra, missions, flags, cash: s.cash + reward, reputation: s.reputation + 2, toast: `Mission complete: ${m.title}${reward ? ` · +${money(reward)}` : ''}` }, 60);
  return log(next, ...lines);
}

/**
 * Re-measures the active mission against the game state; completes it and starts the next one when done.
 * Call after every player action and every day tick.
 */
export function checkCampaign(s: GameState): GameState {
  let st = s;
  for (let guard = 0; guard < CAMPAIGN.length; guard++) {
    const m = currentMission(st);
    if (!m) return st;
    const raw = measure(st, m.id);
    const progress = Math.max(0, Math.min(m.target, RELATIVE.has(m.id) ? raw - st.missionBase : raw));
    if (progress < m.target) {
      return progress === m.progress ? st : { ...st, missions: st.missions.map(x => (x.id === m.id ? { ...x, progress } : x)) };
    }
    st = completeMission(st, m);
    const next = currentMission(st);
    st = next ? startMission(st, next) : { ...st, story: { speaker: null, ...CAMPAIGN_END } };
  }
  return st;
}

/** Talking to someone is an action the campaign can measure. */
export function talkTo(s: GameState, id: NpcId): GameState {
  return checkCampaign({ ...s, flags: { ...s.flags, talked: { ...s.flags.talked, [id]: s.flags.talked[id] + 1 } } });
}

/** Called by the day tick when the scheduled campaign storm arrives: was the farm ready for it? */
export function judgeStorm(s: GameState): GameState {
  if (currentMission(s)?.id !== 'storm' || s.flags.stormDay === null || s.day < s.flags.stormDay) return s;
  const lowBeds = s.plots.filter(p => p.z >= 2 && (p.status === 'growing' || p.status === 'ready'));
  const protectedFarm = s.upgrades.insurance || lowBeds.every(p => p.ridged);
  return { ...s, flags: { ...s.flags, stormDay: null, stormOutcome: protectedFarm ? 'protected' : 'exposed' } };
}

export const dismissStory = (s: GameState): GameState => ({ ...s, story: null });
