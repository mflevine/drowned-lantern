// Synthesized dice sounds (no audio files). Browsers only allow audio after a click,
// so the context is unlocked on the first pointer press on the page.
let ctx = null;

document.addEventListener('pointerdown', () => {
  try {
    ctx ||= new AudioContext();
    ctx.resume();
  } catch { /* audio unsupported */ }
});

function knock(when, gain, freq, length = 0.05) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 4;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 2.5;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(when);
}

function tone(when, freq, dur, type = 'triangle', gain = 0.18, slideTo = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur);
}

// Bounces that slow down over ~2s, matching the tumble animation.
export function clatter() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [0, 0.14, 0.3, 0.48, 0.68, 0.9, 1.16, 1.46, 1.8].forEach((t, i, all) => {
    knock(t0 + t, 0.9 * (1 - i / all.length) + 0.15, 1500 + Math.random() * 2500);
  });
}

export function land(roll) {
  if (!ctx) return;
  const t = ctx.currentTime;
  knock(t, 1.2, 350, 0.12);
  if (roll.value === 20) [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.1 + i * 0.09, f, 0.5));
  else if (roll.value === 1) [392, 370, 349].forEach((f, i) => tone(t + 0.15 + i * 0.28, f, i === 2 ? 0.8 : 0.3, 'sawtooth', 0.08, i === 2 ? 300 : 0));
  else if (roll.success) [523, 784].forEach((f, i) => tone(t + 0.1 + i * 0.1, f, 0.35));
  else tone(t + 0.1, 220, 0.4, 'sine', 0.2, 160);
}
