/**
 * Unified input: keyboard, mouse-drag camera, touch joystick + touch camera.
 * Designed so controls never get "stuck": every pointer is tracked by id and
 * all state is cleared on blur / visibility change / pointercancel.
 */
export class Input {
  keys = new Set<string>();
  moveX = 0; // -1..1 (right +)
  moveY = 0; // -1..1 (forward +)
  run = false;
  lookDX = 0;
  lookDY = 0;
  zoomDelta = 0;
  private jumpQueued = false;
  private interactQueued = false;
  private pauseQueued = false;
  private hintQueued = false;
  enabled = true;
  /** when true, left-side touches don't create a joystick (puzzle mode) */
  joystickEnabled = true;
  onTap: ((x: number, y: number) => void) | null = null;
  onAnyInput: (() => void) | null = null;
  lastInputTime = performance.now();

  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookIds = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>();
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  touchMode = false;

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    uiRoot.appendChild(this.joyBase);

    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    canvas.addEventListener('pointerdown', (e) => this.pDown(e));
    window.addEventListener('pointermove', (e) => this.pMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.pUp(e));
    window.addEventListener('pointercancel', (e) => this.pUp(e, true));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomDelta += Math.sign(e.deltaY);
      this.touched();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // stop the page from scrolling / zooming on mobile
    document.addEventListener('touchmove', (e) => {
      if ((e.target as HTMLElement)?.closest?.('.scrollable')) return;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private touched() {
    this.lastInputTime = performance.now();
    this.onAnyInput?.();
  }

  private keyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter') this.interactQueued = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQueued = true;
      if (e.code === 'KeyH') this.hintQueued = true;
    }
    this.keys.add(e.code);
    this.touchMode = false;
    this.touched();
  }

  private pDown(e: PointerEvent) {
    if (!this.enabled) return;
    this.touched();
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    this.touchMode = isTouch;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (isTouch && this.joystickEnabled && this.joyId === null && e.clientX < window.innerWidth * 0.45) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.classList.add('on');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
  }

  private pMove(e: PointerEvent) {
    if (this.joyId === e.pointerId) {
      e.preventDefault();
      const max = 56;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > max) {
        // let the base follow the finger so the stick never feels "stuck"
        const over = l - max;
        this.joyOrigin.x += (dx / l) * over;
        this.joyOrigin.y += (dy / l) * over;
        this.joyBase.style.left = `${this.joyOrigin.x}px`;
        this.joyBase.style.top = `${this.joyOrigin.y}px`;
        dx = (dx / l) * max;
        dy = (dy / l) * max;
      }
      this.joyVec = { x: dx / max, y: -dy / max };
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.touched();
      return;
    }
    const lk = this.lookIds.get(e.pointerId);
    if (lk) {
      const dx = e.clientX - lk.x;
      const dy = e.clientY - lk.y;
      lk.x = e.clientX;
      lk.y = e.clientY;
      if (Math.hypot(e.clientX - lk.sx, e.clientY - lk.sy) > 8) lk.moved = true;
      if (lk.moved) {
        const sens = e.pointerType === 'mouse' ? 1 : 1.5;
        this.lookDX += dx * sens;
        this.lookDY += dy * sens;
      }
      this.touched();
    }
  }

  private pUp(e: PointerEvent, cancel = false) {
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.joyId === e.pointerId) {
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.classList.remove('on');
      return;
    }
    const lk = this.lookIds.get(e.pointerId);
    if (lk) {
      this.lookIds.delete(e.pointerId);
      if (!cancel && !lk.moved && performance.now() - lk.t < 450) this.onTap?.(e.clientX, e.clientY);
    }
  }

  reset() {
    this.keys.clear();
    this.joyId = null;
    this.joyVec = { x: 0, y: 0 };
    this.joyBase.classList.remove('on');
    this.lookIds.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpQueued = false;
    this.interactQueued = false;
  }

  /** Called once per frame before gameplay reads input. */
  poll() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('KeyQ')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joyId !== null) {
      x = this.joyVec.x;
      y = this.joyVec.y;
      run = Math.hypot(x, y) > 0.92;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    if (!this.enabled) {
      x = 0;
      y = 0;
    }
    this.moveX = x;
    this.moveY = y;
    this.run = run;
  }

  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY, zoom: this.zoomDelta };
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    return r;
  }
  pressJump() {
    this.jumpQueued = true;
    this.touched();
  }
  pressInteract() {
    this.interactQueued = true;
    this.touched();
  }
  pressPause() {
    this.pauseQueued = true;
  }
  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j && this.enabled;
  }
  consumeInteract() {
    const j = this.interactQueued;
    this.interactQueued = false;
    return j && this.enabled;
  }
  consumePause() {
    const j = this.pauseQueued;
    this.pauseQueued = false;
    return j;
  }
  consumeHint() {
    const j = this.hintQueued;
    this.hintQueued = false;
    return j;
  }
}
