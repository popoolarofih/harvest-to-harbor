import { COMPOST_COST, FERTILIZER_COST, SEEDS, SOYBEAN_SEED_COST, UPGRADES, type UpgradeId } from './config';
import { totalDebt } from './finance';
import type { GameState, LedgerCategory, LedgerEntry, LedgerEntryType } from './types';

/**
 * Idempotently records a financial transaction into the authoritative simulation ledger.
 * Guarded against duplicates via explicit transaction ID.
 */
export function recordLedgerEntry(
  s: GameState,
  entry: {
    id?: string;
    day?: number;
    category: LedgerCategory;
    amount: number;
    referenceId?: string | number;
    description: string;
    finalized?: boolean;
  }
): GameState {
  if (entry.amount <= 0 || !Number.isFinite(entry.amount)) return s;
  const ledger = Array.isArray(s.ledger) ? [...s.ledger] : [];
  const id = entry.id ?? `txn-d${entry.day ?? s.day}-${s.nextId}-${ledger.length + 1}`;

  // Idempotency: skip if transaction with this id already recorded
  if (ledger.some(t => t.id === id)) {
    return s;
  }

  const category = entry.category;
  let type: LedgerEntryType = 'opex';
  let direction: 'inflow' | 'outflow' = 'outflow';

  switch (category) {
    case 'domesticSales':
    case 'exportSales':
    case 'processingRevenue':
      type = 'revenue';
      direction = 'inflow';
      break;
    case 'insurancePayout':
      type = 'revenue';
      direction = 'inflow';
      break;
    case 'loanProceeds':
      type = 'financing';
      direction = 'inflow';
      break;
    case 'inputCost':
    case 'processingPackaging':
      type = 'cogs';
      direction = 'outflow';
      break;
    case 'fuelUtilities':
    case 'wages':
    case 'equipmentMaintenance':
    case 'logistics':
    case 'insurancePremium':
      type = 'opex';
      direction = 'outflow';
      break;
    case 'loanInterest':
    case 'loanPenalty':
    case 'loanRepayment':
      type = 'financing';
      direction = 'outflow';
      break;
    case 'capitalExpenditure':
      type = 'capex';
      direction = 'outflow';
      break;
  }

  const newEntry: LedgerEntry = {
    id,
    day: entry.day ?? s.day,
    category,
    type,
    amount: Math.round(entry.amount),
    direction,
    referenceId: entry.referenceId !== undefined ? String(entry.referenceId) : undefined,
    description: entry.description,
    finalized: entry.finalized ?? true,
  };

  return {
    ...s,
    ledger: [...ledger, newEntry],
  };
}

/**
 * Consistent inventory valuation method:
 * - Finished batches valued by grade-adjusted market price.
 * - Raw inputs (seed, fertilizer, compost) valued at standard cost basis.
 * - Drying batches valued by dry matter at base fresh market price.
 */
export function calculateInventoryValuation(s: GameState): number {
  let val = 0;
  // Warehouse finished inventory
  for (const b of s.batches ?? []) {
    const basePrice = s.market[b.product] ?? 500;
    const gradeMult = (b.quality ?? 80) >= 80 ? 1.0 : (b.quality ?? 80) >= 50 ? 0.85 : 0.65;
    val += b.kg * basePrice * gradeMult;
  }
  // Warehouse input stock
  if (s.stock) {
    val += (s.stock.local ?? 0) * SEEDS.local.cost;
    val += (s.stock.improved ?? 0) * SEEDS.improved.cost;
    val += (s.stock.certified ?? 0) * SEEDS.certified.cost;
    val += (s.stock.soybean ?? 0) * SOYBEAN_SEED_COST;
    val += (s.stock.fertilizer ?? 0) * FERTILIZER_COST;
    val += (s.stock.compost ?? 0) * COMPOST_COST;
  }
  // Work-in-progress drying racks
  const freshPrice = s.market?.fresh ?? 500;
  for (const j of s.dryingJobs ?? []) {
    val += j.dryMatterKg * freshPrice;
  }
  return Math.round(val);
}

/**
 * Capital valuation of installed fixed assets (upgrades and equipment).
 */
export function calculateEquipmentValuation(s: GameState): number {
  let val = 0;
  for (const [id, installed] of Object.entries(s.upgrades ?? {})) {
    if (typeof installed === 'boolean' && installed) {
      val += UPGRADES[id as UpgradeId]?.cost ?? 0;
    } else if (typeof installed === 'number' && installed > 0) {
      val += (UPGRADES[id as UpgradeId]?.cost ?? 0) * installed;
    }
  }
  return val;
}

/**
 * Accounts Receivable: delivered export shipments awaiting payment (e.g. net30).
 */
export function calculateAccountsReceivable(s: GameState): number {
  return (s.shipments ?? [])
    .filter(sh => sh.stage === 'delivered' && sh.payout !== null && (sh.payDay === null || sh.payDay > s.day))
    .reduce((sum, sh) => sum + (sh.payout ?? 0), 0);
}

/**
 * Contract liabilities: advance payments collected for export contracts not yet fulfilled.
 */
export function calculateContractLiabilities(s: GameState): number {
  return (s.contracts ?? [])
    .filter(c => (c.status === 'active' || c.status === 'shipping') && c.advancePaid > 0)
    .reduce((sum, c) => sum + c.advancePaid, 0);
}

export interface IncomeStatement {
  domesticSales: number;
  exportSales: number;
  processingRevenue: number;
  totalRevenue: number;

  inputCosts: number;
  processingPackaging: number;
  costOfGoodsSold: number;
  grossMargin: number;

  fuelUtilities: number;
  wages: number;
  equipmentMaintenance: number;
  logistics: number;
  insurancePremiums: number;
  totalOperatingExpenses: number;

  operatingProfit: number;

  loanInterest: number;
  loanPenalties: number;
  insurancePayouts: number;
  netFinancingCost: number;

  netProfit: number;
}

export interface BalanceSheet {
  cash: number;
  accountsReceivable: number;
  inventoryValuation: number;
  equipmentValuation: number;
  totalAssets: number;

  outstandingDebt: number;
  contractLiabilities: number;
  totalLiabilities: number;

  equity: number;
}

export interface CashFlowStatement {
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
}

export interface FinancialInsight {
  type: 'good' | 'warn' | 'info';
  title: string;
  message: string;
}

export interface FinancialReport {
  periodLabel: string;
  fromDay: number;
  toDay: number;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  roi: number; // Return on Investment percentage
  operatingMargin: number; // percentage
  netMargin: number; // percentage
  insights: FinancialInsight[];
}

/**
 * Generates reconciled multi-period financial statements from the simulation ledger.
 */
export function generateFinancialReport(
  s: GameState,
  fromDay = 1,
  toDay = s.day,
  periodLabel = 'Current Season'
): FinancialReport {
  const ledger = Array.isArray(s.ledger) ? s.ledger : [];
  const entries = ledger.filter(t => t.day >= fromDay && t.day <= toDay);

  const sumCat = (cat: LedgerCategory) =>
    entries.filter(t => t.category === cat).reduce((sum, t) => sum + t.amount, 0);

  // Income Statement
  const domesticSales = sumCat('domesticSales');
  const exportSales = sumCat('exportSales');
  const processingRevenue = sumCat('processingRevenue');
  const totalRevenue = domesticSales + exportSales + processingRevenue;

  const inputCosts = sumCat('inputCost');
  const processingPackaging = sumCat('processingPackaging');
  const costOfGoodsSold = inputCosts + processingPackaging;
  const grossMargin = totalRevenue - costOfGoodsSold;

  const fuelUtilities = sumCat('fuelUtilities');
  const wages = sumCat('wages');
  const equipmentMaintenance = sumCat('equipmentMaintenance');
  const logistics = sumCat('logistics');
  const insurancePremiums = sumCat('insurancePremium');
  const totalOperatingExpenses = fuelUtilities + wages + equipmentMaintenance + logistics + insurancePremiums;

  const operatingProfit = grossMargin - totalOperatingExpenses;

  const loanInterest = sumCat('loanInterest');
  const loanPenalties = sumCat('loanPenalty');
  const insurancePayouts = sumCat('insurancePayout');
  const netFinancingCost = loanInterest + loanPenalties;

  const netProfit = operatingProfit - netFinancingCost + insurancePayouts;

  const incomeStatement: IncomeStatement = {
    domesticSales,
    exportSales,
    processingRevenue,
    totalRevenue,
    inputCosts,
    processingPackaging,
    costOfGoodsSold,
    grossMargin,
    fuelUtilities,
    wages,
    equipmentMaintenance,
    logistics,
    insurancePremiums,
    totalOperatingExpenses,
    operatingProfit,
    loanInterest,
    loanPenalties,
    insurancePayouts,
    netFinancingCost,
    netProfit,
  };

  // Balance Sheet (As of toDay)
  const accountsReceivable = calculateAccountsReceivable(s);
  const inventoryValuation = calculateInventoryValuation(s);
  const equipmentValuation = calculateEquipmentValuation(s);
  const totalAssets = s.cash + accountsReceivable + inventoryValuation + equipmentValuation;

  const outstandingDebt = totalDebt(s);
  const contractLiabilities = calculateContractLiabilities(s);
  const totalLiabilities = outstandingDebt + contractLiabilities;

  const equity = totalAssets - totalLiabilities;

  const balanceSheet: BalanceSheet = {
    cash: s.cash,
    accountsReceivable,
    inventoryValuation,
    equipmentValuation,
    totalAssets,
    outstandingDebt,
    contractLiabilities,
    totalLiabilities,
    equity,
  };

  // Cash Flow Statement
  const operatingInflows = entries.filter(t => t.type === 'revenue').reduce((sum, t) => sum + t.amount, 0);
  const operatingOutflows = entries.filter(t => t.type === 'cogs' || t.type === 'opex').reduce((sum, t) => sum + t.amount, 0);
  const operatingCashFlow = operatingInflows - operatingOutflows;

  const investingCashFlow = - entries.filter(t => t.type === 'capex').reduce((sum, t) => sum + t.amount, 0);

  const financingInflows = sumCat('loanProceeds');
  const financingOutflows = sumCat('loanRepayment') + sumCat('loanInterest') + sumCat('loanPenalty');
  const financingCashFlow = financingInflows - financingOutflows;

  const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

  const cashFlow: CashFlowStatement = {
    operatingCashFlow,
    investingCashFlow,
    financingCashFlow,
    netCashFlow,
    beginningCash: s.cash - netCashFlow,
    endingCash: s.cash,
  };

  // Margins & ROI
  const operatingMargin = totalRevenue > 0 ? Math.round((operatingProfit / totalRevenue) * 100) : 0;
  const netMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
  const investedCapital = Math.max(50_000, 50_000 + Math.abs(investingCashFlow) + costOfGoodsSold + totalOperatingExpenses);
  const roi = Math.round((netProfit / investedCapital) * 100);

  const report: FinancialReport = {
    periodLabel,
    fromDay,
    toDay,
    incomeStatement,
    balanceSheet,
    cashFlow,
    roi,
    operatingMargin,
    netMargin,
    insights: [],
  };

  report.insights = analyzeFinancialInsights(s, report);
  return report;
}

/**
 * Derives actionable business insights from ledger data without hallucinations.
 */
export function analyzeFinancialInsights(s: GameState, report: FinancialReport): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const inc = report.incomeStatement;
  const bal = report.balanceSheet;

  if (inc.totalRevenue > 0) {
    if (inc.netProfit > 0) {
      insights.push({
        type: 'good',
        title: 'Profitable Operations',
        message: `Your enterprise generated +₦${inc.netProfit.toLocaleString()} in net profit (${report.netMargin}% net margin).`,
      });
    } else {
      insights.push({
        type: 'warn',
        title: 'Operating Deficit',
        message: `Your business incurred a net loss of -₦${Math.abs(inc.netProfit).toLocaleString()} this period. Review fixed costs and input procurement.`,
      });
    }
  }

  // Processing vs Utility / Wages Insight
  if (inc.processingPackaging > 0 && inc.processingRevenue > 0) {
    const processingCostShare = inc.wages + inc.fuelUtilities;
    if (processingCostShare > 0.4 * inc.totalRevenue) {
      insights.push({
        type: 'info',
        title: 'Processing Overhead',
        message: `Value-addition processing boosted revenue, but diesel utilities and crew payroll represent ${(Math.round((processingCostShare / inc.totalRevenue) * 100))}% of gross sales.`,
      });
    }
  }

  // Export Logistics Risk Insight
  if (inc.exportSales > 0 && inc.logistics > 0.2 * inc.exportSales) {
    insights.push({
      type: 'warn',
      title: 'Export Haulage Costs',
      message: `Export contracts delivered foreign exchange, but road haulage and port charges absorbed ₦${inc.logistics.toLocaleString()} (${Math.round((inc.logistics / inc.exportSales) * 100)}% of export revenue).`,
    });
  }

  // Receivables liquidity constraint
  if (bal.accountsReceivable > bal.cash && bal.accountsReceivable > 0) {
    insights.push({
      type: 'warn',
      title: 'Liquidity Constrained by Receivables',
      message: `Unpaid export invoices of ₦${bal.accountsReceivable.toLocaleString()} exceed cash on hand. Consider short-term BOA financing until buyers remit.`,
    });
  }

  // Equipment maintenance impact
  if (inc.equipmentMaintenance > 0.15 * inc.totalRevenue && inc.totalRevenue > 0) {
    insights.push({
      type: 'warn',
      title: 'Maintenance Burden',
      message: `Equipment maintenance (₦${inc.equipmentMaintenance.toLocaleString()}) is eroding margins. Keep emitters serviced before emergencies occur.`,
    });
  }

  // Soil health & rotation insight
  const hasSoybean = s.plots.some(p => p.cropHistory?.some(h => h.crop === 'soybean'));
  if (hasSoybean) {
    insights.push({
      type: 'good',
      title: 'Agronomic Soil Investment',
      message: `Soybean rotation and green manure lowered short-term ginger output but built biological nitrogen and reduced monoculture pathogen pressure.`,
    });
  }

  return insights;
}

/**
 * Returns available monthly and seasonal reporting periods.
 */
export function getAvailablePeriods(s: GameState): { fromDay: number; toDay: number; label: string; kind: 'all' | 'season' | 'month' }[] {
  const periods: { fromDay: number; toDay: number; label: string; kind: 'all' | 'season' | 'month' }[] = [
    { fromDay: 1, toDay: s.day, label: `All-Time (Days 1–${s.day})`, kind: 'all' },
  ];

  const currentSeason = Math.floor((s.day - 1) / 60) + 1;
  for (let szn = 1; szn <= currentSeason; szn++) {
    const sznStart = (szn - 1) * 60 + 1;
    const sznEnd = Math.min(s.day, szn * 60);
    periods.push({
      fromDay: sznStart,
      toDay: sznEnd,
      label: `Season ${szn} (Days ${sznStart}–${sznEnd})`,
      kind: 'season',
    });
  }

  const currentMonth = Math.floor((s.day - 1) / 30) + 1;
  for (let m = 1; m <= currentMonth; m++) {
    const mStart = (m - 1) * 30 + 1;
    const mEnd = Math.min(s.day, m * 30);
    periods.push({
      fromDay: mStart,
      toDay: mEnd,
      label: `Month ${m} (Days ${mStart}–${mEnd})`,
      kind: 'month',
    });
  }

  return periods;
}

/**
 * Generates CSV export text for the audit ledger.
 */
export function exportLedgerCsv(ledger: LedgerEntry[]): string {
  const headers = ['ID', 'Day', 'Category', 'Type', 'Direction', 'Amount (NGN)', 'Reference', 'Description'];
  const rows = (ledger ?? []).map(t => [
    t.id,
    t.day,
    t.category,
    t.type,
    t.direction,
    t.amount,
    t.referenceId ?? '',
    `"${(t.description ?? '').replace(/"/g, '""')}"`,
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
