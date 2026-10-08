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
