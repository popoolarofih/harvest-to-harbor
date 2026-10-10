# Harvest to Harbor: Nigeria - MVP v0.5

A browser-based agricultural simulation built with Next.js, React, TypeScript, React Three Fiber and Zustand.

## Current playable loop

Pick a plot (upland or stream-bottom) → clear or ridge the soil → choose seed quality → water, fertilize, inspect and treat through the season while reading a 5-day forecast → decide when to harvest (early, on time, or wait for more yield at rising risk) → **sell fresh, dry, or make powder** → process → inspect the quality → sell locally or ship an export lot to London via Lagos → manage wages, insurance, equipment and cash flow.

Every action trades off cash, energy (labour) and risk. Problems such as pests, leaf spot and soft rot start hidden and only show up through inspection or once the damage is visible.

### Processing chain

FRESH → WASH → SORT → SLICE → DRY → GRIND → QC → PACK. Each stage is a choice that affects cost, kilos and grade:

- **Wash**: quick rinse (free, but soil left behind caps the grade at B) or thorough wash (uses tank water)
- **Sort**: none / standard / strict (fewer kilos, higher quality)
- **Slice**: split unpeeled (cheap, slow to dry) or peeled slices (dries faster, better grade)
- **Dry**: open racks (cover them before rain) or a solar tunnel dryer upgrade
- **Grind**: hammer mill upgrade; grinding above 10% moisture cakes the powder
- **Pack**: jute sacks (cheap, pick up moisture) or sealed bags (needed for Premium grade and export)

Grades: C, B, A, and **Premium** (excellent processing *and* sealed packaging). Every fresh batch shows a sell-fresh / dry / powder comparison with cost, projected revenue and risk.

### Farm to Fortune campaign

### Contracts, logistics and money

- **Trade board**: buyers post offers with volume, minimum grade, deadline, late penalty and payment terms (30% advance / on delivery / 30 days after delivery). Export contracts are priced in US dollars, so the naira exchange rate moves your revenue. Overdue contracts are cancelled (advance refunded, reputation lost).
- **Export journey**: dispatch loads the truck, which drives Kafanchan → Lagos (breakdowns, checkpoints), clears Apapa port (congestion, daily storage fees), then sails to the buyer's port (possible cargo damage). Choose standard haulage or Chinedu's fleet and optional cargo insurance. Follow it on the journey map.
- **Money**: bank loans and equipment financing with interest and due dates; defaults add a penalty and freeze credit. Daily wages, maintenance and premiums. A 30-day cash-flow forecast warns when you will run out of cash before a payment lands.

### Career levels

Level 1 Smallholder → 5 Commercial Farmer → 10 Agricultural Processor → 20 Agribusiness Owner → 30 Exporter → 50 International Agricultural Supplier. Each level unlocks something concrete (certified seed, forward contracts, solar dryer, land lease +8 plots, bank loans, hammer mill, Processing Factory, equipment financing, premium haulage, cargo insurance, European/Gulf/American buyers, your own brand) and raises the staff limit. See `game/levels.ts`.

### Farm to Fortune campaign

Ten story missions given in person by Baba Musa, Amaka and Chinedu (a gold **!** marks who has your next mission): meet Baba Musa → plant → a scheduled storm you must prepare for → first harvest → the first offer (sell or process) → the drying lesson → build a processing facility → an international buyer → build a 400 kg export lot → ship your first container. Progress is measured from game state (`game/campaign.ts`), so missions react to whatever you actually do.

## Playing

You are a farmer on the land, not a dashboard. Walk with **WASD / arrow keys** (hold **Shift** to run), or click/tap the ground. Click a plot, building or person to walk there and use it, or press **E** when you're next to it. **Esc** closes panels; the mouse wheel zooms.

- **Plots**: prepare, plant, water, fertilize, inspect, treat, harvest
- **Water tank & borehole** (east of the field): pump water with diesel; drip lines appear once irrigation is bought
- **Processing shed**: drying racks show the ginger slices and the tarpaulin when covered; the hammer mill runs while racks are full
- **Store**: sacks of fresh (brown) and dried (white) ginger pile up out front
- **Farm office**: business, workers, insurance, upgrades
- **Truck**: buyers and market
- **Baba Musa, Amaka, Chinedu**: context-aware advice (Baba can spot problems you haven't inspected yet)

Weather is visible in the world: rain and storm intensity, drifting clouds, lightning, crops swaying harder in wind. Hired workers walk the beds.

## Architecture

- `game/` is the simulation engine: plain TypeScript, no React or Three.js. All randomness flows through a seeded RNG stored in `GameState.rng`, so a season replays exactly from the same seed.
  - `config.ts`: tunable numbers (costs, seeds, buyers, weather effects)
  - `state.ts`: initial state and shared helpers
  - `farm.ts`: plot actions (prepare, plant, water, fertilize, inspect, treat, gap-fill, harvest)
  - `economy.ts`: selling, drying, workers, upgrades, insurance, borehole
  - `day.ts`: the daily tick (weather, events, market, growth, disease, storage, drying, payroll)
  - `quality.ts`: grading, inspection reports, sale checks, sell-vs-process projections
  - `weather.ts`: weather chain and forecast
  - `simulation.ts`: public barrel used by the UI
- `stores/gameStore.ts` wraps engine functions as Zustand actions and holds UI-only state (selected plot, dismissed report).
  - `advice.ts`: what the NPCs say, derived from game state
  - `contracts.ts`: offers, signing, dispatch and the daily shipment journey with its risks and payment
  - `finance.ts`: loans, equipment financing, maintenance and the cash-flow forecast
  - `levels.ts`: XP curve, titles and unlocks
  - `missions.ts` / `campaign.ts`: the campaign's mission data, and the logic that measures progress, starts missions (e.g. schedules the storm) and pays rewards. The store runs `checkCampaign` after every action; `advanceDay` runs it at the end of each day.
- `stores/gameStore.ts` also holds world-interaction state: nearby target, open panel, NPC conversation, and short-lived `fx` cues the scene animates.
- `components/` renders: `FarmScene.tsx` composes `world/` (layout, models, buildings, nature, field, actors, weather) and `hud/` panels. The R3F canvas is client-only via `next/dynamic` with `ssr: false`.
  - Per-frame player movement lives in `world/playerState.ts`, outside React, so walking doesn't re-render the tree.
  - In development, `window.__h2h` (store), `window.__player` and `window.__gl` are exposed for debugging.
- `public/models/`: CC0 low-poly models by [Kenney](https://kenney.nl) (Mini Characters, Car Kit, Survival Kit, City Kit Industrial, Food Kit, Nature Kit). Character skin tones are repainted at load time in `world/models.tsx`. The okada and the Nigerian-style block buildings with zinc roofs are built from primitives.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

`game/balance.test.ts` plays scripted seasons across several seeds and checks that attentive farming clearly beats neglect. Rerun it after changing numbers in `config.ts`.

## Build

```bash
npm run build
```

The market and agricultural values are game simulations, not live prices or agronomic guidance.
