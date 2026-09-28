import { effectPresentation } from './battlePresentation.js';

const SOUND_SPECS = {
  impact: { wave: 'triangle', from: 190, to: 72, duration: 0.08, gain: 0.055 },
  fire: { wave: 'sawtooth', from: 330, to: 105, duration: 0.13, gain: 0.045 },
  water: { wave: 'sine', from: 620, to: 260, duration: 0.15, gain: 0.045 },
  wind: { wave: 'sine', from: 760, to: 410, duration: 0.16, gain: 0.035 },
  ice: { wave: 'triangle', from: 980, to: 510, duration: 0.14, gain: 0.035 },
  nature: { wave: 'triangle', from: 410, to: 690, duration: 0.15, gain: 0.04 },
  light: { wave: 'sine', from: 720, to: 1040, duration: 0.18, gain: 0.032, harmony: 1.5 },
  lightning: { wave: 'square', from: 920, to: 210, duration: 0.11, gain: 0.032, harmony: 1.8 },
  dark: { wave: 'sawtooth', from: 210, to: 92, duration: 0.2, gain: 0.028, harmony: 0.7 },
  heal: { wave: 'sine', from: 510, to: 780, duration: 0.22, gain: 0.035, harmony: 1.25 },
  marker: { wave: 'sine', from: 360, to: 520, duration: 0.12, gain: 0.03 },
  status: { wave: 'square', from: 180, to: 145, duration: 0.13, gain: 0.025 },
  break: { wave: 'square', from: 145, to: 48, duration: 0.24, gain: 0.055, harmony: 1.5 },
  miss: { wave: 'sine', from: 520, to: 920, duration: 0.09, gain: 0.02 },
  combo: { wave: 'triangle', from: 430, to: 760, duration: 0.2, gain: 0.04, harmony: 1.5 },
  ultimate: { wave: 'sawtooth', from: 220, to: 660, duration: 0.34, gain: 0.045, harmony: 2 },
  victory: { wave: 'triangle', from: 520, to: 820, duration: 0.38, gain: 0.035, harmony: 1.5 },
  defeat: { wave: 'sine', from: 260, to: 105, duration: 0.42, gain: 0.035 },
};

/** DOMやAudioContextを使わず、表示イベントから再生定義を決める。 */
export function soundSpecForCue(cue, data) {
  if (cue.type === 'outcome') return SOUND_SPECS[cue.outcome === 'won' ? 'victory' : 'defeat'];
  if (cue.type === 'banner' && cue.tier === 'ultimate') return SOUND_SPECS.ultimate;
  if (cue.type === 'combo') return SOUND_SPECS.combo;
  if (cue.type === 'miss') return SOUND_SPECS.miss;
  if (!['damage', 'heal', 'marker', 'status', 'break'].includes(cue.type)) return null;
  const name = effectPresentation(cue, data).sound;
  return SOUND_SPECS[name] ?? SOUND_SPECS.impact;
}

/** 高速再生時の過密化を、戦闘乱数とは独立した決定的な間引きで抑える。 */
export function shouldPlayCue(cue, speed, serial) {
  if (cue.type === 'outcome' || cue.type === 'break' || cue.type === 'combo' || cue.tier === 'ultimate') return true;
  if (speed >= 4 && cue.type === 'damage') return serial % 3 === 0;
  if (speed >= 2 && cue.dot) return serial % 2 === 0;
  return true;
}

/** ブラウザ標準のWeb Audio APIだけで短い効果音を合成する。 */
export function createBattleAudio({ enabled, volume, AudioContextCtor } = {}) {
  let context = null;
  const active = new Set();
  const Context = AudioContextCtor ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;

  function ensureContext() {
    if (!Context || enabled?.() === false) return null;
    context ??= new Context();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function tone(ctx, spec, frequencyScale = 1, delay = 0) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    const end = start + spec.duration;
    const level = Math.max(0, Math.min(1, volume?.() ?? 0.45)) * spec.gain;
    oscillator.type = spec.wave;
    oscillator.frequency.setValueAtTime(spec.from * frequencyScale, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to * frequencyScale), end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(ctx.destination);
    active.add(oscillator);
    oscillator.onended = () => {
      active.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }

  return {
    resume() {
      ensureContext();
    },
    play(cue, data, speed = 1, serial = 0) {
      if (enabled?.() === false || !shouldPlayCue(cue, speed, serial)) return;
      const spec = soundSpecForCue(cue, data);
      const ctx = spec ? ensureContext() : null;
      if (!ctx) return;
      tone(ctx, spec);
      if (spec.harmony) tone(ctx, spec, spec.harmony, 0.025);
    },
    dispose() {
      for (const oscillator of active) {
        try { oscillator.stop(); } catch {}
      }
      active.clear();
      context?.close?.().catch(() => {});
      context = null;
    },
  };
}
