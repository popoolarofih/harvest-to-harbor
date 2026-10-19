// Short, true-to-life lessons shown in the morning report. The game is meant to teach:
// each one connects a real farming, processing, trade or money idea to something the player can do.

export interface Lesson { topic: 'Agronomy' | 'Processing' | 'Export' | 'Money' | 'Soil' | 'Weather' | 'People'; text: string }

export const LESSONS: Lesson[] = [
  { topic: 'Agronomy', text: 'Southern Kaduna grows most of Nigeria\'s ginger, and Nigeria is one of the world\'s largest ginger producers. Kafanchan, Kachia and Jaba are the heart of it.' },
  { topic: 'Agronomy', text: 'Ginger is grown from pieces of rhizome called "setts", not seeds. Healthy, disease-free setts are the cheapest insurance against rot.' },
  { topic: 'Agronomy', text: 'Ginger takes 8 to 10 months to mature in the field. When the leaves turn yellow and dry back, the rhizomes are ready to lift.' },
  { topic: 'Agronomy', text: 'Raised ridges lift the rhizomes above standing water. Waterlogged roots are where soft rot (Pythium) begins.' },
  { topic: 'Agronomy', text: 'Leaving ripe ginger in the ground too long makes it fibrous. Buyers pay less for stringy rhizomes, so harvest on time.' },
  { topic: 'Soil', text: 'Planting ginger on the same bed season after season builds up soil diseases. Rotating with a legume like soybean breaks the cycle.' },
  { topic: 'Soil', text: 'Soybean roots host bacteria that pull nitrogen from the air into the soil. Farmers call it free fertilizer.' },
  { topic: 'Soil', text: 'Organic matter (compost, crop residue) works like a sponge: it holds water through dry spells and nutrients through heavy rain.' },
  { topic: 'Soil', text: 'Heavy machinery and repeated tilling can press the subsoil into a hard "pan" that roots and water struggle to pass through.' },
  { topic: 'Weather', text: 'Weather forecasts are less certain the further ahead they look. Plan around tomorrow; prepare for next week.' },
  { topic: 'Weather', text: 'Catching rainwater is free water. Every litre in the tank is a litre you don\'t pay diesel to pump.' },
  { topic: 'Processing', text: 'Fresh ginger is about 80% water. Drying it to 12% or below lets it keep for months instead of days.' },
  { topic: 'Processing', text: 'It takes roughly 5 to 6 kg of fresh ginger to make 1 kg of dried ginger. That is why dried ginger sells for so much more per kilo.' },
  { topic: 'Processing', text: 'Peeled, sliced ginger dries faster and more evenly than split rhizomes, and buyers pay more for it.' },
  { topic: 'Processing', text: 'Grinding damp ginger makes the powder cake and clump. Mill only when the slices snap cleanly.' },
  { topic: 'Processing', text: 'A thorough wash removes soil from the crevices. Importers treat soil as "foreign matter" and downgrade or reject the lot.' },
  { topic: 'Export', text: 'Exporters need a phytosanitary certificate: an official document saying the produce is free of pests and disease.' },
  { topic: 'Export', text: 'Sealed, lined bags keep humid sea air out. Mould from damp ginger is one of the most common reasons export lots are rejected.' },
  { topic: 'Export', text: 'Most Nigerian agricultural exports leave through the Apapa and Tin Can Island ports in Lagos.' },
  { topic: 'Export', text: 'Export contracts are often priced in US dollars. When the naira weakens, the same contract pays more naira, and the opposite when it strengthens.' },
  { topic: 'Export', text: 'Cargo insurance costs a small share of the shipment value, but one damaged container can wipe out a season\'s profit.' },
  { topic: 'Money', text: 'Revenue is not profit. Profit is what is left after seed, wages, fuel, transport and loan interest are paid.' },
  { topic: 'Money', text: 'A business can be profitable on paper and still fail if cash runs out before customers pay. Watch your cash flow.' },
  { topic: 'Money', text: 'Equipment pays for itself only if you use it enough. A tractor on a small farm can cost more in upkeep than it saves.' },
  { topic: 'Money', text: 'Borrowing is a tool: it can let you buy inputs on time, but interest grows every day the loan is unpaid.' },
  { topic: 'Money', text: 'Buying inputs off-season, in bulk, is cheaper. Storing them takes warehouse space, which is a cost too.' },
  { topic: 'Money', text: 'Diversifying (more than one farm, more than one buyer) spreads risk. One storm or one bad buyer won\'t sink you.' },
  { topic: 'People', text: 'Skilled workers cost more, but an experienced agronomist who spots rot early can save far more than their wage.' },
  { topic: 'People', text: 'Cooperatives let small farmers share water, roads and equipment that none of them could afford alone.' },
  { topic: 'People', text: 'Paying wages on time builds a reliable crew. In farming, the harvest waits for no one.' },
];

/** The lesson for a given day: everyone sees the same one, and it changes every morning. */
export const lessonForDay = (day: number) => LESSONS[((day * 7) % LESSONS.length + LESSONS.length) % LESSONS.length];
