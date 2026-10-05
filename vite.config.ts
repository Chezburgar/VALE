import { defineConfig } from 'vite';

// Vale is a static web app; the optional multiplayer server lives in server/.
// A relative base lets the same build run from the Vale server, a GitHub Pages
// subpath (/VALE/app/) and the desktop app's app:// protocol.
// In dev, /ws is proxied to that server so LAN matches work with `npm run dev` too.
export default defineConfig({
  base: './',
  build: {
    manifest: 'vale-manifest.json',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
