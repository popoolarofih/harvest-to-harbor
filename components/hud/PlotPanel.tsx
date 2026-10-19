'use client';
import {
  COMPOST_COST, ENERGY, FERTILIZER_COST, GRADE_MULT, PREP, SEEDS, SOYBEAN_PRICE_PER_KG, SOYBEAN_SEED_COST, TREATMENTS,
  canHarvest, effectiveDrainage, expectedQuality, expectedYieldKg, getConsecutiveGingerCount, getRotationAdvice,
  getSoilHealthRating, getSoilHealthScore, gradeForBatch, harvestEnergy, isUnlocked, isWet, lockedReason, money, plotName, prepCost,
} from '../../game/simulation';
import type { PrepMethod, SeedTier } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';
import { Tip } from './Menus';

const TIPS = {
  growth: 'Ginger matures at 100% when leaves turn golden-brown. Soybean matures in ~30 days with pods turning brown.',
  health: 'Pests, leaf spot and rot lower health, and with it your yield and grade. Inspect to find the cause.',
  moisture: 'Ginger likes 30–85%. Dry beds grow slowly; waterlogged beds rot. Organic matter buffers against drought.',
  fertility: 'Feeds growth and quality. Fertiliser and legume rotation restore it; heavy rain leaches it.',
  om: 'Organic Matter (OM) buffers soil against drought, improves moisture retention and nutrient holding capacity.',
  compaction: 'Compacted soil impedes root penetration and water drainage. Ridge prep and compost loosen compaction.',
};
export const GRADE_TIP = `Grade sets the price: ${Object.entries(GRADE_MULT).map(([g, m]) => `${g} ×${m}`).join(', ')} of market. Quality, moisture, soil and packaging decide it.`;

const TERRAIN = ['Upland terrain', 'Gentle slope', 'Lower field', 'Stream bottom'];

function Bar({ label, value, warn, tip }: { label: string; value: number; warn?: boolean; tip?: string }) {
  return (
    <div className="bar">
      <div className="bar-label"><span>{label}{tip && <> <Tip text={tip} align="left" /></>}</span><b className={warn ? 'warn' : ''}>{Math.round(value)}%</b></div>
      <div className="progress"><i style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: warn ? 'var(--orange)' : undefined }} /></div>
    </div>
  );
}

export default function PlotPanel() {
  const s = useGameStore();
  const p = s.selectedPlot === null ? null : s.plots[s.selectedPlot];
  if (!p) return null;

  const cropped = p.status === 'growing' || p.status === 'ready';
  const isSoy = p.crop === 'soybean';
  const yieldNow = expectedYieldKg(p);
  const gradeNow = gradeForBatch({ product: 'fresh', quality: expectedQuality(p), moisture: 80 });
  const gapCost = p.seed ? Math.round(SEEDS[p.seed].cost * (1 - p.stand)) : 0;
  
  const healthScore = getSoilHealthScore(p);
  const healthRating = getSoilHealthRating(healthScore);
  const rotationAdvice = getRotationAdvice(p);
  const consecutiveGinger = getConsecutiveGingerCount(p);

  const title = p.status === 'empty' 
    ? 'Unprepared land' 
    : p.status === 'prepared' 
      ? `${p.ridged ? 'Ridged' : 'Tilled'} soil, ready to plant` 
      : isSoy
        ? p.status === 'ready' ? 'Mature Soybean (TGX-1448-2E)' : 'Growing Soybean'
        : p.status === 'ready' ? 'Mature ginger' : 'Growing ginger';

  const hasCompostStock = (s.stock?.compost ?? 0) > 0;
  const compostCost = hasCompostStock ? 0 : COMPOST_COST;
  const hasSoyStock = (s.stock?.soybean ?? 0) > 0;
  const soySeedCost = hasSoyStock ? 0 : SOYBEAN_SEED_COST;

  return (
    <div className="card plot-panel">
      <button className="close" onClick={() => s.select(null)}>✕</button>
      <div className="eyebrow">Plot {plotName(p)} · Soil: {healthRating} ({healthScore}/100)</div>
      <h3>{title}</h3>
      <small className="muted">
        {TERRAIN[p.z]} · drainage {Math.round(effectiveDrainage(p) * 100)}%
        {p.seed ? ` · ${SEEDS[p.seed].label}` : isSoy ? ' · Soybean legume' : ''}
      </small>

      <div className="bars">
        {cropped && <Bar label="Growth" value={p.growth} tip={TIPS.growth} />}
        {cropped && <Bar label="Crop health" value={p.health} warn={p.health < 70} tip={TIPS.health} />}
        <Bar label="Soil moisture" value={p.moisture} warn={p.moisture < 30 || p.moisture > 85} tip={TIPS.moisture} />
        <Bar label="Fertility (N-P-K)" value={p.fertility} warn={p.fertility < 35} tip={TIPS.fertility} />
        <Bar label="Organic matter (Humus)" value={p.organicMatter ?? 35} warn={(p.organicMatter ?? 35) < 30} tip={TIPS.om} />
        <Bar label="Compaction" value={p.compaction ?? 20} warn={(p.compaction ?? 20) > 40} tip={TIPS.compaction} />
      </div>

      {(p.diseasePressure?.rot ?? 0) > 15 && (
        <div className="alert danger">
          🦠 Rot pathogen pressure: {Math.round(p.diseasePressure?.rot ?? 0)}%. Risk of Pythium soft rot.
        </div>
      )}

      {p.issue?.detected && <div className="alert danger">{TREATMENTS[p.issue.kind].name}: severity {Math.round(p.issue.severity)}%</div>}
      {cropped && !p.issue?.detected && p.health < 85 && <div className="alert">Health is slipping. Inspect to identify issue.</div>}

      {rotationAdvice.warning && p.status === 'prepared' && (
        <div className="alert danger">
          ⚠️ {rotationAdvice.warning}
        </div>
      )}

      {p.status === 'empty' && (
        <div className="choices">
          {(Object.keys(PREP) as PrepMethod[]).map(m => (
            <button key={m} className="choice" onClick={() => s.prepare(p.id, m)} disabled={s.cash < prepCost(s, m) || s.energy < PREP[m].energy}>
              <strong>{PREP[m].label}</strong><span>{money(prepCost(s, m))} · {PREP[m].energy}⚡</span><small>{PREP[m].blurb}</small>
            </button>
          ))}
        </div>
      )}

      {p.status === 'prepared' && (
        <>
          <div style={{ margin: '10px 0 4px', fontSize: '12px', color: 'var(--green2)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
            Choose Crop to Plant
          </div>
          <div className="choices">
            {/* Soybean rotation option */}
            <button
              className="choice"
              style={{ borderColor: consecutiveGinger > 0 ? 'var(--green)' : undefined }}
              onClick={() => s.plant(p.id, undefined, 'soybean')}
              disabled={(s.cash < soySeedCost && !hasSoyStock) || s.energy < ENERGY.plant}
            >
              <strong>🌱 Soybean (TGX-1448-2E) · Rotation {consecutiveGinger > 0 ? '⭐ Recommended' : ''}</strong>
              <span>{hasSoyStock ? 'From stock (free)' : money(SOYBEAN_SEED_COST)} · 30-day quick cycle</span>
              <small>Fixes nitrogen (+20), adds +10% OM, cuts rot risk by 50%.</small>
            </button>

            {/* Ginger seed options */}
            {(Object.keys(SEEDS) as SeedTier[]).map(t => (
              <button
                key={t}
                className="choice"
                onClick={() => s.plant(p.id, t, 'ginger')}
                disabled={s.cash < SEEDS[t].cost || s.energy < ENERGY.plant || (t === 'certified' && !isUnlocked(s, 'certifiedSeed'))}
              >
                <strong>
                  {t === 'certified' && !isUnlocked(s, 'certifiedSeed')
                    ? `🔒 ${SEEDS[t].label} (${lockedReason(s, 'certifiedSeed')})`
                    : `🌾 Ginger · ${SEEDS[t].label}`}
                </strong>
                <span>{money(SEEDS[t].cost)} · {Math.round(SEEDS[t].germination * 100)}% emergence</span>
                <small>
                  {consecutiveGinger > 0 ? `⚠️ Monoculture: +${consecutiveGinger * 20}% rot risk! ` : ''}
                  {SEEDS[t].blurb}
                </small>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Action grid: irrigation, fertilizer, compost, inspection, treatment */}
      <div className="action-grid" style={{ marginTop: '10px' }}>
        {p.status !== 'empty' && (
          <button className="action" onClick={() => s.irrigate(p.id)} disabled={s.energy < ENERGY.water}>
            <strong>💧 Water</strong><small>400 L from tank</small>
          </button>
        )}
        {p.status !== 'empty' && (
          <button className="action" onClick={() => s.fertilize(p.id)} disabled={s.cash < FERTILIZER_COST}>
            <strong>🌱 N-P-K</strong><small>{money(FERTILIZER_COST)}{isWet(s.weather) ? ' · leaches in rain' : ''}</small>
          </button>
        )}
        {(p.status === 'empty' || p.status === 'prepared') && (
          <button
            className="action"
            onClick={() => s.applyCompost(p.id)}
            disabled={(s.cash < compostCost && !hasCompostStock) || s.energy < ENERGY.fertilize}
          >
            <strong>🍂 Compost</strong>
            <small>{hasCompostStock ? 'From stock' : money(COMPOST_COST)} · +15% OM</small>
          </button>
        )}
        {cropped && (
          <button className="action" onClick={() => s.inspect(p.id)} disabled={s.energy < ENERGY.inspect}>
            <strong>🔍 Inspect</strong><small>Check pests & rot</small>
          </button>
        )}
        {p.issue?.detected && (
          <button className="action warn" onClick={() => s.treat(p.id)}>
            <strong>🧪 Treat</strong><small>{TREATMENTS[p.issue.kind].label} · {money(TREATMENTS[p.issue.kind].cost)}</small>
          </button>
        )}
        {p.germinated && p.stand < 0.9 && p.growth < 60 && !isSoy && (
          <button className="action" onClick={() => s.gapFill(p.id)}>
            <strong>🪴 Gap-fill</strong><small>{Math.round(p.stand * 100)}% stand · {money(gapCost)}</small>
          </button>
        )}
      </div>

      {/* Harvest or Green Manure options */}
      {cropped && (
        <div className="harvest-box">
          {canHarvest(p) ? (
            <>
              <div className="modal-row">
                <span>{isSoy ? 'Harvest Grain (Soybean)' : 'Harvest now (Ginger)'}</span>
                <b>
                  ≈{Math.round(yieldNow)} kg · {isSoy ? `₦${SOYBEAN_PRICE_PER_KG}/kg` : `Grade ${gradeNow}`}
                  {!isSoy && <Tip text={GRADE_TIP} align="right" />}
                </b>
              </div>
              <small className="muted">
                {isSoy
                  ? 'Sell grain to aggregator or incorporate biomass as green manure.'
                  : p.status === 'growing'
                    ? 'Early harvest: lower yield, zero weather risk.'
                    : p.daysReady < 4
                      ? 'Peak maturity: optimal yield and grade.'
                      : 'Over-mature: harvest soon.'}
              </small>
              <div style={{ display: 'grid', gridTemplateColumns: isSoy ? '1fr 1fr' : '1fr', gap: '8px' }}>
                <button
                  className={`action ${p.status === 'ready' ? 'primary' : ''}`}
                  onClick={() => s.harvest(p.id)}
                  disabled={s.energy < harvestEnergy(s)}
                >
                  <strong>🧺 Harvest Grain</strong>
                  <small>{harvestEnergy(s)}⚡</small>
                </button>
                {isSoy && (
                  <button
                    className="action"
                    onClick={() => s.greenManure(p.id)}
                    disabled={s.energy < harvestEnergy(s)}
                    title="Incorporate legume biomass directly into topsoil without grain export"
                  >
                    <strong>🌿 Green Manure</strong>
                    <small>Till under (+30 Fert, +18 OM)</small>
                  </button>
                )}
              </div>
            </>
          ) : (
            <small className="muted">Harvest possible from 70% growth.</small>
          )}
        </div>
      )}
    </div>
  );
}
