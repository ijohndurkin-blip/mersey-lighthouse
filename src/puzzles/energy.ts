import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, AbstractMesh } from '../babylon';
import { Batch, Shape, T } from '../world/geo';
import { PuzzleHost, pickAt } from './types';
import { TurbineHandles } from '../world/landmarks';
import { easeOutBack } from '../core/noise';

// ============================================================================
// Wind turbine: turn the head to face into the wind
// ============================================================================
export class TurbineControl {
  step = 3; // 8 positions, 45° apart
  readonly target = 6; // facing west (into the westerly wind)
  private yaw: number;
  private spin = 0.25;
  locked = false;
  onAligned: (() => void) | null = null;
  presses = 0;

  constructor(private host: PuzzleHost, public h: TurbineHandles) {
    this.yaw = (this.step * Math.PI) / 4;
    h.head.rotation.y = this.yaw;
  }

  get aligned() {
    return this.step % 8 === this.target;
  }

  turn() {
    if (this.locked) return;
    this.step = (this.step + 1) % 8;
    this.presses++;
    this.host.audio.creak();
    if (this.aligned) {
      this.locked = true;
      setTimeout(() => {
        this.host.audio.whir(true);
        this.onAligned?.();
      }, 700);
    }
  }

  setAlignedInstant() {
    this.step = this.target;
    this.yaw = (this.step * Math.PI) / 4;
    this.locked = true;
    this.spin = 3.2;
  }

  update(dt: number, t: number) {
    const want = (this.step * Math.PI) / 4;
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 4);
    this.h.head.rotation.y = this.yaw;
    const targetSpin = this.aligned ? 3.2 : 0.3 + Math.max(0, Math.cos(this.yaw - (this.target * Math.PI) / 4)) * 0.6;
    this.spin += (targetSpin - this.spin) * Math.min(1, dt * 0.8);
    this.h.rotor.rotation.z += this.spin * dt;
    // windsock flutter (points east, downwind)
    const segs = this.h.sockSegs;
    segs.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 3 + i * 0.8) * 0.12;
      s.rotation.z = -0.08 + Math.sin(t * 2.3 + i) * 0.05;
    });
  }
}

// ============================================================================
// Energy routing panel: rotate wire tiles to connect sources to the lamp
// ============================================================================
const N = 1;
const E = 2;
const S = 4;
const W = 8;
type TileType = 'I' | 'L' | 'T';
const BASE: Record<TileType, number> = { I: N | S, L: N | E, T: N | E | S };
const rotMask = (m: number, r: number) => {
  for (let i = 0; i < (r & 3); i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};

interface Tile {
  c: number;
  r: number;
  type: TileType;
  rot: number;
  want: number[];
  node: TransformNode;
  wire: Mesh;
  wireMat: StandardMaterial;
  shown: number;
  proxy: Mesh;
  powered: number; // bitmask: 1 wind, 2 solar
}

function iconTex(scene: any, kind: 'wind' | 'sun' | 'lamp') {
  const t = new DynamicTexture('icon_' + kind, { width: 256, height: 256 }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.fillStyle = '#fff8ec';
  c.beginPath();
  c.arc(128, 128, 122, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = '#16325c';
  c.stroke();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (kind === 'sun') {
    c.fillStyle = '#ffc93a';
    c.beginPath();
    c.arc(128, 128, 46, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ff9a2a';
    c.lineWidth = 12;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * 62, 128 + Math.sin(a) * 62);
      c.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
      c.stroke();
    }
  } else if (kind === 'wind') {
    c.fillStyle = '#e8ecf0';
    c.fillRect(120, 120, 16, 100);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#4a6a8f';
    c.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(128, 112);
      c.rotate((i / 3) * Math.PI * 2);
      c.beginPath();
      c.ellipse(0, -42, 13, 44, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.fillStyle = '#2fa36b';
    c.beginPath();
    c.arc(128, 112, 12, 0, Math.PI * 2);
    c.fill();
  } else {
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#16325c';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(104, 220);
    c.lineTo(152, 220);
    c.lineTo(144, 100);
    c.lineTo(112, 100);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#e2453f';
    c.fillRect(110, 140, 36, 22);
    c.fillStyle = '#ffd23f';
    c.fillRect(110, 70, 36, 30);
    c.fillStyle = '#e2453f';
    c.beginPath();
    c.moveTo(102, 70);
    c.lineTo(154, 70);
    c.lineTo(128, 44);
    c.closePath();
    c.fill();
  }
  t.hasAlpha = true;
  t.update(true);
  return t;
}

export class CircuitPuzzle {
  active = false;
  solved = false;
  private root: TransformNode;
  private tiles: Tile[] = [];
  private panel: ReturnType<PuzzleHost['ui']['puzzlePanel']> | null = null;
  private time = 0;
  windOn = false;
  solarOn = true;
  windReach = false;
  solarReach = false;
  onSolved: (() => void) | null = null;
  onExit: (() => void) | null = null;
  onPower: ((pct: number, wind: boolean, solar: boolean) => void) | null = null;
  private hintLevel = 0;
  private srcMats: StandardMaterial[] = [];
  private lampMat!: StandardMaterial;
  private finishing = false;
  private lastPct = -1;
  private warnedWind = false;

  constructor(private host: PuzzleHost, private anchor: TransformNode) {
    const { scene, world } = host;
    this.root = new TransformNode('circuit', scene);
    this.root.parent = anchor;
    const layout: [TileType, number][][] = [
      // row 0
      [
        ['I', 1],
        ['L', 2],
        ['L', 0],
        ['I', 0],
      ],
      // row 1
      [
        ['T', 1],
        ['T', 0],
        ['I', 1],
        ['I', 1],
      ],
      // row 2
      [
        ['I', 1],
        ['L', 3],
        ['L', 1],
        ['T', 2],
      ],
    ];
    const solutionCells = new Set(['0,0', '1,0', '1,1', '1,2', '0,2', '2,1', '3,1']);
    const scramble = [2, 1, 2, 3, 0, 3, 1, 2, 3, 2, 0, 1];
    let k = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const [type, solRot] = layout[r][c];
        const node = new TransformNode('tile', scene);
        node.parent = this.root;
        node.position.set(this.colX(c), this.rowY(r), 0.02);
        const base = new Batch();
        base.add(Shape.rbox(0.7, 0.7, 0.12, 0.08, 2), T(0, 0, 0), '#22293a', { ao: 0.1 });
        base.add(Shape.rbox(0.62, 0.62, 0.04, 0.06, 1), T(0, 0, 0.06), '#2f3a50');
        const bm = base.build('tileBase', scene, world.mats.vc, node);
        bm.isPickable = false;
        const wb = new Batch();
        wb.add(Shape.cyl(0.08, 0.16, 0.16, 12), T(0, 0, 0.1, Math.PI / 2, 0, 0), '#ffffff');
        const m = BASE[type];
        const arm = (dx: number, dy: number) => wb.add(Shape.rbox(Math.abs(dx) > 0 ? 0.36 : 0.11, Math.abs(dy) > 0 ? 0.36 : 0.11, 0.08, 0.04, 1), T(dx * 0.17, dy * 0.17, 0.1), '#ffffff');
        // screen directions on the board: up = +y, screen-right = local -x
        if (m & N) arm(0, 1);
        if (m & E) arm(-1, 0);
        if (m & S) arm(0, -1);
        if (m & W) arm(1, 0);
        const wireMat = new StandardMaterial('wireMat', scene);
        wireMat.diffuseColor = new Color3(0.75, 0.48, 0.25);
        wireMat.specularColor = new Color3(0.8, 0.6, 0.4);
        wireMat.emissiveColor = new Color3(0.1, 0.05, 0.02);
        const wire = wb.build('tileWire', scene, wireMat, node);
        wire.isPickable = false;
        const proxy = MeshBuilder.CreateBox('tileProxy', { width: 0.76, height: 0.76, depth: 0.4 }, scene);
        proxy.parent = node;
        proxy.isVisible = false;
        let rot = solutionCells.has(`${c},${r}`) ? (solRot + scramble[k]) % 4 : scramble[k];
        if (solutionCells.has(`${c},${r}`)) {
          const diff = (rot - solRot + 4) % 4;
          if (diff === 0 || (type === 'I' && diff === 2)) rot = (solRot + 1) % 4;
        }
        const tile: Tile = { c, r, type, rot, want: [solRot], node, wire, wireMat, shown: rot, proxy, powered: 0 };
        proxy.metadata = { tile: this.tiles.length };
        this.tiles.push(tile);
        k++;
      }
    }
    // source / lamp badges
    const badge = (kind: 'wind' | 'sun' | 'lamp', x: number, y: number) => {
      const p = MeshBuilder.CreatePlane('badge', { size: 0.62 }, scene);
      const mat = new StandardMaterial('badgeMat', scene);
      mat.diffuseTexture = iconTex(scene, kind);
      mat.useAlphaFromDiffuseTexture = true;
      mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
      mat.specularColor = Color3.Black();
      p.material = mat;
      p.parent = this.root;
      p.position.set(x, y, 0.06);
      p.rotation.y = Math.PI;
      p.isPickable = false;
      // connector stub
      const sb = new Batch();
      sb.add(Shape.rbox(0.3, 0.11, 0.08, 0.04, 1), T(x > 0 ? x - 0.4 : x + 0.4, y, 0.1), '#ffffff');
      const stub = sb.build('stub', scene, mat.clone('stubMat'), this.root);
      (stub.material as StandardMaterial).diffuseTexture = null;
      (stub.material as StandardMaterial).diffuseColor = new Color3(0.75, 0.48, 0.25);
      return { p, mat, stub };
    };
    const w = badge('wind', this.colX(-1) - 0.08, this.rowY(0));
    const s = badge('sun', this.colX(-1) - 0.08, this.rowY(2));
    const l = badge('lamp', this.colX(4) + 0.08, this.rowY(1));
    this.srcMats = [w.stub.material as StandardMaterial, s.stub.material as StandardMaterial];
    this.lampMat = l.stub.material as StandardMaterial;
    this.applyRotations(true);
    this.compute();
  }

  private colX(c: number) {
    return 1.14 - c * 0.76;
  }
  private rowY(r: number) {
    return 2.71 - r * 0.76;
  }

  private applyRotations(instant = false) {
    for (const t of this.tiles) {
      if (instant) t.shown = t.rot;
      t.node.rotation.z = (t.shown * Math.PI) / 2;
    }
  }

  private mask(t: Tile) {
    return rotMask(BASE[t.type], t.rot);
  }

  private at(c: number, r: number) {
    return this.tiles.find((t) => t.c === c && t.r === r);
  }

  compute() {
    for (const t of this.tiles) t.powered = 0;
    const flood = (sc: number, sr: number, bit: number) => {
      const start = this.at(sc, sr)!;
      if (!(this.mask(start) & W)) return false;
      const stack = [start];
      start.powered |= bit;
      let reach = false;
      while (stack.length) {
        const t = stack.pop()!;
        const m = this.mask(t);
        if (t.c === 3 && t.r === 1 && m & E) reach = true;
        const dirs: [number, number, number, number][] = [
          [N, 0, -1, S],
          [E, 1, 0, W],
          [S, 0, 1, N],
          [W, -1, 0, E],
        ];
        for (const [d, dc, dr, opp] of dirs) {
          if (!(m & d)) continue;
          const n = this.at(t.c + dc, t.r + dr);
          if (!n || n.powered & bit) continue;
          if (!(this.mask(n) & opp)) continue;
          n.powered |= bit;
          stack.push(n);
        }
      }
      return reach;
    };
    this.windReach = flood(0, 0, 1);
    this.solarReach = flood(0, 2, 2);
    const pct = (this.windReach && this.windOn ? 50 : 0) + (this.solarReach && this.solarOn ? 50 : 0);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.onPower?.(pct, this.windReach && this.windOn, this.solarReach && this.solarOn);
    }
    return pct;
  }

  setWind(on: boolean) {
    this.windOn = on;
    this.compute();
  }

  enter() {
    if (this.solved) return;
    this.active = true;
    const { cam, ui } = this.host;
    const wm = this.anchor.getWorldMatrix();
    const aspect = this.host.scene.getEngine().getAspectRatio(cam.cam);
    const dist = aspect < 1.2 ? 4.6 / Math.max(0.5, aspect) : 4.6;
    cam.setFixed(Vector3.TransformCoordinates(new Vector3(0, 2.0, dist), wm), Vector3.TransformCoordinates(new Vector3(0, 1.85, 0), wm));
    this.panel = ui.puzzlePanel('Power Up the Lighthouse', () => this.exit(), () => this.hint());
    this.panel.set('Tap the tiles to <b>turn</b> them. Make a <b>complete path</b> from the wind turbine and the solar battery to the lighthouse lamp!');
    this.panel.steps(1, 0);
    this.hintLevel = 0;
  }

  exit() {
    this.active = false;
    this.panel?.close();
    this.panel = null;
    this.onExit?.();
  }

  tap(x: number, y: number) {
    if (!this.active || this.finishing) return;
    const hit = pickAt(this.host.scene, x, y, (m: AbstractMesh) => !!m.metadata && m.metadata.tile !== undefined && m.isEnabled());
    if (!hit || !hit.pickedMesh) return;
    const t = this.tiles[hit.pickedMesh.metadata.tile];
    t.rot = (t.rot + 1) % 4;
    this.host.audio.click();
    const before = this.lastPct;
    const pct = this.compute();
    if (pct > before && pct > 0) {
      this.host.audio.zap();
      this.host.fx.sparkle(t.node.getAbsolutePosition(), new Color4(0.4, 1, 1, 1), 18);
    }
    if (this.windReach && this.solarReach && !this.windOn && !this.warnedWind) {
      this.warnedWind = true;
      this.host.pipSay('The wires are perfect! But the <b>wind turbine</b> isn\'t making power yet. Let\'s point it into the wind!', 6);
    }
    if (pct >= 100 && !this.finishing) {
      this.finishing = true;
      setTimeout(() => this.finish(), 900);
    }
  }

  private finish() {
    this.solved = true;
    this.active = false;
    this.panel?.close();
    this.panel = null;
    this.host.audio.success();
    this.onSolved?.();
  }

  solveInstant() {
    const solved: Record<string, number> = { '0,0': 1, '1,0': 2, '1,1': 0, '1,2': 3, '0,2': 1, '2,1': 1, '3,1': 1 };
    for (const t of this.tiles) {
      const k = `${t.c},${t.r}`;
      if (k in solved) t.rot = solved[k];
    }
    this.applyRotations(true);
    this.compute();
    this.solved = true;
  }

  debugTargets(pr: (m: TransformNode) => { x: number; y: number }) {
    return {
      tiles: this.tiles.map((t, i) => ({ i, c: t.c, r: t.r, type: t.type, rot: t.rot, ...pr(t.node) })),
      wind: this.windReach,
      solar: this.solarReach,
      pct: this.lastPct,
    };
  }

  hint() {
    this.hintLevel++;
    const texts = [
      'Electricity needs a <b>joined-up path</b> with no gaps – like a road with no broken bits!',
      'Start at the turbine on the left. Turn each tile so its wire <b>touches</b> the next one.',
      'Both paths meet in the <b>middle column</b>, then go straight across to the lamp on the right.',
    ];
    this.host.pipSay(texts[Math.min(this.hintLevel - 1, texts.length - 1)], 7);
  }

  update(dt: number) {
    this.time += dt;
    for (const t of this.tiles) {
      // animate rotation toward the logical rotation (always clockwise)
      if (t.shown !== t.rot) {
        const target = t.shown < t.rot ? t.rot : t.rot + 4;
        let cur = t.node.rotation.z / (Math.PI / 2);
        cur += dt * 8;
        if (cur >= target) {
          t.shown = t.rot;
          cur = t.rot;
        }
        t.node.rotation.z = (cur * Math.PI) / 2;
      }
      const wind = t.powered & 1 && this.windOn;
      const solar = t.powered & 2 && this.solarOn;
      const on = wind || solar;
      const pulse = 0.65 + Math.sin(this.time * 6 - t.c * 0.8) * 0.35;
      const target = on ? (wind && solar ? new Color3(0.5, 1, 0.8) : wind ? new Color3(0.3, 0.9, 1) : new Color3(1, 0.85, 0.3)).scale(pulse) : new Color3(0.1, 0.05, 0.02);
      t.wireMat.emissiveColor = Color3.Lerp(t.wireMat.emissiveColor, target, Math.min(1, dt * 8));
      t.proxy.setEnabled(this.active);
    }
    const sw = this.windOn ? new Color3(0.3, 0.9, 1).scale(0.7 + Math.sin(this.time * 5) * 0.3) : new Color3(0.08, 0.04, 0.02);
    const ss = this.solarOn ? new Color3(1, 0.85, 0.3).scale(0.7 + Math.sin(this.time * 5 + 1) * 0.3) : new Color3(0.08, 0.04, 0.02);
    this.srcMats[0].emissiveColor = sw;
    this.srcMats[1].emissiveColor = ss;
    const lit = this.lastPct >= 100;
    this.lampMat.emissiveColor = lit ? new Color3(1, 0.95, 0.6) : new Color3(0.08 + this.lastPct / 400, 0.05, 0.02);
    void easeOutBack;
  }
}
