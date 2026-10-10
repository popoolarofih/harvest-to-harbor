'use client';
import {
  HIRE_COST, INSURANCE_PREMIUM, UPGRADES, WAGE_PER_DAY, WORKER_ENERGY, availableWorkers, money, tankCapacity, warehouseCapacity,
  type UpgradeId,
} from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

export default function BusinessPanel() {
  const s = useGameStore();
  const f = s.finance;
  const dailyBurn = s.workers * WAGE_PER_DAY + (s.upgrades.insurance ? INSURANCE_PREMIUM : 0);
  return <>
    <div className="eyebrow">Business</div>
    <h2>Run the operation</h2>
    <div className="inventory-grid">
      <div><span>Cash on hand</span><b>{money(s.cash)}</b></div>
      <div><span>Daily fixed costs</span><b>{money(dailyBurn)}</b></div>
      <div><span>Revenue this season</span><b>{money(f.revenue)}</b></div>
      <div><span>Spent this season</span><b>{money(f.expenses)}</b></div>
    </div>
    <p className="muted">Cash runway: {dailyBurn ? `${Math.floor(s.cash / dailyBurn)} days of wages and premiums` : 'no fixed daily costs'}. A farm can be profitable on paper and still fail if cash runs out before harvest.</p>

    <h4>Labour</h4>
    <div className="upgrade">
      <div><b>Workers: {s.workers}{availableWorkers(s) < s.workers ? ` (${availableWorkers(s)} available)` : ''}</b><small>Each adds +{WORKER_ENERGY} energy a day for {money(WAGE_PER_DAY)}/day. Hiring fee {money(HIRE_COST)}.</small></div>
      <div className="btns"><button onClick={s.dismiss} disabled={!s.workers}>Let go</button><button onClick={s.hire} disabled={s.cash < HIRE_COST}>Hire</button></div>
    </div>

    <h4>Risk management</h4>
    <div className="upgrade">
      <div><b>Crop insurance{s.upgrades.insurance ? ' · active' : ''}</b><small>{money(INSURANCE_PREMIUM)}/day. Pays 70% of storm and flood damage to standing crops. Paid out {money(f.insurancePayouts)} vs {money(f.insurancePremiums)} in premiums.</small></div>
      <button onClick={s.toggleInsurance}>{s.upgrades.insurance ? 'Cancel' : 'Buy cover'}</button>
    </div>
    {(Object.keys(UPGRADES) as UpgradeId[]).map(id => {
      const u = UPGRADES[id];
      const owned = id === 'irrigation' && s.upgrades.irrigation;
      const level = id === 'warehouse' ? ` · ${warehouseCapacity(s).toLocaleString()} kg now` : id === 'tank' ? ` · ${tankCapacity(s).toLocaleString()} L now` : '';
      return (
        <div key={id} className="upgrade">
          <div><b>{u.label}{owned ? ' · installed' : level}</b><small>{u.blurb} {money(u.cost)}.</small></div>
          <button onClick={() => s.upgrade(id)} disabled={owned || s.cash < u.cost}>{owned ? 'Owned' : 'Buy'}</button>
        </div>
      );
    })}
    <div className="route"><span>YOUR ROAD TO EXPORT</span><b>Farm → Processing → Warehouse → Lagos → Global Buyer</b></div>
  </>;
}
