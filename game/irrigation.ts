import { WATER_MOISTURE_GAIN, WATER_PER_PLOT } from './config';
import type { GameState } from './types';

export interface IrrigationResult { state: GameState; irrigated: number }

/** Uses available tank water to bring every planted dry bed up by one drip cycle. */
export function autoIrrigate(s: GameState): IrrigationResult {
  if (!s.upgrades.irrigation) return { state: s, irrigated: 0 };
  let water = s.water, irrigated = 0;
  const plots = s.plots.map(p => {
    if ((p.status !== 'growing' && p.status !== 'ready') || !p.seed || p.moisture >= 45 || water < WATER_PER_PLOT) return p;
    water -= WATER_PER_PLOT;
    irrigated++;
    return { ...p, moisture: Math.min(100, p.moisture + WATER_MOISTURE_GAIN) };
  });
  return { state: irrigated ? { ...s, plots, water } : s, irrigated };
}
