'use client';
import {
  BANK_LOANS, EQUIPMENT_FINANCE, HIRE_COST, INSURANCE_PREMIUM, IRRIGATION_REPAIR_COST, PLOTS_PER_FIELD_WORKER, UPGRADES, WAGE_PER_DAY, WORKER_ENERGY, availableWorkers, cashForecast,
  creditLimit, dailyFixedCosts, isUnlocked, loanBlocked, lockedReason, maintenanceCost, maxWorkers, money, ownsUpgrade, tankCapacity, totalDebt,
  upgradeBlocked, warehouseCapacity, type CashPoint, type PrepMethod, type SeedTier, type UpgradeId,
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

    <h4>Labour & Crew</h4>
    <div className="upgrade">
      <div>
        <b>Hired staff: {s.workers}/{maxWorkers(s.level)}{availableWorkers(s) < s.workers ? ` (${availableWorkers(s)} available)` : ''}</b>
        <small>Each worker costs {money(WAGE_PER_DAY)}/day in wages. Hiring fee {money(HIRE_COST)}. Staff capacity grows as your level rises.</small>
      </div>
      <div className="btns">
        <button onClick={s.dismiss} disabled={!s.workers}>Let go</button>
        <button onClick={s.hire} disabled={s.cash < HIRE_COST || s.workers >= maxWorkers(s.level)}>Hire</button>
      </div>
    </div>

    {s.workers > 0 ? (
      <div className="crew-management">
        <div className="crew-card">
          <div className="crew-header">
            <div>
              <b>🌾 Field Labour: {s.automation.fieldWorkers ?? 0}</b>
              <small>Automatically prepares soil, plants seeds, waters dry beds, and treats disease.</small>
            </div>
            <div className="stepper">
              <button
                onClick={() => s.configureAutomation({ fieldWorkers: Math.max(0, (s.automation.fieldWorkers ?? 0) - 1) })}
                disabled={(s.automation.fieldWorkers ?? 0) <= 0}
                title="Decrease field workers"
              >
                −
              </button>
              <span>{s.automation.fieldWorkers ?? 0}</span>
              <button
                onClick={() => s.configureAutomation({ fieldWorkers: (s.automation.fieldWorkers ?? 0) + 1 })}
                disabled={(s.automation.fieldWorkers ?? 0) + (s.automation.processingWorkers ?? 0) >= s.workers}
                title="Increase field workers"
              >
                +
              </button>
            </div>
          </div>
          {(s.automation.fieldWorkers ?? 0) > 0 && (
            <div className="crew-controls">
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoPlant}
                  onChange={e => s.configureAutomation({ autoPlant: e.target.checked })}
                />
                Auto-plant empty beds (up to {(s.automation.fieldWorkers ?? 0) * PLOTS_PER_FIELD_WORKER} beds/day)
              </label>
              {s.automation.autoPlant && (
                <div className="crew-subgroup">
                  <label>
                    <span>Soil prep</span>
                    <select
                      value={s.automation.prepMethod}
                      onChange={e => s.configureAutomation({ prepMethod: e.target.value as PrepMethod })}
                    >
                      <option value="ridge">Raised ridges (₦15k · rot defense)</option>
                      <option value="clear">Clear & till (₦8k · cheaper)</option>
                    </select>
                  </label>
                  <label>
                    <span>Seed variety</span>
                    <select
                      value={s.automation.plantSeed}
                      onChange={e => s.configureAutomation({ plantSeed: e.target.value as SeedTier })}
                    >
                      <option value="improved">Improved variety (₦11k · recommended)</option>
                      <option value="local">Farm-saved setts (₦5k · low yield)</option>
                      {isUnlocked(s, 'certifiedSeed') && (
                        <option value="certified">Certified disease-free (₦19k · top yield)</option>
                      )}
                    </select>
                  </label>
                </div>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoMaintain}
                  onChange={e => s.configureAutomation({ autoMaintain: e.target.checked })}
                />
                Auto-maintain crops (water dry soil, fertilize, treat pests & rot, gap-fill)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoHarvest}
                  onChange={e => s.configureAutomation({ autoHarvest: e.target.checked })}
                />
                Auto-harvest mature crops into fresh store
              </label>
            </div>
          )}
        </div>

        <div className="crew-card">
          <div className="crew-header">
            <div>
              <b>🏭 Processing Workers: {s.automation.processingWorkers ?? 0}</b>
              <small>Stationed at drying racks: covers them during rain and opens them in the sun so slices dry.</small>
            </div>
            <div className="stepper">
              <button
                onClick={() => s.configureAutomation({ processingWorkers: Math.max(0, (s.automation.processingWorkers ?? 0) - 1) })}
                disabled={(s.automation.processingWorkers ?? 0) <= 0}
                title="Decrease processing workers"
              >
                −
              </button>
              <span>{s.automation.processingWorkers ?? 0}</span>
              <button
                onClick={() => s.configureAutomation({ processingWorkers: (s.automation.processingWorkers ?? 0) + 1 })}
                disabled={(s.automation.fieldWorkers ?? 0) + (s.automation.processingWorkers ?? 0) >= s.workers}
                title="Increase processing workers"
              >
                +
              </button>
            </div>
          </div>
          {(s.automation.processingWorkers ?? 0) > 0 && (
            <div className="crew-controls">
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoCoverRacks}
                  onChange={e => s.configureAutomation({ autoCoverRacks: e.target.checked })}
                />
                Cover drying racks when rain or storm hits
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoOpenRacks}
                  onChange={e => s.configureAutomation({ autoOpenRacks: e.target.checked })}
                />
                Open (uncover) drying racks in sunny weather to resume drying
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.automation.autoBagRacks}
                  onChange={e => s.configureAutomation({ autoBagRacks: e.target.checked })}
                />
                QC & bag into warehouse storage once dried to ≤12% moisture
              </label>
            </div>
          )}
        </div>

        {s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0) > 0 && (
          <small className="muted unassigned-note">
            ⚡ {s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0)} unassigned worker(s) add +{(s.workers - (s.automation.fieldWorkers ?? 0) - (s.automation.processingWorkers ?? 0)) * WORKER_ENERGY} energy daily to the farmer.
          </small>
        )}
      </div>
    ) : (
      <div className="hint-card">
        <small className="muted">
          💡 Hire workers above to assign them to <b>Field Labour</b> (automatic planting and crop care) and <b>Processing Workers</b> (covering drying racks in rain and opening them in the sun).
        </small>
      </div>
    )}

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
