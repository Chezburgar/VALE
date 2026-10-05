// Vale server CLI: serves the built launcher (dist/) and hosts LAN lobbies for
// Deadshot over WebSockets at /ws. The server itself lives in lan.js so the
// desktop app can host lobbies too.
//
//   npm run serve        build + start
//   npm start            start (expects an existing build)
//   PORT=9000 npm start  custom port

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, startValeServer } from './lan.js';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const server = await startValeServer({ port, distDir });
  console.log(`\n  Vale server running on port ${server.port}\n`);
  console.log(`  This PC:      http://localhost:${server.port}`);
  for (const a of server.addresses) console.log(`  On your LAN:  http://${a}:${server.port}   (Deadshot → Online: ws://${a}:${server.port}/ws)`);
  console.log('');
  const shutdown = () => server.close().then(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (err) {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Try PORT=9000 npm start.` : err);
  process.exit(1);
}
