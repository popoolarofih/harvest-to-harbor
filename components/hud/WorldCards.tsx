'use client';
import { LITRES_PER_FUEL_LITRE, NPCS, fuelPrice, money, npcAdvice, plotName, tankCapacity } from '../../game/simulation';
import { useGameStore, type Target } from '../../stores/gameStore';
import { STATIONS } from '../world/layout';

function describe(t: Target, plots: { x: number; z: number; status: string }[]) {
  if (t.kind === 'plot') {
    const p = plots[t.id];
    const verb = p.status === 'empty' ? 'Prepare' : p.status === 'prepared' ? 'Plant' : p.status === 'ready' ? 'Harvest' : 'Tend';
    return `${verb} plot ${plotName(p)}`;
  }
  if (t.kind === 'npc') return `Talk to ${NPCS[t.id].name}`;
  return STATIONS[t.id].label;
}

/** "[E] Talk to Baba Musa": shown when the player stands next to something usable. */
export function InteractPrompt() {
  const s = useGameStore();
  const t = s.nearby;
  const busy = s.selectedPlot !== null || s.talkingTo || s.tankOpen || s.panel !== 'farm';
  if (!t || busy) return null;
  return (
    <button className="interact-prompt" onClick={() => s.interact(t)}>
      <kbd>E</kbd> {describe(t, s.plots)}
    </button>
  );
}

export function TankCard() {
  const s = useGameStore();
  if (!s.tankOpen) return null;
  const cap = tankCapacity(s), missing = cap - s.water;
  const cost = Math.round(Math.ceil(missing / LITRES_PER_FUEL_LITRE) * fuelPrice(s));
  return (
    <div className="card plot-panel">
      <button className="close" onClick={() => s.select(null)}>✕</button>
      <div className="eyebrow">Water tank & borehole</div>
      <h3>{s.water.toLocaleString()} / {cap.toLocaleString()} L</h3>
      <div className="progress"><i style={{ width: `${(s.water / cap) * 100}%`, background: '#6fb7e8' }} /></div>
      <p className="muted small">Each bed takes 400 L to water. Rain tops up the tank for free; the borehole pump burns diesel.</p>
      <div className="action-grid">
        <button className="action primary" onClick={s.pump} disabled={missing <= 0 || s.cash < cost}><strong>⛽ Run the pump</strong><small>{missing > 0 ? `${money(cost)} fuel` : 'Tank is full'}</small></button>
        <button className="action" onClick={() => s.openPanel('business')}><strong>{s.upgrades.irrigation ? '✓ Drip lines on' : '🚿 Drip irrigation'}</strong><small>{s.upgrades.irrigation ? 'Waters dry beds daily' : 'See business upgrades'}</small></button>
      </div>
    </div>
  );
}

export function NpcCard() {
  const s = useGameStore();
  if (!s.talkingTo) return null;
  const npc = NPCS[s.talkingTo];
  const tips = npcAdvice(s, s.talkingTo);
  return (
    <div className="card plot-panel npc-card">
      <button className="close" onClick={() => s.select(null)}>✕</button>
      <div className="eyebrow">{npc.role}</div>
      <h3>{npc.name}</h3>
      <p className="quote">“{npc.greeting}”</p>
      {tips.map(t => <p key={t} className="tip">{t}</p>)}
    </div>
  );
}
