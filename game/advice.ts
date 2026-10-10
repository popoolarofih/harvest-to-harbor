import { SAFE_MOISTURE, TREATMENTS, WEATHER_INFO } from './config';
import { valueOptions } from './quality';
import { hasEvent, money, plotName, storedKg, warehouseCapacity } from './state';
import type { GameState, NpcId } from './types';

export type { NpcId };

export const NPCS: Record<NpcId, { name: string; role: string; greeting: string }> = {
  baba: { name: 'Baba Musa', role: 'Experienced farmer', greeting: 'Ah, my friend. Walk the beds every few days; the soil tells you what it needs.' },
  amaka: { name: 'Amaka', role: 'Agribusiness & export consultant', greeting: 'Every kilo you process well is worth more than the kilo you sell in a hurry.' },
  chinedu: { name: 'Chinedu', role: 'Logistics operator', greeting: 'Good produce is only worth something once it reaches the buyer in good shape.' },
};

/** Context-aware tips, most urgent first. Pure function so NPCs stay testable and UI-agnostic. */
export function npcAdvice(s: GameState, id: NpcId): string[] {
  const tips: string[] = [];
  if (id === 'baba') {
    // Baba Musa can spot trouble before the player has inspected: that's the point of talking to him.
    const hidden = s.plots.filter(p => p.issue && !p.issue.detected && p.issue.severity >= 15).sort((a, b) => b.issue!.severity - a.issue!.severity)[0];
    if (hidden) tips.push(`The leaves on ${plotName(hidden)} don't look right to me. I think it's ${TREATMENTS[hidden.issue!.kind].name.toLowerCase()}. Inspect it and treat it before it spreads.`);
    const stormDay = s.forecast.find(f => f.weather === 'storm');
    if (stormDay) tips.push(`The radio says a storm around day ${stormDay.day}. Mature ginger is safer in the store than in the ground, and insurance only helps if you buy it before.`);
    const dry = s.plots.filter(p => p.status === 'growing' && p.moisture < 30);
    if (dry.length) tips.push(`${dry.map(plotName).join(', ')} ${dry.length > 1 ? 'are' : 'is'} thirsty. Ginger hates dry soil while the rhizomes are bulking.`);
    const old = s.plots.filter(p => p.status === 'ready' && p.daysReady >= 3);
    if (old.length) tips.push(`Don't leave ${old.map(plotName).join(', ')} in the ground much longer. A few days adds weight; too many and it turns fibrous or rots.`);
    if (s.plots.every(p => p.status === 'empty')) tips.push('The bottom field by the stream is rich, but it floods. If you plant there, make ridges so the water can run off.');
  }
  if (id === 'amaka') {
    const damp = s.dryingJobs.find(j => j.moisture > SAFE_MOISTURE && j.days >= 3);
    if (damp) tips.push(`Rack #${damp.id} is still at ${damp.moisture.toFixed(1)}% moisture. Don't bag it until it's at or below ${SAFE_MOISTURE}%, or the Abuja processor will refuse it.`);
    const rainSoon = s.forecast.slice(0, 2).find(f => WEATHER_INFO[f.weather].dryingMoisture > 0);
    if (rainSoon && s.dryingJobs.some(j => !j.covered)) tips.push(`Rain is forecast for day ${rainSoon.day}. Cover the drying racks the evening before, or the slices will soak it up again.`);
    const fresh = s.batches.find(b => b.product === 'fresh');
    if (fresh) {
      const [sell, dry] = valueOptions(s, fresh);
      tips.push(`For batch #${fresh.id}: selling fresh brings about ${money(sell.net)} today. Drying costs ${money(dry.cost)} but could net about ${money(dry.net)}. More value, more risk, and it takes time.`);
    }
    if (hasEvent(s, 'priceCrash')) tips.push('Fresh prices have crashed. Dried ginger keeps; if you can afford to wait, process and hold.');
    if (!tips.length) tips.push('When you have a steady Grade A supply, I can introduce you to buyers abroad. They pay well, but they are strict about quality and dates.');
  }
  if (id === 'chinedu') {
    if (storedKg(s) > warehouseCapacity(s)) tips.push(`You have ${Math.round(storedKg(s)).toLocaleString()} kg in a store built for ${warehouseCapacity(s).toLocaleString()}. Whatever sits outside is spoiling. Sell, or extend the warehouse.`);
    if (hasEvent(s, 'fuelSpike')) tips.push('Diesel is very expensive this week. Pump the borehole only when you must, and let the rain fill your tank.');
    const fresh = s.batches.find(b => b.product === 'fresh');
    if (fresh && fresh.kg < 500) tips.push('The Kaduna aggregator will not send a truck for under 500 kg. Combine your harvests, or sell small lots at Kafanchan market.');
    if (!tips.length) tips.push('One day we will load your ginger in a container at Lagos. For now, learn to move it from farm to buyer without losing quality.');
  }
  return tips.slice(0, 3);
}
