'use client';
import { MAX_LEVEL, TITLES, UNLOCKS, titleFor, xpForLevel } from '../../game/simulation';
import { useGameStore } from '../../stores/gameStore';

/** "Level 10 unlocked: Processing Factory": shown when the player levels up. */
export function LevelUpCard() {
  const up = useGameStore(s => s.levelUp), dismiss = useGameStore(s => s.dismissLevelUp), story = useGameStore(s => s.story);
  if (!up || story) return null;
  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal levelup" onClick={e => e.stopPropagation()}>
        <div className="eyebrow">Level up</div>
        <div className="level-badge">{up.level}</div>
        <h2>{up.title ?? titleFor(up.level)}</h2>
        {up.unlocks.length ? <ul>{up.unlocks.map(u => <li key={u}>🔓 {u}</li>)}</ul> : <p className="muted">Keep going: the next unlock is close.</p>}
        <button className="action primary wide" onClick={dismiss}><strong>Continue</strong></button>
      </div>
    </div>
  );
}

export function XpBar() {
  const s = useGameStore();
  const from = xpForLevel(s.level), to = xpForLevel(Math.min(MAX_LEVEL, s.level + 1));
  const pct = s.level >= MAX_LEVEL ? 100 : ((s.xp - from) / (to - from)) * 100;
  return <>
    <div className="level-line"><span>Level {s.level} · {titleFor(s.level)}</span><span>{s.xp.toLocaleString()} / {to.toLocaleString()} XP</span></div>
    <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
  </>;
}

/** Smallholder → International Agricultural Supplier, with every unlock on the way. */
export function CareerLadder() {
  const level = useGameStore(s => s.level);
  const next = UNLOCKS.find(u => u.level > level);
  return (
    <div className="career">
      {next && <p className="muted">Next unlock: <b>{next.title}</b> at Level {next.level}.</p>}
      {TITLES.map((t, i) => {
        const upTo = TITLES[i + 1]?.level ?? MAX_LEVEL + 1;
        const unlocks = UNLOCKS.filter(u => u.level >= t.level && u.level < upTo);
        return (
          <div key={t.title} className={`career-step ${level >= t.level ? 'reached' : ''}`}>
            <span className="career-level">L{t.level}</span>
            <div>
              <b>{t.title}</b>
              {unlocks.map(u => <small key={u.id} className={level >= u.level ? 'got' : ''}>{level >= u.level ? '✓' : '🔒'} L{u.level} · {u.title}: {u.detail}</small>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
