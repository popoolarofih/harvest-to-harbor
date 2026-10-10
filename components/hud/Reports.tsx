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
  return (
    <div className="report card">
      <div className="eyebrow">Morning report · day {r.day}</div>
      <h3>{WEATHER_INFO[r.weather].icon} {WEATHER_INFO[r.weather].label}</h3>
      <ul>{r.lines.slice(1).map((l, i) => <li key={i} className={l.severity}>{l.text}</li>)}</ul>
      {(r.wages > 0 || r.insurance > 0) && <small className="muted">Paid {money(r.wages)} wages{r.insurance ? ` and ${money(r.insurance)} insurance` : ''} last night.</small>}
      <button className="action primary" onClick={s.dismissReport}><strong>Start the day</strong></button>
    </div>
  );
}
