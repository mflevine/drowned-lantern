import { CLASSES } from './story.js';

export const $ = sel => document.querySelector(sel);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const classOf = p => CLASSES[p?.cls] || { icon: '👤', name: 'Adventurer' };

export const LETTERS = 'ABCDEF';

// Firebase drops empty arrays and nulls, so fill in defaults whenever state is read back.
export function normalizeState(s) {
  return {
    phase: 'lobby', step: 0, sceneId: '', marksLeft: 0, voteEndsAt: 0, accused: '',
    result: null, roll: null,
    ...s,
    choices: s?.choices || [],
    clues: s?.clues || [],
    visited: s?.visited || [],
  };
}

export function secondsLeft(endsAt, now) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

// --- d20 ---
export const TUMBLE_MS = 2200;

export function d20Svg(label = '?') {
  return `<svg class="d20-svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="d20grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:var(--die-hi)"/><stop offset="1" style="stop-color:var(--die-lo)"/>
    </linearGradient></defs>
    <polygon class="face" points="50,3 93,27 93,73 50,97 7,73 7,27"/>
    <polygon class="inner" points="50,24 78,70 22,70"/>
    <path class="edge" d="M50,3L50,24M93,27L50,24M7,27L50,24M93,27L78,70M93,73L78,70M50,97L78,70M50,97L22,70M7,73L22,70M7,27L22,70"/>
    <text class="num" x="50" y="58" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
}

// waiting → tumbling (value known, animation playing) → landed
export function dieState(roll, now) {
  if (!roll?.value) return 'waiting';
  return now < (roll.revealAt || 0) ? 'tumbling' : 'landed';
}

export function dieClass(roll, state) {
  if (state !== 'landed') return state;
  return `landed ${roll.value === 20 ? 'crit' : roll.value === 1 ? 'fumble' : roll.success ? 'win' : 'lose'}`;
}

// Flickers random faces on any tumbling die.
setInterval(() => {
  document.querySelectorAll('.d20.tumbling .num').forEach(el => {
    el.textContent = 1 + Math.floor(Math.random() * 20);
  });
}, 70);
