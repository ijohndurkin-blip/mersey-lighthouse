import {
  Color3,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  ShaderMaterial,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  Constants,
} from '@babylonjs/core';
import { Batch, Shape, T, col, Col, PaintOpts } from './geo';
import { WorldCtx } from './ctx';
import { BRIDGE, COTTAGE, LIGHTHOUSE, PANEL, TURBINE, WATERWHEEL, WINDSOCK, WORKSHOP } from './layout';
import { rng } from '../core/noise';
import { addLampPost } from './village';
import { toWorld } from './collision';

function putter(b: () => Batch, L: Matrix) {
  return (vd: VertexData, x: number, y: number, z: number, c: Col, o: PaintOpts = {}, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) => {
    b().add(vd, T(x, y, z, rx, ry, rz, s[0], s[1], s[2]).multiply(L), c, o);
  };
}

// =============================================================================
// Lighthouse
// =============================================================================
export interface LighthouseHandles {
  root: TransformNode;
  glass: Mesh;
  glassMat: StandardMaterial;
  lens: Mesh;
  beamPivot: TransformNode;
  beamMat: ShaderMaterial;
  light: PointLight;
  topY: number;
  doorPos: Vector3;
  baseY: number;
  windowsMat: StandardMaterial;
}

export function buildLighthouse(ctx: WorldCtx): LighthouseHandles {
  const { scene } = ctx;
  const x = LIGHTHOUSE.x;
  const z = LIGHTHOUSE.z;
  const y = ctx.terrain.sample(x, z) - 0.1;
  const P = ctx.props.at(x, z);
  const L = T(x, y, z);
  const put = putter(() => P, L);
  // plinth
  put(Shape.cyl(1.6, 8.6, 9.4, 8), 0, 0.5, 0, '#b8afa3', { ao: 0.35, noise: 0.08 }, 0, Math.PI / 8, 0);
  put(Shape.cyl(0.3, 8.9, 8.9, 8), 0, 1.35, 0, '#d4ccbf', {}, 0, Math.PI / 8, 0);
  // tower bands
  const H = 22;
  const r0 = 3.3;
  const r1 = 2.2;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const a = i / bands;
    const b = (i + 1) / bands;
    const ra = r0 + (r1 - r0) * a;
    const rb = r0 + (r1 - r0) * b;
    const color = i % 2 === 0 ? '#fbf7ef' : '#e2453f';
    put(Shape.lathe([[ra, 1.4 + a * H], [rb, 1.4 + b * H]], 32), 0, 0, 0, color, { noise: 0.03 });
  }
  // little windows spiralling up
  for (let i = 0; i < 5; i++) {
    const hy = 5 + i * 3.6;
    const ang = 0.9 + i * 1.1;
    const rr = r0 + (r1 - r0) * ((hy - 1.4) / H) + 0.02;
    const wx = Math.sin(ang) * rr;
    const wz = Math.cos(ang) * rr;
    ctx.windows.add(Shape.rbox(0.7, 1.0, 0.2, 0.08, 1), T(wx, y + hy, wz, 0, ang, 0).multiply(T(x, 0, z)), '#ffffff');
    put(Shape.rbox(0.95, 0.15, 0.35, 0.04, 1), wx * 1.03, hy - 0.58, wz * 1.03, '#2f3b52', {}, 0, ang, 0);
  }
  // door facing the cottage (south-west)
  const doorAng = Math.atan2(COTTAGE.x - x, COTTAGE.z - z);
  const dx = Math.sin(doorAng) * (r0 + 0.02);
  const dz = Math.cos(doorAng) * (r0 + 0.02);
  put(Shape.rbox(1.6, 2.6, 0.4, 0.2, 2), dx, 2.6, dz, '#2f3b52', {}, 0, doorAng, 0);
  put(Shape.rbox(1.25, 2.3, 0.3, 0.15, 2), dx * 1.03, 2.5, dz * 1.03, '#3a6fb0', {}, 0, doorAng, 0);
  put(Shape.sphere(0.16, 6), dx * 1.07 + Math.cos(doorAng) * 0.4, 2.5, dz * 1.07 - Math.sin(doorAng) * 0.4, '#f2c14e');
  ctx.bulbs.add(Shape.sphere(0.3, 8), T(dx * 1.12, y + 4.3, dz * 1.12).multiply(T(x, 0, z)), '#ffe6a8');
  // gallery
  const gy = 1.4 + H;
  put(Shape.cyl(0.45, 7.6, 6.2, 24), 0, gy, 0, '#2f3b52', { ao: 0.2 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    put(Shape.cyl(1.1, 0.07, 0.07, 4), Math.cos(a) * 3.65, gy + 0.75, Math.sin(a) * 3.65, '#2f3b52');
  }
  put(Shape.torus(7.3, 0.1, 32), 0, gy + 1.3, 0, '#2f3b52');
  put(Shape.cyl(0.35, 4.4, 4.6, 16), 0, gy + 0.35, 0, '#e2453f');
  // lamp room frame
  const ly = gy + 0.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put(Shape.box(0.14, 3.0, 0.14), Math.cos(a) * 1.85, ly + 1.5, Math.sin(a) * 1.85, '#2f3b52');
  }
  put(Shape.cyl(0.25, 4.2, 4.2, 16), 0, ly + 3.05, 0, '#2f3b52');
  put(Shape.lathe([[2.3, 0], [2.0, 0.6], [1.4, 1.4], [0.6, 2.0], [0.0, 2.25]], 24), 0, ly + 3.15, 0, '#e2453f', { top: '#ff6a5c' });
  put(Shape.sphere(0.5, 10), 0, ly + 5.5, 0, '#f2c14e');
  put(Shape.cyl(1.4, 0.06, 0.06, 4), 0, ly + 6.3, 0, '#2f3b52');
  put(Shape.prism([[0, 0], [0.9, 0.2], [0, 0.4]], 0.04), 0.05, ly + 6.7, 0, '#2f3b52');

  const root = new TransformNode('lighthouse', scene);
  root.position.set(x, y, z);
  // glass (glows at the finale)
  const glassMat = new StandardMaterial('lhGlass', scene);
  glassMat.diffuseColor = new Color3(0.35, 0.55, 0.65);
  glassMat.specularColor = new Color3(1, 1, 1);
  glassMat.specularPower = 128;
  glassMat.emissiveColor = new Color3(0.02, 0.04, 0.06);
  glassMat.alpha = 0.55;
  const glass = MeshBuilder.CreateCylinder('lhGlassMesh', { height: 2.9, diameter: 3.6, tessellation: 16, cap: 0 }, scene);
  glass.parent = root;
  glass.position.y = ly + 1.5;
  glass.material = glassMat;
  glass.isPickable = false;
  // lens (hidden until installed)
  const lb = new Batch();
  lb.add(Shape.ico(0.9, 1), Matrix.Scaling(1, 1.35, 1), '#fff6c8', { flat: true });
  lb.add(Shape.torus(1.9, 0.14, 20), T(0, 0, 0), '#e7b84a');
  lb.add(Shape.cyl(0.5, 0.9, 1.1, 12), T(0, -1.4, 0), '#e7b84a');
  const lensMat = new StandardMaterial('lensMat', scene);
  lensMat.diffuseColor = Color3.White();
  lensMat.emissiveColor = new Color3(0.2, 0.18, 0.1);
  lensMat.specularColor = new Color3(1, 1, 1);
  lensMat.specularPower = 120;
  const lens = lb.build('lens', scene, lensMat, root);
  lens.position.y = ly + 1.4;
  lens.isVisible = false;
  // beam
  const beamPivot = new TransformNode('beamPivot', scene);
  beamPivot.parent = root;
  beamPivot.position.y = ly + 1.4;
  const beamMat = new ShaderMaterial('beamMat', scene, 'beam', {
    attributes: ['position', 'uv'],
    uniforms: ['world', 'viewProjection', 'intensity', 'time', 'beamColor'],
    needAlphaBlending: true,
  });
  beamMat.alphaMode = Constants.ALPHA_ADD;
  beamMat.backFaceCulling = false;
  beamMat.disableDepthWrite = true;
  beamMat.setFloat('intensity', 0);
  beamMat.setColor3('beamColor', new Color3(1, 0.93, 0.7));
  for (const dir of [1, -1]) {
    const beam = beamMesh(scene, 150, 1.4, 22);
    beam.parent = beamPivot;
    beam.rotation.y = dir > 0 ? 0 : Math.PI;
    beam.material = beamMat;
    beam.isPickable = false;
    beam.alphaIndex = 50;
  }
  beamPivot.setEnabled(false);
  const light = new PointLight('lhLight', new Vector3(x, y + ly + 1.4, z), scene);
  light.diffuse = new Color3(1, 0.85, 0.55);
  light.intensity = 0;
  light.range = 90;
  ctx.col.addCircle({ x, z, r: 4.7 });
  const doorPos = new Vector3(x + Math.sin(doorAng) * 6, y, z + Math.cos(doorAng) * 6);
  return { root, glass, glassMat, lens, beamPivot, beamMat, light, topY: y + ly + 1.4, doorPos, baseY: y, windowsMat: ctx.mats.windows };
}

function beamMesh(scene: any, length: number, w0: number, w1: number) {
  // two crossed trapezoid planes along +z
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const rot of [0, Math.PI / 2]) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const b = pos.length / 3;
    const pt = (u: number, wv: number, zz: number) => {
      pos.push(u * wv * c, u * wv * s, zz);
    };
    pt(-1, w0 / 2, 0);
    uv.push(0, 0);
    pt(1, w0 / 2, 0);
    uv.push(1, 0);
    pt(1, w1 / 2, length);
    uv.push(1, 1);
    pt(-1, w1 / 2, length);
    uv.push(0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.uvs = uv;
  vd.indices = idx;
  const m = new Mesh('beam', scene);
  vd.applyToMesh(m);
  return m;
}

// =============================================================================
// Keeper's cottage, solar panels, energy panel anchor, cables
// =============================================================================
export interface CottageHandles {
  panelAnchor: TransformNode;
  cableMat: StandardMaterial;
  cables: Mesh;
  cablePoints: Vector3[][];
  batteryLights: Mesh[];
}

export function buildCottage(ctx: WorldCtx): CottageHandles {
  const { scene } = ctx;
  const x = COTTAGE.x;
  const z = COTTAGE.z;
  const y = ctx.terrain.sample(x, z) - 0.05;
  const yaw = COTTAGE.yaw;
  const L = T(x, y, z, 0, yaw);
  const put = putter(() => ctx.props.at(x, z), L);
  const putW = putter(() => ctx.windows, L);
  const W = 7;
  const D = 5.5;
  const H = 3;
  put(Shape.rbox(W + 0.4, 1, D + 0.4, 0.1), 0, 0, 0, '#a59c92', { ao: 0.3 });
  put(Shape.rbox(W, H, D, 0.2, 2), 0, 0.5 + H / 2, 0, '#fbf7ef', { ao: 0.2 });
  const pitch = 0.55;
  const half = D / 2 + 0.5;
  const rise = Math.tan(pitch) * half;
  const slab = half / Math.cos(pitch) + 0.1;
  for (const s of [-1, 1]) put(Shape.rbox(W + 0.8, 0.24, slab, 0.08, 1), 0, 0.5 + H + rise / 2, (s * half) / 2, '#2f5f9a', { ao: 0.2 }, s * pitch, 0, 0);
  for (const s of [-1, 1]) put(Shape.prism([[-D / 2, 0], [D / 2, 0], [0, rise * (D / 2) / half]], 0.2), (s * W) / 2 - s * 0.05, 0.5 + H, 0, '#fbf7ef', {}, 0, Math.PI / 2, 0);
  // solar panels on the back slope (facing the sun)
  for (let i = 0; i < 3; i++) {
    const lx = -2.2 + i * 2.2;
    put(Shape.rbox(1.9, 0.08, 2.2, 0.04, 1), lx, 0.5 + H + rise / 2 + 0.25, -half / 2, '#1f3a6a', { mul: 1.1 }, -pitch, 0, 0);
    for (let k = 0; k < 3; k++) put(Shape.box(1.9, 0.1, 0.03), lx, 0.5 + H + rise / 2 + 0.27, -half / 2 - 0.7 + k * 0.7, '#9fb4d0', {}, -pitch, 0, 0);
  }
  // windows + door (front = local +z)
  for (const lx of [-2.2, 2.2]) {
    put(Shape.rbox(1.3, 1.3, 0.16, 0.05, 1), lx, 2.2, D / 2 + 0.03, '#2f5f9a');
    putW(Shape.box(1.0, 1.0, 0.06), lx, 2.2, D / 2 + 0.1, '#ffffff');
  }
  put(Shape.rbox(1.2, 2.1, 0.14, 0.05, 1), 0, 1.55, D / 2 + 0.08, '#e2453f');
  ctx.bulbs.add(Shape.sphere(0.24, 8), T(0, 3.0, D / 2 + 0.4).multiply(L), '#ffe6a8');
  // battery bank by the side wall
  put(Shape.rbox(1.6, 1.4, 1.0, 0.1, 1), W / 2 + 1.1, 0.7, 0.6, '#6b7c8f', { ao: 0.3 });
  put(Shape.rbox(1.7, 0.15, 1.1, 0.04, 1), W / 2 + 1.1, 1.45, 0.6, '#4a586a');
  const batteryLights: Mesh[] = [];
  const blMat = new StandardMaterial('battLight', scene);
  blMat.disableLighting = true;
  blMat.emissiveColor = new Color3(0.2, 0.25, 0.3);
  for (let i = 0; i < 4; i++) {
    const m = MeshBuilder.CreateBox('batt' + i, { width: 0.24, height: 0.18, depth: 0.05 }, scene);
    const wp = Vector3.TransformCoordinates(new Vector3(W / 2 + 0.6 + i * 0.32, 1.0, 0.6 + 0.52), L);
    m.position.copyFrom(wp);
    m.rotation.y = yaw;
    m.material = blMat.clone('battLight' + i);
    m.isPickable = false;
    batteryLights.push(m);
  }
  ctx.col.addBox({ x, z, hw: W / 2 + 0.3, hd: D / 2 + 0.3, yaw });
  const bw = toWorld(W / 2 + 1.1, 0.6, yaw);
  ctx.col.addCircle({ x: x + bw.x, z: z + bw.z, r: 1.0 });

  // energy panel board (free-standing, faces the path) – visuals built by the circuit puzzle
  const panelAnchor = new TransformNode('panelAnchor', scene);
  const py = ctx.terrain.sample(PANEL.x, PANEL.z);
  panelAnchor.position.set(PANEL.x, py, PANEL.z);
  panelAnchor.rotation.y = Math.atan2(47 - PANEL.x, 73.5 - PANEL.z);
  {
    const pb = ctx.props.at(PANEL.x, PANEL.z);
    const PL = T(PANEL.x, py, PANEL.z, 0, panelAnchor.rotation.y);
    for (const sx of [-2.5, 2.5]) pb.add(Shape.rbox(0.25, 3.6, 0.25, 0.05, 1), T(sx, 1.8, -0.2).multiply(PL), '#5b6472', { ao: 0.3 });
    pb.add(Shape.rbox(5.4, 3.3, 0.3, 0.12, 2), T(0, 1.95, -0.25).multiply(PL), '#3a4352', { ao: 0.25 });
    pb.add(Shape.rbox(5.7, 0.25, 0.7, 0.08, 1), T(0, 3.7, -0.1).multiply(PL), '#e2453f');
    ctx.col.addBox({ x: PANEL.x, z: PANEL.z, hw: 2.8, hd: 0.4, yaw: panelAnchor.rotation.y });
  }
  addLampPost(ctx, PANEL.x - 4.5, PANEL.z - 2.5);

  // ---------------- power cables on poles: turbine → cottage → lighthouse
  const cableMat = new StandardMaterial('cableMat', scene);
  cableMat.diffuseColor = new Color3(0.12, 0.12, 0.14);
  cableMat.specularColor = new Color3(0.3, 0.3, 0.3);
  cableMat.emissiveColor = new Color3(0, 0, 0);
  const route: [number, number][] = [
    [TURBINE.x + 2.2, TURBINE.z + 1.5],
    [28, 58],
    [36, 65],
    [43, 71.5],
    [PANEL.x - 2.5, PANEL.z - 1.2],
  ];
  const route2: [number, number][] = [
    [PANEL.x + 2.0, PANEL.z + 1.0],
    [56.5, 82],
    [LIGHTHOUSE.x - 4.2, LIGHTHOUSE.z - 2.6],
  ];
  const cb = new Batch();
  const cablePoints: Vector3[][] = [];
  const poleH = 5;
  for (const r of [route, route2]) {
    const pts: Vector3[] = [];
    r.forEach(([px, pz], i) => {
      const gy = ctx.terrain.sample(px, pz);
      const isEnd = i === 0 || i === r.length - 1;
      const h = isEnd ? 2.4 : poleH;
      ctx.props.at(px, pz).add(Shape.cyl(h, 0.16, 0.22, 7), T(px, gy + h / 2, pz), '#7d5634', { ao: 0.3 });
      if (!isEnd) {
        ctx.props.at(px, pz).add(Shape.rbox(1.2, 0.12, 0.12, 0.03, 1), T(px, gy + h - 0.3, pz, 0, Math.atan2(r[i + 1][0] - px, r[i + 1][1] - pz) + Math.PI / 2, 0), '#7d5634');
        ctx.col.addCircle({ x: px, z: pz, r: 0.25 });
      }
      pts.push(new Vector3(px, gy + h - 0.15, pz));
    });
    const full: Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const n = 10;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const p = Vector3.Lerp(a, b, t);
        p.y -= Math.sin(t * Math.PI) * 0.9;
        full.push(p);
      }
    }
    full.push(pts[pts.length - 1]);
    cablePoints.push(full);
    cb.add(Shape.tube(full, 0.05, 5), Matrix.Identity(), '#ffffff');
  }
  const cables = cb.build('cables', scene, cableMat);
  cables.isPickable = false;
  return { panelAnchor, cableMat, cables, cablePoints, batteryLights };
}

// =============================================================================
// Wind turbine + windsock
// =============================================================================
export interface TurbineHandles {
  head: TransformNode;
  rotor: TransformNode;
  sock: TransformNode;
  sockSegs: Mesh[];
  basePos: Vector3;
  hubPos: () => Vector3;
}

export function buildTurbine(ctx: WorldCtx): TurbineHandles {
  const { scene } = ctx;
  const x = TURBINE.x;
  const z = TURBINE.z;
  const y = ctx.terrain.sample(x, z) - 0.1;
  const P = ctx.props.at(x, z);
  P.add(Shape.cyl(0.8, 3.2, 3.6, 12), T(x, y + 0.3, z), '#b8afa3', { ao: 0.3 });
  const H = 15;
  P.add(Shape.lathe([[0.75, 0], [0.62, H * 0.5], [0.42, H]], 18), T(x, y + 0.6, z), '#f4f6f8', { ao: 0.15 });
  P.add(Shape.rbox(0.9, 1.9, 0.12, 0.05, 1), T(x + 0.0, y + 1.6, z - 0.72, 0, Math.PI, 0), '#6b7c8f');
  ctx.col.addCircle({ x, z, r: 1.4 });
  const head = new TransformNode('turbineHead', scene);
  head.position.set(x, y + 0.6 + H, z);
  const hb = new Batch();
  hb.add(Shape.rbox(1.3, 1.3, 3.2, 0.5, 3), T(0, 0.3, -0.4), '#f4f6f8', { ao: 0.2 });
  hb.add(Shape.rbox(1.32, 0.18, 2.0, 0.05, 1), T(0, 0.3, -0.6), '#2fa36b');
  hb.build('turbineNacelle', scene, ctx.mats.vc, head);
  const rotor = new TransformNode('turbineRotor', scene);
  rotor.parent = head;
  rotor.position.set(0, 0.3, 1.45);
  const rb = new Batch();
  rb.add(Shape.lathe([[0.55, 0], [0.5, 0.4], [0.3, 0.9], [0, 1.15]], 16), T(0, 0, 0, Math.PI / 2, 0, 0), '#f4f6f8');
  const blade: [number, number][] = [
    [-0.18, 0.4],
    [0.36, 0.9],
    [0.3, 4.0],
    [0.12, 6.6],
    [-0.08, 6.7],
    [-0.22, 4.0],
    [-0.3, 0.9],
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rb.add(Shape.prism(blade, 0.12), T(0, 0, 0.25, 0, 0.15, a), '#f4f6f8', { ao: 0.1 });
    rb.add(Shape.prism([[-0.16, 5.6], [0.18, 5.6], [0.12, 6.6], [-0.08, 6.7]], 0.14), T(0, 0, 0.25, 0, 0.15, a), '#e2453f');
  }
  const rmesh = rb.build('turbineRotorMesh', scene, ctx.mats.vc, rotor);
  ctx.casters.push(rmesh);
  head.rotation.y = (Math.PI * 3) / 4;
  // windsock
  const sx = WINDSOCK.x;
  const sz = WINDSOCK.z;
  const sy = ctx.terrain.sample(sx, sz);
  P.add(Shape.cyl(5, 0.1, 0.14, 8), T(sx, sy + 2.5, sz), '#d8d2c8', { ao: 0.2 });
  P.add(Shape.torus(0.9, 0.06, 14), T(sx + 0.45, sy + 4.85, sz, 0, 0, Math.PI / 2), '#d8d2c8');
  ctx.col.addCircle({ x: sx, z: sz, r: 0.25 });
  const sock = new TransformNode('sock', scene);
  sock.position.set(sx + 0.45, sy + 4.85, sz);
  const sockSegs: Mesh[] = [];
  let parent: TransformNode = sock;
  for (let i = 0; i < 5; i++) {
    const sb = new Batch();
    const r0 = 0.45 - i * 0.06;
    const r1 = 0.45 - (i + 1) * 0.06;
    sb.add(Shape.lathe([[r0, 0], [r1, 0.62]], 14), T(0, 0, 0, 0, 0, -Math.PI / 2), i % 2 === 0 ? '#ff5a3c' : '#ffffff');
    const m = sb.build('sock' + i, scene, ctx.mats.vc, parent);
    m.position.x = i === 0 ? 0 : 0.62;
    sockSegs.push(m);
    parent = m;
  }
  const basePos = new Vector3(x, y, z);
  return {
    head,
    rotor,
    sock,
    sockSegs,
    basePos,
    hubPos: () => Vector3.TransformCoordinates(Vector3.Zero(), rotor.getWorldMatrix()),
  };
}

// =============================================================================
// Workshop + water wheel
// =============================================================================
export interface WorkshopHandles {
  root: TransformNode;
  roof: Mesh;
  boardAnchor: TransformNode;
  wheel: TransformNode;
  chimneyTop: Vector3;
  floorY: number;
  inside: (x: number, z: number) => boolean;
  shaft: TransformNode;
}

export function buildWorkshop(ctx: WorldCtx): WorkshopHandles {
  const { scene } = ctx;
  const { x, z, yaw, w: W, d: D } = WORKSHOP;
  const y = ctx.terrain.sample(x, z) - 0.05;
  const L = T(x, y, z, 0, yaw);
  const put = putter(() => ctx.props.at(x, z), L);
  const putD = putter(() => ctx.detail.at(x, z), L);
  const putW = putter(() => ctx.windows, L);
  const putB = putter(() => ctx.bulbs, L);
  const H = 4.6;
  const floorY = 0.35;
  // floor
  put(Shape.rbox(W + 0.6, 0.9, D + 0.6, 0.12), 0, floorY - 0.45, 0, '#a59c92', { ao: 0.3 });
  for (let i = 0; i < 14; i++) put(Shape.box(W - 0.4, 0.06, D / 14 - 0.03), 0, floorY + 0.02, -D / 2 + (i + 0.5) * (D / 14), i % 2 ? '#b07a4a' : '#bf8955', { noise: 0.1 });
  // walls: back (local -z) and sides (local ±x); front open with posts
  const stone = '#b6aa98';
  const timber = '#7d5634';
  const plaster = '#f3e6c8';
  const wall = (lx: number, lz: number, len: number, ry: number) => {
    put(Shape.rbox(len, 1.5, 0.5, 0.1, 1), lx, floorY + 0.75, lz, stone, { ao: 0.3, noise: 0.15 }, 0, ry, 0);
    put(Shape.rbox(len, H - 1.5, 0.36, 0.06, 1), lx, floorY + 1.5 + (H - 1.5) / 2, lz, plaster, { ao: 0.1 }, 0, ry, 0);
    // timber frame beams
    put(Shape.box(len, 0.22, 0.42), lx, floorY + 1.55, lz, timber, {}, 0, ry, 0);
    put(Shape.box(len, 0.22, 0.42), lx, floorY + H - 0.1, lz, timber, {}, 0, ry, 0);
    const n = Math.round(len / 2.2);
    for (let i = 0; i <= n; i++) {
      const o = -len / 2 + (len / n) * i;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      put(Shape.box(0.22, H - 1.5, 0.42), lx + o * c, floorY + 1.5 + (H - 1.5) / 2, lz - o * s, timber, {}, 0, ry, 0);
      if (i < n && i % 2 === 0) {
        const o2 = o + len / n / 2;
        put(Shape.box(0.16, (H - 1.5) * 1.15, 0.4), lx + o2 * c, floorY + 1.5 + (H - 1.5) / 2, lz - o2 * s, timber, {}, 0, ry, 0.7);
      }
    }
  };
  wall(0, -D / 2, W, 0);
  wall(-W / 2, 0, D, Math.PI / 2);
  wall(W / 2, 0, D, Math.PI / 2);
  // side windows
  for (const sx of [-1, 1]) {
    for (const lz of [-2.2, 2.2]) {
      putW(Shape.box(0.1, 1.2, 1.4), sx * (W / 2 + 0.02), floorY + 2.7, lz, '#ffffff');
      put(Shape.box(0.16, 0.12, 1.6), sx * (W / 2 + 0.05), floorY + 2.05, lz, timber);
    }
  }
  // front posts + lintel + sign
  for (const lx of [-W / 2, -W / 6, W / 6, W / 2]) put(Shape.rbox(0.5, H, 0.5, 0.06, 1), lx, floorY + H / 2, D / 2, timber, { ao: 0.3 });
  put(Shape.box(W + 0.4, 0.5, 0.55), 0, floorY + H, D / 2, timber);
  // sign board with text
  const signTex = new DynamicTexture('signTex', { width: 1024, height: 192 }, scene, true);
  const sctx = signTex.getContext() as CanvasRenderingContext2D;
  sctx.fillStyle = '#2a3f66';
  sctx.fillRect(0, 0, 1024, 192);
  sctx.strokeStyle = '#f2c14e';
  sctx.lineWidth = 10;
  sctx.strokeRect(10, 10, 1004, 172);
  sctx.fillStyle = '#ffe9a8';
  sctx.font = 'bold 84px Fredoka, "Trebuchet MS", sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText("COGSWORTH'S WORKSHOP", 512, 100);
  signTex.update(true);
  const signMat = new StandardMaterial('signMat', scene);
  signMat.diffuseTexture = signTex;
  signMat.emissiveColor = new Color3(0.25, 0.25, 0.25);
  signMat.specularColor = Color3.Black();
  const sign = MeshBuilder.CreatePlane('sign', { width: 7, height: 1.3 }, scene);
  const sp = Vector3.TransformCoordinates(new Vector3(0, floorY + H + 0.85, D / 2 + 0.35), L);
  sign.position.copyFrom(sp);
  sign.rotation.y = yaw + Math.PI;
  sign.material = signMat;
  sign.isPickable = false;
  put(Shape.rbox(7.3, 1.5, 0.15, 0.06, 1), 0, floorY + H + 0.85, D / 2 + 0.24, timber);
  // big gear emblem on the gable
  put(Shape.cyl(0.25, 1.6, 1.6, 12), 0, floorY + H + 2.4, D / 2 + 0.28, '#e7b84a', {}, Math.PI / 2, 0, 0);

  // roof (separate mesh so it can fade when the player is inside)
  const rb = new Batch();
  const pitch = 0.6;
  const half = D / 2 + 0.9;
  const rise = Math.tan(pitch) * half;
  const slab = half / Math.cos(pitch) + 0.1;
  const RL = (lx: number, ly: number, lz: number, rx: number) => T(lx, ly, lz, rx, 0, 0).multiply(L);
  // ridge along local x
  for (const s of [-1, 1]) {
    rb.add(Shape.rbox(W + 1.4, 0.3, slab, 0.08, 1), RL(0, floorY + H + 0.15 + rise / 2, (s * half) / 2, s * pitch), '#6a4a3a', { ao: 0.2, noise: 0.15 });
    for (let r = 1; r < 6; r++) {
      const t = r / 6;
      rb.add(Shape.box(W + 1.42, 0.06, 0.12), RL(0, floorY + H + 0.15 + rise * (1 - t) + 0.17, s * half * t, s * pitch), '#563b2e');
    }
  }
  for (const s of [-1, 1]) rb.add(Shape.prism([[-D / 2, 0], [D / 2, 0], [0, rise * (D / 2) / half]], 0.25), T((s * W) / 2, floorY + H + 0.1, 0, 0, Math.PI / 2, 0).multiply(L), plaster);
  // chimney
  rb.add(Shape.rbox(1.0, 3.2, 1.0, 0.08, 1), RL(-W / 2 + 2, floorY + H + rise + 0.6, -1.2, 0), '#a8574a', { ao: 0.3 });
  const roof = rb.build('workshopRoof', scene, ctx.mats.vc);
  ctx.casters.push(roof);
  const chimneyTop = Vector3.TransformCoordinates(new Vector3(-W / 2 + 2, floorY + H + rise + 2.3, -1.2), L);

  // ---------------- interior clutter
  // workbenches along the side walls
  for (const sx of [-1, 1]) {
    const bx = sx * (W / 2 - 1.0);
    put(Shape.rbox(1.4, 0.15, D * 0.6, 0.04, 1), bx, floorY + 1.05, 0.5, '#b07a4a');
    for (const lz of [-1.8, 2.8]) put(Shape.box(1.2, 1.0, 0.15), bx, floorY + 0.5, lz, '#7d5634');
    // tools on the bench
    putD(Shape.cyl(0.5, 0.25, 0.25, 8), bx, floorY + 1.4, -0.8, '#e2453f');
    putD(Shape.rbox(0.6, 0.4, 0.4, 0.05, 1), bx, floorY + 1.33, 1.6, '#3f7fb0');
    putD(Shape.cyl(0.1, 0.9, 0.9, 12), bx, floorY + 1.18, 2.8, '#e7b84a', {}, 0, 0, 0);
    // tool rack
    put(Shape.box(0.1, 1.4, 3.0), sx * (W / 2 - 0.25), floorY + 2.6, 0.4, '#8b5e3c');
    for (let k = 0; k < 5; k++) putD(Shape.rbox(0.08, 0.9, 0.12, 0.02, 1), sx * (W / 2 - 0.35), floorY + 2.5, -0.6 + k * 0.5, ['#9aa3ad', '#e2453f', '#9aa3ad', '#f2c14e', '#9aa3ad'][k]);
  }
  // brass telescope + crates
  putD(Shape.cyl(1.6, 0.25, 0.4, 12), W / 2 - 1.6, floorY + 2.0, D / 2 - 1.5, '#e7b84a', {}, 0.9, 0.6, 0);
  putD(Shape.cyl(1.2, 0.06, 0.06, 4), W / 2 - 1.6, floorY + 0.6, D / 2 - 1.5, '#5a3e2b');
  // hanging lamps
  for (const lx of [-3, 3]) {
    putD(Shape.cyl(1.2, 0.03, 0.03, 4), lx, floorY + H - 0.5, 0, '#333');
    putD(Shape.cone(0.4, 0.8, 10), lx, floorY + H - 1.2, 0, '#2f6f5a');
    putB(Shape.sphere(0.3, 8), lx, floorY + H - 1.45, 0, '#ffe6a8');
  }
  // chalkboard with gear doodles
  const cbTex = new DynamicTexture('chalkTex', { width: 512, height: 320 }, scene, true);
  const cctx = cbTex.getContext() as CanvasRenderingContext2D;
  cctx.fillStyle = '#26443a';
  cctx.fillRect(0, 0, 512, 320);
  cctx.strokeStyle = 'rgba(255,255,255,0.85)';
  cctx.lineWidth = 4;
  const doodleGear = (gx: number, gy: number, r: number, teeth: number) => {
    cctx.beginPath();
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? r : r * 0.82;
      cctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr);
    }
    cctx.stroke();
    cctx.beginPath();
    cctx.arc(gx, gy, r * 0.2, 0, Math.PI * 2);
    cctx.stroke();
  };
  doodleGear(130, 150, 70, 12);
  doodleGear(255, 120, 45, 8);
  doodleGear(360, 165, 70, 12);
  cctx.font = '28px "Comic Sans MS", Fredoka, sans-serif';
  cctx.fillStyle = 'white';
  cctx.fillText('↻   ↺   ↻', 120, 270);
  cctx.fillText('neighbours swap!', 230, 300);
  cbTex.update(true);
  const cbMat = new StandardMaterial('chalkMat', scene);
  cbMat.diffuseTexture = cbTex;
  cbMat.specularColor = Color3.Black();
  cbMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
  const board = MeshBuilder.CreatePlane('chalk', { width: 2.4, height: 1.5 }, scene);
  const cbp = Vector3.TransformCoordinates(new Vector3(-W / 2 + 0.28, floorY + 2.6, -2.6), L);
  board.position.copyFrom(cbp);
  board.rotation.y = yaw + Math.PI / 2 + Math.PI;
  board.material = cbMat;
  board.isPickable = false;

  // gear board anchor: centred on the back wall, facing the doorway (local +z)
  const root = new TransformNode('workshop', scene);
  root.position.set(x, y, z);
  root.rotation.y = yaw;
  const boardAnchor = new TransformNode('gearBoardAnchor', scene);
  boardAnchor.parent = root;
  boardAnchor.position.set(0, floorY + 2.5, -D / 2 + 0.45);
  // board backing
  put(Shape.rbox(8.6, 5.0, 0.3, 0.15, 2), 0, floorY + 2.45, -D / 2 + 0.3, '#5a3e2b', { ao: 0.2 });
  put(Shape.rbox(8.2, 4.6, 0.12, 0.1, 1), 0, floorY + 2.45, -D / 2 + 0.42, '#d9c39a');

  // colliders: back & side walls, benches
  const wc = (lx: number, lz: number, hw: number, hd: number) => {
    const p = toWorld(lx, lz, yaw);
    ctx.col.addBox({ x: x + p.x, z: z + p.z, hw, hd, yaw });
  };
  wc(0, -D / 2, W / 2 + 0.3, 0.4);
  wc(-W / 2, 0, 0.4, D / 2 + 0.3);
  wc(W / 2, 0, 0.4, D / 2 + 0.3);
  wc(-W / 2 + 1.0, 0.5, 0.8, D * 0.32);
  wc(W / 2 - 1.0, 0.5, 0.8, D * 0.32);
  for (const lx of [-W / 2, -W / 6, W / 6, W / 2]) {
    const p = toWorld(lx, D / 2, yaw);
    ctx.col.addCircle({ x: x + p.x, z: z + p.z, r: 0.35 });
  }
  ctx.col.addPlatform({ x, z, hw: W / 2 + 0.3, hd: D / 2 + 0.3, yaw, y: y + floorY + 0.05, surface: 'wood' });

  // ---------------- water wheel (rotates about world z)
  const wy = ctx.terrain.streamInfo(WATERWHEEL.x, WATERWHEEL.z).surface + 1.75;
  const wheel = new TransformNode('waterwheel', scene);
  wheel.position.set(WATERWHEEL.x, wy, WATERWHEEL.z);
  const wb = new Batch();
  const R = 2.4;
  for (const oz of [-0.6, 0.6]) wb.add(Shape.torus(R * 2, 0.16, 28), T(0, 0, oz, Math.PI / 2, 0, 0), '#7d5634');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const oz of [-0.6, 0.6]) wb.add(Shape.box(0.14, R * 2, 0.14), T(0, 0, oz, 0, 0, a), '#8b5e3c');
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    wb.add(Shape.rbox(0.7, 0.12, 1.5, 0.03, 1), T(Math.cos(a) * (R - 0.1), Math.sin(a) * (R - 0.1), 0, 0, 0, a + Math.PI / 2), '#a67446', { noise: 0.1 });
  }
  wb.add(Shape.cyl(1.8, 0.5, 0.5, 12), T(0, 0, 0, Math.PI / 2, 0, 0), '#5a3e2b');
  const wm = wb.build('wheelMesh', scene, ctx.mats.vc, wheel);
  ctx.casters.push(wm);
  // axle to the workshop wall + support posts
  const shaft = new TransformNode('wheelShaft', scene);
  shaft.position.set(WATERWHEEL.x, wy, WATERWHEEL.z);
  const sb = new Batch();
  const wallZ = z - W / 2;
  const len = wallZ - WATERWHEEL.z + 0.6;
  sb.add(Shape.cyl(len, 0.22, 0.22, 10), T(0, 0, len / 2, Math.PI / 2, 0, 0), '#6b6f78');
  sb.build('shaftMesh', scene, ctx.mats.vc, shaft);
  for (const oz of [-1.1, 1.8]) {
    const px = WATERWHEEL.x;
    const pz = WATERWHEEL.z + oz;
    const gy = ctx.terrain.sample(px, pz);
    ctx.props.at(px, pz).add(Shape.rbox(0.4, wy - gy + 0.3, 0.4, 0.05, 1), T(px, (wy + gy) / 2, pz), '#6b4a30', { ao: 0.4 });
  }
  ctx.col.addCircle({ x: WATERWHEEL.x, z: WATERWHEEL.z + 1.8, r: 0.4 });
  ctx.col.addBox({ x: WATERWHEEL.x, z: WATERWHEEL.z, hw: 2.6, hd: 1.0, yaw: 0 });

  const inside = (px: number, pz: number) => {
    const dx = px - x;
    const dz = pz - z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < W / 2 + 0.2 && lz < D / 2 + 0.8 && lz > -D / 2;
  };
  return { root, roof, boardAnchor, wheel, chimneyTop, floorY: y + floorY, inside, shaft };
}

// =============================================================================
// Bridge abutments + broken remains (static)
// =============================================================================
export function buildBridgeSite(ctx: WorldCtx) {
  const { x, z, halfLen, halfW, deckY } = BRIDGE;
  const P = ctx.props.at(x, z);
  for (const s of [-1, 1]) {
    const az = z + s * (halfLen - 1.2);
    const gy = ctx.terrain.sample(x, az);
    P.add(Shape.rbox(halfW * 2 + 1.4, deckY - gy + 1.2, 2.8, 0.15, 1), T(x, (deckY + gy) / 2 - 0.65, az), '#b6aa98', { ao: 0.35, noise: 0.15 });
    for (const sx of [-1, 1]) {
      P.add(Shape.rbox(0.6, 1.4, 0.6, 0.1, 1), T(x + sx * (halfW + 0.45), deckY + 0.5, z + s * (halfLen - 0.4)), '#b6aa98', { ao: 0.2 });
      P.add(Shape.sphere(0.5, 8), T(x + sx * (halfW + 0.45), deckY + 1.3, z + s * (halfLen - 0.4)), '#cfc6b8');
      ctx.col.addCircle({ x: x + sx * (halfW + 0.45), z: z + s * (halfLen - 0.4), r: 0.4 });
    }
  }
  // footings in the stream bed at three depths (short / tall / medium posts)
  const st = ctx.terrain.streamInfo(x, z);
  const footings = [
    { z: -3.2, top: st.surface + 0.05 },
    { z: 0, top: st.surface - 1.35 },
    { z: 3.2, top: st.surface - 0.7 },
  ];
  for (const f of footings) {
    const gy = ctx.terrain.sample(x, z + f.z);
    const h = Math.max(0.4, f.top - gy + 0.5);
    P.add(Shape.rbox(1.0, h, 1.0, 0.15, 1), T(x, f.top - h / 2, z + f.z), '#9a918a', { ao: 0.3, noise: 0.2 });
  }
  // broken plank remains dangling from the south abutment and debris
  const rnd = rng(5);
  for (let i = 0; i < 3; i++) {
    P.add(Shape.rbox(0.45, 0.12, 2.6, 0.03, 1), T(x - 0.8 + i * 0.75, deckY - 0.8 - rnd() * 0.4, z - halfLen + 2.6, 0.7 + rnd() * 0.3, (rnd() - 0.5) * 0.3, 0), '#9b7350', { noise: 0.1 });
  }
  P.add(Shape.rbox(0.5, 0.14, 3.2, 0.03, 1), T(x + 3.5, st.surface - 0.05, z + 2, 0.1, 0.9, 0.2), '#8a6545');
  ctx.col.addBox({ x, z, hw: halfW + 0.05, hd: halfLen - 2.6, yaw: 0, enabled: () => !(ctx as any).bridgeBuilt });
  return { footings };
}

// =============================================================================
// Distant scenery: hills, city skyline, islands, offshore wind farm, ships
// =============================================================================
export interface DistantHandles {
  rotors: TransformNode[];
  ships: TransformNode[];
  mat: ShaderMaterial;
}

export function buildDistant(ctx: WorldCtx): DistantHandles {
  const { scene } = ctx;
  const mat = new ShaderMaterial('distantMat', scene, 'distant', {
    attributes: ['position', 'normal', 'color'],
    uniforms: ['worldViewProjection', 'world', 'horizon', 'light', 'sunDir', 'haze', 'windowGlow'],
  });
  const b = new Batch();
  const rnd = rng(31);
  // hills to the west / south-west (Welsh hills) and north-west
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.62 + (i / 26) * Math.PI * 0.75;
    const d = 820 + rnd() * 380;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.9 - 100;
    const h = 35 + rnd() * 70;
    const r = 140 + rnd() * 140;
    b.add(Shape.rock(1, 300 + i, 1, 2), Matrix.Scaling(r, h, r * 0.7).multiply(T(x, -h * 0.25, z)), '#6f8fa8', { flat: true, top: '#8fb2c4' });
  }
  // small islands
  for (const [ix, iz, s] of [
    [-260, 160, 26],
    [300, 260, 34],
    [-340, -240, 22],
    [420, -60, 18],
  ]) {
    b.add(Shape.rock(1, ix, 0.5, 2), Matrix.Scaling(s, s * 0.35, s * 0.8).multiply(T(ix, -1, iz)), '#7aa86a', { flat: true, top: '#9cc77a' });
    for (let k = 0; k < 6; k++) {
      const tx = ix + (rnd() - 0.5) * s;
      const tz = iz + (rnd() - 0.5) * s * 0.6;
      b.add(Shape.cone(10, 6, 6), T(tx, s * 0.25 + 4, tz), '#3f7f55');
    }
  }
  // city skyline to the south-east (generic waterfront)
  const cityA = -Math.PI * 0.32;
  const cityD = 760;
  const cx = Math.cos(cityA) * cityD;
  const cz = Math.sin(cityA) * cityD;
  const tang = new Vector3(-Math.sin(cityA), 0, Math.cos(cityA));
  const windowsB = new Batch();
  for (let i = 0; i < 46; i++) {
    const o = (i / 46 - 0.5) * 420 + (rnd() - 0.5) * 6;
    const depth = (rnd() - 0.5) * 60;
    const px = cx + tang.x * o + Math.cos(cityA) * depth;
    const pz = cz + tang.z * o + Math.sin(cityA) * depth;
    const h = 14 + rnd() * 46 + (Math.abs(o) < 60 ? 30 : 0);
    const w = 10 + rnd() * 14;
    const c = ['#c9b8a8', '#a8b4c4', '#d8c8b0', '#b4a8a0'][Math.floor(rnd() * 4)];
    b.add(Shape.box(w, h, w), T(px, h / 2, pz, 0, -cityA), c);
    if (rnd() < 0.7) windowsB.add(Shape.box(w * 0.7, h * 0.6, w * 1.02), T(px, h * 0.55, pz, 0, -cityA), '#ffffff');
  }
  // two domed clock towers and a cathedral tower
  for (const o of [-26, -8]) {
    const px = cx + tang.x * o;
    const pz = cz + tang.z * o;
    b.add(Shape.box(16, 70, 16), T(px, 35, pz, 0, -cityA), '#cfc2ae');
    b.add(Shape.cyl(14, 9, 11, 12), T(px, 77, pz), '#cfc2ae');
    b.add(Shape.hemi(10, 10), T(px, 84, pz), '#7aa89a');
  }
  {
    const o = 90;
    const px = cx + tang.x * o;
    const pz = cz + tang.z * o;
    b.add(Shape.box(30, 95, 30), T(px, 47, pz, 0, -cityA), '#c8a890');
    b.add(Shape.box(22, 20, 22), T(px, 105, pz, 0, -cityA), '#c8a890');
  }
  // offshore wind farm (north-west)
  const rotors: TransformNode[] = [];
  const rotorB = new Batch();
  rotorB.add(Shape.sphere(1.6, 6), Matrix.Identity(), '#f4f6f8');
  for (let k = 0; k < 3; k++) rotorB.add(Shape.box(1.2, 22, 0.4), T(0, 11, 0, 0, 0, 0).multiply(Matrix.RotationZ((k / 3) * Math.PI * 2)), '#f4f6f8');
  const rotorVD = rotorB.toVertexData();
  for (let i = 0; i < 14; i++) {
    const gx = -520 + (i % 7) * 70 + (Math.floor(i / 7) % 2) * 35;
    const gz = 560 + Math.floor(i / 7) * 80;
    b.add(Shape.cyl(48, 1.4, 2.2, 6), T(gx, 24, gz), '#e8ecf0');
    const node = new TransformNode('farRotor' + i, scene);
    node.position.set(gx, 49, gz);
    node.rotation.y = 0.6;
    const m = new Mesh('farRotorMesh' + i, scene);
    rotorVD.applyToMesh(m);
    m.parent = node;
    m.material = mat;
    m.isPickable = false;
    m.position.z = 1.4;
    rotors.push(node);
  }
  const dm = b.build('distant', scene, mat);
  dm.isPickable = false;
  dm.applyFog = false;
  const winMat = new StandardMaterial('cityWin', scene);
  winMat.disableLighting = true;
  winMat.emissiveColor = new Color3(0, 0, 0);
  winMat.alpha = 0;
  const wm = windowsB.build('cityWindows', scene, winMat);
  wm.isPickable = false;
  ctx.env.onNightChange.push((g) => {
    winMat.emissiveColor = new Color3(1.0, 0.8, 0.45).scale(g * 0.9);
    winMat.alpha = g * 0.85;
  });
  // ships on the horizon
  const ships: TransformNode[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new TransformNode('ship' + i, scene);
    const sb = new Batch();
    sb.add(Shape.rbox(30, 5, 7, 1.2, 2), T(0, 1, 0), ['#2f4f7a', '#8a2f2f', '#2f6a5a'][i]);
    sb.add(Shape.rbox(9, 5, 6, 0.5, 1), T(-8, 5.5, 0), '#f4f0e8');
    sb.add(Shape.cyl(5, 1.6, 1.8, 8), T(-9, 10, 0), '#e2a43f');
    for (let k = 0; k < 4; k++) sb.add(Shape.box(4, 3, 5), T(2 + k * 4.5, 5, 0), ['#e2453f', '#3f8fd8', '#f2c14e', '#4fb07a'][k]);
    const m = sb.build('shipMesh' + i, scene, mat, s);
    m.isPickable = false;
    s.position.set(-400 + i * 350, 0, -520 + i * 140);
    s.rotation.y = Math.PI / 2;
    ships.push(s);
  }
  mat.setFloat('haze', 0.55);
  return { rotors, ships, mat };
}
