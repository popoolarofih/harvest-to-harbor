# Harvest to Harbor: Nigeria - MVP v0.2

A browser-based agricultural simulation built with Next.js, React, TypeScript, React Three Fiber and Zustand.

## Current playable loop

Farm → prepare soil → plant ginger → advance days → manage weather/crop health → harvest → process → sell → earn XP/reputation → complete missions → hire workers / expand warehouse.

## Architecture

- `components/` contains UI and R3F rendering only.
- `game/simulation.ts` contains deterministic business/simulation rules.
- `game/types.ts` contains domain types.
- `stores/gameStore.ts` contains client state/actions.
- The R3F canvas is client-only through Next.js dynamic import with `ssr: false`.

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

## Build

```bash
npm run build
```

## MVP v0.2 additions

- Mission/progression system
- Level and XP
- Dynamic simulated market price
- Weather states: sunny, rain, storm
- Crop health/moisture consequences
- Warehouse capacity
- Workers
- Business upgrades
- Richer 3D farm with trees, labels and crop stages
- Improved responsive HUD
- Market, inventory, business and journal panels

The market and agricultural values are game simulations, not live prices or regulatory guidance.
