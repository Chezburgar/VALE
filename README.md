# Vale

Vale is a PC game store and launcher for Windows, macOS and Linux. It also runs in the browser. Its first game is **Deadshot.io — Vale Edition**, a from-scratch recreation of the Deadshot.io arena shooter that runs natively inside Vale. It is not an embed.

**Download:** [chezburgar.github.io/VALE](https://chezburgar.github.io/VALE/) · **Play in the browser:** [chezburgar.github.io/VALE/app](https://chezburgar.github.io/VALE/app/)

| Platform | Installer |
|---|---|
| Windows 10/11 (64-bit) | [`Vale-Setup.exe`](https://github.com/Chezburgar/VALE/releases/latest/download/Vale-Setup.exe) |
| macOS 12+ (Apple silicon and Intel) | [`Vale.dmg`](https://github.com/Chezburgar/VALE/releases/latest/download/Vale.dmg) |
| Linux (64-bit) | [`Vale.AppImage`](https://github.com/Chezburgar/VALE/releases/latest/download/Vale.AppImage) · [`vale.deb`](https://github.com/Chezburgar/VALE/releases/latest/download/vale.deb) |

The installers aren't code-signed yet. On Windows, click **More info → Run anyway** on the SmartScreen prompt. On macOS, right-click Vale and choose **Open** the first time (or run `xattr -cr /Applications/Vale.app`).

## Quick start (development)

```bash
npm install
npm run dev          # launcher + game with hot reload at http://localhost:5173
npm run desktop:dev  # the desktop app, loading the running dev server
npm run desktop      # build, then run the desktop app from dist/
```

`npm run desktop:dev` loads `http://localhost:5173/`. Set `VALE_DEV_URL` to load a different dev URL.

## LAN play

One PC hosts the lobby server and everyone on the same network connects to it. There are two ways to host:

- **Desktop app:** open **Settings → Desktop** and turn on **Host LAN games from this PC**. Vale starts its built-in server on port 8787 and lists the addresses friends should use. The setting is remembered, so hosting resumes the next time Vale opens.
- **Command line:** `npm run serve` builds Vale, then serves it and the lobby server on port 8787. `npm start` serves an existing build, and `PORT=9000 npm start` picks another port.

In Deadshot, go to **Play → Online · LAN** and connect to `ws://<host-ip>:8787/ws`. On the host PC itself, use `ws://localhost:8787/ws`. Friends without the app can open `http://<host-ip>:8787` in a browser.

Browsers block `ws://` connections from https pages, so the GitHub Pages version can't join lobbies on other PCs. Use the desktop app, or the host's `http://` address.

`npm run dev` and `npm run serve` can run together: the dev server proxies `/ws` to the game server on port 8787.

## Desktop app

The desktop app is an Electron shell around the same build as the web version:

- `dist/` is served from a privileged `app://vale/` protocol rather than `file://`, so module scripts, `fetch` and the hash router behave exactly as they do on the web. Requests that resolve outside `dist/` are refused.
- The renderer is sandboxed, with context isolation on, Node integration off, web security on and a strict CSP. The preload (`electron/preload.cjs`) exposes a small `window.valeDesktop` bridge: app version and platform, LAN server start/stop/status, opening external links, and fullscreen.
- `window.open` is denied and http(s) links open in the system browser. Only one instance can run at a time. There is no menu bar. `F11` toggles fullscreen, and `Ctrl+Shift+I` opens DevTools in unpackaged builds only.
- The window uses Vale's 60 px top bar as its title bar. The window controls are overlaid on the right on Windows and Linux, and the traffic lights are inset on the left on macOS.
- The LAN server (`server/lan.js`) runs inside the app, serving `dist/` straight from the app archive.
- Games launch in fullscreen by default. Turn this off under **Settings → Desktop**.

### Building installers locally

```bash
npm run dist         # installers for the current OS, written to release/
npm run dist:win     # Vale-Setup.exe (NSIS, needs Windows or Wine)
npm run dist:mac     # Vale.dmg (universal; needs macOS)
npm run dist:linux   # Vale.AppImage and vale.deb
npx electron-builder --linux --dir   # unpacked app in release/linux-unpacked, quickest to test
```

The packaging config is in the `build` field of `package.json`. Artifact names don't include the version, so `releases/latest/download/<name>` links always point to the newest build. The Windows installer is assisted: you can choose the install folder, and it creates desktop and Start-menu shortcuts. Icons and NSIS artwork live in `build/`. To regenerate them from `public/` art (needs Python with Pillow):

```bash
python3 build/make-resources.py
```

### Releases and GitHub Pages

`.github/workflows/desktop.yml` runs on every push to `claude/eloquent-pasteur-145due` (except docs-only changes), on `v*` tags, and when triggered manually:

1. **build:** Windows, macOS and Linux runners each run `npm ci`, `npm run build` and `electron-builder`, then upload the installers as workflow artifacts.
2. **release:** creates or updates the GitHub Release `v<package.json version>` (or the pushed tag), marks it as latest, and replaces its installers.
3. **pages:** runs `npm run site` and publishes `site-dist/` to the `gh-pages` branch. The download page is at the root and the browser version of Vale is under `app/`.

To ship a new version, bump `version` in `package.json` and push, or push a `v1.2.3` tag.

**One-time setup:** in the repository on GitHub, open **Settings → Pages → Build and deployment**. Set **Source** to *Deploy from a branch*, then choose `gh-pages` and `/ (root)`. The site goes live at https://chezburgar.github.io/VALE/ after the first successful run.

### Download page

The page lives in `site/` (`index.html`, `style.css`, `main.js`). It detects the visitor's OS to highlight the right installer, and reads the latest release's version and file sizes from the GitHub API. To preview it locally:

```bash
npm run site                         # build the web app + assemble site-dist/
python3 -m http.server -d site-dist 8080
```

The web build uses a relative base (`./`), so the same `dist/` works at a subpath like `/VALE/app/`, from the Vale server, and inside the desktop app.

### Install as a PWA

In Chrome or Edge, the browser version can also be installed as a PWA. Use the install icon in the address bar, or go to **Settings → Vale app → Install app** inside Vale.

## What's in Vale

| | |
|---|---|
| **Startup screen** | The Vale key art with a loading bar. Click or press a key to skip. |
| **Store** | Featured hero carousel, game cards, genre browsing and search. |
| **Game page** | Gallery, description, features, classes, modes and maps, controls, achievements, system requirements. |
| **Install / uninstall** | Downloads the game's code and media into Cache Storage. The service worker serves installed games from there, so they launch offline. Uninstalling deletes that cache. |
| **Library** | Play button, play time, last played, career stats (K/D, accuracy, headshot %, kills by class) and achievements. |
| **Settings** | Profile name and colour, sensitivity, FOV, toggle-aim, invert-Y, graphics quality, FPS counter, volume. Settings are shared with games. |
| **In-game overlay** | Press `Shift+Tab` while playing for the session timer, achievements, controls and *Exit to Vale*. |
| **Achievements** | Toasts appear when you unlock them in-game. They also feed your Vale level. |

## Deadshot.io — Vale Edition

A Three.js arena FPS built for Vale:

- **Four classes**, following the original's published stats: Assault Rifle (30 rounds), SMG (40 rounds, 1.5 s reload), Shotgun (2 shells × 13 pellets, 1.6 s reload), bolt-action Sniper (3 rounds, 100 damage, headshots always kill).
- **Movement:** sliding (`Shift` while running), jump-sliding, air strafing, crouching and stair stepping.
- **Five modes:** Free-for-All, Team Deathmatch, Kill Confirmed, Domination and Hardpoint.
- **Four maps:** Factory, Refinery, Snowfall and Forest. Each is authored as one half and mirrored, so team layouts are fair.
- **Bots** with four difficulties. They path-find on a navigation grid generated from the map geometry (stairs, jump links and drops), play objectives, strafe, slide, react to gunfire and damage, and their aim error depends on difficulty.
- **Weapon finishes:** Gray, Blue, Purple and Gold unlock per class at 25, 100 and 250 kills.
- **Effects and HUD:** tracers, muzzle flashes, impact sparks and decals, hitmarkers (gold for headshots), damage direction arcs, killfeed, medals, minimap, scoreboard (`Tab`), chat (`Enter`), sniper scope and death cam.
- **Synthesized audio:** every gunshot, reload, footstep (per surface), hitmarker and the ambience is generated with WebAudio, so the game ships no sound files.
- **LAN multiplayer** through the Vale server, which is authoritative for health, kills, scores and the match clock.

Controls: `WASD` move · mouse aim · `LMB` shoot · `RMB`/`L` aim · `Space` jump · `Shift` crouch/slide · `R` reload · `1–4` class for your next spawn · `Tab` scores · `Enter` chat · `Esc`/`~` menu.

> This is an independent fan recreation. It is not affiliated with or endorsed by the creators of Deadshot.io, and it uses none of the original game's code or assets.

### Models

The soldier and the four guns are low-poly GLB files in `src/games/deadshot/assets/models/` (about 1.6 MB together). They were optimized from the 2048² sources: base colour textures resized to 1024² JPEG, the flat normal maps dropped, gun metal/roughness maps at 512² and constant factors for the soldier. `render/models.ts` preloads them behind the loading screen (Vite `?url` imports, so they are hashed and cached by the Vale installer) and shares their geometry, textures and clips between every character and gun.

- **Characters** (`render/character.ts`) are skinned clones of the Mixamo rig. Running, back-pedalling and strafing (the strafe clip mirrored for the right) drive only the legs, blended by velocity in the actor's frame; the upper body holds a rifle pose aimed with the spine and shoulders. Idle, crouch, slide and leg placement are procedural (two-bone IK), the left hand is solved onto the fore-grip, and deaths pick one of three clips from the direction of the killing shot. Team colour is a tint on a per-character material over the camo.
- **Guns** (`render/guns.ts`) are placed from per-gun measurements in `GUN_SPECS` (muzzle, grip, fore-grip, sight line, magazine), so the same model serves the view model, characters and loadout previews. Finishes are material variants of the texture; PBR materials get a `RoomEnvironment` map while the world keeps its Lambert look.
- **View model** (`render/viewmodel.ts`) uses the soldier's own arms cut from the skinned mesh, with the hands placed on the grip and fore-grip, and cuts a see-through hole in red-dot optics while aiming.

If the files fail to load, the game falls back to the procedural blocky soldier and primitive guns.

## Project layout

```
index.html, src/main.ts        launcher entry
src/vale/                      launcher: store, library, settings, runner, installer
src/games/types.ts             contract between Vale and its games
src/games/deadshot/            the game (lazy-loaded chunk)
  config.ts                    weapons, modes, maps, difficulty tuning
  world.ts                     AABB collision world, character controller, raycasts
  maps/                        map builder + the four maps
  navgrid.ts                   auto-generated bot navigation grid + A*
  actor.ts, bot.ts, sim.ts     players, bot AI, headless simulation step
  match.ts                     modes, hit detection, damage, scoring, spawns
  render/                      world meshes, sky, characters, guns, view model, effects
  assets/models/               optimized GLB soldier and guns (see Models above)
  hud.ts, menu.ts, audio.ts    UI and sound
  net.ts                       LAN client
server/lan.js                  static server + WebSocket lobbies (shared by CLI and desktop app)
server/index.js                `npm start` CLI
electron/                      desktop app: main process + sandboxed preload
build/                         app icons and installer artwork (+ make-resources.py)
site/                          GitHub Pages download page (+ build.mjs, which assembles site-dist/)
public/sw.js                   offline support for installed games (web only)
scripts/                       headless checks (see below)
.github/workflows/desktop.yml  installers, GitHub Release and Pages deploy
```

### Adding a game to Vale

Add an entry to `CATALOG` in `src/vale/catalog.ts` whose `load()` dynamically imports a module implementing `GameModule` from `src/games/types.ts`. Vale handles installing, launching, the overlay, stats and achievements.

## Checks

```bash
npm run typecheck    # TypeScript
npm run build        # production build
npm run check:maps   # every spawn/objective is clear and reachable on the bot nav grid
npm run sim -- ffa factory 60   # headless 8-bot match: kills, accuracy, map coverage
```
