'use client';
import { LOKOJA_TOLL, buyerOf, gradeLabel, money } from '../../game/simulation';
import type { Contract, Shipment } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';

/** The Lokoja crossing: pay the ferry toll for a clean, quick crossing, or send the truck round by the bush bypass. */
export function FerryChoicePanel({ sh }: { sh: Shipment }) {
  const choose = useGameStore(s => s.chooseFerry);
  const cash = useGameStore(s => s.cash);
  if (!sh.ferry || sh.ferry.resolved || sh.ferry.choice !== null || sh.stage !== 'road') return null;
  return (
    <div className="ferry-choice" role="group" aria-label="Lokoja ferry checkpoint">
      <svg viewBox="0 0 320 70" className="ferry-art" aria-hidden>
        <rect width="320" height="70" fill="#cfe6f2" />
        <path d="M0 46 Q40 38 80 46 T160 46 T240 46 T320 46 V70 H0Z" fill="#4f8fb5" />
        <path d="M0 54 Q40 48 80 54 T160 54 T240 54 T320 54 V70 H0Z" fill="#3b7aa0" />
        <g className="ferry-boat">
          <path d="M96 38 H190 L180 50 H106Z" fill="#8a3b2a" />
          <rect x="112" y="24" width="40" height="14" fill="#f1ead8" />
          <rect x="120" y="14" width="18" height="10" fill="#e0d6bd" />
          <rect x="160" y="28" width="22" height="10" fill="#b8412d" />
          <rect x="164" y="22" width="14" height="6" fill="#9c3524" />
        </g>
        <rect x="0" y="40" width="26" height="30" fill="#8d6e46" />
        <rect x="294" y="40" width="26" height="30" fill="#8d6e46" />
      </svg>
      <h5>⛴ Lokoja Ferry Checkpoint</h5>
      <p className="small">Your truck has reached the Niger. A queue of lorries is waiting for the ferry. How should the driver cross?</p>
      <div className="action-grid">
        <button className="action primary" disabled={cash < LOKOJA_TOLL} onClick={() => choose(sh.id, 'toll')}>
          <strong>Pay the toll · {money(LOKOJA_TOLL)}</strong><small>Straight onto the ferry. No delay, no damage.</small>
        </button>
        <button className="action" onClick={() => choose(sh.id, 'bypass')}>
          <strong>Take the bypass · free</strong><small>Rough bush road. About a 50% chance of a lost day and a few split bags.</small>
        </button>
      </div>
      <small className="muted">No answer by tonight and the driver pays the toll for you.</small>
    </div>
  );
}

/** Apapa Container Terminal: gantry cranes, stacked containers, a phytosanitary inspector with a clipboard, and ships passing the Lagos bar. */
export function PortScene({ stage }: { stage: Shipment['stage'] }) {
  if (stage !== 'port' && stage !== 'sea') return null;
  const colors = ['#b8412d', '#2f6b8a', '#d9a21c', '#3f7a4a', '#7a4f8a', '#c9651b'];
  return (
    <figure className="port-scene">
      <svg viewBox="0 0 520 190" role="img" aria-label="Apapa Container Terminal, Lagos">
        <rect width="520" height="190" fill="#bfe0ef" />
        <rect y="110" width="520" height="80" fill="#3d7ea6" />
        <path d="M0 126 Q60 118 120 126 T240 126 T360 126 T480 126 T600 126" stroke="#6fb0cf" strokeWidth="2" fill="none" />
        {/* a ship sailing past the Lagos bar */}
        <g className="port-ship">
          <path d="M20 104 H120 L108 120 H32Z" fill="#26323f" />
          <rect x="30" y="92" width="64" height="12" fill="#b8412d" />
          <rect x="34" y="82" width="14" height="10" fill="#2f6b8a" />
          <rect x="50" y="82" width="14" height="10" fill="#d9a21c" />
          <rect x="66" y="82" width="14" height="10" fill="#3f7a4a" />
          <rect x="94" y="80" width="14" height="24" fill="#f1ead8" />
        </g>
        {/* quay */}
        <rect y="120" width="360" height="70" fill="#9c968a" />
        <rect y="120" width="360" height="6" fill="#7e786c" />
        {/* gantry cranes */}
        {[70, 200].map(x => (
          <g key={x} className="crane" style={{ animationDelay: `${x / 100}s` }}>
            <rect x={x} y="30" width="5" height="90" fill="#e0a526" />
            <rect x={x + 44} y="30" width="5" height="90" fill="#e0a526" />
            <rect x={x - 10} y="26" width="104" height="9" fill="#d09416" />
            <rect x={x + 70} y="26" width="52" height="5" fill="#d09416" />
            <g className="crane-trolley"><rect x={x + 30} y="35" width="20" height="4" fill="#444" /><line x1={x + 40} y1="39" x2={x + 40} y2="70" stroke="#444" /><rect x={x + 32} y="70" width="16" height="9" fill={colors[x % colors.length]} /></g>
          </g>
        ))}
        {/* container stacks */}
        {[0, 1, 2, 3, 4].map(i => [0, 1, 2].slice(0, 3 - (i % 2)).map(j => (
          <rect key={`${i}${j}`} x={14 + i * 34} y={108 - j * 11} width="31" height="10" fill={colors[(i * 2 + j) % colors.length]} stroke="#1c1c1c" strokeOpacity="0.3" />
        )))}
        {/* phytosanitary inspector */}
        <g transform="translate(300,98)">
          <circle cx="0" cy="-2" r="5" fill="#8a5a3a" />
          <rect x="-5" y="3" width="10" height="16" rx="2" fill="#f5f5f0" />
          <rect x="-4" y="19" width="3.5" height="10" fill="#26323f" /><rect x="0.5" y="19" width="3.5" height="10" fill="#26323f" />
          <rect x="4" y="6" width="9" height="12" fill="#c9a66b" stroke="#6b4a2c" /><line x1="6" y1="9" x2="11" y2="9" stroke="#444" /><line x1="6" y1="12" x2="11" y2="12" stroke="#444" /><line x1="6" y1="15" x2="10" y2="15" stroke="#444" />
        </g>
        <text x="310" y="88" fontSize="9" fill="#26323f" fontWeight="700">Inspector</text>
      </svg>
      <figcaption className="small muted">{stage === 'port' ? '🔎 Apapa Container Terminal: the phytosanitary inspector checks moisture, foreign matter and seals before your container is craned aboard.' : '🚢 Your container left Lagos on the morning tide, past the Lagos bar.'}</figcaption>
    </figure>
  );
}

/** The official certificate issued once an export lot clears inspection, stamped with the player's own brand. */
export function ExportCertificate({ sh, c }: { sh: Shipment; c: Contract }) {
  const profile = useGameStore(s => s.profile);
  if (sh.stage === 'road' || sh.stage === 'lost') return null;
  const b = buyerOf(c);
  const lot = `LOT-${String(c.id).padStart(3, '0')}-${String(sh.id).padStart(3, '0')}`;
  return (
    <section className="export-cert" aria-label="Export certificate">
      <div className="cert-border">
        <div className="cert-crest" aria-hidden>🌾</div>
        <small className="cert-agency">Federal Ministry of Agriculture &amp; Rural Development</small>
        <h4>Export Certified Lot</h4>
        <small className="cert-sub">Phytosanitary &amp; quality inspection certificate</small>
        <dl className="cert-fields">
          <div><dt>Exporter</dt><dd>{profile.emblem} {profile.farmName}</dd></div>
          <div><dt>Brand</dt><dd>{profile.exportBrand}</dd></div>
          <div><dt>Lot no.</dt><dd>{lot}</dd></div>
          <div><dt>Product</dt><dd>{c.product === 'powder' ? 'Ginger powder' : 'Dried ginger'} · {sh.kg.toLocaleString()} kg</dd></div>
          <div><dt>Grade</dt><dd>{gradeLabel(sh.grade)}</dd></div>
          <div><dt>Consignee</dt><dd>{b.flag} {b.name}, {b.port}</dd></div>
          <div><dt>Inspected</dt><dd>Apapa, day {sh.dispatchedDay + 3}</dd></div>
        </dl>
        <div className="cert-stamps" aria-hidden>
          <svg viewBox="0 0 120 120" className="cert-stamp official">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#1f4e8c" strokeWidth="3" />
            <circle cx="60" cy="60" r="42" fill="none" stroke="#1f4e8c" strokeWidth="1.5" />
            <path id={`arc-${sh.id}`} d="M 18 60 A 42 42 0 0 1 102 60" fill="none" />
            <text fontSize="8.5" fontWeight="700" fill="#1f4e8c" letterSpacing="1"><textPath href={`#arc-${sh.id}`} startOffset="50%" textAnchor="middle">EXPORT CERTIFIED LOT</textPath></text>
            <text x="60" y="64" textAnchor="middle" fontSize="20" fill="#1f4e8c">✔</text>
            <text x="60" y="84" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1f4e8c">FMARD</text>
          </svg>
          <div className="cert-stamp brand"><span className="cert-emblem">{profile.emblem}</span><small>{profile.exportBrand}</small></div>
        </div>
      </div>
    </section>
  );
}
