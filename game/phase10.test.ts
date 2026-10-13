import { describe, expect, it } from 'vitest';
import {
  advanceDay, calculateAccountsReceivable, calculateContractLiabilities, calculateEquipmentValuation,
  calculateInventoryValuation, exportLedgerCsv, generateFinancialReport, getAvailablePeriods, initialState,
  money, recordLedgerEntry, repayLoan, sellBatch, takeLoan,
} from './simulation';
import { parseSave, restoreGame, serializeSave, type SaveMeta } from './save';
import type { GameState } from './types';

describe('Phase 10: Financial Reporting & Audit Ledger', () => {
  it('idempotently records transactions without duplication', () => {
    let s = initialState();
    expect(s.ledger).toEqual([]);

    s = recordLedgerEntry(s, {
      id: 'txn-manual-1',
      day: 1,
      category: 'domesticSales',
      amount: 45_000,
      description: 'Test sale',
    });

    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0]).toMatchObject({
      id: 'txn-manual-1',
      day: 1,
      category: 'domesticSales',
      type: 'revenue',
      direction: 'inflow',
      amount: 45_000,
      description: 'Test sale',
      finalized: true,
    });

    // Recording again with the same id is a no-op (idempotent)
    s = recordLedgerEntry(s, {
      id: 'txn-manual-1',
      day: 1,
      category: 'domesticSales',
      amount: 45_000,
      description: 'Duplicate test sale',
    });

    expect(s.ledger).toHaveLength(1);
  });

  it('keeps loans, debt, and revenue distinct (loans are financing, not revenue)', () => {
    let s = { ...initialState(), level: 5 };
    const startCash = s.cash;

    // Borrow ₦500,000 from Bank of Agriculture
    s = takeLoan(s, 0); // BANK_LOANS[0] = ₦500,000
    expect(s.cash).toBe(startCash + 500_000);

    const report = generateFinancialReport(s, 1, s.day);
    // Loan proceed is cash inflow, but NOT operating revenue!
    expect(report.incomeStatement.totalRevenue).toBe(0);
    expect(report.incomeStatement.operatingProfit).toBe(0);
    expect(report.balanceSheet.outstandingDebt).toBe(500_000);
    expect(report.cashFlow.financingCashFlow).toBe(500_000);

    // Verify ledger record
    const loanTxn = s.ledger.find(t => t.category === 'loanProceeds');
    expect(loanTxn).toBeDefined();
    expect(loanTxn?.type).toBe('financing');
    expect(loanTxn?.direction).toBe('inflow');
    expect(loanTxn?.amount).toBe(500_000);
  });

  it('treats loan principal repayment as financing outflow, not operating expense', () => {
    let s = { ...initialState(), level: 5 };
    s = takeLoan(s, 0); // Borrow ₦500,000
    const loan = s.loans[0];

    // Repay ₦40,000 principal
    s = repayLoan(s, loan.id, 40_000);
    expect(s.loans[0].balance).toBe(460_000);

    const report = generateFinancialReport(s, 1, s.day);
    // Repayment must NOT increase operating expenses or reduce operating profit!
    expect(report.incomeStatement.totalOperatingExpenses).toBe(0);
    expect(report.incomeStatement.operatingProfit).toBe(0);
    expect(report.balanceSheet.outstandingDebt).toBe(460_000);

    // Verify ledger record
    const repayTxn = s.ledger.find(t => t.category === 'loanRepayment');
    expect(repayTxn).toBeDefined();
    expect(repayTxn?.type).toBe('financing');
    expect(repayTxn?.direction).toBe('outflow');
    expect(repayTxn?.amount).toBe(40_000);
  });

  it('reconciles Balance Sheet assets, liabilities, and equity accurately', () => {
    let s = initialState();
    s.batches = [
      { id: 99, product: 'fresh', kg: 500, quality: 80, moisture: 80, createdDay: 1 },
    ];
    s.market.fresh = 600;

    const report = generateFinancialReport(s, 1, s.day);
    const bal = report.balanceSheet;

    // Assets = Cash + Receivables + Inventory + Equipment
    expect(bal.cash).toBe(s.cash);
    expect(bal.inventoryValuation).toBeGreaterThan(0);
    expect(bal.totalAssets).toBe(bal.cash + bal.accountsReceivable + bal.inventoryValuation + bal.equipmentValuation);

    // Liabilities = Debt + Contract Advances
    expect(bal.totalLiabilities).toBe(bal.outstandingDebt + bal.contractLiabilities);

    // Equity = Total Assets - Total Liabilities
    expect(bal.equity).toBe(bal.totalAssets - bal.totalLiabilities);
  });

  it('reconciles Cash Flow statement across operating, investing, and financing activities', () => {
    let s = initialState();
    // Simulate day advance with payroll expenses
    s.workers = 2;
    s = advanceDay(s);

    const report = generateFinancialReport(s, 1, s.day);
    const cf = report.cashFlow;

    // Net Cash Flow = Operating + Investing + Financing
    expect(cf.netCashFlow).toBe(cf.operatingCashFlow + cf.investingCashFlow + cf.financingCashFlow);
    expect(cf.endingCash).toBe(s.cash);
  });

  it('generates correct monthly and seasonal multi-period slices', () => {
    let s = initialState();
    s.day = 75; // Season 2, Month 3

    const periods = getAvailablePeriods(s);
    expect(periods.some(p => p.kind === 'all')).toBe(true);
    expect(periods.some(p => p.kind === 'season' && p.label.includes('Season 1'))).toBe(true);
    expect(periods.some(p => p.kind === 'season' && p.label.includes('Season 2'))).toBe(true);
    expect(periods.some(p => p.kind === 'month' && p.label.includes('Month 1'))).toBe(true);
    expect(periods.some(p => p.kind === 'month' && p.label.includes('Month 3'))).toBe(true);
  });

  it('survives serialization, reload, and save round-trip', () => {
    let s = initialState();
    s = recordLedgerEntry(s, {
      id: 'txn-save-test',
      day: 1,
      category: 'domesticSales',
      amount: 75_000,
      description: 'Ginger local sale',
    });

    const meta: SaveMeta = { reportSeenDay: 1, tutorial: { status: 'done', step: 10 } };
    const raw = serializeSave(s, meta);
    const loaded = parseSave(raw);

    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') {
      expect(loaded.save.game.ledger).toHaveLength(1);
      expect(loaded.save.game.ledger[0].id).toBe('txn-save-test');
      expect(loaded.save.game.ledger[0].amount).toBe(75_000);

      const restored = restoreGame(loaded.save);
      expect(restored.ledger).toHaveLength(1);
    }
  });

  it('exports ledger into standard CSV format', () => {
    let s = initialState();
    s = recordLedgerEntry(s, {
      id: 'txn-csv-1',
      day: 2,
      category: 'domesticSales',
      amount: 50_000,
      description: 'Sold fresh ginger to Kafanchan Market',
    });

    const csv = exportLedgerCsv(s.ledger);
    expect(csv).toContain('ID,Day,Category,Type,Direction,Amount (NGN),Reference,Description');
    expect(csv).toContain('txn-csv-1,2,domesticSales,revenue,inflow,50000');
    expect(csv).toContain('"Sold fresh ginger to Kafanchan Market"');
  });
});
