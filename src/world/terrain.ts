import { Color3, DynamicTexture, Mesh, RawTexture, Scene, StandardMaterial, Texture, VertexData, Constants } from '@babylonjs/core';
import { clamp, distToPolyline, fbm, hash2, lerp, smoothstep, valueNoise } from '../core/noise';
import {
  BRIDGE,
  COTTAGE,
  HOUSES,
  ISLAND,
  LIGHTHOUSE,
  PATHS,
  QUAY,
  STREAM,
  TURBINE,
  VILLAGE_SQUARE,
  WORKSHOP,
  JETTY,
  P2,
} from './layout';

interface Pad {
  x: number;
  z: number;
  r: number;
  blend: number;
  h: number;
  /** rectangular half extents (optional) */
  hw?: number;
  hd?: number;
  yaw?: number;
}

const table = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return lerp(pts[i][1], pts[i + 1][1], t);
    }
  }
  return pts[pts.length - 1][1];
};

const SURF: [number, number][] = [
  [-76, 3.8],
  [-46, 3.0],
  [-30, 2.55],
  [0, 1.85],
  [40, 1.15],
  [80, 0.5],
  [100, 0.18],
  [124, -0.05],
];
const WIDTH: [number, number][] = [
  [-76, 1.6],
  [-46, 2.3],
  [-30, 2.7],
  [0, 3.0],
  [60, 3.5],
  [100, 4.6],
  [124, 7],
];

export type Surface = 'grass' | 'sand' | 'path' | 'stone' | 'wood' | 'water';

export class Terrain {
  readonly minX = -165;
  readonly minZ = -135;
  readonly sizeX = 335;
  readonly sizeZ = 295;
  readonly cell: number;
  readonly nx: number;
  readonly nz: number;
  heights!: Float32Array;
  pads: Pad[] = [];
  mesh!: Mesh;

  constructor(cell = 1.5) {
    this.cell = cell;
    this.nx = Math.round(this.sizeX / cell) + 1;
    this.nz = Math.round(this.sizeZ / cell) + 1;
    this.setupPads();
    this.heights = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        this.heights[j * this.nx + i] = this.height(this.minX + i * cell, this.minZ + j * cell);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Height model
  // --------------------------------------------------------------------------
  islandR(x: number, z: number) {
    const dx = (x - ISLAND.cx) / ISLAND.rx;
    const dz = (z - ISLAND.cz) / ISLAND.rz;
    let r = Math.sqrt(dx * dx + dz * dz);
    const a = Math.atan2(dz, dx);
    r += (valueNoise(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10) - 0.5) * 0.12;
    r += (valueNoise(x * 0.05, z * 0.05) - 0.5) * 0.05;
    // harbour bay (south)
    r += 0.34 * Math.exp(-(((x - 12) / 36) ** 2) - ((z + 78) / 21) ** 2);
    // small cove on the west of the village
    r += 0.12 * Math.exp(-(((x + 50) / 16) ** 2) - ((z + 62) / 12) ** 2);
    // lighthouse headland (north-east)
    r -= 0.22 * Math.exp(-(((x - LIGHTHOUSE.x) / 22) ** 2) - ((z - LIGHTHOUSE.z) / 18) ** 2);
    // eastern point
    r -= 0.08 * Math.exp(-(((x - 110) / 16) ** 2) - ((z + 30) / 18) ** 2);
    return r;
  }

  landFrac(x: number, z: number) {
    return smoothstep(0.985, 0.885, this.islandR(x, z));
  }

  streamInfo(x: number, z: number) {
    const q = distToPolyline(x, z, STREAM);
    // closest point x for the profile tables
    const a = STREAM[q.seg];
    const b = STREAM[q.seg + 1];
    const cx = a[0] + (b[0] - a[0]) * q.t;
    return { d: q.d, s: q.s, surface: table(SURF, cx), width: table(WIDTH, cx), cx };
  }

  naturalHeight(x: number, z: number) {
    const r = this.islandR(x, z);
    const land = smoothstep(0.985, 0.885, r);
    const n1 = fbm(x * 0.022 + 3.1, z * 0.022 - 1.7, 4);
    const n2 = fbm(x * 0.07, z * 0.07, 3);
    let h = 1.7;
    h += 5.2 * smoothstep(-14, 34, z); // north plateau
    h += (n1 - 0.5) * 6.0;
    h += (n2 - 0.5) * 0.9;
    // keep the village and harbour gentle
    const village = Math.exp(-(((x - 3) / 48) ** 2) - ((z + 42) / 16) ** 2);
    h = lerp(h, 1.9 + (z + 56) * 0.06, village * 0.85);
    // turbine hill
    h += 8.5 * Math.exp(-(((x - TURBINE.x) / 19) ** 2) - ((z - TURBINE.z) / 17) ** 2);
    // lighthouse headland
    h += 2.5 * Math.exp(-(((x - LIGHTHOUSE.x) / 14) ** 2) - ((z - LIGHTHOUSE.z) / 14) ** 2);
    // western ridge (impassable mountains)
    const ridge = smoothstep(-58, -84, x);
    h += ridge * (24 + (fbm(x * 0.04, z * 0.04, 4) - 0.5) * 22);
    // northern cliffs a bit taller
    h += 2.5 * smoothstep(40, 80, z);
    h = Math.max(h, 0.95);
    const seaFloor = -1.4 - 11 * clamp((r - 0.97) * 3.5, 0, 1);
    return lerp(seaFloor, h, land);
  }

  private setupPads() {
    const add = (p: Omit<Pad, 'h'> & { h?: number }) => {
      const h = p.h ?? this.carvedHeight(p.x, p.z);
      this.pads.push({ ...p, h });
    };
    for (const hdef of HOUSES) add({ x: hdef.x, z: hdef.z, r: Math.max(hdef.w, hdef.d) * 0.62, blend: 5 });
    add({ x: VILLAGE_SQUARE[0], z: VILLAGE_SQUARE[1], r: 8, blend: 6 });
    add({ x: WORKSHOP.x, z: WORKSHOP.z, r: 8.5, blend: 6 });
    add({ x: COTTAGE.x, z: COTTAGE.z, r: 6.5, blend: 5 });
    add({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 6.5, blend: 5 });
    add({ x: TURBINE.x, z: TURBINE.z, r: 4.5, blend: 5 });
    add({ x: BRIDGE.x, z: -BRIDGE.halfLen - 1.2, r: 3.6, blend: 3.2, h: BRIDGE.bankY });
    add({ x: BRIDGE.x, z: BRIDGE.halfLen + 1.2, r: 3.6, blend: 3.2, h: BRIDGE.bankY });
    // quay behind the harbour wall
    add({ x: (QUAY.x0 + QUAY.x1) / 2, z: QUAY.z + 3.5, r: 0, blend: 1.6, hw: (QUAY.x1 - QUAY.x0) / 2, hd: 3.4, h: 1.55 });
    add({ x: JETTY.x, z: JETTY.z0 + 2, r: 3, blend: 3, h: 1.45 });
  }

  /** natural height plus stream channel */
  carvedHeight(x: number, z: number) {
    let h = this.naturalHeight(x, z);
    const st = this.streamInfo(x, z);
    if (st.d < st.width + 12) {
      const W = st.width;
      const S = st.surface;
      let hc: number;
      if (st.d < W) hc = S - 0.35 - 1.25 * (1 - (st.d / W) ** 2);
      else hc = S - 0.35 + (st.d - W) * 1.15;
      const land = this.landFrac(x, z);
      h = Math.min(h, hc);
      // levee keeps water contained where the land is low
      if (land > 0.6 && st.d >= W * 0.85 && st.d < W + 4) {
        const lev = S + 0.45 - Math.max(0, st.d - W - 1.5) * 0.6;
        h = Math.max(h, Math.min(lev, S + 0.45));
      }
    }
    return h;
  }

  height(x: number, z: number) {
    let h = this.carvedHeight(x, z);
    for (const p of this.pads) {
      let d: number;
      if (p.hw !== undefined) {
        const dx = Math.max(0, Math.abs(x - p.x) - p.hw);
        const dz = Math.max(0, Math.abs(z - p.z) - (p.hd ?? 0));
        d = Math.hypot(dx, dz);
      } else d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.blend) {
        const w = 1 - smoothstep(p.r, p.r + p.blend, d);
        h = lerp(h, p.h, w);
      }
    }
    // re-cut the stream through any pads that spilled into it
    const st = this.streamInfo(x, z);
    if (st.d < st.width + 2) {
      const W = st.width;
      const S = st.surface;
      const hc = st.d < W ? S - 0.35 - 1.25 * (1 - (st.d / W) ** 2) : S - 0.35 + (st.d - W) * 1.15;
      h = Math.min(h, hc);
    }
    return h;
  }

  /** Height of the rendered (triangulated) terrain at x,z. */
  sample(x: number, z: number) {
    const fx = (x - this.minX) / this.cell;
    const fz = (z - this.minZ) / this.cell;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return -12;
    const tx = fx - i;
    const tz = fz - j;
    const H = this.heights;
    const n = this.nx;
    const h00 = H[j * n + i];
    const h10 = H[j * n + i + 1];
    const h01 = H[(j + 1) * n + i];
    const h11 = H[(j + 1) * n + i + 1];
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  normalAt(x: number, z: number) {
    const e = 0.8;
    const hx = this.sample(x + e, z) - this.sample(x - e, z);
    const hz = this.sample(x, z + e) - this.sample(x, z - e);
    const nx = -hx;
    const ny = 2 * e;
    const nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  /** Water surface level at a point (sea = 0, stream = profile), or -Infinity if none. */
  waterSurface(x: number, z: number) {
    const st = this.streamInfo(x, z);
    if (st.d < st.width + 0.4) return Math.max(0, st.surface);
    return 0;
  }

  pathDistance(x: number, z: number) {
    let best = Infinity;
    for (const p of PATHS) {
      const d = distToPolyline(x, z, p).d;
      if (d < best) best = d;
    }
    return best;
  }

  surfaceAt(x: number, z: number): Surface {
    const h = this.sample(x, z);
    if (h < this.waterSurface(x, z) - 0.05) return 'water';
    if (this.pathDistance(x, z) < 1.8) return z < -26 && z > -60 ? 'stone' : 'path';
    if (h < 1.25 && this.landFrac(x, z) < 0.97) return 'sand';
    const n = this.normalAt(x, z);
    if (n.y < 0.72) return 'stone';
    return 'grass';
  }

  // --------------------------------------------------------------------------
  // Mesh
  // --------------------------------------------------------------------------
  build(scene: Scene): Mesh {
    const { nx, nz, cell } = this;
    const positions = new Float32Array(nx * nz * 3);
    const uvs = new Float32Array(nx * nz * 2);
    const colors = new Float32Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = this.minX + i * cell;
        const z = this.minZ + j * cell;
        positions[k * 3] = x;
        positions[k * 3 + 1] = this.heights[k];
        positions[k * 3 + 2] = z;
        uvs[k * 2] = x / 7;
        uvs[k * 2 + 1] = z / 7;
      }
    }
    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // tris (a,b,d) and (a,d,c) -> matches sample()
        indices[q++] = a;
        indices[q++] = b;
        indices[q++] = d;
        indices[q++] = a;
        indices[q++] = d;
        indices[q++] = c;
      }
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    // colours
    const sand = Color3.FromHexString('#efd9a4');
    const wetSand = Color3.FromHexString('#cdb27c');
    const underwater = Color3.FromHexString('#b59d70');
    const g1 = Color3.FromHexString('#7cc95a');
    const g2 = Color3.FromHexString('#4ea845');
    const g3 = Color3.FromHexString('#a8d468');
    const meadowYellow = Color3.FromHexString('#c9d870');
    const rock = Color3.FromHexString('#9a918a');
    const rockWarm = Color3.FromHexString('#b39f8c');
    const rockDark = Color3.FromHexString('#7a736e');
    const path = Color3.FromHexString('#dcc08f');
    const cobble = Color3.FromHexString('#c9bba5');
    const mud = Color3.FromHexString('#8f7a5c');
    const tmp = new Color3();
    for (let k = 0; k < nx * nz; k++) {
      const x = positions[k * 3];
      const h = positions[k * 3 + 1];
      const z = positions[k * 3 + 2];
      const ny = normals[k * 3 + 1];
      const slope = 1 - ny;
      const land = this.landFrac(x, z);
      const n = fbm(x * 0.05, z * 0.05, 3);
      const n2 = valueNoise(x * 0.3, z * 0.3);
      // grass
      Color3.LerpToRef(g2, g1, smoothstep(0.3, 0.7, n), tmp);
      if (n > 0.62) Color3.LerpToRef(tmp, g3, smoothstep(0.62, 0.8, n), tmp);
      const meadow = smoothstep(0.55, 0.75, fbm(x * 0.013 + 40, z * 0.013, 2));
      Color3.LerpToRef(tmp, meadowYellow, meadow * 0.35, tmp);
      let c = tmp.clone();
      // sand near the shore
      const sandAmt = 1 - smoothstep(0.9 + n2 * 0.4, 1.55 + n2 * 0.4, h);
      if (land < 0.999 || h < 1.6) c = Color3.Lerp(c, sand, sandAmt);
      if (h < 0.35) c = Color3.Lerp(c, wetSand, smoothstep(0.35, -0.1, h));
      if (h < -0.4) c = Color3.Lerp(c, underwater, smoothstep(-0.4, -2, h));
      // rock on steep slopes and mountain tops
      const rockAmt = smoothstep(0.24, 0.42, slope + (n2 - 0.5) * 0.12) + smoothstep(15, 24, h) * 0.6;
      if (rockAmt > 0) {
        const rc = Color3.Lerp(rockDark, n > 0.5 ? rockWarm : rock, n2);
        c = Color3.Lerp(c, rc, clamp(rockAmt, 0, 1));
      }
      // stream banks
      const st = this.streamInfo(x, z);
      if (st.d < st.width + 1.6) c = Color3.Lerp(c, mud, smoothstep(st.width + 1.6, st.width + 0.2, st.d) * 0.85);
      // paths
      const pd = this.pathDistance(x, z);
      if (pd < 2.6) {
        const inVillage = z < -26 && z > -60;
        const pc = inVillage ? cobble : path;
        const w = 1 - smoothstep(1.3 + n2 * 0.5, 2.5, pd);
        c = Color3.Lerp(c, pc.scale(0.92 + n2 * 0.14), w);
      }
      // village square
      const sq = Math.hypot(x - VILLAGE_SQUARE[0], z - VILLAGE_SQUARE[1]);
      if (sq < 9) c = Color3.Lerp(c, cobble.scale(0.95 + n2 * 0.1), 1 - smoothstep(6.5, 9, sq));
      // quay
      if (x > QUAY.x0 - 1 && x < QUAY.x1 + 1 && z > QUAY.z - 0.5 && z < QUAY.z + 5.2) c = Color3.Lerp(c, cobble, 0.9);
      // subtle hash variation per vertex
      const v = 0.94 + hash2(i32(x * 3), i32(z * 3)) * 0.1;
      colors[k * 4] = c.r * v;
      colors[k * 4 + 1] = c.g * v;
      colors[k * 4 + 2] = c.b * v;
      colors[k * 4 + 3] = 1;
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;
    vd.uvs = uvs;
    vd.colors = colors;
    const mesh = new Mesh('terrain', scene);
    vd.applyToMesh(mesh);
    const mat = new StandardMaterial('terrainMat', scene);
    mat.diffuseTexture = this.detailTexture(scene);
    mat.specularColor = new Color3(0.03, 0.03, 0.03);
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.mesh = mesh;
    return mesh;
  }

  private detailTexture(scene: Scene) {
    const size = 256;
    const tex = new DynamicTexture('terrainDetail', { width: size, height: size }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // tileable noise via wrapping
        const f = (u: number, v: number, s: number) => {
          const p = size / s;
          const xi = Math.floor(u / p);
          const yi = Math.floor(v / p);
          const xf = (u / p) % 1;
          const yf = (v / p) % 1;
          const h = (a: number, b: number) => hash2(((a % s) + s) % s, ((b % s) + s) % s);
          const sm = (t: number) => t * t * (3 - 2 * t);
          const a = h(xi, yi);
          const b = h(xi + 1, yi);
          const c = h(xi, yi + 1);
          const d = h(xi + 1, yi + 1);
          return lerp(lerp(a, b, sm(xf)), lerp(c, d, sm(xf)), sm(yf));
        };
        const v = f(x, y, 8) * 0.45 + f(x, y, 32) * 0.35 + hash2(x, y) * 0.2;
        const val = Math.round((0.84 + v * 0.18) * 255);
        const i = (y * size + x) * 4;
        img.data[i] = val;
        img.data[i + 1] = val;
        img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.update(true);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 4;
    return tex;
  }

  /** Depth texture for the water shader (R = depth below sea / 10). */
  depthTexture(scene: Scene) {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = this.minX + (i / (size - 1)) * this.sizeX;
        const z = this.minZ + (j / (size - 1)) * this.sizeZ;
        const h = this.sample(x, z);
        const d = clamp(-h / 10, 0, 1);
        const k = (j * size + i) * 4;
        data[k] = Math.round(d * 255);
        data[k + 1] = Math.round(clamp((h + 2) / 4, 0, 1) * 255);
        data[k + 2] = 0;
        data[k + 3] = 255;
      }
    }
    const tex = new RawTexture(data, size, size, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    return tex;
  }
}

const i32 = (v: number) => Math.floor(v) | 0;

export function polyPoint(pts: P2[], t: number): P2 {
  const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
  const f = t * (pts.length - 1) - i;
  return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
}
