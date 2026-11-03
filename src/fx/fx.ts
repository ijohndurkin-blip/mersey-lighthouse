import {
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Color3,
  Texture,
  Vector3,
  AbstractMesh,
} from '../babylon';

function makeTex(scene: Scene, kind: 'soft' | 'star' | 'leaf' | 'smoke') {
  const s = 64;
  const t = new DynamicTexture('ptex_' + kind, { width: s, height: s }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, s, s);
  if (kind === 'soft' || kind === 'smoke') {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(kind === 'soft' ? 0.25 : 0.4, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  } else if (kind === 'star') {
    c.translate(s / 2, s / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 7 : 31;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  } else {
    c.translate(s / 2, s / 2);
    c.fillStyle = 'white';
    c.beginPath();
    c.ellipse(0, 0, 26, 12, 0.6, 0, Math.PI * 2);
    c.fill();
  }
  t.hasAlpha = true;
  t.update(false);
  return t;
}

export class FX {
  soft: Texture;
  star: Texture;
  leaf: Texture;
  smoke: Texture;
  private systems: ParticleSystem[] = [];

  constructor(private scene: Scene) {
    this.soft = makeTex(scene, 'soft');
    this.star = makeTex(scene, 'star');
    this.leaf = makeTex(scene, 'leaf');
    this.smoke = makeTex(scene, 'smoke');
  }

  private burst(opts: {
    pos: Vector3;
    tex: Texture;
    count: number;
    c1: Color4;
    c2: Color4;
    minSize: number;
    maxSize: number;
    minLife: number;
    maxLife: number;
    power: [number, number];
    gravity?: number;
    dir1?: Vector3;
    dir2?: Vector3;
    additive?: boolean;
    radius?: number;
  }) {
    const ps = new ParticleSystem('burst', opts.count, this.scene);
    ps.particleTexture = opts.tex;
    ps.emitter = opts.pos.clone();
    const r = opts.radius ?? 0.2;
    ps.minEmitBox = new Vector3(-r, -r, -r);
    ps.maxEmitBox = new Vector3(r, r, r);
    ps.color1 = opts.c1;
    ps.color2 = opts.c2;
    ps.colorDead = new Color4(opts.c2.r, opts.c2.g, opts.c2.b, 0);
    ps.minSize = opts.minSize;
    ps.maxSize = opts.maxSize;
    ps.minLifeTime = opts.minLife;
    ps.maxLifeTime = opts.maxLife;
    ps.minEmitPower = opts.power[0];
    ps.maxEmitPower = opts.power[1];
    ps.direction1 = opts.dir1 ?? new Vector3(-1, 1, -1);
    ps.direction2 = opts.dir2 ?? new Vector3(1, 1.5, 1);
    ps.gravity = new Vector3(0, opts.gravity ?? -4, 0);
    ps.manualEmitCount = opts.count;
    ps.blendMode = opts.additive === false ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
    ps.minAngularSpeed = -3;
    ps.maxAngularSpeed = 3;
    ps.targetStopDuration = opts.maxLife + 0.2;
    ps.disposeOnStop = true;
    ps.start();
    return ps;
  }

  sparkle(pos: Vector3, color = new Color4(1, 0.9, 0.4, 1), count = 40) {
    this.burst({
      pos,
      tex: this.star,
      count,
      c1: color,
      c2: new Color4(1, 1, 1, 1),
      minSize: 0.15,
      maxSize: 0.45,
      minLife: 0.5,
      maxLife: 1.2,
      power: [2, 5],
      gravity: -3,
      radius: 0.3,
    });
  }

  confetti(pos: Vector3, count = 120) {
    const cols = [new Color4(1, 0.35, 0.4, 1), new Color4(1, 0.82, 0.25, 1), new Color4(0.3, 0.75, 1, 1), new Color4(0.5, 0.9, 0.4, 1)];
    for (let i = 0; i < 4; i++) {
      this.burst({
        pos,
        tex: this.leaf,
        count: count / 4,
        c1: cols[i],
        c2: cols[(i + 1) % 4],
        minSize: 0.15,
        maxSize: 0.3,
        minLife: 1.2,
        maxLife: 2.4,
        power: [4, 9],
        gravity: -5,
        dir1: new Vector3(-1, 2, -1),
        dir2: new Vector3(1, 3, 1),
        additive: false,
        radius: 0.5,
      });
    }
  }

  dust(pos: Vector3, count = 14) {
    this.burst({
      pos,
      tex: this.smoke,
      count,
      c1: new Color4(0.9, 0.85, 0.75, 0.5),
      c2: new Color4(0.85, 0.8, 0.7, 0.3),
      minSize: 0.3,
      maxSize: 0.7,
      minLife: 0.4,
      maxLife: 0.8,
      power: [0.8, 2],
      gravity: 0.5,
      dir1: new Vector3(-1, 0.2, -1),
      dir2: new Vector3(1, 0.5, 1),
      additive: false,
      radius: 0.3,
    });
  }

  splash(pos: Vector3) {
    this.burst({
      pos,
      tex: this.soft,
      count: 60,
      c1: new Color4(0.85, 0.95, 1, 0.9),
      c2: new Color4(0.6, 0.85, 1, 0.6),
      minSize: 0.15,
      maxSize: 0.5,
      minLife: 0.5,
      maxLife: 1.0,
      power: [3, 7],
      gravity: -12,
      dir1: new Vector3(-0.6, 2, -0.6),
      dir2: new Vector3(0.6, 3, 0.6),
      additive: false,
      radius: 0.6,
    });
  }

  firework(pos: Vector3, color: Color4) {
    this.burst({
      pos,
      tex: this.star,
      count: 220,
      c1: color,
      c2: new Color4(1, 1, 0.9, 1),
      minSize: 0.8,
      maxSize: 1.8,
      minLife: 1.2,
      maxLife: 2.2,
      power: [14, 22],
      gravity: -4,
      dir1: new Vector3(-1, -1, -1),
      dir2: new Vector3(1, 1, 1),
      radius: 0.5,
    });
    this.burst({
      pos,
      tex: this.soft,
      count: 30,
      c1: new Color4(1, 1, 1, 1),
      c2: color,
      minSize: 4,
      maxSize: 7,
      minLife: 0.15,
      maxLife: 0.35,
      power: [0, 1],
      gravity: 0,
      radius: 0.2,
    });
  }

  /** Rising rocket trail; resolves when it reaches the top. */
  rocket(from: Vector3, to: Vector3, onBurst: () => void) {
    const ps = new ParticleSystem('rocket', 200, this.scene);
    ps.particleTexture = this.soft;
    const em = from.clone();
    ps.emitter = em;
    ps.color1 = new Color4(1, 0.85, 0.5, 1);
    ps.color2 = new Color4(1, 0.6, 0.3, 1);
    ps.colorDead = new Color4(1, 0.3, 0.1, 0);
    ps.minSize = 0.3;
    ps.maxSize = 0.6;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.5;
    ps.emitRate = 160;
    ps.minEmitPower = 0;
    ps.maxEmitPower = 0.5;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    let t = 0;
    const dur = 1.1;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const k = Math.min(1, t / dur);
      const e = 1 - Math.pow(1 - k, 2);
      em.copyFrom(Vector3.Lerp(from, to, e));
      if (k >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        ps.stop();
        ps.disposeOnStop = true;
        onBurst();
      }
    });
  }

  /** Continuous emitters --------------------------------------------------- */
  chimneySmoke(pos: Vector3) {
    const ps = new ParticleSystem('smoke', 60, this.scene);
    ps.particleTexture = this.smoke;
    ps.emitter = pos;
    ps.color1 = new Color4(0.95, 0.95, 0.95, 0.35);
    ps.color2 = new Color4(0.85, 0.85, 0.9, 0.25);
    ps.colorDead = new Color4(0.8, 0.8, 0.85, 0);
    ps.minSize = 0.6;
    ps.maxSize = 1.4;
    ps.minScaleX = 1;
    ps.minLifeTime = 2.5;
    ps.maxLifeTime = 4;
    ps.emitRate = 9;
    ps.minEmitPower = 0.6;
    ps.maxEmitPower = 1.2;
    ps.direction1 = new Vector3(0.2, 1, -0.1);
    ps.direction2 = new Vector3(0.6, 1.4, 0.2);
    ps.gravity = new Vector3(0.4, 0.15, 0);
    ps.addSizeGradient(0, 0.6);
    ps.addSizeGradient(1, 2.6);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    this.systems.push(ps);
    return ps;
  }

  windLeaves(center: () => Vector3) {
    const ps = new ParticleSystem('leaves', 80, this.scene);
    ps.particleTexture = this.leaf;
    const em = new Vector3();
    ps.emitter = em;
    ps.minEmitBox = new Vector3(-22, 0, -22);
    ps.maxEmitBox = new Vector3(-10, 6, 22);
    ps.color1 = new Color4(0.55, 0.8, 0.3, 0.9);
    ps.color2 = new Color4(0.9, 0.75, 0.3, 0.9);
    ps.colorDead = new Color4(0.6, 0.7, 0.3, 0);
    ps.minSize = 0.12;
    ps.maxSize = 0.24;
    ps.minLifeTime = 3;
    ps.maxLifeTime = 5;
    ps.emitRate = 9;
    ps.minEmitPower = 3;
    ps.maxEmitPower = 5;
    ps.direction1 = new Vector3(1, 0.1, -0.2);
    ps.direction2 = new Vector3(1, 0.4, 0.2);
    ps.gravity = new Vector3(0, -0.3, 0);
    ps.minAngularSpeed = -4;
    ps.maxAngularSpeed = 4;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    this.scene.onBeforeRenderObservable.add(() => em.copyFrom(center()));
    this.systems.push(ps);
    return ps;
  }

  fountain(pos: Vector3) {
    const ps = new ParticleSystem('fountain', 200, this.scene);
    ps.particleTexture = this.soft;
    ps.emitter = pos;
    ps.minEmitBox = new Vector3(-0.1, 0, -0.1);
    ps.maxEmitBox = new Vector3(0.1, 0, 0.1);
    ps.color1 = new Color4(0.8, 0.95, 1, 0.8);
    ps.color2 = new Color4(0.6, 0.85, 1, 0.6);
    ps.colorDead = new Color4(0.6, 0.85, 1, 0);
    ps.minSize = 0.12;
    ps.maxSize = 0.28;
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1.0;
    ps.emitRate = 120;
    ps.minEmitPower = 3;
    ps.maxEmitPower = 4;
    ps.direction1 = new Vector3(-0.35, 2, -0.35);
    ps.direction2 = new Vector3(0.35, 2, 0.35);
    ps.gravity = new Vector3(0, -9, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    this.systems.push(ps);
  }

  /** Glowing sparkle that hovers over collectibles. */
  glimmer(pos: Vector3 | AbstractMesh, color = new Color4(1, 0.85, 0.3, 1), rate = 8) {
    const ps = new ParticleSystem('glimmer', 30, this.scene);
    ps.particleTexture = this.star;
    ps.emitter = pos as any;
    ps.minEmitBox = new Vector3(-0.6, 0, -0.6);
    ps.maxEmitBox = new Vector3(0.6, 1.2, 0.6);
    ps.color1 = color;
    ps.color2 = new Color4(1, 1, 1, 1);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.minSize = 0.1;
    ps.maxSize = 0.3;
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1.2;
    ps.emitRate = rate;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.6;
    ps.direction1 = new Vector3(0, 1, 0);
    ps.direction2 = new Vector3(0, 1, 0);
    ps.gravity = new Vector3(0, 0.3, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    return ps;
  }

  /** Energy pulses travelling along a polyline (returns an updater). */
  energyFlow(points: Vector3[], color = new Color3(0.3, 0.95, 1)) {
    const mat = new StandardMaterial('pulseMat', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = color;
    const pulses: Mesh[] = [];
    const n = Math.max(4, Math.floor(points.length / 4));
    for (let i = 0; i < n; i++) {
      const m = MeshBuilder.CreateSphere('pulse', { diameter: 0.28, segments: 6 }, this.scene);
      m.material = mat;
      m.isPickable = false;
      m.setEnabled(false);
      pulses.push(m);
    }
    const lens: number[] = [0];
    for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + Vector3.Distance(points[i - 1], points[i]));
    const total = lens[lens.length - 1];
    let t = 0;
    let on = false;
    const at = (d: number) => {
      d = ((d % total) + total) % total;
      let i = 1;
      while (i < lens.length - 1 && lens[i] < d) i++;
      const f = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      return Vector3.Lerp(points[i - 1], points[i], f);
    };
    return {
      setOn: (v: boolean) => {
        on = v;
        for (const p of pulses) p.setEnabled(v);
      },
      update: (dt: number, speed = 14) => {
        if (!on) return;
        t += dt * speed;
        pulses.forEach((p, i) => p.position.copyFrom(at(t + (i / pulses.length) * total)));
      },
    };
  }
}
