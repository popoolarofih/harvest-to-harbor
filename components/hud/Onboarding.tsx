'use client';
import { useEffect, useState } from 'react';
import { NPCS, STARTING_CASH, money } from '../../game/simulation';
import { TUTORIAL, currentStep } from '../../game/tutorial';
import type { NpcId } from '../../game/types';
import { useGameStore } from '../../stores/gameStore';
import { finishIntro } from '../../stores/session';

interface IntroCard { eyebrow: string; title?: string; speaker?: NpcId; text: string }

const INTRO: IntroCard[] = [
  { eyebrow: 'Kafanchan, southern Kaduna', title: 'Two hectares of your own', text: 'Your uncle has handed you two hectares of red farmland outside Kafanchan, in the heart of Nigeria\'s ginger belt: sixteen beds, a borehole and a tin-roofed shed.' },
  { eyebrow: 'Starting capital', title: `${money(STARTING_CASH)} in the bank`, text: 'Enough for seed, fertiliser, diesel and a few wages. Spend it carefully: the bills come every night, and the harvest is weeks away.' },
  { eyebrow: 'Your neighbour', speaker: 'baba', text: 'Baba Musa has farmed this valley all his life. He will teach you the land: when to plant, how to read the sky, and when to dig.' },
  { eyebrow: 'Your adviser', speaker: 'amaka', text: 'Amaka knows processing and buyers. Washed, dried and sealed ginger is worth many times what fresh ginger fetches at the roadside.' },
  { eyebrow: 'Your haulier', speaker: 'chinedu', text: 'Chinedu moves produce to Kaduna, to Lagos, and onto a ship at Apapa. Good ginger is only worth something once it arrives in good shape.' },
  { eyebrow: 'Your goal', title: 'From farm to harbour', text: 'Build a profitable ginger business, master processing, and send your first container of Nigerian ginger to London.' },
];

const initials = (id: NpcId) => NPCS[id].name.split(' ').map(w => w[0]).join('');

/** Short, skippable story cards before a new season. The last card asks whether to take the tutorial. */
export function IntroStory() {
  const [i, setI] = useState(0);
  const last = INTRO.length - 1, card = INTRO[i], who = card.speaker ? NPCS[card.speaker] : null;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && i < last)) { e.preventDefault(); setI(n => Math.min(last, n + 1)); }
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
      if (e.key === 'Escape') setI(last);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [i, last]);
  return (
    <div className="screen intro" role="dialog" aria-modal="true" aria-label="Story introduction">
      <div className="intro-card" key={i}>
        <div className="eyebrow">{card.eyebrow}</div>
        {who && card.speaker && <div className="speaker"><span className={`avatar npc-${card.speaker}`}>{initials(card.speaker)}</span><div><b>{who.name}</b><small>{who.role}</small></div></div>}
        {card.title && <h2>{card.title}</h2>}
        <p className="story-text">{card.text}</p>
        <div className="dots" aria-label={`Card ${i + 1} of ${INTRO.length}`}>{INTRO.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        {i < last ? (
          <div className="intro-actions">
            <button className="link" onClick={() => setI(last)}>Skip intro</button>
            <span>
              {i > 0 && <button className="action" onClick={() => setI(i - 1)}><strong>Back</strong></button>}
              <button className="action primary" onClick={() => setI(i + 1)} autoFocus><strong>Next</strong></button>
            </span>
          </div>
        ) : (
          <div className="intro-choice">
            <button className="action primary" onClick={() => finishIntro(true)} autoFocus><strong>Start with a short tutorial</strong><small>Learn to move, plant, care for and harvest your crop</small></button>
            <button className="action" onClick={() => finishIntro(false)}><strong>Skip the tutorial</strong><small>You can replay it any time from the Journal</small></button>
          </div>
        )}
      </div>
    </div>
  );
}

/** One tutorial instruction at a time, shown as the active objective in the side panel. */
export function TutorialCard() {
  const tutorial = useGameStore(s => s.tutorial);
  const skipStep = useGameStore(s => s.skipTutorialStep), skip = useGameStore(s => s.skipTutorial);
  const step = currentStep(tutorial);
  if (!step) return null;
  return (
    <div className="mission tutorial" data-testid="tutorial-card" aria-live="polite">
      <span className="mission-step">Tutorial · {tutorial.step + 1} of {TUTORIAL.length}</span>
      <b>{step.title}</b>
      <p><span className="hint-mouse">{step.mouse}</span><span className="hint-touch">{step.touch}</span></p>
      <div className="tut-progress" aria-hidden>{TUTORIAL.map((t, n) => <i key={t.id} className={n < tutorial.step ? 'done' : n === tutorial.step ? 'on' : ''} />)}</div>
      <div className="tut-actions">
        <button className="link" onClick={skipStep}>Skip step</button>
        <button className="link" onClick={skip}>End tutorial</button>
      </div>
    </div>
  );
}
