// Vale LAN server: serves the built launcher (dist/) and hosts LAN lobbies for
// Deadshot over WebSockets at /ws. Used by the CLI (server/index.js) and by the
// desktop app, which can host lobbies from the player's own PC.
//
// Each client simulates its own player; the server relays movement and shots
// and is authoritative for health, kills, scores and the match clock.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';

export const DEFAULT_PORT = 8787;

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** Non-internal IPv4 addresses of this machine (what LAN friends connect to). */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// ---------------------------------------------------------------------------
// Lobby rules

const MODES = {
  ffa: { teams: false, scoreLimit: 25, timeLimit: 480, label: 'FFA' },
  tdm: { teams: true, scoreLimit: 50, timeLimit: 480, label: 'TDM' },
};
const MAPS = ['factory', 'refinery', 'snowfall', 'forest'];
const CLASSES = ['ar', 'smg', 'shotgun', 'sniper'];
const PARTS = ['head', 'body', 'legs'];
const MAX_PLAYERS = 12;
const RESPAWN_PROTECT_MS = 1500;
const REGEN_DELAY_MS = 4500;
const REGEN_PER_SEC = 32;
const RESTART_MS = 12000;

/**
 * @typedef {{ ws: import('ws').WebSocket, id: number, name: string, room: Room | null, team: 0 | 1,
 *   alive: boolean, hp: number, kills: number, deaths: number, score: number, assists: number,
 *   cls: string, tier: number, state: number[] | null, lastDamage: number, protectUntil: number,
 *   damageFrom: Map<number, { amount: number, time: number }> }} Client
 * @typedef {{ id: string, name: string, mode: 'ffa' | 'tdm', map: string, players: Map<number, Client>,
 *   teamScores: [number, number], startedAt: number, over: boolean, restartAt: number }} Room
 * @typedef {{ info(...args: unknown[]): void, error(...args: unknown[]): void }} Logger
 * @typedef {{ port: number, addresses: string[], close(): Promise<void> }} ValeServer
 */

function cleanText(v, max) {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Starts the Vale server. Every call gets its own lobbies, so the desktop app
 * can stop and restart hosting cleanly.
 *
 * @param {{ port?: number, distDir: string, logger?: Logger, host?: string }} options
 * @returns {Promise<ValeServer>}
 */
export function startValeServer({ port = DEFAULT_PORT, distDir, logger = { info: console.log, error: console.error }, host } = {}) {
  const DIST = resolve(distDir);

  // -------------------------------------------------------------------------
  // Static files

  async function serveStatic(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(join(DIST, rel));
    if (!file.startsWith(DIST + sep) && file !== DIST) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let target = file;
    try {
      const s = await stat(target);
      if (s.isDirectory()) target = join(target, 'index.html');
    } catch {
      // Unknown paths fall back to the app shell (hash routing lives client side).
      target = extname(rel) ? '' : join(DIST, 'index.html');
    }
    if (!target) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(target);
      const immutable = target.includes(`${sep}assets${sep}`);
      res.writeHead(200, {
        'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Vale has not been built yet. Run `npm run serve` (or `npm run build` then `npm start`).');
    }
  }

  const http = createServer((req, res) => {
    serveStatic(req, res).catch((err) => {
      logger.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  // -------------------------------------------------------------------------
  // Lobbies

  let nextPlayerId = 1;
  let nextRoomId = 1;
  /** @type {Set<Client>} */
  const clients = new Set();
  /** @type {Map<string, Room>} */
  const rooms = new Map();

  function send(c, msg) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  function broadcast(room, msg, except = null) {
    const data = JSON.stringify(msg);
    for (const p of room.players.values()) if (p !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }

  function roomList() {
    return [...rooms.values()].map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      map: r.map,
      players: r.players.size,
      max: MAX_PLAYERS,
    }));
  }

  function pushLobby() {
    const msg = { t: 'rooms', rooms: roomList() };
    for (const c of clients) if (!c.room) send(c, msg);
  }

  function playerInfo(p) {
    return { id: p.id, name: p.name, team: p.team, cls: p.cls, tier: p.tier, alive: p.alive, kills: p.kills, deaths: p.deaths, score: p.score, assists: p.assists };
  }

  function timeLeft(room) {
    return Math.max(0, MODES[room.mode].timeLimit - (Date.now() - room.startedAt) / 1000);
  }

  function resetStats(p) {
    Object.assign(p, { alive: false, hp: 100, kills: 0, deaths: 0, score: 0, assists: 0, state: null, lastDamage: 0, protectUntil: 0 });
    p.damageFrom.clear();
  }

  function joinRoom(c, room) {
    if (room.players.size >= MAX_PLAYERS) {
      send(c, { t: 'error', message: 'That lobby is full.' });
      return;
    }
    leaveRoom(c);
    resetStats(c);
    if (MODES[room.mode].teams) {
      let t0 = 0;
      let t1 = 0;
      for (const p of room.players.values()) p.team === 0 ? t0++ : t1++;
      c.team = t0 <= t1 ? 0 : 1;
    } else c.team = 0;
    c.room = room;
    room.players.set(c.id, c);
    const mode = MODES[room.mode];
    send(c, {
      t: 'joined',
      room: { id: room.id, name: room.name, mode: room.mode, map: room.map, scoreLimit: mode.scoreLimit, timeLimit: mode.timeLimit, timeLeft: timeLeft(room) },
      you: { id: c.id, team: c.team },
      players: [...room.players.values()].map(playerInfo),
    });
    broadcast(room, { t: 'player', p: playerInfo(c) }, c);
    broadcast(room, { t: 'chat', name: '', text: `${c.name} joined`, team: -1 }, c);
    pushLobby();
  }

  function leaveRoom(c) {
    const room = c.room;
    if (!room) return;
    room.players.delete(c.id);
    c.room = null;
    c.alive = false;
    broadcast(room, { t: 'left', id: c.id });
    if (room.players.size === 0) rooms.delete(room.id);
    pushLobby();
  }

  function createRoom(c, mode, map) {
    if (!MODES[mode] || !MAPS.includes(map)) {
      send(c, { t: 'error', message: 'Unknown mode or map.' });
      return;
    }
    const room = {
      id: String(nextRoomId++),
      name: `${c.name}'s ${MODES[mode].label}`,
      mode,
      map,
      players: new Map(),
      teamScores: [0, 0],
      startedAt: Date.now(),
      over: false,
      restartAt: 0,
    };
    rooms.set(room.id, room);
    joinRoom(c, room);
  }

  function kill(room, victim, killer, head, dist) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    const now = Date.now();
    for (const [id, d] of victim.damageFrom) {
      if (id === killer.id || now - d.time > 6000 || d.amount < 20) continue;
      const a = room.players.get(id);
      if (a) {
        a.assists++;
        a.score += 25;
      }
    }
    victim.damageFrom.clear();
    killer.kills++;
    killer.score += head ? 125 : 100;
    if (MODES[room.mode].teams) room.teamScores[killer.team]++;
    broadcast(room, { t: 'kill', killer: killer.id, victim: victim.id, head, cls: killer.cls, dist });
    checkEnd(room);
  }

  function checkEnd(room) {
    if (room.over) return;
    const mode = MODES[room.mode];
    let ended = timeLeft(room) <= 0;
    if (mode.teams) ended ||= room.teamScores.some((s) => s >= mode.scoreLimit);
    else ended ||= [...room.players.values()].some((p) => p.kills >= mode.scoreLimit);
    if (!ended) return;
    room.over = true;
    room.restartAt = Date.now() + RESTART_MS;
    sendScores(room);
    broadcast(room, { t: 'end', teams: room.teamScores });
  }

  function sendScores(room) {
    broadcast(room, {
      t: 'scores',
      teams: room.teamScores,
      timeLeft: timeLeft(room),
      players: [...room.players.values()].map((p) => [p.id, p.kills, p.deaths, p.score, p.assists]),
    });
  }

  function handle(c, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    const room = c.room;
    switch (msg.t) {
      case 'hello':
        c.name = cleanText(msg.name, 16) || `Player${c.id}`;
        send(c, { t: 'welcome', id: c.id, rooms: roomList() });
        break;
      case 'list':
        send(c, { t: 'rooms', rooms: roomList() });
        break;
      case 'create':
        createRoom(c, msg.mode, msg.map);
        break;
      case 'join': {
        const r = rooms.get(String(msg.room));
        if (r) joinRoom(c, r);
        else send(c, { t: 'error', message: 'That lobby no longer exists.' });
        break;
      }
      case 'leave':
        leaveRoom(c);
        break;
      case 'state':
        if (room && Array.isArray(msg.s) && msg.s.length === 12 && msg.s.every(finite)) c.state = msg.s;
        break;
      case 'spawned':
        if (!room || room.over) break;
        c.alive = true;
        c.hp = 100;
        c.protectUntil = Date.now() + RESPAWN_PROTECT_MS;
        if (CLASSES.includes(msg.cls)) c.cls = msg.cls;
        if (Number.isInteger(msg.tier) && msg.tier >= 0 && msg.tier <= 3) c.tier = msg.tier;
        if ([msg.x, msg.y, msg.z].every(finite)) broadcast(room, { t: 'spawned', id: c.id, x: msg.x, y: msg.y, z: msg.z }, c);
        broadcast(room, { t: 'player', p: playerInfo(c) }, c);
        break;
      case 'shot': {
        if (!room || !c.alive || !Array.isArray(msg.o) || !Array.isArray(msg.e) || msg.e.length > 13) break;
        if (!msg.o.every(finite) || !msg.e.every((e) => Array.isArray(e) && e.length === 7 && e.every(finite))) break;
        broadcast(room, { t: 'shot', id: c.id, c: msg.c, o: msg.o, e: msg.e }, c);
        break;
      }
      case 'hit': {
        if (!room || room.over || !c.alive) break;
        const victim = room.players.get(msg.victim);
        if (!victim || victim === c || !victim.alive) break;
        if (MODES[room.mode].teams && victim.team === c.team) break;
        const now = Date.now();
        if (now < victim.protectUntil) break;
        const dmg = Math.max(0, Math.min(250, Math.round(Number(msg.dmg) || 0)));
        if (!dmg) break;
        c.protectUntil = 0;
        victim.hp -= dmg;
        victim.lastDamage = now;
        const prev = victim.damageFrom.get(c.id);
        victim.damageFrom.set(c.id, { amount: (prev?.amount ?? 0) + dmg, time: now });
        const part = Math.max(0, PARTS.indexOf(msg.part));
        broadcast(room, { t: 'damage', att: c.id, vic: victim.id, dmg, part, hp: Math.max(0, victim.hp) });
        if (victim.hp <= 0) kill(room, victim, c, Boolean(msg.head), Math.round(Number(msg.dist) || 0));
        break;
      }
      case 'chat': {
        const text = cleanText(msg.text, 120);
        if (room && text) broadcast(room, { t: 'chat', name: c.name, text, team: MODES[room.mode].teams ? c.team : -1 });
        break;
      }
    }
  }

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  // ws re-emits the HTTP server's errors (e.g. EADDRINUSE); they are handled on
  // the server itself below, and an unhandled 'error' here would throw.
  wss.on('error', () => {});

  wss.on('connection', (ws) => {
    /** @type {Client} */
    const c = {
      ws,
      id: nextPlayerId++,
      name: 'Player',
      room: null,
      team: 0,
      alive: false,
      hp: 100,
      kills: 0,
      deaths: 0,
      score: 0,
      assists: 0,
      cls: 'ar',
      tier: 0,
      state: null,
      lastDamage: 0,
      protectUntil: 0,
      damageFrom: new Map(),
    };
    clients.add(c);
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data) => {
      try {
        handle(c, JSON.parse(String(data)));
      } catch {
        /* ignore malformed input */
      }
    });
    ws.on('close', () => {
      leaveRoom(c);
      clients.delete(c);
    });
  });

  // Drop dead connections.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 15000);

  // Simulation tick: movement relay, regen, clock.
  let tick = 0;
  const sim = setInterval(() => {
    tick++;
    const now = Date.now();
    for (const room of rooms.values()) {
      const list = [];
      for (const p of room.players.values()) {
        if (p.state) list.push([p.id, ...p.state]);
        if (p.alive && p.hp < 100 && now - p.lastDamage > REGEN_DELAY_MS) p.hp = Math.min(100, p.hp + REGEN_PER_SEC / 20);
      }
      if (list.length) broadcast(room, { t: 'states', list });
      if (tick % 20 === 0) {
        if (!room.over) {
          sendScores(room);
          checkEnd(room);
        }
      }
      if (room.over && now >= room.restartAt) {
        room.over = false;
        room.teamScores = [0, 0];
        room.startedAt = now;
        for (const p of room.players.values()) resetStats(p);
        broadcast(room, { t: 'restart' });
      }
    }
  }, 50);

  const stopTimers = () => {
    clearInterval(heartbeat);
    clearInterval(sim);
  };

  return new Promise((resolvePromise, reject) => {
    const onError = (err) => {
      stopTimers();
      wss.close();
      reject(err);
    };
    http.once('error', onError);
    http.listen(port, host, () => {
      http.off('error', onError);
      http.on('error', (err) => logger.error(err));
      const actualPort = /** @type {import('node:net').AddressInfo} */ (http.address()).port;
      let closed = null;
      resolvePromise({
        port: actualPort,
        addresses: lanAddresses(),
        close() {
          closed ??= new Promise((done) => {
            stopTimers();
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            http.closeAllConnections?.();
            http.close(() => done());
          });
          return closed;
        },
      });
    });
  });
}
