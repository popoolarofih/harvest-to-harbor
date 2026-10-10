import type { Mission } from './types';

export type MissionDef = Omit<Mission, 'progress' | 'complete'>;

/** "Farm to Fortune": the story campaign. Progress is measured from game state in campaign.ts. */
export const CAMPAIGN: MissionDef[] = [
  {
    id: 'land', title: 'The land', target: 1, reward: 10_000, npc: 'baba',
    description: 'Your uncle has given you 2 hectares outside Kafanchan. Find Baba Musa by the farm office.',
    intro: 'Welcome, my friend. Your uncle says you want to farm ginger. Good land, this. Come and find me by the office and I will show you how we do it here.',
    hint: 'Walk to Baba Musa (by the farm office) and press E.',
  },
  {
    id: 'plant', title: 'Your first crop', target: 4, reward: 25_000, npc: 'baba',
    description: 'Plant ginger on at least 4 plots.',
    intro: 'Ginger goes in at the start of the rains. The upland beds drain well; the beds by the stream are rich but they flood, so ridge them. And do not buy cheap setts: half of them never wake up.',
    hint: 'Click a plot: prepare the soil, then choose seed.',
  },
  {
    id: 'storm', title: 'A storm is coming', target: 1, reward: 60_000, npc: 'baba',
    description: 'A storm is forecast in three days. Before it hits, buy crop insurance or make sure every planted bed in the low field (rows C and D) is ridged.',
    intro: 'The radio says a big storm in three days. Wind and water. Flat beds by the stream will sit in water and rot. Ridge them, or insure the crop. Do not wait for the clouds.',
    hint: 'Insurance is in Business. Ridges are made when you prepare a plot.',
  },
  {
    id: 'harvest', title: 'Your first harvest', target: 1_000, reward: 50_000, npc: 'baba',
    description: 'Harvest 1,000 kg of fresh ginger.',
    intro: 'When the leaves yellow and fall over, the rhizomes are ready. A few extra days in the ground adds weight. Too many and they go woody, or rot.',
    hint: 'Plots marked READY can be harvested. You can harvest from 70% growth, for less.',
  },
  {
    id: 'offer', title: 'The first offer', target: 300, reward: 25_000, npc: 'chinedu',
    description: 'A buyer wants your fresh ginger today. Decide: sell at least 300 kg fresh, or put at least 300 kg into processing.',
    intro: 'A Kaduna aggregator called me. He will take your fresh ginger today at market price, about ₦1.2 million for 2 tonnes. Cash now, no risk. Or keep it and add value. But fresh ginger does not wait.',
    hint: 'Open Storage and compare selling fresh, drying, and powder.',
  },
  {
    id: 'drying', title: 'The drying lesson', target: 100, reward: 75_000, npc: 'baba',
    description: 'Sun-dry ginger properly: bag at least 100 kg of dried ginger at 12% moisture or below.',
    intro: 'My father sold everything fresh and stayed poor. Dried ginger keeps for a year and pays many times more per kilo. But it must be dry, 12% or less, or it moulds in the bag and the buyer sends it back. Wash it well, slice it, and cover the racks when rain comes.',
    hint: 'Storage → process a fresh batch, then bag it once moisture is 12% or less.',
  },
  {
    id: 'facility', title: 'Build a processing facility', target: 1, reward: 50_000, npc: 'amaka',
    description: 'Invest in your first processing equipment: a hammer mill or a solar tunnel dryer.',
    intro: 'Open racks are where everyone starts. Real processors control the process: a solar dryer so rain cannot ruin a batch, a mill so you can sell powder. Equipment costs money. Bad batches cost more.',
    hint: 'Business → Hammer mill or Solar tunnel dryer.',
  },
  {
    id: 'buyer', title: 'An international buyer', target: 1, reward: 0, npc: 'amaka',
    description: 'Amaka has found a buyer abroad. Go and talk to her.',
    intro: 'I have news, and it is big. Come to the processing shed and I will tell you everything.',
    hint: 'Walk to Amaka at the processing shed and press E.',
  },
  {
    id: 'lot', title: 'The export lot', target: 400, reward: 100_000, npc: 'amaka',
    description: 'Fill the London Spice Co. order: 400 kg of Grade A or Premium dried ginger or powder, in sealed bags, at 12% moisture or below, in your store.',
    intro: 'London Spice Co. wants Nigerian ginger, and they pay far above anything in Abuja. Their first order is 400 kilos to prove yourself: Grade A or better, sealed, below 12% moisture. Wash thoroughly, sort strictly, dry it right and seal it. One damp bag and the whole container can be rejected.',
    hint: 'Process with a thorough wash and strict sort, then bag in sealed bags. The order is on the Trade board.',
  },
  {
    id: 'ship', title: 'Your first container', target: 1, reward: 250_000, npc: 'chinedu',
    description: 'Dispatch the London order: choose haulage, pay the export fees and load the truck for Lagos.',
    intro: 'The lot is ready? Then we move. A truck takes it to Lagos, it goes into a container at Apapa, and the ship sails for the UK. You pay haulage and the export documents now; London pays when it lands. Make sure you have the cash.',
    hint: 'Walk to the truck (or open Trade) and dispatch the London Spice Co. order.',
  },
];

export const CAMPAIGN_END = {
  title: 'Farm to Fortune: complete',
  text: 'The truck has gone. In a few weeks your ginger will be on a ship from Lagos to the UK. Two hectares, one season, and you are an exporter. Next season: more land, better equipment, bigger contracts.',
};
