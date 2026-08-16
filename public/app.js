/* ═══════════════════════════════════════════════════════════════
   Who Am I? — client
   ═══════════════════════════════════════════════════════════════ */

const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐨', '🐧', '🦉', '🐝', '🦖', '🐳'];
const REACTIONS = ['👍', '👎', '🤔', '😂', '🔥', '❓'];
const TIMER_OPTIONS = [
  { value: 0, label: 'No timer' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
  { value: 120, label: '2m' }
];
const RING = 2 * Math.PI * 19;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/* ────────────────────────────────────────────────────── state ── */

const app = {
  ws: null,
  state: null,
  categories: [],
  session: null,      // { code, playerId, token }
  identity: { name: '', avatar: AVATARS[0] },
  clockOffset: 0,     // serverNow - clientNow
  retries: 0,
  intent: null,       // pending action once the socket opens
  lastFeedId: null,
  muted: localStorage.getItem('whoami:muted') === '1'
};

const store = {
  load() {
    try {
      const raw = sessionStorage.getItem('whoami:session');
      if (raw) app.session = JSON.parse(raw);
    } catch { /* ignore */ }
    app.identity.name = localStorage.getItem('whoami:name') || '';
    const avatar = localStorage.getItem('whoami:avatar');
    if (AVATARS.includes(avatar)) app.identity.avatar = avatar;
  },
  saveSession(session) {
    app.session = session;
    sessionStorage.setItem('whoami:session', JSON.stringify(session));
  },
  clearSession() {
    app.session = null;
    sessionStorage.removeItem('whoami:session');
  },
  saveIdentity() {
    localStorage.setItem('whoami:name', app.identity.name);
    localStorage.setItem('whoami:avatar', app.identity.avatar);
  }
};

/* ─────────────────────────────────────────────────── feedback ── */

function toast(message, kind = '') {
  const node = el('div', `toast ${kind}`.trim(), message);
  $('#toaster').append(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, 2800);
}

function curtain(show, text = 'Connecting…') {
  $('#curtain-text').textContent = text;
  $('#curtain').classList.toggle('show', show);
}

let audioCtx = null;
function blip(freq = 440, duration = 0.12, type = 'sine', gain = 0.05) {
  if (app.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, audioCtx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(vol).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* audio is a nicety, never a blocker */ }
}

const sfx = {
  deal:  () => [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.13, 'triangle'), i * 90)),
  turn:  () => blip(660, 0.1, 'triangle', 0.04),
  win:   () => [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.06), i * 110)),
  click: () => blip(340, 0.05, 'sine', 0.03),
  tick:  () => blip(880, 0.05, 'square', 0.025)
};

function confetti(colors = ['#7c5cff', '#22d3ee', '#2dd4a7', '#f5a524', '#ff4d6d']) {
  const layer = $('#confetti');
  for (let i = 0; i < 90; i += 1) {
    const bit = el('span', 'confetti-bit');
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${2 + Math.random() * 1.8}s`;
    bit.style.animationDelay = `${Math.random() * 0.5}s`;
    bit.style.opacity = String(0.6 + Math.random() * 0.4);
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.append(bit);
    setTimeout(() => bit.remove(), 4600);
  }
}

function floatEmoji(emoji) {
  const node = el('span', 'float-emoji', emoji);
  node.style.left = `${8 + Math.random() * 78}vw`;
  $('#reactions').append(node);
  setTimeout(() => node.remove(), 2400);
}

/* ─────────────────────────────────────────────────── transport ── */

function connect(onOpen) {
  if (app.ws && (app.ws.readyState === WebSocket.OPEN || app.ws.readyState === WebSocket.CONNECTING)) {
    if (app.ws.readyState === WebSocket.OPEN && onOpen) onOpen();
    else app.intent = onOpen || app.intent;
    return;
  }
  app.intent = onOpen || app.intent;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  app.ws = ws;

  ws.addEventListener('open', () => {
    app.retries = 0;
    curtain(false);
    const intent = app.intent;
    app.intent = null;
    if (intent) intent();
    else if (app.session) send('rejoin', app.session);
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handle(msg);
  });

  ws.addEventListener('close', () => {
    if (!app.session) return;
    app.retries += 1;
    curtain(true, app.retries > 3 ? 'Still trying to reconnect…' : 'Reconnecting…');
    setTimeout(() => connect(), Math.min(800 * app.retries, 5000));
  });

  ws.addEventListener('error', () => { /* close handler drives the retry */ });
}

function send(type, payload = {}) {
  if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
    connect(() => send(type, payload));
    return;
  }
  app.ws.send(JSON.stringify({ type, ...payload }));
}

function handle(msg) {
  switch (msg.type) {
    case 'seated':
      store.saveSession({ code: msg.code, playerId: msg.playerId, token: msg.token });
      applyState(msg.state);
      break;
    case 'state':
      applyState(msg.state);
      break;
    case 'dealt':
      sfx.deal();
      toast('Cards dealt — look at everyone else, not yourself 👀');
      break;
    case 'celebrate': {
      const mine = msg.playerId === app.session?.playerId;
      confetti();
      sfx.win();
      if (mine) toast(`You were ${msg.character}! 🎉`, 'good');
      break;
    }
    case 'reaction':
      floatEmoji(msg.emoji);
      break;
    case 'error':
      toast(msg.message, 'err');
      break;
    case 'kicked':
      store.clearSession();
      app.state = null;
      route();
      toast(msg.message, 'err');
      break;
    case 'rejoin-failed':
      store.clearSession();
      app.state = null;
      curtain(false);
      route();
      break;
    default:
      break;
  }
}

function applyState(state) {
  const previous = app.state;
  app.clockOffset = state.now - Date.now();
  app.state = state;

  if (previous && previous.phase === 'playing' && previous.currentPlayerId !== state.currentPlayerId) {
    if (state.currentPlayerId === state.you) sfx.turn();
  }
  curtain(false);
  route();
}

/* ────────────────────────────────────────────────────── routing ── */

function route() {
  const state = app.state;
  const screen = !state ? 'home'
    : state.phase === 'lobby' ? 'lobby'
    : state.phase === 'playing' ? 'game'
    : 'results';

  document.documentElement.dataset.screen = screen;
  if (screen === 'lobby') renderLobby(state);
  if (screen === 'game') renderGame(state);
  if (screen === 'results') renderResults(state);
}

/* ═════════════════════════════════════════════════════ HOME ══ */

function renderHome() {
  const picker = $('#avatar-picker');
  picker.innerHTML = '';
  AVATARS.forEach((emoji) => {
    const btn = el('button', 'avatar-opt', emoji);
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(emoji === app.identity.avatar));
    btn.addEventListener('click', () => {
      app.identity.avatar = emoji;
      store.saveIdentity();
      sfx.click();
      renderHome();
    });
    picker.append(btn);
  });
  $('#name-input').value = app.identity.name;
}

function readIdentity() {
  const name = $('#name-input').value.trim();
  if (!name) {
    $('#name-input').focus();
    toast('Add your name first', 'err');
    return null;
  }
  app.identity.name = name;
  store.saveIdentity();
  return { name, avatar: app.identity.avatar };
}

/* ════════════════════════════════════════════════════ LOBBY ══ */

function renderLobby(state) {
  $('#room-code').textContent = state.code;

  // Seats — filled ones first, then dashed placeholders up to the max.
  const seats = $('#lobby-seats');
  seats.innerHTML = '';
  state.players.forEach((p) => {
    const seat = el('div', 'seat filled');
    seat.style.setProperty('--seat-color', p.color);
    seat.append(el('div', 'seat-avatar', p.avatar));
    seat.append(el('div', 'seat-name', p.isYou ? `${p.name} (you)` : p.name));
    seat.append(el('div', 'seat-tag', p.isHost ? '👑 Host' : 'Ready'));
    seats.append(seat);
  });
  for (let i = state.players.length; i < state.maxPlayers; i += 1) {
    const seat = el('div', 'seat empty');
    seat.append(el('div', 'seat-avatar', '·'));
    seat.append(el('div', 'seat-name', 'Open seat'));
    seat.append(el('div', 'seat-tag', 'Waiting'));
    seats.append(seat);
  }

  // Categories
  const grid = $('#category-grid');
  grid.innerHTML = '';
  app.categories.forEach((cat) => {
    const card = el('button', 'cat-card');
    card.type = 'button';
    card.style.setProperty('--cat', cat.accent);
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(cat.id === state.categoryId));
    card.disabled = !state.youAreHost;
    card.append(el('span', 'cat-emoji', cat.emoji));
    card.append(el('span', 'cat-name', cat.name));
    card.append(el('span', 'cat-blurb', cat.blurb));
    card.append(el('span', 'cat-count', `${cat.count} characters`));
    card.addEventListener('click', () => {
      sfx.click();
      send('category', { categoryId: cat.id });
    });
    grid.append(card);
  });

  $('#category-sub').textContent = state.youAreHost
    ? 'You are the host — your pick is what everybody plays.'
    : 'The host is choosing. Sit tight.';

  // Timer segmented control
  const picker = $('#timer-picker');
  picker.innerHTML = '';
  picker.dataset.locked = String(!state.youAreHost);
  TIMER_OPTIONS.forEach((opt) => {
    const btn = el('button', 'seg-opt', opt.label);
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(opt.value === state.turnSeconds));
    btn.disabled = !state.youAreHost;
    btn.addEventListener('click', () => {
      sfx.click();
      send('timer', { seconds: opt.value });
    });
    picker.append(btn);
  });

  // Dock
  const startable = state.youAreHost && state.players.length >= state.minPlayers && !!state.categoryId;
  $('#btn-start').disabled = !startable;
  $('#btn-start').style.display = state.youAreHost ? '' : 'none';

  const status = $('#lobby-status');
  if (!state.youAreHost) {
    status.textContent = state.categoryId
      ? `Host picked ${state.category.emoji} ${state.category.name} — waiting for them to start`
      : 'Waiting for the host to pick a category…';
  } else if (state.players.length < state.minPlayers) {
    status.textContent = `Share code ${state.code} — you need at least ${state.minPlayers} players`;
  } else if (!state.categoryId) {
    status.textContent = 'Pick a category to unlock the start button';
  } else {
    status.textContent = `${state.players.length} players · ${state.category.emoji} ${state.category.name} · round ${state.round}`;
  }
}

/* ═════════════════════════════════════════════════════ GAME ══ */

function renderGame(state) {
  $('#game-code').textContent = state.code;
  $('#game-category').textContent = state.category ? `${state.category.emoji} ${state.category.name}` : '—';

  const me = state.players.find((p) => p.isYou);
  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const myTurn = current && current.isYou;

  // Turn banner
  const banner = $('#turn-banner');
  banner.classList.toggle('mine', !!myTurn);
  $('#turn-text').textContent = !current
    ? 'Waiting…'
    : myTurn
      ? 'Your turn — ask a yes/no question about your character'
      : `${current.name} is asking — answer honestly`;

  // Table
  const table = $('#table');
  const signature = state.players.map((p) => `${p.id}:${p.character || '?'}:${p.solved}`).join('|');
  if (table.dataset.signature !== signature) {
    table.dataset.signature = signature;
    table.innerHTML = '';
    state.players.forEach((p) => table.append(playerCard(p, state)));
  }
  // Cheap updates that shouldn't re-trigger the deal animation.
  [...table.children].forEach((card) => {
    const isActive = card.dataset.playerId === state.currentPlayerId;
    card.classList.toggle('active', isActive);
    const status = card.querySelector('.pcard-status');
    const player = state.players.find((p) => p.id === card.dataset.playerId);
    if (status && player) {
      status.className = `pcard-status ${player.solved ? 'win' : isActive ? 'turn' : ''}`.trim();
      status.textContent = player.solved ? '✓ Figured it out' : isActive ? '● Asking now' : 'Waiting';
    }
    card.classList.toggle('offline', player ? !player.connected : false);
  });

  renderFeed(state);
  renderDock(state, me, myTurn);
  startTimerLoop();
}

function playerCard(p, state) {
  const card = el('div', 'pcard');
  card.dataset.playerId = p.id;
  card.style.setProperty('--pc', p.color);
  if (p.solved) card.classList.add('solved');
  card.style.animationDelay = `${state.players.indexOf(p) * 90}ms`;

  const head = el('div', 'pcard-head');
  head.append(el('span', 'pcard-avatar', p.avatar));
  head.append(el('span', 'pcard-name', p.isYou ? `${p.name} (you)` : p.name));
  if (p.isHost) head.append(el('span', 'pcard-badge', '👑'));
  card.append(head);

  const face = el('div', 'pcard-face');
  if (p.character) {
    face.append(el('span', 'pcard-character', p.character));
  } else {
    face.classList.add('hidden-face');
    face.append(el('span', 'mystery', '?'));
    face.append(el('span', 'mystery-label', 'Your secret'));
  }
  card.append(face);

  const foot = el('div', 'pcard-foot');
  foot.append(el('span', 'pcard-status', 'Waiting'));
  if (p.place) foot.append(el('span', 'place-medal', `#${p.place}`));
  card.append(foot);
  return card;
}

function renderFeed(state) {
  const list = $('#feed-list');
  const latest = state.feed[state.feed.length - 1];
  if (latest && latest.id === app.lastFeedId && list.children.length === state.feed.length) return;
  app.lastFeedId = latest ? latest.id : null;

  list.innerHTML = '';
  state.feed.forEach((item) => {
    list.append(el('li', `feed-item ${item.type}`, item.text));
  });
  list.scrollTop = list.scrollHeight;
}

function renderDock(state, me, myTurn) {
  const bar = $('#reaction-bar');
  if (!bar.children.length) {
    REACTIONS.forEach((emoji) => {
      const btn = el('button', 'react-btn', emoji);
      btn.type = 'button';
      btn.title = `React ${emoji}`;
      btn.addEventListener('click', () => {
        send('react', { emoji });
        sfx.click();
      });
      bar.append(btn);
    });
  }

  const actions = $('#dock-actions');
  actions.innerHTML = '';

  if (me && me.solved) {
    actions.append(el('span', 'waiting-note', 'You got yours — help the others along 🙌'));
  } else if (myTurn) {
    const pass = el('button', 'btn btn-ghost', 'Pass turn');
    pass.addEventListener('click', () => send('pass'));
    const got = el('button', 'btn btn-mint', 'I guessed it! 🎉');
    got.addEventListener('click', () => send('solved'));
    actions.append(pass, got);
  } else {
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    actions.append(el('span', 'waiting-note', current ? `Waiting on ${current.name}…` : 'Waiting…'));
  }

  if (state.youAreHost) {
    const endRound = el('button', 'btn btn-quiet', 'Reveal all');
    endRound.addEventListener('click', () => send('reveal'));
    actions.append(endRound);
  }
}

/* ──────────────────────────────────────────────── turn timer ── */

let timerRaf = null;
let lastTickSecond = null;

function startTimerLoop() {
  if (timerRaf) return;
  const tick = () => {
    const state = app.state;
    if (!state || state.phase !== 'playing') {
      timerRaf = null;
      return;
    }
    const wrap = $('#timer');
    const num = $('#timer-num');
    if (!state.turnEndsAt) {
      wrap.className = 'timer off';
      num.textContent = '∞';
      wrap.querySelector('.timer-fill').style.strokeDashoffset = '0';
    } else {
      const total = state.turnSeconds * 1000;
      const left = Math.max(0, state.turnEndsAt - (Date.now() + app.clockOffset));
      const seconds = Math.ceil(left / 1000);
      const ratio = total ? left / total : 0;
      wrap.className = `timer${ratio < 0.18 ? ' danger' : ratio < 0.4 ? ' warn' : ''}`;
      num.textContent = String(seconds);
      wrap.querySelector('.timer-fill').style.strokeDashoffset = String(RING * (1 - ratio));

      const mine = state.currentPlayerId === state.you;
      if (mine && seconds <= 5 && seconds > 0 && seconds !== lastTickSecond) sfx.tick();
      lastTickSecond = seconds;
    }
    timerRaf = requestAnimationFrame(tick);
  };
  timerRaf = requestAnimationFrame(tick);
}

/* ══════════════════════════════════════════════════ RESULTS ══ */

function renderResults(state) {
  const me = state.players.find((p) => p.isYou);
  $('#results-sub').textContent = me && me.solved
    ? `You worked out that you were ${me.character}. Round ${state.round} done.`
    : me
      ? `You never cracked it — you were ${me.character}.`
      : 'Round over.';

  const grid = $('#results-grid');
  grid.innerHTML = '';
  const ordered = [...state.players].sort((a, b) => (a.place || 99) - (b.place || 99));
  ordered.forEach((p, i) => {
    const card = el('div', `result-card${p.solved ? ' win' : ''}`);
    card.style.animationDelay = `${i * 110}ms`;
    card.append(el('div', 'result-avatar', p.avatar));
    card.append(el('div', 'result-name', p.isYou ? `${p.name} (you)` : p.name));
    card.append(el('div', 'result-character', p.character || '—'));
    const tag = el('div', `result-tag${p.solved ? ' win' : ''}`, p.solved ? `Finished #${p.place}` : 'Never guessed');
    card.append(tag);
    grid.append(card);
  });

  $('#btn-again').style.display = state.youAreHost ? '' : 'none';
  if (state.players.some((p) => p.solved)) confettiOnce();
}

let confettiFired = false;
function confettiOnce() {
  if (confettiFired) return;
  confettiFired = true;
  confetti();
  setTimeout(() => { confettiFired = false; }, 6000);
}

/* ═══════════════════════════════════════════════════ wiring ══ */

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    app.categories = await res.json();
  } catch {
    toast('Could not load categories — is the server running?', 'err');
  }
}

function bind() {
  $('#btn-host').addEventListener('click', () => {
    const identity = readIdentity();
    if (!identity) return;
    sfx.click();
    curtain(true, 'Opening your room…');
    connect(() => send('create', identity));
  });

  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const identity = readIdentity();
    if (!identity) return;
    const code = $('#code-input').value.trim().toUpperCase();
    if (code.length !== 4) {
      toast('Room codes are 4 characters', 'err');
      return;
    }
    sfx.click();
    curtain(true, 'Finding the room…');
    connect(() => send('join', { ...identity, code }));
  });

  $('#code-input').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('#code-copy').addEventListener('click', async () => {
    const link = `${location.origin}/?room=${app.state?.code || ''}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied 📋', 'good');
    } catch {
      toast(`Share this code: ${app.state?.code}`);
    }
  });

  $('#btn-start').addEventListener('click', () => { sfx.click(); send('start'); });
  $('#btn-again').addEventListener('click', () => { sfx.click(); send('restart'); });

  const leave = () => {
    send('leave');
    store.clearSession();
    app.state = null;
    route();
  };
  $('#btn-leave-lobby').addEventListener('click', leave);
  $('#btn-exit').addEventListener('click', leave);
  $('#btn-quit').addEventListener('click', () => {
    if (confirm('Leave this game?')) leave();
  });

  $('#btn-sound').addEventListener('click', () => {
    app.muted = !app.muted;
    localStorage.setItem('whoami:muted', app.muted ? '1' : '0');
    $('#btn-sound').textContent = app.muted ? '🔇' : '🔊';
    if (!app.muted) sfx.click();
  });
  $('#btn-sound').textContent = app.muted ? '🔇' : '🔊';

  $('#say-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#say-input');
    const text = input.value.trim();
    if (!text) return;
    send('hint', { text });
    input.value = '';
  });

  document.addEventListener('keydown', (event) => {
    if (document.documentElement.dataset.screen !== 'game') return;
    if (event.target.matches('input, textarea')) return;
    const state = app.state;
    if (!state || state.currentPlayerId !== state.you) return;
    if (event.key === 'Enter') send('solved');
    if (event.key === ' ') { event.preventDefault(); send('pass'); }
  });
}

function bootstrap() {
  store.load();
  renderHome();
  bind();
  loadCategories();

  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) {
    $('#code-input').value = roomParam.toUpperCase().slice(0, 4);
    history.replaceState({}, '', location.pathname);
  }

  if (app.session) {
    curtain(true, 'Rejoining your room…');
    connect();
    setTimeout(() => curtain(false), 6000);
  } else {
    document.documentElement.dataset.screen = 'home';
  }
}

bootstrap();
