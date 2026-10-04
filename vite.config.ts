import { defineConfig } from 'vite';

// Vale is a static web app; the optional multiplayer server lives in server/.
// In dev, /ws is proxied to that server so LAN matches work with `npm run dev` too.
export default defineConfig({
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
