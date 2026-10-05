# Vale

Vale is a PC game store and launcher that runs in the browser and installs as a desktop app. Its first game is **Deadshot.io — Vale Edition**, a from-scratch recreation of the Deadshot.io arena shooter that runs natively inside Vale. It is not an embed.

## Quick start

```bash
npm install
npm run dev          # launcher + game with hot reload at http://localhost:5173
```

To play over LAN, or to run Vale as one self-contained server:

```bash
npm run serve        # builds, then serves Vale and the multiplayer lobby on :8787
```

The server prints its LAN address. Anyone on the network can open `http://<that-ip>:8787`. In Deadshot, go to **Play → Online · LAN**, connect, then host or join a lobby.

`npm run dev` and `npm run serve` can run together: the dev server proxies `/ws` to the game server on port 8787.

### Install as a desktop app

Vale is a PWA. In Chrome or Edge, use the install icon in the address bar, or **Settings → Vale app → Install app** inside Vale. Vale then opens in its own window with a desktop and Start-menu icon.

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
server/index.js                static server + WebSocket lobbies
public/sw.js                   offline support for installed games
scripts/                       headless checks (see below)
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
