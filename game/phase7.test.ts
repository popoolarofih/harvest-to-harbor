import { describe, expect, it } from 'vitest';
import {
  buyInputStock,
  createRng,
  executeBulk,
  getBaseItemPrice,
  getInputPriceTrend,
  getInputUnitPrice,
  grindBatch,
  initialState,
  plantPlot,
  preparePlot,
  previewBulk,
  previewPurchase,
  releaseReservation,
  reserveStock,
  runAutomation,
  sellBatch,
  storedKg,
  warehouseCapacity,
  type Contract,
  type GameState,
} from './simulation';

describe('Phase 7: Field Automation, Factory Automation & Inventory', () => {
  describe('7.4 Warehouse Inventory & Bulk Purchasing', () => {
    it('calculates deterministic seasonal price variation over 60 days', () => {
      const s1: GameState = { ...initialState(), day: 1 };
      const s30: GameState = { ...initialState(), day: 30 };
      const s60: GameState = { ...initialState(), day: 60 };

      const baseSeed = getBaseItemPrice('local');
      const p1 = getInputUnitPrice(s1, 'local');
      const p30 = getInputUnitPrice(s30, 'local');
      const p60 = getInputUnitPrice(s60, 'local');

      // Day 1 / 60 is peak planting demand, Day 30 is mid-season lull
      expect(p1).toBeGreaterThan(baseSeed);
      expect(p30).toBeLessThan(baseSeed);
      expect(Math.abs(p1 - p60)).toBeLessThan(100); // 60-day cycle

      // Price trends
      expect(getInputPriceTrend({ ...initialState(), day: 10 })).toBe('falling');
      expect(getInputPriceTrend({ ...initialState(), day: 45 })).toBe('rising');
    });

    it('applies tiered volume discounts for bulk bundles', () => {
      const s = { ...initialState(), day: 1 };
      const p1 = previewPurchase(s, 'local', 1);
      const p5 = previewPurchase(s, 'local', 5);
      const p10 = previewPurchase(s, 'local', 10);
      const p25 = previewPurchase(s, 'local', 25);

      expect(p1.discountRate).toBe(0);
      expect(p5.discountRate).toBe(0.03);
      expect(p10.discountRate).toBe(0.06);
      expect(p25.discountRate).toBe(0.10);

      expect(p25.totalCost).toBeLessThan(p1.unitPrice * 25);
    });

    it('enforces warehouse weight capacity for inputs', () => {
      const s: GameState = {
        ...initialState(),
        cash: 10_000_000,
        upgrades: { ...initialState().upgrades, warehouseLevel: 0 }, // 2,500 kg base cap
      };
      const cap = warehouseCapacity(s);
      expect(cap).toBe(2_500);

      // Attempt to buy 60 fertilizer bags (60 * 50kg = 3,000 kg > 2,500 kg)
      const plan = previewPurchase(s, 'fertilizer', 60);
      expect(plan.fits).toBe(false);

      const res = buyInputStock(s, 'fertilizer', 60);
      expect(res.toast).toContain('Warehouse capacity exceeded');
      expect(res.stock.fertilizer).toBe(0);

      // Successful purchase of 10 bags (500 kg)
      const ok = buyInputStock(s, 'fertilizer', 10);
      expect(ok.stock.fertilizer).toBe(10);
      expect(storedKg(ok)).toBe(500);
    });

    it('consumes warehouse stock before spending cash in manual planting and fertilizing', () => {
      let s: GameState = {
        ...initialState(),
        cash: 50_000,
        stock: { ...initialState().stock, local: 2, improved: 0, certified: 0, fertilizer: 1 },
      };

      // Prepare plots first
      s = preparePlot(s, 0, 'clear');
      s = preparePlot(s, 1, 'clear');
      s = preparePlot(s, 2, 'clear');

      // Plant plot 0 with local setts from stock
      const cashBeforePlanting = s.cash;
      s = plantPlot(s, 0, 'local');
      expect(s.stock.local).toBe(1);
      expect(s.cash).toBe(cashBeforePlanting); // Zero cash deducted because stock was available!

      // Plant plot 1 from stock
      s = plantPlot(s, 1, 'local');
      expect(s.stock.local).toBe(0);
      expect(s.cash).toBe(cashBeforePlanting);

      // Plant plot 2 when stock is 0 -> should charge cash
      s = plantPlot(s, 2, 'local');
      expect(s.stock.local).toBe(0);
      expect(s.cash).toBeLessThan(cashBeforePlanting);
    });
  });

  describe('7.1 Bulk Field Operations', () => {
    it('previews and executes bulk till & plant across empty plots using warehouse stock first', () => {
      let s: GameState = {
        ...initialState(),
        cash: 500_000,
        energy: 100,
        stock: { ...initialState().stock, local: 5, improved: 0, certified: 0, fertilizer: 0 },
      };

      const prev = previewBulk(s, 'tillAndPlant', { prepMethod: 'clear', plantSeed: 'local' });
      expect(prev.eligibleCount).toBe(16);
      expect(prev.reqStock.local).toBe(5); // all 5 setts used

      const executed = executeBulk(
        s,
        'tillAndPlant',
        { prepMethod: 'clear', plantSeed: 'local' },
        false,
        prev.token
      );

      expect(executed.stock.local).toBe(0);
      expect(executed.plots.every(p => p.status === 'growing')).toBe(true);
      expect(executed.opSeq).toBe(prev.token + 1);

      // Double-execution with same token is prevented
      const doubleExec = executeBulk(
        executed,
        'tillAndPlant',
        { prepMethod: 'clear', plantSeed: 'local' },
        false,
        prev.token
      );
      expect(doubleExec.toast).toContain('already executed');
    });

    it('respects partial execution when resources or cash are constrained', () => {
      let s: GameState = {
        ...initialState(),
        cash: 18_000, // can only afford ~1 plot prep + seed
        energy: 20,
        water: 5000,
      };

      const prev = previewBulk(s, 'tillAndPlant', { prepMethod: 'clear', plantSeed: 'local' });
      expect(prev.eligibleCount).toBe(16);
      expect(prev.canAfford).toBe(false);

      // Full execution fails without partial
      const failed = executeBulk(
        s,
        'tillAndPlant',
        { prepMethod: 'clear', plantSeed: 'local' },
        false,
        prev.token
      );
      expect(failed.toast).toContain('Not enough energy');

      // Partial execution processes only what is affordable
      const partial = executeBulk(
        s,
        'tillAndPlant',
        { prepMethod: 'clear', plantSeed: 'local' },
        true,
        prev.token
      );
      const growingCount = partial.plots.filter(p => p.status === 'growing').length;
      expect(growingCount).toBeGreaterThan(0);
      expect(growingCount).toBeLessThan(16);
      expect(partial.toast).toContain('Tilled & planted');
    });
  });

  describe('7.3 Inventory Reservation', () => {
    it('locks and splits batches for contracts, preventing unauthorized sale or milling', () => {
      let s: GameState = {
        ...initialState(),
        upgrades: { ...initialState().upgrades, mill: true },
        nextId: 10,
        batches: [
          {
            id: 1,
            product: 'dried',
            kg: 500,
            moisture: 9,
            quality: 85,
            soiled: false,
            createdDay: 1,
            packaging: 'sealed',
          },
        ],
      };

      const c: Contract = {
        id: 101,
        buyerId: 'abujaSpice',
        product: 'dried',
        minGrade: 'B',
        kg: 200,
        currency: 'NGN',
        pricePerKg: 2500,
        deadlineDay: 20,
        latePenalty: 0.1,
        terms: 'onDelivery',
        status: 'active',
        offerExpiresDay: 10,
        advancePaid: 0,
      };
      s = { ...s, contracts: [c] };

      // Reserve 200 kg for contract 101
      s = reserveStock(s, 101);

      // Batch 1 should be split: 200 kg reserved for 101, 300 kg unreserved
      expect(s.batches.length).toBe(2);
      const reservedBatch = s.batches.find(b => b.reservedFor === 101);
      const freeBatch = s.batches.find(b => !b.reservedFor);

      expect(reservedBatch).toBeDefined();
      expect(reservedBatch?.kg).toBe(200);
      expect(freeBatch?.kg).toBe(300);

      // Attempting to sell the reserved batch fails
      if (reservedBatch) {
        const sold = sellBatch(s, reservedBatch.id, 'dryTraders');
        expect(sold.toast).toContain('reserved');

        // Attempting to grind the reserved batch fails
        const ground = grindBatch(s, reservedBatch.id, 'bulk');
        expect(ground.toast).toContain('reserved');
      }

      // Releasing the reservation clears reservedFor
      s = releaseReservation(s, 101);
      expect(s.batches.every(b => !b.reservedFor)).toBe(true);
    });
  });

  describe('7.2 Factory Automation', () => {
    it('auto-mills safe dried ginger and honors moisture guards', () => {
      let s: GameState = {
        ...initialState(),
        workers: 2,
        upgrades: { ...initialState().upgrades, mill: true, factory: true },
        automation: {
          ...initialState().automation,
          processingWorkers: 2, // 2 * 400 = 800 kg capacity
          autoMill: true,
          millPackaging: 'bulk',
        },
        batches: [
          // Batch 1: safe moisture (9%) -> should be auto-milled
          {
            id: 1,
            product: 'dried',
            kg: 300,
            moisture: 9,
            quality: 85,
            soiled: false,
            createdDay: 1,
            packaging: 'bulk',
          },
          // Batch 2: damp (13% > 10% max) -> must NOT be milled (caking risk)
          {
            id: 2,
            product: 'dried',
            kg: 300,
            moisture: 13,
            quality: 80,
            soiled: false,
            createdDay: 1,
            packaging: 'bulk',
          },
        ],
      };

      const { state: ran, summary } = runAutomation(s, 'sunny', createRng(1));

      // Batch 1 converted to powder (300 * 0.97 = 291 kg)
      expect(summary.milledBatches).toBe(1);
      expect(summary.milledKg).toBe(291);
      expect(ran.batches.some(b => b.product === 'powder' && b.kg === 291)).toBe(true);

      // Damp batch remains dried and unmilled
      expect(ran.batches.some(b => b.id === 2 && b.product === 'dried')).toBe(true);
      expect(summary.blocked?.some(m => m.includes('caking'))).toBe(true);
    });

    it('auto-reserves inventory for active export contracts', () => {
      let s: GameState = {
        ...initialState(),
        workers: 2,
        automation: {
          ...initialState().automation,
          autoReserve: true,
        },
        batches: [
          {
            id: 10,
            product: 'dried',
            kg: 400,
            moisture: 9.5,
            quality: 90,
            soiled: false,
            createdDay: 5,
            packaging: 'sealed',
          },
        ],
        contracts: [
          {
            id: 101,
            buyerId: 'abujaSpice',
            product: 'dried',
            minGrade: 'B',
            kg: 300,
            currency: 'NGN',
            pricePerKg: 3200,
            deadlineDay: 30,
            latePenalty: 0.1,
            terms: 'onDelivery',
            status: 'active',
            offerExpiresDay: 10,
            advancePaid: 0,
          },
        ],
      };

      const { state: ran, summary } = runAutomation(s, 'sunny', createRng(1));
      expect(summary.reservedKg).toBe(300);
      const reserved = ran.batches.find(b => b.reservedFor === 101);
      expect(reserved).toBeDefined();
      expect(reserved?.kg).toBe(300);
    });
  });
});
