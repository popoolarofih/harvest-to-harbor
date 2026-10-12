// The first-season tutorial. Steps advance on signals read from real store transitions (an fx cue
// from a successful action, a day tick, a panel opening), so the tutorial never re-implements gameplay.
import type { NpcId, Plot } from './types';

export const TUTORIAL_STATUSES = ['active', 'done', 'skipped'] as const;
export interface TutorialProgress { status: (typeof TUTORIAL_STATUSES)[number]; step: number }
export const TUTORIAL_START: TutorialProgress = { status: 'active', step: 0 };

/** HUD controls a step can highlight; components mark them with `data-tut`. */
export type TutorialControl = 'prompt' | 'end-day' | 'storage-tab' | 'plot-panel';
export type WorldTarget = { kind: 'plot'; id: number } | { kind: 'npc'; id: NpcId } | { kind: 'station'; id: 'warehouse' };

/** The parts of the store the tutorial watches. */
export interface TutorialSnapshot {
  day: number;
  plots: Plot[];
  fx: { kind: string; at: number } | null;
  nearby: { kind: string; id: string | number } | null;
  talkingTo: NpcId | null;
  panel: string;
}

export type TutorialSignal =
  | { kind: 'near'; npc: NpcId }
  | { kind: 'talk'; npc: NpcId }
  | { kind: 'action'; action: string }
  | { kind: 'day' }
  | { kind: 'panel'; panel: string };

/** What changed between two store states, in tutorial terms. */
export function signalsBetween(prev: TutorialSnapshot, next: TutorialSnapshot): TutorialSignal[] {
  const out: TutorialSignal[] = [];
  if (next.nearby?.kind === 'npc' && (prev.nearby?.kind !== 'npc' || prev.nearby.id !== next.nearby.id)) out.push({ kind: 'near', npc: next.nearby.id as NpcId });
  if (next.talkingTo && next.talkingTo !== prev.talkingTo) out.push({ kind: 'talk', npc: next.talkingTo });
  // `fx` is only emitted when an action actually changed energy, cash or water: i.e. it succeeded.
  if (next.fx && next.fx !== prev.fx) out.push({ kind: 'action', action: next.fx.kind });
  if (next.day > prev.day) out.push({ kind: 'day' });
  if (next.panel !== prev.panel) out.push({ kind: 'panel', panel: next.panel });
  return out;
}

const cropped = (p: Plot) => p.status === 'growing' || p.status === 'ready';
/** Suggest a bed in row B: decent drainage and fertility, and close to where the player starts. */
const suggestEmpty = (plots: Plot[]) => (plots.find(p => p.status === 'empty' && p.z === 1) ?? plots.find(p => p.status === 'empty'))?.id;
const firstWhere = (plots: Plot[], f: (p: Plot) => boolean) => plots.find(f)?.id;

export interface TutorialStep {
  id: string;
  title: string;
  /** Instruction for keyboard and mouse players. */
  mouse: string;
  /** Instruction for touch players. */
  touch: string;
  control?: TutorialControl;
  world?: (plots: Plot[]) => WorldTarget | null;
  done: (sig: TutorialSignal) => boolean;
  /** Steps that can't be done on this farm (e.g. no empty plots during a replay) are passed over. */
  applies?: (plots: Plot[]) => boolean;
}

const plotTarget = (id: number | undefined): WorldTarget | null => (id === undefined ? null : { kind: 'plot', id });
const isAction = (...actions: string[]) => (sig: TutorialSignal) => sig.kind === 'action' && actions.includes(sig.action);

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'meet', title: 'Meet Baba Musa',
    mouse: 'Baba Musa is waiting by the farm office. Walk over with WASD or the arrow keys, or click the ground.',
    touch: 'Baba Musa is waiting by the farm office. Tap the ground to walk, or tap him.',
    world: () => ({ kind: 'npc', id: 'baba' }),
    done: sig => (sig.kind === 'near' || sig.kind === 'talk') && sig.npc === 'baba',
  },
  {
    id: 'talk', title: 'Say hello',
    mouse: 'Press E (or click the prompt above him) to talk.',
    touch: 'Tap the prompt above him to talk.',
    control: 'prompt', world: () => ({ kind: 'npc', id: 'baba' }),
    done: sig => sig.kind === 'talk' && sig.npc === 'baba',
  },
  {
    id: 'prepare', title: 'Prepare a plot',
    mouse: 'Walk to the marked plot and press E. Clear the soil, or ridge it for better drainage.',
    touch: 'Tap the marked plot, then clear the soil or ridge it for better drainage.',
    control: 'plot-panel', world: plots => plotTarget(suggestEmpty(plots)),
    done: isAction('prepare'),
    applies: plots => plots.some(p => p.status === 'empty'),
  },
  {
    id: 'plant', title: 'Plant ginger',
    mouse: 'Choose seed setts for the prepared plot. Improved seed costs more but more of it comes up.',
    touch: 'Choose seed setts for the prepared plot. Improved seed costs more but more of it comes up.',
    control: 'plot-panel', world: plots => plotTarget(firstWhere(plots, p => p.status === 'prepared') ?? suggestEmpty(plots)),
    done: isAction('plant'),
    applies: plots => plots.some(p => p.status === 'empty' || p.status === 'prepared'),
  },
  {
    id: 'inspect', title: 'Inspect your crop',
    mouse: 'Pests and disease stay hidden until you look. Open a planted plot and press 🔍 Inspect.',
    touch: 'Pests and disease stay hidden until you look. Tap a planted plot and press 🔍 Inspect.',
    control: 'plot-panel', world: plots => plotTarget(firstWhere(plots, cropped)),
    done: isAction('inspect'),
    applies: plots => plots.some(cropped),
  },
  {
    id: 'care', title: 'Water or fertilise',
    mouse: 'Keep soil moisture between 30% and 85%. Water uses 400 L from the tank; fertiliser costs cash.',
    touch: 'Keep soil moisture between 30% and 85%. Water uses 400 L from the tank; fertiliser costs cash.',
    control: 'plot-panel', world: plots => plotTarget(firstWhere(plots, cropped)),
    done: isAction('water', 'fertilize'),
    applies: plots => plots.some(p => p.status !== 'empty'),
  },
  {
    id: 'day', title: 'End the day',
    mouse: 'Crops grow overnight. Press 🌙 End day: weather, growth and wages happen, and your energy refills.',
    touch: 'Crops grow overnight. Press 🌙 End day: weather, growth and wages happen, and your energy refills.',
    control: 'end-day',
    done: sig => sig.kind === 'day',
  },
  {
    id: 'harvest', title: 'Harvest when ready',
    mouse: 'Ginger takes many days to mature. Keep caring for it and ending days; when a plot says READY, harvest it.',
    touch: 'Ginger takes many days to mature. Keep caring for it and ending days; when a plot says READY, harvest it.',
    control: 'plot-panel', world: plots => plotTarget(firstWhere(plots, p => p.status === 'ready') ?? firstWhere(plots, cropped)),
    done: isAction('harvest'),
  },
  {
    id: 'compare', title: 'Sell fresh, or process?',
    mouse: 'Open Storage (or walk to the warehouse) and compare selling fresh today with drying it for a higher price.',
    touch: 'Open Storage (or tap the warehouse) and compare selling fresh today with drying it for a higher price.',
    control: 'storage-tab', world: () => ({ kind: 'station', id: 'warehouse' }),
    done: sig => sig.kind === 'panel' && sig.panel === 'storage',
  },
];

/** Moves past steps that don't apply to this farm. */
function settle(progress: TutorialProgress, plots: Plot[]): TutorialProgress {
  let step = progress.step;
  while (step < TUTORIAL.length && TUTORIAL[step].applies && !TUTORIAL[step].applies!(plots)) step++;
  if (step >= TUTORIAL.length) return { status: 'done', step: TUTORIAL.length };
  return step === progress.step ? progress : { ...progress, step };
}

/** Applies signals to the tutorial. Returns the same object when nothing changed. */
export function stepTutorial(progress: TutorialProgress, signals: TutorialSignal[], plots: Plot[]): TutorialProgress {
  if (progress.status !== 'active') return progress;
  let p = settle(progress, plots);
  for (const sig of signals) {
    if (p.status !== 'active') break;
    if (TUTORIAL[p.step].done(sig)) p = settle({ ...p, step: p.step + 1 }, plots);
  }
  return p;
}

export const skipStep = (progress: TutorialProgress, plots: Plot[]): TutorialProgress =>
  progress.status === 'active' ? settle({ ...progress, step: progress.step + 1 }, plots) : progress;

export const currentStep = (progress: TutorialProgress) => (progress.status === 'active' ? TUTORIAL[progress.step] ?? null : null);
