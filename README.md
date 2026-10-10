# Harvest to Harbor: Nigeria - MVP v0.3

A browser-based agricultural simulation built with Next.js, React, TypeScript, React Three Fiber and Zustand.

## Current playable loop

Pick a plot (upland or stream-bottom) → clear or ridge the soil → choose seed quality → water, fertilize, inspect and treat through the season while reading a 5-day forecast → decide when to harvest (early, on time, or wait for more yield at rising risk) → sell fresh to one of several buyers, or wash, slice and sun-dry it → inspect moisture and grade → sell dried ginger → manage wages, insurance and upgrades.

Every action trades off cash, energy (labour) and risk. Problems such as pests, leaf spot and soft rot start hidden and only show up through inspection or once the damage is visible.

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
