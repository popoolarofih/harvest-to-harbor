'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { WEATHER_INFO, compoundSite, dailyFixedCosts, maxEnergy, money, plotName, tankCapacity, titleFor } from '../game/simulation';
import { currentStep } from '../game/tutorial';
import { useGameStore, type Panel } from '../stores/gameStore';
import { boot, setMusic, startNewSeason, useScreenTurn, useSession } from '../stores/session';
import TitleScreen from './TitleScreen';
import BusinessPanel from './hud/BusinessPanel';
import { CampaignJournal, MissionCard, StoryCard } from './hud/Campaign';
import { CareerLadder, LevelUpCard, XpBar } from './hud/Career';
import MarketPanel from './hud/MarketPanel';
import { ConfirmDialog, GameMenu, SaveErrorBanner, SaveIndicator, Tip } from './hud/Menus';
import { IntroStory, TutorialCard } from './hud/Onboarding';
import PlotPanel from './hud/PlotPanel';
import { InspectionModal, MorningReport } from './hud/Reports';
import StoragePanel from './hud/StoragePanel';
import TradePanel from './hud/TradePanel';
import ProfileModal from './hud/ProfileModal';
import BulkActionsModal from './hud/BulkActionsModal';
import { NpcCard, TankCard } from './hud/WorldCards';
import { faceNorth, rotateStep, setCameraMode, toggleCameraMode, view, zoomBy } from './world/playerState';
import { enableAudio, playClick, setAudioPreferences } from '../lib/audio';
import { useSettings } from '../stores/session';

const FarmScene = dynamic(() => import('./FarmScene'), { ssr: false, loading: () => <div className="scene-loading">Preparing your farm...</div> });
const TABS: [Panel, string][] = [['farm', 'Farm'], ['storage', 'Storage'], ['market', 'Market'], ['trade', 'Trade'], ['business', 'Business'], ['journal', 'Journal']];
const EVENT_LABEL = { priceCrash: '📉 Price crash', fuelSpike: '⛽ Fuel spike', workerShortage: '👷 Worker shortage' } as const;

const TIPS = {
  cash: 'Cash on hand. Seed, fertiliser, diesel and fees come out of it, and wages and upkeep are paid every night.',
  day: 'Days only pass when you press End day. Each night runs the weather, crop growth, wages and market prices.',
  weather: 'Rain fills the tank and waters crops but washes fertiliser away. Storms flood flat beds in the low field. The 5-day forecast is in the side panel.',
  energy: 'Every action uses energy. It refills when you end the day, and each worker you hire adds 30 more.',
  tank: 'Water for irrigation and washing. Each bed takes 400 L. Rain refills it for free; the borehole pump burns diesel.',
  level: 'Earn XP from missions, harvests and sales. Levels unlock better seed, equipment, buyers and loans.',
};

/** Phases: title (and boot, before storage is read) → intro → playing. The farm renders behind all of them. */
export default function Game() {
  const phase = useSession(s => s.phase);
  const theme = useGameStore(s => s.profile.theme);
  const music = useSettings(s => s.music), effects = useSettings(s => s.effects);
  const musicVolume = useSettings(s => s.musicVolume), effectsVolume = useSettings(s => s.effectsVolume);
  // When the orientation setting disagrees with how the device is held, the whole game is turned with CSS.
  const turn = useScreenTurn(s => s.turn);
  // Storage is only read on the client, after hydration, so the server and first client render match.
  useEffect(() => { boot(); }, []);
  useEffect(() => {
    setAudioPreferences(music, effects, musicVolume, effectsVolume);
  }, [music, effects, musicVolume, effectsVolume]);
  useEffect(() => {
    const onPointerDown = () => enableAudio();
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) playClick();
    };
    window.addEventListener('pointerdown', onPointerDown, { once: true });
    window.addEventListener('click', onClick);
    const onKey = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'm' && !event.metaKey && !event.ctrlKey && !event.altKey) setMusic(!useSettings.getState().music); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); };
  }, []);
  // Highlight the HUD control the current tutorial step is about (see `data-tut` attributes).
  const control = useGameStore(s => (s.story ? null : currentStep(s.tutorial)?.control ?? null));
  const turnClass = turn === 90 ? 'turn-cw' : turn === -90 ? 'turn-ccw' : '';
  return (
    <div className={`game-shell ${turnClass} ${phase === 'playing' && control ? `tut-${control}` : ''}`} data-theme={theme}>
      <div className="canvas-wrap"><FarmScene /></div>
      {phase === 'playing' && <Hud />}
      {(phase === 'boot' || phase === 'title') && <TitleScreen />}
      {phase === 'intro' && <IntroStory />}
    </div>
  );
}

/** Zoom, turn, inspect and north-up buttons. The compass needle is moved every frame without React renders. */
function CameraControls() {
  const needle = useRef<HTMLSpanElement>(null);
  const [inspecting, setInspecting] = useState(view.mode === 'inspect');
  useEffect(() => {
    let raf = 0, last = NaN;
    const tick = () => {
      // The needle points to north on screen: it turns opposite to the world.
      if (needle.current && view.yawNow !== last) { last = view.yawNow; needle.current.style.transform = `rotate(${-last}rad)`; }
      if ((view.mode === 'inspect') !== inspecting) {
        setInspecting(view.mode === 'inspect');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inspecting]);

  return (
    <>
      <div className="zoom-ctrl" role="group" aria-label="Camera">
        <button id="cam-zoom-in" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button id="cam-zoom-out" onClick={() => zoomBy(1.2)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button id="cam-rotate-left" className="rot" onClick={() => rotateStep(-1)} aria-label="Turn camera left" title="Turn left (Q)">⟲</button>
        <button id="cam-rotate-right" className="rot" onClick={() => rotateStep(1)} aria-label="Turn camera right" title="Turn right (R)">⟳</button>
        <button
          id="cam-inspect"
          className="rot"
          onClick={() => { toggleCameraMode(); setInspecting(view.mode === 'inspect'); }}
          aria-label="Toggle inspection mode"
          title="Free Inspection Mode (C)"
          style={{ background: inspecting ? '#2d6a4f' : undefined, color: inspecting ? '#fff' : undefined }}
        >
          🔭
        </button>
        <button id="cam-north" className="compass" onClick={faceNorth} aria-label="Face north" title="North up">
          <span ref={needle} className="needle" aria-hidden><i>N</i></span>
        </button>
      </div>
      {inspecting && (
        <div className="inspect-banner">
          <span>🔭 <strong>Inspection</strong>: WASD pan · Drag orbit · Scroll zoom</span>
          <button
            onClick={() => { setCameraMode('follow'); setInspecting(false); }}
            className="inspect-exit-btn"
          >
            Exit (ESC)
          </button>
        </div>
      )}
    </>
  );
}

function Hud() {
  const s = useGameStore();
  const panel = s.panel, setPanel = s.openPanel;
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [cleanView, setCleanView] = useState(false);
  const [opsCollapsed, setOpsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setCompact(true);
    }
  }, []);

  useEffect(() => { if (!s.toast) return; const t = setTimeout(s.clearToast, 3600); return () => clearTimeout(t); }, [s.toast, s.clearToast]);
  // After the truck pulls out of the gate, follow the shipment on the map.
  const shipAt = s.fx?.kind === 'ship' ? s.fx.at : null, openPanel = s.openPanel;
  useEffect(() => { if (shipAt === null) return; const t = setTimeout(() => openPanel('trade'), 3500); return () => clearTimeout(t); }, [shipAt, openPanel]);

  const crops = s.plots.filter(p => p.status === 'growing' || p.status === 'ready');
  const ready = s.plots.filter(p => p.status === 'ready' && p.compound === s.site);
  const readyElsewhere = s.plots.filter(p => p.status === 'ready' && p.compound !== s.site).length;
  const crewHarvests = (s.automation.fieldWorkers ?? 0) > 0 && (s.automation.autoHarvest ?? true);
  const place = s.site ? compoundSite(s.site).place : 'Kafanchan';
  const freshKg = s.batches.filter(b => b.product === 'fresh').reduce((a, b) => a + b.kg, 0);
  const driedKg = s.batches.filter(b => b.product === 'dried').reduce((a, b) => a + b.kg, 0);
  const nightly = dailyFixedCosts(s);
  const weather = WEATHER_INFO[s.weather];
  const tutorialOn = s.tutorial.status === 'active';

  return (
    <div className={`hud ${cleanView ? 'zen-mode' : ''}`}>
      {cleanView && (
        <button
          className="zen-floating-toggle"
          onClick={() => setCleanView(false)}
          aria-label="Exit Zen view and show HUD controls"
        >
          👁️ Show Controls
        </button>
      )}
      <header className="topbar">
        <div className="brand brand-btn" role="button" tabIndex={0} onClick={s.openProfile} title="Personalize your farm and farmer">
          <small>{s.profile.emblem} {s.profile.farmName}</small>
          <span className="brand-text">HARVEST TO HARBOR</span>
        </div>
        <div className="stats">
          <div className="stat"><span>Cash <Tip text={TIPS.cash} /></span><b>{money(s.cash)}</b></div>
          <div className="stat"><span>Day <Tip text={TIPS.day} /></span><b>{s.day}</b></div>
          <div className="stat"><span>Weather <Tip text={TIPS.weather} /></span><b>{weather.icon} <span className="wx-label">{weather.label}</span></b></div>
          <div className="stat"><span>Energy <Tip text={TIPS.energy} /></span><b>{s.energy}/{maxEnergy(s)}</b></div>
          <div className="stat"><span>Tank <Tip text={TIPS.tank} /></span><b>{s.water.toLocaleString()} L</b></div>
          <div className="stat" title={titleFor(s.level)}><span>Level <Tip text={TIPS.level} align="right" /></span><b>{s.level}</b></div>
        </div>
        <div className="top-right">
          <button
            className="zen-btn"
            onClick={() => setCleanView(true)}
            aria-label="Clean view (Hide HUD)"
            title="Clean View / Full Screen Farm"
          >
            🌿
          </button>
          <SaveIndicator />
          <button className="menu-btn" onClick={() => setMenu(true)} aria-label="Menu" title="Menu">☰</button>
        </div>
      </header>
      <SaveErrorBanner />

      <section
        className={`side ${compact ? 'compact' : ''} ${tutorialOn ? 'with-tutorial' : ''}`}
        onClick={compact ? () => setCompact(false) : undefined}
      >
        <button
          className="collapse"
          onClick={(e) => {
            e.stopPropagation();
            setCompact(!compact);
          }}
          aria-label={compact ? 'Expand panel' : 'Collapse panel'}
        >
          {compact ? '▸' : '✕'}
        </button>
        <div className="eyebrow" onClick={() => setCompact(!compact)} style={{ cursor: 'pointer' }}>Season 01 · {s.profile.farmerName} · {place}</div>
        {(s.compounds ?? []).length > 0 && (
          <div className="site-switch" role="group" aria-label="Travel between your farms" onClick={e => e.stopPropagation()}>
            <button className={!s.site ? 'on' : ''} onClick={() => s.travel(undefined)} title={s.profile.farmName}>🏠 Home</button>
            {s.compounds.map(c => (
              <button key={c.site} className={s.site === c.site ? 'on' : ''} onClick={() => s.travel(c.site)} title={compoundSite(c.site).name}>
                🌍 {compoundSite(c.site).place}
              </button>
            ))}
          </div>
        )}
        <XpBar />
        <TutorialCard />
        <MissionCard />
        <div className="forecast">
          <span className="label">Today: {weather.icon} {weather.label}</span>
          <div className="forecast-days">
            {s.forecast.map(f => (
              <div key={f.day} title={`${WEATHER_INFO[f.weather].label}, ${Math.round(f.confidence * 100)}% confidence`}>
                <small>D{f.day}</small><b>{WEATHER_INFO[f.weather].icon}</b><em>{Math.round(f.confidence * 100)}%</em>
              </div>
            ))}
          </div>
          <small className="muted">5-day weather outlook</small>
        </div>
        {s.events.length > 0 && <div className="events">{s.events.map(e => <span key={e.kind} className="chip">{EVENT_LABEL[e.kind]} · {e.daysLeft}d</span>)}</div>}
        <div className="weather"><span>FRESH</span><b>{money(s.market.fresh)}/kg</b><span>DRIED</span><b>{money(s.market.dried)}/kg</b></div>
      </section>

      <aside className={`hud-right ${opsCollapsed ? 'ops-min' : ''}`}>
        <section className="actions">
          {s.selectedPlot !== null ? <PlotPanel /> : s.tankOpen ? <TankCard /> : s.talkingTo ? <NpcCard /> : (
            <div className={`card operations-card ${opsCollapsed ? 'minimized' : ''}`}>
              <div className="mobile-ops-header mobile-only">
                <span className="ops-title">Operations</span>
                <button
                  type="button"
                  className="ops-min-btn"
                  onClick={() => setOpsCollapsed(!opsCollapsed)}
                  aria-label={opsCollapsed ? 'Expand operations' : 'Minimize operations'}
                >
                  {opsCollapsed ? '▲ Actions' : '▼ Hide'}
                </button>
              </div>
              <div className="eyebrow desktop-only">Operations</div>
              <h3 className="desktop-only">Run the farm</h3>
              <p className="muted small desktop-only">
                <span className="hint-mouse"><kbd>WASD</kbd> Move · <kbd>E</kbd> Interact · <kbd>Q</kbd>/<kbd>R</kbd> Turn · Scroll Zoom</span>
                <span className="hint-touch">Tap to walk & interact · Pinch zoom</span>
              </p>
              <div className="action-grid">
                <button className="action primary" data-tut="end-day" onClick={s.advance}><strong>🌙 End day</strong><small>{nightly > 0 ? `${money(nightly)} nightly costs` : 'Advance day'}</small></button>
                <button className="action" onClick={s.pump} disabled={s.water >= tankCapacity(s)}><strong>⛽ Pump borehole</strong><small className="desktop-only">Fill water tank</small></button>
                <button className="action mobile-hide-dup" onClick={() => setPanel('storage')}><strong>📦 Storage</strong><small>{Math.round(freshKg)} kg fresh · {Math.round(driedKg)} kg dried</small></button>
                <button className="action mobile-hide-dup" onClick={() => setPanel('business')}><strong>🏗 Business</strong><small>Workers, loans & upgrades</small></button>
                <button className="action" onClick={() => setBulkModal(true)}><strong>🚜 Bulk operations</strong><small className="desktop-only">{(s.compounds ?? []).length ? 'Across all your farms' : 'Field automation'}</small></button>
              </div>
              {ready.length > 0 && (
                <div
                  className="alert good harvest-chip"
                  onClick={() => s.select(ready[0].id)}
                  title="Click to view ready plot"
                >
                  🌾 Ready: {ready.map(plotName).join(', ')}
                  {crewHarvests && <small className="chip-note"> · your crew lifts them tomorrow morning</small>}
                </div>
              )}
              {readyElsewhere > 0 && <div className="alert harvest-chip muted">🌾 {readyElsewhere} bed{readyElsewhere > 1 ? 's' : ''} ready on your other farm{(s.compounds ?? []).length > 1 ? 's' : ''}</div>}
              {s.site && <div className="alert site-note">📍 {compoundSite(s.site).name}: no office here. Stock is trucked to the home warehouse.</div>}
            </div>
          )}
        </section>

        <div className="mini-stats">
          <div><span>Planted</span><b>{crops.length}/{s.plots.length}</b></div>
          <div><span>Fresh</span><b>{Math.round(freshKg)} kg</b></div>
          <div><span>Drying</span><b>{s.dryingJobs.length} racks</b></div>
          <div><span>Workers</span><b>{s.workers}</b></div>
        </div>
      </aside>

      <nav className="bottom">
        {TABS.map(([id, label]) => <button key={id} className={`tab ${panel === id ? 'active' : ''}`} data-tut={id === 'storage' ? 'storage-tab' : undefined} onClick={() => setPanel(id)}>{label}</button>)}
      </nav>

      <CameraControls />

      {s.toast && <div className="toast" role="status">{s.toast}</div>}
      <MorningReport />

      {panel !== 'farm' && (
        <div className="modal-backdrop" onClick={() => setPanel('farm')}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setPanel('farm')}>Close</button>
            {panel === 'storage' && <StoragePanel />}
            {panel === 'market' && <MarketPanel />}
            {panel === 'trade' && <TradePanel />}
            {panel === 'business' && <BusinessPanel />}
            {panel === 'journal' && <>
              <div className="eyebrow">Farmer&apos;s journal</div>
              <h2>Farm to Fortune</h2>
              <CampaignJournal />
              <h4>Career</h4>
              <CareerLadder />
              <h4>What the farm is teaching you</h4>
              {s.log.map((l, i) => <div key={i} className={`log ${l.severity}`}><small>Day {l.day}</small> {l.text}</div>)}
              <div className="journal-actions">
                <button className="action" onClick={s.replayTutorial} disabled={tutorialOn}><strong>🎓 Replay tutorial</strong><small>{tutorialOn ? 'Tutorial in progress' : 'Review farming basics'}</small></button>
                <button className="action" onClick={() => setConfirmNew(true)}><strong>🌱 Start a new season</strong><small>Begin fresh season</small></button>
              </div>
            </>}
          </div>
        </div>
      )}
      <InspectionModal />
      <StoryCard />
      <LevelUpCard />
      {bulkModal && <BulkActionsModal onClose={() => setBulkModal(false)} />}
      {menu && <GameMenu onClose={() => setMenu(false)} onOpenProfile={s.openProfile} />}
      {s.customizingProfile && <ProfileModal onClose={s.closeProfile} />}
      {confirmNew && (
        <ConfirmDialog title="Start a new season?" confirm="Start new season" danger onCancel={() => setConfirmNew(false)} onConfirm={() => { setConfirmNew(false); startNewSeason(); }}>
          <p>Your current farm (day {s.day}, {money(s.cash)}, level {s.level}) will be replaced. This can&apos;t be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
