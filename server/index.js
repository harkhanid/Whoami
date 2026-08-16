'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const game = require('./game');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/api/categories', (_req, res) => res.json(game.publicCategories()));
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: game.rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** playerId -> live socket */
const sockets = new Map();

function send(ws, type, payload) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...payload }));
}

function fail(ws, message) {
  send(ws, 'error', { message });
}

function broadcast(room) {
  if (!room) return;
  for (const player of room.players) {
    const ws = sockets.get(player.id);
    if (ws) send(ws, 'state', { state: game.serializeFor(room, player.id) });
  }
}

function broadcastEvent(room, type, payload) {
  for (const player of room.players) send(sockets.get(player.id), type, payload);
}

function requireSeat(ws) {
  const meta = ws.meta;
  if (!meta) return null;
  const room = game.getRoom(meta.code);
  if (!room) return null;
  const player = room.players.find((p) => p.id === meta.playerId);
  if (!player) return null;
  return { room, player };
}

function seat(ws, room, player) {
  const previous = sockets.get(player.id);
  if (previous && previous !== ws) {
    send(previous, 'kicked', { message: 'You opened this seat in another tab.' });
    previous.meta = null;
    previous.close();
  }
  ws.meta = { code: room.code, playerId: player.id };
  sockets.set(player.id, ws);
  send(ws, 'seated', {
    code: room.code,
    playerId: player.id,
    token: player.token,
    state: game.serializeFor(room, player.id)
  });
}

const handlers = {
  create(ws, msg) {
    const { room, player } = game.createRoom(msg.name, msg.avatar);
    seat(ws, room, player);
  },

  join(ws, msg) {
    const result = game.joinRoom(msg.code, msg.name, msg.avatar);
    if (result.error) return fail(ws, result.error);
    seat(ws, result.room, result.player);
    broadcast(result.room);
  },

  rejoin(ws, msg) {
    const result = game.rejoin(msg.code, msg.playerId, msg.token);
    if (result.error) return send(ws, 'rejoin-failed', { message: result.error });
    seat(ws, result.room, result.player);
    broadcast(result.room);
  },

  category(ws, msg) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    if (s.room.hostId !== s.player.id) return fail(ws, 'Only the host can change the category.');
    const result = game.setCategory(s.room, msg.categoryId);
    if (result.error) return fail(ws, result.error);
    broadcast(s.room);
  },

  timer(ws, msg) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    if (s.room.hostId !== s.player.id) return fail(ws, 'Only the host can change the timer.');
    const result = game.setTurnSeconds(s.room, msg.seconds);
    if (result.error) return fail(ws, result.error);
    broadcast(s.room);
  },

  start(ws) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    if (s.room.hostId !== s.player.id) return fail(ws, 'Only the host can start the game.');
    const result = game.startGame(s.room, broadcast);
    if (result.error) return fail(ws, result.error);
    broadcastEvent(s.room, 'dealt', {});
    broadcast(s.room);
  },

  pass(ws) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    const result = game.passTurn(s.room, s.player.id);
    if (result.error) return fail(ws, result.error);
    broadcast(s.room);
  },

  solved(ws) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    const result = game.markSolved(s.room, s.player.id);
    if (result.error) return fail(ws, result.error);
    broadcastEvent(s.room, 'celebrate', { playerId: s.player.id, character: result.character });
    broadcast(s.room);
  },

  reveal(ws) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    if (s.room.hostId !== s.player.id) return fail(ws, 'Only the host can end the round.');
    game.endGame(s.room, 'The host revealed every card.');
    broadcast(s.room);
  },

  restart(ws) {
    const s = requireSeat(ws);
    if (!s) return fail(ws, 'You are not in a room.');
    if (s.room.hostId !== s.player.id) return fail(ws, 'Only the host can start a new round.');
    game.restart(s.room);
    broadcast(s.room);
  },

  react(ws, msg) {
    const s = requireSeat(ws);
    if (!s) return;
    const allowed = ['👍', '👎', '🤔', '😂', '🔥', '❓'];
    if (!allowed.includes(msg.emoji)) return;
    broadcastEvent(s.room, 'reaction', {
      emoji: msg.emoji,
      from: s.player.id,
      name: s.player.name
    });
  },

  hint(ws, msg) {
    const s = requireSeat(ws);
    if (!s) return;
    const text = String(msg.text || '').slice(0, 120).trim();
    if (!text) return;
    game.pushFeed(s.room, 'chat', `${s.player.name}: ${text}`);
    broadcast(s.room);
  },

  leave(ws) {
    const s = requireSeat(ws);
    if (!s) return;
    sockets.delete(s.player.id);
    ws.meta = null;
    game.removePlayer(s.room, s.player.id);
    broadcast(s.room);
  }
};

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return fail(ws, 'Malformed message.');
    }
    const handler = handlers[msg && msg.type];
    if (!handler) return fail(ws, 'Unknown action.');
    try {
      handler(ws, msg);
    } catch (err) {
      console.error('handler error', msg.type, err);
      fail(ws, 'Something went wrong on the server.');
    }
  });

  ws.on('close', () => {
    const meta = ws.meta;
    if (!meta) return;
    if (sockets.get(meta.playerId) === ws) sockets.delete(meta.playerId);
    const room = game.getRoom(meta.code);
    if (!room) return;
    const player = room.players.find((p) => p.id === meta.playerId);
    if (!player) return;
    game.markDisconnected(room, player);

    if (room.phase === 'lobby') {
      // Nothing at stake yet — free the seat right away.
      game.removePlayer(room, player.id);
    } else {
      game.pushFeed(room, 'system', `${player.name} disconnected`);
      // Don't let a dropped player hold the turn hostage — especially with the timer off.
      if (room.turnOrder[room.turnIndex] === player.id) game.nextTurn(room);
    }
    broadcast(room);
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
  game.sweepRooms(broadcast);
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log(`\n  🎭  Who Am I?  —  http://localhost:${PORT}`);
  console.log(`      share on your network: http://${localAddress()}:${PORT}\n`);
});

function localAddress() {
  const nets = require('os').networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
