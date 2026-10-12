// Test fixtures shared by unit tests and browser tests. Not imported by the game itself.
import { advanceDay, campaignContract, dispatchContract, initialState, plantPlot, preparePlot, startProcessing, takeLoan, waterPlot } from './simulation';
import type { GameState } from './types';

/** A farm mid-season with everything in flight: crops, a drying rack, a loan, and an export shipment on the road. */
export function busyFarm(): GameState {
  let s: GameState = { ...initialState(77), level: 20, cash: 4_000_000, flags: { ...initialState(77).flags, exportUnlocked: true } };
  for (const id of [0, 1, 5]) s = plantPlot(preparePlot(s, id, 'ridge'), id, 'improved');
  s = waterPlot(s, 1);
  s = advanceDay(advanceDay(s));
  s = takeLoan(s, 0);
  const contract = { ...campaignContract(s), campaign: false };
  s = { ...s, contracts: [contract], nextId: s.nextId + 1 };
  s = { ...s, batches: [...s.batches, { id: s.nextId, product: 'dried', kg: 500, quality: 92, moisture: 9, createdDay: s.day, packaging: 'sealed' }], nextId: s.nextId + 1 };
  s = dispatchContract(s, contract.id);
  s = { ...s, batches: [...s.batches, { id: s.nextId, product: 'fresh', kg: 300, quality: 85, moisture: 80, createdDay: s.day }], nextId: s.nextId + 1 };
  s = startProcessing(s, s.nextId - 1);
  return advanceDay(s);
}
