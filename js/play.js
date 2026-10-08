// The phone controller. It reads the host's state and writes only votes, rolls and taps.
import { connect } from './db.js';
import * as G from './story.js';
import { $, esc, classOf, LETTERS, normalizeState, secondsLeft, d20Svg, dieState, dieClass } from './util.js';

const app = $('#app');
const params = new URLSearchParams(location.search);
const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

// One id per tab (sessionStorage), so a refresh rejoins as the same player
// and several test tabs in one browser count as different players.
const pid = (() => {
  const make = () => Math.random().toString(36).slice(2, 10);
  try {
    let id = sessionStorage.getItem('mm-pid');
    if (!id) { id = make(); sessionStorage.setItem('mm-pid', id); }
    return id;
  } catch { return make(); }
})();

let db, S = null, players = {}, secret = '', myVote = null;
let roomLoaded = false, stateLoaded = false, presenceSet = false, showSecret = false;
let voteStep = -1, unsubVote = null, tappedStep = -1, rolling = false;
let lastKey = '';

const path = p => `rooms/${code}/${p}`;

main();

async function main() {
  if (!code) return codeEntry();
  db = await connect();
  if (!(await db.get(path('createdAt')))) {
    return message('Room not found', `There's no game with code <b>${esc(code)}</b>. Check the code on the big screen.`, true);
  }
  db.on(path('players'), v => {
    players = v || {};
    roomLoaded = true;
    if (players[pid] && !presenceSet) markPresent();
    render();
  });
  db.on(path('state'), v => {
    S = v ? normalizeState(v) : null;
    stateLoaded = true;
    watchVote();
    render();
  });
  db.on(path(`secrets/${pid}`), v => { secret = v || ''; render(); });
  db.onConnected(up => {
    if (!up) presenceSet = false;
    else if (players[pid]) markPresent();
  });
  setInterval(updateTimer, 250);
}

function markPresent() {
  presenceSet = true;
  db.update(path(`players/${pid}`), { connected: true });
  db.onDisconnectSet(path(`players/${pid}/connected`), false);
}

function watchVote() {
  if (!S || S.step === voteStep) return;
  voteStep = S.step;
  myVote = null;
  rolling = false;
  unsubVote?.();
  unsubVote = db.on(path(`votes/s${S.step}/${pid}`), v => { myVote = v; render(); });
}

// --- Screens ---
function codeEntry() {
  app.innerHTML = `
    <div class="phone-card">
      <h1>Join a game</h1>
      <form id="codeForm">
        <input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ROOM CODE" required>
        <button class="primary">Join</button>
      </form>
    </div>`;
  $('#codeForm').addEventListener('submit', e => {
    e.preventDefault();
    const url = new URL(location.href);
    url.searchParams.set('room', $('#code').value.trim().toUpperCase());
    location.href = url.href;
  });
}

function message(title, html, retry) {
  app.innerHTML = `<div class="phone-card"><h1>${title}</h1><p>${html}</p>
    ${retry ? '<a class="button" href="play.html">Enter a different code</a>' : ''}</div>`;
}

function joinView() {
  let saved = '';
  try { saved = localStorage.getItem('mm-name') || ''; } catch { /* storage blocked */ }
  app.innerHTML = `
    <div class="phone-card">
      <p class="eyebrow">Room ${esc(code)}</p>
      <h1>Death at the Drowned Lantern</h1>
      <form id="joinForm">
        <input id="name" maxlength="12" autocomplete="off" placeholder="Your name" value="${esc(saved)}" required>
        <button class="primary">Join the party</button>
      </form>
      <p id="joinError" class="error"></p>
    </div>`;
  $('#joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#name').value.trim().slice(0, 12);
    if (!name) return;
    const others = Object.entries(players).filter(([id, p]) => id !== pid && p.connected !== false);
    if (others.length >= G.MAX_PLAYERS) {
      $('#joinError').textContent = `This room is full (${G.MAX_PLAYERS} players).`;
      return;
    }
    try { localStorage.setItem('mm-name', name); } catch { /* storage blocked */ }
    await db.update(path(`players/${pid}`), { name, joinedAt: db.now(), connected: true });
    markPresent();
  });
}

function render() {
  if (!roomLoaded || !stateLoaded) return;
  const me = players[pid];
  if (!me?.name) {
    if (!$('#joinForm')) joinView();
    return;
  }
  if (!S) return message('Room closed', 'The host ended this game.', true);
  const key = JSON.stringify([S, myVote, secret, showSecret, players, tappedStep, rolling, dieState(S.roll, db.now())]);
  if (key === lastKey) return;
  lastKey = key;

  const c = classOf(me);
  app.innerHTML = `
    <header class="phone-head">
      <span class="avatar">${c.icon}</span>
      <span><b>${esc(me.name)}</b><small>${c.name}</small></span>
      ${hasClueButton() ? `<button id="secretToggle" class="clue-chip ${showSecret ? 'open' : ''}" aria-expanded="${showSecret}">🤫 Clue</button>` : ''}
      <span class="code-chip">${esc(code)}</span>
    </header>
    ${hasClueButton() && showSecret ? `<div class="clue-panel"><p>${esc(secret)}</p>
      <p class="muted small">What you noticed at supper. Share it, or keep it to yourself.</p></div>` : ''}
    <main class="phone-body">${body(me)}</main>`;
  bind();
  updateTimer();
}

function body(me) {
  const sc = G.SCENES[S.sceneId];
  switch (S.phase) {
    case 'lobby': {
      const names = Object.values(players).filter(p => p.connected !== false && p.name)
        .map(p => `<li>${classOf(p).icon} ${esc(p.name)}</li>`).join('');
      return `<h2>You're in!</h2>
        <p>Look at the big screen. The adventure starts when the host is ready.</p>
        <ul class="chips">${names}</ul>`;
    }
    case 'vote':
      return `<p class="eyebrow">${esc(sc.title)}</p>
        <h2>What does the party do?</h2>
        <div class="vote-list">${S.choices.map((label, i) => `
          <button class="vote ${myVote === i ? 'picked' : ''}" data-i="${i}">
            <span class="letter">${LETTERS[i]}</span><span>${esc(label)}</span>
          </button>`).join('')}</div>
        <div class="timer" id="timer"><div class="fill"></div><span class="secs"></span></div>
        <p class="muted small">${myVote == null ? (S.voteEndsAt ? 'Tap to vote.' : 'You can vote now. The timer starts when the narrator finishes.') : 'Vote locked in. You can change it until time runs out.'}</p>`;
    case 'result': {
      const r = S.result;
      return `<p class="eyebrow">The party chose</p>
        <div class="chosen">${esc(S.choices[r.index])}</div>
        <p class="muted">${r.none ? 'Nobody voted, so fate decided.' : r.tie ? 'It was a tie, so the dice decided.' : ''}</p>`;
    }
    case 'roll':
      return rollBody();
    case 'read':
      // The scene that says "check your phone" shows the whisper up front.
      if (S.sceneId === 'suspects' && secret) {
        return `<p class="eyebrow">${esc(sc.title)}</p>
          <div class="whisper-card">
            <p class="eyebrow">🤫 Only you can see this</p>
            <h2>You noticed something…</h2>
            <p class="whisper">${esc(secret)}</p>
            <p class="muted small">Share it with the group, or keep it to yourself. It might not be the whole truth.</p>
          </div>
          ${tappedStep === S.step
            ? '<p class="muted">Waiting for the story to continue…</p>'
            : '<button id="continue" class="primary big">Continue ▶</button>'}`;
      }
      return `<p class="eyebrow">${esc(sc.title)}</p>
        <h2>Read the big screen</h2>
        ${tappedStep === S.step
          ? '<p class="muted">Waiting for the story to continue…</p>'
          : '<button id="continue" class="primary big">Continue ▶</button>'}`;
    case 'end':
      return `<p class="eyebrow">The End</p>
        <h2>${sc.art} ${esc(sc.title)}</h2>
        <p>${sc.win ? 'You caught the killer!' : 'The truth is on the big screen.'}</p>
        <button id="again" class="primary big">Play again</button>`;
    default:
      return '';
  }
}

function rollBody() {
  const r = S.roll;
  const mine = r.pid === pid;
  const state = dieState(r, db.now());
  const head = `<p class="eyebrow">${esc(r.skill)} check · needs ${r.dc}+</p>`;
  if (state === 'landed') {
    return `${head}<div class="d20 small ${dieClass(r, state)}">${d20Svg(r.value)}</div>
      <h2 class="${r.success ? 'pass' : 'fail'}">${r.success ? 'Success!' : 'Failure'}</h2>`;
  }
  if (state === 'tumbling' || (mine && rolling)) {
    return `${head}<div class="d20 small tumbling">${d20Svg()}</div><h2>Rolling…</h2>
      <p class="muted">Watch the big screen!</p>`;
  }
  if (!mine) {
    return `${head}<h2>${esc(r.name)} is rolling…</h2><p class="muted">Fingers crossed.</p>`;
  }
  return `${head}<h2>The party is counting on you!</h2>
    <button id="roll" class="d20 small waiting button-die" aria-label="Roll the d20">${d20Svg('TAP')}</button>
    <p>Tap the die to roll.</p>
    <div class="timer" id="timer"><div class="fill"></div><span class="secs"></span></div>`;
}

// The clue lives in the header so it's always one tap away without scrolling.
// It's hidden on the scene that already shows it as a big card.
function hasClueButton() {
  return !!secret && S.phase !== 'lobby' && !(S.phase === 'read' && S.sceneId === 'suspects');
}

function bind() {
  app.querySelectorAll('.vote').forEach(btn => btn.addEventListener('click', () => {
    if (S.phase !== 'vote') return;
    myVote = Number(btn.dataset.i);
    db.set(path(`votes/s${S.step}/${pid}`), myVote);
    render();
  }));
  $('#continue')?.addEventListener('click', tap);
  $('#again')?.addEventListener('click', tap);
  $('#roll')?.addEventListener('click', roll);
  $('#secretToggle')?.addEventListener('click', () => { showSecret = !showSecret; render(); });
}

function tap() {
  tappedStep = S.step;
  db.set(path(`advance/s${S.step}`), pid);
  render();
}

function roll() {
  if (rolling) return;
  rolling = true;
  db.set(path(`rolls/s${S.step}`), 1 + Math.floor(Math.random() * 20));
  render();
}

function updateTimer() {
  if (S?.phase === 'roll') render(); // picks up tumbling → landed (no-op if nothing changed)
  const el = $('#timer');
  if (!el || !S) return;
  const endsAt = S.phase === 'vote' ? S.voteEndsAt : S.roll?.endsAt;
  if (!endsAt) {
    el.querySelector('.fill').style.width = '100%';
    el.querySelector('.secs').textContent = '🔊 Listen to the narrator…';
    return;
  }
  const total = (S.phase === 'vote' ? G.VOTE_SECONDS : G.ROLL_SECONDS) * 1000;
  const now = db.now();
  el.querySelector('.fill').style.width = `${(Math.max(0, endsAt - now) / total) * 100}%`;
  el.querySelector('.secs').textContent = `${secondsLeft(endsAt, now)}s`;
}
