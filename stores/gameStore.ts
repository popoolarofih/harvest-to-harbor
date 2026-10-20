'use client';
import { create } from 'zustand';
import { restoreGame, type SaveFile, type SaveMeta } from '../game/save';
import * as sim from '../game/simulation';
import { TUTORIAL_START, signalsBetween, skipStep, stepTutorial, type TutorialProgress } from '../game/tutorial';
import type { AutomationSettings, CompoundSiteId, CropType, GameState, Haulage, Packaging, PrepChoices, PrepMethod, SeedTier } from '../game/types';
import { playAction } from '../lib/audio';

export type Panel = 'farm' | 'storage' | 'market' | 'trade' | 'business' | 'journal';
export type StationId = 'tank' | 'shed' | 'warehouse' | 'office' | 'truck' | 'signboard';
/** Something in the world the player can walk up to and use. */
export type Target = { kind: 'plot'; id: number } | { kind: 'station'; id: StationId } | { kind: 'npc'; id: sim.NpcId };
/** A short-lived visual cue for the 3D scene (splash, pump jet, harvest...). */
export interface Fx { kind: 'water' | 'fertilize' | 'treat' | 'harvest' | 'pump' | 'prepare' | 'plant' | 'inspect' | 'process' | 'grind' | 'ship'; plot?: number; at: number }

interface UiState {
  selectedPlot: number | null;
  /** Day number of the morning report the player has dismissed. */
  reportSeenDay: number;
  panel: Panel;
  nearby: Target | null;
  talkingTo: sim.NpcId | null;
  tankOpen: boolean;
  fx: Fx | null;
  /** Saved with the game (see game/save.ts) so an unfinished tutorial resumes after a reload. */
  tutorial: TutorialProgress;
  customizingProfile: boolean;
  /** Which farm the player is standing on: undefined = the home farm. Not saved; a reload starts at home. */
  site: CompoundSiteId | undefined;
}

interface Actions {
  select: (id: number | null) => void;
  prepare: (id: number, method: PrepMethod) => void;
  plant: (id: number, seed?: SeedTier, crop?: CropType) => void;
  applyCompost: (id: number) => void;
  greenManure: (id: number) => void;
  irrigate: (id: number) => void;
  fertilize: (id: number) => void;
  inspect: (id: number) => void;
  treat: (id: number) => void;
  gapFill: (id: number) => void;
  harvest: (id: number) => void;
  advance: () => void;
  sell: (batchId: number, buyerId: string) => void;
  process: (batchId: number, choices: PrepChoices) => void;
  cover: (jobId: number) => void;
  bag: (jobId: number, packaging: Packaging) => void;
  grind: (batchId: number, packaging: Packaging) => void;
  accept: (contractId: number) => void;
  decline: (contractId: number) => void;
  dispatch: (contractId: number, haulage: Haulage, insured: boolean) => void;
  borrow: (index: number) => void;
  repay: (loanId: number) => void;
  financeUpgrade: (id: sim.UpgradeId) => void;
  dismissLevelUp: () => void;
  dismissStory: () => void;
  inspectBatch: (batchId: number) => void;
  pump: () => void;
  hire: () => void;
  hireCandidate: (candidateId: number) => void;
  dismiss: () => void;
  dismissWorkerById: (workerId: number) => void;
  upgrade: (id: sim.UpgradeId) => void;
  toggleInsurance: () => void;
  configureAutomation: (patch: Partial<AutomationSettings>) => void;
  repairIrrigation: () => void;
  dismissReport: () => void;
  clearInspection: () => void;
  clearToast: () => void;
  /** Replaces the whole game with a fresh season on a new random seed. */
  reset: () => void;
  /** Resumes a saved game. */
  loadGame: (save: SaveFile) => void;
  skipTutorial: () => void;
  skipTutorialStep: () => void;
  replayTutorial: () => void;
  openPanel: (panel: Panel) => void;
  setNearby: (t: Target | null) => void;
  /** Use whatever the target is: open the plot panel, a building's panel, or talk to an NPC. */
  interact: (t: Target) => void;
  closeOverlays: () => void;
  openProfile: () => void;
  closeProfile: () => void;
  updateProfile: (patch: Partial<sim.PlayerProfile>) => void;
  buyInput: (item: sim.InputItem, quantity: number) => void;
  executeBulk: (kind: sim.BulkActionKind, options?: sim.BulkOptions, allowPartial?: boolean) => void;
  reserveContract: (contractId: number) => void;
  releaseReservation: (contractId: number, batchId?: number) => void;
  enterSandbox: () => void;
  respondCoop: (eventId: string, choice: 'accept' | 'decline') => void;
  buyCompound: (site: CompoundSiteId) => void;
  leaseCompound: (site: CompoundSiteId) => void;
  /** Repack what's needed and load the truck for a contract in one click. */
  quickShip: (contractId: number) => void;
  /** Go to another farm you own (undefined = home). */
  travel: (site: CompoundSiteId | undefined) => void;
}

export type Store = GameState & UiState & Actions;

/** The simulation's own fields: everything a save restores. */
export const GAME_KEYS = Object.keys(sim.initialState()) as (keyof GameState)[];
export const gameOf = (s: Store): GameState => Object.fromEntries(GAME_KEYS.map(k => [k, s[k]])) as unknown as GameState;
export const metaOf = (s: Store): SaveMeta => ({ reportSeenDay: s.reportSeenDay, tutorial: s.tutorial });

/** UI state for a game that is just starting or resuming: nothing open, nothing selected. */
const freshUi = () => ({ selectedPlot: null, panel: 'farm' as Panel, nearby: null, talkingTo: null, tankOpen: false, fx: null, customizingProfile: false, site: undefined });

const sameTarget = (a: Target | null, b: Target | null) => a?.kind === b?.kind && a?.id === b?.id;

export const useGameStore = create<Store>((set, get) => {
  // Every action is followed by a campaign check, so missions react to whatever the player just did.
  const apply = (fn: (s: GameState) => GameState) => set(s => sim.checkCampaign(fn(s)));
  /** Applies an action and emits an fx cue only if it actually did something (energy or cash changed). */
  const act = (kind: Fx['kind'], fn: (s: GameState) => GameState, plot?: number) => set(s => {
    const next = sim.checkCampaign(fn(s));
    const changed = next.energy !== s.energy || next.cash !== s.cash || next.water !== s.water;
    if (changed) playAction(kind);
    return changed ? { ...next, fx: { kind, plot, at: performance.now() } } : next;
  });
  return {
    ...sim.initialState(),
    ...freshUi(),
    reportSeenDay: 1,
    tutorial: TUTORIAL_START,
    select: id => set({ selectedPlot: id, talkingTo: null, tankOpen: false }),
    prepare: (id, method) => act('prepare', s => sim.preparePlot(s, id, method), id),
    plant: (id, seed, crop) => act('plant', s => sim.plantPlot(s, id, seed, crop), id),
    applyCompost: id => act('fertilize', s => sim.applyCompost(s, id), id),
    greenManure: id => act('harvest', s => sim.greenManurePlot(s, id), id),
    irrigate: id => act('water', s => sim.waterPlot(s, id), id),
    fertilize: id => act('fertilize', s => sim.fertilizePlot(s, id), id),
    inspect: id => act('inspect', s => sim.inspectPlot(s, id), id),
    treat: id => act('treat', s => sim.treatPlot(s, id), id),
    gapFill: id => act('plant', s => sim.gapFillPlot(s, id), id),
    harvest: id => act('harvest', s => sim.harvestPlot(s, id), id),
    advance: () => apply(sim.advanceDay),
    sell: (batchId, buyerId) => apply(s => sim.sellBatch(s, batchId, buyerId)),
    process: (batchId, choices) => act('process', s => sim.startProcessing(s, batchId, choices)),
    cover: jobId => apply(s => sim.toggleCover(s, jobId)),
    bag: (jobId, packaging) => apply(s => sim.finishDrying(s, jobId, packaging)),
    grind: (batchId, packaging) => act('grind', s => sim.grindBatch(s, batchId, packaging)),
    accept: id => apply(s => sim.acceptContract(s, id)),
    decline: id => apply(s => sim.declineContract(s, id)),
    dispatch: (id, haulage, insured) => act('ship', s => sim.dispatchContract(s, id, haulage, insured)),
    borrow: index => apply(s => sim.takeLoan(s, index)),
    repay: id => apply(s => sim.repayLoan(s, id)),
    financeUpgrade: id => apply(s => sim.financeUpgrade(s, id)),
    dismissLevelUp: () => set({ levelUp: null }),
    dismissStory: () => set({ story: null }),
    inspectBatch: batchId => apply(s => sim.inspectBatch(s, batchId)),
    pump: () => act('pump', sim.pumpWater),
    hire: () => apply(sim.hireWorker),
    hireCandidate: candidateId => apply(s => sim.hireCandidate(s, candidateId)),
    dismiss: () => apply(sim.dismissWorker),
    dismissWorkerById: workerId => apply(s => sim.dismissWorkerById(s, workerId)),
    upgrade: id => apply(s => sim.buyUpgrade(s, id)),
    toggleInsurance: () => apply(sim.toggleInsurance),
    configureAutomation: patch => set(s => ({ automation: { ...s.automation, ...patch } })),
    repairIrrigation: () => apply(sim.repairIrrigation),
    dismissReport: () => set(s => ({ reportSeenDay: s.day })),
    clearInspection: () => set({ lastInspection: null }),
    clearToast: () => set({ toast: '' }),
    reset: () => set({ ...sim.initialState(Date.now() >>> 0), ...freshUi(), reportSeenDay: 1, tutorial: { ...TUTORIAL_START } }),
    loadGame: save => set({ ...restoreGame(save), ...freshUi(), ...save.meta, toast: `Welcome back. Day ${save.game.day}.` }),
    skipTutorial: () => set(s => (s.tutorial.status === 'active' ? { tutorial: { ...s.tutorial, status: 'skipped' } } : {})),
    skipTutorialStep: () => set(s => ({ tutorial: skipStep(s.tutorial, s.plots) })),
    replayTutorial: () => set(s => ({ tutorial: stepTutorial(TUTORIAL_START, [], s.plots), panel: 'farm' })),
    openPanel: panel => set({ panel }),
    openProfile: () => set({ customizingProfile: true }),
    closeProfile: () => set({ customizingProfile: false }),
    updateProfile: patch => apply(s => sim.updateProfile(s, patch)),
    buyInput: (item, quantity) => apply(s => sim.buyInputStock(s, item, quantity)),
    executeBulk: (kind, options, allowPartial) => apply(s => sim.executeBulk(s, kind, options, allowPartial, s.opSeq)),
    reserveContract: contractId => apply(s => sim.reserveStock(s, contractId)),
    releaseReservation: (contractId, batchId) => apply(s => sim.releaseReservation(s, contractId, batchId)),
    enterSandbox: () => apply(sim.enterSandboxMode),
    respondCoop: (eventId, choice) => apply(s => sim.respondToCooperativeEvent(s, eventId, choice)),
    buyCompound: site => apply(s => sim.buyCompound(s, site)),
    leaseCompound: site => apply(s => sim.leaseCompoundLand(s, site)),
    quickShip: contractId => act('ship', s => sim.quickShip(s, contractId)),
    travel: site => set(s => {
      if (site && !(s.compounds ?? []).some(c => c.site === site)) return {};
      const name = site ? sim.compoundSite(site).name : s.profile.farmName;
      return { site, selectedPlot: null, talkingTo: null, tankOpen: false, nearby: null, panel: 'farm', toast: `Arrived at ${name}.` };
    }),
    // Called every frame by the player: only touch the store when the target actually changes,
    // otherwise every subscriber (the whole HUD) would re-render at 60 fps.
    setNearby: t => { if (!sameTarget(get().nearby, t)) set({ nearby: t }); },
    interact: t => set(() => {
      const closed = { selectedPlot: null, talkingTo: null, tankOpen: false, customizingProfile: false };
      if (t.kind === 'plot') return { ...closed, selectedPlot: t.id };
      if (t.kind === 'npc') return { ...sim.talkTo(get(), t.id), ...closed, talkingTo: t.id };
      if (t.id === 'tank') return { ...closed, tankOpen: true };
      if (t.id === 'signboard') return { ...closed, customizingProfile: true };
      const panel: Record<Exclude<StationId, 'tank' | 'signboard'>, Panel> = { shed: 'storage', warehouse: 'storage', office: 'business', truck: 'trade' };
      return { ...closed, panel: panel[t.id] };
    }),
    closeOverlays: () => set({ selectedPlot: null, talkingTo: null, tankOpen: false, panel: 'farm', lastInspection: null, story: null, customizingProfile: false }),
  };
});

// The tutorial watches real store transitions (successful actions, day ticks, panels) and advances itself.
useGameStore.subscribe((s, prev) => {
  // Loading, resetting or replaying replaces the tutorial object: that jump (e.g. day 1 → day 30) isn't a player action.
  if (s.tutorial.status !== 'active' || s.tutorial !== prev.tutorial) return;
  const next = stepTutorial(s.tutorial, signalsBetween(prev, s), s.plots);
  if (next === s.tutorial) return;
  useGameStore.setState(next.status === 'done' ? { tutorial: next, toast: 'Tutorial complete. Replay it any time from the Journal.' } : { tutorial: next });
});

// Dev-only handle for debugging and scripted playtests in the browser console.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __h2h: typeof useGameStore }).__h2h = useGameStore;
