import { Mesh, Scene, TransformNode, Vector3, Color4 } from '../babylon';
import { Batch, Shape, T } from './geo';
import { World } from './world';
import { rng } from '../core/noise';
import { FX } from '../fx/fx';

interface Gull {
  node: TransformNode;
  wL: TransformNode;
  wR: TransformNode;
  cx: number;
  cz: number;
  r: number;
  h: number;
  speed: number;
  phase: number;
}
interface Fly {
  node: TransformNode;
  wL: Mesh;
  wR: Mesh;
  ax: number;
  az: number;
  phase: number;
  pos: Vector3;
  vel: Vector3;
}
interface Walker {
  node: TransformNode;
  head?: TransformNode;
  home: Vector3;
  target: Vector3;
  wait: number;
  speed: number;
  kind: 'crab' | 'sheep' | 'duck';
  phase: number;
}

export class Creatures {
  gulls: Gull[] = [];
  flies: Fly[] = [];
  walkers: Walker[] = [];
  private fish: TransformNode;
  private fishT = 3;
  private fishJump: { from: Vector3; to: Vector3; t: number } | null = null;

  constructor(private scene: Scene, private world: World, private fx: FX) {
    const mats = world.mats;
    const rnd = rng(404);
    // ---------------- seagulls
    const gullBody = new Batch();
    gullBody.add(Shape.ellipsoid(0.32, 0.3, 0.75, 10), T(0, 0, 0), '#ffffff');
    gullBody.add(Shape.sphere(0.28, 10), T(0, 0.12, 0.38), '#ffffff');
    gullBody.add(Shape.cone(0.2, 0.08, 6), T(0, 0.1, 0.58, Math.PI / 2, 0, 0), '#ffc53a');
    gullBody.add(Shape.ellipsoid(0.2, 0.08, 0.3, 6), T(0, 0.02, -0.42), '#cfd6de');
    for (const sx of [-1, 1]) gullBody.add(Shape.sphere(0.05, 5), T(sx * 0.1, 0.18, 0.48), '#141418');
    const gullBodyVD = gullBody.toVertexData();
    const wing = new Batch();
    wing.add(Shape.rbox(0.8, 0.04, 0.3, 0.02, 1), T(0.4, 0, 0), '#d8dee6');
    wing.add(Shape.rbox(0.25, 0.045, 0.22, 0.02, 1), T(0.75, 0, -0.02), '#3a3f48');
    const wingVD = wing.toVertexData();
    const centers: [number, number, number][] = [
      [10, -70, 14],
      [-10, -66, 18],
      [30, -64, 16],
      [62, 88, 30],
      [70, 96, 26],
      [-30, -60, 15],
      [45, -58, 20],
      [100, 20, 22],
    ];
    centers.forEach(([cx, cz, h], i) => {
      const node = new TransformNode('gull', scene);
      const m = new Mesh('gullM', scene);
      gullBodyVD.applyToMesh(m);
      m.parent = node;
      m.material = mats.char;
      const wL = new TransformNode('gwL', scene);
      wL.parent = node;
      wL.position.set(-0.12, 0.05, 0);
      const wR = new TransformNode('gwR', scene);
      wR.parent = node;
      wR.position.set(0.12, 0.05, 0);
      const ml = new Mesh('gwLM', scene);
      wingVD.applyToMesh(ml);
      ml.parent = wL;
      ml.scaling.x = -1;
      ml.material = mats.char;
      const mr = new Mesh('gwRM', scene);
      wingVD.applyToMesh(mr);
      mr.parent = wR;
      mr.material = mats.char;
      for (const x of [m, ml, mr]) x.isPickable = false;
      node.scaling.setAll(1.3);
      this.gulls.push({ node, wL, wR, cx, cz, r: 10 + rnd() * 14, h, speed: (0.25 + rnd() * 0.2) * (i % 2 ? 1 : -1), phase: rnd() * 6 });
    });

    // ---------------- butterflies
    const bcol = ['#ff8fd0', '#ffd23f', '#7fd4ff', '#ffffff', '#ff9a4a', '#b98cff'];
    const spots: [number, number][] = [
      [-20, -20],
      [14, -22],
      [-8, 28],
      [30, 30],
      [-36, 34],
      [40, 60],
      [8, 46],
      [-24, -38],
      [24, -36],
      [-44, 4],
      [60, 20],
      [36, 70],
    ];
    spots.forEach(([ax, az], i) => {
      for (let k = 0; k < 2; k++) {
        const node = new TransformNode('fly', scene);
        const c = bcol[(i + k) % bcol.length];
        const mk = (sx: number) => {
          const b = new Batch();
          b.add(Shape.ellipsoid(0.18, 0.02, 0.22, 6), T(sx * 0.09, 0, 0.02), c);
          b.add(Shape.ellipsoid(0.12, 0.02, 0.14, 6), T(sx * 0.07, 0, -0.1), c);
          const m = b.build('flyW', scene, mats.char, node);
          m.isPickable = false;
          return m;
        };
        const wL = mk(-1);
        const wR = mk(1);
        const body = new Batch();
        body.add(Shape.capsule(0.16, 0.02, 5), T(0, 0, 0, Math.PI / 2, 0, 0), '#2a2420');
        body.build('flyB', scene, mats.char, node).isPickable = false;
        const y = world.terrain.sample(ax, az) + 1;
        const pos = new Vector3(ax + rnd() * 3, y, az + rnd() * 3);
        node.position.copyFrom(pos);
        this.flies.push({ node, wL, wR, ax, az, phase: rnd() * 10, pos, vel: new Vector3() });
      }
    });

    // ---------------- crabs on the beaches
    const crabB = new Batch();
    crabB.add(Shape.ellipsoid(0.42, 0.18, 0.32, 10), T(0, 0.12, 0), '#ff6a4a');
    for (const sx of [-1, 1]) {
      crabB.add(Shape.sphere(0.12, 6), T(sx * 0.28, 0.14, 0.14), '#ff6a4a');
      crabB.add(Shape.cyl(0.12, 0.025, 0.025, 4), T(sx * 0.07, 0.25, 0.1), '#ff6a4a');
      crabB.add(Shape.sphere(0.06, 5), T(sx * 0.07, 0.32, 0.1), '#ffffff');
      for (let l = 0; l < 3; l++) crabB.add(Shape.cyl(0.18, 0.025, 0.025, 4), T(sx * 0.26, 0.06, -0.08 + l * 0.08, 0, 0, sx * 1.1), '#e8553a');
    }
    const crabVD = crabB.toVertexData();
    for (const [x, z] of [
      [36, -52],
      [46, -54],
      [-22, -58],
      [58, -46],
    ]) {
      const node = new TransformNode('crab', scene);
      const m = new Mesh('crabM', scene);
      crabVD.applyToMesh(m);
      m.material = mats.char;
      m.parent = node;
      m.isPickable = false;
      const home = new Vector3(x, 0, z);
      node.position.set(x, world.terrain.sample(x, z), z);
      this.walkers.push({ node, home, target: home.clone(), wait: rnd() * 3, speed: 1.6, kind: 'crab', phase: rnd() * 5 });
    }

    // ---------------- sheep on the hill
    const sheepB = new Batch();
    const wool = '#f8f6f0';
    sheepB.add(Shape.ellipsoid(1.1, 0.8, 1.4, 12), T(0, 0.85, 0), wool, { ao: 0.2 });
    for (let k = 0; k < 9; k++) sheepB.add(Shape.sphere(0.5, 8), T(Math.sin(k * 2.1) * 0.4, 1.0 + Math.cos(k * 1.3) * 0.2, Math.cos(k * 2.1) * 0.5), wool);
    for (const [lx, lz] of [
      [-0.3, 0.45],
      [0.3, 0.45],
      [-0.3, -0.45],
      [0.3, -0.45],
    ])
      sheepB.add(Shape.cyl(0.55, 0.12, 0.12, 6), T(lx, 0.28, lz), '#2a2626');
    const sheepVD = sheepB.toVertexData();
    const headB = new Batch();
    headB.add(Shape.ellipsoid(0.42, 0.45, 0.55, 10), T(0, 0, 0.18), '#2a2626');
    headB.add(Shape.sphere(0.36, 8), T(0, 0.18, 0.02), wool);
    for (const sx of [-1, 1]) {
      headB.add(Shape.ellipsoid(0.24, 0.08, 0.12, 6), T(sx * 0.25, 0.05, 0.05, 0, 0, sx * 0.4), '#2a2626');
      headB.add(Shape.sphere(0.09, 6), T(sx * 0.13, 0.08, 0.33), '#ffffff');
      headB.add(Shape.sphere(0.05, 5), T(sx * 0.13, 0.08, 0.38), '#141418');
    }
    const headVD = headB.toVertexData();
    for (let i = 0; i < 6; i++) {
      const x = 12 + rnd() * 14;
      const z = 61 + rnd() * 5;
      const node = new TransformNode('sheep', scene);
      const m = new Mesh('sheepM', scene);
      sheepVD.applyToMesh(m);
      m.parent = node;
      m.material = mats.char;
      const head = new TransformNode('sheepHead', scene);
      head.parent = node;
      head.position.set(0, 1.05, 0.72);
      const hm = new Mesh('sheepH', scene);
      headVD.applyToMesh(hm);
      hm.parent = head;
      hm.material = mats.char;
      for (const x2 of [m, hm]) {
        x2.isPickable = false;
        world.env.shadow.getShadowMap()!.renderList!.push(x2);
      }
      node.position.set(x, world.terrain.sample(x, z), z);
      node.rotation.y = rnd() * 6;
      node.scaling.setAll(0.85 + rnd() * 0.2);
      this.walkers.push({ node, head, home: new Vector3(x, 0, z), target: new Vector3(x, 0, z), wait: rnd() * 5, speed: 0.8, kind: 'sheep', phase: rnd() * 5 });
      world.col.addCircle({ x, z, r: 0.9, enabled: () => true });
    }

    // ---------------- ducks on the stream
    const duckB = new Batch();
    duckB.add(Shape.ellipsoid(0.5, 0.36, 0.7, 10), T(0, 0.12, 0), '#f6f0e0');
    duckB.add(Shape.sphere(0.32, 10), T(0, 0.42, 0.26), '#2f7a4a');
    duckB.add(Shape.ellipsoid(0.16, 0.06, 0.2, 6), T(0, 0.38, 0.46), '#ffb02e');
    duckB.add(Shape.cone(0.2, 0.2, 6), T(0, 0.2, -0.38, -2.2, 0, 0), '#f6f0e0');
    const duckVD = duckB.toVertexData();
    for (const [x, z] of [
      [-44, 8.4],
      [-40, 7.2],
      [24, -4],
      [40, -4],
    ]) {
      const node = new TransformNode('duck', scene);
      const m = new Mesh('duckM', scene);
      duckVD.applyToMesh(m);
      m.parent = node;
      m.material = mats.char;
      m.isPickable = false;
      const st = world.terrain.streamInfo(x, z);
      node.position.set(x, st.surface - 0.02, z);
      this.walkers.push({ node, home: new Vector3(x, st.surface - 0.02, z), target: new Vector3(x, 0, z), wait: rnd() * 3, speed: 0.6, kind: 'duck', phase: rnd() * 5 });
    }

    // ---------------- jumping fish
    this.fish = new TransformNode('fish', scene);
    const fb = new Batch();
    fb.add(Shape.ellipsoid(0.22, 0.32, 0.8, 10), T(0, 0, 0), '#7fb4d8', { top: '#d8ecf8' });
    fb.add(Shape.prism([[0, 0], [-0.25, 0.25], [-0.25, -0.25]], 0.04), T(0, 0, -0.45, 0, Math.PI / 2, 0), '#5f94b8');
    fb.build('fishM', scene, mats.char, this.fish).isPickable = false;
    this.fish.setEnabled(false);
  }

  update(dt: number, t: number, player: Vector3) {
    const env = this.world.env;
    for (const g of this.gulls) {
      const a = t * g.speed + g.phase;
      const x = g.cx + Math.cos(a) * g.r;
      const z = g.cz + Math.sin(a) * g.r;
      const y = g.h + Math.sin(t * 0.7 + g.phase) * 1.5;
      g.node.position.set(x, y, z);
      const dx = -Math.sin(a) * g.speed;
      const dz = Math.cos(a) * g.speed;
      g.node.rotation.y = Math.atan2(dx, dz);
      g.node.rotation.z = -Math.sign(g.speed) * 0.35;
      const flap = Math.sin(t * 2.2 + g.phase) > 0.3 ? Math.sin(t * 14 + g.phase) * 0.6 : 0.12;
      g.wL.rotation.z = flap;
      g.wR.rotation.z = -flap;
    }
    for (const f of this.flies) {
      f.phase += dt;
      const target = new Vector3(f.ax + Math.sin(f.phase * 0.4) * 4, 0, f.az + Math.cos(f.phase * 0.33) * 4);
      target.y = this.world.terrain.sample(target.x, target.z) + 0.8 + Math.sin(f.phase * 1.7) * 0.5;
      const steer = target.subtract(f.pos).scale(0.8);
      steer.addInPlace(new Vector3(Math.sin(f.phase * 3.1) * 1.5, Math.cos(f.phase * 4.3) * 1.2, Math.cos(f.phase * 2.7) * 1.5));
      f.vel.addInPlace(steer.scale(dt));
      f.vel.scaleInPlace(0.96);
      f.pos.addInPlace(f.vel.scale(dt));
      f.node.position.copyFrom(f.pos);
      f.node.rotation.y = Math.atan2(f.vel.x, f.vel.z);
      const fl = Math.sin(f.phase * 28) * 1.1;
      f.wL.rotation.z = fl;
      f.wR.rotation.z = -fl;
    }
    for (const w of this.walkers) {
      w.phase += dt;
      const p = w.node.position;
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.kind === 'sheep' && w.head) w.head.rotation.x = 0.5 + Math.sin(w.phase * 3) * 0.1;
        if (w.wait <= 0) {
          const r = w.kind === 'crab' ? 3 : w.kind === 'duck' ? 3 : 4;
          w.target.set(w.home.x + (Math.random() - 0.5) * r * 2, 0, w.home.z + (Math.random() - 0.5) * r * 2);
          if (w.kind === 'sheep') {
            w.target.x = Math.max(8, Math.min(28, w.target.x));
            w.target.z = Math.max(59, Math.min(66, w.target.z));
          }
          if (w.kind === 'duck') {
            const st = this.world.terrain.streamInfo(w.target.x, w.target.z);
            if (st.d > st.width * 0.7) w.target.set(w.home.x, 0, w.home.z);
          }
        }
      } else {
        const dx = w.target.x - p.x;
        const dz = w.target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) w.wait = 1.5 + Math.random() * (w.kind === 'sheep' ? 6 : 3);
        else {
          p.x += (dx / d) * w.speed * dt;
          p.z += (dz / d) * w.speed * dt;
          const yaw = Math.atan2(dx, dz) + (w.kind === 'crab' ? Math.PI / 2 : 0);
          w.node.rotation.y += (yaw - w.node.rotation.y) * Math.min(1, dt * 4);
          if (w.kind === 'sheep' && w.head) w.head.rotation.x = 0;
        }
      }
      // crabs scuttle away from the player
      if (w.kind === 'crab') {
        const pd = Math.hypot(player.x - p.x, player.z - p.z);
        if (pd < 3 && w.wait > 0) {
          w.wait = 0;
          w.target.set(p.x + (p.x - player.x) * 1.5, 0, p.z + (p.z - player.z) * 1.5);
        }
        p.y = this.world.terrain.sample(p.x, p.z) + Math.abs(Math.sin(w.phase * 20)) * 0.03;
      } else if (w.kind === 'sheep') {
        p.y = this.world.terrain.sample(p.x, p.z);
      } else {
        p.y = w.home.y + Math.sin(w.phase * 2) * 0.04;
      }
    }
    // fish jumps near the harbour
    this.fishT -= dt;
    if (!this.fishJump && this.fishT < 0) {
      const a = Math.random() * Math.PI * 2;
      const cx = 10 + Math.cos(a) * 25;
      const cz = -85 + Math.sin(a) * 12;
      const dir = new Vector3(Math.cos(a + 1.5), 0, Math.sin(a + 1.5)).scale(3.5);
      this.fishJump = { from: new Vector3(cx, -0.3, cz), to: new Vector3(cx + dir.x, -0.3, cz + dir.z), t: 0 };
      this.fish.setEnabled(true);
      this.fx.splash(new Vector3(cx, 0, cz));
    }
    if (this.fishJump) {
      const j = this.fishJump;
      j.t += dt / 1.1;
      const p = Vector3.Lerp(j.from, j.to, j.t);
      p.y += Math.sin(j.t * Math.PI) * 2.2;
      this.fish.position.copyFrom(p);
      const d = j.to.subtract(j.from);
      this.fish.rotation.y = Math.atan2(d.x, d.z);
      this.fish.rotation.x = -Math.cos(j.t * Math.PI) * 0.9;
      if (j.t >= 1) {
        this.fx.splash(j.to.add(new Vector3(0, 0.3, 0)));
        this.fish.setEnabled(false);
        this.fishJump = null;
        this.fishT = 4 + Math.random() * 6;
      }
    }
    void env;
    void Color4;
  }
}
