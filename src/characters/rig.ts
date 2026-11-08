import { Mesh, Scene, TransformNode, Vector3 } from '../babylon';
import { damp } from '../core/noise';

export type Action = 'none' | 'wave' | 'celebrate' | 'interact' | 'talk' | 'think' | 'point' | 'cheer' | 'carry';

export interface RigNodes {
  root: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  foreL: TransformNode;
  foreR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  shinL: TransformNode;
  shinR: TransformNode;
  eyes: TransformNode[];
  meshes: Mesh[];
}

/** Procedural humanoid animator: walk/run/jump/idle + expressive actions. */
export class Rig {
  phase = 0;
  t = Math.random() * 10;
  speed = 0; // horizontal speed m/s
  maxSpeed = 8;
  grounded = true;
  vy = 0;
  action: Action = 'none';
  actionT = 0;
  actionDur = 0;
  landT = 0;
  blinkT = 2;
  lookYaw = 0;
  lookPitch = 0;
  private lookTimer = 3;
  private lookTarget = 0;
  hipsBaseY: number;
  stride = 1.25;
  /** how much the elbows bend (the panda's arms are one smooth piece) */
  foreScale = 1;
  bounce = 1;
  onStep?: (foot: number) => void;
  private lastStepSign = 0;

  constructor(public n: RigNodes) {
    this.hipsBaseY = n.hips.position.y;
  }

  play(a: Action, dur = 1.5) {
    this.action = a;
    this.actionT = 0;
    this.actionDur = dur;
  }

  land(impact: number) {
    this.landT = Math.min(1, impact);
  }

  update(dt: number) {
    const n = this.n;
    this.t += dt;
    const sp = this.speed;
    const run = Math.min(1, Math.max(0, (sp - 4) / 4));
    const walk = Math.min(1, sp / 2.5);
    if (this.grounded) this.phase += dt * (sp / this.stride) * Math.PI * (1 - run * 0.25);
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const k = 1 - Math.exp(-14 * dt);
    const set = (node: TransformNode, x: number, y: number, z: number) => {
      node.rotation.x += (x - node.rotation.x) * k;
      node.rotation.y += (y - node.rotation.y) * k;
      node.rotation.z += (z - node.rotation.z) * k;
    };
    // footsteps
    const stepSign = Math.sign(s);
    if (this.grounded && sp > 0.6 && stepSign !== this.lastStepSign) {
      this.onStep?.(stepSign);
    }
    this.lastStepSign = stepSign;

    let legLx = 0;
    let legRx = 0;
    let shinL = 0.05;
    let shinR = 0.05;
    let armLx = 0.05;
    let armRx = 0.05;
    let armLz = -0.12;
    let armRz = 0.12;
    let foreL = -0.25;
    let foreR = -0.25;
    let torsoX = 0;
    let torsoY = 0;
    let torsoZ = 0;
    let headX = 0;
    let headY = 0;
    let headZ = 0;
    let hipsY = this.hipsBaseY;

    const breathe = Math.sin(this.t * 2.2);
    if (this.grounded) {
      const amp = 0.55 * walk + 0.25 * run;
      legLx = -s * amp;
      legRx = s * amp;
      shinL = 0.1 + Math.max(0, -c) * (0.7 + run * 0.6) * walk;
      shinR = 0.1 + Math.max(0, c) * (0.7 + run * 0.6) * walk;
      armLx = s * (0.5 * walk + 0.35 * run);
      armRx = -s * (0.5 * walk + 0.35 * run);
      foreL = -0.3 - run * 0.9;
      foreR = -0.3 - run * 0.9;
      torsoX = 0.06 * walk + 0.16 * run;
      torsoY = s * 0.12 * walk;
      hipsY += Math.abs(c) * 0.06 * walk * this.bounce + breathe * 0.006 * (1 - walk);
      headX = -torsoX * 0.6;
      // idle look-around
      if (sp < 0.3) {
        this.lookTimer -= dt;
        if (this.lookTimer < 0) {
          this.lookTimer = 2 + Math.random() * 4;
          this.lookTarget = (Math.random() - 0.5) * 1.0;
        }
        headY = this.lookTarget * 0.6;
        armLz = -0.14 - breathe * 0.02;
        armRz = 0.14 + breathe * 0.02;
      }
    } else {
      // airborne pose
      const up = this.vy > 0 ? 1 : 0;
      legLx = -0.7;
      legRx = 0.25;
      shinL = 1.1;
      shinR = 0.5;
      armLx = -0.6 * up - 0.2;
      armRx = -0.6 * up - 0.2;
      armLz = -0.9;
      armRz = 0.9;
      foreL = -0.5;
      foreR = -0.5;
      torsoX = 0.1;
    }
    // landing squash
    if (this.landT > 0) {
      hipsY -= this.landT * 0.12;
      shinL += this.landT * 0.6;
      shinR += this.landT * 0.6;
      legLx -= this.landT * 0.35;
      legRx -= this.landT * 0.35;
      this.landT = Math.max(0, this.landT - dt * 4);
    }

    // actions override upper body
    if (this.action !== 'none') {
      this.actionT += dt;
      const at = this.actionT;
      const f = Math.min(1, at * 5) * Math.min(1, Math.max(0, (this.actionDur - at) * 4));
      const mix = (a: number, b: number) => a + (b - a) * f;
      switch (this.action) {
        case 'wave':
          armRz = mix(armRz, 2.6);
          armRx = mix(armRx, -0.2);
          foreR = mix(foreR, -0.4 + Math.sin(at * 12) * 0.5);
          headZ = mix(0, -0.12);
          break;
        case 'cheer':
        case 'celebrate': {
          armRz = mix(armRz, 2.7 + Math.sin(at * 10) * 0.2);
          armLz = mix(armLz, -2.7 - Math.sin(at * 10) * 0.2);
          foreL = mix(foreL, -0.2);
          foreR = mix(foreR, -0.2);
          headX = mix(headX, -0.25);
          if (this.action === 'celebrate' && this.grounded) {
            const hop = Math.abs(Math.sin(at * 7));
            hipsY += hop * 0.22 * f;
            shinL += hop * 0.5 * f;
            shinR += hop * 0.5 * f;
          }
          break;
        }
        case 'interact':
          armRx = mix(armRx, -1.3);
          armLx = mix(armLx, -1.0);
          foreR = mix(foreR, -0.2);
          foreL = mix(foreL, -0.2);
          torsoX = mix(torsoX, 0.25);
          headX = mix(headX, 0.25);
          break;
        case 'carry':
          armRx = mix(armRx, -1.1);
          armLx = mix(armLx, -1.1);
          foreR = mix(foreR, -0.6);
          foreL = mix(foreL, -0.6);
          armRz = mix(armRz, -0.2);
          armLz = mix(armLz, 0.2);
          break;
        case 'talk':
          armRx = mix(armRx, -0.6 + Math.sin(at * 3.1) * 0.3);
          foreR = mix(foreR, -1.0 + Math.sin(at * 4.3) * 0.3);
          armRz = mix(armRz, 0.35);
          headX = mix(headX, Math.sin(at * 5.0) * 0.08);
          headZ = mix(headZ, Math.sin(at * 2.1) * 0.08);
          break;
        case 'think':
          armRx = mix(armRx, -1.2);
          foreR = mix(foreR, -2.0);
          armRz = mix(armRz, -0.2);
          headZ = mix(headZ, 0.18);
          headX = mix(headX, -0.1);
          break;
        case 'point':
          armRx = mix(armRx, -1.5);
          foreR = mix(foreR, 0);
          armRz = mix(armRz, 0.2);
          break;
      }
      if (at >= this.actionDur) this.action = 'none';
    }
    headY += this.lookYaw;
    headX += this.lookPitch;

    set(n.legL, legLx, 0, 0);
    set(n.legR, legRx, 0, 0);
    set(n.shinL, shinL, 0, 0);
    set(n.shinR, shinR, 0, 0);
    set(n.armL, armLx, 0, armLz);
    set(n.armR, armRx, 0, armRz);
    set(n.foreL, foreL * this.foreScale, 0, 0);
    set(n.foreR, foreR * this.foreScale, 0, 0);
    set(n.torso, torsoX, torsoY, torsoZ);
    set(n.head, headX, headY, headZ);
    n.hips.position.y += (hipsY - n.hips.position.y) * (1 - Math.exp(-20 * dt));
    n.torso.scaling.y = 1 + breathe * 0.012;
    // blinking
    this.blinkT -= dt;
    let eyeS = 1;
    if (this.blinkT < 0.12) eyeS = Math.max(0.1, Math.abs(this.blinkT - 0.06) / 0.06);
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    for (const e of n.eyes) e.scaling.y = eyeS;
  }
}

export function node(name: string, scene: Scene, parent: TransformNode | null, x = 0, y = 0, z = 0) {
  const t = new TransformNode(name, scene);
  if (parent) t.parent = parent;
  t.position.set(x, y, z);
  return t;
}

export { damp, Vector3 };
