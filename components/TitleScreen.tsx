'use client';
import { useState } from 'react';
import { STARTING_CASH, currentMission, money, titleFor } from '../game/simulation';
import { readUnreadable, useSaveStatus } from '../stores/persistence';
import { continueGame, startNewSeason, useSession } from '../stores/session';
import { ConfirmDialog, HowToPlay, SettingsPanel, savedLabel } from './hud/Menus';

/** Offers the unreadable save as a file, so it isn't lost even if the player starts over. */
function downloadUnreadable() {
  const raw = readUnreadable();
  if (!raw) return;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `harvest-to-harbor-save-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TitleScreen() {
  const phase = useSession(s => s.phase), save = useSession(s => s.save);
  const savedAt = useSaveStatus(s => s.savedAt);
  const [dialog, setDialog] = useState<'confirm' | 'help' | 'settings' | null>(null);
  // During 'boot' (server render and hydration) storage hasn't been read, so nothing is clickable yet.
  const ready = phase === 'title';
  const ok = save?.kind === 'ok' ? save.save : null;
  const mission = ok ? currentMission(ok.game) : null;

  const newSeason = () => (ok || save?.kind === 'invalid' ? setDialog('confirm') : startNewSeason());

  return (
    <div className="screen title" aria-busy={!ready}>
      <div className="title-card">
        <div className="title-mark">
          <small>HARVEST TO HARBOR</small>
          <h1>Nigeria</h1>
        </div>
        <p className="title-intro">Start with two hectares of ginger farmland. Build your agribusiness, master processing and take your harvest to international markets.</p>

        {save?.kind === 'invalid' && (
          <div className="alert danger recovery" role="alert">
            <b>Your saved farm couldn&apos;t be loaded.</b>
            <span>Reason: {save.reason}. A copy has been kept on this device so nothing is lost.</span>
            <button className="link" onClick={downloadUnreadable}>Download the save file</button>
          </div>
        )}
        {save?.kind === 'unavailable' && (
          <div className="alert recovery" role="alert">
            <b>Saving is switched off in this browser.</b>
            <span>Site storage is blocked (private browsing or cookie settings), so progress will be lost when you close the tab.</span>
          </div>
        )}

        <div className="title-actions">
          {ok && (
            <button className="action primary big" onClick={continueGame} disabled={!ready}>
              <strong>Continue Farming</strong>
              <small>Day {ok.game.day} · {money(ok.game.cash)} · Level {ok.game.level} {titleFor(ok.game.level)}</small>
              <small>{mission ? `Mission: ${mission.title}` : 'Campaign complete'} · {savedLabel(savedAt ?? ok.savedAt)}</small>
            </button>
          )}
          <button className={`action ${ok ? '' : 'primary big'}`} onClick={newSeason} disabled={!ready}>
            <strong>Start New Season</strong>
            {!ok && <small>{money(STARTING_CASH)} and two hectares near Kafanchan</small>}
          </button>
          <div className="title-row">
            <button className="action" onClick={() => setDialog('help')} disabled={!ready}><strong>How to Play</strong></button>
            <button className="action" onClick={() => setDialog('settings')} disabled={!ready}><strong>Settings</strong></button>
          </div>
        </div>
        <small className="title-foot">
          Progress saves automatically to this browser. Nothing is sent to us. <a href="/privacy" target="_blank" rel="noopener">Privacy policy</a>
        </small>
      </div>

      {dialog === 'confirm' && (
        <ConfirmDialog title="Start a new season?" confirm="Start new season" danger onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); startNewSeason(); }}>
          {ok
            ? <p>Your current farm (day {ok.game.day}, {money(ok.game.cash)}, level {ok.game.level}) will be replaced. This can&apos;t be undone.</p>
            : <p>The unreadable save stays backed up on this device, and you can still download it from this screen.</p>}
        </ConfirmDialog>
      )}
      {dialog === 'help' && <HowToPlay onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
    </div>
  );
}
