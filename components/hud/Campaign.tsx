'use client';
import { NPCS, currentMission, money } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

/** The active "Farm to Fortune" mission, shown in the side panel. */
export function MissionCard() {
  const s = useGameStore();
  const m = currentMission(s);
  if (!m) {
    return (
      <div className="mission campaign">
        <span className="mission-step">Agribusiness Milestone</span>
        <b>Farm to Fortune Complete! 🏆</b>
        <p>Your Kafanchan farm is an established international exporter.</p>
        {!s.sandboxMode ? (
          <button
            className="action primary"
            onClick={s.enterSandbox}
            style={{ marginTop: '8px', width: '100%', fontSize: '12px' }}
          >
            🌟 Enter Agribusiness Sandbox
          </button>
        ) : (
          <small style={{ display: 'block', marginTop: '6px', color: '#93c5fd' }}>
            🌟 Sandbox Mode Active: Endless Agribusiness
          </small>
        )}
      </div>
    );
  }
  const n = s.missions.indexOf(m) + 1;
  const showBar = m.target > 1;
  return (
    <div className="mission campaign">
      <span className="mission-step">Mission {n}/{s.missions.length}{m.npc ? ` · ${NPCS[m.npc].name}` : ''}</span>
      <b>{m.title}</b>
      {showBar && (
        <span className="compact-prog-badge">
          ({Math.round(m.progress)}/{m.target})
        </span>
      )}
      <p>{m.description}</p>
      {showBar && <>
        <div className="progress"><i style={{ width: `${(m.progress / m.target) * 100}%` }} /></div>
        <small className="muted">{Math.round(m.progress).toLocaleString()} / {m.target.toLocaleString()}</small>
      </>}
      {m.id === 'storm' && s.flags.stormDay && <small className="warn">Storm due on day {s.flags.stormDay}.</small>}
      <small className="hint-line">→ {m.hint}</small>
    </div>
  );
}

/** Story dialogue: a character speaks when a mission begins. */
export function StoryCard() {
  const story = useGameStore(s => s.story), dismiss = useGameStore(s => s.dismissStory);
  if (!story) return null;
  const who = story.speaker ? NPCS[story.speaker] : null;
  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal story" onClick={e => e.stopPropagation()}>
        <div className="eyebrow">{story.title}</div>
        {who && <div className="speaker"><span className="avatar">{who.name.split(' ').map(w => w[0]).join('')}</span><div><b>{who.name}</b><small>{who.role}</small></div></div>}
        <p className="story-text">{who ? `“${story.text}”` : story.text}</p>
        <button className="action primary wide" onClick={dismiss}><strong>{who ? 'Got it' : 'Continue'}</strong></button>
      </div>
    </div>
  );
}

export function CampaignJournal() {
  const s = useGameStore();
  const current = currentMission(s);
  return (
    <div className="campaign-list">
      {s.missions.map((m, i) => (
        <div key={m.id} className={`campaign-row ${m.complete ? 'done' : m === current ? 'now' : 'later'}`}>
          <span>{m.complete ? '✓' : i + 1}</span>
          <div><b>{m.title}</b><small>{m === current || m.complete ? m.description : 'Locked'}</small></div>
          {m.reward > 0 && <em>{money(m.reward)}</em>}
        </div>
      ))}
    </div>
  );
}
