// Keyboard + mouse with pointer lock. Movement deltas accumulate between frames.

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  dx = 0;
  dy = 0;
  lmb = false;
  rmb = false;
  private lmbPressed = false;
  private rmbPressed = false;
  enabled = true;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null;
  private handlers: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(private target: HTMLElement) {
    this.listen(window, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (this.onKey) this.onKey(k.code, k);
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ShiftLeft', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Backquote'].includes(k.code)) k.preventDefault();
      if (!this.down.has(k.code)) this.pressedSet.add(k.code);
      this.down.add(k.code);
    });
    this.listen(window, 'keyup', (e) => {
      this.down.delete((e as KeyboardEvent).code);
    });
    this.listen(window, 'blur', () => this.releaseAll());
    this.listen(target, 'mousedown', (e) => {
      const m = e as MouseEvent;
      if (!this.enabled) return;
      if (m.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      } else if (m.button === 2) {
        this.rmb = true;
        this.rmbPressed = true;
      }
    });
    this.listen(window, 'mouseup', (e) => {
      const m = e as MouseEvent;
      if (m.button === 0) this.lmb = false;
      else if (m.button === 2) this.rmb = false;
    });
    this.listen(target, 'contextmenu', (e) => e.preventDefault());
    this.listen(document, 'mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      const m = e as MouseEvent;
      // Guard against occasional pointer-lock spikes.
      if (Math.abs(m.movementX) > 400 || Math.abs(m.movementY) > 400) return;
      this.dx += m.movementX;
      this.dy += m.movementY;
    });
    this.listen(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.releaseAll();
      this.onLockChange?.(this.locked);
    });
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.handlers.push([t, type, fn, opts]);
  }

  requestLock(): void {
    if (document.pointerLockElement === this.target) return;
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true } as never) as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => this.target.requestPointerLock());
    } catch {
      try {
        this.target.requestPointerLock();
      } catch {
        /* not available */
      }
    }
  }

  exitLock(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.enabled && this.pressedSet.has(code);
  }

  firePressed(): boolean {
    return this.lmbPressed;
  }

  adsPressed(): boolean {
    return this.rmbPressed;
  }

  /** Clears per-frame edge state and mouse deltas. */
  endFrame(): void {
    this.pressedSet.clear();
    this.lmbPressed = false;
    this.rmbPressed = false;
    this.dx = 0;
    this.dy = 0;
  }

  releaseAll(): void {
    this.down.clear();
    this.lmb = false;
    this.rmb = false;
  }

  dispose(): void {
    for (const [t, type, fn, opts] of this.handlers) t.removeEventListener(type, fn, opts);
    this.handlers = [];
    this.exitLock();
  }
}
