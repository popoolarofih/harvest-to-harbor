'use client';
import {
  ENERGY, FERTILIZER_COST, PREP, SEEDS, TREATMENTS, canHarvest, effectiveDrainage, expectedQuality, expectedYieldKg,
  gradeForBatch, isUnlocked, isWet, lockedReason, money, plotName,
} from '../../game/simulation';
import type { PrepMethod, SeedTier } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';

const TERRAIN = ['Upland: drains fast, dries out', 'Gentle slope', 'Lower field', 'Stream bottom: fertile but floods'];

function Bar({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="bar">
      <div className="bar-label"><span>{label}</span><b className={warn ? 'warn' : ''}>{Math.round(value)}%</b></div>
      <div className="progress"><i style={{ width: `${Math.min(100, value)}%`, background: warn ? 'var(--orange)' : undefined }} /></div>
    </div>
  );
}

export default function PlotPanel() {
  const s = useGameStore();
  const p = s.selectedPlot === null ? null : s.plots[s.selectedPlot];
  if (!p) return null;
  const cropped = p.status === 'growing' || p.status === 'ready';
  const yieldNow = expectedYieldKg(p), gradeNow = gradeForBatch({ product: 'fresh', quality: expectedQuality(p), moisture: 80 });
  const gapCost = p.seed ? Math.round(SEEDS[p.seed].cost * (1 - p.stand)) : 0;
  const title = p.status === 'empty' ? 'Unprepared land' : p.status === 'prepared' ? `${p.ridged ? 'Ridged' : 'Tilled'} soil, ready to plant` : p.status === 'ready' ? 'Mature ginger' : 'Growing ginger';

  return (
    <div className="card plot-panel">
      <button className="close" onClick={() => s.select(null)}>✕</button>
      <div className="eyebrow">Plot {plotName(p)}</div>
      <h3>{title}</h3>
      <small className="muted">{TERRAIN[p.z]} · drainage {Math.round(effectiveDrainage(p) * 100)}%{p.seed ? ` · ${SEEDS[p.seed].label}` : ''}</small>

      <div className="bars">
        {cropped && <Bar label="Growth" value={p.growth} />}
        {cropped && <Bar label="Health" value={p.health} warn={p.health < 70} />}
        <Bar label="Soil moisture" value={p.moisture} warn={p.moisture < 30 || p.moisture > 85} />
        <Bar label="Fertility" value={p.fertility} warn={p.fertility < 30} />
      </div>
      {p.issue?.detected && <div className="alert danger">{TREATMENTS[p.issue.kind].name}: severity {Math.round(p.issue.severity)}%</div>}
      {cropped && !p.issue?.detected && p.health < 85 && <div className="alert">Health is slipping. Inspect to find out why.</div>}

      {p.status === 'empty' && <div className="choices">
        {(Object.keys(PREP) as PrepMethod[]).map(m => (
          <button key={m} className="choice" onClick={() => s.prepare(p.id, m)} disabled={s.cash < PREP[m].cost || s.energy < PREP[m].energy}>
            <strong>{PREP[m].label}</strong><span>{money(PREP[m].cost)} · {PREP[m].energy}⚡</span><small>{PREP[m].blurb}</small>
          </button>
        ))}
      </div>}

      {p.status === 'prepared' && <div className="choices">
        {(Object.keys(SEEDS) as SeedTier[]).map(t => (
          <button key={t} className="choice" onClick={() => s.plant(p.id, t)} disabled={s.cash < SEEDS[t].cost || s.energy < ENERGY.plant || (t === 'certified' && !isUnlocked(s, 'certifiedSeed'))}>
            <strong>{t === 'certified' && !isUnlocked(s, 'certifiedSeed') ? `🔒 ${SEEDS[t].label} (${lockedReason(s, 'certifiedSeed')})` : SEEDS[t].label}</strong><span>{money(SEEDS[t].cost)} · {Math.round(SEEDS[t].germination * 100)}% emergence</span><small>{SEEDS[t].blurb}</small>
          </button>
        ))}
      </div>}

      {p.status !== 'empty' && <div className="action-grid">
        <button className="action" onClick={() => s.irrigate(p.id)} disabled={s.energy < ENERGY.water}><strong>💧 Water</strong><small>400 L from tank</small></button>
        <button className="action" onClick={() => s.fertilize(p.id)} disabled={s.cash < FERTILIZER_COST}><strong>🌱 Fertilize</strong><small>{money(FERTILIZER_COST)}{isWet(s.weather) ? ' · rain washes it' : ''}</small></button>
        {cropped && <button className="action" onClick={() => s.inspect(p.id)} disabled={s.energy < ENERGY.inspect}><strong>🔍 Inspect</strong><small>Find hidden problems</small></button>}
        {p.issue?.detected && <button className="action warn" onClick={() => s.treat(p.id)}><strong>🧪 Treat</strong><small>{TREATMENTS[p.issue.kind].label} · {money(TREATMENTS[p.issue.kind].cost)}</small></button>}
        {p.germinated && p.stand < 0.9 && p.growth < 60 && <button className="action" onClick={() => s.gapFill(p.id)}><strong>🪴 Gap-fill</strong><small>{Math.round(p.stand * 100)}% stand · {money(gapCost)}</small></button>}
      </div>}

      {cropped && <div className="harvest-box">
        {canHarvest(p) ? <>
          <div className="modal-row"><span>Harvest now</span><b>≈{Math.round(yieldNow)} kg · Grade {gradeNow}</b></div>
          <small className="muted">{p.status === 'growing' ? 'Early harvest: smaller rhizomes, lower quality. Cash sooner and no more weather risk.'
            : p.daysReady < 4 ? 'Waiting adds ~3% yield a day for a few days, but rot and storm risk keep rising.'
            : 'Left too long: rhizomes are turning fibrous and rot risk is climbing.'}</small>
          <button className={`action ${p.status === 'ready' ? 'primary' : ''}`} onClick={() => s.harvest(p.id)} disabled={s.energy < ENERGY.harvest}><strong>🧺 Harvest</strong><small>{ENERGY.harvest}⚡</small></button>
        </> : <small className="muted">Harvest possible from 70% growth.</small>}
      </div>}
    </div>
  );
}
