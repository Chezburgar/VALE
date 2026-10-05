// Vale desktop preload. Runs sandboxed (hence CommonJS) and exposes a small,
// typed bridge as window.valeDesktop (see src/vale/env.ts). The page never
// gets Node or Electron APIs directly.

const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--vale-version='));
const version = versionArg ? versionArg.slice('--vale-version='.length) : '';
const platform = process.platform;

contextBridge.exposeInMainWorld('valeDesktop', {
  version,
  platform,
  lan: {
    start: () => ipcRenderer.invoke('vale:lan', 'start'),
    stop: () => ipcRenderer.invoke('vale:lan', 'stop'),
    status: () => ipcRenderer.invoke('vale:lan', 'status'),
  },
  openExternal: (url) => ipcRenderer.invoke('vale:open-external', String(url)),
  setFullscreen: (on) => ipcRenderer.invoke('vale:fullscreen', Boolean(on)),
});

// Lets styles.css make room for the window controls in Vale's top bar.
function markBody() {
  document.body.classList.add('is-desktop', `platform-${platform}`);
}
if (document.body) markBody();
else window.addEventListener('DOMContentLoaded', markBody, { once: true });
