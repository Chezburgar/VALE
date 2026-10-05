// Vale desktop app: Electron main process.
//
// The built launcher (dist/) is served from the app:// protocol rather than
// file://, so ES module scripts, fetch() and the hash router behave exactly
// as they do on the web. The window can also host the LAN lobby server
// (server/lan.js), so friends on the network can join without a separate
// `npm start`.
//
//   npm run desktop        build, then run the desktop app
//   npm run desktop:dev    run against `npm run dev` (or set VALE_DEV_URL)

import { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } from 'electron';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_PORT, MIME, lanAddresses, startValeServer } from '../server/lan.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const SCHEME = 'app';
const HOST = 'vale';
const APP_ORIGIN = `${SCHEME}://${HOST}`;
const DEV_URL = process.env.VALE_DEV_URL || (process.argv.includes('--dev') ? 'http://localhost:5173/' : '');
const START_URL = DEV_URL || `${APP_ORIGIN}/index.html`;
const BG = '#05090b';
const FG = '#e6f3f1';
const TOPBAR_H = 60;
const isMac = process.platform === 'darwin';

// Vale's own pages. Inline styles are used throughout the launcher; WebAssembly
// and blob: workers/images are allowed for game asset decoders (e.g. glTF).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob: ws: wss: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;

// ---------------------------------------------------------------------------
// app:// protocol

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** @param {Request} request */
async function serveApp(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (rel.endsWith('/')) rel += 'index.html';
  // Resolve inside dist/ and refuse anything that escapes it (../, encoded
  // separators, absolute paths).
  let file = resolve(DIST, `.${rel}`);
  if (!file.startsWith(DIST + sep)) return new Response('Forbidden', { status: 403 });
  if (!(await isFile(file))) {
    // Unknown routes fall back to the app shell; missing files are 404s.
    if (extname(rel)) return new Response('Not found', { status: 404 });
    file = join(DIST, 'index.html');
  }
  const res = await net.fetch(pathToFileURL(file).toString());
  const ext = extname(file).toLowerCase();
  const headers = new Headers({ 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (ext === '.html') headers.set('Content-Security-Policy', CSP);
  return new Response(res.body, { status: res.status, headers });
}

// ---------------------------------------------------------------------------
// Navigation safety

function isAppUrl(url) {
  if (!url) return false;
  if (url.startsWith(`${APP_ORIGIN}/`)) return true;
  return Boolean(DEV_URL) && url.startsWith(new URL(DEV_URL).origin + '/');
}

function openExternal(url) {
  try {
    const { protocol: p } = new URL(url);
    if (p === 'https:' || p === 'http:' || p === 'mailto:') return shell.openExternal(url);
  } catch {
    /* not a URL */
  }
  return Promise.resolve();
}

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    openExternal(url);
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// ---------------------------------------------------------------------------
// LAN hosting

/** @type {import('../server/lan.js').ValeServer | null} */
let lan = null;
/** @type {Promise<unknown> | null} */
let lanBusy = null;
let lanError = '';

function lanStatus() {
  return {
    running: Boolean(lan),
    port: lan?.port ?? DEFAULT_PORT,
    addresses: lanAddresses(),
    ...(lanError ? { error: lanError } : {}),
  };
}

async function lanStart() {
  if (lan) return lanStatus();
  try {
    lan = await startValeServer({ port: DEFAULT_PORT, distDir: DIST, logger: { info: console.log, error: console.error } });
    lanError = '';
    console.log(`Vale LAN server listening on port ${lan.port}`);
  } catch (err) {
    lanError =
      err?.code === 'EADDRINUSE'
        ? `Port ${DEFAULT_PORT} is already in use. Is another Vale server running on this PC?`
        : `Could not start the server: ${err?.message ?? err}`;
  }
  return lanStatus();
}

async function lanStop() {
  const server = lan;
  lan = null;
  lanError = '';
  await server?.close();
  return lanStatus();
}

/** Serializes start/stop so double clicks can't race. */
function lanAction(fn) {
  const next = (lanBusy ?? Promise.resolve()).then(fn, fn);
  lanBusy = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// IPC (exposed to the page through electron/preload.cjs)

function trusted(event) {
  if (!isAppUrl(event.senderFrame?.url ?? '')) throw new Error('Blocked IPC from an untrusted page');
}

ipcMain.handle('vale:lan', (event, action) => {
  trusted(event);
  if (action === 'start') return lanAction(lanStart);
  if (action === 'stop') return lanAction(lanStop);
  return lanStatus();
});

ipcMain.handle('vale:open-external', (event, url) => {
  trusted(event);
  return openExternal(String(url));
});

ipcMain.handle('vale:fullscreen', (event, on) => {
  trusted(event);
  BrowserWindow.fromWebContents(event.sender)?.setFullScreen(Boolean(on));
});

// ---------------------------------------------------------------------------
// Window

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Vale',
    backgroundColor: BG,
    icon: join(DIST, 'icons', 'icon-512.png'),
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 20, y: TOPBAR_H / 2 - 8 } }
      : { titleBarOverlay: { color: BG, symbolColor: FG, height: TOPBAR_H } }),
    webPreferences: {
      preload: join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--vale-version=${app.getVersion()}`],
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (!app.isPackaged && (input.control || input.meta) && input.shift && key === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (!app.isPackaged && (input.control || input.meta) && key === 'r') {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadURL(START_URL);
  return win;
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// No default menu. macOS still gets the standard app/edit/window menus so
// Cmd+Q, Cmd+H and copy/paste keep working.
function setMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  if (process.platform === 'win32') app.setAppUserModelId('app.vale.launcher');

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) =>
      serveApp(request).catch((err) => {
        console.error(err);
        return new Response('Internal error', { status: 500 });
      }),
    );

    // Games only need pointer lock and fullscreen; refuse everything else
    // (camera, microphone, location, notifications...).
    const allowed = new Set(['pointerLock', 'keyboardLock', 'fullscreen', 'clipboard-sanitized-write']);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      callback(allowed.has(permission) && isAppUrl(wc.getURL()));
    });

    setMenu();
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
      else focusMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });

  app.on('before-quit', () => {
    lan?.close();
  });
}
