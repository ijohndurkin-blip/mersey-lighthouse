import { FreeCamera, Scene, Vector3 } from '../babylon';
import { clamp, damp, dampAngle, easeInOut, lerp } from '../core/noise';
import { Terrain } from '../world/terrain';

export interface Shot {
  from: Vector3;
  to?: Vector3;
  lookFrom: Vector3;
  lookTo?: Vector3;
  dur: number;
  ease?: (t: number) => number;
  /** optional orbit around lookFrom (radians over the shot) */
  orbit?: number;
  fov?: number;
}

export class CameraRig {
  cam: FreeCamera;
  yaw = 0;
  pitch = 0.32;
  dist = 7.5;
  targetDist = 7.5;
  minDist = 3.5;
  maxDist = 13;
  mode: 'follow' | 'fixed' | 'cinematic' = 'follow';
  private pos = new Vector3();
  private look = new Vector3();
  private fixedPos = new Vector3();
  private fixedLook = new Vector3();
  private blend = 0;
  private shot: Shot | null = null;
  private shotT = 0;
  private shotDone: (() => void) | null = null;
  sensitivity = 0.0055;
  autoFollow = true;
  private idleLook = 0;
  shake = 0;
  baseFov = 0.92;
  occlude: ((ax: number, az: number, bx: number, bz: number) => number) | null = null;

  constructor(scene: Scene, private terrain: Terrain) {
    this.cam = new FreeCamera('cam', new Vector3(0, 10, -10), scene);
    this.cam.minZ = 0.1;
    this.cam.maxZ = 4200;
    this.cam.fov = this.baseFov;
    this.cam.inputs.clear();
    scene.activeCamera = this.cam;
  }

  snapFollow(target: Vector3, yaw: number) {
    this.yaw = yaw;
    this.mode = 'follow';
    const p = this.followPos(target);
    this.pos.copyFrom(p);
    this.look.copyFrom(target);
    this.apply();
  }

  private followPos(target: Vector3) {
    const cp = Math.cos(this.pitch);
    const off = new Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).scale(this.dist);
    const p = target.add(off);
    // keep above terrain along the way
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const q = Vector3.Lerp(target, p, t);
      const g = this.terrain.sample(q.x, q.z) + 0.9;
      if (q.y < g) p.y += (g - q.y) / t;
    }
    if (this.occlude) {
      const t = this.occlude(target.x, target.z, p.x, p.z);
      if (t < 1) {
        const k = Math.max(0.12, t - 0.05);
        p.x = target.x + (p.x - target.x) * k;
        p.z = target.z + (p.z - target.z) * k;
        p.y = target.y + (p.y - target.y) * Math.max(k, 0.5);
      }
    }
    const g = Math.max(this.terrain.sample(p.x, p.z), 0) + 0.8;
    if (p.y < g) p.y = g;
    return p;
  }

  setFixed(pos: Vector3, look: Vector3) {
    this.mode = 'fixed';
    this.fixedPos.copyFrom(pos);
    this.fixedLook.copyFrom(look);
  }

  release(yaw?: number) {
    this.mode = 'follow';
    if (yaw !== undefined) this.yaw = yaw;
  }

  play(shot: Shot): Promise<void> {
    this.mode = 'cinematic';
    this.shot = shot;
    this.shotT = 0;
    return new Promise((res) => {
      this.shotDone = res;
    });
  }

  skipShot() {
    if (this.shot) this.shotT = this.shot.dur;
  }

  update(dt: number, target: Vector3, look: { dx: number; dy: number; zoom: number }, moving: number, playerYaw: number) {
    if (this.mode === 'follow') {
      if (Math.abs(look.dx) > 0 || Math.abs(look.dy) > 0) this.idleLook = 0;
      else this.idleLook += dt;
      this.yaw += look.dx * this.sensitivity;
      this.pitch = clamp(this.pitch + look.dy * this.sensitivity * 0.8, -0.05, 1.15);
      this.targetDist = clamp(this.targetDist + look.zoom * 0.8, this.minDist, this.maxDist);
      this.dist = damp(this.dist, this.targetDist, 6, dt);
      // gently swing behind the player when moving and not steering the camera
      if (this.autoFollow && moving > 0.3 && this.idleLook > 1.2) {
        this.yaw = dampAngle(this.yaw, playerYaw, 0.6 * moving, dt);
      }
      const want = this.followPos(target);
      const k = 1 - Math.exp(-10 * dt);
      this.pos.x += (want.x - this.pos.x) * k;
      this.pos.y += (want.y - this.pos.y) * k;
      this.pos.z += (want.z - this.pos.z) * k;
      this.look.x += (target.x - this.look.x) * (1 - Math.exp(-14 * dt));
      this.look.y += (target.y - this.look.y) * (1 - Math.exp(-10 * dt));
      this.look.z += (target.z - this.look.z) * (1 - Math.exp(-14 * dt));
      this.cam.fov = damp(this.cam.fov, this.baseFov + moving * 0.04, 3, dt);
    } else if (this.mode === 'fixed') {
      const k = 1 - Math.exp(-4 * dt);
      Vector3.LerpToRef(this.pos, this.fixedPos, k, this.pos);
      Vector3.LerpToRef(this.look, this.fixedLook, k, this.look);
      this.cam.fov = damp(this.cam.fov, this.baseFov, 3, dt);
    } else if (this.mode === 'cinematic' && this.shot) {
      const s = this.shot;
      this.shotT += dt;
      const raw = clamp(this.shotT / s.dur, 0, 1);
      const t = (s.ease ?? easeInOut)(raw);
      const lf = s.lookTo ? Vector3.Lerp(s.lookFrom, s.lookTo, t) : s.lookFrom;
      let p = s.to ? Vector3.Lerp(s.from, s.to, t) : s.from.clone();
      if (s.orbit) {
        const rel = p.subtract(s.lookFrom);
        const a = s.orbit * t;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        p = s.lookFrom.add(new Vector3(rel.x * c + rel.z * sn, rel.y, -rel.x * sn + rel.z * c));
      }
      this.pos.copyFrom(p);
      this.look.copyFrom(lf);
      if (s.fov) this.cam.fov = lerp(this.cam.fov, s.fov, 1 - Math.exp(-3 * dt));
      if (raw >= 1) {
        const done = this.shotDone;
        this.shot = null;
        this.shotDone = null;
        done?.();
      }
    }
    this.apply();
  }

  private apply() {
    const p = this.pos.clone();
    if (this.shake > 0) {
      p.x += (Math.random() - 0.5) * this.shake;
      p.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - 0.016 * 2);
    }
    this.cam.position.copyFrom(p);
    this.cam.setTarget(this.look);
  }

  get position() {
    return this.pos;
  }
  get lookAt() {
    return this.look;
  }
}
