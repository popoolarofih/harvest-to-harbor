import { describe, expect, it } from 'vitest';
import * as g from './simulation';
import type { GameState } from './types';

/** Scripted players. Not optimal, just "pays attention" vs "plants and walks away". */
function playSeason(seed: number, careful: boolean): GameState {
  let s = g.initialState(seed);
  for (const p of s.plots) {
    s = g.preparePlot(s, p.id, careful && p.z >= 2 ? 'ridge' : 'clear');
    s = g.plantPlot(s, p.id, careful ? 'improved' : 'local');
  }
  if (careful) s = g.hireWorker(s);
  for (let d = 0; d < 40; d++) {
    for (const { id } of s.plots) {
      const p = s.plots[id];
      if (careful) {
        if (p.status === 'growing' && p.moisture < 35) { if (s.water < g.WATER_PER_PLOT) s = g.pumpWater(s); s = g.waterPlot(s, id); }
        if (p.status === 'growing' && p.fertility < 35 && !g.isWet(s.weather)) s = g.fertilizePlot(s, id);
        if (d % 3 === 0) s = g.inspectPlot(s, id);
        if (s.plots[id].issue?.detected) s = g.treatPlot(s, id);
      }
      if (s.plots[id].status === 'ready' && (!careful || s.plots[id].daysReady >= 2)) s = g.harvestPlot(s, id);
    }
    for (const b of s.batches.filter(b => b.product === 'fresh')) {
      const before = s.batches.length;
      if (careful && g.rackLoadKg(s) + b.kg <= g.DRYING_RACK_KG) s = g.startDrying(s, b.id);
      if (s.batches.length === before) s = g.sellBatch(s, b.id, 'aggregator');
      if (s.batches.length === before) s = g.sellBatch(s, b.id, 'market');
    }
    for (const j of s.dryingJobs) {
      if (careful && g.isWet(s.forecast[0].weather) !== j.covered) s = g.toggleCover(s, j.id);
      if (j.moisture <= 11) s = g.finishDrying(s, j.id);
    }
    for (const b of s.batches.filter(b => b.product === 'dried')) {
      const before = s.batches.length;
      s = g.sellBatch(s, b.id, 'processor');
      if (s.batches.length === before) s = g.sellBatch(s, b.id, 'dryTraders');
    }
    s = g.advanceDay(s);
  }
  return s;
}

describe('season balance', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const careful = seeds.map(seed => playSeason(seed, true));
  const neglect = seeds.map(seed => playSeason(seed, false));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('attentive farming earns clearly more than neglect', () => {
    expect(avg(careful.map(s => s.cash))).toBeGreaterThan(avg(neglect.map(s => s.cash)) * 1.2);
  });
  it('a careful season usually turns a profit on the starting ₦500k', () => {
    expect(careful.filter(s => s.cash > g.STARTING_CASH).length).toBeGreaterThanOrEqual(seeds.length / 2);
  });
  it('neglected crops still produce something, so a first-time player is not wiped out', () => {
    expect(neglect.every(s => s.finance.revenue > 0)).toBe(true);
  });
});
