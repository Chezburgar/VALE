// Assembles the GitHub Pages site into site-dist/:
//   /            the download page (site/)
//   /app/        the built Vale web app (dist/)
//   /media, /brand, /icons, /fonts   art and self-hosted fonts for the page
//
//   npm run site            build the web app, then assemble
//   npm run site:assemble   assemble from an existing dist/
//
// CI (.github/workflows/desktop.yml) runs the same script before publishing.

import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'site-dist');
const FONTS = [
  ['rajdhani', 'rajdhani-latin-600-normal.woff2'],
  ['rajdhani', 'rajdhani-latin-700-normal.woff2'],
  ['inter', 'inter-latin-400-normal.woff2'],
  ['inter', 'inter-latin-500-normal.woff2'],
  ['inter', 'inter-latin-600-normal.woff2'],
];

const exists = (p) => stat(p).then(() => true, () => false);

if (!(await exists(join(DIST, 'index.html')))) {
  console.error('dist/ is missing. Run `npm run site` (or `npm run build` first).');
  process.exit(1);
}

const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// The page itself, with the version baked in (main.js refreshes it from the
// latest GitHub release at runtime).
const html = (await readFile(join(SITE, 'index.html'), 'utf8')).replaceAll('%VERSION%', version);
await writeFile(join(OUT, 'index.html'), html);
for (const file of ['style.css', 'main.js']) await cp(join(SITE, file), join(OUT, file));
await cp(join(SITE, 'media'), join(OUT, 'media'), { recursive: true });

// The Vale web app. Its base is relative, so it works from /VALE/app/.
await cp(DIST, join(OUT, 'app'), { recursive: true });

// Art and fonts for the download page.
await cp(join(ROOT, 'public', 'media', 'deadshot'), join(OUT, 'media', 'deadshot'), { recursive: true });
for (const f of ['vale-logo.png', 'vale-splash.png']) await cp(join(ROOT, 'public', 'brand', f), join(OUT, 'brand', f));
for (const f of ['icon-32.png', 'icon-180.png']) await cp(join(ROOT, 'public', 'icons', f), join(OUT, 'icons', f));
await mkdir(join(OUT, 'fonts'), { recursive: true });
for (const [pkg, file] of FONTS) await cp(join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file), join(OUT, 'fonts', file));

// GitHub Pages: serve files as-is (no Jekyll processing).
await writeFile(join(OUT, '.nojekyll'), '');

console.log(`Vale site v${version} assembled in ${relative(process.cwd(), OUT) || '.'}/ (download page + app/)`);
