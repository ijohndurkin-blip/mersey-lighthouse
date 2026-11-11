/**
 * The hero panda, sculpted from smooth blended volumes to match the reference art:
 * bell-shaped head with jowls and a protruding muzzle, open grin with lips, teeth and tongue,
 * embossed eye patches and brows, cupped ears, pear-shaped suit with embossed chest plate,
 * pockets and vest straps, one-piece arms with cuffs and mittens, ringed legs and round boots.
 */
import { Color3, DirectionalLight, Mesh, Scene, TransformNode, Vector3, VertexData } from '../babylon';
import { Batch, Shape, T } from '../world/geo';
import { Mats } from '../world/materials';
import { RigNodes, node } from './rig';
import {
  SDF,
  Surf,
  bakeAO,
  blend,
  band,
  blend2,
  carve,
  circle2,
  clip,
  cone,
  ell,
  emboss,
  gradient,
  inflate,
  mirrorX,
  move,
  plane,
  polygonize,
  prism,
  rbox2,
  spinZ,
  stroke2,
  surfaceAlong,
  torus,
  union,
} from './sdf';

type Tone = 'white' | 'fur' | 'earIn' | 'trim' | 'mouth' | 'tongue' | 'teeth' | 'line';
interface Piece {
  surf: Surf;
  ao: Float32Array;
  tone: Tone;
}
interface EyeSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}
interface PandaGeo {
  head: Piece[];
  body: Piece[];
  armL: Piece[];
  armR: Piece[];
  handL: Piece[];
  handR: Piece[];
  thigh: Piece[];
  footL: Piece[];
  footR: Piece[];
  eyes: EyeSpot[];
}

// rig layout (metres; the whole panda is ~1.6 tall)
const HIP_Y = 0.34;
const NECK_Y = 0.6; // in torso space
const SHOULDER = { x: 0.335, y: 0.548 };
const ARM_TILT = 0.19;
const ARM_LEN = 0.292;
const LEG_X = 0.18;
const KNEE_Y = -0.124;

const cache = new Map<number, PandaGeo>();

function sculpt(detail: number): PandaGeo {
  const c = (v: number) => v * detail;
  const piece = (sdf: SDF, cell: number, tone: Tone, aoField: SDF, aoStrength = 1): Piece => {
    const surf = polygonize(sdf, c(cell));
    return { surf, ao: bakeAO(surf, aoField, aoStrength), tone };
  };

  // =========================================================================== HEAD
  // (origin at the neck pivot, y up, z toward the face)
  const cran = ell(0, 0.385, 0, 0.312, 0.262, 0.29);
  const jowl = ell(0, 0.212, 0.005, 0.362, 0.22, 0.305);
  const skull = blend(0.15, cran, jowl);
  const muzzle = ell(0, 0.165, 0.228, 0.2, 0.158, 0.14);
  const face = blend(0.08, skull, muzzle);
  const cavity = ell(0, 0.185, 0.375, 0.152, 0.118, 0.1);
  // puffy upper lip: two lobes hanging under the nose
  const lipLobes = mirrorX(ell(0.048, 0.238, 0.325, 0.09, 0.062, 0.052));
  // smiling cheeks at the corners of the mouth
  const cheeks = mirrorX(ell(0.168, 0.215, 0.27, 0.06, 0.065, 0.06));
  // thick lower lip following the bottom of the mouth
  const lipPts: [number, number][] = [
    [0.158, 0.232],
    [0.153, 0.17],
    [0.125, 0.11],
    [0.07, 0.07],
    [0, 0.056],
  ];
  const lipZ = (x: number, y: number) => surfaceAlong(face, x, y, 0, 0, 0, 1) - 0.01;
  const lipCones: SDF[] = [];
  for (let i = 0; i < lipPts.length - 1; i++) {
    const [ax, ay] = lipPts[i];
    const [bx, by] = lipPts[i + 1];
    const r1 = 0.014 + (i / (lipPts.length - 1)) * 0.01;
    const r2 = 0.014 + ((i + 1) / (lipPts.length - 1)) * 0.01;
    lipCones.push(cone(ax, ay, lipZ(ax, ay), bx, by, lipZ(bx, by), r1, r2));
  }
  const lowerLip = mirrorX(union(...lipCones));
  const headWhite = blend(0.03, carve(blend(0.04, face, cheeks), cavity, 0.012), lipLobes, lowerLip);

  // mouth interior (recessed dark floor), tongue and teeth
  const mouthIn = clip(inflate(face, -0.04), inflate(cavity, 0.004), 0.004);
  const tongueZ = surfaceAlong(face, 0, 0.1, 0, 0, 0, 1) - 0.062;
  const tongue = carve(
    clip(ell(0, 0.098, tongueZ, 0.098, 0.046, 0.042), inflate(cavity, -0.003), 0.008),
    cone(0, 0.14, tongueZ + 0.045, 0, 0.07, tongueZ + 0.043, 0.005, 0.004),
    0.004,
  );
  const teethZ = surfaceAlong(face, 0, 0.17, 0, 0, 0, 1) - 0.046;
  const teeth = clip(ell(0, 0.186, teethZ, 0.085, 0.02, 0.02), inflate(cavity, -0.002), 0.004);

  // nose: a wide rounded bean
  const noseZ = surfaceAlong(headWhite, 0, 0.318, 0, 0, 0, 1);
  const nose = blend(0.03, ell(0, 0.332, noseZ - 0.016, 0.076, 0.046, 0.056), ell(0, 0.305, noseZ - 0.006, 0.06, 0.042, 0.052));
  // philtrum line from the nose down to the lip
  const philtrum = emboss(headWhite, 0.0022, prism(stroke2([[0, 0.272, 0.0034], [0, 0.2, 0.003]]), 0, 0.1), 0.002, 0.006);

  // embossed eye patches and brows
  const patchShape = blend2(0.06, circle2(0.128, 0.4, 0.092), circle2(0.215, 0.3, 0.088));
  const patches = mirrorX(emboss(face, 0.005, prism(patchShape, 0, 0.02), 0.006));
  const browShape = stroke2([
    [0.056, 0.52, 0.01],
    [0.088, 0.542, 0.024],
    [0.124, 0.549, 0.028],
    [0.164, 0.534, 0.023],
    [0.204, 0.504, 0.009],
  ]);
  const brows = mirrorX(emboss(face, 0.011, prism(browShape, 0, 0.02), 0.005));

  // cupped ears
  const earOuter = ell(0.3, 0.565, -0.02, 0.11, 0.11, 0.058, 0, 0.3, 0);
  const earDish = ell(0.308, 0.57, 0.052, 0.082, 0.082, 0.046, 0, 0.3, 0);
  const ears = mirrorX(carve(earOuter, earDish, 0.025));
  const earInner = mirrorX(clip(inflate(earOuter, -0.012), inflate(earDish, 0.006), 0.006));

  // neighbours used only for soft shading
  const chestProxy = move(ell(0, 0.44, 0, 0.3, 0.25, 0.25), 0, -NECK_Y, 0);
  const headAO = union(headWhite, patches, brows, nose, ears, chestProxy);
  const mouthAO = union(headWhite, tongue, teeth);
  const head: Piece[] = [
    piece(headWhite, 0.0105, 'white', headAO),
    piece(patches, 0.008, 'fur', headAO, 0.6),
    piece(brows, 0.006, 'fur', headAO, 0.4),
    piece(nose, 0.0065, 'fur', headAO, 0.4),
    piece(philtrum, 0.003, 'line', headAO, 0),
    piece(ears, 0.01, 'fur', headAO, 0.7),
    piece(earInner, 0.009, 'earIn', headAO, 0.8),
    piece(mouthIn, 0.008, 'mouth', mouthAO, 1.2),
    piece(tongue, 0.006, 'tongue', mouthAO, 0.9),
    piece(teeth, 0.006, 'teeth', mouthAO, 0.8),
  ];
  // eye placement on the patches
  const eyes: EyeSpot[] = [];
  for (const sx of [-1, 1]) {
    const ex = sx * 0.123;
    const ey = 0.372;
    const ez = surfaceAlong(patches, ex, ey, 0, 0, 0, 1);
    const n = gradient(face, ex, ey, ez);
    eyes.push({ x: ex, y: ey, z: ez, yaw: Math.atan2(n[0], n[2]) * 0.85, pitch: -Math.asin(n[1]) * 0.85 });
  }

  // =========================================================================== BODY
  // (origin at the hips)
  const belly = ell(0, 0.215, 0.015, 0.345, 0.3, 0.31);
  const chest = ell(0, 0.44, 0, 0.3, 0.25, 0.25);
  // rounded shoulders so the arms grow out of the body instead of sticking onto it
  const shoulders = mirrorX(ell(0.262, 0.545, 0, 0.115, 0.105, 0.125));
  const body = blend(0.1, blend(0.16, belly, chest), shoulders);
  // vest armholes: navy panels around each shoulder
  const armhole = (x: number, y: number, z: number) => {
    const u = (x - 0.365) / 0.185;
    const v = (y - 0.58) / 0.2;
    const w = z / 0.26;
    return (Math.sqrt(u * u + v * v + w * w) - 1) * 0.2;
  };
  const straps = mirrorX(emboss(body, 0.012, armhole, 0.008));
  const collar = torus(0, 0.558, 0.03, 0.2, 0.042, 0.2, 0, 0, 0.92);
  const plate = emboss(body, 0.009, prism(rbox2(0, 0.476, 0.11, 0.046, 0.018), 0, 0.05), 0.006);
  const pocketPanel = emboss(body, 0.01, prism(rbox2(0, 0.238, 0.095, 0.11, 0.028), 0.74, 0.05, 0, 0, 0, -0.06), 0.006);
  const pocketHem = emboss(body, 0.015, prism(rbox2(0, 0.333, 0.097, 0.016, 0.008), 0.74, 0.05, 0, 0, 0, -0.06), 0.004);
  const pockets = mirrorX(union(pocketPanel, pocketHem));
  const headProxy = move(jowl, 0, NECK_Y, 0);
  const legProxy = mirrorX(cone(LEG_X, 0.04, 0, LEG_X, -0.14, 0, 0.128, 0.122));
  const armProxy = mirrorX(cone(SHOULDER.x, SHOULDER.y, 0, SHOULDER.x + Math.sin(ARM_TILT) * ARM_LEN, SHOULDER.y - Math.cos(ARM_TILT) * ARM_LEN, 0, 0.088, 0.08));
  const bodyAO = union(body, straps, collar, plate, pockets, headProxy, legProxy, armProxy);
  const bodyPieces: Piece[] = [
    piece(body, 0.016, 'white', bodyAO),
    piece(straps, 0.01, 'trim', bodyAO, 0.8),
    piece(collar, 0.01, 'trim', bodyAO, 0.8),
    piece(plate, 0.008, 'white', bodyAO, 0.9),
    piece(pockets, 0.008, 'white', bodyAO, 0.9),
  ];

  // =========================================================================== ARMS & HANDS
  const armFor = (sx: number): [Piece[], Piece[]] => {
    const dx = sx * Math.sin(ARM_TILT);
    const dy = -Math.cos(ARM_TILT);
    const arm = cone(0, 0, 0, dx * (ARM_LEN + 0.01), dy * (ARM_LEN + 0.01), 0, 0.096, 0.082);
    const armAO = union(arm, move(body, -sx * SHOULDER.x, -SHOULDER.y, 0));
    // hand modelled hanging straight down from the wrist, then tilted with the arm
    const fist = ell(0, -0.115, 0.004, 0.086, 0.098, 0.074);
    const thumb = ell(-sx * 0.07, -0.09, 0.036, 0.03, 0.052, 0.032, 0, 0, sx * 0.4);
    const fingers = blend(
      0.014,
      cone(-0.044 + sx * 0.012, -0.14, 0.03, -0.044 + sx * 0.012, -0.185, 0.02, 0.028, 0.025),
      cone(sx * 0.012, -0.145, 0.034, sx * 0.012, -0.192, 0.022, 0.029, 0.026),
      cone(0.044 + sx * 0.012, -0.14, 0.03, 0.044 + sx * 0.012, -0.185, 0.02, 0.028, 0.025),
    );
    const hand = spinZ(blend(0.024, fist, thumb, fingers), sx * ARM_TILT);
    const cuff = spinZ(band(0, -0.004, 0, 0.097, 0.034, 0.014), sx * ARM_TILT);
    const handAO = union(hand, cuff);
    return [
      [piece(arm, 0.012, 'white', armAO, 0.8)],
      [piece(cuff, 0.009, 'trim', handAO, 0.6), piece(hand, 0.0075, 'fur', handAO, 0.9)],
    ];
  };
  const [armL, handL] = armFor(-1);
  const [armR, handR] = armFor(1);

  // =========================================================================== LEGS & BOOTS
  const thighSdf = cone(0, 0.04, 0, 0, -0.14, 0, 0.128, 0.122);
  const thigh = [piece(thighSdf, 0.016, 'white', thighSdf, 0)];
  const footFor = (sx: number): Piece[] => {
    const ring = torus(0, 0, 0, 0.106, 0.046);
    const bootRaw = blend(0.05, ell(sx * 0.015, -0.112, 0.03, 0.154, 0.112, 0.19), ell(0, -0.04, 0, 0.12, 0.08, 0.12));
    const boot = clip(bootRaw, plane(0, -1, 0, 0.2155), 0.035);
    const ao = union(ring, boot, plane(0, 1, 0, -0.2155));
    return [piece(ring, 0.011, 'trim', ao, 0.6), piece(boot, 0.013, 'white', ao, 0.9)];
  };
  return { head, body: bodyPieces, armL, armR, handL, handR, thigh, footL: footFor(-1), footR: footFor(1), eyes };
}

function toMesh(name: string, scene: Scene, pieces: Piece[], palette: Record<Tone, Color3>, mats: Mats, parent: TransformNode, meshes: Mesh[]) {
  let nv = 0;
  let ni = 0;
  for (const p of pieces) {
    nv += p.surf.positions.length / 3;
    ni += p.surf.indices.length;
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const colors = new Float32Array(nv * 4);
  const indices = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  // shaded areas keep a little warm/cool tint instead of going grey-black
  const shade = [0.5, 0.47, 0.52];
  for (const p of pieces) {
    const col = palette[p.tone];
    const n = p.surf.positions.length / 3;
    positions.set(p.surf.positions, vo * 3);
    normals.set(p.surf.normals, vo * 3);
    for (let i = 0; i < n; i++) {
      const a = p.ao[i];
      colors[(vo + i) * 4] = col.r * (shade[0] + (1 - shade[0]) * a);
      colors[(vo + i) * 4 + 1] = col.g * (shade[1] + (1 - shade[1]) * a);
      colors[(vo + i) * 4 + 2] = col.b * (shade[2] + (1 - shade[2]) * a);
      colors[(vo + i) * 4 + 3] = 1;
    }
    for (let i = 0; i < p.surf.indices.length; i++) indices[io + i] = p.surf.indices[i] + vo;
    vo += n;
    io += p.surf.indices.length;
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.hasVertexAlpha = false;
  mesh.material = mats.toy;
  mesh.parent = parent;
  mesh.isPickable = false;
  meshes.push(mesh);
  return mesh;
}

export interface PandaNodes extends RigNodes {
  fill: DirectionalLight;
}

export function buildPanda(scene: Scene, mats: Mats, trim: string, detail = 1): PandaNodes {
  let geo = cache.get(detail);
  if (!geo) {
    geo = sculpt(detail);
    cache.set(detail, geo);
  }
  const palette: Record<Tone, Color3> = {
    white: Color3.FromHexString('#f3eee4'),
    fur: Color3.FromHexString('#17171c'),
    earIn: Color3.FromHexString('#2d2d34'),
    trim: Color3.FromHexString(trim),
    mouth: Color3.FromHexString('#6a1422'),
    tongue: Color3.FromHexString('#f08a98'),
    teeth: Color3.FromHexString('#fffdf6'),
    line: Color3.FromHexString('#8a8378'),
  };
  const meshes: Mesh[] = [];
  const eyes: TransformNode[] = [];
  const root = node('explorer', scene, null);
  const hips = node('hips', scene, root, 0, HIP_Y, 0);
  const torso = node('torso', scene, hips, 0, 0, 0);
  toMesh('pandaBody', scene, geo.body, palette, mats, torso, meshes);
  const head = node('head', scene, torso, 0, NECK_Y, 0);
  toMesh('pandaHead', scene, geo.head, palette, mats, head, meshes);

  // eyes: glossy white with a big brown iris, pupil and highlight
  geo.eyes.forEach((e, i) => {
    const sx = i === 0 ? -1 : 1;
    const eyeN = node('eye', scene, head, e.x, e.y, e.z);
    eyeN.rotation.set(e.pitch, e.yaw, 0);
    eyes.push(eyeN);
    const b = new Batch();
    b.add(Shape.ellipsoid(0.142, 0.148, 0.04, 32), T(0, 0, 0.0), '#ffffff');
    b.add(Shape.ellipsoid(0.098, 0.098, 0.03, 28), T(-sx * 0.007, -0.004, 0.012), '#7a4420', { top: '#3a1c0a' });
    b.add(Shape.ellipsoid(0.052, 0.052, 0.02, 20), T(-sx * 0.007, -0.004, 0.022), '#0d0907');
    const m = b.build('pandaEye', scene, mats.toy, eyeN);
    m.isPickable = false;
    meshes.push(m);
    const hb = new Batch();
    hb.add(Shape.sphere(0.024, 10), T(-sx * 0.007 - 0.016, 0.014, 0.029), '#ffffff');
    hb.add(Shape.sphere(0.009, 8), T(-sx * 0.007 + 0.014, -0.02, 0.029), '#ffffff');
    const hm = hb.build('pandaEyeGlint', scene, mats.sparkle, eyeN);
    hm.isPickable = false;
    meshes.push(hm);
  });

  const arm = (sx: number, armPieces: Piece[], handPieces: Piece[]) => {
    const sh = node('arm', scene, torso, sx * SHOULDER.x, SHOULDER.y, 0);
    toMesh('pandaArm', scene, armPieces, palette, mats, sh, meshes);
    const fore = node('fore', scene, sh, sx * Math.sin(ARM_TILT) * ARM_LEN, -Math.cos(ARM_TILT) * ARM_LEN, 0);
    toMesh('pandaHand', scene, handPieces, palette, mats, fore, meshes);
    return { sh, fore };
  };
  const L = arm(-1, geo.armL, geo.handL);
  const R = arm(1, geo.armR, geo.handR);
  const leg = (sx: number, foot: Piece[]) => {
    const th = node('leg', scene, hips, sx * LEG_X, 0, 0);
    toMesh('pandaThigh', scene, geo!.thigh, palette, mats, th, meshes);
    const sh = node('shin', scene, th, 0, KNEE_Y, 0);
    toMesh('pandaFoot', scene, foot, palette, mats, sh, meshes);
    return { th, sh };
  };
  const LL = leg(-1, geo.footL);
  const RL = leg(1, geo.footR);

  // a soft "studio" fill that always lights the hero from the camera side
  const fill = new DirectionalLight('heroFill', new Vector3(0, -0.3, 1), scene);
  fill.diffuse = new Color3(1, 0.97, 0.92);
  fill.specular = new Color3(1, 1, 1);
  fill.intensity = 0.45;
  fill.includedOnlyMeshes = meshes;
  root.onDisposeObservable.add(() => fill.dispose());
  return { root, hips, torso, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.th, legR: RL.th, shinL: LL.sh, shinR: RL.sh, eyes, meshes, fill };
}
