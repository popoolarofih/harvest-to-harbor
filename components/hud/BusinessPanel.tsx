'use client';
import {
  BANK_LOANS, EQUIPMENT_FINANCE, HIRE_COST, INSURANCE_PREMIUM, UPGRADES, WAGE_PER_DAY, WORKER_ENERGY, availableWorkers, cashForecast,
  creditLimit, dailyFixedCosts, loanBlocked, lockedReason, maintenanceCost, maxWorkers, money, ownsUpgrade, tankCapacity, totalDebt,
  upgradeBlocked, warehouseCapacity, type CashPoint, type UpgradeId,
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
  return <>
    <div className="eyebrow">Business</div>
    <h2>Run the operation</h2>
    <div className="inventory-grid">
      <div><span>Cash on hand</span><b>{money(s.cash)}</b></div>
      <div><span>Daily fixed costs</span><b>{money(burn)}</b></div>
      <div><span>Debt</span><b className={s.creditBlocked ? 'warn' : ''}>{money(totalDebt(s))}</b></div>
      <div><span>Profit this game</span><b>{money(f.revenue - f.expenses - f.interest)}</b></div>
    </div>

    <h4>Cash flow: next 30 days</h4>
    <CashChart points={cashForecast(s, 30)} />
    <div className="costs breakdown">
      <span>Wages {money(s.workers * WAGE_PER_DAY)}/day</span>
      <span>Maintenance {money(maintenanceCost(s))}/day</span>
      {s.upgrades.insurance && <span>Insurance {money(INSURANCE_PREMIUM)}/day</span>}
      <span>Spent on logistics {money(f.logistics)}</span>
      <span>Interest paid {money(f.interest)}</span>
    </div>

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

    <h4>Labour</h4>
    <div className="upgrade">
      <div><b>Workers: {s.workers}/{maxWorkers(s.level)}{availableWorkers(s) < s.workers ? ` (${availableWorkers(s)} available)` : ''}</b><small>Each adds +{WORKER_ENERGY} energy a day for {money(WAGE_PER_DAY)}/day. Hiring fee {money(HIRE_COST)}. You can manage more as you level up.</small></div>
      <div className="btns"><button onClick={s.dismiss} disabled={!s.workers}>Let go</button><button onClick={s.hire} disabled={s.cash < HIRE_COST || s.workers >= maxWorkers(s.level)}>Hire</button></div>
    </div>

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
  </>;
}
