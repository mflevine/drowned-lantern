// The host screen (TV / laptop). It is the only writer of game state:
// phones write votes, rolls and "continue" taps, and the host decides what happens.
import { connect, mode } from './db.js';
import * as G from './story.js';
import { $, esc, shuffle, classOf, LETTERS, normalizeState, secondsLeft, d20Svg, dieState, dieClass, TUMBLE_MS } from './util.js';
import * as sfx from './sfx.js';

const app = $('#app');
const db = await connect();
const params = new URLSearchParams(location.search);

let code = (params.get('room') || '').toUpperCase();
let S = null;
let players = {}, votes = {}, advances = {}, rolls = {};
let pending = null;        // scheduled transition (after a vote result or a roll)
let narrate = false;
let voices = {};          // audio/manifest.json: line key → version hash
let voice = null;         // the <audio> currently narrating
let voiceQueue = [];      // clips still to play after it
let lastRenderedStep = -1;
let lastDieState = '';

const path = p => `rooms/${code}/${p}`;
const stepKey = () => `s${S.step}`;
const push = () => db.set(path('state'), S);

function freshState(step = 0) {
  return normalizeState({ step, marksLeft: G.START_MARKS });
}

// --- Room setup (resumes the room in the URL if the host page is refreshed) ---
const existing = code ? await db.get(path('state')) : null;
if (existing) {
  S = normalizeState(existing);
} else {
  code = await newRoomCode();
  S = freshState();
  await db.set(`rooms/${code}`, { createdAt: db.now(), state: S });
  const url = new URL(location.href);
  url.searchParams.set('room', code);
  history.replaceState(null, '', url);
}

async function newRoomCode() {
  const letters = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels, so no accidental words
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!(await db.get(`rooms/${c}/createdAt`))) return c;
  }
}

db.on(path('players'), v => { players = v || {}; assignClasses(); checkVotes(); render(); });
db.on(path('votes'), v => { votes = v || {}; checkVotes(); render(); });
db.on(path('advance'), v => { advances = v || {}; checkAdvance(); });
db.on(path('rolls'), v => { rolls = v || {}; checkRoll(); });
fetch('audio/manifest.json', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : {}))
  .then(m => {
    voices = m;
    if (Object.keys(m).length) narrate = true; // AI voices are on by default once generated
    render();
  })
  .catch(() => {});
resume();
setInterval(tick, 250);
render();

// --- Players ---
function active() {
  return Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.connected !== false && p.name)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .slice(0, G.MAX_PLAYERS);
}

function assignClasses() {
  const list = active();
  const used = new Set(list.map(p => p.cls).filter(c => typeof c === 'number'));
  for (const p of list) {
    if (typeof p.cls === 'number') continue;
    const cls = G.CLASSES.findIndex((_, i) => !used.has(i));
    if (cls < 0) return;
    used.add(cls);
    db.update(path(`players/${p.id}`), { cls });
  }
}

// --- Game flow ---
function startGame() {
  const list = active();
  if (!list.length) return;
  const whispers = shuffle(G.WHISPERS);
  const secrets = {};
  list.forEach((p, i) => { secrets[p.id] = whispers[i % whispers.length]; });
  db.set(path('secrets'), secrets);
  Object.assign(S, { clues: [], visited: [], marksLeft: G.START_MARKS, accused: '' });
  goTo('intro');
}

function goTo(id) {
  clearTimeout(pending);
  let sc = G.SCENES[id];
  if (sc.location && !S.visited.includes(sc.location)) {
    S.visited.push(sc.location);
    S.marksLeft--;
  }
  if (sc.hub && S.marksLeft <= 0) {
    id = 'dawn';
    sc = G.SCENES[id];
  }
  if (sc.clue && !S.clues.includes(sc.clue)) S.clues.push(sc.clue);

  S.step++;
  S.sceneId = id;
  S.result = null;
  S.roll = null;
  const choices = G.choicesFor(S);
  S.choices = choices.map(c => c.label);
  if (sc.ending) S.phase = 'end';
  else if (choices.length) {
    S.phase = 'vote';
    S.voteEndsAt = db.now() + G.VOTE_SECONDS * 1000;
  } else S.phase = 'read';

  push();
  render();
  speak();
}

function checkVotes() {
  if (S.phase !== 'vote') return;
  const cur = votes[stepKey()] || {};
  const list = active();
  if (list.length && list.every(p => cur[p.id] != null)) closeVote();
}

function tally() {
  const cur = votes[stepKey()] || {};
  const counts = S.choices.map(() => 0);
  for (const v of Object.values(cur)) if (counts[v] != null) counts[v]++;
  return counts;
}

function closeVote() {
  if (S.phase !== 'vote') return;
  const counts = tally();
  const max = Math.max(...counts);
  const tied = counts.flatMap((c, i) => (c === max ? [i] : []));
  const index = tied[Math.floor(Math.random() * tied.length)];
  S.phase = 'result';
  S.result = { index, counts, tie: tied.length > 1 && max > 0, none: max === 0 };
  push();
  render();
  pending = setTimeout(() => resolveChoice(G.choicesFor(S)[index]), 3500);
}

function resolveChoice(choice) {
  if (choice.accuse) {
    S.accused = choice.accuse;
    goTo(G.endingFor(choice.accuse, S.clues));
  } else if (choice.check) startRoll(choice.check);
  else goTo(choice.to);
}

function startRoll(check) {
  const list = active();
  const roller = list[Math.floor(Math.random() * list.length)];
  S.phase = 'roll';
  S.roll = {
    ...check,
    pid: roller?.id || '',
    name: roller?.name || 'Fate',
    cls: roller?.cls ?? -1,
    endsAt: db.now() + G.ROLL_SECONDS * 1000,
    value: 0,
  };
  push();
  render();
  checkRoll();
}

function checkRoll() {
  if (S.phase !== 'roll' || !S.roll || S.roll.value) return;
  const v = Number(rolls[stepKey()]);
  if (Number.isInteger(v) && v >= 1 && v <= 20) applyRoll(v, false);
}

function applyRoll(value, auto) {
  S.roll.value = value;
  S.roll.auto = auto;
  S.roll.success = value >= S.roll.dc;
  S.roll.revealAt = db.now() + TUMBLE_MS;
  push();
  pending = setTimeout(finishRoll, TUMBLE_MS + 3500);
  tick();
}

function finishRoll() {
  goTo(S.roll.success ? S.roll.pass : S.roll.fail);
}

function checkAdvance() {
  if (!advances[stepKey()]) return;
  if (S.phase === 'read') advance();
  else if (S.phase === 'end') restart();
}

function advance() {
  const sc = G.SCENES[S.sceneId];
  if (S.phase === 'read' && sc?.next) goTo(sc.next);
}

function restart() {
  clearTimeout(pending);
  ['votes', 'advance', 'rolls', 'secrets'].forEach(p => db.remove(path(p)));
  S = freshState(S.step + 1);
  push();
  render();
}

// Picks up scheduled transitions if the host page was refreshed mid-game.
function resume() {
  if (S.phase === 'result' && S.result) {
    pending = setTimeout(() => resolveChoice(G.choicesFor(S)[S.result.index]), 1500);
  } else if (S.phase === 'roll' && S.roll?.value) {
    pending = setTimeout(finishRoll, 1500);
  }
}

function tick() {
  const now = db.now();
  if (S.phase === 'vote' && now >= S.voteEndsAt) closeVote();
  if (S.phase === 'roll' && S.roll && !S.roll.value && now >= S.roll.endsAt) {
    applyRoll(1 + Math.floor(Math.random() * 20), true);
  }
  // Re-render when the die starts tumbling and when it lands.
  const die = S.phase === 'roll' ? dieState(S.roll, now) : '';
  if (die !== lastDieState) {
    lastDieState = die;
    if (die === 'tumbling') sfx.clatter();
    if (die === 'landed') {
      sfx.land(S.roll);
      const roll = S.roll;
      setTimeout(() => { if (narrate && S.roll === roll) playVoices([G.rollAudioKey(roll)]); }, 600);
    }
    render();
  }
  updateTimer();
}

function updateTimer() {
  const el = $('#timer');
  if (!el) return;
  const endsAt = S.phase === 'vote' ? S.voteEndsAt : S.roll?.endsAt;
  const total = (S.phase === 'vote' ? G.VOTE_SECONDS : G.ROLL_SECONDS) * 1000;
  const left = Math.max(0, endsAt - db.now());
  el.querySelector('.fill').style.width = `${(left / total) * 100}%`;
  el.querySelector('.secs').textContent = `${secondsLeft(endsAt, db.now())}s`;
}

// Plays the scene's generated narration, or falls back to the browser's built-in voice.
function speak() {
  stopVoice();
  if (!narrate || !S.sceneId) return;
  if (playVoices(G.narrationClips(S).map(c => c.key))) return;
  if (!('speechSynthesis' in window)) return;
  const sc = G.SCENES[S.sceneId];
  const text = [sc.title, ...G.sceneText(S)].join('. ')
    .replace(/<[^>]+>/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '');
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Plays clips back to back. Returns false if any clip hasn't been generated,
// so the caller can fall back to the browser voice for the whole scene.
function playVoices(keys) {
  if (!keys.length || !keys.every(k => voices[k])) return false;
  stopVoice();
  const clips = keys.map(k => {
    const audio = new Audio(`audio/${k}.mp3?v=${voices[k]}`);
    audio.preload = 'auto'; // load the whole sequence up front so there's no gap between clips
    return audio;
  });
  const next = () => {
    voice = clips.shift() || null;
    voiceQueue = clips;
    if (!voice) return;
    voice.addEventListener('ended', () => { if (voiceQueue === clips) next(); }, { once: true });
    voice.play().catch(() => {}); // blocked until the page has been clicked once
  };
  next();
  return true;
}

function stopVoice() {
  voice?.pause();
  voice = null;
  voiceQueue = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function setNarrate(on) {
  narrate = on;
  if (on) speak();
  else stopVoice();
  render();
}

// --- Rendering ---
function render() {
  if (!S) return;
  app.innerHTML = S.phase === 'lobby' ? lobbyView() : gameView();
  lastRenderedStep = S.step;
  $('#start')?.addEventListener('click', startGame);
  $('#continue')?.addEventListener('click', advance);
  $('#again')?.addEventListener('click', restart);
  $('#skip')?.addEventListener('click', closeVote);
  const box = $('#narrate');
  if (box) {
    box.checked = narrate;
    box.addEventListener('change', () => { narrate = box.checked; });
  }
  $('#sound')?.addEventListener('click', () => setNarrate(!narrate));
  $('#replay')?.addEventListener('click', speak);
  updateTimer();
}

function joinUrl() {
  const url = new URL('play.html', location.href);
  url.searchParams.set('room', code);
  if (mode === 'local') url.searchParams.set('local', '');
  return url.href;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function lobbyView() {
  const list = active();
  const slots = Array.from({ length: G.MAX_PLAYERS }, (_, i) => {
    const p = list[i];
    return p
      ? `<li class="slot filled"><span class="avatar">${classOf(p).icon}</span><span>${esc(p.name)}<small>${classOf(p).name}</small></span></li>`
      : `<li class="slot"><span class="avatar">·</span><span class="muted">Waiting…</span></li>`;
  }).join('');
  const url = joinUrl();
  return `
    ${modeBanner()}
    <div class="lobby">
      <div class="join-card">
        <div class="qr">${qrSvg(url)}</div>
        <p class="muted">Scan to join, or enter code</p>
        <div class="code">${code}</div>
      </div>
      <div class="lobby-side">
        <p class="eyebrow">A murder mystery for 1–6 adventurers</p>
        <h1>Death at the Drowned&nbsp;Lantern</h1>
        <p class="lede">A magistrate lies dead in a storm-bound inn. Explore, roll the dice, and vote on every move. Before dawn, name the killer.</p>
        <ul class="slots">${slots}</ul>
        <div class="row">
          <button id="start" class="primary" ${list.length ? '' : 'disabled'}>Begin the mystery</button>
          <label class="toggle"><input type="checkbox" id="narrate"> Narration ${Object.keys(voices).length ? '(voiced cast)' : '(browser voice)'}</label>
        </div>
        <p class="muted small"><a href="${esc(url)}" target="_blank" rel="noopener">Open a test controller in a new tab</a></p>
      </div>
    </div>`;
}

function modeBanner() {
  if (mode !== 'local') return '';
  return `<div class="banner">Local demo mode: Firebase isn't configured yet, so controllers only work as other tabs in this browser. See the README to go online.</div>`;
}

function gameView() {
  const sc = G.SCENES[S.sceneId];
  const enter = S.step !== lastRenderedStep ? 'enter' : '';
  const paras = G.sceneText(S).map(p => `<p>${p}</p>`).join('');
  return `
    <header class="hud">
      <span class="brand">Death at the Drowned Lantern</span>
      <span class="candles" title="Searches left before dawn">${'🕯️'.repeat(Math.max(0, S.marksLeft)) || '🌅'}</span>
      <button id="sound" class="ghost icon" title="${narrate ? 'Mute narration' : 'Turn on narration'}">${narrate ? '🔊' : '🔇'}</button>
      ${narrate ? '<button id="replay" class="ghost icon" title="Replay narration">↻</button>' : ''}
      <span class="code-chip">Room <b>${code}</b></span>
    </header>
    <div class="stage">
      <section class="scene ${enter}">
        <div class="art">${sc.art}</div>
        <h2>${sc.title}</h2>
        <div class="story">${paras}</div>
        ${choicesView()}
        ${actionsView(sc)}
      </section>
      <aside class="side">
        ${partyView()}
        ${cluesView()}
      </aside>
    </div>
    ${S.phase === 'roll' ? rollView() : ''}`;
}

function choicesView() {
  if (!S.choices.length) return '';
  const cur = votes[stepKey()] || {};
  const showResult = S.phase !== 'vote';
  const counts = S.result?.counts || tally();
  const items = S.choices.map((label, i) => {
    const voters = showResult
      ? active().filter(p => cur[p.id] === i).map(p => `<span title="${esc(p.name)}">${classOf(p).icon}</span>`).join('')
      : '';
    const cls = showResult ? (S.result?.index === i ? 'winner' : 'loser') : '';
    return `<li class="choice ${cls}">
      <span class="letter">${LETTERS[i]}</span>
      <span class="label">${esc(label)}</span>
      ${showResult ? `<span class="voters">${voters}</span><span class="count">${counts[i] || 0}</span>` : ''}
    </li>`;
  }).join('');
  return `<ol class="choices">${items}</ol>`;
}

function actionsView(sc) {
  if (S.phase === 'vote') {
    const cur = votes[stepKey()] || {};
    const n = active().filter(p => cur[p.id] != null).length;
    return `<div class="timer" id="timer"><div class="fill"></div><span class="secs"></span></div>
      <div class="row"><p class="muted">Vote on your phones · ${n}/${active().length} voted</p>
      <button id="skip" class="ghost">End vote now</button></div>`;
  }
  if (S.phase === 'result') {
    const r = S.result;
    const note = r.none ? 'Nobody voted, so fate decides.' : r.tie ? 'A tie! The dice break it.' : 'The party has decided.';
    return `<p class="verdict">${note}</p>`;
  }
  if (S.phase === 'read') {
    return `<div class="row"><button id="continue" class="primary">Continue ▶</button>
      <span class="muted">or tap Continue on any phone</span></div>`;
  }
  if (S.phase === 'end') {
    const leads = G.leadsFound(S.clues);
    return `<p class="muted">Clues pointing to the killer: <b>${leads}</b> (needed ${G.LEADS_NEEDED})</p>
      <div class="row"><button id="again" class="primary">Play again</button>
      <span class="muted">or tap Play again on any phone</span></div>`;
  }
  return '';
}

function partyView() {
  const cur = votes[stepKey()] || {};
  const rows = active().map(p => {
    const status = S.phase === 'vote' ? (cur[p.id] != null ? '✅' : '⏳') : '';
    return `<li><span class="avatar">${classOf(p).icon}</span><span class="pname">${esc(p.name)}</span><span>${status}</span></li>`;
  }).join('');
  return `<h3>Investigators</h3><ul class="party">${rows || '<li class="muted">Nobody connected</li>'}</ul>`;
}

function cluesView() {
  const items = S.clues.map(id => {
    const c = G.CLUES[id];
    return `<li><span class="cicon">${c.icon}</span><div><b>${c.name}</b><p>${esc(c.text)}</p></div></li>`;
  }).join('');
  return `<h3>Clues</h3><ul class="clues">${items || '<li class="muted">None yet</li>'}</ul>`;
}

function rollView() {
  const r = S.roll;
  const state = dieState(r, db.now());
  const who = `${G.CLASSES[r.cls]?.icon || '🎲'} ${esc(r.name)}`;
  let status;
  if (state === 'waiting') {
    status = `<p>${who}, tap the die on your phone!</p><div class="timer" id="timer"><div class="fill"></div><span class="secs"></span></div>`;
  } else if (state === 'tumbling') {
    status = `<p class="muted">${r.auto ? 'Fate rolls…' : `${who} rolls…`}</p>`;
  } else {
    const nat = r.value === 20 ? 'Natural 20! ' : r.value === 1 ? 'Natural 1! ' : '';
    status = `<p class="outcome ${r.success ? 'pass' : 'fail'}">${nat}${r.success ? 'Success!' : 'Failure'}</p>
      ${r.auto ? '<p class="muted">Nobody rolled in time, so fate rolled.</p>' : ''}`;
  }
  return `<div class="overlay"><div class="roll-card">
    <p class="eyebrow">${esc(r.skill)} check · needs ${r.dc} or higher</p>
    <div class="d20 ${dieClass(r, state)}">${d20Svg(state === 'landed' ? r.value : '?')}</div>
    ${status}
  </div></div>`;
}
