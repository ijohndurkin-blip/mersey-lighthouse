import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, AbstractMesh } from '../babylon';
import { Batch, Shape, T, gearVD } from '../world/geo';
import { PuzzleHost, pickAt } from './types';
import { easeInOut, easeOutBack } from '../core/noise';

type Size = 'S' | 'M' | 'L';
const U = 0.9;
const R: Record<Size, number> = { S: 0.55 * U, M: 0.85 * U, L: 1.25 * U };
const COLORS: Record<Size, string> = { S: '#e7b84a', M: '#d98a3a', L: '#c9a24a' };

interface Gear {
  id: number;
  size: Size;
  r: number;
  teeth: number;
  node: TransformNode;
  mesh: Mesh;
  peg: number | null; // index into pegs, null = in storage
  fixed: boolean;
  angle: number;
  omega: number;
  storePos: Vector3;
  proxy: Mesh;
  tween: { from: Vector3; to: Vector3; s0: number; s1: number; t: number; done?: () => void } | null;
}

interface Peg {
  pos: Vector3;
  mesh: Mesh;
  glow: Mesh;
  proxy: Mesh;
  gear: Gear | null;
}

function arrowTexture(scene: any, ccw: boolean, color: string) {
  const t = new DynamicTexture('arrowTex', { width: 256, height: 256 }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, 256, 256);
  c.lineWidth = 26;
  c.strokeStyle = color;
  c.lineCap = 'round';
  const a0 = ccw ? -0.2 : Math.PI + 0.2;
  const a1 = ccw ? -Math.PI * 1.45 : Math.PI * 2.45;
  c.beginPath();
  c.arc(128, 128, 88, a0, a1, ccw);
  c.stroke();
  // arrow head at a1
  const hx = 128 + Math.cos(a1) * 88;
  const hy = 128 + Math.sin(a1) * 88;
  const dir = ccw ? -1 : 1;
  const tx = -Math.sin(a1) * dir;
  const ty = Math.cos(a1) * dir;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(hx + tx * 40, hy + ty * 40);
  c.lineTo(hx - ty * 34 - tx * 6, hy + tx * 34 - ty * 6);
  c.lineTo(hx + ty * 34 - tx * 6, hy - tx * 34 - ty * 6);
  c.closePath();
  c.fill();
  t.hasAlpha = true;
  t.update(true);
  return t;
}

export class GearPuzzle {
  active = false;
  solved = false;
  private root: TransformNode;
  private gears: Gear[] = [];
  private pegs: Peg[] = [];
  private driver!: Gear;
  private output!: Gear;
  private selected: Gear | null = null;
  private panel: ReturnType<PuzzleHost['ui']['puzzlePanel']> | null = null;
  private time = 0;
  private outputState: 'still' | 'wrong' | 'right' = 'still';
  private stateTime = 0;
  private wrongShown = false;
  private vaultDoor!: TransformNode;
  private vaultOpen = 0;
  lens!: Mesh;
  private lensMat!: StandardMaterial;
  private hintLevel = 0;
  private wrongCount = 0;
  private arrowGood!: Mesh;
  private arrowDrive!: Mesh;
  private redMat: StandardMaterial;
  private boardMat!: StandardMaterial;
  private gearMat!: StandardMaterial;
  onSolved: (() => void) | null = null;
  onExit: (() => void) | null = null;
  private finishing = false;
  wheelSpeed = 1.1;

  constructor(private host: PuzzleHost, anchor: TransformNode) {
    const { scene, world } = host;
    this.root = new TransformNode('gearPuzzle', scene);
    this.root.parent = anchor;
    this.redMat = new StandardMaterial('gearRed', scene);
    this.redMat.diffuseColor = new Color3(1, 0.4, 0.35);
    this.redMat.emissiveColor = new Color3(0.4, 0.05, 0.05);
    const y0 = -0.52;
    // local +x is on the viewer's LEFT (the board faces +z), and the water wheel is on that side
    const D = new Vector3(1.53, y0, 0);
    const X = new Vector3(0, y0, 0);
    const O = new Vector3(-1.53, y0, 0);
    const ang = ((180 - 50) * Math.PI) / 180;
    const A = D.add(new Vector3(Math.cos(ang), Math.sin(ang), 0).scale(R.M + R.L));
    // B: intersection of circle(A, L+S) and circle(O, S+M), upper solution
    const r1 = R.L + R.S;
    const r2 = R.S + R.M;
    const d = Vector3.Distance(A, O);
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const hh = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const dir = O.subtract(A).scale(1 / d);
    const mid = A.add(dir.scale(a));
    const perp = new Vector3(-dir.y, dir.x, 0);
    const B1 = mid.add(perp.scale(hh));
    const B2 = mid.subtract(perp.scale(hh));
    const B = B1.y > B2.y ? B1 : B2;

    // bright, evenly lit materials so the puzzle reads clearly inside the workshop
    this.boardMat = new StandardMaterial('gearBoardMat', scene);
    this.boardMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
    this.boardMat.specularColor = new Color3(0.05, 0.05, 0.05);
    this.boardMat.emissiveColor = new Color3(0.42, 0.4, 0.37);
    this.gearMat = new StandardMaterial('gearMat', scene);
    this.gearMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
    this.gearMat.specularColor = new Color3(0.6, 0.55, 0.4);
    this.gearMat.specularPower = 40;
    this.gearMat.emissiveColor = new Color3(0.36, 0.34, 0.3);
    // board decorations: backing, bolts, shelf
    const bb = new Batch();
    bb.add(Shape.rbox(8.6, 5.0, 0.3, 0.15, 2), T(0, -0.05, -0.17), '#7a5638', { ao: 0.2 });
    bb.add(Shape.rbox(8.2, 4.6, 0.12, 0.1, 1), T(0, -0.05, -0.05), '#e8d4aa');
    for (const [x, y] of [
      [-3.7, 1.9],
      [3.7, 1.9],
      [-3.7, -1.9],
      [3.7, -1.9],
    ])
      bb.add(Shape.sphere(0.18, 8), T(x, y, 0.05), '#9aa3ad');
    // storage shelf strip
    bb.add(Shape.rbox(7.6, 0.12, 0.5, 0.04, 1), T(0, -2.32, 0.2), '#8b5e3c');
    bb.add(Shape.rbox(7.6, 0.9, 0.06, 0.03, 1), T(0, -1.9, 0.02), '#c9b088');
    // drive shaft from the side (water wheel)
    bb.add(Shape.cyl(2.3, 0.18, 0.18, 10), T(D.x + 1.4, D.y, -0.05, 0, 0, Math.PI / 2), '#6b6f78');
    // vault box
    bb.add(Shape.rbox(1.5, 1.5, 0.9, 0.12, 2), T(-3.0, 1.0, 0.3), '#5a6b7a', { ao: 0.3 });
    bb.add(Shape.rbox(1.65, 0.2, 1.0, 0.06, 1), T(-3.0, 1.82, 0.3), '#3a4352');
    // pulley + rope
    bb.add(Shape.cyl(0.18, 0.42, 0.42, 14), T(-3.0, 2.05, 0.8, Math.PI / 2, 0, 0), '#e7b84a');
    {
      const dx = -3.0 - O.x;
      const dy = 2.05 - O.y;
      bb.add(Shape.cyl(Math.hypot(dx, dy), 0.04, 0.04, 4), T((O.x - 3.0) / 2, (O.y + 2.05) / 2, 0.75, 0, 0, -Math.atan2(dx, dy)), '#d8c49a');
    }
    bb.build('gearBoardDeco', scene, this.boardMat, this.root);
    // vault door + lens
    this.vaultDoor = new TransformNode('vaultDoor', scene);
    this.vaultDoor.parent = this.root;
    this.vaultDoor.position.set(-3.0, 1.0, 0.78);
    const vd = new Batch();
    vd.add(Shape.rbox(1.25, 1.25, 0.1, 0.06, 1), T(0, 0, 0), '#7f93a8');
    vd.add(Shape.torus(0.6, 0.06, 16), T(0, 0, 0.06, Math.PI / 2, 0, 0), '#e7b84a');
    vd.add(Shape.sphere(0.16, 8), T(0, 0, 0.08), '#e7b84a');
    vd.build('vaultDoorMesh', scene, this.boardMat, this.vaultDoor);
    const lb = new Batch();
    lb.add(Shape.ico(0.32, 1), T(0, 0, 0, 0, 0, 0, 1, 1.3, 1), '#fff6c8', { flat: true });
    lb.add(Shape.torus(0.72, 0.06, 16), T(0, 0, 0), '#e7b84a');
    this.lensMat = new StandardMaterial('vaultLens', scene);
    this.lensMat.diffuseColor = Color3.White();
    this.lensMat.emissiveColor = new Color3(0.6, 0.5, 0.2);
    this.lens = lb.build('vaultLens', scene, this.lensMat, this.root);
    this.lens.position.set(-3.0, 1.0, 0.45);

    // arrows: driver direction + required output direction
    const mkArrow = (ccw: boolean, color: string, pos: Vector3, size: number) => {
      const m = MeshBuilder.CreatePlane('arrow', { size }, scene);
      const mat = new StandardMaterial('arrowMat', scene);
      mat.diffuseTexture = arrowTexture(scene, ccw, color);
      mat.useAlphaFromDiffuseTexture = true;
      mat.emissiveColor = new Color3(0.6, 0.6, 0.6);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      m.material = mat;
      m.parent = this.root;
      m.position.copyFrom(pos);
      m.rotation.y = Math.PI; // face out of the board toward the viewer
      m.isPickable = false;
      return m;
    };
    // driver spins with positive omega
    this.arrowDrive = mkArrow(false, '#ffffff', new Vector3(D.x, D.y, 0.28), R.M * 2.9);
    this.arrowGood = mkArrow(true, '#4fe07a', new Vector3(O.x, O.y, 0.28), R.M * 2.9);

    // pegs
    for (const p of [X, A, B]) {
      const pm = MeshBuilder.CreateCylinder('peg', { height: 0.5, diameter: 0.2, tessellation: 12 }, scene);
      pm.rotation.x = Math.PI / 2;
      pm.parent = this.root;
      pm.position.set(p.x, p.y, 0.25);
      pm.material = world.mats.metal;
      pm.isPickable = false;
      const glow = MeshBuilder.CreateTorus('pegGlow', { diameter: 0.7, thickness: 0.08, tessellation: 24 }, scene);
      glow.rotation.x = Math.PI / 2;
      glow.parent = this.root;
      glow.position.set(p.x, p.y, 0.08);
      glow.material = world.mats.ghost;
      glow.isPickable = false;
      glow.setEnabled(false);
      const proxy = MeshBuilder.CreateBox('pegProxy', { width: 1.2, height: 1.2, depth: 0.6 }, scene);
      proxy.parent = this.root;
      proxy.position.set(p.x, p.y, 0.3);
      proxy.isVisible = false;
      proxy.metadata = { peg: this.pegs.length };
      this.pegs.push({ pos: p.clone(), mesh: pm, glow, proxy, gear: null });
    }
    // gears: fixed driver & output + loose ones in storage
    this.driver = this.makeGear('M', true, D, '#6f8fb0');
    this.output = this.makeGear('M', true, O, '#4fa36a');
    const store: Size[] = ['S', 'M', 'L', 'M'];
    store.forEach((s, i) => {
      const g = this.makeGear(s, false, new Vector3(2.7 - i * 1.8, -1.85, 0.35), COLORS[s]);
      g.storePos = g.node.position.clone();
      g.node.scaling.setAll(0.55);
    });
  }

  private makeGear(size: Size, fixed: boolean, pos: Vector3, color: string): Gear {
    const { scene, world } = this.host;
    const r = R[size];
    const teeth = Math.round((2 * Math.PI * r) / 0.33);
    const node = new TransformNode('gear', scene);
    node.parent = this.root;
    node.position.copyFrom(pos);
    const b = new Batch();
    b.add(gearVD(r, teeth, 0.22, 0.12), T(0, 0, 0), color, { noise: 0.06 });
    b.add(Shape.torus(r * 1.15, 0.07, 20), T(0, 0, 0.11, Math.PI / 2, 0, 0), Color3.FromHexString(color).scale(0.8));
    b.add(Shape.cyl(0.3, 0.42, 0.42, 14), T(0, 0, 0.05, Math.PI / 2, 0, 0), '#6b6f78');
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.add(Shape.sphere(r * 0.36, 8), T(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 0.06, 0, 0, 0, 1, 1, 0.35), Color3.FromHexString(color).scale(0.7));
    }
    const mesh = b.build('gearMesh', scene, this.gearMat, node);
    mesh.isPickable = false;
    const proxy = MeshBuilder.CreateCylinder('gearProxy', { height: 0.5, diameter: r * 2.3, tessellation: 12 }, scene);
    proxy.rotation.x = Math.PI / 2;
    proxy.parent = node;
    proxy.isVisible = false;
    const g: Gear = { id: this.gears.length, size, r, teeth, node, mesh, peg: null, fixed, angle: 0, omega: 0, storePos: pos.clone(), proxy, tween: null };
    proxy.metadata = fixed ? undefined : { gear: g.id };
    this.gears.push(g);
    return g;
  }

  // ------------------------------------------------------------------ lifecycle
  enter() {
    if (this.solved) return;
    this.active = true;
    const { cam, ui } = this.host;
    const wm = this.root.getWorldMatrix();
    const aspect = this.host.scene.getEngine().getAspectRatio(cam.cam);
    const dist = aspect < 1.2 ? 7.0 / Math.max(0.5, aspect) : 6.7;
    const p = Vector3.TransformCoordinates(new Vector3(-0.3, 0.35, dist), wm);
    const l = Vector3.TransformCoordinates(new Vector3(-0.3, 0.2, 0), wm);
    cam.setFixed(p, l);
    this.panel = ui.puzzlePanel('Fix the Gear Machine', () => this.exit(), () => this.hint());
    this.panel.set('Connect the <b>water wheel gear</b> (left) to the <b>vault gear</b> (right). The vault gear must spin the way the <b style="color:#26a85a">green arrow</b> shows!');
    this.panel.steps(1, 0);
    this.hintLevel = 0;
    this.wrongCount = 0;
  }

  exit() {
    this.active = false;
    this.selected = null;
    this.panel?.close();
    this.panel = null;
    for (const p of this.pegs) p.glow.setEnabled(false);
    this.onExit?.();
  }

  tap(x: number, y: number) {
    if (!this.active || this.finishing) return;
    const hit = pickAt(this.host.scene, x, y, (m: AbstractMesh) => !!m.metadata && m.isEnabled() && (m.metadata.gear !== undefined || m.metadata.peg !== undefined));
    if (!hit || !hit.pickedMesh) return;
    const md = hit.pickedMesh.metadata;
    if (md.gear !== undefined) {
      const g = this.gears[md.gear];
      if (g.tween) return;
      if (g.peg !== null) {
        // send back to storage
        this.pegs[g.peg].gear = null;
        g.peg = null;
        this.moveGear(g, g.storePos, 0.55);
        this.host.audio.click();
        this.selected = null;
        this.recompute();
        return;
      }
      this.selected = this.selected === g ? null : g;
      this.host.audio.select();
      return;
    }
    if (md.peg !== undefined) {
      const peg = this.pegs[md.peg];
      if (!this.selected) {
        if (peg.gear) {
          const g = peg.gear;
          peg.gear = null;
          g.peg = null;
          this.moveGear(g, g.storePos, 0.55);
          this.recompute();
        } else this.host.ui.feedback('Pick a gear first!', 'oops');
        return;
      }
      if (peg.gear) return;
      const g = this.selected;
      this.selected = null;
      // overlap check
      for (const o of this.gears) {
        if (o === g || (o.peg === null && !o.fixed)) continue;
        const d = Vector3.Distance(o.node.position, peg.pos);
        if (d < o.r + g.r - 0.12) {
          this.bump(g, peg.pos, o);
          return;
        }
      }
      g.peg = md.peg;
      peg.gear = g;
      this.moveGear(g, peg.pos.add(new Vector3(0, 0, 0.12)), 1, () => {
        this.host.audio.place();
        this.recompute();
      });
    }
  }

  private bump(g: Gear, at: Vector3, other: Gear) {
    const { audio, ui } = this.host;
    audio.boing();
    ui.feedback('Too big – it bumps its neighbour!', 'oops');
    const start = g.node.position.clone();
    const mid = Vector3.Lerp(at, other.node.position, 0.15).add(new Vector3(0, 0, 0.3));
    this.moveGear(g, mid, 0.9, () => this.moveGear(g, g.storePos, 0.55));
    void start;
  }

  private moveGear(g: Gear, to: Vector3, scale: number, done?: () => void) {
    g.tween = { from: g.node.position.clone(), to: to.clone(), s0: g.node.scaling.x, s1: scale, t: 0, done };
    this.host.audio.whoosh();
  }

  /** Propagate rotation from the driver through meshing gears. */
  private recompute() {
    for (const g of this.gears) g.omega = 0;
    const active = this.gears.filter((g) => g.fixed || g.peg !== null);
    this.driver.omega = this.wheelSpeed;
    const visited = new Set<Gear>([this.driver]);
    const queue = [this.driver];
    let conflict = false;
    const parent = new Map<Gear, Gear>();
    while (queue.length) {
      const a = queue.shift()!;
      for (const b of active) {
        if (b === a) continue;
        const d = Vector3.Distance(a.node.position, b.node.position);
        if (Math.abs(d - (a.r + b.r)) < 0.13) {
          const w = (-a.omega * a.r) / b.r;
          if (visited.has(b)) {
            if (Math.sign(b.omega) !== Math.sign(w)) conflict = true;
            continue;
          }
          b.omega = w;
          parent.set(b, a);
          visited.add(b);
          queue.push(b);
        }
      }
    }
    if (conflict) for (const g of active) g.omega = 0;
    (this as any)._parent = parent;
    const prev = this.outputState;
    if (this.output.omega === 0) this.outputState = 'still';
    else this.outputState = this.output.omega < 0 ? 'right' : 'wrong';
    if (prev !== this.outputState) {
      this.stateTime = 0;
      this.wrongShown = false;
    }
    // little gear-meshing sound
    if (visited.size > 1) this.host.audio.gearClick();
  }

  debugTargets(pr: (m: TransformNode) => { x: number; y: number }) {
    return {
      gears: this.gears.filter((g) => !g.fixed).map((g) => ({ id: g.id, size: g.size, peg: g.peg, ...pr(g.node) })),
      pegs: this.pegs.map((p, i) => ({ i, has: !!p.gear, ...pr(p.proxy) })),
      out: this.outputState,
      solved: this.solved,
    };
  }

  hint() {
    this.hintLevel++;
    const lv = this.hintLevel;
    const texts = [
      'Gears only turn each other when their <b>teeth touch</b>. Can you make a chain from left to right?',
      'Watch closely: touching gears always spin the <b>opposite way</b> to each other!',
      'One gear in the middle makes the vault gear spin the wrong way… try a path with <b>two</b> gears – a big one and a small one!',
      'Put the <b>big</b> gear on the top-left peg and the <b>small</b> gear on the top-right peg!',
    ];
    this.host.pipSay(texts[Math.min(lv - 1, texts.length - 1)], 7);
  }

  update(dt: number) {
    this.time += dt;
    // tweens
    for (const g of this.gears) {
      if (!g.tween) continue;
      const tw = g.tween;
      tw.t += dt / 0.45;
      const t = Math.min(1, tw.t);
      const e = easeInOut(t);
      const p = Vector3.Lerp(tw.from, tw.to, e);
      p.z += Math.sin(t * Math.PI) * 0.8;
      g.node.position.copyFrom(p);
      g.node.scaling.setAll(tw.s0 + (tw.s1 - tw.s0) * easeOutBack(t));
      if (t >= 1) {
        g.tween = null;
        tw.done?.();
      }
    }
    // rotation with tooth phase alignment
    const parent: Map<Gear, Gear> = (this as any)._parent ?? new Map();
    this.driver.angle += this.driver.omega * dt;
    const order = [this.driver, ...[...parent.keys()]];
    for (const g of order) {
      const p = parent.get(g);
      if (p) {
        const dx = g.node.position.x - p.node.position.x;
        const dy = g.node.position.y - p.node.position.y;
        const phi = Math.atan2(dy, dx);
        g.angle = phi + Math.PI + Math.PI / g.teeth - (p.r / g.r) * (p.angle - phi);
      }
    }
    for (const g of this.gears) {
      if (g.omega === 0 && !parent.has(g) && g !== this.driver && g.peg === null && !g.fixed) g.angle += 0;
      g.node.rotation.z = g.angle;
      // selection lift / wobble
      if (this.selected === g) {
        g.node.position.z = g.storePos.z + 0.3 + Math.sin(this.time * 6) * 0.05;
        g.node.rotation.z = g.angle + Math.sin(this.time * 8) * 0.1;
      } else if (g.peg === null && !g.fixed && !g.tween) {
        g.node.position.z += (g.storePos.z - g.node.position.z) * Math.min(1, dt * 8);
      }
    }
    for (const p of this.pegs) p.glow.setEnabled(this.active && !!this.selected && !p.gear);
    this.arrowDrive.rotation.z = Math.sin(this.time * 2) * 0.05;
    this.arrowGood.scaling.setAll(1 + Math.sin(this.time * 4) * 0.05);
    this.arrowGood.setEnabled(!this.solved);
    this.arrowDrive.setEnabled(!this.solved);
    // output state handling
    this.stateTime += dt;
    if (this.active && this.outputState === 'wrong') {
      this.vaultDoor.position.x = -3.0 + Math.sin(this.time * 40) * 0.02;
      if (this.stateTime > 1.3 && !this.wrongShown) {
        this.wrongShown = true;
        this.wrongCount++;
        this.host.audio.oops();
        this.host.ui.feedback('Uh-oh! The vault gear spins the wrong way!', 'oops');
        this.host.pipSay(
          this.wrongCount === 1
            ? 'It turns… but <b>backwards</b>! Look: the middle gear flips the direction. What if there were <b>two</b> gears in between?'
            : 'Remember: each gear in the chain flips the direction. Two gears flip it twice!',
          7,
        );
      }
    } else this.vaultDoor.position.x = -3.0;
    if (this.active && this.outputState === 'right' && this.stateTime > 1.0 && !this.finishing) {
      this.finishing = true;
      this.finish();
    }
    if (this.vaultOpen > 0) {
      this.vaultDoor.position.y = 1.0 + this.vaultOpen * 1.35;
      this.lensMat.emissiveColor = new Color3(1, 0.85, 0.4).scale(0.6 + Math.sin(this.time * 5) * 0.3);
    }
  }

  private finish() {
    const { audio, fx, ui } = this.host;
    audio.success();
    ui.feedback('Click-clack! The vault is opening!', 'good');
    let t = 0;
    const id = setInterval(() => {
      t += 0.05;
      this.vaultOpen = Math.min(1, t);
      if (t >= 1) {
        clearInterval(id);
        fx.sparkle(this.lens.getAbsolutePosition(), new Color4(1, 0.9, 0.5, 1), 60);
        audio.pickup();
        setTimeout(() => {
          this.solved = true;
          this.active = false;
          this.panel?.close();
          this.panel = null;
          this.onSolved?.();
        }, 900);
      }
    }, 50);
  }

  /** Restore a solved machine (saved game). */
  solveInstant() {
    const [x, a, b] = this.pegs;
    const L = this.gears.find((g) => g.size === 'L')!;
    const S = this.gears.find((g) => g.size === 'S')!;
    a.gear = L;
    L.peg = 1;
    L.node.position.copyFrom(a.pos.add(new Vector3(0, 0, 0.12)));
    L.node.scaling.setAll(1);
    b.gear = S;
    S.peg = 2;
    S.node.position.copyFrom(b.pos.add(new Vector3(0, 0, 0.12)));
    S.node.scaling.setAll(1);
    void x;
    this.recompute();
    this.solved = true;
    this.vaultOpen = 1;
    this.lens.setEnabled(false);
  }
}
