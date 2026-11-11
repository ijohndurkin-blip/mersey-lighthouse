/**
 * Tiny signed-distance-field sculpting toolkit.
 *
 * Shapes are described as smooth blends of simple volumes ("digital clay"), then turned into
 * a mesh with surface nets. Normals come straight from the field so surfaces are perfectly
 * smooth, and soft ambient occlusion is baked from the same field.
 */
export type SDF = (x: number, y: number, z: number) => number;
export type SDF2 = (u: number, v: number) => number;

// ---------------------------------------------------------------- operators
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export const union = (...s: SDF[]): SDF => (x, y, z) => {
  let d = Infinity;
  for (let i = 0; i < s.length; i++) {
    const v = s[i](x, y, z);
    if (v < d) d = v;
  }
  return d;
};
export const blend = (k: number, ...s: SDF[]): SDF => (x, y, z) => {
  let d = s[0](x, y, z);
  for (let i = 1; i < s.length; i++) d = smin(d, s[i](x, y, z), k);
  return d;
};
export const carve = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
export const clip = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);
export const inflate = (a: SDF, r: number): SDF => (x, y, z) => a(x, y, z) - r;
export const mirrorX = (a: SDF): SDF => (x, y, z) => a(Math.abs(x), y, z);
export const flipX = (a: SDF): SDF => (x, y, z) => a(-x, y, z);
export const move = (a: SDF, dx: number, dy: number, dz: number): SDF => (x, y, z) => a(x - dx, y - dy, z - dz);

/** rotation matrix (local -> world), applied yaw (y), then pitch (x), then roll (z) */
function rotation(rx: number, ry: number, rz: number) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // R = Ry * Rx * Rz
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}

// ---------------------------------------------------------------- primitives
export function ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, rotX = 0, rotY = 0, rotZ = 0): SDF {
  const m = rotation(rotX, rotY, rotZ);
  const rot = rotX !== 0 || rotY !== 0 || rotZ !== 0;
  const ix = 1 / rx;
  const iy = 1 / ry;
  const iz = 1 / rz;
  const mn = Math.min(rx, ry, rz);
  return (x, y, z) => {
    let dx = x - cx;
    let dy = y - cy;
    let dz = z - cz;
    if (rot) {
      const lx = m[0] * dx + m[3] * dy + m[6] * dz;
      const ly = m[1] * dx + m[4] * dy + m[7] * dz;
      const lz = m[2] * dx + m[5] * dy + m[8] * dz;
      dx = lx;
      dy = ly;
      dz = lz;
    }
    const ax = dx * ix;
    const ay = dy * iy;
    const az = dz * iz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax * ix;
    const by = ay * iy;
    const bz = az * iz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -mn : (k0 * (k0 - 1)) / k1;
  };
}

/** Capsule with a different radius at each end. */
export function cone(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r1: number, r2: number): SDF {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax;
    const pay = y - ay;
    const paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy;
    const qy = pay * l2 - bay * yy;
    const qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** Torus around the local y axis (optionally elliptical via sx/sz and rotated). */
export function torus(cx: number, cy: number, cz: number, R: number, r: number, rotX = 0, rotY = 0, rotZ = 0, sz = 1): SDF {
  const m = rotation(rotX, rotY, rotZ);
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const lx = m[0] * dx + m[3] * dy + m[6] * dz;
    const ly = m[1] * dx + m[4] * dy + m[7] * dz;
    const lz = (m[2] * dx + m[5] * dy + m[8] * dz) / sz;
    const q = Math.sqrt(lx * lx + lz * lz) - R;
    return Math.sqrt(q * q + ly * ly) - r;
  };
}

export function rbox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number, rotX = 0, rotY = 0, rotZ = 0): SDF {
  const m = rotation(rotX, rotY, rotZ);
  return (x, y, z) => {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const qx = Math.abs(m[0] * dx + m[3] * dy + m[6] * dz) - hx + r;
    const qy = Math.abs(m[1] * dx + m[4] * dy + m[7] * dz) - hy + r;
    const qz = Math.abs(m[2] * dx + m[5] * dy + m[8] * dz) - hz + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

export const plane = (nx: number, ny: number, nz: number, d: number): SDF => (x, y, z) => x * nx + y * ny + z * nz - d;

// ---------------------------------------------------------------- 2D regions (for embossed panels)
export const circle2 = (cx: number, cy: number, r: number): SDF2 => (u, v) => Math.hypot(u - cx, v - cy) - r;
export const ell2 = (cx: number, cy: number, rx: number, ry: number, rot = 0): SDF2 => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const mn = Math.min(rx, ry);
  return (u, v) => {
    const du = u - cx;
    const dv = v - cy;
    const lu = (c * du + s * dv) / rx;
    const lv = (-s * du + c * dv) / ry;
    const k0 = Math.hypot(lu, lv);
    const k1 = Math.hypot(lu / rx, lv / ry);
    return k1 < 1e-9 ? -mn : (k0 * (k0 - 1)) / k1;
  };
};
export const rbox2 = (cx: number, cy: number, hx: number, hy: number, r: number, rot = 0): SDF2 => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (u, v) => {
    const du = u - cx;
    const dv = v - cy;
    const qx = Math.abs(c * du + s * dv) - hx + r;
    const qy = Math.abs(-s * du + c * dv) - hy + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
};
export const blend2 = (k: number, ...s: SDF2[]): SDF2 => (u, v) => {
  let d = s[0](u, v);
  for (let i = 1; i < s.length; i++) d = smin(d, s[i](u, v), k);
  return d;
};
/** Thick curved stroke through points with a radius at each point. */
export const stroke2 = (pts: [number, number, number][]): SDF2 => (u, v) => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, ar] = pts[i];
    const [bx, by, br] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let t = ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(u - ax - dx * t, v - ay - dy * t) - (ar + (br - ar) * t);
    if (d < best) best = d;
  }
  return best;
};

/**
 * A 2D region swept along a direction: u/v are the in-plane axes, n the sweep direction.
 * The region only exists where (p - o)·n > back, so it can be limited to one side of a model.
 */
export function prism(d2: SDF2, yaw = 0, back = 0, ox = 0, oy = 0, oz = 0, roll = 0): SDF {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return (x, y, z) => {
    const dx = x - ox;
    const dy = y - oy;
    const dz = z - oz;
    const n = dx * sy + dz * cy;
    const u0 = dx * cy - dz * sy;
    const u = u0 * cr + dy * sr;
    const v = -u0 * sr + dy * cr;
    return Math.max(d2(u, v), back - n);
  };
}

// ---------------------------------------------------------------- meshing
export interface Surf {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

type Box = [number, number, number, number, number, number];

/** Find a tight bounding box of the surface by coarse sampling. */
export function findBounds(sdf: SDF, search: Box, step = 0.04): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  const lim = step * 0.9;
  for (let z = search[2]; z <= search[5]; z += step) {
    for (let y = search[1]; y <= search[4]; y += step) {
      for (let x = search[0]; x <= search[3]; x += step) {
        if (sdf(x, y, z) < lim) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
      }
    }
  }
  const p = step;
  return [x0 - p, y0 - p, z0 - p, x1 + p, y1 + p, z1 + p];
}

/** Surface-nets polygonisation with field-accurate vertex positions and normals. */
export function polygonize(sdf: SDF, cell: number, search: Box = [-0.8, -0.8, -0.8, 0.8, 0.8, 0.8]): Surf {
  const b = findBounds(sdf, search, 0.05);
  if (!isFinite(b[0])) return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
  const nx = Math.ceil((b[3] - b[0]) / cell) + 2;
  const ny = Math.ceil((b[4] - b[1]) / cell) + 2;
  const nz = Math.ceil((b[5] - b[2]) / cell) + 2;
  const vals = new Float32Array(nx * ny * nz);
  const B = 4;
  const half = ((B - 1) / 2) * cell;
  const skip = half * Math.sqrt(3) * 1.7 + cell * 1.5;
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        const d = sdf(b[0] + bi * cell + half, b[1] + bj * cell + half, b[2] + bk * cell + half);
        const far = Math.abs(d) > skip;
        const k1 = Math.min(nz, bk + B);
        const j1 = Math.min(ny, bj + B);
        const i1 = Math.min(nx, bi + B);
        for (let k = bk; k < k1; k++) {
          for (let j = bj; j < j1; j++) {
            let o = (k * ny + j) * nx + bi;
            for (let i = bi; i < i1; i++) vals[o++] = far ? d : sdf(b[0] + i * cell, b[1] + j * cell, b[2] + k * cell);
          }
        }
      }
    }
  }
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const corner = [0, 0, 0, 0, 0, 0, 0, 0];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const o = (k * ny + j) * nx + i;
        corner[0] = vals[o];
        corner[1] = vals[o + 1];
        corner[2] = vals[o + nx];
        corner[3] = vals[o + nx + 1];
        corner[4] = vals[o + nx * ny];
        corner[5] = vals[o + nx * ny + 1];
        corner[6] = vals[o + nx * ny + nx];
        corner[7] = vals[o + nx * ny + nx + 1];
        let neg = 0;
        for (let c = 0; c < 8; c++) if (corner[c] < 0) neg++;
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0];
          const c2 = EDGES[e][1];
          const va = corner[a];
          const vb = corner[c2];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((c2 & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((c2 >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((c2 >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellVert[(k * cy + j) * cx + i] = pos.length / 3;
        pos.push(b[0] + (i + sx / n) * cell, b[1] + (j + sy / n) * cell, b[2] + (k + sz / n) * cell);
      }
    }
  }
  const idx: number[] = [];
  const cv = (i: number, j: number, k: number) => cellVert[(k * cy + j) * cx + i];
  const quad = (a: number, b2: number, c: number, d: number) => {
    if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
    idx.push(a, b2, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const o = (k * ny + j) * nx + i;
        const v = vals[o] < 0;
        if (i < nx - 1 && j > 0 && k > 0 && j < cy && k < cz && v !== vals[o + 1] < 0) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k));
        if (j < ny - 1 && i > 0 && k > 0 && i < cx && k < cz && v !== vals[o + nx] < 0) quad(cv(i - 1, j, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i - 1, j, k));
        if (k < nz - 1 && i > 0 && j > 0 && i < cx && j < cy && v !== vals[o + nx * ny] < 0) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k));
      }
    }
  }
  // snap vertices onto the true surface and take normals from the field
  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  const e = cell * 0.5;
  for (let v = 0; v < positions.length; v += 3) {
    let x = positions[v];
    let y = positions[v + 1];
    let z = positions[v + 2];
    let gx = 0;
    let gy = 1;
    let gz = 0;
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      if (it === 1) break;
      const slope = gl / (2 * e) || 1;
      let stepLen = d / slope;
      const lim = cell * 0.6;
      stepLen = stepLen > lim ? lim : stepLen < -lim ? -lim : stepLen;
      x -= gx * stepLen;
      y -= gy * stepLen;
      z -= gz * stepLen;
    }
    positions[v] = x;
    positions[v + 1] = y;
    positions[v + 2] = z;
    normals[v] = gx;
    normals[v + 1] = gy;
    normals[v + 2] = gz;
  }
  // consistent winding (Babylon: face normal = (p1 - p2) x (p3 - p2))
  const indices = new Uint32Array(idx);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3;
    const b2 = indices[f + 1] * 3;
    const c = indices[f + 2] * 3;
    const ux = positions[a] - positions[b2];
    const uy = positions[a + 1] - positions[b2 + 1];
    const uz = positions[a + 2] - positions[b2 + 2];
    const vx = positions[c] - positions[b2];
    const vy = positions[c + 1] - positions[b2 + 1];
    const vz = positions[c + 2] - positions[b2 + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    if (fx * (normals[a] + normals[b2] + normals[c]) + fy * (normals[a + 1] + normals[b2 + 1] + normals[c + 1]) + fz * (normals[a + 2] + normals[b2 + 2] + normals[c + 2]) < 0) {
      indices[f + 1] = c / 3;
      indices[f + 2] = b2 / 3;
    }
  }
  return { positions, normals, indices };
}

/** Soft ambient occlusion per vertex (1 = open, 0 = fully occluded), sampled from a field. */
export function bakeAO(s: Surf, field: SDF, strength = 1, reach = 0.11): Float32Array {
  const n = s.positions.length / 3;
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = s.positions[i * 3];
    const y = s.positions[i * 3 + 1];
    const z = s.positions[i * 3 + 2];
    const nx = s.normals[i * 3];
    const ny = s.normals[i * 3 + 1];
    const nz = s.normals[i * 3 + 2];
    let occ = 0;
    let w = 1;
    for (let k = 1; k <= 5; k++) {
      const h = (reach * k) / 5;
      const d = field(x + nx * h, y + ny * h, z + nz * h);
      occ += Math.max(0, h - d) * w;
      w *= 0.72;
    }
    ao[i] = Math.max(0, Math.min(1, 1 - (occ / reach) * 1.9 * strength));
  }
  return ao;
}

/** Distance along +n from far away to the surface (for placing details on a sculpt). */
export function surfaceAlong(sdf: SDF, ox: number, oy: number, oz: number, nx: number, ny: number, nz: number, start = 0.8): number {
  let t = start;
  for (let i = 0; i < 80; i++) {
    const d = sdf(ox + nx * t, oy + ny * t, oz + nz * t);
    if (d < 0.0004) break;
    t -= Math.max(d * 0.7, 0.0005);
    if (t < -0.2) break;
  }
  return t;
}

export function gradient(sdf: SDF, x: number, y: number, z: number, e = 0.004): [number, number, number] {
  const gx = sdf(x + e, y, z) - sdf(x - e, y, z);
  const gy = sdf(x, y + e, z) - sdf(x, y - e, z);
  const gz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

/** Rotate a field about the z axis by angle a (counter-clockwise looking down -z). */
export const spinZ = (s: SDF, a: number): SDF => {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return (x, y, z) => s(c * x + sn * y, -sn * x + c * y, z);
};

/** A raised panel that follows a base surface: `h` above it, limited to a region, with a bevelled edge. */
export const emboss = (base: SDF, h: number, region: SDF, bevel: number, depth = 0.016): SDF => (x, y, z) => {
  const b = base(x, y, z);
  return smax(Math.max(b - h, -(b + depth)), region(x, y, z), bevel);
};

/** Rounded cylinder (a flat band) around the y axis. */
export const band = (cx: number, cy: number, cz: number, radius: number, halfH: number, round: number): SDF => (x, y, z) => {
  const dx = Math.hypot(x - cx, z - cz) - radius + round;
  const dy = Math.abs(y - cy) - halfH + round;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
};
