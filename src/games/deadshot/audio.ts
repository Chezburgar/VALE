import type { ClassId } from './config';
import menuTrackUrl from './assets/audio/menu-music.mp3?url';

// Effects and ambience are synthesized with WebAudio. The menu theme is a
// streamed track (an <audio> element routed into the graph, so it never sits
// in memory as ~75 MB of decoded PCM).

interface V3 {
  x: number;
  y: number;
  z: number;
}

const GUN: Record<ClassId, { lp: number; decay: number; f0: number; f1: number; gain: number; tail: number }> = {
  ar: { lp: 3400, decay: 0.15, f0: 130, f1: 45, gain: 0.55, tail: 0.0 },
  smg: { lp: 4600, decay: 0.09, f0: 170, f1: 60, gain: 0.42, tail: 0.0 },
  shotgun: { lp: 1900, decay: 0.36, f0: 95, f1: 32, gain: 0.95, tail: 0.25 },
  sniper: { lp: 2900, decay: 0.42, f0: 85, f1: 28, gain: 1.0, tail: 0.6 },
};

export type Surface = 'concrete' | 'metal' | 'wood' | 'snow' | 'grass' | 'dirt';

/** Music bus level at 100% "Ambience & music" (the track is mastered loud). */
const MUSIC_LEVEL = 0.6;
/** Seconds of closing decay at the end of the track: the next pass starts over it. */
const TRACK_TAIL = 7;
/** Track length, used only while the element can't report a duration yet. */
const TRACK_LENGTH = 196.39;
const MUSIC_FADE_IN = 2.4;
const MUSIC_FADE_OUT = 1.5;
/** Coming back to the menu within this many seconds resumes the track; later it restarts. */
const MUSIC_RESUME_WINDOW = 45;

interface Deck {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  /** Menu fade in/out, between the music sources and the music bus. */
  private musicFade!: GainNode;
  private noise!: AudioBuffer;
  private ambNodes: AudioNode[] = [];
  private decks: Deck[] = [];
  private deckIdx = 0;
  private musicOn = false;
  /** A play() is waiting for data; its callback runs the fade-in. */
  private musicStarting = false;
  private trackFailed = false;
  private musicStopTimer = 0;
  private musicLeftAt = 0;
  private disposed = false;
  private birdTimer = 0;
  private ambKind: string | null = null;

  constructor(volume: number, musicVolume: number) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = volume;
    this.master.connect(c.destination);
    // Effects and ambience share a compressor; the music track skips it.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(comp);
    this.amb = c.createGain();
    this.amb.gain.value = musicVolume * 0.6;
    this.amb.connect(comp);
    this.music = c.createGain();
    this.music.gain.value = musicVolume * MUSIC_LEVEL;
    this.music.connect(this.master);
    this.musicFade = c.createGain();
    this.musicFade.gain.value = 0;
    this.musicFade.connect(this.music);
    // A context created before any user gesture starts suspended; the music
    // waits for it to run instead of starting silently partway through.
    c.addEventListener('statechange', () => {
      if (c.state === 'running') this.startMusic();
    });
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Call from user gestures: unlocks the context (and the music) under autoplay rules. */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    else if (this.musicOn && this.decks[this.deckIdx]?.el.paused) this.startMusic();
  }

  setVolume(volume: number, musicVolume: number): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    this.amb.gain.setTargetAtTime(musicVolume * 0.6, this.ctx.currentTime, 0.1);
    this.music.gain.setTargetAtTime(musicVolume * MUSIC_LEVEL, this.ctx.currentTime, 0.1);
  }

  setMuffled(on: boolean): void {
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.08);
  }

  setListener(pos: V3, fx: number, fy: number, fz: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(fy, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /** Output node for a sound: direct for local sounds, panned for world sounds. */
  private out(pos: V3 | null, gain = 1): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = gain;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.rolloffFactor = 1.1;
      p.maxDistance = 250;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private noiseBurst(dest: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, gain: number, q = 0.8): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.05);
  }

  private tone(dest: AudioNode, at: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  gunshot(cls: ClassId, pos: V3 | null, distance = 0): void {
    if (!this.ctx) return;
    const p = GUN[cls];
    const t = this.ctx.currentTime;
    const muffle = Math.max(0.25, 1 - distance / 140);
    const out = this.out(pos, pos ? 1.6 : 0.9);
    this.noiseBurst(out, t, p.decay, 'lowpass', p.lp * muffle, p.gain);
    this.noiseBurst(out, t, 0.03, 'highpass', 2500, p.gain * 0.5 * muffle);
    this.tone(out, t, p.f0, p.f1, p.decay * 0.8, p.gain * 0.9);
    if (p.tail > 0) {
      this.noiseBurst(out, t + 0.06, p.tail, 'lowpass', 900 * muffle, p.gain * 0.25);
      this.noiseBurst(out, t + 0.22, p.tail * 0.8, 'lowpass', 600 * muffle, p.gain * 0.12);
    }
    if (cls === 'sniper' && !pos) {
      // bolt cycle
      this.noiseBurst(out, t + 0.42, 0.05, 'bandpass', 1800, 0.25, 3);
      this.noiseBurst(out, t + 0.62, 0.05, 'bandpass', 2400, 0.25, 3);
    }
  }

  dryFire(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.out(null), this.ctx.currentTime, 0.03, 'bandpass', 3000, 0.2, 4);
  }

  reload(cls: ClassId, duration: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.8);
    if (cls === 'shotgun') {
      this.noiseBurst(out, t + 0.08, 0.06, 'bandpass', 1500, 0.3, 3);
      this.noiseBurst(out, t + duration * 0.4, 0.04, 'bandpass', 2200, 0.25, 4);
      this.noiseBurst(out, t + duration * 0.6, 0.04, 'bandpass', 2200, 0.25, 4);
      this.noiseBurst(out, t + duration * 0.88, 0.08, 'bandpass', 1300, 0.35, 3);
      return;
    }
    this.noiseBurst(out, t + 0.1, 0.04, 'bandpass', 2600, 0.25, 5);
    this.noiseBurst(out, t + duration * 0.3, 0.09, 'bandpass', 900, 0.25, 2);
    this.noiseBurst(out, t + duration * 0.62, 0.05, 'bandpass', 1600, 0.35, 4);
    this.noiseBurst(out, t + duration * 0.85, 0.06, 'bandpass', 2000, 0.3, 4);
  }

  hitmarker(head: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.7);
    if (head) {
      this.tone(out, t, 2600, 2550, 0.22, 0.3);
      this.tone(out, t, 3900, 3850, 0.16, 0.12);
    } else {
      this.noiseBurst(out, t, 0.025, 'highpass', 4000, 0.4);
      this.tone(out, t, 1700, 1500, 0.05, 0.12, 'triangle');
    }
  }

  killConfirm(head: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.7);
    this.tone(out, t, 520, 260, 0.18, 0.35, 'triangle');
    this.tone(out, t + 0.05, head ? 1560 : 1040, head ? 1560 : 1040, 0.3, 0.18);
  }

  hurt(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.7);
    this.noiseBurst(out, t, 0.12, 'lowpass', 500, 0.6);
    this.tone(out, t, 140, 70, 0.12, 0.4);
  }

  footstep(pos: V3 | null, surface: Surface, loud = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(pos, (pos ? 0.9 : 0.35) * loud);
    switch (surface) {
      case 'metal':
        this.noiseBurst(out, t, 0.09, 'bandpass', 1400, 0.5, 6);
        this.tone(out, t, 420, 380, 0.08, 0.08, 'triangle');
        break;
      case 'wood':
        this.noiseBurst(out, t, 0.07, 'bandpass', 700, 0.5, 2);
        break;
      case 'snow':
        this.noiseBurst(out, t, 0.11, 'highpass', 1800, 0.25);
        this.noiseBurst(out, t, 0.08, 'lowpass', 400, 0.3);
        break;
      case 'grass':
      case 'dirt':
        this.noiseBurst(out, t, 0.08, 'lowpass', 900, 0.4);
        break;
      default:
        this.noiseBurst(out, t, 0.06, 'lowpass', 1100, 0.45);
        this.noiseBurst(out, t, 0.02, 'highpass', 3000, 0.08);
    }
  }

  jump(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.out(null, 0.3), this.ctx.currentTime, 0.08, 'lowpass', 700, 0.4);
  }

  land(pos: V3 | null): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(pos, pos ? 0.8 : 0.5);
    this.noiseBurst(out, t, 0.12, 'lowpass', 500, 0.7);
    this.tone(out, t, 110, 50, 0.1, 0.3);
  }

  slide(pos: V3 | null): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.out(pos, pos ? 0.8 : 0.45);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.7);
  }

  pickup(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.6);
    this.tone(out, t, 880, 880, 0.08, 0.2, 'square');
    this.tone(out, t + 0.07, 1320, 1320, 0.12, 0.18, 'square');
  }

  medal(big: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.5);
    const notes = big ? [523, 659, 784, 1046] : [659, 988];
    notes.forEach((f, i) => this.tone(out, t + i * 0.06, f, f, 0.25, 0.14, 'triangle'));
  }

  ui(kind: 'hover' | 'click' | 'start' | 'countdown'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.out(null, 0.5);
    if (kind === 'hover') this.tone(out, t, 1400, 1400, 0.04, 0.05, 'sine');
    else if (kind === 'click') this.tone(out, t, 900, 600, 0.07, 0.15, 'triangle');
    else if (kind === 'countdown') this.tone(out, t, 700, 700, 0.12, 0.15, 'square');
    else {
      this.tone(out, t, 440, 880, 0.3, 0.2, 'sawtooth');
      this.noiseBurst(out, t, 0.4, 'lowpass', 1200, 0.2);
    }
  }

  ambience(kind: 'wind' | 'industrial' | 'forest' | 'snow' | null): void {
    if (!this.ctx || kind === this.ambKind) return;
    this.ambKind = kind;
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambNodes = [];
    if (!kind) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'snow' ? 650 : kind === 'forest' ? 420 : 300;
    const g = c.createGain();
    g.gain.value = kind === 'snow' ? 0.35 : 0.18;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = c.createGain();
    lfoGain.gain.value = kind === 'snow' ? 250 : 120;
    lfo.connect(lfoGain).connect(f.frequency);
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    lfo.start();
    this.ambNodes.push(src, lfo, f, g, lfoGain);
    if (kind === 'industrial') {
      const hum = c.createOscillator();
      hum.frequency.value = 55;
      const hg = c.createGain();
      hg.gain.value = 0.025;
      hum.connect(hg).connect(this.amb);
      hum.start();
      this.ambNodes.push(hum, hg);
    }
  }

  /** Called every frame for ambient one-shots (birds). */
  tick(dt: number): void {
    if (!this.ctx || this.ambKind !== 'forest') return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2 + Math.random() * 6;
      const t = this.ctx.currentTime;
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone(this.amb, t + i * 0.11, base, base * (0.8 + Math.random() * 0.5), 0.08, 0.04);
    }
  }

  // ---------------------------------------------------------------------------
  // Menu music

  /** Fades the menu theme in (menus, results) or out (match). Safe to call repeatedly. */
  menuMusic(on: boolean): void {
    if (!this.ctx || this.disposed || on === this.musicOn) return;
    this.musicOn = on;
    if (on) {
      this.startMusic();
      return;
    }
    this.musicLeftAt = performance.now();
    this.rampMusic(0, MUSIC_FADE_OUT);
    clearTimeout(this.musicStopTimer);
    this.musicStopTimer = window.setTimeout(() => this.stopMusicSources(), MUSIC_FADE_OUT * 1000 + 100);
  }

  private rampMusic(to: number, seconds: number): void {
    const c = this.ctx!;
    const p = this.musicFade.gain;
    const t = c.currentTime;
    // Anchor at wherever a previous fade got to, so quick toggles never jump
    // (a ramp otherwise starts from the last event, possibly long ago).
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
    if (to > 0) p.linearRampToValueAtTime(to, t + seconds);
    else {
      p.setTargetAtTime(0, t, seconds / 5);
      p.setValueAtTime(0, t + seconds);
    }
  }

  private startMusic(): void {
    const c = this.ctx;
    if (!c || this.disposed || !this.musicOn || c.state !== 'running') return;
    clearTimeout(this.musicStopTimer);
    // No synth stand-in: a drone in place of the real theme is worse than quiet menus.
    if (this.trackFailed) return;
    if (!this.decks.length) this.createDecks();
    const deck = this.decks[this.deckIdx];
    if (this.musicStarting) return;
    if (!deck.el.paused) {
      // Still fading out from a moment ago: just bring it back up.
      this.rampMusic(1, MUSIC_FADE_IN * 0.5);
      return;
    }
    if (this.musicLeftAt && performance.now() - this.musicLeftAt > MUSIC_RESUME_WINDOW * 1000) {
      for (const d of this.decks) this.rewind(d);
      this.deckIdx = 0;
    }
    this.musicLeftAt = 0;
    const active = this.decks[this.deckIdx];
    active.gain.gain.cancelScheduledValues(c.currentTime);
    active.gain.gain.setValueAtTime(1, c.currentTime);
    this.musicStarting = true;
    this.playDeck(active, () => this.rampMusic(1, MUSIC_FADE_IN));
  }

  private createDecks(): void {
    const c = this.ctx!;
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      // The second copy only loads once it is about to be needed.
      el.preload = i === 0 ? 'auto' : 'none';
      el.src = menuTrackUrl;
      const node = c.createMediaElementSource(el);
      const gain = c.createGain();
      node.connect(gain).connect(this.musicFade);
      const deck: Deck = { el, node, gain };
      el.addEventListener('timeupdate', () => this.onDeckTime(deck));
      el.addEventListener('ended', () => {
        // Only reached if the hand-over didn't happen (e.g. unknown duration).
        if (this.decks[this.deckIdx] === deck && this.musicOn) this.handOver(deck);
      });
      el.addEventListener('error', () => this.onTrackError());
      this.decks.push(deck);
    }
  }

  /** Starts the other copy from the top while this one plays out its closing decay. */
  private onDeckTime(deck: Deck): void {
    if (this.disposed || this.decks[this.deckIdx] !== deck || deck.el.paused) return;
    const len = Number.isFinite(deck.el.duration) && deck.el.duration > 0 ? deck.el.duration : TRACK_LENGTH;
    const left = len - deck.el.currentTime;
    const next = this.decks[(this.deckIdx + 1) % 2];
    if (left < TRACK_TAIL + 20 && next.el.preload !== 'auto') next.el.preload = 'auto';
    if (left <= TRACK_TAIL && this.musicOn) this.handOver(deck);
  }

  private handOver(from: Deck): void {
    const c = this.ctx!;
    this.deckIdx = (this.decks.indexOf(from) + 1) % 2;
    const next = this.decks[this.deckIdx];
    this.rewind(next);
    const g = next.gain.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(0, c.currentTime);
    this.playDeck(next, () => {
      g.setValueAtTime(0, c.currentTime);
      g.linearRampToValueAtTime(1, c.currentTime + 0.6);
    });
  }

  private playDeck(deck: Deck, started: () => void): void {
    deck.el.play().then(
      () => {
        this.musicStarting = false;
        if (this.disposed || !this.musicOn) this.stopMusicSources();
        else started();
      },
      (err: DOMException) => {
        this.musicStarting = false;
        // NotAllowedError: autoplay blocked, resume() retries on the next gesture.
        // AbortError: paused or unloaded before it started.
        if (err?.name === 'NotSupportedError') this.onTrackError();
      },
    );
  }

  private rewind(deck: Deck): void {
    if (!deck.el.paused) deck.el.pause();
    if (deck.el.currentTime !== 0) deck.el.currentTime = 0;
  }

  private onTrackError(): void {
    if (this.trackFailed || this.disposed) return;
    this.trackFailed = true;
    console.warn('Deadshot: menu music failed to load');
    for (const d of this.decks) this.releaseDeck(d);
    this.decks = [];
  }

  private stopMusicSources(): void {
    if (this.musicOn) return;
    for (const d of this.decks) if (!d.el.paused) d.el.pause();
    // The idle copy never resumes mid-decay.
    const idle = this.decks[(this.deckIdx + 1) % 2];
    if (idle) this.rewind(idle);
  }

  private releaseDeck(d: Deck): void {
    d.el.pause();
    d.el.removeAttribute('src');
    d.el.load();
    d.node.disconnect();
    d.gain.disconnect();
  }

  /** Test hook: what the menu music is doing. */
  musicState(): { on: boolean; fade: number; failed: boolean; ctx: string; decks: { paused: boolean; time: number; gain: number; src: string }[] } {
    return {
      on: this.musicOn,
      fade: this.ctx ? this.musicFade.gain.value : 0,
      failed: this.trackFailed,
      ctx: this.ctx?.state ?? 'none',
      decks: this.decks.map((d) => ({ paused: d.el.paused, time: d.el.currentTime, gain: d.gain.gain.value, src: d.el.currentSrc })),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.musicOn = false;
    clearTimeout(this.musicStopTimer);
    for (const d of this.decks) this.releaseDeck(d);
    this.decks = [];
    this.ambience(null);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
