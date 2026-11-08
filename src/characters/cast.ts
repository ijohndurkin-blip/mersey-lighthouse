import { Material, Matrix, Mesh, Scene, TransformNode, Vector3 } from '../babylon';
import { Batch, Shape, T, Col } from '../world/geo';
import { Mats } from '../world/materials';
import { RigNodes, node } from './rig';

type Build = (b: Batch) => void;

function part(scene: Scene, mats: Mats, name: string, parent: TransformNode, fn: Build, meshes: Mesh[], mat?: Material) {
  const b = new Batch();
  fn(b);
  const m = b.build(name, scene, mat ?? mats.char, parent);
  m.isPickable = false;
  meshes.push(m);
  return m;
}

function sparkle(scene: Scene, mats: Mats, parent: TransformNode, x: number, y: number, z: number, r: number, meshes: Mesh[]) {
  const b = new Batch();
  b.add(Shape.sphere(r, 6), T(x, y, z), '#ffffff');
  const m = b.build('sparkle', scene, mats.sparkle, parent);
  m.isPickable = false;
  meshes.push(m);
}

const arc = (cx: number, cy: number, cz: number, w: number, h: number, n = 8, curveZ = 0.03) => {
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI * (1 + t);
    pts.push(new Vector3(cx + Math.cos(a) * w * -1, cy + Math.sin(a) * h, cz - Math.abs(t - 0.5) * curveZ));
  }
  return pts;
};

interface FaceOpts {
  skin: Col;
  eyeSize?: number;
  eyeY?: number;
  eyeX?: number;
  headR: number;
  iris?: Col;
  brow?: Col;
  smile?: number;
  cheek?: Col;
  noseR?: number;
  nose?: Col;
}

function face(scene: Scene, mats: Mats, head: TransformNode, cy: number, o: FaceOpts, meshes: Mesh[], eyes: TransformNode[]) {
  const R = o.headR;
  const es = o.eyeSize ?? 1;
  const ey = cy + (o.eyeY ?? 0.02);
  const ex = o.eyeX ?? R * 0.36;
  for (const sx of [-1, 1]) {
    const zSurf = Math.sqrt(Math.max(0.01, R * R - ex * ex - (ey - cy) ** 2));
    const eyeN = node('eye', scene, head, sx * ex, ey, zSurf - 0.03 * es);
    eyes.push(eyeN);
    part(scene, mats, 'eyeW', eyeN, (b) => b.add(Shape.ellipsoid(0.13 * es, 0.16 * es, 0.07 * es, 12), T(0, 0, 0), '#ffffff'), meshes);
    part(scene, mats, 'iris', eyeN, (b) => {
      b.add(Shape.ellipsoid(0.085 * es, 0.1 * es, 0.04 * es, 10), T(0, -0.008 * es, 0.03 * es), o.iris ?? '#3a2a20');
      b.add(Shape.ellipsoid(0.05 * es, 0.06 * es, 0.03 * es, 8), T(0, -0.008 * es, 0.045 * es), '#120c0a');
    }, meshes);
    sparkle(scene, mats, eyeN, 0.022 * es * sx * -1 + 0.012, 0.025 * es, 0.06 * es, 0.03 * es, meshes);
  }
  part(scene, mats, 'faceDetail', head, (b) => {
    // brows
    for (const sx of [-1, 1]) {
      b.add(Shape.rbox(0.11 * es, 0.03, 0.03, 0.012, 1), T(sx * ex, ey + 0.115 * es, Math.sqrt(R * R - ex * ex) - 0.005, 0, 0, sx * -0.12), o.brow ?? '#4a3020');
    }
    // nose
    const nr = o.noseR ?? 0.065;
    b.add(Shape.sphere(nr * 2, 8), T(0, cy - 0.04, R - 0.01), o.nose ?? o.skin);
    // smile
    const sm = o.smile ?? 1;
    b.add(Shape.tube(arc(0, cy - 0.12, R - 0.035, 0.07 * sm, 0.045 * sm), 0.014, 5), Matrix.Identity(), '#8a3a32');
    // cheeks
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.09, 0.05, 0.03, 8), T(sx * R * 0.58, cy - 0.07, R * 0.78), o.cheek ?? '#ff9f9f');
  }, meshes);
}

export interface ExplorerLook {
  skin: string;
  hair: string;
  shirt: string;
}

// The Explorer is a friendly panda in a white explorer suit. `shirt` is the trim colour,
// `skin` the suit and `hair` the dark fur (ears, eye patches, paws).
export const EXPLORER_LOOKS: ExplorerLook[] = [
  { skin: '#fffdf8', hair: '#1c1c22', shirt: '#24448a' },
  { skin: '#fffdf8', hair: '#1c1c22', shirt: '#d6453f' },
  { skin: '#fffdf8', hair: '#1c1c22', shirt: '#2f9a5a' },
  { skin: '#fffdf8', hair: '#1c1c22', shirt: '#6a4fc0' },
];

export function buildExplorer(scene: Scene, mats: Mats, look: ExplorerLook): RigNodes {
  // Proportions measured from the reference art (total height ~1.7 units):
  // head ~41% of height, barrel tummy, short angled arms, short thick legs.
  const meshes: Mesh[] = [];
  const eyes: TransformNode[] = [];
  const white = '#f6f1e7';
  const fur = '#1b1b21';
  const trim = look.shirt;
  const toy = mats.toy;
  const P = (name: string, parent: TransformNode, fn: Build) => part(scene, mats, name, parent, fn, meshes, toy);
  const root = node('explorer', scene, null);
  const hips = node('hips', scene, root, 0, 0.36, 0);
  const torso = node('torso', scene, hips, 0, 0, 0);
  const DEPTH = 0.84;
  P('body', torso, (b) => {
    const prof: [number, number][] = [
      [0, -0.1], [0.2, -0.085], [0.3, -0.04], [0.36, 0.04], [0.39, 0.14], [0.392, 0.24], [0.378, 0.34], [0.352, 0.44],
      [0.322, 0.52], [0.275, 0.59], [0.2, 0.64], [0.11, 0.665], [0, 0.672],
    ];
    b.add(Shape.lathe(prof, 48), T(0, 0, 0, 0, 0, 0, 1, 1, DEPTH), white, { ao: 0.12 });
    // chest name plate
    b.add(Shape.rbox(0.25, 0.095, 0.04, 0.02, 2), T(0, 0.47, 0.283, -0.45, 0, 0), white, { mul: 1.03 });
    // pockets on the sides of the tummy (raised panels)
    for (const sx of [-1, 1]) {
      b.add(Shape.rbox(0.21, 0.205, 0.035, 0.022, 2), T(sx * 0.255, 0.22, 0.245, -0.05, sx * 0.78, sx * -0.07), white, { mul: 1.02 });
    }
    // navy collar and vest straps over the shoulders
    b.add(Shape.torus(0.37, 0.075, 32), T(0, 0.635, 0.01, 0.1, 0, 0), trim);
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.17, 0.32, 0.44, 24), T(sx * 0.27, 0.53, 0, 0, 0, sx * -0.42), trim);
  });

  // ---------------- head: one smooth bell shape, widest at the cheeks
  const head = node('head', scene, torso, 0, 0.64, 0.02);
  const hc = 0.33;
  const HD = 0.84; // head depth scale
  const headProf: [number, number][] = [
    [0, -0.33], [0.16, -0.315], [0.27, -0.28], [0.355, -0.22], [0.405, -0.14], [0.418, -0.05], [0.408, 0.05], [0.38, 0.13],
    [0.33, 0.2], [0.26, 0.26], [0.17, 0.305], [0.08, 0.328], [0, 0.334],
  ];
  const headR = (y: number) => {
    for (let i = 0; i < headProf.length - 1; i++) {
      const [r0, y0] = headProf[i];
      const [r1, y1] = headProf[i + 1];
      if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  // z of the face surface at (x, y) relative to the head centre
  const faceZ = (x: number, y: number) => HD * Math.sqrt(Math.max(0, headR(y) ** 2 - x * x));
  P('head', head, (b) => {
    b.add(Shape.lathe(headProf, 56), T(0, hc, 0, 0, 0, 0, 1, 1, HD), white);
    // gentle muzzle bulge around the mouth
    b.add(Shape.ellipsoid(0.44, 0.24, 0.14, 32), T(0, hc - 0.1, faceZ(0, -0.1) - 0.065), white);
    // ears
    for (const sx of [-1, 1]) {
      b.add(Shape.ellipsoid(0.25, 0.25, 0.13, 24), T(sx * 0.33, hc + 0.215, -0.04, 0, sx * 0.3, 0), fur);
      b.add(Shape.ellipsoid(0.15, 0.15, 0.04, 16), T(sx * 0.33, hc + 0.215, 0.015, 0, sx * 0.3, 0), '#303038');
    }
    // eye patches: big tilted beans, tops leaning toward the nose
    for (const sx of [-1, 1]) {
      const x = sx * 0.2;
      const y = 0.03;
      const yaw = Math.atan2(x, faceZ(x, y) / HD);
      b.add(Shape.ellipsoid(0.25, 0.3, 0.09, 28), T(x, hc + y, faceZ(x, y) - 0.025, 0, yaw * 0.9, sx * 0.38), fur);
    }
    // thick arched brows
    for (const sx of [-1, 1]) {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = sx * (0.075 + t * 0.17);
        const y = 0.215 + Math.sin(t * Math.PI) * 0.03 - t * 0.02;
        pts.push(new Vector3(x, hc + y, faceZ(x, y) + 0.012));
      }
      b.add(Shape.tube(pts, (i) => 0.024 + Math.sin((i / 10) * Math.PI) * 0.016, 8), Matrix.Identity(), fur);
    }
    // nose: rounded, wider at the top
    const nz = faceZ(0, -0.02);
    b.add(Shape.ellipsoid(0.155, 0.1, 0.1, 24), T(0, hc - 0.005, nz + 0.012, -0.1, 0, 0), fur);
    b.add(Shape.ellipsoid(0.1, 0.05, 0.08, 16), T(0, hc - 0.04, nz + 0.0), fur);
    // philtrum line down to the mouth
    b.add(Shape.cyl(0.05, 0.012, 0.012, 6), T(0, hc - 0.075, faceZ(0, -0.075) + 0.025, 0.3, 0, 0), fur);
    // big open D-shaped grin: flat top with raised corners, round bottom, tongue
    const mouth: [number, number][] = [];
    const MW = 0.155;
    for (let i = 0; i <= 12; i++) {
      const x = -MW + (i / 12) * MW * 2;
      mouth.push([x, 0.012 + Math.pow(Math.abs(x) / MW, 3) * 0.03]);
    }
    for (let i = 1; i < 20; i++) {
      const a = (i / 20) * Math.PI;
      mouth.push([Math.cos(a) * MW * 0.98, -Math.sin(a) * 0.15]);
    }
    const my = -0.115;
    const mz = faceZ(0, my - 0.06);
    b.add(Shape.prism(mouth, 0.05), T(0, hc + my, mz - 0.005, -0.32, 0, 0), '#6a1824', { top: '#3c0c14' });
    const tongue: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI;
      tongue.push([Math.cos(a) * 0.085, -0.045 - Math.sin(a) * 0.05 + (i === 0 || i === 14 ? 0.03 : 0)]);
    }
    b.add(Shape.prism(tongue, 0.05), T(0, hc + my - 0.05, mz + 0.05, -0.32, 0, 0), '#ef8494');
  });
  for (const sx of [-1, 1]) {
    const x = sx * 0.148;
    const y = 0.05;
    const eyeN = node('eye', scene, head, x, hc + y, faceZ(x, y) + 0.005);
    eyeN.rotation.y = Math.atan2(x, faceZ(x, y) / HD) * 0.8;
    eyes.push(eyeN);
    P('eyeW', eyeN, (b) => {
      b.add(Shape.ellipsoid(0.13, 0.14, 0.05, 24), T(0, 0, 0), '#ffffff');
      b.add(Shape.ellipsoid(0.095, 0.1, 0.03, 20), T(sx * -0.006, -0.006, 0.022), '#6b3a1a', { top: '#2e160a' });
      b.add(Shape.ellipsoid(0.052, 0.056, 0.02, 14), T(sx * -0.006, -0.006, 0.034), '#0c0806');
    });
    sparkle(scene, mats, eyeN, 0.018, 0.022, 0.044, 0.03, meshes);
    sparkle(scene, mats, eyeN, -0.014, -0.022, 0.043, 0.012, meshes);
  }
  sparkle(scene, mats, head, -0.03, hc + 0.015, faceZ(0, 0) + 0.06, 0.028, meshes);

  // ---------------- arms: one smooth piece from shoulder to cuff, angled out
  const ARM_TILT = 0.46;
  const armProf: [number, number][] = [
    [0, 0.06], [0.06, 0.05], [0.087, 0.02], [0.088, -0.06], [0.083, -0.16], [0.078, -0.26], [0.074, -0.31], [0.06, -0.335], [0, -0.34],
  ];
  const arm = (sx: number) => {
    const sh = node('arm', scene, torso, sx * 0.345, 0.52, 0.02);
    P('upper', sh, (b) => b.add(Shape.lathe(armProf, 24), T(0, 0, 0, 0, 0, sx * ARM_TILT), white));
    const wx = sx * Math.sin(ARM_TILT) * 0.3;
    const wy = -Math.cos(ARM_TILT) * 0.3;
    const fore = node('fore', scene, sh, wx, wy, 0);
    P('fore', fore, (b) => {
      const R = T(0, 0, 0, 0, 0, sx * ARM_TILT);
      b.add(Shape.torus(0.17, 0.052, 28), T(0, 0, 0).multiply(R), trim);
      // black mitten with curled fingers and a thumb
      b.add(Shape.ellipsoid(0.165, 0.2, 0.15, 24), T(0, -0.115, 0.005).multiply(R), fur);
      b.add(Shape.ellipsoid(0.15, 0.08, 0.13, 16), T(0, -0.19, 0.025).multiply(R), fur);
      b.add(Shape.ellipsoid(0.07, 0.1, 0.07, 14), T(sx * -0.065, -0.08, 0.06, 0, 0, sx * 0.5).multiply(R), fur);
    });
    return { sh, fore };
  };
  const L = arm(-1);
  const R = arm(1);

  // ---------------- legs: the navy rings hide the knee joint
  const leg = (sx: number) => {
    const th = node('leg', scene, hips, sx * 0.19, -0.03, 0);
    P('thigh', th, (b) => b.add(Shape.lathe([[0, 0.14], [0.11, 0.13], [0.128, 0.08], [0.128, -0.06], [0.124, -0.13], [0.0, -0.135]], 32), T(0, 0, 0), white));
    const sh = node('shin', scene, th, 0, -0.13, 0);
    P('shin', sh, (b) => {
      b.add(Shape.torus(0.29, 0.085, 36), T(0, 0.005, 0), trim);
      b.add(Shape.cyl(0.14, 0.24, 0.25, 32), T(0, -0.04, 0), white);
      // bulbous rounded boot
      b.add(Shape.rbox(0.29, 0.17, 0.37, 0.085, 4), T(0, -0.115, 0.04), white, { ao: 0.18 });
    });
    return { th, sh };
  };
  const LL = leg(-1);
  const RL = leg(1);
  return { root, hips, torso, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.th, legR: RL.th, shinL: LL.sh, shinR: RL.sh, eyes, meshes };
}

// -----------------------------------------------------------------------------
export function buildFinn(scene: Scene, mats: Mats): RigNodes {
  const meshes: Mesh[] = [];
  const eyes: TransformNode[] = [];
  const skin = '#f2c6a4';
  const coat = '#24406e';
  const root = node('finn', scene, null);
  const hips = node('hips', scene, root, 0, 0.82, 0);
  const torso = node('torso', scene, hips, 0, 0, 0);
  part(scene, mats, 'body', torso, (b) => {
    b.add(Shape.ellipsoid(0.86, 0.95, 0.72, 18), T(0, 0.38, 0.02), coat, { ao: 0.2 });
    b.add(Shape.lathe([[0.42, 0], [0.46, -0.2], [0.44, -0.3]], 18, false, false), T(0, 0.02, 0.0), coat);
    b.add(Shape.rbox(0.82, 0.08, 0.7, 0.04, 1), T(0, 0.12, 0.02), '#3a2a1e');
    b.add(Shape.rbox(0.12, 0.1, 0.05, 0.02, 1), T(0, 0.12, 0.37), '#f2c14e');
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.add(Shape.sphere(0.07, 8), T(sx * 0.12, 0.28 + i * 0.15, 0.36 - i * 0.015), '#f2c14e');
    // lapels + white collar
    b.add(Shape.torus(0.5, 0.06, 16), T(0, 0.78, 0), '#f4f0e6');
    for (const sx of [-1, 1]) b.add(Shape.rbox(0.18, 0.3, 0.04, 0.03, 1), T(sx * 0.15, 0.62, 0.31, -0.2, 0, sx * -0.3), '#1b3156');
    // epaulettes
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.24, 0.07, 0.2, 10), T(sx * 0.38, 0.78, 0), '#f2c14e');
    // legs/trousers top
    b.add(Shape.rbox(0.6, 0.2, 0.42, 0.1, 1), T(0, -0.05, 0), '#1b2f52');
  }, meshes);
  const head = node('head', scene, torso, 0, 0.84, 0.03);
  const hc = 0.32;
  part(scene, mats, 'head', head, (b) => {
    b.add(Shape.sphere(0.62, 20), T(0, hc, 0, 0, 0, 0, 1, 1, 0.95), skin);
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.1, 0.14, 0.07, 8), T(sx * 0.3, hc, -0.02), skin);
    // beard
    b.add(Shape.ellipsoid(0.62, 0.48, 0.42, 16), T(0, hc - 0.2, 0.1), '#d8d2c8', { ao: 0.25 });
    for (let i = 0; i < 7; i++) {
      const a = -1.1 + i * 0.37;
      b.add(Shape.sphere(0.2, 8), T(Math.sin(a) * 0.27, hc - 0.32 + Math.cos(a * 1.2) * 0.04, 0.12 + Math.cos(a) * 0.12), '#e4dfd6');
    }
    // moustache
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.22, 0.09, 0.1, 10), T(sx * 0.09, hc - 0.07, 0.27, 0, 0, sx * 0.25), '#f0ece4');
    // captain's cap
    b.add(Shape.cyl(0.2, 0.66, 0.6, 20), T(0, hc + 0.3, -0.02), '#ffffff', { ao: 0.2 });
    b.add(Shape.cyl(0.08, 0.6, 0.6, 20), T(0, hc + 0.22, -0.02), '#1b2440');
    b.add(Shape.ellipsoid(0.5, 0.05, 0.3, 14), T(0, hc + 0.2, 0.24, 0.25, 0, 0), '#1b2440');
    b.add(Shape.rbox(0.12, 0.1, 0.03, 0.02, 1), T(0, hc + 0.27, 0.3), '#f2c14e');
    b.add(Shape.cyl(0.04, 0.5, 0.5, 18, false), T(0, hc + 0.38, -0.02), '#e8e2d5');
  }, meshes);
  face(scene, mats, head, hc, { skin, headR: 0.3, eyeSize: 0.85, eyeX: 0.11, eyeY: 0.05, brow: '#e0dbd2', noseR: 0.08, nose: '#f0a090', smile: 0.6, iris: '#2a4a7a' }, meshes, eyes);
  const arm = (sx: number) => {
    const sh = node('arm', scene, torso, sx * 0.44, 0.68, 0);
    part(scene, mats, 'upper', sh, (b) => {
      b.add(Shape.sphere(0.28, 10), T(0, 0, 0), coat);
      b.add(Shape.capsule(0.34, 0.11, 10), T(0, -0.15, 0), coat);
    }, meshes);
    const fore = node('fore', scene, sh, 0, -0.3, 0);
    part(scene, mats, 'fore', fore, (b) => {
      b.add(Shape.capsule(0.3, 0.1, 10), T(0, -0.1, 0), coat);
      b.add(Shape.cyl(0.06, 0.22, 0.22, 10), T(0, -0.22, 0), '#f2c14e');
      b.add(Shape.sphere(0.2, 10), T(0, -0.32, 0.01), skin);
    }, meshes);
    return { sh, fore };
  };
  const L = arm(-1);
  const R = arm(1);
  const leg = (sx: number) => {
    const th = node('leg', scene, hips, sx * 0.16, -0.08, 0);
    part(scene, mats, 'thigh', th, (b) => b.add(Shape.capsule(0.4, 0.12, 10), T(0, -0.16, 0), '#1b2f52'), meshes);
    const sh = node('shin', scene, th, 0, -0.34, 0);
    part(scene, mats, 'shin', sh, (b) => {
      b.add(Shape.capsule(0.32, 0.11, 10), T(0, -0.12, 0), '#1b2f52');
      b.add(Shape.rbox(0.24, 0.24, 0.38, 0.09, 2), T(0, -0.32, 0.05), '#22201e', { ao: 0.2 });
    }, meshes);
    return { th, sh };
  };
  const LL = leg(-1);
  const RL = leg(1);
  return { root, hips, torso, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.th, legR: RL.th, shinL: LL.sh, shinR: RL.sh, eyes, meshes };
}

// -----------------------------------------------------------------------------
export function buildProfessor(scene: Scene, mats: Mats): RigNodes {
  const meshes: Mesh[] = [];
  const eyes: TransformNode[] = [];
  const skin = '#f0c8a8';
  const coat = '#f6f4ee';
  const root = node('prof', scene, null);
  const hips = node('hips', scene, root, 0, 0.95, 0);
  const torso = node('torso', scene, hips, 0, 0, 0);
  part(scene, mats, 'body', torso, (b) => {
    // lab coat
    b.add(Shape.lathe([[0.36, -0.55], [0.33, -0.2], [0.3, 0.2], [0.27, 0.55], [0.24, 0.68], [0.12, 0.74]], 18, false, false), T(0, 0, 0), coat, { ao: 0.2 });
    // waistcoat & shirt front
    b.add(Shape.rbox(0.32, 0.5, 0.1, 0.05, 1), T(0, 0.38, 0.24), '#3f8f5a');
    b.add(Shape.rbox(0.12, 0.2, 0.05, 0.02, 1), T(0, 0.58, 0.27), '#ffffff');
    for (let i = 0; i < 3; i++) b.add(Shape.sphere(0.04, 6), T(0, 0.2 + i * 0.1, 0.3), '#f2c14e');
    // bow tie
    for (const sx of [-1, 1]) b.add(Shape.cone(0.14, 0.12, 6), T(sx * 0.07, 0.66, 0.27, 0, 0, sx * Math.PI / 2), '#e2453f');
    b.add(Shape.sphere(0.06, 6), T(0, 0.66, 0.29), '#c0302a');
    // coat pockets + pens
    b.add(Shape.rbox(0.14, 0.12, 0.03, 0.02, 1), T(-0.2, 0.4, 0.27), coat, { mul: 0.92 });
    b.add(Shape.cyl(0.14, 0.02, 0.02, 4), T(-0.23, 0.48, 0.28), '#3f7fb0');
    b.add(Shape.cyl(0.14, 0.02, 0.02, 4), T(-0.18, 0.48, 0.28), '#e2453f');
  }, meshes);
  const head = node('head', scene, torso, 0, 0.74, 0.02);
  const hc = 0.3;
  part(scene, mats, 'head', head, (b) => {
    b.add(Shape.sphere(0.54, 20), T(0, hc, 0, 0, 0, 0, 1, 1.12, 1), skin);
    b.add(Shape.cyl(0.14, 0.14, 0.16, 10), T(0, 0.02, 0), skin);
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.09, 0.14, 0.07, 8), T(sx * 0.27, hc, 0), skin);
    // wild white hair
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * 0.55 + (i / 10) * Math.PI * 0.9;
      const r = 0.27;
      b.add(Shape.sphere(0.2 + (i % 3) * 0.05, 8), T(Math.cos(a) * r * 1.15, hc + 0.12 + Math.sin(i * 1.7) * 0.06, Math.sin(a) * r * -0.9 - 0.04), '#f4f4f6');
    }
    for (const sx of [-1, 1]) b.add(Shape.sphere(0.24, 8), T(sx * 0.3, hc + 0.18, -0.05), '#ffffff');
    // goggles on the forehead
    b.add(Shape.torus(0.56, 0.035, 20), T(0, hc + 0.2, 0, 0.25, 0, 0), '#6b4a30');
    for (const sx of [-1, 1]) {
      b.add(Shape.cyl(0.08, 0.17, 0.17, 12), T(sx * 0.09, hc + 0.25, 0.23, Math.PI / 2 - 0.4, 0, 0), '#d9a441');
      b.add(Shape.cyl(0.09, 0.12, 0.12, 12), T(sx * 0.09, hc + 0.26, 0.25, Math.PI / 2 - 0.4, 0, 0), '#3f8fa8');
    }
    // round glasses
    for (const sx of [-1, 1]) b.add(Shape.torus(0.17, 0.018, 16), T(sx * 0.1, hc + 0.0, 0.27, Math.PI / 2, 0, 0), '#3a3f48');
    b.add(Shape.cyl(0.06, 0.016, 0.016, 4), T(0, hc + 0.01, 0.285, 0, 0, Math.PI / 2), '#3a3f48');
    // big moustache
    for (const sx of [-1, 1]) {
      b.add(Shape.ellipsoid(0.2, 0.08, 0.09, 10), T(sx * 0.09, hc - 0.12, 0.25, 0, 0, sx * 0.3), '#ffffff');
      b.add(Shape.sphere(0.07, 6), T(sx * 0.19, hc - 0.09, 0.22), '#ffffff');
    }
  }, meshes);
  face(scene, mats, head, hc, { skin, headR: 0.27, eyeSize: 0.75, eyeX: 0.1, eyeY: 0.0, brow: '#ffffff', iris: '#3a6a3a', smile: 0.55, noseR: 0.06 }, meshes, eyes);
  const arm = (sx: number, wrench: boolean) => {
    const sh = node('arm', scene, torso, sx * 0.3, 0.62, 0);
    part(scene, mats, 'upper', sh, (b) => {
      b.add(Shape.sphere(0.2, 10), T(0, 0, 0), coat);
      b.add(Shape.capsule(0.34, 0.075, 10), T(0, -0.15, 0), coat);
    }, meshes);
    const fore = node('fore', scene, sh, 0, -0.3, 0);
    part(scene, mats, 'fore', fore, (b) => {
      b.add(Shape.capsule(0.3, 0.07, 10), T(0, -0.1, 0), coat);
      b.add(Shape.sphere(0.15, 10), T(0, -0.28, 0.01), skin);
      if (wrench) {
        b.add(Shape.rbox(0.06, 0.55, 0.04, 0.02, 1), T(0, -0.3, 0.12, Math.PI / 2, 0, 0), '#9aa3ad');
        b.add(Shape.torus(0.16, 0.05, 10), T(0, -0.3, 0.42, 0, 0, 0), '#9aa3ad');
      }
    }, meshes);
    return { sh, fore };
  };
  const L = arm(-1, false);
  const R = arm(1, true);
  const leg = (sx: number) => {
    const th = node('leg', scene, hips, sx * 0.12, -0.05, 0);
    part(scene, mats, 'thigh', th, (b) => b.add(Shape.capsule(0.46, 0.07, 10), T(0, -0.2, 0), '#7a5a3a'), meshes);
    const sh = node('shin', scene, th, 0, -0.42, 0);
    part(scene, mats, 'shin', sh, (b) => {
      b.add(Shape.capsule(0.42, 0.065, 10), T(0, -0.17, 0), '#7a5a3a');
      b.add(Shape.rbox(0.17, 0.12, 0.34, 0.06, 2), T(0, -0.42, 0.07), '#5a3a22', { ao: 0.2 });
    }, meshes);
    return { th, sh };
  };
  const LL = leg(-1);
  const RL = leg(1);
  return { root, hips, torso, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.th, legR: RL.th, shinL: LL.sh, shinR: RL.sh, eyes, meshes };
}

// -----------------------------------------------------------------------------
export interface PipNodes {
  root: TransformNode;
  body: TransformNode;
  head: TransformNode;
  wingL: TransformNode;
  wingR: TransformNode;
  footL: TransformNode;
  footR: TransformNode;
  eyes: TransformNode[];
  meshes: Mesh[];
}

export function buildPip(scene: Scene, mats: Mats): PipNodes {
  const meshes: Mesh[] = [];
  const eyes: TransformNode[] = [];
  const root = node('pip', scene, null);
  const body = node('pipBody', scene, root, 0, 0, 0);
  part(scene, mats, 'pipTorso', body, (b) => {
    b.add(Shape.ellipsoid(0.42, 0.5, 0.4, 16), T(0, 0.34, 0), '#22252e', { ao: 0.15 });
    b.add(Shape.ellipsoid(0.34, 0.4, 0.26, 14), T(0, 0.3, 0.1), '#ffffff');
    b.add(Shape.cone(0.2, 0.2, 8), T(0, 0.17, -0.22, -2.0, 0, 0), '#22252e');
  }, meshes);
  const head = node('pipHead', scene, body, 0, 0.62, 0.03);
  part(scene, mats, 'pipHeadM', head, (b) => {
    b.add(Shape.sphere(0.36, 16), T(0, 0.06, 0), '#22252e');
    for (const sx of [-1, 1]) b.add(Shape.ellipsoid(0.17, 0.19, 0.14, 12), T(sx * 0.085, 0.04, 0.1), '#f6f4f0');
    // beak (layered for the classic stripes)
    const bk = (len: number, h: number, w: number, c: string, z0: number) =>
      b.add(Shape.prism([[0, -h / 2], [len, -h * 0.15], [len * 0.92, h * 0.12], [0, h / 2]], w), T(0, 0.0, z0, 0, -Math.PI / 2, 0), c);
    bk(0.07, 0.17, 0.085, '#5e7a96', 0.13);
    bk(0.13, 0.15, 0.07, '#ff7a2a', 0.18);
    bk(0.08, 0.08, 0.05, '#e8453a', 0.3);
    b.add(Shape.box(0.088, 0.15, 0.012), T(0, -0.005, 0.195), '#ffd23f');
    // sou'wester hat
    b.add(Shape.lathe([[0.27, 0], [0.24, 0.02], [0.17, 0.05], [0.16, 0.13], [0.1, 0.17], [0, 0.18]], 18), T(0, 0.2, -0.02, -0.25, 0, 0), '#ffd23f', { ao: 0.2 });
  }, meshes);
  for (const sx of [-1, 1]) {
    const eye = node('pipEye', scene, head, sx * 0.085, 0.09, 0.16);
    eyes.push(eye);
    part(scene, mats, 'pipEyeW', eye, (b) => {
      b.add(Shape.ellipsoid(0.09, 0.1, 0.05, 10), T(0, 0, 0), '#ffffff');
      b.add(Shape.ellipsoid(0.055, 0.065, 0.03, 8), T(sx * -0.005, -0.005, 0.022), '#141418');
    }, meshes);
    sparkle(scene, mats, eye, 0.012, 0.018, 0.04, 0.022, meshes);
    part(scene, mats, 'pipMark', head, (b) => b.add(Shape.ellipsoid(0.05, 0.02, 0.02, 6), T(sx * 0.1, 0.16, 0.15, 0, 0, sx * 0.35), '#22252e'), meshes);
  }
  const wing = (sx: number) => {
    const w = node('pipWing', scene, body, sx * 0.2, 0.46, -0.01);
    part(scene, mats, 'pipWingM', w, (b) => b.add(Shape.ellipsoid(0.07, 0.36, 0.24, 10), T(sx * 0.03, -0.14, 0, 0, 0, sx * 0.15), '#2a2e38'), meshes);
    return w;
  };
  const wingL = wing(-1);
  const wingR = wing(1);
  const foot = (sx: number) => {
    const f = node('pipFoot', scene, root, sx * 0.1, 0.0, 0.0);
    part(scene, mats, 'pipFootM', f, (b) => {
      b.add(Shape.cyl(0.1, 0.04, 0.04, 6), T(0, 0.06, 0), '#ff7a2a');
      b.add(Shape.ellipsoid(0.14, 0.04, 0.17, 8), T(0, 0.015, 0.05), '#ff7a2a');
    }, meshes);
    return f;
  };
  const footL = foot(-1);
  const footR = foot(1);
  return { root, body, head, wingL, wingR, footL, footR, eyes, meshes };
}
