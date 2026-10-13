'use client';
import { useState } from 'react';
import {
  PREP, SEEDS, previewBulk, money, isUnlocked, SOYBEAN_SEED_COST, type BulkActionKind, type CropType, type PrepMethod, type SeedTier,
} from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

interface BulkActionsModalProps {
  onClose: () => void;
}

const ACTION_DESCRIPTIONS: Record<BulkActionKind, { title: string; blurb: string; icon: string }> = {
  tillAndPlant: { title: 'Till & Plant Empty Beds', blurb: 'Prepare the soil and sow seeds across all eligible empty beds in one operation.', icon: '🌱' },
  compost: { title: 'Apply Farmyard Compost', blurb: 'Apply organic village compost to empty and prepared beds to rebuild humus (+15% OM, +15 fert, -8 compaction).', icon: '🍂' },
  water: { title: 'Water All Dry Beds', blurb: 'Irrigate all beds that need moisture using tank water.', icon: '💧' },
  fertilize: { title: 'Fertilize Under-Nourished Beds', blurb: 'Apply chemical fertilizer to all beds with fertility below 70%. Uses warehouse stock if available.', icon: '🌾' },
  inspect: { title: 'Inspect All Standing Crops', blurb: 'Scout all growing and mature beds to detect hidden pests, leaf spot, or rot.', icon: '🔍' },
  treat: { title: 'Treat All Identified Problems', blurb: 'Apply insecticide, fungicide, or lime to all beds with identified crop diseases.', icon: '🧪' },
  gapFill: { title: 'Gap-Fill Young Crops', blurb: 'Replant missing setts on young crops with patchy emergence to restore stand.', icon: '🪴' },
};

export default function BulkActionsModal({ onClose }: BulkActionsModalProps) {
  const s = useGameStore();
  const [action, setAction] = useState<BulkActionKind>('tillAndPlant');
  const [prepMethod, setPrepMethod] = useState<PrepMethod>('ridge');
  const [plantCrop, setPlantCrop] = useState<CropType>('ginger');
  const [plantSeed, setPlantSeed] = useState<SeedTier>('improved');
  const [allowPartial, setAllowPartial] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const preview = previewBulk(s, action, { prepMethod, plantSeed, plantCrop });

  const handleExecute = () => {
    s.executeBulk(action, { prepMethod, plantSeed, plantCrop }, allowPartial);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bulk-modal" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        <div className="eyebrow">Operations · Field Automation</div>
        <h2>🚜 Bulk Field Operations</h2>
        <p className="muted small">
          Batch-process multiple beds at once. Every operation strictly enforces real costs, energy, crop eligibility, and equipment rules.
        </p>

        <div className="bulk-tabs">
          {(Object.keys(ACTION_DESCRIPTIONS) as BulkActionKind[]).map(k => (
            <button
              key={k}
              className={`choice ${action === k ? 'active' : ''}`}
              onClick={() => { setAction(k); setConfirmed(false); }}
            >
              <strong>{ACTION_DESCRIPTIONS[k].icon} {ACTION_DESCRIPTIONS[k].title.split(' ')[0]}</strong>
              <small>{ACTION_DESCRIPTIONS[k].title}</small>
            </button>
          ))}
        </div>

        <div className="batch">
          <div className="batch-head">
            <b>{ACTION_DESCRIPTIONS[action].icon} {ACTION_DESCRIPTIONS[action].title}</b>
            <span className={preview.eligibleCount > 0 ? 'grade gA' : 'grade gC'}>
              {preview.eligibleCount} bed{preview.eligibleCount === 1 ? '' : 's'} eligible
            </span>
          </div>
          <small className="muted">{ACTION_DESCRIPTIONS[action].blurb}</small>

          {action === 'tillAndPlant' && (
            <div className="crew-subgroup" style={{ margin: '12px 0' }}>
              <label>
                <span>Crop selection</span>
                <select value={plantCrop} onChange={e => setPlantCrop(e.target.value as CropType)}>
                  <option value="ginger">🌾 Ginger (Cash rhizome crop)</option>
                  <option value="soybean">🌱 Soybean TGX-1448-2E (Nitrogen rotation crop)</option>
                </select>
              </label>
              <label>
                <span>Prep method</span>
                <select value={prepMethod} onChange={e => setPrepMethod(e.target.value as PrepMethod)}>
                  <option value="ridge">Raised ridges ({money(PREP.ridge.cost)} · rot protection)</option>
                  <option value="clear">Clear & till ({money(PREP.clear.cost)} · economical)</option>
                </select>
              </label>
              {plantCrop === 'ginger' ? (
                <label>
                  <span>Seed choice</span>
                  <select value={plantSeed} onChange={e => setPlantSeed(e.target.value as SeedTier)}>
                    <option value="improved">Improved variety ({money(SEEDS.improved.cost)} · recommended)</option>
                    <option value="local">Farm-saved setts ({money(SEEDS.local.cost)} · budget)</option>
                    {isUnlocked(s, 'certifiedSeed') && (
                      <option value="certified">Certified disease-free ({money(SEEDS.certified.cost)} · top yield)</option>
                    )}
                  </select>
                </label>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--green)', padding: '6px 0' }}>
                  🌱 Soybean seeds: {money(SOYBEAN_SEED_COST)}/bed. Fixes +20 nitrogen, cuts rot by 50%.
                </div>
              )}
            </div>
          )}

          <div className="preview" style={{ margin: '12px 0' }}>
            <div>
              <span>Eligible beds</span>
              <b>{preview.eligibleCount}</b>
              <small>{preview.skipped.length} skipped</small>
            </div>
            <div>
              <span>Energy required</span>
              <b className={s.energy < preview.reqEnergy ? 'warn' : ''}>
                {preview.reqEnergy}⚡ / {s.energy}⚡
              </b>
              <small>{s.energy >= preview.reqEnergy ? 'Sufficient' : 'Low energy'}</small>
            </div>
            <div>
              <span>Cash required</span>
              <b className={s.cash < preview.reqCash ? 'warn' : ''}>
                {money(preview.reqCash)}
              </b>
              <small>Balance: {money(s.cash)}</small>
            </div>
            {preview.reqWater > 0 && (
              <div>
                <span>Tank water</span>
                <b className={s.water < preview.reqWater ? 'warn' : ''}>
                  {preview.reqWater.toLocaleString()} L
                </b>
                <small>Tank: {s.water.toLocaleString()} L</small>
              </div>
            )}
          </div>

          {Object.keys(preview.reqStock).length > 0 && (
            <div className="alert" style={{ background: 'rgba(94, 234, 212, 0.1)', borderColor: 'var(--primary)' }}>
              📦 Warehouse stock will be used: {Object.entries(preview.reqStock).map(([k, qty]) => `${qty} ${k}`).join(', ')} (saving cash!).
            </div>
          )}

          {preview.risks.length > 0 && (
            <div className="alert warn">
              <b>⚠️ Caution:</b>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {preview.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <details style={{ margin: '8px 0', fontSize: '0.85rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>
                View {preview.skipped.length} skipped bed{preview.skipped.length > 1 ? 's' : ''} & reasons
              </summary>
              <ul style={{ margin: '6px 0 0 16px', color: 'var(--muted)' }}>
                {preview.skipped.map((sk, i) => (
                  <li key={i}>Plot {sk.name}: {sk.reason}</li>
                ))}
              </ul>
            </details>
          )}

          {preview.blockReason && (
            <div className="alert danger">
              🚫 {preview.blockReason}
            </div>
          )}

          <div style={{ margin: '12px 0' }}>
            <label className="check">
              <input
                type="checkbox"
                checked={allowPartial}
                onChange={e => setAllowPartial(e.target.checked)}
              />
              Allow partial execution (process as many beds as resources permit before stopping)
            </label>
          </div>

          {!confirmed ? (
            <button
              className="action primary wide"
              disabled={preview.eligibleCount === 0 || (!preview.canAfford && !allowPartial)}
              onClick={() => setConfirmed(true)}
            >
              <strong>Review & Confirm {ACTION_DESCRIPTIONS[action].title}</strong>
              <small>{preview.eligibleCount} beds · {money(preview.reqCash)} · {preview.reqEnergy}⚡</small>
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="action wide" onClick={() => setConfirmed(false)}>
                Back
              </button>
              <button
                className="action primary wide"
                onClick={handleExecute}
              >
                <strong>Confirm & Execute Now</strong>
                <small>Charges {money(preview.reqCash)} & {preview.reqEnergy}⚡</small>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
