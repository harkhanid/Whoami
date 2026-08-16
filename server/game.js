'use strict';

const crypto = require('crypto');
const { getCategory, publicCategories } = require('./categories');

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — easier to read out loud
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
/** How long a dropped player keeps holding up a round before we play on without them. */
const ABANDON_MS = Number(process.env.ABANDON_MS) || 60 * 1000;

const PLAYER_COLORS = ['#7c5cff', '#2dd4a7', '#f5a524', '#ff4d6d'];
const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐨', '🐧', '🦉', '🐝', '🦖', '🐳'];

/** @type {Map<string, Room>} */
const rooms = new Map();

/* ------------------------------------------------------------------ utils */

function randomInt(max) {
  return crypto.randomInt(max);
}

function makeId() {
  return crypto.randomBytes(8).toString('hex');
}

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || 'Player';
}

/* ------------------------------------------------------------------- room */

function createRoom(hostName, avatar) {
  const code = makeCode();
  const room = {
    code,
    phase: 'lobby',
    categoryId: null,
    turnSeconds: 60,
    players: [],
    hostId: null,
    turnOrder: [],
    turnIndex: 0,
    turnEndsAt: null,
    turnTimer: null,
    round: 1,
    feed: [],
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  const player = addPlayer(room, hostName, avatar);
  room.hostId = player.id;
  player.isHost = true;
  pushFeed(room, 'system', `${player.name} opened room ${code}`);
  return { room, player };
}

function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) || null;
}

function addPlayer(room, name, avatar) {
  const used = new Set(room.players.map((p) => p.color));
  const usedAvatars = new Set(room.players.map((p) => p.avatar));
  const player = {
    id: makeId(),
    token: makeId(),
    name: cleanName(name),
    avatar: AVATARS.includes(avatar) && !usedAvatars.has(avatar)
      ? avatar
      : AVATARS.find((a) => !usedAvatars.has(a)) || AVATARS[0],
    color: PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0],
    isHost: false,
    connected: true,
    disconnectedAt: null,
    character: null,
    solved: false,
    solvedAt: null,
    passes: 0
  };
  room.players.push(player);
  room.lastActivity = Date.now();
  return player;
}

function joinRoom(code, name, avatar) {
  const room = getRoom(code);
  if (!room) return { error: 'That room code does not exist.' };
  if (room.phase !== 'lobby') return { error: 'That game is already in progress.' };
  if (room.players.length >= MAX_PLAYERS) return { error: 'This room is full (4 players max).' };

  const player = addPlayer(room, name, avatar);
  pushFeed(room, 'join', `${player.name} joined the room`);
  return { room, player };
}

function rejoin(code, playerId, token) {
  const room = getRoom(code);
  if (!room) return { error: 'Room no longer exists.' };
  const player = room.players.find((p) => p.id === playerId && p.token === token);
  if (!player) return { error: 'Could not restore your seat.' };
  if (!player.connected && room.phase !== 'lobby') {
    pushFeed(room, 'join', `${player.name} reconnected`);
  }
  player.connected = true;
  player.disconnectedAt = null;
  room.lastActivity = Date.now();
  return { room, player };
}

function removePlayer(room, playerId) {
  const index = room.players.findIndex((p) => p.id === playerId);
  if (index === -1) return;
  const [gone] = room.players.splice(index, 1);
  pushFeed(room, 'leave', `${gone.name} left the game`);
  room.turnOrder = room.turnOrder.filter((id) => id !== playerId);

  if (room.hostId === playerId && room.players.length) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
    pushFeed(room, 'system', `${room.players[0].name} is now the host`);
  }

  if (room.phase === 'playing') {
    if (room.players.length < MIN_PLAYERS) {
      endGame(room, 'Not enough players left.');
    } else {
      if (room.turnIndex >= room.turnOrder.length) room.turnIndex = 0;
      startTurn(room);
    }
  }

  if (!room.players.length) rooms.delete(room.code);
  room.lastActivity = Date.now();
}

/** A seat is kept warm for a reconnect, but not forever. */
function isAbandoned(player) {
  return !player.connected && !!player.disconnectedAt && Date.now() - player.disconnectedAt > ABANDON_MS;
}

function markDisconnected(room, player) {
  player.connected = false;
  player.disconnectedAt = Date.now();
  room.lastActivity = Date.now();
}

function pushFeed(room, type, text) {
  room.feed.push({ id: makeId(), type, text, ts: Date.now() });
  if (room.feed.length > 40) room.feed.splice(0, room.feed.length - 40);
}

/* ------------------------------------------------------------- game phases */

function setCategory(room, categoryId) {
  if (room.phase !== 'lobby') return { error: 'The game already started.' };
  if (!getCategory(categoryId)) return { error: 'Unknown category.' };
  room.categoryId = categoryId;
  room.lastActivity = Date.now();
  return {};
}

function setTurnSeconds(room, seconds) {
  const allowed = [0, 30, 60, 90, 120];
  const value = Number(seconds);
  if (!allowed.includes(value)) return { error: 'Unsupported timer length.' };
  room.turnSeconds = value;
  if (room.phase === 'playing') startTurn(room, { keepPlayer: true });
  room.lastActivity = Date.now();
  return {};
}

function startGame(room, onTimeout) {
  if (room.phase === 'playing') return { error: 'Game already running.' };
  if (room.players.length < MIN_PLAYERS) return { error: 'You need at least 2 players.' };
  const category = getCategory(room.categoryId);
  if (!category) return { error: 'Pick a category first.' };

  const picks = shuffle(category.characters).slice(0, room.players.length);
  room.players.forEach((player, i) => {
    player.character = picks[i];
    player.solved = false;
    player.solvedAt = null;
    player.passes = 0;
  });

  room.phase = 'playing';
  room.turnOrder = shuffle(room.players.map((p) => p.id));
  room.turnIndex = 0;
  room.feed = [];
  room.onTimeout = onTimeout;
  pushFeed(room, 'system', `Round ${room.round} — ${category.emoji} ${category.name}`);
  startTurn(room);
  return {};
}

function currentPlayer(room) {
  const id = room.turnOrder[room.turnIndex];
  return room.players.find((p) => p.id === id) || null;
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function startTurn(room, { keepPlayer = false } = {}) {
  clearTurnTimer(room);
  if (room.phase !== 'playing') return;

  const active = room.turnOrder.filter((id) => {
    const p = room.players.find((x) => x.id === id);
    return p && !p.solved && !isAbandoned(p);
  });
  if (!active.length) {
    endGame(room, 'Everyone figured it out!');
    return;
  }

  if (!keepPlayer) {
    // Prefer someone who is still connected and hasn't solved; if everyone
    // eligible has dropped out, fall back to any unsolved player so the round
    // waits for them rather than deadlocking on an empty seat.
    const anyoneReachable = active.some((id) => {
      const p = room.players.find((x) => x.id === id);
      return p && p.connected;
    });
    const eligible = (p) => p && !p.solved && !isAbandoned(p) && (!anyoneReachable || p.connected);

    let guard = 0;
    while (guard < room.turnOrder.length) {
      const player = room.players.find((p) => p.id === room.turnOrder[room.turnIndex]);
      if (eligible(player)) break;
      room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
      guard += 1;
    }
  }

  const player = currentPlayer(room);
  if (!player) return;

  if (room.turnSeconds > 0) {
    room.turnEndsAt = Date.now() + room.turnSeconds * 1000;
    room.turnTimer = setTimeout(() => {
      room.turnTimer = null;
      pushFeed(room, 'timeout', `⏳ ${player.name} ran out of time`);
      nextTurn(room);
      if (typeof room.onTimeout === 'function') room.onTimeout(room);
    }, room.turnSeconds * 1000);
  } else {
    room.turnEndsAt = null;
  }
  room.lastActivity = Date.now();
}

function nextTurn(room) {
  if (room.phase !== 'playing') return;
  room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
  startTurn(room);
}

function passTurn(room, playerId) {
  const player = currentPlayer(room);
  if (!player || player.id !== playerId) return { error: 'It is not your turn.' };
  player.passes += 1;
  pushFeed(room, 'pass', `${player.name} passed the turn`);
  nextTurn(room);
  return {};
}

function markSolved(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || room.phase !== 'playing') return { error: 'Nothing to solve right now.' };
  if (player.solved) return { error: 'You already got yours.' };
  player.solved = true;
  player.solvedAt = Date.now();
  const place = room.players.filter((p) => p.solved).length;
  pushFeed(room, 'solve', `🎉 ${player.name} guessed “${player.character}” — #${place} to finish`);
  nextTurn(room);
  return { solved: true, character: player.character };
}

function endGame(room, reason) {
  clearTurnTimer(room);
  room.phase = 'ended';
  room.turnEndsAt = null;
  if (reason) pushFeed(room, 'system', reason);
  room.lastActivity = Date.now();
}

function restart(room) {
  clearTurnTimer(room);
  room.phase = 'lobby';
  room.turnEndsAt = null;
  room.turnOrder = [];
  room.turnIndex = 0;
  room.round += 1;
  room.feed = [];
  room.players.forEach((p) => {
    p.character = null;
    p.solved = false;
    p.solvedAt = null;
    p.passes = 0;
  });
  pushFeed(room, 'system', 'Back to the lobby — pick a category for the next round');
  room.lastActivity = Date.now();
  return {};
}

/* ----------------------------------------------------------- serialization */

/**
 * Build the view of the room for one specific player. A player never receives
 * their own character until they solve it or the round ends — that secret is
 * the entire game.
 */
function serializeFor(room, viewerId) {
  const revealed = room.phase === 'ended';
  const leaderboard = room.players
    .filter((p) => p.solved)
    .sort((a, b) => a.solvedAt - b.solvedAt)
    .map((p) => p.id);

  return {
    code: room.code,
    now: Date.now(), // lets clients correct for clock skew when rendering the turn timer
    phase: room.phase,
    round: room.round,
    categoryId: room.categoryId,
    category: room.categoryId ? summaryCategory(room.categoryId) : null,
    turnSeconds: room.turnSeconds,
    turnEndsAt: room.turnEndsAt,
    currentPlayerId: room.phase === 'playing' ? room.turnOrder[room.turnIndex] || null : null,
    hostId: room.hostId,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    youAreHost: room.hostId === viewerId,
    you: viewerId,
    feed: room.feed,
    leaderboard,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      isHost: p.id === room.hostId,
      connected: p.connected,
      solved: p.solved,
      passes: p.passes,
      place: p.solved ? leaderboard.indexOf(p.id) + 1 : null,
      isYou: p.id === viewerId,
      // Hidden from its owner mid-game; visible to everyone else, as if worn on the forehead.
      character: p.id === viewerId && !revealed && !p.solved ? null : p.character
    }))
  };
}

function summaryCategory(id) {
  const c = getCategory(id);
  if (!c) return null;
  return { id: c.id, name: c.name, emoji: c.emoji, blurb: c.blurb, accent: c.accent };
}

/* --------------------------------------------------------------- janitor */

function sweepRooms(onChange) {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyoneHere = room.players.some((p) => p.connected);

    if (!anyoneHere && now - room.lastActivity > EMPTY_ROOM_TTL_MS) {
      clearTurnTimer(room);
      rooms.delete(code);
      continue;
    }

    // A round parked on someone who has given up waiting: move it along.
    if (room.phase === 'playing') {
      const holder = currentPlayer(room);
      if (holder && isAbandoned(holder)) {
        pushFeed(room, 'system', `${holder.name} did not come back`);
        startTurn(room);
        if (typeof onChange === 'function') onChange(room);
      }
    }
  }
}

module.exports = {
  MAX_PLAYERS,
  MIN_PLAYERS,
  AVATARS,
  rooms,
  createRoom,
  getRoom,
  joinRoom,
  rejoin,
  removePlayer,
  markDisconnected,
  setCategory,
  setTurnSeconds,
  startGame,
  nextTurn,
  passTurn,
  markSolved,
  endGame,
  restart,
  serializeFor,
  sweepRooms,
  publicCategories,
  pushFeed
};
