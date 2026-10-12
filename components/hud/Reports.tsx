'use client';
import { WEATHER_INFO, money } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

/** "QUALITY INSPECTION" card: teaches through consequences instead of a bare "bad drying" message. */
export function InspectionModal() {
  const r = useGameStore(s => s.lastInspection), clear = useGameStore(s => s.clearInspection);
  if (!r) return null;
  return (
    <div className="modal-backdrop" onClick={clear}>
      <div className="modal inspection" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={clear}>Close</button>
        <div className="eyebrow">Quality inspection</div>
        <h2>{r.title}</h2>
        <div className={`grade big g${r.grade}`}>Grade {r.grade}</div>
        {r.stats.map(st => <div key={st.label} className="modal-row"><span>{st.label}</span><b className={st.ok ? '' : 'warn'}>{st.value}{st.ok ? '' : ' ⚠'}</b></div>)}
        {r.warnings.map(w => <div key={w} className="alert danger">⚠ {w}</div>)}
        {r.consequences.length > 0 && <div className="lesson"><b>Potential consequences</b><ul>{r.consequences.map(c => <li key={c}>{c}</li>)}</ul></div>}
        {!r.warnings.length && <div className="alert good">No problems found.</div>}
      </div>
    </div>
  );
}

export function MorningReport() {
  const s = useGameStore();
  const r = s.lastReport;
  if (!r || s.reportSeenDay >= r.day || s.lastInspection) return null;
  const a = r.automation;
  const automated = a.irrigatedPlots || a.pumpedLitres || a.fertilizedPlots || a.coveredRacks || a.irrigationNeedsRepair;
  return (
    <div className="report card">
      <div className="eyebrow">Morning report · day {r.day}</div>
      <h3>{WEATHER_INFO[r.weather].icon} {WEATHER_INFO[r.weather].label}</h3>
      {automated && <div className="report-automation">
        <b>Operations</b>
        {a.pumpedLitres > 0 && <span>Pumped {a.pumpedLitres.toLocaleString()} L ({money(a.pumpingCost)})</span>}
        {a.irrigatedPlots > 0 && <span>Watered {a.irrigatedPlots} bed{a.irrigatedPlots > 1 ? 's' : ''} ({a.irrigationLitres.toLocaleString()} L)</span>}
        {a.fertilizedPlots > 0 && <span>Fertilized {a.fertilizedPlots} bed{a.fertilizedPlots > 1 ? 's' : ''} ({money(a.fertilizerCost)})</span>}
        {a.coveredRacks > 0 && <span>Covered {a.coveredRacks} drying rack{a.coveredRacks > 1 ? 's' : ''}</span>}
        {a.irrigationNeedsRepair && <span className="warn">Drip lines need service</span>}
      </div>}
      <ul>{r.lines.slice(1).map((l, i) => <li key={i} className={l.severity}>{l.text}</li>)}</ul>
      {(r.wages > 0 || r.insurance > 0) && <small className="muted">Paid {money(r.wages)} wages{r.insurance ? ` and ${money(r.insurance)} insurance` : ''} last night.</small>}
      <button className="action primary" onClick={s.dismissReport}><strong>Start the day</strong></button>
    </div>
  );
}
