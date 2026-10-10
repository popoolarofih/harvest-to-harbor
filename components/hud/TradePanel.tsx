'use client';
import { useState } from 'react';
import {
  HAULAGE, buyerOf, contractProductLabel, contractValue, dispatchCosts, eligibleKg, formatPrice, formatValue, gradeLabel, isExport,
  isUnlocked, lockedReason, money,
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

function DispatchForm({ c }: { c: Contract }) {
  const s = useGameStore();
  const [haulage, setHaulage] = useState<Haulage>('standard');
  const [insured, setInsured] = useState(false);
  const have = eligibleKg(s, c);
  const costs = dispatchCosts(s, c, haulage, insured);
  const fleetLock = lockedReason(s, 'fleet'), insuranceLock = lockedReason(s, 'cargoInsurance');
  const short = have < c.kg;
  return (
    <div className="dispatch">
      <div className="bar-label"><span>Stock that meets this contract{isExport(c) ? ' (sealed, clean, ≤12% moisture)' : ''}</span><b className={short ? 'warn' : ''}>{Math.round(have).toLocaleString()} / {c.kg.toLocaleString()} kg</b></div>
      <div className="progress"><i style={{ width: `${Math.min(100, (have / c.kg) * 100)}%` }} /></div>
      <div className="seg">
        {(Object.keys(HAULAGE) as Haulage[]).map(h => (
          <button key={h} className={h === haulage ? 'on' : ''} disabled={h === 'fleet' && !!fleetLock} onClick={() => setHaulage(h)} title={HAULAGE[h].blurb}>
            {HAULAGE[h].label} <small>{Math.round(HAULAGE[h].breakdownChance * 100)}% breakdowns/day{h === 'fleet' && fleetLock ? ` · ${fleetLock}` : ''}</small>
          </button>
        ))}
      </div>
      {isExport(c) && <label className={`check ${insuranceLock ? 'locked' : ''}`}><input type="checkbox" checked={insured} disabled={!!insuranceLock} onChange={e => setInsured(e.target.checked)} /> Cargo insurance (2% of value){insuranceLock ? ` · ${insuranceLock}` : ''}</label>}
      <div className="costs">
        <span>Haulage {money(costs.haulage)}</span>
        {costs.exportFees > 0 && <span>Export documents, phytosanitary & port {money(costs.exportFees)}</span>}
        {costs.insurance > 0 && <span>Insurance {money(costs.insurance)}</span>}
        <b>Pay now: {money(costs.total)}</b>
      </div>
      <button className="action primary wide" disabled={short || s.cash < costs.total} onClick={() => s.dispatch(c.id, haulage, insured)}>
        <strong>🚛 Load the truck</strong><small>{short ? `${Math.round(c.kg - have)} kg short` : s.cash < costs.total ? 'Not enough cash for logistics' : `${buyerOf(c).name}: ${TERMS[c.terms].toLowerCase()}`}</small>
      </button>
    </div>
  );
}

function ShipmentCard({ sh }: { sh: Shipment }) {
  const s = useGameStore();
  const c = s.contracts.find(x => x.id === sh.contractId)!;
  const b = buyerOf(c);
  return (
    <div className="batch shipment">
      <div className="batch-head"><b>{b.flag} {sh.kg.toLocaleString()} kg to {b.name}</b><span>{STAGE[sh.stage]}{sh.daysLeft > 0 ? ` · ${sh.daysLeft}d` : ''}</span></div>
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
    {active.map(c => <div key={c.id} className="batch contract"><ContractHead c={c} /><DispatchForm c={c} /></div>)}

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
