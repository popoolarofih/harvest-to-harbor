'use client';
import { useState } from 'react';
import { DEFAULT_PROFILE, EMBLEMS, THEMES, type ThemeId } from '../../game/config';
import { titleFor } from '../../game/simulation';
import { CHARACTER_VARIANTS, SKIN_TONES } from '../world/models';
import { useGameStore } from '../../stores/gameStore';

const NIGERIAN_NAMES = [
  'Bala', 'Amina', 'Tunde', 'Zainab', 'Emeka', 'Halima', 'Musa', 'Damilola',
  'Fatimah', 'Chinedu', 'Usman', 'Folake', 'Ibrahim', 'Khadijah', 'Oluwaseun', 'Ngozi',
];

const FARM_NAME_PRESETS = [
  'Kafanchan Green Acres',
  'Kaduna Valley Agribusiness',
  'Zaria Sun Organics',
  'Jos Plateau Ginger Co.',
  'Musa & Co. Heritage Farm',
  'Northern Ridge Spices',
];

const EXPORT_BRAND_PRESETS = [
  'Naija Sun Spices',
  'Kafanchan Royal Ginger',
  'Savannah Gold Exotics',
  'Harbor Star Spices',
  'Lagos Gate Export Lot',
  'Green Harbor Organics',
];

const VARIANT_LABELS: Record<string, string> = {
  'male-a': 'Work Overalls',
  'male-b': 'Field Jacket',
  'male-c': 'Plaid Shirt',
  'male-d': 'Casual Tee',
  'male-e': 'Harvest Dungarees',
  'male-f': 'Farm Cap & Vest',
  'female-a': 'Field Dungarees',
  'female-b': 'Sun Hat & Overalls',
  'female-c': 'Work Shirt',
  'female-d': 'Denim & Cap',
  'female-e': 'Field Blouse',
  'female-f': 'Work Apron',
};

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const storeProfile = useGameStore(s => s.profile);
  const updateProfile = useGameStore(s => s.updateProfile);
  const level = useGameStore(s => s.level);

  const [tab, setTab] = useState<'farmer' | 'farm' | 'export' | 'theme'>('farmer');
  const [profile, setProfile] = useState({ ...storeProfile });

  const setPatch = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    updateProfile(patch);
    if (patch.theme && typeof document !== 'undefined') {
      document.documentElement.dataset.theme = patch.theme;
    }
  };

  const randomizeName = () => {
    const pool = NIGERIAN_NAMES.filter(n => n !== profile.farmerName);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setPatch({ farmerName: pick });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" role="dialog" aria-modal="true" aria-label="Personalization" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div className="eyebrow" style={{ margin: 0 }}>Personalization &amp; Identity</div>
          <button className="close" onClick={onClose} aria-label="Close dialog" style={{ float: 'none', margin: 0, padding: '4px 12px', fontSize: '13px' }}>✕ Close</button>
        </div>
        <h2>{profile.emblem} {profile.farmName}</h2>

        <div className="profile-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'farmer'} className={`tab-btn ${tab === 'farmer' ? 'on' : ''}`} onClick={() => setTab('farmer')}>
            👤 Farmer
          </button>
          <button role="tab" aria-selected={tab === 'farm'} className={`tab-btn ${tab === 'farm' ? 'on' : ''}`} onClick={() => setTab('farm')}>
            🏡 Farm Branding
          </button>
          <button role="tab" aria-selected={tab === 'export'} className={`tab-btn ${tab === 'export' ? 'on' : ''}`} onClick={() => setTab('export')}>
            📦 Export Brand
          </button>
          <button role="tab" aria-selected={tab === 'theme'} className={`tab-btn ${tab === 'theme' ? 'on' : ''}`} onClick={() => setTab('theme')}>
            🎨 UI Theme
          </button>
        </div>

        {tab === 'farmer' && (
          <div className="tab-pane">
            <div className="form-group">
              <label htmlFor="farmer-name">Farmer Name</label>
              <div className="input-row">
                <input
                  id="farmer-name"
                  type="text"
                  maxLength={24}
                  value={profile.farmerName}
                  onChange={e => setPatch({ farmerName: e.target.value })}
                  placeholder="Your Name"
                />
                <button type="button" className="action" onClick={randomizeName} title="Random Nigerian name">
                  🎲 Randomize
                </button>
              </div>
              <small className="muted">Level {level} {titleFor(level)} · Appears in dialogue, contracts and in the 3D farm.</small>
            </div>

            <div className="form-group">
              <label>Skin Tone</label>
              <div className="tone-swatches" role="radiogroup" aria-label="Skin tone">
                {SKIN_TONES.map((color, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="radio"
                    aria-checked={profile.skinTone === idx}
                    className={`tone-swatch ${profile.skinTone === idx ? 'on' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setPatch({ skinTone: idx })}
                    title={`Tone ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Farmer Outfit &amp; Appearance</label>
              <div className="variant-grid" role="radiogroup" aria-label="Character outfit">
                {CHARACTER_VARIANTS.map(variant => (
                  <button
                    key={variant}
                    type="button"
                    role="radio"
                    aria-checked={profile.avatar === variant}
                    className={`variant-card ${profile.avatar === variant ? 'on' : ''}`}
                    onClick={() => setPatch({ avatar: variant })}
                  >
                    <span className="variant-avatar">{variant.startsWith('female') ? '👩🏾‍🌾' : '👨🏾‍🌾'}</span>
                    <strong className="variant-name">{VARIANT_LABELS[variant] ?? variant}</strong>
                    <small className="muted">{variant}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'farm' && (
          <div className="tab-pane">
            <div className="form-group">
              <label htmlFor="farm-name">Farm Name</label>
              <input
                id="farm-name"
                type="text"
                maxLength={32}
                value={profile.farmName}
                onChange={e => setPatch({ farmName: e.target.value })}
                placeholder="Farm Name"
              />
              <div className="preset-chips">
                <span className="muted small">Suggestions:</span>
                {FARM_NAME_PRESETS.map(preset => (
                  <button key={preset} type="button" className="chip-btn" onClick={() => setPatch({ farmName: preset })}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Farm Emblem</label>
              <div className="emblem-grid" role="radiogroup" aria-label="Farm emblem">
                {EMBLEMS.map(emblem => (
                  <button
                    key={emblem}
                    type="button"
                    role="radio"
                    aria-checked={profile.emblem === emblem}
                    className={`emblem-btn ${profile.emblem === emblem ? 'on' : ''}`}
                    onClick={() => setPatch({ emblem })}
                  >
                    {emblem}
                  </button>
                ))}
              </div>
            </div>

            <div className="signboard-preview">
              <span className="preview-label">Entrance Signboard Preview</span>
              <div className="preview-board">
                <div className="board-emblem">{profile.emblem}</div>
                <div className="board-title">{profile.farmName}</div>
                <div className="board-sub">Southern Kaduna · Ginger Farmland · Est. 2026</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'export' && (
          <div className="tab-pane">
            <div className="form-group">
              <label htmlFor="export-brand">Export Brand Name</label>
              <input
                id="export-brand"
                type="text"
                maxLength={32}
                value={profile.exportBrand}
                onChange={e => setPatch({ exportBrand: e.target.value })}
                placeholder="Export Brand Name"
              />
              <small className="muted">Used on packaged Grade A and Premium export lots sent to Europe and America.</small>
              <div className="preset-chips">
                <span className="muted small">Suggestions:</span>
                {EXPORT_BRAND_PRESETS.map(preset => (
                  <button key={preset} type="button" className="chip-btn" onClick={() => setPatch({ exportBrand: preset })}>
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="export-stamp-preview">
              <div className="stamp-box">
                <span className="stamp-seal">★ CERTIFIED NIGERIAN GINGER ★</span>
                <strong className="stamp-brand">{profile.exportBrand}</strong>
                <small className="stamp-origin">Packed in Kafanchan · Exported via Apapa Port, Lagos</small>
                <div className="stamp-grade">PREMIUM EXPORT GRADE · SEALED PACKAGING</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'theme' && (
          <div className="tab-pane">
            <label>Interface Color Theme</label>
            <p className="muted small">Tailor the visual aesthetic across buttons, highlights, badges and progress indicators.</p>
            <div className="theme-grid" role="radiogroup" aria-label="Color theme">
              {(Object.keys(THEMES) as ThemeId[]).map(themeId => {
                const info = THEMES[themeId];
                return (
                  <button
                    key={themeId}
                    type="button"
                    role="radio"
                    aria-checked={profile.theme === themeId}
                    className={`theme-card ${profile.theme === themeId ? 'on' : ''}`}
                    onClick={() => setPatch({ theme: themeId })}
                  >
                    <div className="theme-swatch" style={{ background: `linear-gradient(135deg, ${info.primary}, ${info.secondary})` }}>
                      <span className="theme-pip" style={{ background: info.bg }} />
                    </div>
                    <strong>{info.label}</strong>
                    <small className="muted">{info.primary}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-actions-bar">
          <button type="button" className="action primary" onClick={onClose}>
            <strong>Done</strong>
          </button>
        </div>
      </div>
    </div>
  );
}
