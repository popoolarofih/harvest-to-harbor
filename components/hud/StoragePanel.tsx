'use client';
import { useState } from 'react';
import {
  BUYERS, CUT, DEFAULT_PREP, GRIND_MAX_MOISTURE, GRIND_YIELD, PACKAGING, SAFE_MOISTURE, SORT, WASH, WEATHER_INFO,
  checkSale, dryKgOf, gradeForBatch, gradeLabel, grindCost, isExportReady, money, packagingCost, prepPlan, rackCapacity, rackLoadKg, rackSpaceKg,
  storedKg, valueOptions, warehouseCapacity,
} from '../../game/simulation';
import type { Batch, CutStyle, Packaging, PrepChoices, SortLevel, WashMethod } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';
import { Tip } from './Menus';
import { GRADE_TIP } from './PlotPanel';

const STAGES = ['Wash', 'Sort', 'Slice', 'Dry', 'Grind', 'QC', 'Pack'] as const;

/** FRESH → WASH → SORT → SLICE → DRY → GRIND → QC → PACK, with done/current/skipped states. */
function Pipeline({ current, skipGrind }: { current: (typeof STAGES)[number]; skipGrind?: boolean }) {
  const at = STAGES.indexOf(current);
  return (
    <div className="pipeline">
      {STAGES.map((st, i) => (
        <span key={st} className={i < at ? 'done' : i === at ? 'now' : st === 'Grind' && skipGrind ? 'skip' : ''}>{st}</span>
      ))}
    </div>
  );
}

const gradeChip = (b: Pick<Batch, 'product' | 'quality' | 'moisture' | 'packaging' | 'soiled'>) => {
  const g = gradeForBatch(b);
  return <span className="grade-wrap"><span className={`grade g${g}`}>{gradeLabel(g)}</span><Tip text={GRADE_TIP} align="right" /></span>;
};

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

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, { label: string; blurb: string; costPerKg: number }>; onChange: (v: T) => void }) {
  return (
    <div className="station">
      <span className="station-label">{label}</span>
      <div className="seg">
        {(Object.keys(options) as T[]).map(k => (
          <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)} title={options[k].blurb}>
            {options[k].label}{options[k].costPerKg ? <small> +₦{options[k].costPerKg}/kg</small> : null}
          </button>
        ))}
      </div>
      <small className="muted">{options[value].blurb}</small>
    </div>
  );
}

function ProcessForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const s = useGameStore();
  const [c, setC] = useState<PrepChoices>(DEFAULT_PREP);
  const kg = Math.min(batch.kg, rackSpaceKg(s));
  const plan = prepPlan(batch, c, kg);
  const dryKg = plan.dryMatterKg / 0.9;
  const days = Math.ceil((80 - SAFE_MOISTURE) / (13 * plan.rate * (s.upgrades.solarDryer ? 1.3 : 1)));
  const problem = kg < 50 ? 'The drying racks are full.' : plan.litres > s.water ? `Needs ${plan.litres.toLocaleString()} L of water; the tank has ${s.water.toLocaleString()} L.` : s.cash < plan.cost ? 'Not enough cash.' : null;
  return (
    <div className="process-form">
      <Pipeline current="Wash" />
      <Choice<WashMethod> label="1 · Wash" value={c.wash} options={WASH} onChange={wash => setC({ ...c, wash })} />
      <Choice<SortLevel> label="2 · Sort" value={c.sort} options={SORT} onChange={sort => setC({ ...c, sort })} />
      <Choice<CutStyle> label="3 · Slice" value={c.cut} options={CUT} onChange={cut => setC({ ...c, cut })} />
      <div className="preview">
        <div><span>Into the racks</span><b>{Math.round(plan.keptKg).toLocaleString()} kg</b><small>{kg < batch.kg ? `${Math.round(batch.kg - kg)} kg waits for rack space` : `${Math.round(kg - plan.keptKg)} kg culled`}</small></div>
        <div><span>Expected dried</span><b>≈{Math.round(dryKg)} kg</b><small>{days}+ dry days to ≤{SAFE_MOISTURE}%</small></div>
        <div><span>Quality going in</span><b>{Math.round(plan.quality)}/100</b><small>{plan.soiled ? 'Soil left: max Grade B' : 'Clean'}</small></div>
        <div><span>Cost</span><b>{money(plan.cost)}</b><small>{plan.litres ? `${plan.litres.toLocaleString()} L tank water` : 'No water used'}</small></div>
      </div>
      {problem && <div className="alert">{problem}</div>}
      <button className="action primary wide" disabled={!!problem} onClick={() => { s.process(batch.id, c); onDone(); }}><strong>Start processing</strong><small>Wash, sort and slice, then onto the racks</small></button>
    </div>
  );
}

function FreshBatch({ b }: { b: Batch }) {
  const s = useGameStore();
  const [open, setOpen] = useState(false);
  const options = valueOptions(s, b);
  return (
    <div className="batch">
      <div className="batch-head"><b>Fresh batch #{b.id} · {Math.round(b.kg).toLocaleString()} kg</b>{gradeChip(b)}</div>
      <small className="muted">Quality {Math.round(b.quality)}/100 · {s.day - b.createdDay} days in storage · loses quality every day</small>
      <div className="decision three">
        {options.map(o => (
          <div key={o.id} className={o.locked ? 'locked' : ''}>
            <span>{o.label}</span><b>{money(o.net)}</b>
            <small>{o.cost ? `Revenue ${money(o.revenue)} − cost ${money(o.cost)}` : 'No processing cost'} · Risk: {o.risk}</small>
            <small>{o.locked ?? o.detail}</small>
          </div>
        ))}
      </div>
      {open ? <ProcessForm batch={b} onDone={() => setOpen(false)} /> : (
        <button className="action wide" onClick={() => setOpen(true)} disabled={rackSpaceKg(s) < 50}><strong>⚙ Process this batch</strong><small>{rackSpaceKg(s) < 50 ? 'Drying racks are full' : 'Choose how to wash, sort and slice'}</small></button>
      )}
      <BuyerButtons batch={b} />
    </div>
  );
}

function PackButtons({ kg, onPick, verb }: { kg: number; onPick: (p: Packaging) => void; verb: string }) {
  const s = useGameStore();
  return (
    <div className="action-grid">
      {(Object.keys(PACKAGING) as Packaging[]).map(p => (
        <button key={p} className={`action ${p === 'sealed' ? 'primary' : ''}`} onClick={() => onPick(p)} title={PACKAGING[p].blurb}>
          <strong>{verb}: {PACKAGING[p].label}</strong><small>{money(packagingCost(s, kg, p))}</small>
        </button>
      ))}
    </div>
  );
}

export default function StoragePanel() {
  const s = useGameStore();
  const fresh = s.batches.filter(b => b.product === 'fresh'), dried = s.batches.filter(b => b.product === 'dried'), powder = s.batches.filter(b => b.product === 'powder');
  const used = storedKg(s), cap = warehouseCapacity(s);
  return <>
    <div className="eyebrow">Storage & processing</div>
    <h2>From fresh ginger to export grade</h2>
    <div className="modal-row"><span>Warehouse</span><b className={used > cap ? 'warn' : ''}>{Math.round(used).toLocaleString()} / {cap.toLocaleString()} kg</b></div>
    <div className="modal-row"><span>Facilities</span><b>Open racks{s.upgrades.solarDryer ? ' · Solar tunnel dryer' : ''}{s.upgrades.mill ? ' · Hammer mill' : ''}</b></div>

    <h4>Fresh ginger <Tip text="Fresh ginger loses quality every day in storage. Sell it now, or process it: drying takes days and costs money, but dried ginger keeps and sells for far more per kilo." align="left" /></h4>
    {!fresh.length && <p className="muted">Nothing harvested yet.</p>}
    {fresh.map(b => <FreshBatch key={b.id} b={b} />)}

    <h4>Drying racks <small className="muted">({Math.round(rackLoadKg(s)).toLocaleString()} / {rackCapacity(s).toLocaleString()} kg{s.upgrades.solarDryer ? ', solar tunnel' : ', open air'})</small></h4>
    {!s.dryingJobs.length && <p className="muted">Racks are empty.</p>}
    {s.dryingJobs.map(j => {
      const kg = dryKgOf(j), safe = j.moisture <= SAFE_MOISTURE;
      return (
        <div key={j.id} className="batch">
          <Pipeline current={safe ? 'QC' : 'Dry'} skipGrind />
          <div className="batch-head"><b>Rack #{j.id} · {Math.round(j.freshKg).toLocaleString()} kg sliced</b><span>{j.days} days{j.covered ? ' · covered' : ''}</span></div>
          <div className="bar-label"><span>Moisture (target ≤ {SAFE_MOISTURE}%) <Tip text={`Buyers reject dried ginger above ${SAFE_MOISTURE}% moisture, and damp bags go mouldy. Cover the racks when rain is forecast and bag only at ${SAFE_MOISTURE}% or below.`} align="left" /></span><b className={safe ? '' : 'warn'}>{j.moisture.toFixed(1)}%</b></div>
          <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, ((80 - j.moisture) / (80 - SAFE_MOISTURE)) * 100))}%` }} /></div>
          <small className="muted">Quality {Math.round(j.quality)}/100{j.soiled ? ' · soil left from rinsing' : ''} · ≈{Math.round(kg)} kg if bagged now · tomorrow looks {WEATHER_INFO[s.forecast[0].weather].label.toLowerCase()}.</small>
          {!s.upgrades.solarDryer && <button className="action wide" onClick={() => s.cover(j.id)}><strong>{j.covered ? 'Uncover racks' : '⛺ Cover with tarpaulin'}</strong><small>{j.covered ? 'Resume drying' : 'Protect from rain; pauses drying'}</small></button>}
          {!safe && <div className="alert">Still too damp to store safely. Bagging now risks mould and rejection.</div>}
          <PackButtons kg={kg} verb="QC & bag" onPick={p => s.bag(j.id, p)} />
        </div>
      );
    })}

    <h4>Dried ginger</h4>
    {!dried.length && <p className="muted">No dried ginger yet.</p>}
    {dried.map(b => (
      <div key={b.id} className="batch">
        <div className="batch-head"><b>Batch #{b.id} · {Math.round(b.kg).toLocaleString()} kg</b>{gradeChip(b)}</div>
        <small className="muted">Moisture {b.moisture.toFixed(1)}% · quality {Math.round(b.quality)}/100 · {b.packaging ? PACKAGING[b.packaging].label.toLowerCase() : 'loose'}{isExportReady(b) ? <> · ✈ export-ready <span className="brand-tag">★ {s.profile.exportBrand}</span></> : ''} <button className="link" onClick={() => s.inspectBatch(b.id)}>Inspect</button></small>
        {s.upgrades.mill ? <>
          {b.moisture > GRIND_MAX_MOISTURE && <div className="alert">Above {GRIND_MAX_MOISTURE}% moisture: powder will cake in the mill.</div>}
          <div className="action-grid">
            {(Object.keys(PACKAGING) as Packaging[]).map(p => (
              <button key={p} className="action" onClick={() => s.grind(b.id, p)}><strong>⚙ Mill to powder ({PACKAGING[p].label.toLowerCase()})</strong><small>≈{Math.round(b.kg * GRIND_YIELD)} kg · {money(grindCost(s, b, p))}</small></button>
            ))}
          </div>
        </> : <small className="muted">Buy a hammer mill (Business) to turn this into powder.</small>}
        <BuyerButtons batch={b} />
      </div>
    ))}

    <h4>Ginger powder</h4>
    {!powder.length && <p className="muted">{s.upgrades.mill ? 'No powder yet. Mill a dried batch.' : 'Needs a hammer mill.'}</p>}
    {powder.map(b => (
      <div key={b.id} className="batch">
        <div className="batch-head"><b>Powder #{b.id} · {Math.round(b.kg).toLocaleString()} kg</b>{gradeChip(b)}</div>
        <small className="muted">Moisture {b.moisture.toFixed(1)}% · {b.packaging ? PACKAGING[b.packaging].label.toLowerCase() : ''}{isExportReady(b) ? <> · ✈ export-ready <span className="brand-tag">★ {s.profile.exportBrand}</span></> : ''} <button className="link" onClick={() => s.inspectBatch(b.id)}>Inspect</button></small>
        <BuyerButtons batch={b} />
      </div>
    ))}
  </>;
}
