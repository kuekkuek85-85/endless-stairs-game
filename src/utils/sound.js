// Web Audio 로 직접 합성하는 짧은 효과음 (외부 음원 없음)
import { loadMuted, saveMuted } from './storage.js';

let ctx = null;
let master = null;
let muted = loadMuted();

function ensureContext() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

// 사용자 제스처(클릭/탭) 안에서 호출해 모바일 브라우저의 오디오 잠금을 해제
export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  saveMuted(muted);
}

function tone({ type = 'square', from, to = from, duration, volume = 0.5, delay = 0 }) {
  const c = ensureContext();
  if (!c || muted) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playSound(name) {
  switch (name) {
    case 'climb':
      tone({ type: 'square', from: 520, to: 780, duration: 0.06, volume: 0.25 });
      break;
    case 'turn':
      tone({ type: 'triangle', from: 380, to: 620, duration: 0.08, volume: 0.4 });
      break;
    case 'milestone':
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ type: 'square', from: f, duration: 0.12, volume: 0.3, delay: i * 0.08 }),
      );
      break;
    case 'fall':
      tone({ type: 'sawtooth', from: 600, to: 80, duration: 0.7, volume: 0.35 });
      break;
    case 'timeout':
      tone({ type: 'square', from: 300, to: 150, duration: 0.25, volume: 0.35 });
      tone({ type: 'square', from: 220, to: 90, duration: 0.45, volume: 0.35, delay: 0.25 });
      break;
    default:
      break;
  }
}
