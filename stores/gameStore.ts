'use client';
import { create } from 'zustand';
import * as sim from '../game/simulation';
import type { GameState, Haulage, Packaging, PrepChoices, PrepMethod, SeedTier } from '../game/types';

export type Panel = 'farm' | 'storage' | 'market' | 'trade' | 'business' | 'journal';
export type StationId = 'tank' | 'shed' | 'warehouse' | 'office' | 'truck';
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
}

interface Actions {
  select: (id: number | null) => void;
  prepare: (id: number, method: PrepMethod) => void;
  plant: (id: number, seed: SeedTier) => void;
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
  dismiss: () => void;
  upgrade: (id: sim.UpgradeId) => void;
  toggleInsurance: () => void;
  dismissReport: () => void;
  clearInspection: () => void;
  clearToast: () => void;
  reset: () => void;
  openPanel: (panel: Panel) => void;
  setNearby: (t: Target | null) => void;
  /** Use whatever the target is: open the plot panel, a building's panel, or talk to an NPC. */
  interact: (t: Target) => void;
  closeOverlays: () => void;
}

export type Store = GameState & UiState & Actions;

const sameTarget = (a: Target | null, b: Target | null) => a?.kind === b?.kind && a?.id === b?.id;

export const useGameStore = create<Store>((set, get) => {
  // Every action is followed by a campaign check, so missions react to whatever the player just did.
  const apply = (fn: (s: GameState) => GameState) => set(s => sim.checkCampaign(fn(s)));
  /** Applies an action and emits an fx cue only if it actually did something (energy or cash changed). */
  const act = (kind: Fx['kind'], fn: (s: GameState) => GameState, plot?: number) => set(s => {
    const next = sim.checkCampaign(fn(s));
    const changed = next.energy !== s.energy || next.cash !== s.cash || next.water !== s.water;
    return changed ? { ...next, fx: { kind, plot, at: performance.now() } } : next;
  });
  return {
    ...sim.initialState(),
    selectedPlot: null,
    reportSeenDay: 1,
    panel: 'farm',
    nearby: null,
    talkingTo: null,
    tankOpen: false,
    fx: null,
    select: id => set({ selectedPlot: id, talkingTo: null, tankOpen: false }),
    prepare: (id, method) => act('prepare', s => sim.preparePlot(s, id, method), id),
    plant: (id, seed) => act('plant', s => sim.plantPlot(s, id, seed), id),
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
    dismiss: () => apply(sim.dismissWorker),
    upgrade: id => apply(s => sim.buyUpgrade(s, id)),
    toggleInsurance: () => apply(sim.toggleInsurance),
    dismissReport: () => set(s => ({ reportSeenDay: s.day })),
    clearInspection: () => set({ lastInspection: null }),
    clearToast: () => set({ toast: '' }),
    reset: () => set({ ...sim.initialState(Date.now() >>> 0), selectedPlot: null, reportSeenDay: 1, panel: 'farm', talkingTo: null, tankOpen: false, fx: null }),
    openPanel: panel => set({ panel }),
    // Called every frame by the player: only touch the store when the target actually changes,
    // otherwise every subscriber (the whole HUD) would re-render at 60 fps.
    setNearby: t => { if (!sameTarget(get().nearby, t)) set({ nearby: t }); },
    interact: t => set(() => {
      const closed = { selectedPlot: null, talkingTo: null, tankOpen: false };
      if (t.kind === 'plot') return { ...closed, selectedPlot: t.id };
      if (t.kind === 'npc') return { ...sim.talkTo(get(), t.id), ...closed, talkingTo: t.id };
      if (t.id === 'tank') return { ...closed, tankOpen: true };
      const panel: Record<Exclude<StationId, 'tank'>, Panel> = { shed: 'storage', warehouse: 'storage', office: 'business', truck: 'trade' };
      return { ...closed, panel: panel[t.id] };
    }),
    closeOverlays: () => set({ selectedPlot: null, talkingTo: null, tankOpen: false, panel: 'farm', lastInspection: null, story: null }),
  };
});

// Dev-only handle for debugging and scripted playtests in the browser console.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __h2h: typeof useGameStore }).__h2h = useGameStore;
