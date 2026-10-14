'use client';
import { BASE_PRICES, BUYERS, GRADE_MULT, hasEvent, money } from '../../game/simulation';
import type { Product } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';

function Sparkline({ values, base }: { values: number[]; base: number }) {
  if (values.length < 2) return null;
  const min = Math.min(base * 0.6, ...values), max = Math.max(base * 1.3, ...values);
  const y = (v: number) => 30 - ((v - min) / (max - min)) * 30;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${y(v)}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <line x1="0" x2="100" y1={y(base)} y2={y(base)} className="spark-base" />
      <polyline points={pts} className="spark-line" />
    </svg>
  );
}

export default function MarketPanel() {
  const s = useGameStore();
  const crash = hasEvent(s, 'priceCrash');
  const card = (product: Product, label: string) => (
    <div className="price-card">
      <span>{label}</span>
      <b>{money(s.market[product])} / kg</b>
      <Sparkline values={s.priceHistory.map(h => h[product])} base={BASE_PRICES[product]} />
      <small>Normal: around {money(BASE_PRICES[product])}/kg (dashed line).</small>
    </div>
  );
  return <>
    <div className="eyebrow">Market</div>
    <h2>Prices & buyers</h2>
    <div className="modal-row"><span>Exchange rate (USD exports)</span><b>₦{Math.round(s.fxRate).toLocaleString()} / $</b></div>
    {crash && <div className="alert danger">Price crash active ({crash.daysLeft} days left). Hold dried stock or choose domestic buyers.</div>}
    <div className="inventory-grid">{card('fresh', 'Fresh ginger')}{card('dried', 'Dried ginger')}{card('powder', 'Ginger powder')}</div>
    <h4>Grade premiums</h4>
    <div className="modal-row"><span>Premium (processed, sealed)</span><b>+{Math.round((GRADE_MULT.Premium - 1) * 100)}%</b></div>
    <div className="modal-row"><span>Grade A</span><b>+{Math.round((GRADE_MULT.A - 1) * 100)}%</b></div>
    <div className="modal-row"><span>Grade B</span><b>Market base</b></div>
    <div className="modal-row"><span>Grade C</span><b>{Math.round((GRADE_MULT.C - 1) * 100)}%</b></div>
    <h4>Buyers</h4>
    {BUYERS.map(b => (
      <div key={b.id} className="upgrade">
        <div><b>{b.name}</b><small>{b.product === 'fresh' ? 'Fresh' : b.product === 'dried' ? 'Dried' : 'Powder'} · min Grade {b.minGrade}{b.minKg ? ` · ${b.minKg} kg+` : ''}{b.maxMoisture ? ` · ≤${b.maxMoisture}% moisture` : ''}. {b.blurb}</small></div>
        <b>{Math.round(b.priceMult * 100)}%</b>
      </div>
    ))}
    <p className="muted">Simulated market prices.</p>
  </>;
}
