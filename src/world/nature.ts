import { Color3, Matrix, Mesh, Quaternion, StandardMaterial, Vector3, VertexData } from '../babylon';
import { Batch, Shape, T, col } from './geo';
import { WorldCtx } from './ctx';
import { WindPlugin } from './materials';
import { fbm, rng, valueNoise, smoothstep, clamp, distToPolyline } from '../core/noise';
import { HOUSES, TREE_AVOID, STREAM, BUNDLES, PATHS, WORKSHOP, COTTAGE, LIGHTHOUSE } from './layout';
import { QualitySettings } from '../core/quality';

const LEAF_PALETTES: [string, string][] = [
  ['#3f9a43', '#8ed65a'],
  ['#2f8a4a', '#76c95e'],
  ['#4ea33a', '#b5dc5c'],
  ['#5aa84a', '#c6e070'],
  ['#3a8f5a', '#86d08a'],
];

function blobVD(r: number, seed: number, sub = 3) {
  const vd = Shape.ico(r, sub);
  const p = vd.positions!;
  const n = vd.normals!;
  for (let i = 0; i < p.length; i += 3) {
    const nx = p[i] / r;
    const ny = p[i + 1] / r;
    const nz = p[i + 2] / r;
    const d = 1 + (valueNoise(nx * 2.2 + seed, ny * 2.2 + nz * 1.7 + seed * 0.37) - 0.5) * 0.36;
    p[i] *= d;
    p[i + 1] *= d;
    p[i + 2] *= d;
  }
  VertexData.ComputeNormals(p, vd.indices!, n);
  return vd;
}

export function addRoundTree(ctx: WorldCtx, x: number, z: number, s: number, seed: number, castCollider = true) {
  const rnd = rng(seed);
  const y = ctx.terrain.sample(x, z) - 0.2;
  const yaw = rnd() * Math.PI * 2;
  const h = (2.1 + rnd() * 1.2) * s;
  const bend = (rnd() - 0.5) * 0.6 * s;
  const path: Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    path.push(new Vector3(bend * t * t, t * h, bend * 0.5 * t * t));
  }
  const tr = 0.24 * s;
  const props = ctx.props.at(x, z);
  props.add(Shape.tube(path, (i) => tr * (1.25 - (i / 6) * 0.55), 8), T(x, y, z, 0, yaw), '#8b5e3c', { ao: 0.35, noise: 0.1 });
  props.add(Shape.cyl(0.5 * s, tr * 1.6, tr * 2.6, 8), T(x, y + 0.2 * s, z, 0, yaw), '#7a5034', { ao: 0.4 });
  // a couple of branches
  for (let b = 0; b < 2; b++) {
    const a = yaw + b * Math.PI + rnd();
    const bh = h * (0.55 + rnd() * 0.2);
    const bp = [new Vector3(0, bh, 0), new Vector3(Math.cos(a) * 0.9 * s, bh + 0.7 * s, Math.sin(a) * 0.9 * s)];
    props.add(Shape.tube(bp, tr * 0.42, 6), T(x, y, z, 0, yaw), '#8b5e3c', { ao: 0.2 });
  }
  const [dark, light] = LEAF_PALETTES[Math.floor(rnd() * LEAF_PALETTES.length)];
  const fol = ctx.foliage.at(x, z);
  const top = new Vector3(bend, h, bend * 0.5);
  const blobs = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2 + rnd();
    const rr = (k === 0 ? 0 : 0.85 + rnd() * 0.5) * s;
    const br = (k === 0 ? 1.55 : 1.0 + rnd() * 0.45) * s;
    const cx = top.x + Math.cos(a) * rr;
    const cz = top.z + Math.sin(a) * rr;
    const cy = top.y + (k === 0 ? 0.9 * s : rnd() * 0.9 * s);
    fol.add(blobVD(br, seed * 7 + k), T(x + cx, y + cy, z + cz, 0, rnd() * 6, 0, 1, 0.86, 1), dark, {
      top: light,
      ao: 0.25,
      sway: 0.55,
      noise: 0.12,
    });
  }
  // occasional apples / blossom
  if (rnd() < 0.25) {
    const fruit = rnd() < 0.5 ? '#e8423c' : '#ffb3c8';
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const e = rnd() * 0.9 - 0.2;
      const R = 1.55 * s * 1.02;
      fol.add(Shape.sphere(0.2 * s, 6), T(x + top.x + Math.cos(a) * Math.cos(e) * R, y + top.y + 0.9 * s + Math.sin(e) * R * 0.86, z + top.z + Math.sin(a) * Math.cos(e) * R), fruit, { sway: 0.6 });
    }
  }
  if (castCollider) ctx.col.addCircle({ x, z, r: 0.45 * s });
}

export function addPine(ctx: WorldCtx, x: number, z: number, s: number, seed: number, collide = true) {
  const rnd = rng(seed);
  const y = ctx.terrain.sample(x, z) - 0.2;
  const h = (4 + rnd() * 2) * s;
  ctx.props.at(x, z).add(Shape.cyl(h * 0.5, 0.16 * s, 0.32 * s, 7), T(x, y + h * 0.25, z), '#6e4a33', { ao: 0.3 });
  const fol = ctx.foliage.at(x, z);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const w = (2.6 - t * 1.7) * s;
    const ch = (1.9 - t * 0.5) * s;
    fol.add(Shape.cone(ch, w, 9), T(x, y + h * 0.28 + t * h * 0.62 + ch / 2, z, 0, rnd() * 3), '#2c7a4c', {
      top: '#5aa860',
      ao: 0.4,
      sway: 0.25,
      noise: 0.1,
    });
  }
  if (collide) ctx.col.addCircle({ x, z, r: 0.4 * s });
}

export function addBush(ctx: WorldCtx, x: number, z: number, s: number, seed: number, flowers = false) {
  const rnd = rng(seed);
  const y = ctx.terrain.sample(x, z) - 0.1;
  const fol = ctx.foliage.at(x, z);
  const [dark, light] = LEAF_PALETTES[Math.floor(rnd() * LEAF_PALETTES.length)];
  const n = 2 + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28;
    const r = (0.5 + rnd() * 0.35) * s;
    fol.add(blobVD(r, seed + k, 2), T(x + Math.cos(a) * 0.4 * s, y + r * 0.6, z + Math.sin(a) * 0.4 * s, 0, 0, 0, 1, 0.8, 1), dark, {
      top: light,
      ao: 0.4,
      sway: 0.15,
    });
  }
  if (flowers) {
    const fc = ['#ff6f91', '#ffd24a', '#ffffff', '#b98cff'][Math.floor(rnd() * 4)];
    for (let k = 0; k < 6; k++) {
      const a = rnd() * 6.28;
      const r = 0.55 * s;
      fol.add(Shape.sphere(0.13 * s, 5), T(x + Math.cos(a) * r, y + 0.45 * s + rnd() * 0.35 * s, z + Math.sin(a) * r), fc, { sway: 0.2 });
    }
  }
}

export function addRock(ctx: WorldCtx, x: number, z: number, s: number, seed: number, collide = true, color = '#a29a92', sink = 0.25) {
  const rnd = rng(seed);
  const y = ctx.terrain.sample(x, z) - s * sink;
  const c = Color3.FromHexString(color).scale(0.88 + rnd() * 0.22);
  ctx.props.at(x, z).add(Shape.rock(s, seed, 0.62 + rnd() * 0.3, 1), T(x, y, z, 0, rnd() * 6), c, { flat: true, ao: 0.35, top: c.scale(1.12) });
  if (collide && s > 0.7) ctx.col.addCircle({ x, z, r: s * 0.85, top: y + s * 0.9 });
}

function grassBlades(): VertexData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const blades = 7;
  const rnd = rng(42);
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.14;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = 0.32 + rnd() * 0.3;
    const lean = (rnd() - 0.5) * 0.25;
    const w = 0.05 + rnd() * 0.03;
    const ox = Math.cos(a + 1.57) * w;
    const oz = Math.sin(a + 1.57) * w;
    const s = pos.length / 3;
    pos.push(bx - ox, 0, bz - oz, bx + ox, 0, bz + oz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    for (let k = 0; k < 3; k++) nrm.push(0, 1, 0);
    colr.push(0.24, 0.5, 0.2, 0, 0.24, 0.5, 0.2, 0, 0.62, 0.85, 0.38, 1);
    idx.push(s, s + 1, s + 2);
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nrm;
  vd.colors = colr;
  vd.indices = idx;
  return vd;
}

function flowerVD(petal: string): VertexData {
  const b = new Batch();
  b.add(Shape.cyl(0.42, 0.025, 0.03, 4, false), T(0, 0.21, 0), '#4f9a3c', { sway: 0.6 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    b.add(Shape.ellipsoid(0.12, 0.04, 0.08, 5), T(Math.cos(a) * 0.06, 0.44, Math.sin(a) * 0.06, 0, -a, 0), petal, { sway: 1 });
  }
  b.add(Shape.sphere(0.06, 5), T(0, 0.46, 0), '#ffcf3a', { sway: 1 });
  // alpha from batch already encodes sway*height-fraction; force top weight
  for (let i = 3; i < b.c.length; i += 4) b.c[i] = Math.min(1, b.c[i] + (b.p[((i - 3) / 4) * 3 + 1] > 0.3 ? 0.6 : 0));
  return b.toVertexData();
}

/** Grass tufts and flowers as thin instances (single draw call each). */
export function scatterGroundCover(ctx: WorldCtx) {
  const { scene, terrain } = ctx;
  const density = QualitySettings[ctx.quality].grass;
  const grassMat = new StandardMaterial('grassMat', scene);
  grassMat.diffuseColor = Color3.White();
  grassMat.specularColor = Color3.Black();
  grassMat.backFaceCulling = false;
  new WindPlugin(grassMat);

  const grass = new Mesh('grass', scene);
  grassBlades().applyToMesh(grass);
  grass.material = grassMat;
  grass.isPickable = false;
  grass.receiveShadows = true;
  const rnd = rng(1234);
  const mats: number[] = [];
  const flowerMats: number[][] = [[], [], [], []];
  const target = Math.floor(11000 * density);
  const m = new Matrix();
  let tries = 0;
  let count = 0;
  while (count < target && tries < target * 8) {
    tries++;
    const x = -62 + rnd() * 178;
    const z = -60 + rnd() * 160;
    const h = terrain.sample(x, z);
    if (h < 1.5) continue;
    const n = terrain.normalAt(x, z);
    if (n.y < 0.84) continue;
    const pd = terrain.pathDistance(x, z);
    if (pd < 1.7) continue;
    const st = terrain.streamInfo(x, z);
    if (st.d < st.width + 1.2) continue;
    // clumpy distribution
    const cl = fbm(x * 0.08, z * 0.08, 2);
    if (rnd() > smoothstep(0.3, 0.6, cl) + 0.15) continue;
    if (insideHouse(x, z)) continue;
    if (Math.hypot(x - WORKSHOP.x, z - WORKSHOP.z) < 8.5 || Math.hypot(x - COTTAGE.x, z - COTTAGE.z) < 5.5 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 6.5) continue;
    const s = 0.7 + rnd() * 0.8;
    const yaw = rnd() * 6.28;
    Matrix.ComposeToRef(new Vector3(s, s * (0.8 + rnd() * 0.5), s), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(x, h - 0.03, z), m);
    // flowers in meadows
    if (rnd() < 0.08 + smoothstep(0.55, 0.75, fbm(x * 0.013 + 40, z * 0.013, 2)) * 0.15) {
      const fi = Math.floor(rnd() * 4);
      const fm = new Matrix();
      Matrix.ComposeToRef(new Vector3(1, 0.8 + rnd() * 0.5, 1), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(x + 0.2, h - 0.02, z), fm);
      flowerMats[fi].push(...fm.asArray());
    }
    mats.push(...m.asArray());
    count++;
  }
  grass.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16, true);
  grass.alwaysSelectAsActiveMesh = true;

  const colors = ['#ff5d7a', '#ffd23f', '#ffffff', '#a98bff'];
  const flowers: Mesh[] = [];
  colors.forEach((c, i) => {
    if (!flowerMats[i].length) return;
    const f = new Mesh('flowers' + i, scene);
    flowerVD(c).applyToMesh(f);
    f.material = ctx.mats.vcFoliage;
    f.isPickable = false;
    f.thinInstanceSetBuffer('matrix', new Float32Array(flowerMats[i]), 16, true);
    f.alwaysSelectAsActiveMesh = true;
    flowers.push(f);
  });
  return { grass, flowers };
}

function insideHouse(x: number, z: number) {
  for (const h of HOUSES) if (Math.abs(x - h.x) < h.w * 0.62 + 0.6 && Math.abs(z - h.z) < h.d * 0.62 + 0.6) return true;
  return false;
}

function avoid(x: number, z: number, extra = 0) {
  for (const a of TREE_AVOID) if (Math.hypot(x - a.x, z - a.z) < a.r + extra) return true;
  for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) * 0.8 + 2 + extra) return true;
  for (const b of BUNDLES) if (Math.hypot(x - b.x, z - b.z) < 4) return true;
  return false;
}

export function populateNature(ctx: WorldCtx) {
  const { terrain } = ctx;
  const rnd = rng(99);
  // ---------------- deciduous trees on the walkable island
  let placed = 0;
  const treeSpots: [number, number][] = [];
  for (let i = 0; i < 2600 && placed < 170; i++) {
    const x = -60 + rnd() * 172;
    const z = -48 + rnd() * 140;
    const h = terrain.sample(x, z);
    if (h < 2.0) continue;
    if (terrain.normalAt(x, z).y < 0.86) continue;
    if (terrain.pathDistance(x, z) < 4.2) continue;
    const st = terrain.streamInfo(x, z);
    if (st.d < st.width + 3.2) continue;
    if (avoid(x, z)) continue;
    const dens = fbm(x * 0.03 + 7, z * 0.03 - 3, 3);
    if (rnd() > smoothstep(0.42, 0.62, dens) * 0.9 + 0.05) continue;
    let ok = true;
    for (const [tx, tz] of treeSpots) if ((tx - x) ** 2 + (tz - z) ** 2 < 20) ok = false;
    if (!ok) continue;
    treeSpots.push([x, z]);
    const s = 0.85 + rnd() * 0.5;
    if (z > 40 && rnd() < 0.35) addPine(ctx, x, z, s * 0.9, i + 500);
    else addRoundTree(ctx, x, z, s, i + 1);
    placed++;
  }
  // a few hero trees near paths for framing
  const hero: [number, number, number][] = [
    [-9, -18, 1.35],
    [12, -14, 1.2],
    [-14, 26, 1.3],
    [8, 32, 1.1],
    [-38, -24, 1.25],
    [44, -30, 1.15],
    [30, 22, 1.25],
    [-40, 8.5 + 14, 1.2],
    [26, -16 + 4.5, 1.3],
  ];
  hero.forEach(([x, z, s], i) => addRoundTree(ctx, x, z, s, 3000 + i));

  // ---------------- pine forest on the western mountains (non-walkable backdrop)
  for (let i = 0; i < 900; i++) {
    const x = -104 + rnd() * 44;
    const z = -60 + rnd() * 140;
    const h = terrain.sample(x, z);
    if (h < 3 || h > 30) continue;
    if (terrain.landFrac(x, z) < 0.95) continue;
    if (terrain.normalAt(x, z).y < 0.6) continue;
    const st = terrain.streamInfo(x, z);
    if (st.d < st.width + 2) continue;
    if (rnd() > 0.55) continue;
    addPine(ctx, x, z, 0.9 + rnd() * 0.7, 9000 + i, x > -68);
  }

  // ---------------- bushes
  for (let i = 0; i < 700; i++) {
    const x = -60 + rnd() * 170;
    const z = -50 + rnd() * 140;
    const h = terrain.sample(x, z);
    if (h < 1.8) continue;
    if (terrain.normalAt(x, z).y < 0.85) continue;
    const pd = terrain.pathDistance(x, z);
    if (pd < 2.4) continue;
    const st = terrain.streamInfo(x, z);
    if (st.d < st.width + 1.6) continue;
    if (avoid(x, z, -2)) continue;
    if (rnd() > 0.45) continue;
    addBush(ctx, x, z, 0.8 + rnd() * 0.6, 5000 + i, rnd() < 0.35);
  }

  // ---------------- rocks: scattered and along the coasts
  for (let i = 0; i < 260; i++) {
    const x = -62 + rnd() * 180;
    const z = -60 + rnd() * 160;
    const h = terrain.sample(x, z);
    if (h < 1.6) continue;
    if (terrain.pathDistance(x, z) < 2.5) continue;
    if (avoid(x, z)) continue;
    const st = terrain.streamInfo(x, z);
    if (st.d < st.width + 1) continue;
    if (rnd() > 0.4) continue;
    addRock(ctx, x, z, 0.4 + rnd() * 0.8, 700 + i);
  }
  // coastline boulders
  for (let i = 0; i < 1600; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 0.9 + rnd() * 0.12;
    const { cx, cz, rx, rz } = { cx: 5, cz: 6, rx: 112, rz: 86 };
    const x = cx + Math.cos(a) * rx * rr;
    const z = cz + Math.sin(a) * rz * rr;
    const h = terrain.sample(x, z);
    if (h < -1.2 || h > 6) continue;
    const lf = terrain.landFrac(x, z);
    if (lf > 0.85 || lf < 0.02) continue;
    // keep the harbour beach and jetty clear
    if (x > -28 && x < 50 && z < -50) continue;
    const rough = z > 20 || x > 80 || x < -50;
    if (!rough && rnd() > 0.25) continue;
    if (rnd() > 0.5) continue;
    addRock(ctx, x, z, 0.7 + rnd() * 1.9, 1700 + i, true, rnd() < 0.5 ? '#9b948c' : '#8a8580', 0.35);
  }
  // headland rocks around the lighthouse
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 11 + rnd() * 9;
    const x = 62 + Math.cos(a) * r;
    const z = 88 + Math.sin(a) * r;
    if (terrain.pathDistance(x, z) < 3) continue;
    if (Math.hypot(x - 51, z - 82) < 8) continue;
    addRock(ctx, x, z, 0.8 + rnd() * 1.6, 2900 + i, true, '#9c9590', 0.3);
  }

  // ---------------- reeds along the stream
  const det = ctx.foliage;
  for (let i = 0; i < 700; i++) {
    const k = Math.floor(rnd() * (STREAM.length - 1));
    const [ax, az] = STREAM[k];
    const [bx, bz] = STREAM[k + 1];
    const t = rnd();
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const st = terrain.streamInfo(px, pz);
    const tx = bx - ax;
    const tz = bz - az;
    const l = Math.hypot(tx, tz) || 1;
    const side = rnd() < 0.5 ? -1 : 1;
    const off = st.width + 0.2 + rnd() * 1.4;
    const x = px + (-tz / l) * off * side;
    const z = pz + (tx / l) * off * side;
    if (Math.abs(x) < 9 && Math.abs(z) < 12) continue; // bridge area clear
    if (Math.hypot(x + 27, z - 7) < 6) continue; // water wheel
    if (x < -64) continue;
    if (rnd() > 0.5) continue;
    const y = terrain.sample(x, z);
    const b = det.at(x, z);
    const n = 3 + Math.floor(rnd() * 3);
    for (let r = 0; r < n; r++) {
      const ox = (rnd() - 0.5) * 0.6;
      const oz = (rnd() - 0.5) * 0.6;
      const hh = 0.9 + rnd() * 0.8;
      b.add(Shape.cyl(hh, 0.03, 0.06, 4, false), T(x + ox, y + hh / 2, z + oz, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2), '#5c9a3e', { top: '#9ccf5a', sway: 0.7 });
      if (rnd() < 0.5) b.add(Shape.capsule(0.28, 0.05, 5), T(x + ox, y + hh, z + oz), '#7a4a2a', { sway: 1 });
    }
  }
  // lily pads on calm parts of the stream
  for (let i = 0; i < 40; i++) {
    const k = Math.floor(rnd() * (STREAM.length - 1));
    const [ax, az] = STREAM[k];
    if (ax < -60 || Math.abs(ax) < 10) continue;
    const st = terrain.streamInfo(ax, az);
    const x = ax + (rnd() - 0.5) * st.width;
    const z = az + (rnd() - 0.5) * st.width;
    const s2 = terrain.streamInfo(x, z);
    if (s2.d > s2.width * 0.8) continue;
    ctx.detail.at(x, z).add(Shape.cyl(0.04, 0.7 + rnd() * 0.4, 0.7, 10), T(x, s2.surface + 0.03, z), '#4f9a3c', { top: '#6fc04a' });
    if (rnd() < 0.3) ctx.detail.at(x, z).add(Shape.sphere(0.2, 6), T(x, s2.surface + 0.12, z), '#ffc2e0');
  }
}

/** Simple wooden fence along a polyline (posts + two rails). */
export function addFence(ctx: WorldCtx, pts: [number, number][], color = '#c79a6a') {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ctx.terrain.sample(x, z);
      ctx.props.at(x, z).add(Shape.rbox(0.16, 1.1, 0.16, 0.04, 1), T(x, y + 0.45, z), color, { ao: 0.4 });
      if (k < n) {
        const x2 = ax + (bx - ax) * ((k + 1) / n);
        const z2 = az + (bz - az) * ((k + 1) / n);
        const y2 = ctx.terrain.sample(x2, z2);
        const mx = (x + x2) / 2;
        const mz = (z + z2) / 2;
        const seg = Math.hypot(x2 - x, z2 - z);
        const yaw = Math.atan2(x2 - x, z2 - z);
        const pitch = -Math.atan2(y2 - y, seg);
        for (const hh of [0.45, 0.85]) {
          ctx.props.at(mx, mz).add(Shape.rbox(0.08, 0.12, seg, 0.03, 1), T(mx, (y + y2) / 2 + hh, mz, pitch, yaw), color, { noise: 0.1 });
        }
      }
    }
  }
  // collision along the fence
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    ctx.col.addBox({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: 0.12, hd: len / 2, yaw: Math.atan2(bx - ax, bz - az) });
  }
}

