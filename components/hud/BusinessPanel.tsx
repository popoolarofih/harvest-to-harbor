'use client';
import { useState } from 'react';
import {
  BANK_LOANS, EQUIPMENT_FINANCE, HIRE_COST, INSURANCE_PREMIUM, IRRIGATION_REPAIR_COST, LEVEL_REQUIREMENTS, PLOTS_PER_FIELD_WORKER,
  ROLE_DETAILS, TRAIT_DETAILS, UPGRADES, WAGE_PER_DAY, WORKER_ENERGY, availableWorkers, cashForecast,
  creditLimit, dailyFixedCosts, exportLedgerCsv, generateFinancialReport, getAvailablePeriods, isUnlocked,
  loanBlocked, lockedReason, maintenanceCost, maxWorkers, money, ownsUpgrade, tankCapacity,
  totalDebt, totalWages, upgradeBlocked, warehouseCapacity, type CashPoint, type Packaging, type PrepMethod, type SeedTier,
  type UpgradeId, type WorkerCandidate, type WorkerProfile, PRESTIGE_DEFINITIONS,
} from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

/** 30-day cash projection: where the money goes if nothing else is sold. */
function CashChart({ points }: { points: CashPoint[] }) {
  const W = 100, H = 36;
  const values = points.map(p => p.cash);
  const min = Math.min(0, ...values), max = Math.max(...values, 1);
  const x = (i: number) => (i / (points.length - 1)) * W, y = (v: number) => H - ((v - min) / (max - min)) * H;
  const low = points.reduce((a, p) => (p.cash < a.cash ? p : a), points[0]);
  return (
    <div className="cash-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Projected cash over the next 30 days">
        {min < 0 && <rect x={0} y={y(0)} width={W} height={H - y(0)} className="danger-zone" />}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="zero" />
        <polyline points={points.map((p, i) => `${x(i)},${y(p.cash)}`).join(' ')} className="cash-line" />
        {points.map((p, i) => p.note ? <circle key={i} cx={x(i)} cy={y(p.cash)} r={1.2} className="cash-dot" /> : null)}
      </svg>
      <small className={low.cash < 0 ? 'warn' : 'muted'}>
        {low.cash < 0 ? `⚠ Cash runs out around day ${points.find(p => p.cash < 0)!.day}: profitable on paper, but you can't pay the bills.` : `Lowest point: ${money(low.cash)} on day ${low.day}.`}
        {points.filter(p => p.note).slice(0, 3).map(p => ` · Day ${p.day}: ${p.note}`).join('')}
      </small>
    </div>
  );
}

export default function BusinessPanel() {
  const s = useGameStore();
  const f = s.finance;
  const burn = dailyFixedCosts(s);
  const loanNo = loanBlocked(s);

  const [activeTab, setActiveTab] = useState<'reports' | 'operations' | 'crew' | 'prestige'>('reports');
  const [statementView, setStatementView] = useState<'pnl' | 'balance' | 'cashflow' | 'ledger'>('pnl');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'revenue' | 'cogs' | 'opex' | 'financing' | 'capex'>('all');

  const periods = getAvailablePeriods(s);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(0);
  const period = periods[selectedPeriodIdx] ?? periods[0];
  const report = generateFinancialReport(s, period.fromDay, period.toDay, period.label);
  const inc = report.incomeStatement;
  const bal = report.balanceSheet;
  const cf = report.cashFlow;

  const handleExportCsv = () => {
    const csv = exportLedgerCsv(s.ledger ?? []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `h2h_ledger_day${s.day}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredLedger = (s.ledger ?? [])
    .filter(t => t.day >= period.fromDay && t.day <= period.toDay)
    .filter(t => ledgerFilter === 'all' || t.type === ledgerFilter)
    .slice()
    .reverse();

  return <>
    <div className="eyebrow">Agribusiness Management</div>
    <h2>Business & Enterprise Analytics</h2>

    <div className="inventory-grid" style={{ marginBottom: '14px' }}>
      <div><span>Cash on hand</span><b>{money(s.cash)}</b></div>
      <div><span>Daily fixed costs</span><b>{money(burn)}</b></div>
      <div><span>Debt</span><b className={s.creditBlocked ? 'warn' : ''}>{money(totalDebt(s))}</b></div>
      <div><span>Net Profit (Period)</span><b style={{ color: inc.netProfit >= 0 ? 'var(--green)' : 'var(--orange)' }}>{money(inc.netProfit)}</b></div>
    </div>

    {/* Sub-navigation tabs */}
    <div style={{ display: 'flex', gap: '6px', margin: '10px 0 16px', background: '#121a13', padding: '4px', borderRadius: '12px', border: '1px solid #ffffff12' }}>
      <button
        className={`tab ${activeTab === 'reports' ? 'active' : ''}`}
        style={{ flex: 1, padding: '8px 10px', fontSize: '11px', textAlign: 'center' }}
        onClick={() => setActiveTab('reports')}
      >
        📊 Financial Reports & Ledger
      </button>
      <button
        className={`tab ${activeTab === 'operations' ? 'active' : ''}`}
        style={{ flex: 1, padding: '8px 10px', fontSize: '11px', textAlign: 'center' }}
        onClick={() => setActiveTab('operations')}
      >
        ⚙️ Operations & Loans
      </button>
      <button
        className={`tab ${activeTab === 'crew' ? 'active' : ''}`}
        style={{ flex: 1, padding: '8px 10px', fontSize: '11px', textAlign: 'center' }}
        onClick={() => setActiveTab('crew')}
      >
        👥 Specialist Crew ({s.crew?.length ?? 0})
      </button>
      <button
        className={`tab ${activeTab === 'prestige' ? 'active' : ''}`}
        style={{ flex: 1, padding: '8px 10px', fontSize: '11px', textAlign: 'center' }}
        onClick={() => setActiveTab('prestige')}
      >
        🏆 Prestige & Community ({(s.prestige?.length ?? 0)})
      </button>
    </div>

    {activeTab === 'reports' && (
      <div>
        {/* Period Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block' }}>Accounting Period</span>
            <select
              value={selectedPeriodIdx}
              onChange={e => setSelectedPeriodIdx(Number(e.target.value))}
              style={{ background: '#1a241b', color: '#fff', border: '1px solid var(--line)', padding: '6px 10px', borderRadius: '8px', fontSize: '12px' }}
            >
              {periods.map((p, idx) => (
                <option key={idx} value={idx}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportCsv}
            style={{ border: '1px solid #557447', background: '#22341e', color: '#b4e16e', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}
          >
            📥 Export Audit Ledger (CSV)
          </button>
        </div>

        {/* Business Analytics Insights */}
        {report.insights.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
            {report.insights.map((ins, idx) => (
              <div
                key={idx}
                style={{
                  background: ins.type === 'good' ? '#142215' : ins.type === 'warn' ? '#281c12' : '#151d24',
                  border: `1px solid ${ins.type === 'good' ? '#3d6139' : ins.type === 'warn' ? '#744621' : '#2b4457'}`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '12px',
                }}
              >
                <b style={{ color: ins.type === 'good' ? 'var(--green)' : ins.type === 'warn' ? 'var(--orange)' : '#81b7e3' }}>
                  {ins.type === 'good' ? '✓ ' : ins.type === 'warn' ? '⚠ ' : 'ℹ '}
                  {ins.title}
                </b>
                <p style={{ margin: '4px 0 0', color: '#cfd8ce', fontSize: '11px', lineHeight: 1.4 }}>
                  {ins.message}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Executive Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
          <div style={{ background: '#172019', padding: '10px', borderRadius: '10px', border: '1px solid #ffffff10' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Gross Sales</span>
            <b style={{ display: 'block', fontSize: '14px', marginTop: '2px' }}>{money(inc.totalRevenue)}</b>
          </div>
          <div style={{ background: '#172019', padding: '10px', borderRadius: '10px', border: '1px solid #ffffff10' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Operating Profit</span>
            <b style={{ display: 'block', fontSize: '14px', marginTop: '2px', color: inc.operatingProfit >= 0 ? 'var(--green)' : 'var(--orange)' }}>
              {money(inc.operatingProfit)}
            </b>
          </div>
          <div style={{ background: '#172019', padding: '10px', borderRadius: '10px', border: '1px solid #ffffff10' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Net Margin</span>
            <b style={{ display: 'block', fontSize: '14px', marginTop: '2px' }}>{report.netMargin}%</b>
          </div>
          <div style={{ background: '#172019', padding: '10px', borderRadius: '10px', border: '1px solid #ffffff10' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Return on Investment</span>
            <b style={{ display: 'block', fontSize: '14px', marginTop: '2px', color: 'var(--green)' }}>{report.roi}% ROI</b>
          </div>
        </div>

        {/* Statement Switcher */}
        <div style={{ display: 'flex', gap: '4px', margin: '14px 0 10px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
          <button
            className={`tab ${statementView === 'pnl' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '6px 10px' }}
            onClick={() => setStatementView('pnl')}
          >
            Income Statement (P&L)
          </button>
          <button
            className={`tab ${statementView === 'balance' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '6px 10px' }}
            onClick={() => setStatementView('balance')}
          >
            Balance Sheet
          </button>
          <button
            className={`tab ${statementView === 'cashflow' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '6px 10px' }}
            onClick={() => setStatementView('cashflow')}
          >
            Cash Flow Statement
          </button>
          <button
            className={`tab ${statementView === 'ledger' ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '6px 10px' }}
            onClick={() => setStatementView('ledger')}
          >
            Audit Ledger ({filteredLedger.length})
          </button>
        </div>

        {/* 1. Income Statement */}
        {statementView === 'pnl' && (
          <div style={{ background: '#121813', borderRadius: '12px', padding: '12px', border: '1px solid #ffffff10' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Statement of Profit or Loss · {period.label}
            </div>

            <div style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '4px' }}>Revenue:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Domestic Produce Sales</span>
                <b>{money(inc.domesticSales)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Export Contract Invoices & Settlements</span>
                <b>{money(inc.exportSales)}</b>
              </div>
              {inc.processingRevenue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                  <span className="muted">Third-party Processing Services</span>
                  <b>{money(inc.processingRevenue)}</b>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Total Gross Revenue</span>
                <span style={{ color: 'var(--green)' }}>{money(inc.totalRevenue)}</span>
              </div>

              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '8px' }}>Cost of Goods Sold (COGS):</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Seeds, Fertilizer & Compost Inputs</span>
                <span>({money(inc.inputCosts)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Packaging Sacks & Milling Supplies</span>
                <span>({money(inc.processingPackaging)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Gross Margin</span>
                <span>{money(inc.grossMargin)}</span>
              </div>

              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '8px' }}>Operating Expenses (OpEx):</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Diesel Fuel & Borehole Utilities</span>
                <span>({money(inc.fuelUtilities)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Field Labour & Specialist Wages</span>
                <span>({money(inc.wages)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Equipment & Irrigation Maintenance</span>
                <span>({money(inc.equipmentMaintenance)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Road Haulage, Port Demurrage & Logistics</span>
                <span>({money(inc.logistics)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Agricultural Insurance Premiums</span>
                <span>({money(inc.insurancePremiums)})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Total Operating Expenses</span>
                <span>({money(inc.totalOperatingExpenses)})</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                <span>Net Operating Profit</span>
                <span style={{ color: inc.operatingProfit >= 0 ? 'var(--green)' : 'var(--orange)' }}>
                  {money(inc.operatingProfit)}
                </span>
              </div>

              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '8px' }}>Financing & Other Items:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Loan Accrued Interest</span>
                <span>({money(inc.loanInterest)})</span>
              </div>
              {inc.loanPenalties > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                  <span className="warn">Default Penalties</span>
                  <span className="warn">({money(inc.loanPenalties)})</span>
                </div>
              )}
              {inc.insurancePayouts > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                  <span className="muted">Insurance Storm Claim Payouts</span>
                  <span style={{ color: 'var(--green)' }}>+{money(inc.insurancePayouts)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--line)', paddingTop: '8px', marginTop: '6px', fontWeight: 'bold', fontSize: '14px' }}>
                <span>Net Income / Bottom Line</span>
                <span style={{ color: inc.netProfit >= 0 ? 'var(--green)' : 'var(--orange)' }}>
                  {money(inc.netProfit)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Balance Sheet */}
        {statementView === 'balance' && (
          <div style={{ background: '#121813', borderRadius: '12px', padding: '12px', border: '1px solid #ffffff10' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Statement of Financial Position · As of Day {period.toDay}
            </div>

            <div style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '4px' }}>Assets:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Cash & Equivalents</span>
                <b>{money(bal.cash)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Accounts Receivable (Delivered Invoices)</span>
                <b>{money(bal.accountsReceivable)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Warehouse & Processing Inventory (Valuation)</span>
                <b>{money(bal.inventoryValuation)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Equipment & Capital Infrastructure</span>
                <b>{money(bal.equipmentValuation)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Total Assets</span>
                <span style={{ color: 'var(--green)' }}>{money(bal.totalAssets)}</span>
              </div>

              <div style={{ fontWeight: 'bold', color: '#e0ece0', marginTop: '10px' }}>Liabilities:</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Outstanding Bank & Equipment Debt</span>
                <span className={bal.outstandingDebt > 0 ? 'warn' : ''}>{money(bal.outstandingDebt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '12px' }}>
                <span className="muted">Unfulfilled Contract Advance Liabilities</span>
                <span>{money(bal.contractLiabilities)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Total Liabilities</span>
                <span>{money(bal.totalLiabilities)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--line)', paddingTop: '8px', marginTop: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                <span>Total Enterprise Equity (Net Worth)</span>
                <span style={{ color: bal.equity >= 0 ? 'var(--green)' : 'var(--orange)' }}>
                  {money(bal.equity)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 3. Cash Flow Statement */}
        {statementView === 'cashflow' && (
          <div style={{ background: '#121813', borderRadius: '12px', padding: '12px', border: '1px solid #ffffff10' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.1em', marginBottom: '8px' }}>
              Cash Flow Statement & 30-Day Liquidity Forecast
            </div>

            <div style={{ display: 'grid', gap: '4px', fontSize: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Cash Flow from Operating Activities</span>
                <b style={{ color: cf.operatingCashFlow >= 0 ? 'var(--green)' : 'var(--orange)' }}>{money(cf.operatingCashFlow)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Cash Flow from Investing Activities (CapEx)</span>
                <b>{money(cf.investingCashFlow)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Cash Flow from Financing Activities</span>
                <b>{money(cf.financingCashFlow)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ffffff15', paddingTop: '4px', fontWeight: 'bold' }}>
                <span>Net Cash Movement</span>
                <span style={{ color: cf.netCashFlow >= 0 ? 'var(--green)' : 'var(--orange)' }}>{money(cf.netCashFlow)}</span>
              </div>
            </div>

            <h4 style={{ margin: '10px 0 6px', fontSize: '13px' }}>Forward 30-Day Cash Forecast</h4>
            <CashChart points={cashForecast(s, 30)} />
          </div>
        )}

        {/* 4. Audit Ledger Table */}
        {statementView === 'ledger' && (
          <div style={{ background: '#121813', borderRadius: '12px', padding: '12px', border: '1px solid #ffffff10' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.1em' }}>
                Audit Ledger Records ({filteredLedger.length})
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['all', 'revenue', 'cogs', 'opex', 'financing', 'capex'] as const).map(flt => (
                  <button
                    key={flt}
                    onClick={() => setLedgerFilter(flt)}
                    style={{
                      background: ledgerFilter === flt ? '#2b3b27' : '#172218',
                      color: ledgerFilter === flt ? 'var(--green)' : 'var(--muted)',
                      border: '1px solid #ffffff12',
                      padding: '3px 7px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {flt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', fontSize: '11px' }}>
              {filteredLedger.length === 0 ? (
                <p className="muted" style={{ padding: '12px', textAlign: 'center' }}>No recorded ledger entries match this period and filter.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', borderBottom: '1px solid #ffffff15' }}>
                      <th style={{ padding: '4px 6px' }}>Day</th>
                      <th style={{ padding: '4px 6px' }}>Category</th>
                      <th style={{ padding: '4px 6px' }}>Description</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #ffffff0a' }}>
                        <td style={{ padding: '6px' }}>D{t.day}</td>
                        <td style={{ padding: '6px', color: 'var(--muted)', textTransform: 'capitalize' }}>{t.category}</td>
                        <td style={{ padding: '6px' }}>{t.description}</td>
                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: t.direction === 'inflow' ? 'var(--green)' : '#e58e72' }}>
                          {t.direction === 'inflow' ? '+' : '-'}{money(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    )}

    {activeTab === 'operations' && (
      <div>
        <h4>Cash flow: next 30 days</h4>
        <CashChart points={cashForecast(s, 30)} />
        <div className="costs breakdown">
          <span>Wages {money(totalWages(s))}/day</span>
          <span>Maintenance {money(maintenanceCost(s))}/day</span>
          {s.upgrades.insurance && <span>Insurance {money(INSURANCE_PREMIUM)}/day</span>}
          <span>Spent on logistics {money(f.logistics)}</span>
          <span>Interest paid {money(f.interest)}</span>
        </div>

        <h4>Farm automation</h4>
        <div className="upgrade">
          <div>
            <b>Drip controller{s.upgrades.irrigation ? ` · ${Math.round(s.irrigationCondition)}% condition` : ''}</b>
            {s.upgrades.irrigation ? <small>Water dry beds below {s.automation.irrigationThreshold}% moisture, up to {s.automation.irrigationDailyLimit} beds each morning.</small> : <small>Install drip irrigation to enable automatic watering.</small>}
          </div>
          {s.upgrades.irrigation && <button onClick={s.repairIrrigation} disabled={s.irrigationCondition >= 100 || s.cash < IRRIGATION_REPAIR_COST}>Service {money(IRRIGATION_REPAIR_COST)}</button>}
        </div>
        {s.upgrades.irrigation && <div className="automation-controls">
          <label>Water at <b>{s.automation.irrigationThreshold}%</b><input type="range" min="25" max="60" step="5" value={s.automation.irrigationThreshold} onChange={e => s.configureAutomation({ irrigationThreshold: Number(e.target.value) })} /></label>
          <label>Daily beds <b>{s.automation.irrigationDailyLimit}</b><input type="range" min="1" max="8" step="1" value={s.automation.irrigationDailyLimit} onChange={e => s.configureAutomation({ irrigationDailyLimit: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={s.automation.autoPump} onChange={e => s.configureAutomation({ autoPump: e.target.checked })} /> Auto-pump an empty tank</label>
          <label className="check"><input type="checkbox" checked={s.automation.autoFertilize} onChange={e => s.configureAutomation({ autoFertilize: e.target.checked })} /> Fertilize dry, low-fertility beds</label>
          {s.automation.autoFertilize && <label>Fertilizer beds <b>{s.automation.fertilizerDailyLimit}</b><input type="range" min="1" max="6" step="1" value={s.automation.fertilizerDailyLimit} onChange={e => s.configureAutomation({ fertilizerDailyLimit: Number(e.target.value) })} /></label>}
          <label className="check"><input type="checkbox" checked={s.automation.autoCoverRacks} onChange={e => s.configureAutomation({ autoCoverRacks: e.target.checked })} /> Cover drying racks in rain</label>
        </div>}

        <h4>Loans</h4>
        {s.loans.map(l => (
          <div key={l.id} className="upgrade">
            <div><b>{l.label}{l.defaulted ? ' · DEFAULTED' : ''}</b><small>{money(l.balance)} owed · due day {l.dueDay} ({l.dueDay - s.day} days) · {(l.dailyRate * 365 * 100).toFixed(0)}% a year</small></div>
            <button onClick={() => s.repay(l.id)} disabled={s.cash <= 0}>Repay</button>
          </div>
        ))}
        {BANK_LOANS.map((o, i) => (
          <div key={i} className="upgrade">
            <div><b>Bank of Agriculture: {money(o.amount)}</b><small>{Math.round(o.annualRate * 100)}% a year, repay within {o.days} days. Credit limit {money(creditLimit(s))}.{loanNo ? ` ${loanNo}` : ''}</small></div>
            <button onClick={() => s.borrow(i)} disabled={!!loanNo}>Borrow</button>
          </div>
        ))}

        <h4>Risk management</h4>
        <div className="upgrade">
          <div><b>Crop insurance{s.upgrades.insurance ? ' · active' : ''}</b><small>{money(INSURANCE_PREMIUM)}/day. Pays 70% of storm and flood damage to standing crops. Paid out {money(f.insurancePayouts)} vs {money(f.insurancePremiums)} in premiums.</small></div>
          <button onClick={s.toggleInsurance}>{s.upgrades.insurance ? 'Cancel' : 'Buy cover'}</button>
        </div>

        <h4>Equipment & land</h4>
        {(Object.keys(UPGRADES) as UpgradeId[]).map(id => {
          const u = UPGRADES[id];
          const owned = ownsUpgrade(s, id), blockedBy = upgradeBlocked(s, id);
          const locked = !owned && blockedBy?.startsWith('Unlocks');
          const level = id === 'warehouse' ? ` · ${warehouseCapacity(s).toLocaleString()} kg now` : id === 'tank' ? ` · ${tankCapacity(s).toLocaleString()} L now` : '';
          const financeLock = lockedReason(s, 'equipmentFinance');
          return (
            <div key={id} className={`upgrade ${locked ? 'locked' : ''}`}>
              <div><b>{locked ? '🔒 ' : ''}{u.label}{owned ? (id === 'land' ? ' · leased' : ' · installed') : level}</b><small>{u.blurb} {money(u.cost)}.{locked ? ` ${blockedBy}.` : ''}</small></div>
              <div className="btns">
                {!owned && !locked && !financeLock && u.cost >= 200_000 && <button onClick={() => s.financeUpgrade(id)} title={`${Math.round(EQUIPMENT_FINANCE.downPayment * 100)}% down, rest over ${EQUIPMENT_FINANCE.days} days`}>Finance</button>}
                <button onClick={() => s.upgrade(id)} disabled={owned || locked || s.cash < u.cost}>{owned ? 'Owned' : locked ? 'Locked' : 'Buy'}</button>
              </div>
            </div>
          );
        })}
      </div>
    )}

    {activeTab === 'crew' && (
      <div>
        <h4>Specialist Crew & Roster</h4>
        {(!s.crew || s.crew.length === 0) ? (
          <p className="muted small">No staff currently hired. Recruit specialists below to gain field, drying, and logistics perks.</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
            {s.crew.map(w => {
              const role = ROLE_DETAILS[w.role];
              const trait = TRAIT_DETAILS[w.trait];
              const req = LEVEL_REQUIREMENTS[w.level];
              const nextLevelXp = req.nextLevel ? LEVEL_REQUIREMENTS[req.nextLevel].minXp : req.minXp;
              const xpPercent = req.nextLevel ? Math.min(100, Math.round((w.xp / nextLevelXp) * 100)) : 100;

              return (
                <div key={w.id} className="batch" style={{ margin: 0 }}>
                  <div className="batch-head">
                    <b>{role.icon} {w.name} · <span style={{ textTransform: 'capitalize', color: 'var(--green)' }}>{w.level}</span> {role.title}</b>
                    <button
                      className="close"
                      onClick={() => s.dismissWorkerById(w.id)}
                      title="Dismiss worker"
                      style={{ float: 'none', padding: '3px 8px', fontSize: '11px' }}
                    >
                      Dismiss
                    </button>
                  </div>
                  <small className="muted" style={{ display: 'block', margin: '3px 0 6px' }}>
                    Perk: {role.perkDesc}
                  </small>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', flexWrap: 'wrap', margin: '4px 0 8px' }}>
                    <span>💰 Wage: <b>{money(w.dailyWage)}/day</b></span>
                    <span>📅 Employed: <b>{w.daysEmployed} days</b></span>
                    <span>{trait.icon} Trait: <b>{trait.label}</b> ({trait.desc})</span>
                  </div>
                  <div className="bar-label">
                    <span>Experience {req.nextLevel ? `(${w.xp}/${nextLevelXp} XP to ${req.nextLevel})` : '(Max Level)'}</span>
                    <b>{xpPercent}%</b>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${xpPercent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h4>Specialist Recruitment Pool</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {(s.candidates ?? []).map(cand => {
            const role = ROLE_DETAILS[cand.role];
            const trait = TRAIT_DETAILS[cand.trait];
            const canHire = s.cash >= cand.hireCost && s.workers < maxWorkers(s.level);

            return (
              <div key={cand.id} className="batch" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="batch-head">
                    <b>{role.icon} {cand.name}</b>
                    <span className="grade gA" style={{ textTransform: 'capitalize', fontSize: '10px' }}>{cand.level}</span>
                  </div>
                  <strong style={{ display: 'block', fontSize: '12px', color: 'var(--green)', margin: '2px 0 4px' }}>
                    {role.title}
                  </strong>
                  <small className="muted" style={{ display: 'block', fontSize: '11px', lineHeight: 1.4, marginBottom: '6px' }}>
                    {cand.bio}
                  </small>
                  <div style={{ background: '#101710', borderRadius: '8px', padding: '6px 8px', fontSize: '11px', margin: '6px 0' }}>
                    <div>✨ {role.perkDesc}</div>
                    <div style={{ marginTop: '3px', color: 'var(--muted)' }}>{trait.icon} {trait.label}: {trait.desc}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #ffffff12' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Wage</span>
                    <b>{money(cand.dailyWage)}/day</b>
                  </div>
                  <button
                    onClick={() => s.hireCandidate(cand.id)}
                    disabled={!canHire}
                    style={{
                      border: '1px solid #557447',
                      background: canHire ? '#273b23' : '#1a221a',
                      color: canHire ? '#e4f4d8' : '#777',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      cursor: canHire ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Hire ({money(cand.hireCost)})
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <h4>Labour Allocation & Tasks</h4>
        <div className="upgrade">
          <div>
            <b>Farm Hands: {s.workers} hired</b>
            <small>
              {s.workers < maxWorkers(s.level)
                ? `Recruit more specialists above (up to ${maxWorkers(s.level)} at Level ${s.level}).`
                : `Staff roster full for Level ${s.level} (${maxWorkers(s.level)} max).`}
            </small>
          </div>
        </div>

        {s.workers > 0 ? (
          <div className="automation-controls">
            <label>
              Field labour: <b>{s.automation.fieldWorkers ?? 0}</b>
              <input
                type="range"
                min="0"
                max={s.workers}
                step="1"
                value={s.automation.fieldWorkers ?? 0}
                onChange={e => {
                  const val = Number(e.target.value);
                  const maxField = s.workers - (s.automation.processingWorkers ?? 0);
                  s.configureAutomation({ fieldWorkers: Math.min(val, maxField) });
                }}
              />
            </label>
            <small className="muted" style={{ display: 'block', margin: '-4px 0 8px 2px', fontSize: '11px' }}>
              {(s.automation.fieldWorkers ?? 0) * PLOTS_PER_FIELD_WORKER} plots managed each morning.
            </small>

            {(s.automation.fieldWorkers ?? 0) > 0 && (
              <div className="crew-subgroup">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoPlant}
                    onChange={e => s.configureAutomation({ autoPlant: e.target.checked })}
                  />
                  Auto-plant empty beds
                </label>
                {s.automation.autoPlant && (
                  <div style={{ display: 'flex', gap: '8px', margin: '4px 0 8px 24px', flexWrap: 'wrap' }}>
                    <select
                      value={s.automation.prepMethod ?? 'ridge'}
                      onChange={e => s.configureAutomation({ prepMethod: e.target.value as PrepMethod })}
                    >
                      <option value="clear">Flat clear</option>
                      <option value="ridge">Raised ridges (recommended)</option>
                    </select>
                    <select
                      value={s.automation.plantSeed ?? 'improved'}
                      onChange={e => s.configureAutomation({ plantSeed: e.target.value as SeedTier })}
                    >
                      <option value="local">Local seed</option>
                      <option value="improved">Improved seed</option>
                      {isUnlocked(s, 'certifiedSeed') && <option value="certified">Certified seed</option>}
                    </select>
                  </div>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoWater ?? true}
                    onChange={e => s.configureAutomation({ autoWater: e.target.checked })}
                  />
                  Auto-water dry beds
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoTreat ?? true}
                    onChange={e => s.configureAutomation({ autoTreat: e.target.checked })}
                  />
                  Inspect & treat issues
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoGapFill ?? true}
                    onChange={e => s.configureAutomation({ autoGapFill: e.target.checked })}
                  />
                  Auto gap-fill weak stands
                </label>
              </div>
            )}

            <label>
              Processing workers: <b>{s.automation.processingWorkers ?? 0}</b>
              <input
                type="range"
                min="0"
                max={s.workers}
                step="1"
                value={s.automation.processingWorkers ?? 0}
                onChange={e => {
                  const val = Number(e.target.value);
                  const maxProc = s.workers - (s.automation.fieldWorkers ?? 0);
                  s.configureAutomation({ processingWorkers: Math.min(val, maxProc) });
                }}
              />
            </label>

            {(s.automation.processingWorkers ?? 0) > 0 && (
              <div className="crew-subgroup">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoOpenRacks}
                    onChange={e => s.configureAutomation({ autoOpenRacks: e.target.checked })}
                  />
                  Uncover drying racks in morning sunshine
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoBagRacks}
                    onChange={e => s.configureAutomation({ autoBagRacks: e.target.checked })}
                  />
                  Auto-bag dried ginger when reaching safe moisture (≤10%)
                </label>
                {s.automation.autoBagRacks && (
                  <div style={{ margin: '4px 0 8px 24px' }}>
                    <select
                      value={s.automation.bagPackaging ?? 'bulk'}
                      onChange={e => s.configureAutomation({ bagPackaging: e.target.value as Packaging })}
                    >
                      <option value="bulk">Jute sacks (standard)</option>
                      <option value="sealed">Lined sealed bags (protects quality)</option>
                    </select>
                  </div>
                )}
                {s.upgrades.factory && s.upgrades.mill && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.automation.autoMill}
                      onChange={e => s.configureAutomation({ autoMill: e.target.checked })}
                    />
                    Auto-mill dry unreserved batches into powder
                  </label>
                )}
                {s.automation.autoMill && (
                  <div style={{ margin: '4px 0 8px 24px' }}>
                    <select
                      value={s.automation.millPackaging ?? 'sealed'}
                      onChange={e => s.configureAutomation({ millPackaging: e.target.value as Packaging })}
                    >
                      <option value="sealed">Lined sealed bags (recommended)</option>
                      <option value="bulk">Jute sacks</option>
                    </select>
                  </div>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.automation.autoReserve}
                    onChange={e => s.configureAutomation({ autoReserve: e.target.checked })}
                  />
                  Auto-reserve qualifying inventory for open export contracts
                </label>
              </div>
            )}

            {s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0) > 0 && (
              <small className="muted unassigned-note">
                ⚡ {s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0)} unassigned worker(s) add +{(s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0)) * WORKER_ENERGY} energy daily to the farmer.
              </small>
            )}
          </div>
        ) : (
          <div className="hint-card">
            <small className="muted">
              💡 Recruit specialists above to assign them to Field Labour and Processing automation.
            </small>
          </div>
        )}
      </div>
    )}

    {activeTab === 'prestige' && (
      <div>
        {/* Sandbox mode banner */}
        <div className="card" style={{ marginBottom: '14px', border: s.sandboxMode ? '1px solid #10b98144' : '1px solid #3b82f644' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b>{s.sandboxMode ? '🌟 Agribusiness Sandbox Active' : '🏁 Campaign Progression Status'}</b>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                {s.sandboxMode
                  ? 'Your commercial export estate is operating in post-campaign sandbox mode. Farm indefinitely, scale international trade, and build a lasting agribusiness legacy.'
                  : s.missions.every(m => m.complete)
                  ? 'You have completed all 10 campaign missions! You can now formally enter the open-ended Agribusiness Sandbox.'
                  : `${s.missions.filter(m => m.complete).length} of ${s.missions.length} campaign missions completed.`}
              </p>
            </div>
            {!s.sandboxMode && s.missions.every(m => m.complete) && (
              <button className="action primary" onClick={s.enterSandbox} style={{ whiteSpace: 'nowrap', marginLeft: '12px' }}>
                Enter Sandbox Mode
              </button>
            )}
          </div>
        </div>

        {/* Road cooperative active benefit badge */}
        {(s.coopRoadBenefitDays ?? 0) > 0 && (
          <div className="card" style={{ marginBottom: '14px', border: '1px solid #10b98166', background: 'rgba(16, 185, 129, 0.08)' }}>
            <b style={{ color: '#34d399' }}>🛣️ Kafanchan Road-Grading Benefit Active</b>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e2e8f0' }}>
              The arterial road maintenance pool is active. Export transit breakdown risks are reduced by 60% for the next <strong>{s.coopRoadBenefitDays} days</strong>.
            </p>
          </div>
        )}

        {/* Village Cooperative & Solidarity Requests */}
        <h3 style={{ margin: '16px 0 8px', fontSize: '14px', color: '#e2e8f0' }}>🤝 Village Cooperative Solidarity Requests</h3>
        {(!s.cooperativeEvents || s.cooperativeEvents.filter(e => e.status === 'pending').length === 0) ? (
          <div className="hint-card" style={{ marginBottom: '14px' }}>
            <small className="muted">
              🌾 No pending community solidarity appeals right now. Neighboring cooperatives reach out during seasonal transitions and weather extremes.
            </small>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {s.cooperativeEvents.filter(e => e.status === 'pending').map(e => (
              <div key={e.id} className="card" style={{ border: '1px solid #f59e0b44' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <b style={{ color: '#fbbf24' }}>{e.title}</b>
                    <p style={{ margin: '4px 0 8px', fontSize: '12px', color: '#cbd5e1' }}>{e.description}</p>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#94a3b8' }}>
                      <span><strong>Cost:</strong> {e.costLabel}</span>
                      <span><strong>Benefit:</strong> {e.benefitLabel}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                    <button
                      className="action primary"
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                      onClick={() => s.respondCoop(e.id, 'accept')}
                    >
                      ✓ Support
                    </button>
                    <button
                      className="action"
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                      onClick={() => s.respondCoop(e.id, 'decline')}
                    >
                      ✕ Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Seasonal Recurring Export Goals */}
        <h3 style={{ margin: '16px 0 8px', fontSize: '14px', color: '#e2e8f0' }}>🎯 Seasonal Recurring Export Goals</h3>
        {(!s.recurringGoals || s.recurringGoals.length === 0) ? (
          <div className="hint-card" style={{ marginBottom: '14px' }}>
            <small className="muted">
              🚢 Recurring seasonal export targets unlock once the farm reaches Level 6 or completes the story campaign.
            </small>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {s.recurringGoals.map(g => (
              <div key={g.id} className="card" style={{ border: g.completed ? '1px solid #10b98166' : '1px solid #ffffff12' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <b>{g.title} {g.completed ? '✓ FULFILLED' : ''}</b>
                  <span style={{ fontSize: '11px', color: g.completed ? '#34d399' : '#94a3b8' }}>
                    Reward: +{money(g.rewardMoney)} · +{g.rewardReputation} Rep
                  </span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#cbd5e1' }}>{g.description}</p>
                <div style={{ background: '#1e293b', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      background: g.completed ? '#10b981' : '#3b82f6',
                      width: `${Math.min(100, (g.progressKg / g.targetKg) * 100)}%`,
                      height: '100%',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>Progress: {g.progressKg.toLocaleString()} / {g.targetKg.toLocaleString()} kg</span>
                  <span>Due by Day {g.deadlineDay}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Agribusiness Prestige Records */}
        <h3 style={{ margin: '16px 0 8px', fontSize: '14px', color: '#e2e8f0' }}>🏆 Agribusiness Prestige & Achievements</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
          {PRESTIGE_DEFINITIONS.map(def => {
            const unlocked = s.prestige?.find(p => p.id === def.id);
            return (
              <div
                key={def.id}
                className="card"
                style={{
                  border: unlocked ? '1px solid #f59e0b66' : '1px solid #ffffff10',
                  background: unlocked ? 'rgba(245, 158, 11, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '26px' }}>{def.badge}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ color: unlocked ? '#fbbf24' : '#cbd5e1', fontSize: '13px' }}>{def.title}</b>
                      {unlocked && (
                        <span style={{ fontSize: '10px', background: '#f59e0b22', color: '#fbbf24', padding: '2px 6px', borderRadius: '8px' }}>
                          Day {unlocked.unlockedDay}
                        </span>
                      )}
                    </div>
                    <small style={{ display: 'block', margin: '4px 0', color: '#94a3b8', fontSize: '11px' }}>
                      {def.description}
                    </small>
                    <span style={{ fontSize: '10px', color: unlocked ? '#34d399' : '#64748b' }}>
                      {unlocked ? '✓ Achievement Unlocked' : '○ Locked'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </>;
}
