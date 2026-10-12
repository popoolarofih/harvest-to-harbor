'use client';

let context: AudioContext | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicOn = true;
let effectsOn = true;
let beat = 0;

function getContext() {
  if (typeof window === 'undefined') return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(frequency: number, when: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const ctx = getContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator(), gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.03);
}

function playPhrase() {
  const ctx = getContext();
  if (!ctx || !musicOn) return;
  const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
  const root = [130.81, 146.83, 174.61, 146.83];
  const now = ctx.currentTime + 0.03;
  const note = melody[beat % melody.length];
  tone(note, now, 0.32, 0.018, 'triangle');
  if (beat % 2 === 0) tone(root[Math.floor(beat / 2) % root.length], now, 0.48, 0.012, 'sine');
  beat++;
}

function syncMusic() {
  if (!musicOn) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    return;
  }
  if (!context || musicTimer) return;
  playPhrase();
  musicTimer = setInterval(playPhrase, 480);
}

export function setAudioPreferences(music: boolean, effects: boolean) {
  musicOn = music;
  effectsOn = effects;
  syncMusic();
}

export function enableAudio() {
  getContext();
  syncMusic();
}

export function playClick() {
  if (!effectsOn) return;
  const ctx = getContext();
  if (!ctx) return;
  tone(640, ctx.currentTime, 0.045, 0.035, 'square');
  tone(920, ctx.currentTime + 0.025, 0.035, 0.02, 'sine');
}
