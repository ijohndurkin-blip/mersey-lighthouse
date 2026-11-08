import { Mesh, Scene, ShadowGenerator, TransformNode, Vector3 } from '../babylon';
import { Rig, RigNodes } from './rig';
import { PipNodes } from './cast';
import { Collision } from '../world/collision';
import { Input } from '../input/input';
import { clamp, damp, dampAngle, wrapAngle } from '../core/noise';
import type { Surface } from '../world/terrain';

function addShadows(meshes: Mesh[], shadow: ShadowGenerator) {
  const map = shadow.getShadowMap()!;
  for (const m of meshes) {
    map.renderList!.push(m);
    m.receiveShadows = true;
  }
}

// =============================================================================
export class Player {
  rig: Rig;
  pos: Vector3;
  yaw = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  grounded = true;
  surface: Surface = 'grass';
  walkSpeed = 4.4;
  runSpeed = 7.8;
  radius = 0.38;
  frozen = false;
  onStep?: (s: Surface, run: boolean) => void;
  onJump?: () => void;
  onLand?: (impact: number) => void;
  private airTime = 0;
  private coyote = 0;
  carry: TransformNode | null = null;

  constructor(public nodes: RigNodes, private col: Collision, shadow: ShadowGenerator) {
    this.rig = new Rig(nodes);
    this.rig.stride = 0.85;
    this.rig.foreScale = 0.3;
    this.pos = nodes.root.position;
    addShadows(nodes.meshes, shadow);
    this.rig.onStep = () => this.onStep?.(this.surface, Math.hypot(this.vx, this.vz) > 6);
  }

  teleport(x: number, z: number, yaw = this.yaw) {
    const g = this.col.groundAt(x, z, 50);
    this.pos.set(x, g.y, z);
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.nodes.root.rotation.y = yaw;
  }

  update(dt: number, input: Input | null, camYaw: number) {
    let mx = 0;
    let my = 0;
    let run = false;
    let jump = false;
    if (input && !this.frozen) {
      mx = input.moveX;
      my = input.moveY;
      run = input.run;
      jump = input.consumeJump();
    }
    // camera-relative direction
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let dx = fx * my + rx * mx;
    let dz = fz * my + rz * mx;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.01) {
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
    }
    const speed = (run ? this.runSpeed : this.walkSpeed) * mag;
    const accel = this.grounded ? 12 : 4;
    this.vx = damp(this.vx, dx * speed, accel, dt);
    this.vz = damp(this.vz, dz * speed, accel, dt);
    if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);

    // jumping (with a little coyote time)
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (jump && (this.grounded || this.coyote > 0)) {
      this.vy = 6.6;
      this.grounded = false;
      this.coyote = 0;
      this.onJump?.();
    }

    // horizontal move with sliding
    const p = this.pos;
    const step = Math.hypot(this.vx, this.vz) * dt;
    const nx = p.x + this.vx * dt;
    const nz = p.z + this.vz * dt;
    if (step > 0) {
      if (this.col.walkable(nx, nz, p.y, step)) {
        p.x = nx;
        p.z = nz;
      } else if (this.col.walkable(nx, p.z, p.y, Math.abs(this.vx * dt))) {
        p.x = nx;
        this.vz *= 0.5;
      } else if (this.col.walkable(p.x, nz, p.y, Math.abs(this.vz * dt))) {
        p.z = nz;
        this.vx *= 0.5;
      } else {
        this.vx *= 0.2;
        this.vz *= 0.2;
      }
    }
    const before = { x: p.x, z: p.z };
    this.col.resolve(p, this.radius);
    // if resolving pushed us somewhere unwalkable, undo
    if (!this.col.walkable(p.x, p.z, p.y, 0.3)) {
      p.x = before.x;
      p.z = before.z;
    }

    // vertical
    const g = this.col.groundAt(p.x, p.z, p.y);
    this.surface = g.surface;
    if (this.grounded) {
      if (g.y < p.y - 0.55) {
        this.grounded = false;
        this.vy = 0;
      } else {
        p.y = damp(p.y, g.y, 25, dt);
      }
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= 19 * dt;
      p.y += this.vy * dt;
      if (p.y <= g.y && this.vy <= 0) {
        const impact = clamp(-this.vy / 12, 0, 1);
        p.y = g.y;
        this.vy = 0;
        this.grounded = true;
        if (this.airTime > 0.15) {
          this.rig.land(impact);
          this.onLand?.(impact);
        }
        this.airTime = 0;
      }
    }
    this.nodes.root.rotation.y = this.yaw;
    this.rig.speed = Math.hypot(this.vx, this.vz);
    this.rig.grounded = this.grounded;
    this.rig.vy = this.vy;
    this.rig.update(dt);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  forward() {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}

// =============================================================================
export class NPC {
  rig: Rig;
  pos: Vector3;
  yaw: number;
  homeYaw: number;
  path: Vector3[] = [];
  speed = 3.2;
  talkPitch: number;
  private idleTimer = 4;
  lookAt: Vector3 | null = null;
  onArrive?: () => void;

  constructor(public name: string, public nodes: RigNodes, private col: Collision, shadow: ShadowGenerator, x: number, z: number, yaw: number, pitch: number) {
    this.rig = new Rig(nodes);
    this.pos = nodes.root.position;
    this.yaw = yaw;
    this.homeYaw = yaw;
    this.talkPitch = pitch;
    addShadows(nodes.meshes, shadow);
    this.place(x, z, yaw);
  }

  place(x: number, z: number, yaw = this.yaw) {
    const g = this.col.groundAt(x, z, 50);
    this.pos.set(x, g.y, z);
    this.yaw = yaw;
    this.homeYaw = yaw;
    this.nodes.root.rotation.y = yaw;
    this.path = [];
  }

  walkTo(points: Vector3[], onArrive?: () => void) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive;
  }

  update(dt: number, player: Vector3) {
    const p = this.pos;
    let moving = 0;
    if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        this.path.shift();
        if (!this.path.length) {
          this.homeYaw = this.yaw;
          this.onArrive?.();
        }
      } else {
        const sp = Math.min(this.speed, d * 3);
        p.x += (dx / d) * sp * dt;
        p.z += (dz / d) * sp * dt;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
        moving = sp;
      }
      p.y = damp(p.y, this.col.groundAt(p.x, p.z, p.y + 0.5).y, 20, dt);
    } else {
      // face the player when they are close, otherwise home direction
      const look = this.lookAt ?? player;
      const dx = look.x - p.x;
      const dz = look.z - p.z;
      const d = Math.hypot(dx, dz);
      const want = d < 9 || this.lookAt ? Math.atan2(dx, dz) : this.homeYaw;
      this.yaw = dampAngle(this.yaw, want, 4, dt);
      this.idleTimer -= dt;
      if (this.idleTimer < 0 && this.rig.action === 'none') {
        this.idleTimer = 5 + Math.random() * 6;
        if (d < 12) this.rig.play(Math.random() < 0.5 ? 'wave' : 'think', 1.8);
      }
    }
    this.nodes.root.rotation.y = this.yaw;
    this.rig.speed = moving;
    this.rig.update(dt);
  }
}

// =============================================================================
export class Pip {
  pos = new Vector3();
  yaw = 0;
  private flap = 0;
  private hop = 0;
  private hopV = 0;
  flying = true;
  private idle = 0;
  private emoteT = 0;
  private emote: 'none' | 'spin' | 'jump' | 'nod' = 'none';
  lookTarget: Vector3 | null = null;
  /** override target (e.g. fly to a hint location) */
  goal: Vector3 | null = null;

  constructor(public n: PipNodes, private col: Collision, shadow: ShadowGenerator) {
    addShadows(n.meshes, shadow);
    this.pos = n.root.position;
  }

  place(p: Vector3) {
    this.pos.copyFrom(p);
  }

  doEmote(e: 'spin' | 'jump' | 'nod') {
    this.emote = e;
    this.emoteT = 0;
  }

  update(dt: number, player: Player, t: number) {
    const pp = player.pos;
    const moving = player.speed > 0.6;
    this.idle = moving ? 0 : this.idle + dt;
    let target: Vector3;
    if (this.goal) target = this.goal;
    else {
      // hover beside the player's left shoulder, slightly behind
      const side = new Vector3(-Math.cos(player.yaw), 0, Math.sin(player.yaw));
      const back = player.forward().scale(-1);
      target = pp.add(side.scale(1.25)).add(back.scale(0.6));
    }
    const ground = this.col.groundAt(target.x, target.z, target.y + 3).y;
    const wantFly = moving || this.goal !== null || this.idle < 1.2 || !player.grounded || Math.abs(ground - pp.y) > 1.2;
    this.flying = wantFly;
    const ty = this.flying ? Math.max(ground, pp.y) + 1.55 + Math.sin(t * 2.3) * 0.12 : ground;
    const k = 1 - Math.exp(-(this.goal ? 2.5 : 5) * dt);
    this.pos.x += (target.x - this.pos.x) * k;
    this.pos.z += (target.z - this.pos.z) * k;
    if (this.flying) this.pos.y += (ty - this.pos.y) * (1 - Math.exp(-4 * dt));
    else {
      // hop along the ground
      this.hopV -= 20 * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        this.hopV = Math.random() < 0.02 ? 3 : 0;
      }
      this.pos.y += (ty + this.hop - this.pos.y) * (1 - Math.exp(-12 * dt));
    }
    // facing: towards movement, or towards player/look target when idle
    const look = this.lookTarget ?? (moving ? null : pp);
    let want = this.yaw;
    const mvx = target.x - this.pos.x;
    const mvz = target.z - this.pos.z;
    if (Math.hypot(mvx, mvz) > 0.5) want = Math.atan2(mvx, mvz);
    else if (look) want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, 6, dt);
    const n = this.n;
    n.root.rotation.y = this.yaw;
    // wings
    if (this.flying) {
      this.flap += dt * 22;
      const f = Math.sin(this.flap);
      n.wingL.rotation.z = -0.4 - f * 0.9;
      n.wingR.rotation.z = 0.4 + f * 0.9;
      n.body.rotation.x = 0.25;
      n.footL.position.y = 0.1;
      n.footR.position.y = 0.1;
    } else {
      n.wingL.rotation.z = damp(n.wingL.rotation.z, -0.05, 8, dt);
      n.wingR.rotation.z = damp(n.wingR.rotation.z, 0.05, 8, dt);
      n.body.rotation.x = damp(n.body.rotation.x, 0, 8, dt);
      n.footL.position.y = 0;
      n.footR.position.y = 0;
    }
    n.body.position.y = this.flying ? 0.1 : Math.abs(Math.sin(t * 2.0)) * 0.015;
    n.head.rotation.z = Math.sin(t * 1.3) * 0.08;
    n.head.rotation.x = Math.sin(t * 0.9) * 0.05;
    // emotes
    if (this.emote !== 'none') {
      this.emoteT += dt;
      const e = this.emoteT;
      if (this.emote === 'spin') n.root.rotation.y = this.yaw + Math.min(1, e / 0.7) * Math.PI * 2;
      if (this.emote === 'jump') n.body.position.y += Math.sin(Math.min(1, e / 0.6) * Math.PI) * 0.5;
      if (this.emote === 'nod') n.head.rotation.x = Math.sin(e * 14) * 0.25;
      if (e > 0.8) this.emote = 'none';
    }
    // blink
    const bl = (t * 0.37) % 4 < 0.08 ? 0.1 : 1;
    for (const eye of n.eyes) eye.scaling.y = bl;
    void wrapAngle;
  }
}
