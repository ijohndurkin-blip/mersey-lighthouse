import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, AbstractMesh } from '../babylon';
import { Batch, Shape, T } from '../world/geo';
import { BRIDGE } from '../world/layout';
import { PuzzleHost, pickAt } from './types';
import { easeOutBack, easeInOut, clamp } from '../core/noise';

type Kind = 'post' | 'beam' | 'brace';
interface Piece {
  id: number;
  kind: Kind;
  value: number | 'tri' | 'square';
  mesh: Mesh;
  trayPos: Vector3;
  trayRot: Vector3;
  used: boolean;
  proxy: Mesh;
}
interface Slot {
  kind: Kind;
  need: number | 'tri';
  pos: Vector3;
  filled: boolean;
  ghost: Mesh;
  proxy: Mesh;
  label: string;
}
interface Anim {
  t: number;
  dur: number;
  update: (t: number) => void;
  done?: () => void;
}

const WOOD = '#b98552';
const WOOD_D = '#8b5e3c';

export class BridgePuzzle {
  active = false;
  solved = false;
  step = 0; // 0 posts, 1 beams, 2 braces
  private root: TransformNode;
  private tray: TransformNode;
  private pieces: Piece[] = [];
  private slots: Slot[] = [];
  private selected: Piece | null = null;
  private anims: Anim[] = [];
  private busy = false;
  private wrongs = 0;
  private panel: ReturnType<PuzzleHost['ui']['puzzlePanel']> | null = null;
  private ghostMat: StandardMaterial;
  private selMat: StandardMaterial;
  private built: Mesh[] = [];
  private deckGroup: TransformNode;
  private shelf: Mesh;
  postTop: number;
  onSolved: (() => void) | null = null;
  onExit: (() => void) | null = null;
  private time = 0;
  private hintLevel = 0;

  constructor(private host: PuzzleHost) {
    const { scene } = host;
    this.root = new TransformNode('bridgeBuild', scene);
    this.tray = new TransformNode('bridgeTray', scene);
    this.deckGroup = new TransformNode('bridgeDeck', scene);
    const shelf = MeshBuilder.CreatePlane('trayShelf', { width: 4.4, height: 1.25 }, scene);
    const shelfMat = new StandardMaterial('trayShelfMat', scene);
    shelfMat.disableLighting = true;
    shelfMat.emissiveColor = new Color3(0.09, 0.2, 0.36);
    shelfMat.alpha = 0.55;
    shelf.material = shelfMat;
    shelf.parent = this.tray;
    shelf.position.set(0, -0.62, 0.35);
    shelf.renderingGroupId = 1;
    shelf.isPickable = false;
    this.shelf = shelf;
    this.postTop = BRIDGE.deckY - 0.45;
    this.ghostMat = new StandardMaterial('bridgeGhost', scene);
    this.ghostMat.disableLighting = true;
    this.ghostMat.emissiveColor = new Color3(0.45, 0.95, 1);
    this.ghostMat.alpha = 0.45;
    this.ghostMat.backFaceCulling = false;
    this.selMat = new StandardMaterial('bridgeSel', scene);
    this.selMat.disableLighting = true;
    this.selMat.emissiveColor = new Color3(1, 0.85, 0.3);
    this.selMat.alpha = 0.5;
    this.buildSlots();
  }

  // ------------------------------------------------------------------ geometry
  private postMesh(len: number) {
    const b = new Batch();
    for (const sx of [-1.05, 1.05]) b.add(Shape.rbox(0.34, len, 0.34, 0.06, 1), T(sx, len / 2, 0), WOOD_D, { ao: 0.3, noise: 0.1 });
    b.add(Shape.rbox(2.7, 0.3, 0.4, 0.06, 1), T(0, len - 0.15, 0), WOOD, { noise: 0.1 });
    if (len > 1.4) {
      const d = Math.hypot(2.1, len - 0.6);
      const a = Math.atan2(len - 0.6, 2.1);
      b.add(Shape.rbox(d, 0.16, 0.12, 0.04, 1), T(0, (len - 0.3) / 2, 0.1, 0, 0, a), WOOD);
    }
    return b.build('post', this.host.scene, this.host.world.mats.vc);
  }
  private beamMesh(len: number) {
    const b = new Batch();
    b.add(Shape.rbox(0.3, 0.32, len, 0.06, 1), T(0, 0, 0), WOOD_D, { noise: 0.12, ao: 0.2 });
    for (let z = -len / 2 + 1; z < len / 2; z += 2.4) b.add(Shape.sphere(0.1, 6), T(0.16, 0, z), '#6b6f78');
    return b.build('beam', this.host.scene, this.host.world.mats.vc);
  }
  private braceMesh(shape: 'tri' | 'square', w = 3.2, hgt = 1.3) {
    const b = new Batch();
    const bar = (z0: number, y0: number, z1: number, y1: number) => {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const a = Math.atan2(y1 - y0, z1 - z0);
      b.add(Shape.rbox(0.14, 0.18, len + 0.1, 0.04, 1), T(0, (y0 + y1) / 2, (z0 + z1) / 2, -a, 0, 0), WOOD, { noise: 0.1 });
    };
    if (shape === 'tri') {
      bar(-w / 2, 0, w / 2, 0);
      bar(-w / 2, 0, 0, -hgt);
      bar(0, -hgt, w / 2, 0);
    } else {
      bar(-w / 2, 0, w / 2, 0);
      bar(-w / 2, -hgt, w / 2, -hgt);
      bar(-w / 2, 0, -w / 2, -hgt);
      bar(w / 2, 0, w / 2, -hgt);
    }
    return b.build('brace', this.host.scene, this.host.world.mats.vc);
  }

  private buildSlots() {
    const { scene, world } = this.host;
    const x = BRIDGE.x;
    // post slots
    world.footings.forEach((f, i) => {
      const len = this.postTop - f.top;
      const g = MeshBuilder.CreateBox('postGhost', { width: 2.7, height: len, depth: 0.42 }, scene);
      g.position.set(x, f.top + len / 2, f.z);
      g.material = this.ghostMat;
      g.isPickable = false;
      g.setEnabled(false);
      const proxy = MeshBuilder.CreateBox('postProxy', { width: 3.2, height: len + 1, depth: 2.4 }, scene);
      proxy.position.copyFrom(g.position);
      proxy.isVisible = false;
      proxy.metadata = { slot: this.slots.length };
      this.slots.push({ kind: 'post', need: +len.toFixed(2), pos: new Vector3(x, f.top, f.z), filled: false, ghost: g, proxy, label: `gap ${i + 1}` });
    });
    // beam slots
    for (const sx of [-1.05, 1.05]) {
      const len = BRIDGE.halfLen * 2;
      const g = MeshBuilder.CreateBox('beamGhost', { width: 0.3, height: 0.3, depth: len }, scene);
      g.position.set(x + sx, this.postTop + 0.16, BRIDGE.z);
      g.material = this.ghostMat;
      g.setEnabled(false);
      g.isPickable = false;
      const proxy = MeshBuilder.CreateBox('beamProxy', { width: 1.6, height: 1.6, depth: len }, scene);
      proxy.position.copyFrom(g.position);
      proxy.isVisible = false;
      proxy.metadata = { slot: this.slots.length };
      this.slots.push({ kind: 'beam', need: len, pos: g.position.clone(), filled: false, ghost: g, proxy, label: 'beam' });
    }
    // brace slots (between the posts)
    for (const zc of [-1.6, 1.6]) {
      const g = MeshBuilder.CreateBox('braceGhost', { width: 0.1, height: 1.3, depth: 3.2 }, scene);
      g.position.set(x + 1.3, this.postTop - 0.65, zc);
      g.material = this.ghostMat;
      g.setEnabled(false);
      g.isPickable = false;
      const proxy = MeshBuilder.CreateBox('braceProxy', { width: 3.4, height: 2.2, depth: 3.2 }, scene);
      proxy.position.set(x, this.postTop - 0.65, zc);
      proxy.isVisible = false;
      proxy.metadata = { slot: this.slots.length };
      this.slots.push({ kind: 'brace', need: 'tri', pos: new Vector3(x, this.postTop, zc), filled: false, ghost: g, proxy, label: 'brace' });
    }
    for (const s of this.slots) s.proxy.setEnabled(false);
  }

  // ------------------------------------------------------------------ tray
  private makeTray() {
    for (const p of this.pieces) {
      if (!p.used) {
        p.mesh.dispose();
        p.proxy.dispose();
      }
    }
    this.pieces = this.pieces.filter((p) => p.used);
    const { scene } = this.host;
    const add = (kind: Kind, value: Piece['value'], mesh: Mesh, pos: Vector3, rot: Vector3, scale: number, proxySize: Vector3) => {
      mesh.parent = this.tray;
      mesh.position.copyFrom(pos);
      mesh.rotation.copyFrom(rot);
      mesh.scaling.setAll(scale);
      mesh.renderingGroupId = 1;
      const proxy = MeshBuilder.CreateBox('trayProxy', { width: proxySize.x, height: proxySize.y, depth: proxySize.z }, scene);
      proxy.parent = this.tray;
      proxy.position.copyFrom(pos);
      proxy.isVisible = false;
      const piece: Piece = { id: this.pieces.length, kind, value, mesh, trayPos: pos.clone(), trayRot: rot.clone(), used: false, proxy };
      proxy.metadata = { piece: piece.id };
      this.pieces.push(piece);
    };
    // tray local frame: x = screen right, y = up, z = into the screen
    if (this.step === 0) {
      const lens = this.slots.filter((s) => s.kind === 'post').map((s) => s.need as number);
      const order = [lens[2], lens[0], lens[1]]; // shuffled
      order.forEach((len, i) => {
        const m = this.postMesh(len);
        add('post', len, m, new Vector3(-1.1 + i * 1.1, -0.95, 0), new Vector3(0, 0, 0), 0.28, new Vector3(1.0, 1.4, 0.6));
      });
    } else if (this.step === 1) {
      const vals = [BRIDGE.halfLen * 2 * 0.55, BRIDGE.halfLen * 2, BRIDGE.halfLen * 2];
      vals.forEach((len, i) => {
        const m = this.beamMesh(len);
        add('beam', len, m, new Vector3(0, -0.45 - i * 0.28, 0), new Vector3(0, Math.PI / 2, 0), 0.2, new Vector3(3.4, 0.26, 0.5));
      });
    } else if (this.step === 2) {
      (['tri', 'square', 'tri'] as const).forEach((sh, i) => {
        const m = this.braceMesh(sh);
        add('brace', sh, m, new Vector3(-1.2 + i * 1.2, -0.45, 0), new Vector3(0, Math.PI / 2, 0), 0.3, new Vector3(1.1, 0.8, 0.5));
      });
    }
  }

  private trayLayout() {
    // attach the tray in front of the camera
    const cam = this.host.cam.cam;
    const fwd = cam.getDirection(Vector3.Forward());
    const up = cam.getDirection(Vector3.Up());
    const p = cam.position.add(fwd.scale(4.2)).add(up.scale(-0.55));
    this.tray.position.copyFrom(p);
    // align tray axes with the camera (yaw only + pitch)
    this.tray.rotation.set(cam.rotation.x, cam.rotation.y, 0);
    const aspect = this.host.scene.getEngine().getAspectRatio(cam);
    const s = clamp(aspect / 1.6, 0.55, 1);
    this.tray.scaling.setAll(s);
  }

  private baseScale(k: Kind) {
    return k === 'beam' ? 0.2 : k === 'post' ? 0.28 : 0.3;
  }

  // ------------------------------------------------------------------ lifecycle
  enter() {
    if (this.solved) return;
    this.active = true;
    const { cam, ui } = this.host;
    const aspect = this.host.scene.getEngine().getAspectRatio(cam.cam);
    const back = aspect < 1 ? 1.5 / aspect : 1;
    cam.setFixed(new Vector3(BRIDGE.x + 10 * back, BRIDGE.deckY + 1.6, BRIDGE.z + 0.3), new Vector3(BRIDGE.x, BRIDGE.deckY - 1.9, BRIDGE.z + 0.3));
    this.panel = ui.puzzlePanel('Build the Bridge', () => this.exit(), () => this.hint());
    this.hintLevel = 0;
    this.wrongs = 0;
    setTimeout(() => {
      if (!this.active) return;
      this.trayLayout();
      this.makeTray();
      this.refresh();
    }, 700);
    this.refresh();
  }

  exit() {
    this.active = false;
    this.panel?.close();
    this.panel = null;
    for (const p of this.pieces) if (!p.used) p.mesh.setEnabled(false);
    this.shelf.setEnabled(false);
    for (const s of this.slots) {
      s.ghost.setEnabled(false);
      s.proxy.setEnabled(false);
    }
    this.selected = null;
    this.onExit?.();
  }

  private refresh() {
    const kinds: Kind[] = ['post', 'beam', 'brace'];
    const k = kinds[this.step];
    for (const s of this.slots) {
      const on = this.active && s.kind === k && !s.filled;
      s.ghost.setEnabled(on);
      s.proxy.setEnabled(on);
    }
    for (const p of this.pieces) if (!p.used) p.mesh.setEnabled(this.active);
    this.shelf.setEnabled(this.active && this.step < 3);
    const texts = [
      'Each gap needs a post that reaches <b>exactly</b> up to the glowing line. Tap a post, then tap a gap!',
      'The long beams must reach from <b>one bank to the other</b>. Tap a beam, then tap a glowing beam spot.',
      'Add braces between the posts to make the bridge <b>strong and steady</b>. Which shape won\'t squash?',
    ];
    this.panel?.set(texts[this.step] ?? '');
    this.panel?.steps(3, this.step);
  }

  // ------------------------------------------------------------------ input
  tap(x: number, y: number) {
    if (!this.active || this.busy) return;
    const hit = pickAt(this.host.scene, x, y, (m: AbstractMesh) => !!m.metadata && m.isEnabled());
    if (!hit || !hit.pickedMesh) return;
    const md = hit.pickedMesh.metadata;
    if (md.piece !== undefined) {
      const p = this.pieces[md.piece];
      if (!p || p.used) return;
      this.selected = this.selected === p ? null : p;
      this.host.audio.select();
      return;
    }
    if (md.slot !== undefined) {
      const s = this.slots[md.slot];
      if (!this.selected) {
        // auto-pick if only one sensible piece left
        this.host.ui.feedback('Pick a piece first!', 'oops');
        return;
      }
      if (s.filled || s.kind !== this.selected.kind) return;
      this.tryPlace(this.selected, s);
    }
  }

  private tryPlace(p: Piece, s: Slot) {
    this.busy = true;
    this.selected = null;
    const { audio, fx, ui } = this.host;
    const startPos = p.mesh.getAbsolutePosition().clone();
    p.mesh.setParent(null);
    p.mesh.renderingGroupId = 0;
    p.mesh.renderOutline = false;
    const startScale = p.mesh.scaling.x;
    let target: Vector3;
    let targetRot: Vector3;
    if (p.kind === 'post') {
      target = s.pos.clone();
      targetRot = new Vector3(0, 0, 0);
    } else if (p.kind === 'beam') {
      target = s.pos.clone();
      targetRot = new Vector3(0, 0, 0);
    } else {
      target = new Vector3(s.pos.x + 1.3, s.pos.y - 0.05, s.pos.z);
      targetRot = new Vector3(0, 0, 0);
    }
    const startRot = p.mesh.rotation.clone();
    const ok =
      p.kind === 'post' ? Math.abs((p.value as number) - (s.need as number)) < 0.05 : p.kind === 'beam' ? (p.value as number) >= (s.need as number) - 0.01 : p.value === 'tri';
    audio.whoosh();
    this.anims.push({
      t: 0,
      dur: 0.75,
      update: (t) => {
        const e = easeInOut(t);
        const pos = Vector3.Lerp(startPos, target, e);
        pos.y += Math.sin(t * Math.PI) * 2.0;
        p.mesh.position.copyFrom(pos);
        const sc = startScale + (1 - startScale) * e;
        p.mesh.scaling.setAll(sc);
        p.mesh.rotation.copyFrom(Vector3.Lerp(startRot, targetRot, e));
      },
      done: () => {
        audio.wood();
        fx.dust(target.add(new Vector3(0, 0.2, 0)), 10);
        if (ok) this.accept(p, s);
        else this.reject(p, s);
      },
    });
  }

  private accept(p: Piece, s: Slot) {
    const { audio, fx, ui } = this.host;
    p.used = true;
    s.filled = true;
    s.ghost.setEnabled(false);
    s.proxy.setEnabled(false);
    p.proxy.dispose();
    this.built.push(p.mesh);
    p.mesh.receiveShadows = true;
    this.host.world.env.shadow.getShadowMap()!.renderList!.push(p.mesh);
    if (p.kind === 'brace') {
      // mirror brace on the other side
      const m2 = this.braceMesh('tri');
      m2.position.set(p.mesh.position.x - 2.6, p.mesh.position.y, p.mesh.position.z);
      this.built.push(m2);
      this.host.world.env.shadow.getShadowMap()!.renderList!.push(m2);
    }
    // little settle bounce
    const base = p.mesh.position.y;
    this.anims.push({ t: 0, dur: 0.4, update: (t) => (p.mesh.position.y = base + Math.sin(t * Math.PI) * 0.12 * (1 - t)) });
    audio.success();
    fx.sparkle(p.mesh.position.add(new Vector3(0, 1, 0)), new Color4(0.6, 1, 0.6, 1), 30);
    const msgs = ['Perfect fit!', 'Great measuring!', 'Spot on!', 'Brilliant!', 'Super strong!'];
    ui.feedback(msgs[Math.floor(Math.random() * msgs.length)], 'good');
    this.wrongs = 0;
    this.busy = false;
    const kinds: Kind[] = ['post', 'beam', 'brace'];
    const remaining = this.slots.filter((x) => x.kind === kinds[this.step] && !x.filled).length;
    if (remaining === 0) {
      this.step++;
      if (this.step >= 3) {
        setTimeout(() => this.complete(), 700);
      } else {
        const lines = ['Posts done! Now the long beams.', 'Beams across! Now let\'s make it strong.'];
        this.host.pipSay(lines[this.step - 1], 3.5);
        this.makeTray();
        this.refresh();
      }
    }
  }

  private reject(p: Piece, s: Slot) {
    const { audio, fx, ui } = this.host;
    this.wrongs++;
    const pos0 = p.mesh.position.clone();
    let msg = '';
    let fall = false;
    if (p.kind === 'post') {
      const diff = (p.value as number) - (s.need as number);
      msg = diff < 0 ? 'Too short! It doesn\'t reach the line.' : 'Too tall! It pokes above the line.';
      this.host.pipSay(diff < 0 ? 'Hmm, see the gap at the top? We need a <b>longer</b> post there!' : 'Whoa, that sticks up too high! Try a <b>shorter</b> one.', 4);
    } else if (p.kind === 'beam') {
      msg = 'Too short to reach both banks!';
      fall = true;
      this.host.pipSay('Splash! A beam has to reach <b>all the way</b> across.', 4);
    } else {
      msg = 'Squares can squash flat!';
      this.host.pipSay('See how the square squished? <b>Triangles</b> can\'t change shape – that\'s why bridges use them!', 5.5);
    }
    ui.feedback(msg, 'oops');
    audio.oops();
    const back = () => {
      // fly back to the tray
      const from = p.mesh.position.clone();
      const fromRot = p.mesh.rotation.clone();
      this.trayLayout();
      p.mesh.scaling.setAll(1);
      this.anims.push({
        t: 0,
        dur: 0.6,
        update: (t) => {
          const e = easeInOut(t);
          const to = Vector3.TransformCoordinates(p.trayPos, this.tray.getWorldMatrix());
          const pos = Vector3.Lerp(from, to, e);
          pos.y += Math.sin(t * Math.PI) * 1.5;
          p.mesh.position.copyFrom(pos);
          const s1 = this.baseScale(p.kind) * this.tray.scaling.x;
          p.mesh.scaling.setAll(1 + (s1 - 1) * e);
        },
        done: () => {
          p.mesh.parent = this.tray;
          p.mesh.position.copyFrom(p.trayPos);
          p.mesh.rotation.copyFrom(p.trayRot);
          p.mesh.scaling.setAll(this.baseScale(p.kind));
          p.mesh.renderingGroupId = 1;
          this.busy = false;
          if (this.wrongs >= 2) this.hint();
        },
      });
    };
    if (fall) {
      this.anims.push({
        t: 0,
        dur: 0.9,
        update: (t) => {
          p.mesh.position.y = pos0.y - t * t * 3;
          p.mesh.rotation.x = t * 0.9;
        },
        done: () => {
          audio.splash();
          fx.splash(new Vector3(p.mesh.position.x, BRIDGE.deckY - 1.9, p.mesh.position.z));
          setTimeout(back, 500);
        },
      });
    } else if (p.kind === 'brace') {
      // shear the square into a squashed diamond, then drop it
      this.anims.push({
        t: 0,
        dur: 1.0,
        update: (t) => {
          p.mesh.scaling.y = 1 - 0.55 * easeOutBack(Math.min(1, t * 1.4));
          p.mesh.rotation.x = Math.sin(t * 20) * 0.08 * (1 - t);
          p.mesh.position.z = pos0.z + Math.sin(t * 3) * 0.4;
        },
        done: back,
      });
    } else {
      // wobble then return
      this.anims.push({
        t: 0,
        dur: 0.8,
        update: (t) => {
          p.mesh.rotation.x = Math.sin(t * 25) * 0.12 * (1 - t);
        },
        done: back,
      });
    }
  }

  private complete() {
    this.solved = true;
    this.active = false;
    this.panel?.close();
    this.panel = null;
    this.shelf.setEnabled(false);
    for (const s of this.slots) {
      s.ghost.setEnabled(false);
      s.proxy.setEnabled(false);
    }
    this.layDeck(true);
    this.onSolved?.();
  }

  /** Planks fly in one by one (or instantly when restoring a save). */
  layDeck(animated: boolean) {
    const { scene, world, audio } = this.host;
    const n = 30;
    const len = BRIDGE.halfLen * 2;
    const deckY = BRIDGE.deckY - 0.07;
    const plankVD = Shape.rbox(2.9, 0.14, len / n - 0.05, 0.03, 1);
    for (let i = 0; i < n; i++) {
      const b = new Batch();
      b.add(plankVD, T(0, 0, 0), i % 3 === 0 ? '#c9965f' : i % 3 === 1 ? '#b98552' : '#d4a46c', { noise: 0.1 });
      const m = b.build('plank', scene, world.mats.vc, this.deckGroup);
      const z = BRIDGE.z - BRIDGE.halfLen + (i + 0.5) * (len / n);
      m.receiveShadows = true;
      if (animated) {
        m.position.set(BRIDGE.x + 8, deckY + 6, z);
        m.rotation.set(1.2, 0.5, 0.3);
        const delay = i * 0.06;
        this.anims.push({
          t: -delay,
          dur: 0.5,
          update: (t) => {
            if (t < 0) return;
            const e = easeOutBack(t);
            m.position.set(BRIDGE.x + 8 * (1 - e), deckY + 6 * (1 - t), z);
            m.rotation.set(1.2 * (1 - e), 0.5 * (1 - e), 0.3 * (1 - e));
          },
          done: () => {
            if (i % 3 === 0) audio.wood();
          },
        });
      } else m.position.set(BRIDGE.x, deckY, z);
    }
    // rails
    const rb = new Batch();
    for (const sx of [-1, 1]) {
      for (let z = -BRIDGE.halfLen + 1.2; z <= BRIDGE.halfLen - 1.2; z += 2.2) rb.add(Shape.rbox(0.18, 1.1, 0.18, 0.05, 1), T(sx * 1.35, deckY + 0.55, z), WOOD_D);
      rb.add(Shape.rbox(0.16, 0.16, BRIDGE.halfLen * 2 - 2.0, 0.05, 1), T(sx * 1.35, deckY + 1.1, 0), WOOD);
      rb.add(Shape.rbox(0.1, 0.1, BRIDGE.halfLen * 2 - 2.0, 0.04, 1), T(sx * 1.35, deckY + 0.6, 0), WOOD);
    }
    const rails = rb.build('rails', scene, world.mats.vc);
    rails.position.set(BRIDGE.x, animated ? -3 : 0, BRIDGE.z);
    if (animated) {
      this.anims.push({
        t: -2.0,
        dur: 0.8,
        update: (t) => {
          if (t < 0) return;
          rails.position.y = -3 * (1 - easeOutBack(t));
        },
      });
    }
    world.env.shadow.getShadowMap()!.renderList!.push(rails);
    // collision: walkway + rails
    const col = world.col;
    (world.ctx as any).bridgeBuilt = true;
    col.addPlatform({ x: BRIDGE.x, z: BRIDGE.z, hw: BRIDGE.halfW + 0.1, hd: BRIDGE.halfLen + 0.6, yaw: 0, y: BRIDGE.deckY, surface: 'wood' });
    for (const sx of [-1, 1]) col.addBox({ x: BRIDGE.x + sx * 1.45, z: BRIDGE.z, hw: 0.12, hd: BRIDGE.halfLen - 1.0, yaw: 0 });
  }

  /** Instantly build everything (restoring a saved game). */
  buildInstant() {
    const kinds: Kind[] = ['post', 'beam', 'brace'];
    for (const s of this.slots) {
      let m: Mesh;
      if (s.kind === 'post') {
        m = this.postMesh(s.need as number);
        m.position.copyFrom(s.pos);
      } else if (s.kind === 'beam') {
        m = this.beamMesh(s.need as number);
        m.position.copyFrom(s.pos);
      } else {
        m = this.braceMesh('tri');
        m.position.set(s.pos.x + 1.3, s.pos.y - 0.05, s.pos.z);
        const m2 = this.braceMesh('tri');
        m2.position.set(s.pos.x - 1.3, s.pos.y - 0.05, s.pos.z);
      }
      s.filled = true;
      this.host.world.env.shadow.getShadowMap()!.renderList!.push(m);
    }
    void kinds;
    this.step = 3;
    this.solved = true;
    this.layDeck(false);
  }

  debugTargets(pr: (m: TransformNode) => { x: number; y: number }) {
    return {
      pieces: this.pieces.filter((p) => !p.used && p.mesh.isEnabled()).map((p) => ({ id: p.id, kind: p.kind, value: p.value, ...pr(p.proxy) })),
      slots: this.slots.map((s, i) => ({ i, kind: s.kind, need: s.need, filled: s.filled, on: s.proxy.isEnabled(), ...pr(s.ghost) })),
      step: this.step,
      busy: this.busy,
    };
  }

  hint() {
    this.hintLevel++;
    const lv = this.hintLevel;
    let text = '';
    if (this.step === 0) {
      text =
        lv === 1
          ? 'Look at each glowing gap. Which one is the <b>shortest</b>? Match it with the shortest post!'
          : 'The middle gap is the deepest, so it needs the <b>tallest</b> post. The left one is shallow!';
    } else if (this.step === 1) text = lv === 1 ? 'Compare the beams. One is much shorter than the others…' : 'Use the two <b>long</b> beams – the short one would fall in!';
    else text = lv === 1 ? 'Squares can wobble and squash. What shape stays strong?' : 'Pick the <b>triangles</b>! Triangles are the strongest shape.';
    this.host.pipSay(text, 6);
    // glow the right piece after a couple of hints
    if (lv >= 2) {
      const kinds: Kind[] = ['post', 'beam', 'brace'];
      const slot = this.slots.find((s) => s.kind === kinds[this.step] && !s.filled);
      const piece = this.pieces.find((p) => !p.used && p.kind === kinds[this.step] && (p.kind === 'post' ? Math.abs((p.value as number) - (slot?.need as number)) < 0.05 : p.kind === 'beam' ? (p.value as number) > 10 : p.value === 'tri'));
      if (piece) this.selected = piece;
    }
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt / a.dur;
      a.update(Math.min(1, a.t));
      if (a.t >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    if (!this.active) return;
    this.trayLayout();
    // ghost pulse
    this.ghostMat.alpha = 0.3 + Math.sin(this.time * 4) * 0.15;
    // tray idle motion + selection lift
    for (const p of this.pieces) {
      if (p.used || p.mesh.parent !== this.tray) continue;
      const sel = this.selected === p;
      const ty = p.trayPos.y + (sel ? 0.18 : 0) + Math.sin(this.time * 2 + p.id) * 0.02;
      p.mesh.position.y += (ty - p.mesh.position.y) * Math.min(1, dt * 10);
      p.mesh.rotation.z = sel ? Math.sin(this.time * 6) * 0.06 : 0;
      p.mesh.renderOutline = sel;
      p.mesh.outlineColor = new Color3(1, 0.85, 0.2);
      p.mesh.outlineWidth = 0.08;
    }
  }
}
