import * as THREE from 'three';
import type { GameContext, ValeSettings } from '../types';
import { Actor } from './actor';
import { GameAudio, type Surface } from './audio';
import { CLASS_ORDER, MAP_INFO, MAP_ORDER, MODES, PLAYER, TIERS, WEAPONS, type ClassId, type MapId, type Tier } from './config';
import { Hud } from './hud';
import { Input } from './input';
import { getMap } from './maps';
import { FLAG_RADIUS, HP_RADIUS, Match, type MatchEvent, type MatchSettings } from './match';
import { defaultProgress, Menu, type Progress } from './menu';
import { NetClient } from './net';
import { CharacterModel } from './render/character';
import { Effects } from './render/effects';
import { buildGun } from './render/guns';
import { ViewModel } from './render/viewmodel';
import { buildWorld, type WorldVisuals } from './render/worldmesh';
import { disposeTextures } from './render/textures';
import { Simulation } from './sim';
import type { MatId } from './world';

type State = 'menu' | 'playing' | 'paused' | 'ended';

const SURFACE: Partial<Record<MatId, Surface>> = {
  metal: 'metal',
  wood: 'wood',
  crate: 'wood',
  bark: 'wood',
  snow: 'snow',
  grass: 'grass',
  dirt: 'dirt',
  leaves: 'grass',
};

const BASE_SENS = 0.0022;

export class Game {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 1200);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private ambient = new THREE.AmbientLight(0xffffff, 0.5);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2);
  private worldVis: WorldVisuals | null = null;
  private worldMap: MapId | null = null;
  private effects: Effects;
  private vm = new ViewModel();
  private chars = new Map<number, CharacterModel>();
  private audio: GameAudio;
  private input: Input;
  private hud: Hud;
  private menu: Menu;
  private progress: Progress;
  private settings: ValeSettings;
  match: Match | null = null;
  private sim: Simulation | null = null;
  local: Actor | null = null;
  private state: State = 'menu';
  private raf = 0;
  private last = 0;
  private fps = 60;
  private menuT = 0;
  private menuMap: MapId;
  private eyeSmooth = PLAYER.eyeStand;
  private camShake = 0;
  private deathInfo: { killer: Actor | null; weapon: ClassId; headshot: boolean; distance: number } | null = null;
  private stepAccum = new Map<number, number>();
  private aimedEnemy: { actor: Actor; until: number } | null = null;
  private adsToggled = false;
  private matchStartReal = 0;
  private unsub: (() => void) | null = null;
  private resizeObs: ResizeObserver;
  private disposed = false;
  private net: NetClient | null = null;
  private online = false;
  private netSendTimer = 0;
  private tabHeld = false;
  private shotCounter = 0;
  private respawnRequested = false;
  private tmpV = new THREE.Vector3();
  private gunCache = new Map<string, string>();
  /** Test hook: forced input merged over the keyboard/mouse each frame. */
  debugInput: Partial<Actor['input']> | null = null;
  /** Test hook: free camera with HUD and weapon hidden (used for store screenshots). */
  photoCam: { pos: [number, number, number]; target: [number, number, number]; fov?: number } | null = null;

  constructor(
    container: HTMLElement,
    private ctx: GameContext,
  ) {
    this.settings = { ...ctx.settings };
    this.progress = ctx.loadProgress(defaultProgress(ctx.defaultServerUrl));
    // Older saves may miss keys
    this.progress = { ...defaultProgress(ctx.defaultServerUrl), ...this.progress, prefs: { ...defaultProgress('').prefs, ...this.progress.prefs } };
    this.menuMap = this.progress.prefs.map;

    this.root = document.createElement('div');
    this.root.className = 'ds-root';
    container.append(this.root);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ds-canvas';
    this.root.append(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality();

    this.scene.add(this.hemi, this.ambient, this.sun, this.sun.target, this.muzzleLight, this.camera);
    this.effects = new Effects(this.scene);

    this.audio = new GameAudio(this.settings.masterVolume, this.settings.musicVolume);
    this.input = new Input(this.canvas);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onKey = (code, e) => this.onKey(code, e);

    this.hud = new Hud(this.root);
    this.hud.show(false);
    this.hud.onChat = (text) => this.sendChat(text);
    this.hud.onChatClosed = () => {
      this.input.enabled = true;
    };

    this.menu = new Menu(this.root, this.progress, this.settings, ctx.playerName, {
      play: () => this.startOffline(),
      exit: () => this.ctx.exit(),
      progressChanged: () => this.saveProgress(),
      settingsChanged: (patch) => this.ctx.updateSettings(patch),
      previewMap: (m) => {
        this.menuMap = m;
        this.loadWorld(m);
      },
      gunPreview: (c, t) => this.gunPreview(c, t),
      resume: () => this.resume(),
      leave: () => this.leaveMatch(),
      respawnClass: (c) => {
        if (this.local) this.local.nextClass = c;
      },
      lanConnect: (url) => this.lanConnect(url),
      lanCreate: (mode, map) => this.net?.send({ t: 'create', mode, map }),
      lanJoin: (id) => this.net?.send({ t: 'join', room: id }),
      lanDisconnect: () => this.lanDisconnect(),
      playAgain: () => this.playAgain(),
      hover: () => this.audio.ui('hover'),
      click: () => {
        this.audio.resume();
        this.audio.ui('click');
      },
    });

    this.root.addEventListener('pointerdown', () => this.audio.resume());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
      if (this.local && !this.local.alive) this.respawnRequested = true;
    });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.root);
    this.resize();
    this.loadWorld(this.menuMap);
    this.audio.menuMusic(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));

    (window as unknown as { __deadshot: Game }).__deadshot = this;
  }

  // ---------------------------------------------------------------------------
  // Setup

  private applyQuality(): void {
    const q = this.settings.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.25 : 0.85);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  private resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loadWorld(mapId: MapId): void {
    if (this.worldMap === mapId && this.worldVis) return;
    if (this.worldVis) {
      this.scene.remove(this.worldVis.group);
      this.worldVis.dispose();
    }
    const map = getMap(mapId);
    const q = this.settings.quality;
    this.worldVis = buildWorld(map, this.renderer.capabilities.getMaxAnisotropy() > 4 && q === 'high' ? 8 : 4, q !== 'low', q !== 'low');
    this.scene.add(this.worldVis.group);
    this.worldMap = mapId;
    const t = map.theme;
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
    this.scene.background = new THREE.Color(t.fog);
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity * 1.5;
    this.ambient.color.setHex(t.hemiSky);
    this.ambient.intensity = 0.55;
    this.sun.color.setHex(t.sun);
    this.sun.intensity = t.sunIntensity * 1.2;
    const d = new THREE.Vector3(...t.sunDir).normalize();
    this.sun.position.copy(d).multiplyScalar(80);
    this.sun.target.position.set(0, 0, 0);
    const b = map.bounds;
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
    const cam = this.sun.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 220;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.renderer.toneMappingExposure = t.exposure;
    this.vm.setLighting(t.hemiSky, t.hemiGround, t.sun, t.sunIntensity);
    this.hud.setMap(map);
  }

  private gunPreview(cls: ClassId, tier: Tier): string {
    const key = `${cls}:${tier}`;
    const cache = this.gunCache;
    const hit = cache.get(key);
    if (hit) return hit;
    const W = 320;
    const H = 140;
    const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(1, 2, 3);
    scene.add(dl);
    const gun = buildGun(cls, tier);
    gun.group.rotation.y = -Math.PI / 2;
    const box = new THREE.Box3().setFromObject(gun.group);
    const center = box.getCenter(new THREE.Vector3());
    gun.group.position.sub(center);
    scene.add(gun.group);
    const len = box.getSize(new THREE.Vector3()).x;
    const cam = new THREE.PerspectiveCamera(22, W / H, 0.01, 20);
    cam.position.set(0.05, 0.12, len * 1.25 + 0.3);
    cam.lookAt(0, 0, 0);
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearAlpha();
    const prevTone = this.renderer.toneMapping;
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearAlpha(prevClear);
    this.renderer.toneMapping = prevTone;
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    const url = c.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }

  private saveProgress(): void {
    this.ctx.saveProgress(this.progress);
  }

  onSettingsChanged(s: ValeSettings): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = { ...s };
    this.audio.setVolume(s.masterVolume, s.musicVolume);
    this.menu.updateSettings(s);
    if (qualityChanged) {
      this.applyQuality();
      const m = this.worldMap;
      this.worldMap = null;
      if (m) this.loadWorld(m);
      this.resize();
    }
  }

  setOverlayOpen(open: boolean): void {
    if (open && this.state === 'playing') this.pause();
  }

  // ---------------------------------------------------------------------------
  // Match lifecycle

  private matchSettings(): MatchSettings {
    const p = this.progress.prefs;
    const mode = MODES[p.mode];
    return { mode: p.mode, map: p.map, bots: p.bots, difficulty: p.difficulty, scoreLimit: mode.scoreLimit, timeLimit: mode.timeLimit };
  }

  private startOffline(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.audio.resume();
    this.audio.ui('start');
    this.input.requestLock();
    this.menu.showLoading(`Loading ${MAP_INFO[this.progress.prefs.map].name}`);
    // Let the loading screen paint before the (synchronous) build.
    setTimeout(() => {
      if (this.disposed) return;
      this.beginMatch(this.matchSettings(), false);
      this.menu.showLoading(null);
    }, 60);
  }

  private beginMatch(settings: MatchSettings, online: boolean): void {
    this.cleanupMatch();
    this.online = online;
    this.loadWorld(settings.map);
    const match = new Match(settings);
    match.authority = !online;
    this.match = match;
    this.sim = new Simulation(match);
    const local = new Actor(this.ctx.playerName);
    local.isLocal = true;
    local.team = online ? (this.net?.you?.team ?? 0) : 0;
    local.netId = online ? (this.net?.id ?? 0) : 0;
    local.nextClass = this.progress.cls;
    local.tier = this.progress.tiers[this.progress.cls];
    this.local = local;
    match.addActor(local);
    if (!online) {
      const teams = match.teams;
      for (let i = 0; i < settings.bots; i++) {
        const team: 0 | 1 = teams ? (i % 2 === 0 ? 1 : 0) : 1;
        this.sim.addBot(team);
      }
      for (const a of match.actors) match.spawnActor(a);
    } else {
      match.onLocalHit = (victim, amount, part, distance, head) => {
        this.net?.send({ t: 'hit', victim: victim.netId, dmg: Math.round(amount), part, dist: Math.round(distance), head });
      };
      match.spawnActor(local);
      this.net?.send({ t: 'spawned', cls: local.classId, tier: local.tier, x: local.body.x, y: local.body.y, z: local.body.z });
    }
    this.unsub = match.on((e) => this.onMatchEvent(e));
    this.hud.setMap(match.map);
    this.hud.show(true);
    this.menu.show(false);
    this.menu.showEnd(null);
    this.audio.menuMusic(false);
    this.audio.ambience(match.map.theme.ambience);
    this.state = 'playing';
    this.matchStartReal = performance.now();
    this.vm.setTeamColor(0x25c9a7);
    this.eyeSmooth = PLAYER.eyeStand;
    this.hud.message(`${match.mode.name} · ${MAP_INFO[settings.map].name}`, 2600, 'big');
  }

  private cleanupMatch(): void {
    this.unsub?.();
    this.unsub = null;
    for (const c of this.chars.values()) c.dispose();
    this.chars.clear();
    this.stepAccum.clear();
    this.match = null;
    this.sim = null;
    this.local = null;
    this.deathInfo = null;
    this.menu.showDeath(null, 0);
    this.hud.scoreboard(false, null, null);
  }

  private leaveMatch(): void {
    if (this.online && this.net) {
      this.net.send({ t: 'leave' });
      this.net.room = null;
      this.net.send({ t: 'list' });
    }
    this.cleanupMatch();
    this.online = false;
    this.state = 'menu';
    this.hud.show(false);
    this.menu.showPause(false, false);
    this.menu.showEnd(null);
    this.menu.show(true);
    this.input.exitLock();
    this.audio.ambience(null);
    this.audio.menuMusic(true);
    this.audio.setMuffled(false);
    this.loadWorld(this.menuMap);
  }

  private playAgain(): void {
    if (this.online) {
      this.menu.showEnd(null);
      this.hud.message('Next round starts automatically', 4000);
      return;
    }
    this.menu.showEnd(null);
    this.startOffline();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menu.showPause(true, this.online);
    this.hud.scoreboard(false, null, null);
    this.audio.setMuffled(true);
    this.input.exitLock();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.audio.resume();
    this.menu.showPause(false, this.online);
    this.state = 'playing';
    this.audio.setMuffled(false);
    // Don't leave keyboard focus on a menu control (Space would press it).
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.input.requestLock();
  }

  private onLockChange(locked: boolean): void {
    if (!locked && this.state === 'playing' && !this.hud.isChatOpen) this.pause();
  }

  private onKey(code: string, e: KeyboardEvent): void {
    if (this.state === 'playing' && !this.hud.isChatOpen) {
      if (code === 'Enter') {
        e.preventDefault();
        this.input.enabled = false;
        this.input.releaseAll();
        this.hud.openChat();
      } else if (code === 'Backquote') {
        this.pause();
      } else if (code === 'Tab' && !e.shiftKey) {
        e.preventDefault();
      } else if (code.startsWith('Digit')) {
        const i = Number(code.slice(5)) - 1;
        const c = CLASS_ORDER[i];
        if (c && this.local) {
          this.progress.cls = c;
          this.local.nextClass = c;
          this.saveProgress();
          if (!this.local.alive) this.menu.pickDeathClass(c);
          else this.hud.message(`${WEAPONS[c].name} on next spawn`, 1400);
        }
      } else if (code === 'Space' && this.local && !this.local.alive) {
        this.respawnRequested = true;
      }
    }
  }

  private sendChat(text: string): void {
    if (!this.local) return;
    if (this.online) this.net?.send({ t: 'chat', text });
    else this.hud.chat(this.local.name, text, '#2ef0c8');
    this.input.enabled = true;
  }

  // ---------------------------------------------------------------------------
  // Events

  private colorFor(a: Actor | null): string {
    if (!a || !this.local) return '#ffffff';
    if (a === this.local) return '#ffd34d';
    if (this.match?.teams && a.team === this.local.team) return '#2ef0c8';
    return '#ff6b6b';
  }

  private onMatchEvent(e: MatchEvent): void {
    const local = this.local;
    const match = this.match;
    if (!local || !match) return;
    switch (e.type) {
      case 'shot': {
        const a = e.actor;
        if (a === local) {
          if (this.online) this.net?.sendShot([e.req.ox, e.req.oy, e.req.oz], e.traces, a.classId);
          this.vm.onShot(a.classId);
          this.audio.gunshot(a.classId, null);
          this.muzzleLight.intensity = a.classId === 'shotgun' || a.classId === 'sniper' ? 30 : 16;
          this.camShake = Math.min(1, this.camShake + (a.classId === 'sniper' || a.classId === 'shotgun' ? 0.5 : 0.12));
          const start = this.localMuzzleWorld(this.tmpV);
          this.shotCounter++;
          e.traces.forEach((t, i) => {
            if (a.classId === 'shotgun' ? i % 3 === 0 : a.classId === 'sniper' || this.shotCounter % 2 === 0) this.effects.tracer(start.x, start.y, start.z, t.ex, t.ey, t.ez);
          });
        } else {
          const ch = this.chars.get(a.id);
          const muzzle = ch ? ch.muzzleWorld(this.tmpV) : this.tmpV.set(a.body.x, a.eyeY - 0.2, a.body.z);
          this.effects.muzzleFlash(muzzle, a.classId === 'shotgun' || a.classId === 'sniper');
          const dist = Math.hypot(a.body.x - local.body.x, a.body.z - local.body.z);
          this.audio.gunshot(a.classId, { x: a.body.x, y: a.eyeY, z: a.body.z }, dist);
          e.traces.forEach((t, i) => {
            if (a.classId !== 'shotgun' || i % 4 === 0) this.effects.tracer(muzzle.x, muzzle.y, muzzle.z, t.ex, t.ey, t.ez);
          });
        }
        for (const t of e.traces) {
          if (t.hitWorld) this.effects.impact(t.ex, t.ey, t.ez, t.nx, t.ny, t.nz, 'world');
          else if (t.hitActor && t.hitActor !== local) this.effects.impact(t.ex, t.ey, t.ez, 0, 0, 0, 'flesh');
        }
        break;
      }
      case 'damage': {
        if (e.attacker === local && e.victim !== local) {
          if (!e.killed) {
            this.hud.hitmarker(e.part === 'head' ? 'head' : 'body');
            this.audio.hitmarker(e.part === 'head');
          }
          this.chars.get(e.victim.id)?.flash();
        }
        if (e.victim === local) {
          this.audio.hurt();
          this.camShake = Math.min(1, this.camShake + 0.35);
          if (e.attacker) {
            const ang = Math.atan2(-(e.attacker.body.x - local.body.x), -(e.attacker.body.z - local.body.z));
            this.hud.damageIndicator(-(ang - local.yaw));
          }
        } else this.chars.get(e.victim.id)?.flash();
        break;
      }
      case 'kill': {
        const involves = e.killer === local || e.victim === local;
        this.hud.killfeed(e.killer?.name ?? null, this.colorFor(e.killer), e.victim.name, this.colorFor(e.victim), e.weapon, e.headshot, involves);
        if (e.killer === local && e.victim !== local) {
          this.hud.hitmarker(e.headshot ? 'headkill' : 'kill');
          this.audio.killConfirm(e.headshot);
          this.onLocalKill(e.weapon, e.headshot, e.distance, e.sliding, e.airborne);
        }
        if (e.victim === local) {
          this.deathInfo = { killer: e.killer, weapon: e.weapon, headshot: e.headshot, distance: e.distance };
          this.respawnRequested = false;
          this.progress.totalDeaths++;
          this.hud.scoreboard(false, null, null);
        }
        break;
      }
      case 'medal':
        if (e.actor === local) {
          this.hud.medal(e.text, e.points, Boolean(e.big));
          if (e.big) this.audio.medal(true);
          if (e.text === 'Kill Confirmed' || e.text === 'Kill Denied') this.audio.pickup();
        }
        break;
      case 'objective':
        this.hud.message(e.text, 2000);
        break;
      case 'spawn':
        if (e.actor === local) {
          this.deathInfo = null;
          this.menu.showDeath(null, 0);
          this.eyeSmooth = PLAYER.eyeStand;
          this.adsToggled = false;
        }
        break;
      case 'chat':
        this.hud.chat(e.name, e.text, e.team === -1 ? '#ffd34d' : e.team === local.team ? '#2ef0c8' : '#ff6b6b', e.system);
        break;
      case 'jump':
        if (e.actor === local) this.audio.jump();
        break;
      case 'land':
        if (e.actor === local) {
          this.audio.land(null);
          this.vm.onLand();
        } else if (this.near(e.actor, 30)) this.audio.land({ x: e.actor.body.x, y: e.actor.body.y, z: e.actor.body.z });
        break;
      case 'slide':
        if (e.actor === local) this.audio.slide(null);
        else if (this.near(e.actor, 30)) this.audio.slide({ x: e.actor.body.x, y: e.actor.body.y, z: e.actor.body.z });
        break;
      case 'reload':
        if (e.actor === local) this.audio.reload(e.actor.classId, e.actor.weapon.reloadTime);
        break;
      case 'end':
        this.onMatchEnd();
        break;
    }
  }

  private near(a: Actor, d: number): boolean {
    const l = this.local!;
    return (a.body.x - l.body.x) ** 2 + (a.body.z - l.body.z) ** 2 < d * d;
  }

  private onLocalKill(weapon: ClassId, headshot: boolean, distance: number, sliding: boolean, airborne: boolean): void {
    const p = this.progress;
    p.totalKills++;
    if (headshot) p.totalHeadshots++;
    const before = p.classKills[weapon] ?? 0;
    p.classKills[weapon] = before + 1;
    for (let t = 1; t < TIERS.length; t++) {
      if (before < TIERS[t].kills && before + 1 >= TIERS[t].kills) {
        this.hud.medal(`${TIERS[t].name} ${WEAPONS[weapon].name} unlocked`, 0, true);
        this.audio.medal(true);
        if (t === 3) this.ctx.unlockAchievement('gold');
      }
    }
    const ach = this.ctx.unlockAchievement.bind(this.ctx);
    ach('first_blood');
    if (weapon === 'sniper' && headshot) ach('deadshot');
    if (distance > 60) ach('long_shot');
    if (p.totalHeadshots >= 50) ach('headhunter');
    if (this.local && this.local.streak >= 5) ach('streak_5');
    if (this.local && this.local.streak >= 10) ach('streak_10');
    if (sliding) ach('slider');
    if (airborne) ach('air_shot');
    if (CLASS_ORDER.every((c) => (p.classKills[c] ?? 0) > 0)) ach('all_rounder');
  }

  private onMatchEnd(): void {
    const match = this.match;
    const local = this.local;
    if (!match || !local) return;
    this.state = 'ended';
    this.input.exitLock();
    this.hud.scoreboard(false, null, null);
    this.menu.showDeath(null, 0);
    this.audio.setMuffled(true);
    const won = match.teams ? match.winnerTeam === local.team : match.winner === local;
    const draw = match.teams && match.winnerTeam === -1;
    const seconds = (performance.now() - this.matchStartReal) / 1000;
    const xp = Math.round(local.score / 4 + local.kills * 10 + (won ? 500 : 150) + Math.min(seconds, 900) / 3);
    const p = this.progress;
    p.matches++;
    if (won) p.wins++;
    p.xp += xp;
    if (!p.mapsPlayed.includes(match.settings.map)) p.mapsPlayed.push(match.settings.map);
    this.saveProgress();
    const classKills: Record<string, number> = {};
    for (const [k, v] of Object.entries(local.classKills)) classKills[k] = v;
    this.ctx.reportMatch({
      kills: local.kills,
      deaths: local.deaths,
      headshots: local.headshots,
      shotsFired: local.shotsFired,
      shotsHit: local.shotsHit,
      won,
      mode: match.settings.mode,
      map: match.settings.map,
      bestStreak: local.bestStreak,
      longestShot: local.longestKill,
      xp,
      seconds,
      classKills,
    });
    if (won) this.ctx.unlockAchievement('victor');
    if (won && local.deaths === 0) this.ctx.unlockAchievement('flawless');
    if (won && !this.online && match.settings.difficulty === 'insane') this.ctx.unlockAchievement('insane');
    if (MAP_ORDER.every((m) => p.mapsPlayed.includes(m))) this.ctx.unlockAchievement('tourist');
    if (this.online) this.ctx.unlockAchievement('lan');

    const rows = match.standings().map((a) => ({ name: a.name, kills: a.kills, deaths: a.deaths, score: a.score, me: a === local, color: this.colorFor(a) }));
    const acc = local.shotsFired ? Math.round((local.shotsHit / local.shotsFired) * 100) : 0;
    let title = won ? 'Victory' : draw ? 'Draw' : 'Defeat';
    let subtitle: string;
    if (match.teams) subtitle = `${match.teamScores[local.team]} – ${match.teamScores[local.team === 0 ? 1 : 0]} · ${match.mode.name} on ${MAP_INFO[match.settings.map].name}`;
    else {
      const place = match.standings().indexOf(local) + 1;
      title = won ? 'Victory' : `#${place}`;
      subtitle = `${match.winner?.name ?? '—'} wins · ${match.mode.name} on ${MAP_INFO[match.settings.map].name}`;
    }
    this.menu.showEnd({
      title,
      subtitle,
      won,
      rows,
      stats: [
        ['Kills', String(local.kills)],
        ['Deaths', String(local.deaths)],
        ['Headshots', String(local.headshots)],
        ['Accuracy', `${acc}%`],
        ['Best streak', String(local.bestStreak)],
        ['Longest kill', `${Math.round(local.longestKill)}m`],
      ],
      xp,
      unlocks: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Frame

  private frame(now: number): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0.0001, rawDt));
    this.fps += (1 / Math.max(rawDt, 0.001) - this.fps) * 0.05;

    if (this.state === 'menu' || !this.match || !this.local) this.menuFrame(dt);
    else this.gameFrame(dt);

    this.input.endFrame();
  }

  private menuFrame(dt: number): void {
    this.menuT += dt;
    const map = getMap(this.menuMap);
    const shots = map.menuCam;
    const seg = 14;
    const i = Math.floor(this.menuT / seg) % shots.length;
    const f = (this.menuT % seg) / seg;
    const s = shots[i];
    const ang = (f - 0.5) * 0.5;
    const ox = s.from.x - s.to.x;
    const oz = s.from.z - s.to.z;
    const cx = s.to.x + ox * Math.cos(ang) - oz * Math.sin(ang);
    const cz = s.to.z + ox * Math.sin(ang) + oz * Math.cos(ang);
    this.camera.position.set(cx, s.from.y + Math.sin(f * Math.PI) * 0.6, cz);
    this.camera.lookAt(s.to.x, s.to.y, s.to.z);
    this.setFov(this.settings.fov, 1);
    this.worldVis?.update(dt, this.camera);
    this.effects.update(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  private setFov(hfovDeg: number, zoom: number): void {
    // Horizontal FOV is defined for 16:9; vertical FOV derives from it.
    const vfov = 2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) / (16 / 9));
    const v = (2 * Math.atan(Math.tan(vfov / 2) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - v) > 0.01) {
      this.camera.fov = v;
      this.camera.updateProjectionMatrix();
    }
  }

  private gameFrame(dt: number): void {
    const match = this.match!;
    const local = this.local!;
    const sim = this.sim!;
    const playing = this.state === 'playing';
    const def = local.weapon;
    const zoom = 1 + (def.adsZoom - 1) * local.ads;

    // ---- Input → local actor
    if (playing && local.alive && this.input.enabled) {
      const sens = BASE_SENS * this.settings.sensitivity / zoom;
      local.yaw -= this.input.dx * sens;
      local.pitch -= this.input.dy * sens * (this.settings.invertY ? -1 : 1);
      local.pitch = Math.max(-1.52, Math.min(1.52, local.pitch));
      const inp = local.input;
      inp.fwd = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
      inp.right = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
      inp.jump = this.input.isDown('Space');
      inp.crouch = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') || this.input.isDown('KeyC') || this.input.isDown('ControlLeft');
      inp.fire = this.input.lmb && this.input.locked;
      if (this.settings.adsToggle) {
        if (this.input.adsPressed() || this.input.pressed('KeyL')) this.adsToggled = !this.adsToggled;
        if (local.reloading) this.adsToggled = false;
        inp.ads = this.adsToggled;
      } else inp.ads = this.input.rmb || this.input.isDown('KeyL');
      inp.reload = this.input.pressed('KeyR');
    } else {
      const inp = local.input;
      inp.fwd = inp.right = 0;
      inp.jump = inp.crouch = inp.fire = inp.ads = inp.reload = false;
    }
    if (this.debugInput) Object.assign(local.input, this.debugInput);
    this.tabHeld = playing && this.input.isDown('Tab') && !this.input.isDown('ShiftLeft');

    // ---- Respawn for the local player
    if (!local.alive && (playing || this.state === 'paused') && !match.over) {
      const left = local.respawnAt - match.time;
      if (this.deathInfo) {
        const k = this.deathInfo.killer;
        this.menu.showDeath(
          { killer: k?.name ?? 'the map', weapon: this.deathInfo.weapon, headshot: this.deathInfo.headshot, distance: this.deathInfo.distance, killerHealth: k?.alive ? k.health : 0, color: this.colorFor(k) },
          Math.max(0, left),
        );
      }
      if (left <= 0 && (this.respawnRequested || left < -4) && playing) {
        local.nextClass = this.progress.cls;
        local.tier = this.progress.tiers[local.nextClass];
        match.spawnActor(local);
        if (this.online) this.net?.send({ t: 'spawned', cls: local.classId, tier: local.tier, x: local.body.x, y: local.body.y, z: local.body.z });
        this.respawnRequested = false;
      }
    }

    // ---- Simulation
    const simulate = this.state === 'playing' || (this.online && this.state === 'paused') || this.state === 'ended';
    if (simulate && !match.over) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i++) sim.step(dt / steps);
      if (this.online) this.netTick(dt);
    }

    // ---- Camera
    const eyeTarget = local.eyeHeight;
    this.eyeSmooth += (eyeTarget - this.eyeSmooth) * Math.min(1, dt * 14);
    this.camShake = Math.max(0, this.camShake - dt * 3);
    if (local.alive) {
      const shake = this.camShake * 0.012;
      this.camera.position.set(local.body.x, local.body.y + this.eyeSmooth, local.body.z);
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = local.yaw + (Math.random() - 0.5) * shake;
      this.camera.rotation.x = local.pitch + (Math.random() - 0.5) * shake + local.kick * 0.006;
      this.camera.rotation.z = local.stance === 'slide' ? -0.05 : 0;
      this.setFov(this.settings.fov, zoom);
    } else {
      // Death cam: rise above the body and look at the killer.
      const k = this.deathInfo?.killer;
      const t = Math.min(1, (match.time - local.deathTime) / 0.8);
      const target = k && k.alive ? new THREE.Vector3(k.body.x, k.eyeY, k.body.z) : new THREE.Vector3(local.body.x, local.body.y, local.body.z);
      const from = new THREE.Vector3(local.body.x, local.body.y + 1.6 + t * 2.2, local.body.z);
      this.camera.position.lerp(from, Math.min(1, dt * 4));
      const m = new THREE.Matrix4().lookAt(this.camera.position, target, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, Math.min(1, dt * 5));
      this.setFov(this.settings.fov, 1);
    }

    // ---- Visuals
    this.syncCharacters(dt, match);
    if (match.settings.mode === 'kc') this.effects.syncTags(match.tags, local.team);
    if (match.flags.length) this.effects.syncFlags(match.flags, local.team, FLAG_RADIUS);
    if (match.hardpoint) this.effects.syncHardpoint(match.hardpoint, local.team, HP_RADIUS);
    this.effects.update(dt, this.camera.position);
    this.worldVis?.update(dt, this.camera);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 300);
    if (this.muzzleLight.intensity > 0) {
      this.camera.getWorldDirection(this.tmpV);
      this.muzzleLight.position.copy(this.camera.position).addScaledVector(this.tmpV, 0.8);
    }
    this.footsteps(dt, match);
    this.audio.tick(dt);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.audio.setListener(this.camera.position, fwd.x, fwd.y, fwd.z);

    // ---- HUD
    const vfov = (this.camera.fov * Math.PI) / 180;
    const spread = local.currentSpread();
    const spreadPx = (Math.tan(spread) / Math.tan(vfov / 2)) * (this.root.clientHeight / 2);
    this.hud.update({
      health: local.health,
      ammo: local.ammo,
      mag: def.mag,
      reload: local.reloading ? 1 - local.reloadLeft / def.reloadTime : -1,
      cls: local.classId,
      tier: local.tier,
      spreadPx: 4 + spreadPx,
      ads: local.ads,
      scoped: def.scope && local.ads > 0.92 && local.alive,
      alive: local.alive,
      spawnProtect: local.spawnProtect,
      fps: this.fps,
      showFps: this.settings.showFps,
    });
    this.hud.updateTop(match, local);
    this.hud.scoreboard(this.tabHeld, match, local);
    this.hud.drawMinimap(match, local, local.yaw);

    // ---- Render
    if (this.photoCam) {
      this.camera.position.set(...this.photoCam.pos);
      this.camera.lookAt(...this.photoCam.target);
      this.setFov(this.photoCam.fov ?? 80, 1);
      this.hud.show(false);
    }
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (local.alive && this.state !== 'ended' && !this.photoCam) {
      this.vm.update(dt, local, this.input.dx, this.input.dy);
      this.vm.render(this.renderer, this.camera.aspect);
    }
  }

  private localMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const a = this.local!;
    const ads = a.ads;
    const right = 0.13 * (1 - ads);
    const down = 0.1 * (1 - ads) + 0.04;
    const q = this.camera.quaternion;
    out.set(right, -down, -0.7).applyQuaternion(q).add(this.camera.position);
    return out;
  }

  private syncCharacters(dt: number, match: Match): void {
    const local = this.local!;
    const camPos = this.camera.position;
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    // Crosshair target for enemy name tags
    let aimed: Actor | null = null;
    let bestAng = 0.05;
    for (const a of match.actors) {
      if (a === local) continue;
      let ch = this.chars.get(a.id);
      if (!ch) {
        ch = new CharacterModel(a);
        this.chars.set(a.id, ch);
        this.scene.add(ch.root);
      }
      const friendly = match.teams && a.team === local.team;
      ch.setColors(friendly, !match.teams);
      ch.update(dt, match.time);
      if (!a.alive || friendly) {
        ch.showName(a.alive && friendly);
        continue;
      }
      const dx = a.body.x - camPos.x;
      const dy = a.body.y + 1.2 - camPos.y;
      const dz = a.body.z - camPos.z;
      const d = Math.hypot(dx, dy, dz);
      const ang = Math.acos(Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d));
      if (ang < bestAng + 0.6 / Math.max(d, 1) && d < 120) {
        if (match.world.lineOfSight(camPos.x, camPos.y, camPos.z, a.body.x, a.body.y + 1.2, a.body.z)) {
          aimed = a;
          bestAng = ang;
        }
      }
    }
    if (aimed) this.aimedEnemy = { actor: aimed, until: match.time + 0.8 };
    if (this.photoCam) {
      for (const ch of this.chars.values()) ch.showName(false);
      return;
    }
    for (const a of match.actors) {
      if (a === local || !a.alive) continue;
      const friendly = match.teams && a.team === local.team;
      if (!friendly) this.chars.get(a.id)?.showName(this.aimedEnemy?.actor === a && match.time < this.aimedEnemy.until);
    }
    // Remove models of actors that left
    for (const [id, ch] of this.chars) {
      if (!match.actors.some((a) => a.id === id)) {
        ch.dispose();
        this.chars.delete(id);
      }
    }
  }

  private footsteps(dt: number, match: Match): void {
    const local = this.local!;
    const theme = match.map.theme.ambience;
    const fallback: Surface = theme === 'snow' ? 'snow' : theme === 'forest' ? 'grass' : 'concrete';
    for (const a of match.actors) {
      if (!a.alive || !a.body.onGround || a.stance === 'slide' || a.speed < 2.2) continue;
      if (a !== local && !this.near(a, 28)) continue;
      const acc = (this.stepAccum.get(a.id) ?? 0) + a.speed * dt;
      const stride = a.stance === 'crouch' ? 1.6 : 2.5;
      if (acc >= stride) {
        this.stepAccum.set(a.id, acc - stride);
        const box = match.world.boxBelow(a.body.x, a.body.z, a.body.y);
        const surf = (box && SURFACE[box.mat]) || fallback;
        const loud = a.stance === 'crouch' ? 0.4 : 1;
        if (a === local) this.audio.footstep(null, surf, loud);
        else this.audio.footstep({ x: a.body.x, y: a.body.y, z: a.body.z }, surf, loud);
      } else this.stepAccum.set(a.id, acc);
    }
  }

  // ---------------------------------------------------------------------------
  // LAN

  private lanConnect(url: string): void {
    this.lanDisconnect();
    this.menu.setLan('connecting', 'Connecting…');
    const net = new NetClient(url, this.ctx.playerName);
    this.net = net;
    net.onStatus = (status, message) => this.menu.setLan(status, message, net.rooms);
    net.onRooms = (rooms) => this.menu.setLan('connected', '', rooms);
    net.onJoined = (room) => {
      this.beginMatch({ mode: room.mode, map: room.map, bots: 0, difficulty: 'normal', scoreLimit: room.scoreLimit, timeLimit: room.timeLimit }, true);
      net.attach(this);
    };
    net.connect();
  }

  private lanDisconnect(): void {
    if (this.net) {
      this.net.close();
      this.net = null;
    }
    this.menu.setLan('idle', '');
  }

  private netTick(dt: number): void {
    this.netSendTimer -= dt;
    if (this.netSendTimer <= 0 && this.net && this.local) {
      this.netSendTimer = 1 / 20;
      this.net.sendState(this.local);
    }
    this.net?.interpolate(dt);
  }

  /** Used by the network layer. */
  netEvent(e: MatchEvent): void {
    this.onMatchEvent(e);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.lanDisconnect();
    this.cleanupMatch();
    this.resizeObs.disconnect();
    this.input.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.menu.dispose();
    this.effects.dispose();
    this.vm.dispose();
    if (this.worldVis) this.worldVis.dispose();
    disposeTextures();
    this.renderer.dispose();
    this.root.remove();
    delete (window as unknown as { __deadshot?: Game }).__deadshot;
  }
}
