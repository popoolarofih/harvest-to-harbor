'use client';
import { useState } from 'react';
import {
  HAULAGE, ENERGY, UPGRADES, buyerOf, contractProductLabel, contractValue, dispatchCosts, eligibleKg, exportReadiness, formatPrice, formatValue,
  getReservedKg, gradeLabel, haulageInfo, isExport, isUnlocked, lockedReason, money, recommendedDispatch,
} from '../../game/simulation';
import type { Contract, Haulage, Shipment } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';
import JourneyMap from './JourneyMap';

const TERMS = { advance: '30% advance, rest on delivery', onDelivery: 'Paid on delivery', net30: 'Paid 30 days after delivery' } as const;
const STAGE = { road: 'On the road', port: 'At Apapa port', sea: 'At sea', delivered: 'Delivered, awaiting payment', paid: 'Paid', lost: 'Lost' } as const;

function ContractHead({ c }: { c: Contract }) {
  const s = useGameStore();
  const b = buyerOf(c);
  return <>
    <div className="batch-head"><b>{b.flag} {b.name}</b><span className={`grade g${c.minGrade}`}>{gradeLabel(c.minGrade)}+</span></div>
    <div className="contract-terms">
      <span><b>{c.kg.toLocaleString()} kg</b> {contractProductLabel(c)}</span>
      <span><b>{formatValue(c)}</b> ({formatPrice(c)}{c.currency === 'USD' ? ` ≈ ${money(contractValue(s, c))} today` : ''})</span>
      <span>Deliver by <b>day {c.deadlineDay}</b> ({c.deadlineDay - s.day} days) · late penalty {Math.round(c.latePenalty * 100)}%</span>
      <span>{TERMS[c.terms]}{isExport(c) ? ` · ship to ${b.port}, ${b.country} (${b.seaDays} days at sea)` : ` · truck to ${b.port}`}</span>
    </div>
  </>;
}

const ISSUE_ICON = { packaging: '📦', damp: '💧', grade: '📉', soiled: '🟤', short: '⚖️' } as const;

/** The easy path: what's ready, what's wrong and how to fix it, and one button that does the rest. */
function ShipChecklist({ c }: { c: Contract }) {
  const s = useGameStore();
  const r = exportReadiness(s, c);
  const rec = recommendedDispatch(s, c);
  const costs = dispatchCosts(s, c, rec.haulage, rec.insured);
  const total = costs.total + r.repackCost;
  const ready = r.readyKg >= r.needKg;
  const why = !r.canFill ? `${Math.max(0, r.needKg - r.readyKg - r.repackKg).toLocaleString()} kg short`
    : s.cash < total ? `Need ${money(total)} for ${r.repackCost ? 'bags and ' : ''}logistics`
    : s.energy < ENERGY.ship ? 'Not enough energy today' : null;
  return (
    <div className="ship-checklist">
      <div className="checklist">
        <div className={ready ? 'ok' : r.canFill ? 'fixable' : 'todo'}>
          {ready ? '✅' : r.canFill ? '🛠️' : '⏳'} <b>{r.readyKg.toLocaleString()} / {r.needKg.toLocaleString()} kg</b> ready to go
          {!ready && r.repackKg > 0 && <> · {r.repackKg.toLocaleString()} kg more after repacking ({money(r.repackCost)})</>}
        </div>
        {r.issues.map(i => (
          <div key={i.kind} className={i.kind === 'packaging' ? 'fixable' : 'todo'}>
            {ISSUE_ICON[i.kind]} {i.text} <small>{i.fix}</small>
          </div>
        ))}
      </div>
      <button className="action primary wide" disabled={!!why} onClick={() => s.quickShip(c.id)}>
        <strong>⚡ Prepare &amp; ship</strong>
        <small>{why ?? `${r.repackKg ? 'Repack, then load' : 'Load'} with ${haulageInfo(s, rec.haulage).label}${rec.insured ? ' + insurance' : ''} · ${money(total)}`}</small>
      </button>
    </div>
  );
}

function DispatchForm({ c }: { c: Contract }) {
  const s = useGameStore();
  const [haulage, setHaulage] = useState<Haulage>('standard');
  const [insured, setInsured] = useState(false);
  const have = eligibleKg(s, c);
  const reserved = getReservedKg(s, c.id);
  const costs = dispatchCosts(s, c, haulage, insured);
  const fleetLock = lockedReason(s, 'fleet'), insuranceLock = lockedReason(s, 'cargoInsurance');
  const short = have < c.kg;
  return (
    <details className="dispatch">
      <summary>Choose haulage and reservations yourself</summary>
      <div className="bar-label"><span>Eligible stock{isExport(c) ? ' (export-ready)' : ''}</span><b className={short ? 'warn' : ''}>{Math.round(have).toLocaleString()} / {c.kg.toLocaleString()} kg</b></div>
      <div className="progress"><i style={{ width: `${Math.min(100, (have / c.kg) * 100)}%` }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', fontSize: '13.5px' }}>
        <span>🔒 Reserved: <b>{Math.round(reserved).toLocaleString()} / {c.kg.toLocaleString()} kg</b></span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {reserved < c.kg && (
            <button
              className="action"
              style={{ padding: '6px 12px', fontSize: '12.5px', fontWeight: 600 }}
              onClick={() => s.reserveContract(c.id)}
              disabled={have <= reserved}
              title="Reserve eligible stock specifically for this contract"
            >
              Lock stock
            </button>
          )}
          {reserved > 0 && (
            <button
              className="action"
              style={{ padding: '6px 12px', fontSize: '12.5px', fontWeight: 600 }}
              onClick={() => s.releaseReservation(c.id)}
              title="Release reserved stock"
            >
              Release
            </button>
          )}
        </div>
      </div>
      <div className="seg">
        {(Object.keys(HAULAGE) as Haulage[]).map(h => (
          <button key={h} className={h === haulage ? 'on' : ''} disabled={h === 'fleet' && !!fleetLock} onClick={() => setHaulage(h)} title={haulageInfo(s, h).blurb}>
            {haulageInfo(s, h).label} <small>{Math.round(haulageInfo(s, h).breakdownChance * 100)}% breakdowns/day{h === 'fleet' && fleetLock ? ` · ${fleetLock}` : ''}</small>
          </button>
        ))}
      </div>
      {isExport(c) && (
        <>
          <div className="brand-dispatch-badge">
            📦 Certified Export Lot: <strong>{s.profile.exportBrand}</strong> · Packed at {s.profile.farmName}
          </div>
          <label className={`check ${insuranceLock ? 'locked' : ''}`}>
            <input type="checkbox" checked={insured} disabled={!!insuranceLock} onChange={e => setInsured(e.target.checked)} /> Cargo insurance (2% of value){insuranceLock ? ` · ${insuranceLock}` : ''}
          </label>
        </>
      )}
      <div className="costs">
        <span>Haulage {money(costs.haulage)}</span>
        {costs.exportFees > 0 && <span>Export documents, phytosanitary & port {money(costs.exportFees)}</span>}
        {costs.insurance > 0 && <span>Insurance {money(costs.insurance)}</span>}
        <b>Pay now: {money(costs.total)}</b>
      </div>
      <button className="action primary wide" disabled={short || s.cash < costs.total} onClick={() => s.dispatch(c.id, haulage, insured)}>
        <strong>🚛 Load the truck</strong><small>{short ? `${Math.round(c.kg - have)} kg short` : s.cash < costs.total ? 'Not enough cash for logistics' : `${buyerOf(c).name}: ${TERMS[c.terms].toLowerCase()}`}</small>
      </button>
    </details>
  );
}

/** The export office ships for you; before it's bought, say what it would do. */
function AutoShip() {
  const s = useGameStore();
  if (s.upgrades.exportOffice) {
    return (
      <label className="check auto-ship">
        <input type="checkbox" checked={!!s.automation.autoShip} onChange={e => s.configureAutomation({ autoShip: e.target.checked })} />
        <span><b>Export office ships for me.</b> Each morning, any open contract with enough qualifying stock is repacked and loaded automatically.</span>
      </label>
    );
  }
  const lock = lockedReason(s, 'exportOffice');
  return <p className="muted small">💡 An <b>{UPGRADES.exportOffice.label}</b> ({money(UPGRADES.exportOffice.cost)}{lock ? `, ${lock.toLowerCase()}` : ', in Business → Operations'}) halves paperwork fees and ships ready contracts for you.</p>;
}

function ShipmentCard({ sh }: { sh: Shipment }) {
  const s = useGameStore();
  const c = s.contracts.find(x => x.id === sh.contractId)!;
  const b = buyerOf(c);
  return (
    <div className="batch shipment">
      <div className="batch-head">
        <b>{b.flag} {sh.kg.toLocaleString()} kg to {b.name}</b>
        <span>{STAGE[sh.stage]}{sh.daysLeft > 0 ? ` · ${sh.daysLeft}d` : ''}</span>
      </div>
      {isExport(c) && (
        <div style={{ margin: '2px 0 6px' }}>
          <span className="brand-tag">★ {s.profile.exportBrand} Export Lot</span>
        </div>
      )}
      <JourneyMap shipment={sh} buyer={b} />
      <ul className="ship-events">{[...sh.events].reverse().slice(0, 5).map((e, i) => <li key={i} className={e.severity}><small>Day {e.day}</small> {e.text}</li>)}</ul>
      {sh.stage === 'delivered' && sh.payDay !== null && <small className="muted">Payment expected on day {sh.payDay}.</small>}
    </div>
  );
}

export default function TradePanel() {
  const s = useGameStore();
  const offers = s.contracts.filter(c => c.status === 'offered');
  const active = s.contracts.filter(c => c.status === 'active');
  const moving = s.shipments.filter(sh => sh.stage !== 'paid' && sh.stage !== 'lost');
  const done = s.shipments.filter(sh => sh.stage === 'paid').slice(-5).reverse();
  const boardLock = !isUnlocked(s, 'forwardContracts') && !s.flags.exportUnlocked;
  return <>
    <div className="eyebrow">Trade · contracts & logistics</div>
    <h2>Buyers, contracts and shipments</h2>
    <div className="modal-row"><span>Exchange rate</span><b>₦{Math.round(s.fxRate).toLocaleString()} / $</b></div>

    {moving.length > 0 && <><h4>On the move</h4>{moving.map(sh => <ShipmentCard key={sh.id} sh={sh} />)}</>}

    <h4>Open contracts</h4>
    {!active.length && <p className="muted">No open contracts.</p>}
    {active.length > 0 && <AutoShip />}
    {active.map(c => <div key={c.id} className="batch contract"><ContractHead c={c} /><ShipChecklist c={c} /><DispatchForm c={c} /></div>)}

    <h4>Offers</h4>
    {boardLock && <p className="muted">Buyers start sending offers at Level 3.</p>}
    {!boardLock && !offers.length && <p className="muted">No offers right now. New ones arrive every few days, and bigger buyers appear as you level up.</p>}
    {offers.map(c => (
      <div key={c.id} className="batch contract">
        <ContractHead c={c} />
        <small className="muted">Offer open until day {c.offerExpiresDay}. You have {Math.round(eligibleKg(s, c)).toLocaleString()} kg that qualifies today.</small>
        <div className="action-grid">
          <button className="action primary" onClick={() => s.accept(c.id)}><strong>Sign contract</strong><small>{c.terms === 'advance' ? `Receive ${money(contractValue(s, c) * 0.3)} now` : 'Commit to deliver'}</small></button>
          <button className="action" onClick={() => s.decline(c.id)}><strong>Decline</strong><small>Let it go</small></button>
        </div>
      </div>
    ))}

    {done.length > 0 && <><h4>Completed</h4>{done.map(sh => {
      const c = s.contracts.find(x => x.id === sh.contractId)!;
      return <div key={sh.id} className="modal-row"><span>{buyerOf(c).flag} {buyerOf(c).name} · {sh.kg.toLocaleString()} kg · day {sh.arrivedDay}</span><b>{money(sh.payout ?? 0)}</b></div>;
    })}</>}
  </>;
}
