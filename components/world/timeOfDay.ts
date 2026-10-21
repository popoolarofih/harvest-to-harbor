import { reducedMotion } from '../../stores/session';

/**
 * The visual clock. The sim only knows days; this gives each day a morning, afternoon and dusk.
 * `hour` eases toward `target`. While idle, the target creeps from morning toward late afternoon
 * so a long play session drifts into golden hour on its own.
 */
export const clock = {
  hour: 9,
  target: 9,
  /** Hours per second while moving between targets. */
  speed: 4,
  mode: 'day' as 'day' | 'evening',
  dayStartedAt: 0,
  busy: false,
};

const DRIFT_START = 8, DRIFT_END = 16.2, DRIFT_MINUTES = 9;

export function tickClock(dt: number, now: number) {
  if (clock.mode === 'day') {
    const t = Math.min(1, (now - clock.dayStartedAt) / (DRIFT_MINUTES * 60_000));
    clock.target = DRIFT_START + (DRIFT_END - DRIFT_START) * t;
  }
  if (reducedMotion()) { clock.hour = clock.target; return; }
  const d = clock.target - clock.hour;
  const step = Math.sign(d) * Math.min(Math.abs(d), clock.speed * dt);
  clock.hour += step;
}

/** Night falls, the day is advanced, and the next morning breaks. Returns after the sim has moved on. */
export function endDayWithTransition(advance: () => void) {
  if (clock.busy) return;
  if (reducedMotion()) { advance(); clock.hour = clock.target = DRIFT_START; clock.dayStartedAt = performance.now(); return; }
  clock.busy = true;
  clock.mode = 'evening';
  clock.target = 19.4;
  clock.speed = 6;
  // Dusk takes about 1.8 s to settle; then the sim runs the night and the morning mist rolls in.
  setTimeout(() => {
    advance();
    clock.hour = 5.2; clock.target = DRIFT_START; clock.speed = 1.4;
    clock.mode = 'day'; clock.dayStartedAt = performance.now();
    setTimeout(() => { clock.speed = 4; clock.busy = false; }, 2600);
  }, 1800);
}
