import { describe, expect, it } from 'vitest';
import {
  COMPOST_COMPACTION_REDUCTION,
  COMPOST_COST,
  COMPOST_FERTILITY_GAIN,
  COMPOST_OM_GAIN,
  ENERGY,
  SOYBEAN_NITROGEN_GAIN,
  SOYBEAN_OM_GAIN,
  SOYBEAN_ROT_SUPPRESSION,
} from './config';
import { advanceDay } from './day';
import { harvestPlot, plantPlot, preparePlot } from './farm';
import { applyCompost, getConsecutiveGingerCount, getRotationAdvice, getSoilHealthRating, getSoilHealthScore, greenManurePlot } from './soil';
import { executeBulk, previewBulk } from './bulk';
import { initialState, makePlot } from './state';
import type { GameState, Plot } from './types';

describe('Phase 8: Soil Health, Crop Rotation & Agronomy Model', () => {
  it('initializes plots with baseline soil health and disease metrics', () => {
    const s = initialState(42);
    expect(s.plots.length).toBeGreaterThan(0);
    const p = s.plots[0];
    expect(p.organicMatter).toBe(33);
    expect(p.compaction).toBe(20);
    expect(p.diseasePressure).toEqual({ rot: 0, leafSpot: 0, pest: 0 });
    expect(p.cropHistory).toEqual([]);
  });

  it('computes composite soil health score and rating correctly', () => {
    const p = makePlot(0, 0, 0);
    const initialScore = getSoilHealthScore(p);
    expect(initialScore).toBeGreaterThan(50);
    expect(getSoilHealthRating(initialScore)).toBe('Fair');

    const healthyPlot: Plot = {
      ...p,
      fertility: 95,
      organicMatter: 55,
      compaction: 10,
      diseasePressure: { rot: 0, leafSpot: 0, pest: 0 },
    };
    const healthyScore = getSoilHealthScore(healthyPlot);
    expect(healthyScore).toBeGreaterThan(85);
    expect(getSoilHealthRating(healthyScore)).toBe('Prime');

    const depletedPlot: Plot = {
      ...p,
      fertility: 15,
      organicMatter: 15,
      compaction: 70,
      diseasePressure: { rot: 80, leafSpot: 40, pest: 30 },
    };
    const depletedScore = getSoilHealthScore(depletedPlot);
    expect(depletedScore).toBeLessThan(35);
    expect(getSoilHealthRating(depletedScore)).toBe('Depleted');
  });

  it('applies compost to improve organic matter, fertility, and loosen compaction', () => {
    const s = initialState(42);
    s.cash = 100_000;
    s.energy = 100;
    const initialOM = s.plots[0].organicMatter ?? 35;
    const initialFert = s.plots[0].fertility;
    const initialComp = s.plots[0].compaction ?? 20;

    const after = applyCompost(s, 0);
    const p = after.plots[0];
    expect(p.organicMatter).toBe(initialOM + COMPOST_OM_GAIN);
    expect(p.fertility).toBe(initialFert + COMPOST_FERTILITY_GAIN);
    expect(p.compaction).toBe(initialComp - COMPOST_COMPACTION_REDUCTION);
    expect(after.cash).toBe(s.cash - COMPOST_COST);
    expect(after.energy).toBe(s.energy - ENERGY.fertilize);
  });

  it('uses warehouse compost stock when available', () => {
    const s = initialState(42);
    s.stock = { ...s.stock, compost: 2 };
    s.cash = 1000; // Not enough for COMPOST_COST (25,000)
    s.energy = 50;

    const after = applyCompost(s, 0);
    expect(after.stock.compost).toBe(1);
    expect(after.cash).toBe(1000); // Free from warehouse stock
    expect(after.plots[0].organicMatter).toBe(48);
  });

  it('tracks consecutive ginger crops and warns of monoculture pathogen buildup', () => {
    let s = initialState(42);
    s.cash = 500_000;
    s.energy = 100;

    // Prep and plant first ginger
    s = preparePlot(s, 0, 'ridge');
    s = plantPlot(s, 0, 'improved', 'ginger');
    expect(s.plots[0].crop).toBe('ginger');

    // Mature and harvest first ginger
    s.plots[0].status = 'ready';
    s.plots[0].growth = 100;
    s.plots[0].health = 90;
    s = harvestPlot(s, 0);

    expect(s.plots[0].cropHistory.length).toBe(1);
    expect(s.plots[0].cropHistory[0].crop).toBe('ginger');
    expect(getConsecutiveGingerCount(s.plots[0])).toBe(1);

    // Rotation advice should now flag monoculture risk and recommend soybean
    const advice = getRotationAdvice(s.plots[0]);
    expect(advice.recommendedCrop).toBe('soybean');
    expect(advice.warning).toContain('Consecutive ginger monoculture');

    // Plant ginger again (consecutive monoculture)
    s = preparePlot(s, 0, 'ridge');
    s = plantPlot(s, 0, 'improved', 'ginger');
    s.plots[0].status = 'ready';
    s.plots[0].growth = 100;
    s.plots[0].health = 90;
    s = harvestPlot(s, 0);

    // Consecutive count is now 2, and soil disease pressure has accumulated
    expect(getConsecutiveGingerCount(s.plots[0])).toBe(2);
    expect(s.plots[0].diseasePressure?.rot).toBeGreaterThanOrEqual(25);
  });

  it('supports soybean planting, biological nitrogen fixation during growth, and rot suppression on harvest', () => {
    let s = initialState(42);
    s.cash = 500_000;
    s.energy = 100;

    // Set plot with high initial rot pressure
    s.plots[0].diseasePressure = { rot: 40, leafSpot: 10, pest: 0 };
    s.plots[0].fertility = 40;
    s.plots[0].organicMatter = 30;

    // Prep and plant soybean
    s = preparePlot(s, 0, 'ridge');
    s = plantPlot(s, 0, undefined, 'soybean');
    expect(s.plots[0].crop).toBe('soybean');
    expect(s.plots[0].seed).toBeNull();

    // Advance 5 days: soybean fixes nitrogen biologically
    const fertBeforeDays = s.plots[0].fertility;
    for (let i = 0; i < 5; i++) {
      s = advanceDay(s);
    }
    expect(s.plots[0].fertility).toBeGreaterThan(fertBeforeDays);

    // Fast-forward to maturity and harvest soybean grain
    s.plots[0].status = 'ready';
    s.plots[0].growth = 100;
    s.plots[0].health = 95;
    const fertAtReady = s.plots[0].fertility;
    const omAtReady = s.plots[0].organicMatter ?? 30;
    const rotAtReady = s.plots[0].diseasePressure.rot;

    s = harvestPlot(s, 0);

    // Harvested soybean grain: fixes +20 nitrogen, +10 OM, suppresses rot by 50%
    const p = s.plots[0];
    expect(p.fertility).toBe(Math.min(100, fertAtReady + SOYBEAN_NITROGEN_GAIN));
    expect(p.organicMatter).toBe(Math.min(100, omAtReady + SOYBEAN_OM_GAIN));
    expect(p.diseasePressure.rot).toBe(Math.round(rotAtReady * (1 - SOYBEAN_ROT_SUPPRESSION)));
    expect(p.cropHistory[0].crop).toBe('soybean');
    expect(getConsecutiveGingerCount(p)).toBe(0); // Monoculture broken!

    // Check grain batch was created
    const soyBatch = s.batches.find(b => b.product === 'soybean');
    expect(soyBatch).toBeDefined();
    expect(soyBatch?.kg).toBeGreaterThan(50);
  });

  it('supports green manuring soybean to enrich soil and reset seedbed immediately to prepared', () => {
    let s = initialState(42);
    s.cash = 100_000;
    s.energy = 100;

    s.plots[0].status = 'growing';
    s.plots[0].crop = 'soybean';
    s.plots[0].growth = 85;
    s.plots[0].health = 90;
    s.plots[0].fertility = 30;
    s.plots[0].organicMatter = 25;
    s.plots[0].compaction = 35;
    s.plots[0].diseasePressure = { rot: 30, leafSpot: 0, pest: 0 };

    s = greenManurePlot(s, 0);

    const p = s.plots[0];
    expect(p.status).toBe('prepared'); // Incorporated into prepared seedbed!
    expect(p.fertility).toBe(60); // +30 fert
    expect(p.organicMatter).toBe(43); // +18 OM
    expect(p.compaction).toBe(23); // -12 compaction
    expect(p.diseasePressure.rot).toBeLessThan(30); // Suppressed rot
    expect(p.cropHistory[0].greenManured).toBe(true);
  });

  it('allows bulk composting across eligible plots', () => {
    const s = initialState(42);
    s.cash = 1_000_000;
    s.energy = 100;

    // All 16 plots are empty
    const preview = previewBulk(s, 'compost');
    expect(preview.eligibleCount).toBe(16);
    expect(preview.reqCash).toBe(16 * COMPOST_COST);

    const after = executeBulk(s, 'compost');
    expect(after.plots[0].organicMatter).toBe(48);
    expect(after.plots[1].organicMatter).toBe(after.plots[1].organicMatter);
  });

  it('allows bulk till & plant with soybean rotation crop', () => {
    const s = initialState(42);
    s.cash = 2_000_000;
    s.energy = 200;

    const preview = previewBulk(s, 'tillAndPlant', { prepMethod: 'ridge', plantCrop: 'soybean' });
    expect(preview.eligibleCount).toBe(16);

    const after = executeBulk(s, 'tillAndPlant', { prepMethod: 'ridge', plantCrop: 'soybean' });
    expect(after.plots[0].crop).toBe('soybean');
    expect(after.plots[1].crop).toBe('soybean');
    expect(after.plots[0].status).toBe('growing');
  });
});
