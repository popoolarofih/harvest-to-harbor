'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { WEATHER_INFO, maxEnergy, money, plotName, tankCapacity, titleFor } from '../game/simulation';
import { useGameStore, type Panel } from '../stores/gameStore';
import BusinessPanel from './hud/BusinessPanel';
import { CampaignJournal, MissionCard, StoryCard } from './hud/Campaign';
import { CareerLadder, LevelUpCard, XpBar } from './hud/Career';
import MarketPanel from './hud/MarketPanel';
import PlotPanel from './hud/PlotPanel';
import { InspectionModal, MorningReport } from './hud/Reports';
import StoragePanel from './hud/StoragePanel';
import TradePanel from './hud/TradePanel';
import { InteractPrompt, NpcCard, TankCard } from './hud/WorldCards';
import { zoomBy } from './world/playerState';

const FarmScene = dynamic(() => import('./FarmScene'), { ssr: false, loading: () => <div className="scene-loading">Preparing your farm...</div> });
const TABS: [Panel, string][] = [['farm', 'Farm'], ['storage', 'Storage'], ['market', 'Market'], ['trade', 'Trade'], ['business', 'Business'], ['journal', 'Journal']];
const EVENT_LABEL = { priceCrash: '📉 Price crash', fuelSpike: '⛽ Fuel spike', workerShortage: '👷 Worker shortage' } as const;

export default function Game() {
  const s = useGameStore();
  const panel = s.panel, setPanel = s.openPanel;
  const [compact, setCompact] = useState(false);
  useEffect(() => { if (!s.toast) return; const t = setTimeout(s.clearToast, 3600); return () => clearTimeout(t); }, [s.toast, s.clearToast]);
  // After the truck pulls out of the gate, follow the shipment on the map.
  const shipAt = s.fx?.kind === 'ship' ? s.fx.at : null, openPanel = s.openPanel;
  useEffect(() => { if (shipAt === null) return; const t = setTimeout(() => openPanel('trade'), 3500); return () => clearTimeout(t); }, [shipAt, openPanel]);

  const crops = s.plots.filter(p => p.status === 'growing' || p.status === 'ready');
  const ready = s.plots.filter(p => p.status === 'ready');
  const freshKg = s.batches.filter(b => b.product === 'fresh').reduce((a, b) => a + b.kg, 0);
  const driedKg = s.batches.filter(b => b.product === 'dried').reduce((a, b) => a + b.kg, 0);

  return (
    <div className="game-shell">
      <div className="canvas-wrap"><FarmScene /></div>
      <div className="hud">
        <header className="topbar">
          <div className="brand"><small>HARVEST TO HARBOR</small>NIGERIA</div>
          <div className="stats">
            <div className="stat"><span>Cash</span><b>{money(s.cash)}</b></div>
            <div className="stat"><span>Day</span><b>{s.day}</b></div>
            <div className="stat"><span>Energy</span><b>{s.energy}/{maxEnergy(s)}</b></div>
            <div className="stat"><span>Tank</span><b>{s.water.toLocaleString()} L</b></div>
            <div className="stat" title={titleFor(s.level)}><span>Level</span><b>{s.level}</b></div>
          </div>
        </header>

        <section className={`side ${compact ? 'compact' : ''}`}>
          <button className="collapse" onClick={() => setCompact(!compact)} aria-label={compact ? 'Expand panel' : 'Collapse panel'}>{compact ? '▸' : '▾'}</button>
          <div className="eyebrow">Season 01 · Ginger · Kafanchan</div>
          <XpBar />
          <MissionCard />
          <div className="forecast">
            <span className="label">Today: {WEATHER_INFO[s.weather].icon} {WEATHER_INFO[s.weather].label}</span>
            <div className="forecast-days">
              {s.forecast.map(f => (
                <div key={f.day} title={`${WEATHER_INFO[f.weather].label}, ${Math.round(f.confidence * 100)}% confidence`}>
                  <small>D{f.day}</small><b>{WEATHER_INFO[f.weather].icon}</b><em>{Math.round(f.confidence * 100)}%</em>
                </div>
              ))}
            </div>
            <small className="muted">Forecasts further out are less reliable.</small>
          </div>
          {s.events.length > 0 && <div className="events">{s.events.map(e => <span key={e.kind} className="chip">{EVENT_LABEL[e.kind]} · {e.daysLeft}d</span>)}</div>}
          <div className="weather"><span>FRESH</span><b>{money(s.market.fresh)}/kg</b><span>DRIED</span><b>{money(s.market.dried)}/kg</b></div>
        </section>

        <section className="actions">
          {s.selectedPlot !== null ? <PlotPanel /> : s.tankOpen ? <TankCard /> : s.talkingTo ? <NpcCard /> : (
            <div className="card">
              <div className="eyebrow">Operations</div>
              <h3>Run the farm</h3>
              <p className="muted small"><span className="hint-mouse">Walk with <kbd>WASD</kbd> or click the ground. Press <kbd>E</kbd> next to a plot, building or person. Scroll to zoom.</span><span className="hint-touch">Tap the ground to walk, tap a plot, building or person to use it. Pinch to zoom.</span> Every action costs energy; workers add more each day.</p>
              <div className="action-grid">
                <button className="action primary" onClick={s.advance}><strong>🌙 End day</strong><small>Weather, growth, wages</small></button>
                <button className="action" onClick={s.pump} disabled={s.water >= tankCapacity(s)}><strong>⛽ Pump borehole</strong><small>Refill tank with fuel</small></button>
                <button className="action" onClick={() => setPanel('storage')}><strong>📦 Storage</strong><small>{Math.round(freshKg)} kg fresh · {Math.round(driedKg)} kg dried</small></button>
                <button className="action" onClick={() => setPanel('business')}><strong>🏗 Business</strong><small>Workers, insurance, upgrades</small></button>
              </div>
              {ready.length > 0 && <div className="alert good">Ready to harvest: {ready.map(plotName).join(', ')}</div>}
            </div>
          )}
        </section>

        <div className="mini-stats">
          <div><span>Planted</span><b>{crops.length}/{s.plots.length}</b></div>
          <div><span>Fresh</span><b>{Math.round(freshKg)} kg</b></div>
          <div><span>Drying</span><b>{s.dryingJobs.length} racks</b></div>
          <div><span>Workers</span><b>{s.workers}</b></div>
        </div>

        <nav className="bottom">
          {TABS.map(([id, label]) => <button key={id} className={`tab ${panel === id ? 'active' : ''}`} onClick={() => setPanel(id)}>{label}</button>)}
        </nav>

        <div className="zoom-ctrl" role="group" aria-label="Camera zoom">
          <button onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom in" title="Zoom in (+)">+</button>
          <button onClick={() => zoomBy(1.2)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        </div>

        <InteractPrompt />
        {s.toast && <div className="toast">{s.toast}</div>}
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
                <button className="link" onClick={s.reset}>Start a new season (new random seed)</button>
              </>}
            </div>
          </div>
        )}
        <InspectionModal />
        <StoryCard />
        <LevelUpCard />
      </div>
    </div>
  );
}
