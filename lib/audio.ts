'use client';
/**
 * All game audio, synthesised with Web Audio: no sound files to download.
 * Three buses (music, effects, ambience) feed one master. Ambience is a set of looping noise beds
 * (wind, cicadas, rain on the zinc roof) plus scheduled one-shots (weaver birds, frogs, crickets, thunder)
 * chosen from the weather and the time of day.
 */

type Bus = 'music' | 'fx' | 'amb';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'heavyRain' | 'storm' | 'heatwave';
export type ActionSound = 'water' | 'fertilize' | 'treat' | 'harvest' | 'pump' | 'prepare' | 'plant' | 'inspect' | 'process' | 'grind' | 'ship';

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buses: Partial<Record<Bus, GainNode>> = {};
let white: AudioBuffer | null = null, brown: AudioBuffer | null = null;

const prefs = { music: true, effects: true, ambience: true, voices: true, musicVolume: 1, effectsVolume: 1 };

function getContext() {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    context = new Ctx();
    master = context.createGain();
    master.gain.value = 0.9;
    // A gentle limiter so stacked rain, thunder and a diesel engine never clip.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.ratio.value = 6;
    master.connect(limiter).connect(context.destination);
    for (const b of ['music', 'fx', 'amb'] as Bus[]) { buses[b] = context.createGain(); buses[b]!.connect(master); }
    white = makeNoise(context, false);
    brown = makeNoise(context, true);
    applyLevels();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function makeNoise(ctx: AudioContext, isBrown: boolean) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    if (isBrown) { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5; } else data[i] = w;
  }
  return buf;
}

function applyLevels() {
  if (!context) return;
  const t = context.currentTime;
  buses.music?.gain.setTargetAtTime(prefs.music ? prefs.musicVolume : 0, t, 0.1);
  buses.fx?.gain.setTargetAtTime(prefs.effects ? prefs.effectsVolume : 0, t, 0.05);
  buses.amb?.gain.setTargetAtTime(prefs.ambience ? prefs.effectsVolume * 0.85 : 0, t, 0.4);
}

// ---------- Building blocks ----------

interface ToneOpts { type?: OscillatorType; attack?: number; glide?: number; bus?: Bus; pan?: number }
/** One enveloped oscillator note. `glide` bends the pitch to that frequency over the note. */
function tone(freq: number, when: number, dur: number, vol: number, o: ToneOpts = {}) {
  const ctx = getContext();
  if (!ctx) return;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, when);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, when + dur);
  const a = o.attack ?? 0.01;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain);
  route(ctx, gain, o);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

interface NoiseOpts { brown?: boolean; filter?: BiquadFilterType; freq?: number; q?: number; sweep?: number; attack?: number; bus?: Bus; pan?: number }
/** A filtered burst of noise: crunches, hisses, splashes, thunder. */
function noise(when: number, dur: number, vol: number, o: NoiseOpts = {}) {
  const ctx = getContext();
  if (!ctx || !white || !brown) return;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = o.brown ? brown : white;
  src.loop = true;
  filter.type = o.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq ?? 1000, when);
  if (o.sweep) filter.frequency.exponentialRampToValueAtTime(o.sweep, when + dur);
  filter.Q.value = o.q ?? 1;
  const a = Math.min(o.attack ?? 0.005, dur * 0.8);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter).connect(gain);
  route(ctx, gain, o);
  src.start(when, Math.random() * 1.5);
  src.stop(when + dur + 0.05);
}

function route(ctx: AudioContext, node: AudioNode, o: { bus?: Bus; pan?: number }) {
  const out = buses[o.bus ?? 'fx']!;
  if (o.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    node.connect(p).connect(out);
  } else node.connect(out);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Music: a soft highlife-flavoured loop ----------

let musicTimer: ReturnType<typeof setInterval> | null = null;
let beat = 0;
// G major pentatonic, the bright scale of a lot of West African guitar highlife.
const MELODY = [587.33, 493.88, 440, 392, 440, 493.88, 587.33, 659.25, 587.33, 493.88, 440, 493.88, 392, 329.63, 392, 440];
const BASS = [98, 98, 130.81, 146.83];

function playPhrase() {
  const ctx = getContext();
  if (!ctx || !prefs.music) return;
  const now = ctx.currentTime + 0.03;
  const step = beat % 16;
  // Plucked "guitar" lead on most eighths, with rests so it breathes.
  if (step % 4 !== 3) {
    const f = MELODY[(beat + Math.floor(beat / 32) * 2) % MELODY.length];
    tone(f, now, 0.45, 0.02, { type: 'triangle', bus: 'music' });
    tone(f * 2, now, 0.18, 0.006, { bus: 'music' });
  }
  if (step % 2 === 0) tone(BASS[Math.floor(beat / 4) % BASS.length], now, 0.42, 0.03, { type: 'sine', bus: 'music' });
  // Shekere shaker on the off-beats.
  if (step % 2 === 1) noise(now, 0.07, 0.012, { filter: 'highpass', freq: 6000, bus: 'music' });
  // Talking drum: a pitch that bends down, twice a bar.
  if (step === 6 || step === 14) tone(220, now, 0.28, 0.035, { glide: 120, bus: 'music' });
  beat++;
}

function syncMusic() {
  if (!prefs.music) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    return;
  }
  if (!context || musicTimer) return;
  playPhrase();
  musicTimer = setInterval(playPhrase, 240);
}

// ---------- Ambience ----------

interface Bed { gain: GainNode; level: number }
const beds: Partial<Record<'wind' | 'cicada' | 'rain' | 'zinc', Bed>> = {};
let ambTimer: ReturnType<typeof setInterval> | null = null;
const scene = { weather: 'sunny' as Weather, hour: 9 };
const next = { bird: 0, frog: 0, cricket: 0, thunder: 0, ping: 0 };

/** Loops a noise buffer through a filter into its own gain on the ambience bus. */
function makeBed(ctx: AudioContext, buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, extra?: (g: GainNode) => void): Bed {
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), shaper = ctx.createGain(), gain = ctx.createGain();
  src.buffer = buf; src.loop = true;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.value = 0;
  src.connect(filter).connect(shaper).connect(gain).connect(buses.amb!);
  extra?.(shaper);
  src.start(0, Math.random());
  return { gain, level: 0 };
}

/** A slow (or fast) wobble on a gain: wind gusts, the pulsing buzz of cicadas. */
function lfo(ctx: AudioContext, target: AudioParam, rate: number, depth: number, base: number, type: OscillatorType = 'sine') {
  target.value = base;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = rate; g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
}

function ensureBeds(ctx: AudioContext) {
  if (beds.wind || !white || !brown) return;
  beds.wind = makeBed(ctx, brown, 'lowpass', 520, 0.7, g => lfo(ctx, g.gain, 0.09, 0.45, 0.6));
  // Cicadas: a narrow band of hiss chopped at ~38 Hz.
  beds.cicada = makeBed(ctx, white, 'bandpass', 5400, 9, g => lfo(ctx, g.gain, 38, 0.5, 0.5, 'square'));
  beds.rain = makeBed(ctx, white, 'lowpass', 5200, 0.5);
  // Rain drumming on the corrugated kwano roof: a ringing metallic band.
  beds.zinc = makeBed(ctx, white, 'bandpass', 3100, 2.5, g => lfo(ctx, g.gain, 7.3, 0.25, 0.75));
}

const isWet = (w: Weather) => w === 'rain' || w === 'heavyRain' || w === 'storm';
const RAIN_LEVEL: Record<Weather, number> = { sunny: 0, cloudy: 0, heatwave: 0, rain: 0.22, heavyRain: 0.36, storm: 0.48 };

/** Called by the game whenever the weather or the clock changes. `hour` is 0-24. */
export function setAmbience(weather: Weather, hour: number) {
  scene.weather = weather; scene.hour = hour;
  const ctx = context;
  if (!ctx || !prefs.ambience) return;
  ensureBeds(ctx);
  const night = hour >= 19.2 || hour < 5.2, day = hour >= 7 && hour < 18;
  const hot = weather === 'sunny' || weather === 'heatwave';
  const wind = weather === 'storm' ? 0.55 : weather === 'heatwave' ? 0.42 : weather === 'heavyRain' ? 0.3 : night ? 0.08 : 0.16;
  const cicada = hot && day && hour > 9 && hour < 17.5 ? (weather === 'heatwave' ? 0.1 : 0.07) : 0;
  const t = ctx.currentTime;
  const set = (b: Bed | undefined, v: number) => { if (b && Math.abs(b.level - v) > 0.001) { b.level = v; b.gain.gain.setTargetAtTime(v, t, 1.2); } };
  set(beds.wind, wind);
  set(beds.cicada, cicada);
  set(beds.rain, RAIN_LEVEL[weather]);
  set(beds.zinc, RAIN_LEVEL[weather] * 0.35);
  if (!ambTimer) ambTimer = setInterval(scheduleAmbience, 150);
}

/** One-shot sounds, scheduled a little ahead so timer jitter doesn't matter. */
function scheduleAmbience() {
  const ctx = context;
  if (!ctx || !prefs.ambience || ctx.state !== 'running') return;
  const now = ctx.currentTime, { weather, hour } = scene;
  const night = hour >= 19.2 || hour < 5.2, dusk = hour >= 17.8 && hour < 19.2, dawn = hour >= 5.2 && hour < 7.5;
  const wet = isWet(weather);

  // Weaver birds: chattery runs of chirps, busiest at dawn, silent in rain and at night.
  if (!night && !wet && now >= next.bird) {
    weaverCall(now + 0.05, rand(-0.8, 0.8));
    next.bird = now + (dawn ? rand(0.8, 2.2) : weather === 'heatwave' ? rand(5, 10) : rand(2, 5.5));
  }
  // Frogs by the irrigation ditches: dusk, night, and in the rain.
  if ((night || dusk || weather === 'rain' || weather === 'heavyRain') && now >= next.frog) {
    frog(now + 0.05, rand(-0.9, 0.9), rand(150, 260));
    next.frog = now + rand(night ? 0.5 : 1.2, night ? 1.6 : 3.5);
  }
  if ((night || dusk) && now >= next.cricket) {
    cricket(now + 0.05, rand(-0.7, 0.7));
    next.cricket = now + rand(0.35, 0.8);
  }
  // Single heavy drops pinging off the zinc.
  if (wet && now >= next.ping) {
    noise(now + 0.02, rand(0.03, 0.08), rand(0.02, 0.05) * (weather === 'rain' ? 0.6 : 1), { filter: 'bandpass', freq: rand(2400, 6200), q: 18, bus: 'amb', pan: rand(-1, 1) });
    next.ping = now + rand(0.02, weather === 'rain' ? 0.12 : 0.06);
  }
  // Thunder: low rolling rumbles, with a crack when the storm is overhead.
  if ((weather === 'storm' || weather === 'heavyRain') && now >= next.thunder) {
    if (next.thunder > 0) thunder(now + 0.1, weather === 'storm');
    next.thunder = now + (weather === 'storm' ? rand(7, 15) : rand(18, 34));
  }
}

function weaverCall(t: number, pan: number) {
  const n = 3 + Math.floor(Math.random() * 6), base = rand(2600, 3600);
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.07, 0.11), f = base * rand(0.9, 1.25);
    tone(f, at, rand(0.04, 0.07), 0.018, { glide: f * rand(0.7, 1.4), bus: 'amb', pan });
  }
  if (Math.random() < 0.5) noise(t + n * 0.09, 0.18, 0.008, { filter: 'bandpass', freq: 4200, q: 6, bus: 'amb', pan });
}

function frog(t: number, pan: number, pitch: number) {
  const ctx = getContext();
  if (!ctx) return;
  // "Rib-bit": two buzzy pulses through a throaty filter.
  for (const [dt, len] of [[0, 0.09], [0.15, 0.14]] as const) {
    const osc = ctx.createOscillator(), am = ctx.createOscillator(), amGain = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(pitch, t + dt); osc.frequency.linearRampToValueAtTime(pitch * 0.85, t + dt + len);
    am.frequency.value = 28; amGain.gain.value = 0.015;
    f.type = 'bandpass'; f.frequency.value = pitch * 3; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.03, t + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + len);
    am.connect(amGain).connect(g.gain);
    osc.connect(f).connect(g);
    route(ctx, g, { bus: 'amb', pan });
    osc.start(t + dt); am.start(t + dt); osc.stop(t + dt + len + 0.05); am.stop(t + dt + len + 0.05);
  }
}

function cricket(t: number, pan: number) {
  const f = rand(4300, 4900);
  for (let i = 0; i < 3; i++) tone(f, t + i * 0.05, 0.03, 0.007, { bus: 'amb', pan, attack: 0.004 });
}

function thunder(t: number, crack: boolean) {
  if (crack) noise(t, 0.35, 0.12, { filter: 'highpass', freq: 1800, bus: 'amb' });
  noise(t + (crack ? 0.05 : 0), rand(3.5, 6), 0.28, { brown: true, filter: 'lowpass', freq: 220, sweep: 70, attack: 0.25, bus: 'amb' });
  noise(t + 0.6, rand(2, 3.5), 0.12, { brown: true, filter: 'lowpass', freq: 140, attack: 0.4, bus: 'amb' });
}

// ---------- Preferences & lifecycle ----------

export function setAudioPreferences(music: boolean, effects: boolean, musicLevel = 1, effectsLevel = 1, ambience = true, voices = true) {
  Object.assign(prefs, { music, effects, musicVolume: musicLevel, effectsVolume: effectsLevel, ambience, voices });
  applyLevels();
  syncMusic();
  if (!voices && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  if (ambience) setAmbience(scene.weather, scene.hour);
}

export function enableAudio() {
  getContext();
  syncMusic();
  setAmbience(scene.weather, scene.hour);
}

// ---------- Effects ----------

const fxOk = () => prefs.effects && !!getContext();

export function playClick() {
  if (!fxOk()) return;
  const t = context!.currentTime;
  tone(640, t, 0.045, 0.035, { type: 'square' });
  tone(920, t + 0.025, 0.035, 0.02);
}

/** A rising pentatonic bell run and a coin "ka-ching": money and XP coming in. */
export function playReward(t0?: number) {
  if (!fxOk()) return;
  const t = t0 ?? context!.currentTime;
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => { tone(f, t + i * 0.07, 0.5, 0.03, { type: 'triangle' }); tone(f * 2.76, t + i * 0.07, 0.2, 0.006); });
  tone(2637, t + 0.34, 0.12, 0.025, { type: 'square' });
  tone(3520, t + 0.4, 0.3, 0.02, { type: 'square' });
  noise(t + 0.34, 0.25, 0.02, { filter: 'highpass', freq: 7000 });
}

/** Daba (short hoe) biting into dry red laterite: a gritty crunch on top of a dull thud. */
function hoeStrike(t: number) {
  noise(t, 0.16, 0.12, { brown: true, filter: 'lowpass', freq: 260 });
  noise(t + 0.01, 0.12, 0.06, { filter: 'bandpass', freq: 950, q: 1.2, sweep: 500 });
  for (let i = 0; i < 4; i++) noise(t + 0.03 + i * 0.025, 0.02, 0.02, { filter: 'bandpass', freq: rand(2500, 4500), q: 8 });
}

/** Diesel generator and borehole pump: pull-start, then a rhythmic chug-chug-thug and gushing water. */
function generator(t: number, seconds: number) {
  noise(t, 0.35, 0.05, { filter: 'bandpass', freq: 400, sweep: 1600, q: 2 });
  const start = t + 0.35, rate = 7.5, count = Math.floor(seconds * rate);
  for (let i = 0; i < count; i++) {
    const at = start + i / rate, accent = i % 3 === 2;
    const fade = Math.min(1, (count - i) / 6);
    tone(accent ? 48 : 58, at, 0.11, (accent ? 0.16 : 0.1) * fade, { type: 'sine', attack: 0.004 });
    noise(at, 0.08, (accent ? 0.07 : 0.045) * fade, { brown: true, filter: 'lowpass', freq: 380 });
  }
  noise(start + 0.5, seconds - 0.4, 0.05, { filter: 'lowpass', freq: 900, attack: 0.4 });
}

/** Hammer mill and slicer: a motor whirring up, the hammers rattling, and winding down. */
function mill(t: number, seconds: number, heavy: boolean) {
  const ctx = getContext()!;
  const osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  const top = heavy ? 150 : 180;
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(60, t);
  osc.frequency.exponentialRampToValueAtTime(top, t + 0.6);
  osc.frequency.setValueAtTime(top, t + seconds - 0.6);
  osc.frequency.exponentialRampToValueAtTime(50, t + seconds);
  f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.4);
  g.gain.setValueAtTime(0.06, t + seconds - 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(f).connect(g).connect(buses.fx!);
  osc.start(t); osc.stop(t + seconds + 0.05);
  noise(t + 0.3, seconds - 0.5, 0.035, { filter: 'bandpass', freq: 2200, q: 3, attack: 0.3 });
  const rate = heavy ? 18 : 11, ticks = Math.floor((seconds - 0.8) * rate);
  for (let i = 0; i < ticks; i++) noise(t + 0.5 + i / rate, 0.025, heavy ? 0.03 : 0.04, { filter: 'bandpass', freq: heavy ? 1200 : 3000, q: 5 });
}

export function playAction(kind: ActionSound) {
  if (!fxOk()) return;
  const t = context!.currentTime + 0.02;
  switch (kind) {
    case 'prepare':
      [0, 0.42, 0.84].forEach(d => hoeStrike(t + d));
      break;
    case 'plant':
      noise(t, 0.12, 0.08, { brown: true, filter: 'lowpass', freq: 300 });
      noise(t + 0.18, 0.1, 0.03, { filter: 'bandpass', freq: 1400, q: 1 });
      break;
    case 'water':
      noise(t, 0.6, 0.07, { filter: 'bandpass', freq: 1800, sweep: 700, q: 0.8, attack: 0.05 });
      for (let i = 0; i < 6; i++) tone(rand(900, 1600), t + 0.2 + i * 0.09, 0.06, 0.012, { glide: 2400 });
      break;
    case 'fertilize':
      for (let i = 0; i < 14; i++) noise(t + rand(0, 0.45), 0.025, 0.03, { filter: 'bandpass', freq: rand(2500, 5000), q: 6 });
      break;
    case 'treat':
      [0, 0.45].forEach(d => noise(t + d, 0.38, 0.05, { filter: 'highpass', freq: 4200, attack: 0.03 }));
      break;
    case 'harvest':
      // Pull the rhizomes free: a crunch, a soft thud and leaf rustle, then the reward chime.
      hoeStrike(t);
      noise(t + 0.25, 0.14, 0.1, { brown: true, filter: 'lowpass', freq: 220 });
      noise(t + 0.1, 0.4, 0.03, { filter: 'bandpass', freq: 3000, q: 1, attack: 0.05 });
      playReward(t + 0.45);
      break;
    case 'inspect':
      noise(t, 0.12, 0.025, { filter: 'bandpass', freq: 3500, q: 1.5 });
      tone(700, t + 0.1, 0.08, 0.02);
      break;
    case 'pump':
      generator(t, 3.2);
      break;
    case 'process':
      noise(t, 0.5, 0.05, { filter: 'bandpass', freq: 1300, sweep: 600, attack: 0.05 });
      mill(t + 0.3, 2.4, false);
      break;
    case 'grind':
      mill(t, 4, true);
      break;
    case 'ship':
      playLorry(t);
      break;
  }
}

/**
 * The Bedford lorry, timed to the dispatch scene in the farm:
 * 0-3.5 s diesel rumble driving in, then an air-brake hiss, loading at idle, a double horn at 7 s, then it pulls away.
 */
export function playLorry(t0?: number) {
  if (!fxOk()) return;
  const ctx = context!, t = t0 ?? ctx.currentTime;
  const engine = (start: number, dur: number, from: number, to: number, vol: number, fadeIn: number) => {
    const osc = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = 'sawtooth'; sub.type = 'square';
    osc.frequency.setValueAtTime(from, start); osc.frequency.linearRampToValueAtTime(to, start + dur);
    sub.frequency.setValueAtTime(from / 2, start); sub.frequency.linearRampToValueAtTime(to / 2, start + dur);
    f.type = 'lowpass'; f.frequency.value = 320;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + fadeIn);
    g.gain.setValueAtTime(vol, start + dur - 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(f); sub.connect(f); f.connect(g).connect(buses.fx!);
    osc.start(start); sub.start(start); osc.stop(start + dur + 0.05); sub.stop(start + dur + 0.05);
  };
  engine(t, 3.6, 46, 38, 0.07, 2.4);
  noise(t + 3.5, 0.9, 0.09, { filter: 'highpass', freq: 2800, attack: 0.01 });
  noise(t + 3.55, 0.3, 0.04, { filter: 'bandpass', freq: 600, q: 2 });
  engine(t + 3.6, 3.6, 30, 30, 0.035, 0.3);
  for (let i = 0; i < 6; i++) noise(t + 4 + i * 0.5, 0.12, 0.05, { brown: true, filter: 'lowpass', freq: 300 });
  for (const d of [7, 7.45]) {
    tone(330, t + d, 0.32, 0.05, { type: 'square', attack: 0.02 });
    tone(415, t + d, 0.32, 0.04, { type: 'square', attack: 0.02 });
  }
  engine(t + 7.9, 6.5, 40, 58, 0.075, 0.8);
}

// ---------- Voices ----------

const VOICES: Record<string, { female: boolean; pitch: number; rate: number }> = {
  baba: { female: false, pitch: 0.8, rate: 0.88 },
  amaka: { female: true, pitch: 1.08, rate: 1.02 },
  chinedu: { female: false, pitch: 1, rate: 1.06 },
  hauwa: { female: true, pitch: 1.15, rate: 0.95 },
};
const FEMALE = /ezinne|female|zira|susan|hazel|libby|sonia|aria|jenny|samantha|karen|moira|tessa|fiona|leah|natasha/i;
const MALE = /abeo|\bmale|david|mark|george|ryan|guy|daniel|alex|thomas|william|james/i;

function pickVoice(female: boolean): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
  if (!all.length) return undefined;
  const want = female ? FEMALE : MALE, avoid = female ? MALE : FEMALE;
  // Nigerian English first (Edge ships Abeo and Ezinne), then other African and British voices.
  for (const lang of ['en-ng', 'en-gh', 'en-ke', 'en-za', 'en-gb', 'en']) {
    const pool = all.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
    const match = pool.find(v => want.test(v.name)) ?? pool.find(v => !avoid.test(v.name));
    if (match) return match;
  }
  return all[0];
}

/** Says a character's line out loud with the browser's speech voices. Does nothing where unsupported. */
export function speak(npc: string, text: string) {
  if (!prefs.voices || !prefs.effects || typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = VOICES[npc] ?? { female: false, pitch: 1, rate: 1 };
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(v.female);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.pitch = v.pitch; u.rate = v.rate; u.volume = Math.min(1, prefs.effectsVolume * 1.2);
  synth.speak(u);
}
