import { ICONS, PORTRAITS } from './art';
import type { QualityLevel } from '../core/quality';

export interface Line {
  who: 'pip' | 'finn' | 'prof' | 'explorer';
  text: string;
}

const NAMES: Record<Line['who'], [string, string]> = {
  pip: ['Pip', '#2f8fd8'],
  finn: ['Captain Finn', '#24406e'],
  prof: ['Professor Cogsworth', '#3f8f5a'],
  explorer: ['You', '#ff8a2a'],
};

const h = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};

export class UI {
  hud: HTMLElement;
  private objective: HTMLElement;
  private progress: HTMLElement;
  private counter: HTMLElement;
  private inventory: HTMLElement;
  private power: HTMLElement;
  private markerEl: HTMLElement;
  private promptEl: HTMLElement;
  private toasts: HTMLElement;
  private touch: HTMLElement;
  private actBtn: HTMLElement;
  private pipBtn: HTMLElement;
  private soundBtn: HTMLElement;
  private fadeEl: HTMLElement;
  private flashEl: HTMLElement;
  private captionEl: HTMLElement;
  private letterbox: HTMLElement;
  private pipSayEl: HTMLElement | null = null;
  private pipSayTimer = 0;
  dialogueOpen = false;
  private dialogueAdvance: (() => void) | null = null;
  onVoice: ((who: Line['who']) => void) | null = null;
  onPause: (() => void) | null = null;
  onHint: (() => void) | null = null;
  onSoundToggle: (() => void) | null = null;
  onInteractTap: (() => void) | null = null;
  onJumpTap: (() => void) | null = null;
  onClick: (() => void) | null = null;
  private skipBtn: HTMLElement | null = null;

  constructor(private root: HTMLElement) {
    this.letterbox = h(`<div class="letterbox"></div>`);
    root.appendChild(this.letterbox);
    this.hud = h(`<div class="hud hidden"></div>`);
    root.appendChild(this.hud);
    this.objective = h(`<div class="objective"><div class="ic"></div><div><div class="tx"></div><div class="sub"></div></div></div>`);
    this.progress = h(`<div class="progress" aria-label="Mission progress"></div>`);
    const steps = ['bridge', 'gear', 'bolt', 'lighthouse'];
    steps.forEach((s, i) => {
      if (i) this.progress.appendChild(h(`<div class="ln"></div>`));
      const b = h(`<div class="b" data-k="${s}">${ICONS[s]}</div>`);
      this.progress.appendChild(b);
    });
    this.counter = h(`<div class="counter" title="Starfish found">${ICONS.starfish}<span>0/12</span></div>`);
    this.inventory = h(`<div class="inventory"></div>`);
    this.power = h(`<div class="power hidden"><div class="lbl">${ICONS.bolt}<span>Lighthouse Power</span></div><div class="meter"><div></div></div><div class="src"><span class="w">● Wind</span><span class="s">● Solar battery</span></div></div>`);
    this.markerEl = h(`<div class="marker hidden"><div class="arrow hidden"></div><div class="pin"><i></i></div><div class="dist"></div></div>`);
    this.promptEl = h(`<div class="prompt hidden"><kbd>E</kbd><span></span></div>`);
    this.promptEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onInteractTap?.();
    });
    const tr = h(`<div class="topright"></div>`);
    this.pipBtn = h(`<button class="round pipbtn" aria-label="Ask Pip for a hint" title="Ask Pip for a hint (H)">${PORTRAITS.pip}</button>`);
    this.soundBtn = h(`<button class="round" aria-label="Sound on or off" title="Sound">${ICONS.sound}</button>`);
    const pauseBtn = h(`<button class="round" aria-label="Pause" title="Pause (Esc)">${ICONS.pause}</button>`);
    this.pipBtn.addEventListener('click', () => this.onHint?.());
    this.soundBtn.addEventListener('click', () => this.onSoundToggle?.());
    pauseBtn.addEventListener('click', () => this.onPause?.());
    tr.append(this.pipBtn, this.soundBtn, pauseBtn);
    this.touch = h(`<div class="touch hidden">
      <div class="tbtn act dim" role="button" aria-label="Action">${ICONS.hand}<span class="lab"></span></div>
      <div class="tbtn jump" role="button" aria-label="Jump">${ICONS.jump}</div>
      <div class="hint">Drag left side to walk · drag right side to look</div>
    </div>`);
    this.actBtn = this.touch.querySelector('.act') as HTMLElement;
    this.actBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteractTap?.();
    });
    (this.touch.querySelector('.jump') as HTMLElement).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onJumpTap?.();
    });
    this.hud.append(this.objective, this.progress, this.counter, this.inventory, this.power, this.markerEl, this.promptEl, tr, this.touch);
    this.toasts = h(`<div class="toasts"></div>`);
    root.appendChild(this.toasts);
    this.captionEl = h(`<div class="caption"></div>`);
    root.appendChild(this.captionEl);
    this.fadeEl = h(`<div class="fade"></div>`);
    this.flashEl = h(`<div class="screenflash"></div>`);
    root.append(this.fadeEl, this.flashEl);
    window.addEventListener('keydown', (e) => {
      if (this.dialogueOpen && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) {
        e.preventDefault();
        this.dialogueAdvance?.();
      }
    });
  }

  // ---------------------------------------------------------------- loading
  loading(): { set: (p: number, label: string) => void; done: () => void } {
    const el = h(`<div class="loading"><div class="inner"><div class="lh">${ICONS.lighthouse}</div><div class="bar"><div class="fill"></div></div><div class="label">Loading…</div></div></div>`);
    this.root.appendChild(el);
    const fill = el.querySelector('.fill') as HTMLElement;
    const label = el.querySelector('.label') as HTMLElement;
    return {
      set: (p, l) => {
        fill.style.width = `${Math.round(p * 100)}%`;
        label.textContent = l;
      },
      done: () => {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        setTimeout(() => el.remove(), 900);
      },
    };
  }

  // ---------------------------------------------------------------- title
  title(opts: { canContinue: boolean; look: number; looks: { skin: string; shirt: string; hair: string }[]; onLook: (i: number) => void; onStart: () => void; onContinue: () => void; onFullscreen: () => void }) {
    const el = h(`<div class="title">
      <div class="logo"><h1><span class="wave">Mission</span> <span class="wave" style="animation-delay:.3s">Mersey</span></h1><h2>The Lighthouse Rescue</h2></div>
      <div class="actions">
        <div class="looks"><span>Your panda:</span></div>
        <div class="row">
          <button class="btn start">▶ Start Adventure</button>
          ${opts.canContinue ? '<button class="btn blue cont">Continue</button>' : ''}
        </div>
        <div class="row"><button class="round fs" aria-label="Full screen" title="Full screen">${ICONS.fullscreen}</button></div>
      </div>
    </div>`);
    const credit = h(`<div class="credit">An original adventure · Developed by <b>Rare² Labs</b></div>`);
    const looks = el.querySelector('.looks') as HTMLElement;
    opts.looks.forEach((l, i) => {
      const b = h(`<button aria-label="Explorer style ${i + 1}" class="${i === opts.look ? 'sel' : ''}"><svg viewBox="0 0 40 40"><rect width="40" height="40" fill="${l.shirt}"/><circle cx="11" cy="11" r="5" fill="${l.hair}"/><circle cx="29" cy="11" r="5" fill="${l.hair}"/><circle cx="20" cy="21" r="12" fill="${l.skin}"/><ellipse cx="15" cy="20" rx="3.5" ry="4.5" fill="${l.hair}"/><ellipse cx="25" cy="20" rx="3.5" ry="4.5" fill="${l.hair}"/><circle cx="15" cy="20" r="1.6" fill="#fff"/><circle cx="25" cy="20" r="1.6" fill="#fff"/><ellipse cx="20" cy="25" rx="2" ry="1.4" fill="${l.hair}"/><path d="M17 28q3 3 6 0" stroke="#5a1a22" stroke-width="1.4" fill="none"/></svg></button>`);
      b.addEventListener('click', () => {
        looks.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        opts.onLook(i);
      });
      looks.appendChild(b);
    });
    const close = () => {
      el.remove();
      credit.remove();
    };
    (el.querySelector('.start') as HTMLElement).addEventListener('click', () => {
      close();
      opts.onStart();
    });
    el.querySelector('.cont')?.addEventListener('click', () => {
      close();
      opts.onContinue();
    });
    (el.querySelector('.fs') as HTMLElement).addEventListener('click', () => opts.onFullscreen());
    this.root.append(el, credit);
    (el.querySelector('.start') as HTMLElement).focus();
    return close;
  }

  // ---------------------------------------------------------------- HUD
  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }
  setTouch(on: boolean) {
    this.touch.classList.toggle('hidden', !on);
  }
  setObjective(text: string, icon: string, sub = '') {
    const changed = (this.objective.querySelector('.tx') as HTMLElement).textContent !== text;
    (this.objective.querySelector('.ic') as HTMLElement).innerHTML = ICONS[icon] ?? ICONS.star;
    (this.objective.querySelector('.tx') as HTMLElement).textContent = text;
    (this.objective.querySelector('.sub') as HTMLElement).textContent = sub;
    if (changed) {
      this.objective.classList.remove('objflash');
      void this.objective.offsetWidth;
      this.objective.classList.add('objflash');
    }
  }
  setProgress(done: number) {
    const bs = this.progress.querySelectorAll('.b');
    bs.forEach((b, i) => {
      b.classList.toggle('done', i < done);
      b.classList.toggle('cur', i === done);
    });
  }
  setStarfish(n: number, total: number, pop = false) {
    (this.counter.querySelector('span') as HTMLElement).textContent = `${n}/${total}`;
    if (pop) {
      this.counter.classList.remove('pop');
      void this.counter.offsetWidth;
      this.counter.classList.add('pop');
    }
  }
  setInventory(items: string[]) {
    this.inventory.innerHTML = items.map((i) => `<div class="it" title="${i}">${ICONS[i] ?? ''}</div>`).join('');
  }
  setPower(pct: number | null, wind = false, solar = false) {
    this.power.classList.toggle('hidden', pct === null);
    if (pct === null) return;
    (this.power.querySelector('.meter div') as HTMLElement).style.width = `${pct}%`;
    (this.power.querySelector('.w') as HTMLElement).classList.toggle('on', wind);
    (this.power.querySelector('.s') as HTMLElement).classList.toggle('on', solar);
    (this.power.querySelector('.w') as HTMLElement).textContent = `${wind ? '✔' : '●'} Wind`;
    (this.power.querySelector('.s') as HTMLElement).textContent = `${solar ? '✔' : '●'} Solar battery`;
  }
  setSound(on: boolean) {
    this.soundBtn.innerHTML = on ? ICONS.sound : ICONS.mute;
  }
  pulseHint(on: boolean) {
    this.pipBtn.classList.toggle('pulse', on);
  }

  marker(x: number, y: number, visible: boolean, onScreen: boolean, dist: number, angle = 0) {
    this.markerEl.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.markerEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    this.markerEl.classList.toggle('edge', !onScreen);
    const ar = this.markerEl.querySelector('.arrow') as HTMLElement;
    ar.classList.toggle('hidden', onScreen);
    if (!onScreen) {
      ar.style.transform = `rotate(${angle}rad) translateY(-26px)`;
      ar.style.top = '12px';
    }
    (this.markerEl.querySelector('.dist') as HTMLElement).textContent = `${Math.round(dist)} m`;
  }

  prompt(text: string | null, touch: boolean) {
    this.promptEl.classList.toggle('hidden', !text || touch);
    if (text) (this.promptEl.querySelector('span') as HTMLElement).textContent = text;
    this.actBtn.classList.toggle('dim', !text);
    this.actBtn.classList.toggle('ready', !!text);
    (this.actBtn.querySelector('.lab') as HTMLElement).textContent = text ?? '';
  }

  // ---------------------------------------------------------------- dialogue
  async dialogue(lines: Line[], opts: { onLine?: (l: Line, i: number) => void } = {}): Promise<void> {
    this.dialogueOpen = true;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      opts.onLine?.(l, i);
      await this.showLine(l, i === lines.length - 1);
    }
    this.dialogueOpen = false;
  }

  private showLine(l: Line, last: boolean): Promise<void> {
    return new Promise((resolve) => {
      const [name, color] = NAMES[l.who];
      const el = h(`<div class="dialogue" role="dialog" aria-live="polite"><div class="por">${PORTRAITS[l.who]}</div><div style="flex:1"><div class="name" style="background:${color}">${name}</div><div class="text"></div></div><div class="next">${last ? '✔' : '▼'}</div></div>`);
      this.root.appendChild(el);
      const tx = el.querySelector('.text') as HTMLElement;
      let i = 0;
      let done = false;
      const full = l.text;
      const timer = window.setInterval(() => {
        i += 1;
        tx.textContent = full.slice(0, i);
        if (i % 3 === 0 && full[i - 1] !== ' ') this.onVoice?.(l.who);
        if (i >= full.length) {
          done = true;
          clearInterval(timer);
        }
      }, 24);
      const opened = performance.now();
      this.dialogueAdvance = () => {
        if (performance.now() - opened < 180) return;
        if (!done) {
          done = true;
          clearInterval(timer);
          tx.textContent = full;
          return;
        }
        this.dialogueAdvance = null;
        el.remove();
        this.onClick?.();
        resolve();
      };
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.dialogueAdvance?.();
      });
    });
  }

  pipSay(text: string, dur = 5) {
    this.pipSayEl?.remove();
    const el = h(`<div class="pipsay" role="status" aria-live="polite"><div class="por">${PORTRAITS.pip}</div><div class="bub">${text}</div></div>`);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.remove();
    });
    this.root.appendChild(el);
    this.pipSayEl = el;
    clearTimeout(this.pipSayTimer);
    this.pipSayTimer = window.setTimeout(() => {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, dur * 1000);
    for (let i = 0; i < Math.min(8, text.length / 6); i++) setTimeout(() => this.onVoice?.('pip'), i * 70);
  }

  toast(text: string, icon = 'star') {
    const el = h(`<div class="toast"><div class="ic">${ICONS[icon] ?? ''}</div><span>${text}</span></div>`);
    this.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, 2600);
  }

  achievement(title: string, desc: string, icon: string, dur = 3.2): Promise<void> {
    return new Promise((res) => {
      const el = h(`<div class="achv"><div class="medal">${ICONS[icon] ?? ICONS.star}</div><div class="t1">Badge earned</div><div class="t2">${title}</div><div class="t3">${desc}</div></div>`);
      this.root.appendChild(el);
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => {
          el.remove();
          res();
        }, 500);
      }, dur * 1000);
    });
  }

  feedback(text: string, kind: 'good' | 'oops' = 'good') {
    const el = h(`<div class="feedback ${kind}">${text}</div>`);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  // ---------------------------------------------------------------- puzzle panel
  puzzlePanel(title: string, onExit: () => void, onHint: () => void) {
    const el = h(`<div class="puzzle"><div class="pt">${title}</div><div class="pi"></div><div class="puzzle-step"></div></div>`);
    const btns = h(`<div class="puzzle-btns"><button class="round" aria-label="Leave puzzle" title="Leave">${ICONS.exit}</button><button class="round pipbtn" aria-label="Ask Pip for a hint" title="Hint">${PORTRAITS.pip}</button></div>`);
    const [ex, hi] = Array.from(btns.querySelectorAll('button'));
    ex.addEventListener('click', onExit);
    hi.addEventListener('click', onHint);
    this.root.append(el, btns);
    return {
      set: (text: string) => ((el.querySelector('.pi') as HTMLElement).innerHTML = text),
      steps: (n: number, cur: number) => {
        (el.querySelector('.puzzle-step') as HTMLElement).innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < cur ? 'on' : i === cur ? 'cur' : ''}"></i>`).join('');
      },
      close: () => {
        el.remove();
        btns.remove();
      },
    };
  }

  // ---------------------------------------------------------------- cinematic helpers
  setLetterbox(on: boolean) {
    this.letterbox.classList.toggle('on', on);
  }
  caption(text: string | null) {
    if (text) this.captionEl.textContent = text;
    this.captionEl.classList.toggle('on', !!text);
  }
  showSkip(onSkip: (() => void) | null) {
    this.skipBtn?.remove();
    this.skipBtn = null;
    if (!onSkip) return;
    const b = h(`<button class="btn small blue skipbtn">Skip ⏭</button>`);
    b.addEventListener('click', () => {
      b.remove();
      onSkip();
    });
    this.root.appendChild(b);
    this.skipBtn = b;
  }
  fade(on: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, 650));
  }
  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  // ---------------------------------------------------------------- pause
  pauseMenu(o: {
    music: number;
    sfx: number;
    quality: QualityLevel;
    sensitivity: number;
    onMusic: (v: number) => void;
    onSfx: (v: number) => void;
    onQuality: (q: QualityLevel) => void;
    onSensitivity: (v: number) => void;
    onResume: () => void;
    onRestart: () => void;
  }) {
    const el = h(`<div class="modal"><div class="card scrollable" role="dialog" aria-label="Paused">
      <h2>Paused</h2>
      <div class="opt"><label for="mv">🎵 Music</label><input id="mv" type="range" min="0" max="1" step="0.05" value="${o.music}"></div>
      <div class="opt"><label for="sv">🔊 Sounds</label><input id="sv" type="range" min="0" max="1" step="0.05" value="${o.sfx}"></div>
      <div class="opt"><label for="cs">🎥 Camera speed</label><input id="cs" type="range" min="0.4" max="2" step="0.1" value="${o.sensitivity}"></div>
      <div class="opt"><span>✨ Graphics</span><div class="seg">${(['low', 'medium', 'high'] as QualityLevel[]).map((q) => `<button data-q="${q}" class="${q === o.quality ? 'sel' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <div class="help"><b>How to play</b><br>
        <kbd>W A S D</kbd> or arrows – walk · hold <kbd>Shift</kbd> – run<br>
        <kbd>Space</kbd> – jump · <kbd>E</kbd> – talk / use · <kbd>H</kbd> – ask Pip<br>
        Drag the mouse to look around · scroll to zoom<br>
        On a phone or tablet: drag the left side to walk, drag the right side to look, and tap the orange button to use things.</div>
      <div class="btns"><button class="btn green resume">Keep Playing</button><button class="btn small blue restart">Start Again</button></div>
    </div></div>`);
    (el.querySelector('#mv') as HTMLInputElement).addEventListener('input', (e) => o.onMusic(+(e.target as HTMLInputElement).value));
    (el.querySelector('#sv') as HTMLInputElement).addEventListener('input', (e) => o.onSfx(+(e.target as HTMLInputElement).value));
    (el.querySelector('#cs') as HTMLInputElement).addEventListener('input', (e) => o.onSensitivity(+(e.target as HTMLInputElement).value));
    el.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        el.querySelectorAll('.seg button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        o.onQuality((b as HTMLElement).dataset.q as QualityLevel);
      }),
    );
    (el.querySelector('.resume') as HTMLElement).addEventListener('click', () => {
      el.remove();
      o.onResume();
    });
    (el.querySelector('.restart') as HTMLElement).addEventListener('click', () => {
      if (el.querySelector('.restart')!.textContent === 'Start Again') {
        el.querySelector('.restart')!.textContent = 'Tap again to restart';
        return;
      }
      el.remove();
      o.onRestart();
    });
    this.root.appendChild(el);
    (el.querySelector('.resume') as HTMLElement).focus();
    return () => el.remove();
  }

  // ---------------------------------------------------------------- completion
  complete(o: { badges: { title: string; desc: string; icon: string; got: boolean }[]; starfish: number; total: number; time: string; onReplay: () => void; onExplore: () => void }) {
    const el = h(`<div class="modal complete"><div class="card scrollable">
      <h1>Lighthouse Hero!</h1>
      <div class="sub">You saved Mersey Isle and guided the rescue boat home safely.</div>
      <div class="badges">${o.badges
        .map((b, i) => `<div class="badge ${b.got ? '' : 'locked'}" style="animation-delay:${0.15 * i}s"><div class="md">${ICONS[b.icon]}</div><b>${b.title}</b><span>${b.desc}</span></div>`)
        .join('')}</div>
      <div class="learned"><b>What you discovered:</b><br>🌉 Triangles make strong, steady shapes · posts must match their gaps<br>⚙️ Touching gears always spin opposite ways<br>💨 Turbines must face into the wind · ☀️ energy can be stored in batteries<br>💡 Electricity needs a complete path to reach the lamp</div>
      <div class="sub" style="margin-top:12px">⭐ Starfish found: <b>${o.starfish}/${o.total}</b> · ⏱ ${o.time}</div>
      <div class="btns"><button class="btn green explore">Keep Exploring</button><button class="btn blue replay">Play Again</button></div>
      <div style="margin-top:14px;font-size:13px;font-weight:700;color:#7a8fa8">An original interactive story · Developed by Rare² Labs</div>
    </div></div>`);
    (el.querySelector('.explore') as HTMLElement).addEventListener('click', () => {
      el.remove();
      o.onExplore();
    });
    (el.querySelector('.replay') as HTMLElement).addEventListener('click', () => {
      el.remove();
      o.onReplay();
    });
    this.root.appendChild(el);
  }
}
