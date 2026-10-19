'use client';
import {
  COMPOUND_SITES, MAX_COMPOUND_LEASES, compoundBlocked, compoundLeaseCost, money, ownsCompound, plotsAt, type CompoundSite,
} from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A one-line read of a site's soil, so the player can compare land before buying it. */
function SoilSummary({ c }: { c: CompoundSite }) {
  const avg = (k: 'drainage' | 'fertility' | 'moisture') => c.rows.reduce((t, r) => t + r[k], 0) / c.rows.length;
  return (
    <div className="site-soil">
      <span>Drainage <b>{pct(avg('drainage'))}</b></span>
      <span>Fertility <b>{Math.round(avg('fertility'))}</b></span>
      <span>Soil moisture <b>{Math.round(avg('moisture'))}%</b></span>
    </div>
  );
}

/** Buy more farms, lease land beside them and travel between them. */
export default function ExpansionPanel() {
  const s = useGameStore();
  const homeBeds = plotsAt(s.plots).length;
  const growing = (site?: CompoundSite['id']) => plotsAt(s.plots, site).filter(p => p.status === 'growing' || p.status === 'ready').length;
  return (
    <div>
      <p className="muted small">
        Growing beyond one farm spreads your risk: different land, different soil, different weather luck. You can only stand in one field
        at a time, so your <b>field crew</b> plants, tends and harvests every farm each morning. Harvests are trucked to the main warehouse.
      </p>

      <h4>Your farms</h4>
      <div className={`site-card ${!s.site ? 'here' : ''}`}>
        <div className="site-head">
          <b>{s.profile.emblem} {s.profile.farmName}</b>
          <span className="muted small">Kafanchan · home farm · {homeBeds} beds · {growing()} planted</span>
        </div>
        <div className="btns">
          <button onClick={() => s.travel(undefined)} disabled={!s.site}>{s.site ? '🚶 Travel here' : '📍 You are here'}</button>
        </div>
      </div>
      {(s.compounds ?? []).map(owned => {
        const c = COMPOUND_SITES.find(x => x.id === owned.site)!;
        const beds = plotsAt(s.plots, c.id).length, leaseCost = compoundLeaseCost(s, c.id), full = owned.leases >= MAX_COMPOUND_LEASES;
        return (
          <div key={c.id} className={`site-card ${s.site === c.id ? 'here' : ''}`}>
            <div className="site-head">
              <b>🌍 {c.name}</b>
              <span className="muted small">{c.place} · bought day {owned.boughtDay} · {beds} beds · {growing(c.id)} planted · upkeep {money(c.upkeep)}/day</span>
            </div>
            <div className="btns">
              <button onClick={() => s.travel(c.id)} disabled={s.site === c.id}>{s.site === c.id ? '📍 You are here' : '🚶 Travel here'}</button>
              <button onClick={() => s.leaseCompound(c.id)} disabled={full || s.cash < leaseCost} title="Two more columns of beds beside this farm">
                {full ? 'All land leased' : `Lease +8 beds · ${money(leaseCost)}`}
              </button>
            </div>
          </div>
        );
      })}
      {(s.compounds ?? []).length > 0 && (s.automation.fieldWorkers ?? 0) === 0 && (
        <div className="alert warning">⚠ No one is on the field crew. Assign workers in the Crew tab or your new farms will sit idle.</div>
      )}

      <h4>Land for sale</h4>
      {COMPOUND_SITES.filter(c => !ownsCompound(s, c.id)).map(c => {
        const blockedBy = compoundBlocked(s, c.id);
        const locked = !!blockedBy?.startsWith('Unlocks');
        return (
          <div key={c.id} className={`site-card for-sale ${locked ? 'locked' : ''}`}>
            <div className="site-head">
              <b>{locked ? '🔒 ' : '🏡 '}{c.name}</b>
              <span className="muted small">{c.place} · 16 beds · {money(c.cost)} · upkeep {money(c.upkeep)}/day{locked ? ` · ${blockedBy}` : ''}</span>
            </div>
            <p className="small">{c.blurb}</p>
            <SoilSummary c={c} />
            <div className="btns">
              <button className="primary" onClick={() => s.buyCompound(c.id)} disabled={locked || s.cash < c.cost}>
                {locked ? 'Locked' : s.cash < c.cost ? `Need ${money(c.cost - s.cash)} more` : `Buy for ${money(c.cost)}`}
              </button>
            </div>
          </div>
        );
      })}
      {COMPOUND_SITES.every(c => ownsCompound(s, c.id)) && <p className="muted">You own every compound in the region. Lease more land beside them to keep growing.</p>}
    </div>
  );
}
