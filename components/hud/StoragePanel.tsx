'use client';
import {
  BUYERS, DRYING_RACK_KG, SAFE_MOISTURE, WEATHER_INFO, checkSale, gradeForBatch, money, rackLoadKg, storedKg, valueOptions,
  warehouseCapacity,
} from '../../game/simulation';
import type { Batch } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';

function BuyerButtons({ batch }: { batch: Batch }) {
  const s = useGameStore();
  return (
    <div className="buyers">
      {BUYERS.filter(b => b.product === batch.product).map(b => {
        const check = checkSale(s, batch, b);
        return (
          <button key={b.id} className="buyer" onClick={() => s.sell(batch.id, b.id)} title={b.blurb}>
            <strong>{b.name}</strong>
            <span className={check.ok ? '' : 'warn'}>{check.ok ? money(check.revenue) : check.reason.replace(/^Rejected: /, '')}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function StoragePanel() {
  const s = useGameStore();
  const fresh = s.batches.filter(b => b.product === 'fresh'), dried = s.batches.filter(b => b.product === 'dried');
  const used = storedKg(s), cap = warehouseCapacity(s);
  return <>
    <div className="eyebrow">Storage & processing</div>
    <h2>What will you do with your harvest?</h2>
    <div className="modal-row"><span>Warehouse</span><b className={used > cap ? 'warn' : ''}>{Math.round(used).toLocaleString()} / {cap.toLocaleString()} kg</b></div>

    <h4>Fresh ginger</h4>
    {!fresh.length && <p className="muted">Nothing harvested yet. Fresh ginger loses quality every day it waits.</p>}
    {fresh.map(b => {
      const [sellNow, dry] = valueOptions(s, b);
      return (
        <div key={b.id} className="batch">
          <div className="batch-head">
            <b>Batch #{b.id} · {Math.round(b.kg).toLocaleString()} kg</b>
            <span className={`grade g${gradeForBatch(b)}`}>Grade {gradeForBatch(b)}</span>
          </div>
          <small className="muted">Quality {Math.round(b.quality)}/100 · {s.day - b.createdDay} days in storage</small>
          <div className="decision">
            <div><span>Sell fresh</span><b>{money(sellNow.net)}</b><small>Risk: {sellNow.risk}. {sellNow.detail}</small></div>
            <div><span>Sun-dry (net)</span><b>{money(dry.net)}</b><small>Cost {money(dry.cost)} · Risk: {dry.risk}. {dry.detail}</small>
              <button className="action" onClick={() => s.dry(b.id)} disabled={rackLoadKg(s) + b.kg > DRYING_RACK_KG || s.cash < dry.cost}><strong>Wash, slice & dry</strong></button>
            </div>
          </div>
          <BuyerButtons batch={b} />
        </div>
      );
    })}

    <h4>Drying racks <small className="muted">({Math.round(rackLoadKg(s)).toLocaleString()} / {DRYING_RACK_KG.toLocaleString()} kg)</small></h4>
    {!s.dryingJobs.length && <p className="muted">Racks are empty. Sun-drying takes about 5 dry days; rain on uncovered racks re-wets the slices.</p>}
    {s.dryingJobs.map(j => (
      <div key={j.id} className="batch">
        <div className="batch-head"><b>Rack #{j.id} · {Math.round(j.freshKg).toLocaleString()} kg fresh</b><span>{j.days} days{j.covered ? ' · covered' : ''}</span></div>
        <div className="bar-label"><span>Moisture (target ≤ {SAFE_MOISTURE}%)</span><b className={j.moisture > SAFE_MOISTURE ? 'warn' : ''}>{j.moisture.toFixed(1)}%</b></div>
        <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, ((80 - j.moisture) / (80 - SAFE_MOISTURE)) * 100))}%` }} /></div>
        <small className="muted">Quality {Math.round(j.quality)}/100 · tomorrow looks {WEATHER_INFO[s.forecast[0].weather].label.toLowerCase()}.</small>
        <div className="action-grid">
          <button className="action" onClick={() => s.cover(j.id)}><strong>{j.covered ? 'Uncover racks' : '⛺ Cover with tarpaulin'}</strong><small>{j.covered ? 'Resume drying' : 'Protect from rain, pauses drying'}</small></button>
          <button className={`action ${j.moisture <= SAFE_MOISTURE ? 'primary' : ''}`} onClick={() => s.bag(j.id)}><strong>Bag it</strong><small>{j.moisture <= SAFE_MOISTURE ? 'Safe moisture reached' : 'Too damp: risky'}</small></button>
        </div>
      </div>
    ))}

    <h4>Dried ginger</h4>
    {!dried.length && <p className="muted">No dried ginger yet.</p>}
    {dried.map(b => (
      <div key={b.id} className="batch">
        <div className="batch-head"><b>Batch #{b.id} · {Math.round(b.kg).toLocaleString()} kg</b><span className={`grade g${gradeForBatch(b)}`}>Grade {gradeForBatch(b)}</span></div>
        <small className="muted">Moisture {b.moisture.toFixed(1)}% · quality {Math.round(b.quality)}/100 <button className="link" onClick={() => s.inspectBatch(b.id)}>Inspect</button></small>
        <BuyerButtons batch={b} />
      </div>
    ))}
  </>;
}
