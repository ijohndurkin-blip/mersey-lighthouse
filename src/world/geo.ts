import {
  Color3,
  CreateBoxVertexData,
  CreateCapsuleVertexData,
  CreateCylinderVertexData,
  CreateIcoSphereVertexData,
  CreateSphereVertexData,
  CreateTorusVertexData,
  CreateDiscVertexData,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  Vector3,
  VertexData,
  Material,
  TransformNode,
} from '@babylonjs/core';
import { hash2, rng } from '../core/noise';

export type Col = Color3 | string;
export const col = (c: Col): Color3 => (typeof c === 'string' ? Color3.FromHexString(c) : c);

// -----------------------------------------------------------------------------
// Transform helper
// -----------------------------------------------------------------------------
export function T(
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): Matrix {
  return Matrix.Compose(
    new Vector3(sx, sy, sz),
    Quaternion.RotationYawPitchRoll(ry, rx, rz),
    new Vector3(x, y, z),
  );
}

/** Matrix for a node placed at (x,y,z) with yaw, applied after a local matrix. */
export function place(local: Matrix, x: number, y: number, z: number, yaw = 0, s = 1): Matrix {
  return local.multiply(T(x, y, z, 0, yaw, 0, s));
}

// -----------------------------------------------------------------------------
// Primitive shape generators (all return local-space VertexData)
// -----------------------------------------------------------------------------
export const Shape = {
  box(w: number, h: number, d: number) {
    return CreateBoxVertexData({ width: w, height: h, depth: d });
  },
  /** Box with rounded edges. */
  rbox(w: number, h: number, d: number, r = 0.1, seg = 2) {
    return roundedBox(w, h, d, r, seg);
  },
  sphere(d: number, seg = 12) {
    return CreateSphereVertexData({ diameter: d, segments: seg });
  },
  ellipsoid(dx: number, dy: number, dz: number, seg = 12) {
    return CreateSphereVertexData({ diameterX: dx, diameterY: dy, diameterZ: dz, segments: seg });
  },
  hemi(d: number, seg = 12) {
    return CreateSphereVertexData({ diameter: d, segments: seg, slice: 0.5 });
  },
  cyl(h: number, dTop: number, dBot = dTop, tess = 16, cap = true) {
    return CreateCylinderVertexData({ height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess, cap: cap ? 3 : 0 });
  },
  cone(h: number, d: number, tess = 16) {
    return CreateCylinderVertexData({ height: h, diameterTop: 0, diameterBottom: d, tessellation: tess });
  },
  torus(d: number, thick: number, tess = 20) {
    return CreateTorusVertexData({ diameter: d, thickness: thick, tessellation: tess });
  },
  capsule(h: number, r: number, tess = 12) {
    return CreateCapsuleVertexData({ height: h, radius: r, tessellation: tess, subdivisions: 2, capSubdivisions: 5 });
  },
  ico(r: number, sub = 1) {
    return CreateIcoSphereVertexData({ radius: r, subdivisions: sub, flat: false });
  },
  disc(r: number, tess = 24) {
    return CreateDiscVertexData({ radius: r, tessellation: tess });
  },
  /** Lathe from profile points (radius, y), bottom to top. */
  lathe(profile: [number, number][], tess = 24, capTop = false, capBottom = false) {
    return latheVD(profile, tess, capTop, capBottom);
  },
  /** Tube following a 3D path with constant or per-point radius. */
  tube(path: Vector3[], radius: number | ((i: number) => number), tess = 8) {
    return tubeVD(path, radius, tess);
  },
  /** Extruded 2D polygon (x,y) along z with given depth (polygon must be convex or star-shaped around origin). */
  prism(poly: [number, number][], depth: number) {
    return prismVD(poly, depth);
  },
  /** Low-poly rock: displaced icosphere (flat shaded when added with flat:true). */
  rock(r: number, seed: number, squash = 0.7, sub = 1) {
    const vd = CreateIcoSphereVertexData({ radius: r, subdivisions: sub, flat: false });
    const p = vd.positions!;
    const rnd = rng(seed);
    const offs = new Map<string, number>();
    for (let i = 0; i < p.length; i += 3) {
      const k = `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
      let o = offs.get(k);
      if (o === undefined) {
        o = 0.75 + rnd() * 0.45;
        offs.set(k, o);
      }
      p[i] *= o;
      p[i + 1] *= o * squash;
      p[i + 2] *= o;
    }
    return vd;
  },
};

function roundedBox(w: number, h: number, d: number, r: number, seg: number): VertexData {
  const H = [w / 2, h / 2, d / 2];
  r = Math.min(r, H[0] * 0.999, H[1] * 0.999, H[2] * 0.999);
  const coords = (half: number) => {
    const out: number[] = [-half];
    for (let k = 1; k <= seg; k++) out.push(-half + r * (1 - Math.cos((k / seg) * Math.PI * 0.5)));
    if (half - r > -half + r + 1e-4) out.push(half - r);
    for (let k = seg - 1; k >= 1; k--) out.push(half - r * (1 - Math.cos((k / seg) * Math.PI * 0.5)));
    out.push(half);
    return out;
  };
  const cx = coords(H[0]);
  const cy = coords(H[1]);
  const cz = coords(H[2]);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const inner = [H[0] - r, H[1] - r, H[2] - r];
  const push = (g: number[]) => {
    const ix = Math.max(-inner[0], Math.min(inner[0], g[0]));
    const iy = Math.max(-inner[1], Math.min(inner[1], g[1]));
    const iz = Math.max(-inner[2], Math.min(inner[2], g[2]));
    let nx = g[0] - ix;
    let ny = g[1] - iy;
    let nz = g[2] - iz;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    positions.push(ix + nx * r, iy + ny * r, iz + nz * r);
    normals.push(nx, ny, nz);
  };
  // faces: axis a fixed at sign s, iterate over u,v axes
  const faces: [number, number, number, number][] = [
    [0, 1, 1, 2],
    [0, -1, 1, 2],
    [1, 1, 0, 2],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 0, 1],
  ];
  const lists = [cx, cy, cz];
  for (const [a, s, u, v] of faces) {
    const lu = lists[u];
    const lv = lists[v];
    const base = positions.length / 3;
    for (let j = 0; j < lv.length; j++) {
      for (let i = 0; i < lu.length; i++) {
        const g = [0, 0, 0];
        g[a] = s * H[a];
        g[u] = lu[i];
        g[v] = lv[j];
        push(g);
      }
    }
    const nu = lu.length;
    for (let j = 0; j < lv.length - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const i0 = base + j * nu + i;
        indices.push(i0, i0 + 1, i0 + nu + 1, i0, i0 + nu + 1, i0 + nu);
      }
    }
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  fixWinding(vd);
  return vd;
}

function latheVD(profile: [number, number][], tess: number, capTop: boolean, capBottom: boolean): VertexData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = profile.length;
  // profile normals (2D) from neighbours
  const pn: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(n - 1, i + 1)];
    const tr = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tr, ty) || 1;
    pn.push([ty / l, -tr / l]);
  }
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    for (let k = 0; k <= tess; k++) {
      const a = (k / tess) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(r * c, y, r * s);
      normals.push(pn[i][0] * c, pn[i][1], pn[i][0] * s);
    }
  }
  const row = tess + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < tess; k++) {
      const i0 = i * row + k;
      indices.push(i0, i0 + 1, i0 + row + 1, i0, i0 + row + 1, i0 + row);
    }
  }
  const cap = (idx: number, up: number) => {
    const [r, y] = profile[idx];
    if (r < 1e-4) return;
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, up, 0);
    const start = positions.length / 3;
    for (let k = 0; k <= tess; k++) {
      const a = (k / tess) * Math.PI * 2;
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
      normals.push(0, up, 0);
    }
    for (let k = 0; k < tess; k++) indices.push(center, start + k, start + k + 1);
  };
  if (capTop) cap(n - 1, 1);
  if (capBottom) cap(0, -1);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  fixWinding(vd);
  return vd;
}

function tubeVD(path: Vector3[], radius: number | ((i: number) => number), tess: number): VertexData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let prevN = new Vector3(0, 1, 0);
  for (let i = 0; i < path.length; i++) {
    const t = path[Math.min(path.length - 1, i + 1)].subtract(path[Math.max(0, i - 1)]).normalize();
    let nrm = Vector3.Cross(t, prevN);
    if (nrm.lengthSquared() < 1e-6) nrm = Vector3.Cross(t, new Vector3(1, 0, 0));
    nrm.normalize();
    const bin = Vector3.Cross(nrm, t).normalize();
    prevN = bin;
    const r = typeof radius === 'number' ? radius : radius(i);
    for (let k = 0; k <= tess; k++) {
      const a = (k / tess) * Math.PI * 2;
      const dir = nrm.scale(Math.cos(a)).add(bin.scale(Math.sin(a)));
      positions.push(path[i].x + dir.x * r, path[i].y + dir.y * r, path[i].z + dir.z * r);
      normals.push(dir.x, dir.y, dir.z);
    }
  }
  const row = tess + 1;
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < tess; k++) {
      const i0 = i * row + k;
      indices.push(i0, i0 + 1, i0 + row + 1, i0, i0 + row + 1, i0 + row);
    }
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  fixWinding(vd);
  return vd;
}

function prismVD(poly: [number, number][], depth: number): VertexData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = poly.length;
  const hz = depth / 2;
  // centroid
  let cx = 0;
  let cy = 0;
  for (const [x, y] of poly) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  for (const side of [1, -1]) {
    const c = positions.length / 3;
    positions.push(cx, cy, side * hz);
    normals.push(0, 0, side);
    for (const [x, y] of poly) {
      positions.push(x, y, side * hz);
      normals.push(0, 0, side);
    }
    for (let i = 0; i < n; i++) indices.push(c, c + 1 + i, c + 1 + ((i + 1) % n));
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // outward check
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - cy;
    if (mx * nx + my * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s = positions.length / 3;
    positions.push(a[0], a[1], hz, b[0], b[1], hz, b[0], b[1], -hz, a[0], a[1], -hz);
    for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  fixWinding(vd);
  return vd;
}

/** Ensure triangle winding agrees with vertex normals (Babylon left-handed convention). */
export function fixWinding(vd: VertexData) {
  const p = vd.positions!;
  const nr = vd.normals!;
  const idx = vd.indices!;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const ux = p[a] - p[b];
    const uy = p[a + 1] - p[b + 1];
    const uz = p[a + 2] - p[b + 2];
    const vx = p[c] - p[b];
    const vy = p[c + 1] - p[b + 1];
    const vz = p[c + 2] - p[b + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    const nx = nr[a] + nr[b] + nr[c];
    const ny = nr[a + 1] + nr[b + 1] + nr[c + 1];
    const nz = nr[a + 2] + nr[b + 2] + nr[c + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      const t = idx[f + 1];
      idx[f + 1] = idx[f + 2];
      idx[f + 2] = t;
    }
  }
}

/** Gear geometry: toothed annulus extruded along z (centred), pitch radius r. */
export function gearVD(r: number, teeth: number, thickness: number, holeR: number): VertexData {
  const toothH = 0.22 * Math.min(1, r * 1.2) + 0.06;
  const rootR = r - toothH * 0.5;
  const tipR = r + toothH * 0.5;
  const outline: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [rootR, a0 - step * 0.25],
      [tipR, a0 - step * 0.14],
      [tipR, a0 + step * 0.14],
      [rootR, a0 + step * 0.25],
    ];
    for (const [rr, a] of pts) outline.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const hz = thickness / 2;
  const n = outline.length;
  // faces: each outline vertex paired with an inner hole vertex at the same angle
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i < n; i++) {
      const [x, y] = outline[i];
      const a = Math.atan2(y, x);
      positions.push(x, y, side * hz);
      normals.push(0, 0, side);
      positions.push(Math.cos(a) * holeR, Math.sin(a) * holeR, side * hz);
      normals.push(0, 0, side);
    }
    for (let i = 0; i < n; i++) {
      const o0 = base + i * 2;
      const i0 = o0 + 1;
      const o1 = base + ((i + 1) % n) * 2;
      const i1 = o1 + 1;
      indices.push(o0, o1, i1, o0, i1, i0);
    }
  }
  // outer walls
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (mx * nx + my * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s = positions.length / 3;
    positions.push(a[0], a[1], hz, b[0], b[1], hz, b[0], b[1], -hz, a[0], a[1], -hz);
    for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  // hole wall (inward normals)
  const hs = 24;
  for (let i = 0; i < hs; i++) {
    const a0 = (i / hs) * Math.PI * 2;
    const a1 = ((i + 1) / hs) * Math.PI * 2;
    const s = positions.length / 3;
    const p0 = [Math.cos(a0) * holeR, Math.sin(a0) * holeR];
    const p1 = [Math.cos(a1) * holeR, Math.sin(a1) * holeR];
    positions.push(p0[0], p0[1], hz, p1[0], p1[1], hz, p1[0], p1[1], -hz, p0[0], p0[1], -hz);
    const am = (a0 + a1) / 2;
    for (let k = 0; k < 4; k++) normals.push(-Math.cos(am), -Math.sin(am), 0);
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  fixWinding(vd);
  return vd;
}

// -----------------------------------------------------------------------------
// Batch: accumulate transformed, vertex-coloured geometry into one mesh
// -----------------------------------------------------------------------------
export interface PaintOpts {
  /** Darken toward the local bottom (fake ambient occlusion), 0..1 */
  ao?: number;
  /** Random brightness variation per vertex, 0..1 */
  noise?: number;
  /** Colour at the top of the part (gradient from base at bottom) */
  top?: Col;
  /** Wind sway weight (stored in vertex alpha, scaled by local height) */
  sway?: number;
  /** Convert to flat shaded facets */
  flat?: boolean;
  /** Emissive-ish: brighten (colour multiplier) */
  mul?: number;
}

const tmpV = new Vector3();
const tmpN = new Vector3();

export class Batch {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  i: number[] = [];

  get vertexCount() {
    return this.p.length / 3;
  }

  add(vdIn: VertexData, m: Matrix, color: Col, o: PaintOpts = {}): this {
    const vd = o.flat ? flatten(vdIn) : vdIn;
    const pos = vd.positions!;
    const nrm = vd.normals!;
    const ind = vd.indices!;
    const base = this.p.length / 3;
    const c0 = col(color);
    const c1 = o.top ? col(o.top) : null;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 1; k < pos.length; k += 3) {
      if (pos[k] < minY) minY = pos[k];
      if (pos[k] > maxY) maxY = pos[k];
    }
    const hy = maxY - minY || 1;
    const ao = o.ao ?? 0;
    const noise = o.noise ?? 0;
    const sway = o.sway ?? 0;
    const mul = o.mul ?? 1;
    const det = m.determinant();
    for (let k = 0; k < pos.length; k += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(pos[k], pos[k + 1], pos[k + 2], m, tmpV);
      Vector3.TransformNormalFromFloatsToRef(nrm[k], nrm[k + 1], nrm[k + 2], m, tmpN);
      tmpN.normalize();
      this.p.push(tmpV.x, tmpV.y, tmpV.z);
      this.n.push(tmpN.x, tmpN.y, tmpN.z);
      const t = (pos[k + 1] - minY) / hy;
      let r = c0.r;
      let g = c0.g;
      let b = c0.b;
      if (c1) {
        r += (c1.r - r) * t;
        g += (c1.g - g) * t;
        b += (c1.b - b) * t;
      }
      let f = (1 - ao * (1 - t)) * mul;
      if (noise > 0) f *= 1 - noise * 0.5 + noise * hash2(tmpV.x * 7.1 + tmpV.y * 3.3, tmpV.z * 5.7 - tmpV.y * 2.1);
      this.c.push(r * f, g * f, b * f, sway * t);
    }
    if (det < 0) {
      for (let k = 0; k < ind.length; k += 3) this.i.push(base + ind[k], base + ind[k + 2], base + ind[k + 1]);
    } else {
      for (let k = 0; k < ind.length; k++) this.i.push(base + ind[k]);
    }
    return this;
  }

  /** Append another batch's data. */
  merge(other: Batch) {
    const base = this.p.length / 3;
    this.p.push(...other.p);
    this.n.push(...other.n);
    this.c.push(...other.c);
    for (const k of other.i) this.i.push(base + k);
  }

  toVertexData(): VertexData {
    const vd = new VertexData();
    vd.positions = this.p;
    vd.normals = this.n;
    vd.colors = this.c;
    vd.indices = this.i;
    return vd;
  }

  build(name: string, scene: Scene, mat: Material | null, parent?: TransformNode | null): Mesh {
    const mesh = new Mesh(name, scene);
    if (this.p.length) this.toVertexData().applyToMesh(mesh, false);
    mesh.hasVertexAlpha = false;
    mesh.material = mat;
    if (parent) mesh.parent = parent;
    return mesh;
  }
}

/** Convert indexed geometry to flat shaded (unique vertices per face, face normals). */
export function flatten(vd: VertexData): VertexData {
  const p = vd.positions!;
  const idx = vd.indices!;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const ux = p[a] - p[b];
    const uy = p[a + 1] - p[b + 1];
    const uz = p[a + 2] - p[b + 2];
    const vx = p[c] - p[b];
    const vy = p[c + 1] - p[b + 1];
    const vz = p[c + 2] - p[b + 2];
    let fx = uy * vz - uz * vy;
    let fy = uz * vx - ux * vz;
    let fz = ux * vy - uy * vx;
    const l = Math.hypot(fx, fy, fz) || 1;
    fx /= l;
    fy /= l;
    fz /= l;
    const s = positions.length / 3;
    for (const v of [a, b, c]) {
      positions.push(p[v], p[v + 1], p[v + 2]);
      normals.push(fx, fy, fz);
    }
    indices.push(s, s + 1, s + 2);
  }
  const out = new VertexData();
  out.positions = positions;
  out.normals = normals;
  out.indices = indices;
  return out;
}

/** Spatially chunked batches so big static worlds still frustum-cull. */
export class ChunkedBatch {
  chunks = new Map<string, Batch>();
  constructor(public size = 64) {}
  at(x: number, z: number): Batch {
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.chunks.get(key);
    if (!b) {
      b = new Batch();
      this.chunks.set(key, b);
    }
    return b;
  }
  build(name: string, scene: Scene, mat: Material): Mesh[] {
    const out: Mesh[] = [];
    for (const [k, b] of this.chunks) {
      if (!b.vertexCount) continue;
      const m = b.build(`${name}_${k}`, scene, mat);
      m.freezeWorldMatrix();
      out.push(m);
    }
    return out;
  }
}
