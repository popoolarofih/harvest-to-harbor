'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SAFE_MOISTURE } from '../../game/simulation';
import { useSaveStatus } from '../../stores/persistence';
import { resetSave, rotateScreen, setEffects, setEffectsVolume, setMotion, setMusic, setMusicVolume, setOrientation, toTitle, useSession, useSettings, type MotionPref, type OrientationPref } from '../../stores/session';

/** "Saved just now" / "Saved at 14:05" / "Saved 3 Oct, 14:05". */
export function savedLabel(at: number | null, now = Date.now()) {
  if (!at) return 'Not saved yet';
  if (now - at < 60_000) return 'Saved just now';
  const d = new Date(at), time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date(now).toDateString() ? `Saved at ${time}` : `Saved ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Re-renders a component every 30 s so relative times ("just now") stay true. */
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

/** Subtle autosave indicator for the top bar. Subscribes only to the save status, never to the game. */
export function SaveIndicator() {
  const { state, savedAt } = useSaveStatus();
  const now = useClock();
  const text = state === 'pending' ? 'Saving…' : state === 'error' ? 'Save failed' : savedLabel(savedAt, now);
  return <div className={`save-ind ${state}`} role="status" aria-live="polite" data-testid="save-status"><i aria-hidden /><span className="save-text">{text}</span></div>;
}

/** Explains a failed save until the next one succeeds. */
export function SaveErrorBanner() {
  const error = useSaveStatus(s => (s.state === 'error' ? s.error : null));
  if (!error) return null;
  return <div className="save-banner" role="alert">⚠ {error}</div>;
}

/** A small "?" that explains a mechanic. Hover or focus on desktop, tap on touch screens. */
export function Tip({ text, align = 'center' }: { text: string; align?: 'center' | 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`tip ${align}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="tip-btn" aria-label={text} aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }} onBlur={() => setOpen(false)} onFocus={() => setOpen(true)}>?</button>
      {open && <span role="tooltip" className="tip-pop">{text}</span>}
    </span>
  );
}

/** Escape closes the topmost dialog. Capture phase, so the game's own Escape handling doesn't also run. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
}

export function ConfirmDialog({ title, children, confirm, onConfirm, onCancel, danger }: {
  title: string; children: ReactNode; confirm: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  useEscape(onCancel);
  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onCancel}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <div className="confirm-body">{children}</div>
        <div className="confirm-actions">
          <button ref={cancel} className="action" onClick={onCancel}><strong>Cancel</strong></button>
          <button className={`action ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}><strong>{confirm}</strong></button>
        </div>
      </div>
    </div>
  );
}

const noop = () => {};

const MOTION: [MotionPref, string][] = [['system', 'Match device'], ['reduce', 'Reduced'], ['full', 'Full']];
const ORIENTATION: [OrientationPref, string][] = [['auto', 'Auto'], ['landscape', 'Landscape'], ['portrait', 'Portrait']];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const motion = useSettings(s => s.motion);
  const orientation = useSettings(s => s.orientation);
  const music = useSettings(s => s.music);
  const effects = useSettings(s => s.effects);
  const musicVolume = useSettings(s => s.musicVolume);
  const effectsVolume = useSettings(s => s.effectsVolume);
  const savedAt = useSaveStatus(s => s.savedAt), error = useSaveStatus(s => s.error);
  const save = useSession(s => s.save);
  const [confirmReset, setConfirmReset] = useState(false);
  useEscape(confirmReset ? noop : onClose);
  const hasSave = save?.kind === 'ok' || savedAt !== null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-label="Settings" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={onClose}>Close</button>
        <div className="eyebrow">Settings</div>
        <h2>Settings</h2>
        <h4>Screen</h4>
        <div className="seg" role="radiogroup" aria-label="Screen orientation">
          {ORIENTATION.map(([id, label]) => <button key={id} id={`orientation-${id}`} role="radio" aria-checked={orientation === id} className={orientation === id ? 'on' : ''} onClick={() => setOrientation(id)}>{label}</button>)}
        </div>
        <p className="muted small">Auto follows how you hold your device. Landscape or Portrait keeps the game that way up, even with rotation lock on.</p>
        <h4>Motion</h4>
        <div className="seg" role="radiogroup" aria-label="Motion">
          {MOTION.map(([id, label]) => <button key={id} role="radio" aria-checked={motion === id} className={motion === id ? 'on' : ''} onClick={() => setMotion(id)}>{label}</button>)}
        </div>
        <p className="muted small">Reduced motion stops the menu camera drifting and turns off pulsing highlights and swaying effects.</p>
        <h4>Audio</h4>
        <div className="seg" role="group" aria-label="Audio settings">
          <button role="switch" aria-checked={music} className={music ? 'on' : ''} onClick={() => setMusic(!music)}>Music</button>
          <button role="switch" aria-checked={effects} className={effects ? 'on' : ''} onClick={() => setEffects(!effects)}>Sound effects</button>
        </div>
        <div className="audio-levels">
          <label>Music volume <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} /></label>
          <label>Effects volume <input type="range" min="0" max="1" step="0.05" value={effectsVolume} onChange={e => setEffectsVolume(Number(e.target.value))} /></label>
        </div>
        <h4>Your saved farm</h4>
        <p className="small">
          {save?.kind === 'unavailable' ? 'This browser is blocking site storage, so the game can\'t save here.' : hasSave ? `${savedLabel(savedAt)}. ` : 'No saved farm yet. '}
          The game saves automatically to this browser on this device. Nothing is sent online.
        </p>
        {error && <div className="alert danger">{error}</div>}
        <button className="action danger" disabled={!hasSave} onClick={() => setConfirmReset(true)}><strong>Reset save</strong><small>Delete the saved farm from this device</small></button>
      </div>
      {confirmReset && (
        <ConfirmDialog title="Delete your saved farm?" confirm="Delete save" danger onCancel={() => setConfirmReset(false)}
          onConfirm={() => { setConfirmReset(false); onClose(); resetSave(); }}>
          <p>This permanently removes your farm, cash, contracts and progress from this browser. It can&apos;t be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** The in-game ☰ menu: help, settings, and a way back to the title screen. */
export function GameMenu({ onClose, onOpenProfile }: { onClose: () => void; onOpenProfile?: () => void }) {
  const [view, setView] = useState<'menu' | 'help' | 'settings'>('menu');
  useEscape(view === 'menu' ? onClose : noop);
  if (view === 'help') return <HowToPlay onClose={() => setView('menu')} />;
  if (view === 'settings') return <SettingsPanel onClose={() => setView('menu')} />;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal game-menu" role="dialog" aria-modal="true" aria-label="Menu" onClick={e => e.stopPropagation()}>
        <div className="eyebrow">Harvest to Harbor</div>
        <h2>Menu</h2>
        <SaveIndicator />
        <div className="menu-list">
          <button className="action primary" onClick={onClose}><strong>Resume</strong></button>
          {onOpenProfile && (
            <button id="menu-profile" className="action" onClick={() => { onClose(); onOpenProfile(); }}>
              <strong>🎨 Personalize Farm &amp; Farmer</strong>
            </button>
          )}
          <button className="action" onClick={() => setView('help')}><strong>How to play</strong></button>
          <button className="action" onClick={() => setView('settings')}><strong>Settings</strong></button>
          <button id="menu-rotate-screen" className="action" onClick={rotateScreen}><strong>📱 Rotate screen</strong></button>
          <button className="action" onClick={() => { onClose(); toTitle(); }}><strong>Save &amp; main menu</strong></button>
        </div>
        <a className="menu-legal" href="/privacy" target="_blank" rel="noopener">🔒 Privacy policy</a>
      </div>
    </div>
  );
}

/** Concise reference for the core loop and controls. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal howto" role="dialog" aria-modal="true" aria-label="How to play" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={onClose}>Close</button>
        <div className="eyebrow">How to play</div>
        <h2>Farm, process, export</h2>
        <div className="howto-grid">
          <section>
            <h4>🎮 Move and interact</h4>
            <p><b>Keyboard and mouse:</b> walk with <kbd>WASD</kbd> or the arrow keys (hold <kbd>Shift</kbd> to run), or click the ground. Press <kbd>E</kbd> beside a plot, building or person. Scroll or <kbd>+</kbd>/<kbd>−</kbd> to zoom. Turn the view with <kbd>Q</kbd>/<kbd>R</kbd> or by dragging with the right mouse button.</p>
            <p><b>Touch:</b> tap the ground to walk; tap a plot, building or person to go and use it. Pinch to zoom, twist two fingers to turn the view.</p>
            <p><b>Camera buttons:</b> ⟲ ⟳ turn the view, the compass puts north back at the top. Use <b>Rotate screen</b> in the menu (or Settings) to switch between landscape and portrait.</p>
          </section>
          <section>
            <h4>🌱 Grow</h4>
            <p>Prepare a plot (ridges drain wet low ground), plant seed, then keep soil moisture between 30% and 85%. Inspect beds to find hidden pests and disease before they spread.</p>
          </section>
          <section>
            <h4>🌙 Days</h4>
            <p>Every action costs energy. <b>End day</b> to grow crops, change the weather, pay wages and refill energy. Check the 5-day forecast before storms.</p>
          </section>
          <section>
            <h4>🏭 Process</h4>
            <p>Fresh ginger spoils and sells cheap. Wash, sort and slice it, dry it on the racks to <b>{SAFE_MOISTURE}% moisture or less</b>, then bag it. Sealed bags keep damp out and earn better grades.</p>
          </section>
          <section>
            <h4>💰 Sell and export</h4>
            <p>Grade (Premium, A, B, C) sets the price. Compare buyers in Storage, sign contracts in Trade, and ship export orders through Lagos. Late or failed deliveries cost money and reputation.</p>
          </section>
          <section>
            <h4>👷 Your crew</h4>
            <p>Hire workers in <b>Business → Crew</b>. Field workers <b>harvest ready beds automatically</b> each morning, and can also plant, water, treat and fertilize for you. Processing workers cover racks in rain, bag dry ginger and run the mill.</p>
          </section>
          <section>
            <h4>🌍 Grow the business</h4>
            <p>As cash grows, invest: a solar pump, tractor, ginger digger, company truck and an export office each make farming or shipping easier. From Level 10 you can buy whole new farms in <b>Business → Expansion</b> and travel between them.</p>
          </section>
          <section>
            <h4>🚢 Easy exporting</h4>
            <p>In <b>Trade</b>, each open contract shows a checklist of what is ready and what is wrong. <b>Prepare &amp; ship</b> repacks stock into sealed bags if needed and loads the truck in one click.</p>
          </section>
          <section>
            <h4>💾 Saving</h4>
            <p>The game saves automatically to this browser after every meaningful action and each night. Use <b>Continue Farming</b> on the title screen to pick up where you left off.</p>
          </section>
          <section>
            <h4>🎨 Personalization</h4>
            <p>Customize your farmer&apos;s name, outfit, skin tone, entrance signboard, and export packaging brand by clicking your farm name in the top bar, clicking the entrance signboard, or via the ☰ menu.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
