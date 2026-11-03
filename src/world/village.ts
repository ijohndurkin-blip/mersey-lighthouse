import { Color3, Matrix, Mesh, TransformNode, Vector3 } from '../babylon';
import { Batch, Shape, T, col, Col, PaintOpts } from './geo';
import { WorldCtx } from './ctx';
import { HOUSES, HouseDef, JETTY, QUAY, VILLAGE_SQUARE } from './layout';
import { rng } from '../core/noise';

type Put = (vd: any, x: number, y: number, z: number, c: Col, o?: PaintOpts, rx?: number, ry?: number, rz?: number, s?: [number, number, number]) => void;

function localPut(b: () => Batch, L: Matrix): Put {
  return (vd, x, y, z, c, o = {}, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => {
    b().add(vd, T(x, y, z, rx, ry, rz, s[0], s[1], s[2]).multiply(L), c, o);
  };
}

export function addHouse(ctx: WorldCtx, h: HouseDef) {
  const y0 = ctx.terrain.sample(h.x, h.z) - 0.05;
  const L = T(h.x, y0, h.z, 0, h.yaw);
  const P = localPut(() => ctx.props.at(h.x, h.z), L);
  const D2 = localPut(() => ctx.detail.at(h.x, h.z), L);
  const Wn = localPut(() => ctx.windows, L);
  const Bu = localPut(() => ctx.bulbs, L);
  const rnd = rng(Math.floor(h.x * 13 + h.z * 7));
  const W = h.w;
  const D = h.d;
  const fh = h.kind === 'shed' ? 3.6 : 2.7;
  const H = h.floors * fh;
  const base = 0.55;
  // foundation
  P(Shape.rbox(W + 0.5, 1.4, D + 0.5, 0.12), 0, -0.2, 0, '#a59c92', { ao: 0.3, noise: 0.1 });
  // walls
  P(Shape.rbox(W, H, D, 0.14, 2), 0, base + H / 2, 0, h.wall, { ao: 0.25, noise: 0.04 });
  // corner quoins
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) P(Shape.rbox(0.3, H, 0.3, 0.05, 1), sx * (W / 2 - 0.05), base + H / 2, sz * (D / 2 - 0.05), h.trim, { ao: 0.2 });
  // floor bands
  for (let f = 1; f < h.floors; f++) P(Shape.rbox(W + 0.12, 0.16, D + 0.12, 0.05, 1), 0, base + f * fh, 0, h.trim);
  // eaves band
  P(Shape.rbox(W + 0.24, 0.24, D + 0.24, 0.06, 1), 0, base + H, 0, h.trim);
  // ---------------- roof (gable, ridge along x)
  const pitch = h.kind === 'shed' ? 0.5 : 0.62;
  const half = D / 2 + 0.55;
  const rise = Math.tan(pitch) * half;
  const slab = half / Math.cos(pitch) + 0.1;
  const roofY = base + H + 0.08;
  for (const s of [-1, 1]) {
    P(Shape.rbox(W + 0.9, 0.24, slab, 0.07, 1), 0, roofY + rise / 2, (s * half) / 2, h.roof, { ao: 0.2, noise: 0.12 }, s * pitch, 0, 0);
    // tile rows
    for (let r = 1; r < 5; r++) {
      const t = r / 5;
      P(Shape.box(W + 0.92, 0.05, 0.1), 0, roofY + rise * (1 - t) + 0.14, s * half * t, col(h.roof).scale(0.82), {}, s * pitch, 0, 0);
    }
  }
  P(Shape.rbox(W + 1.0, 0.26, 0.42, 0.1, 1), 0, roofY + rise + 0.05, 0, col(h.roof).scale(0.75));
  // gable fill
  for (const s of [-1, 1]) {
    P(Shape.prism([[-D / 2, 0], [D / 2, 0], [0, rise * (D / 2) / half]], 0.2), (s * W) / 2 - s * 0.05, roofY - 0.04, 0, h.wall, { ao: 0.15 }, 0, Math.PI / 2, 0);
  }
  // chimney
  const cx = (rnd() < 0.5 ? -1 : 1) * (W / 2 - 1.1);
  P(Shape.rbox(0.9, 2.2, 0.9, 0.08, 1), cx, roofY + rise * 0.8 + 0.6, -0.5, '#b8695a', { ao: 0.3, noise: 0.12 });
  P(Shape.rbox(1.1, 0.2, 1.1, 0.05, 1), cx, roofY + rise * 0.8 + 1.75, -0.5, '#8e8a86');
  for (const ox of [-0.18, 0.18]) P(Shape.cyl(0.4, 0.22, 0.25, 8), cx + ox, roofY + rise * 0.8 + 2.0, -0.5, '#c4775f');

  // ---------------- windows & door
  const winRow = (fz: number, ry: number, width: number, floors: number, skipDoor: boolean) => {
    const count = Math.max(1, Math.floor(width / 2.3));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < count; i++) {
        const lx = -width / 2 + (width / count) * (i + 0.5);
        if (skipDoor && f === 0 && Math.abs(lx) < 1.2) continue;
        const wy = base + f * fh + fh * 0.55;
        const shop = (h.kind === 'shop' || h.kind === 'cafe') && f === 0 && skipDoor;
        const ww = shop ? 1.8 : 1.0;
        const wh = shop ? 1.6 : 1.25;
        const place = (ox: number, oy: number, oz: number) => {
          const c = Math.cos(ry);
          const s = Math.sin(ry);
          return [ox * c + oz * s, oy, -ox * s + oz * c] as const;
        };
        const pz = fz;
        const [fx, fy, fzz] = place(lx, wy, pz + 0.05);
        P(Shape.rbox(ww + 0.28, wh + 0.28, 0.16, 0.05, 1), fx, fy, fzz, h.trim, {}, 0, ry, 0);
        const [gx, gy, gz] = place(lx, wy, pz + 0.1);
        Wn(Shape.box(ww, wh, 0.06), gx, gy, gz, '#ffffff', {}, 0, ry, 0);
        // mullions
        const [mx, my, mz] = place(lx, wy, pz + 0.15);
        D2(Shape.box(0.07, wh, 0.05), mx, my, mz, h.trim, {}, 0, ry, 0);
        D2(Shape.box(ww, 0.07, 0.05), mx, my, mz, h.trim, {}, 0, ry, 0);
        // sill
        const [sx, sy, sz] = place(lx, wy - wh / 2 - 0.16, pz + 0.18);
        P(Shape.rbox(ww + 0.4, 0.12, 0.3, 0.04, 1), sx, sy, sz, h.trim, {}, 0, ry, 0);
        // flower box on the ground floor front
        if (f === 0 && skipDoor && !shop && rnd() < 0.85) {
          const [bx, by, bz] = place(lx, wy - wh / 2 - 0.36, pz + 0.32);
          P(Shape.rbox(ww + 0.2, 0.3, 0.32, 0.05, 1), bx, by, bz, '#8b5a3c', { ao: 0.3 }, 0, ry, 0);
          for (let k = 0; k < 5; k++) {
            const [qx, qy, qz] = place(lx - ww / 2 + 0.1 + (k / 4) * (ww - 0.2), wy - wh / 2 - 0.12, pz + 0.34);
            D2(Shape.sphere(0.2, 6), qx, qy, qz, ['#ff5d7a', '#ffd23f', '#ff8fb8', '#ffffff'][k % 4]);
          }
        }
        // shutters on upper floors
        if (f > 0 && rnd() < 0.6) {
          for (const ss of [-1, 1]) {
            const [tx, ty, tz] = place(lx + ss * (ww / 2 + 0.3), wy, pz + 0.08);
            P(Shape.rbox(0.42, wh + 0.1, 0.08, 0.03, 1), tx, ty, tz, h.door, {}, 0, ry, 0);
          }
        }
      }
    }
  };
  winRow(D / 2, 0, W - 0.8, h.floors, true);
  winRow(-D / 2, Math.PI, W - 0.8, h.floors, false);
  winRow(W / 2, Math.PI / 2, D - 1.6, h.floors, false);
  winRow(-W / 2, -Math.PI / 2, D - 1.6, h.floors, false);
  // door
  const dw = h.kind === 'shed' ? 3.2 : 1.15;
  const dh = h.kind === 'shed' ? 2.9 : 2.1;
  P(Shape.rbox(dw + 0.4, dh + 0.25, 0.2, 0.06, 1), 0, base + dh / 2 + 0.05, D / 2 + 0.04, h.trim);
  P(Shape.rbox(dw, dh, 0.14, 0.05, 1), 0, base + dh / 2, D / 2 + 0.12, h.door, { ao: 0.2 });
  if (h.kind === 'shed') {
    D2(Shape.box(0.08, dh, 0.04), 0, base + dh / 2, D / 2 + 0.21, col(h.door).scale(0.7));
    for (const dx of [-1, 1]) D2(Shape.box(dw / 2 - 0.1, 0.1, 0.04), (dx * dw) / 4, base + dh / 2, D / 2 + 0.21, col(h.door).scale(0.7), {}, 0, 0, dx * 0.9);
  } else {
    // door panels + knob + fanlight
    D2(Shape.box(dw * 0.7, dh * 0.35, 0.04), 0, base + dh * 0.3, D / 2 + 0.2, col(h.door).scale(0.85));
    D2(Shape.box(dw * 0.7, dh * 0.35, 0.04), 0, base + dh * 0.72, D / 2 + 0.2, col(h.door).scale(0.85));
    D2(Shape.sphere(0.12, 6), dw * 0.32, base + dh * 0.5, D / 2 + 0.24, '#f2c14e');
    Bu(Shape.sphere(0.24, 8), 0, base + dh + 0.55, D / 2 + 0.45, '#ffe6a8');
    D2(Shape.rbox(0.36, 0.12, 0.36, 0.04, 1), 0, base + dh + 0.78, D / 2 + 0.45, '#333a44');
  }
  P(Shape.rbox(dw + 0.9, 0.24, 1.0, 0.06, 1), 0, base - 0.1, D / 2 + 0.55, '#bdb3a6', { ao: 0.2 });

  // ---------------- extras by kind
  if (h.kind === 'shop' || h.kind === 'cafe') {
    const stripes = h.kind === 'cafe' ? ['#ffffff', '#e8505b'] : ['#ffffff', '#2f8fd8'];
    const n = 10;
    const aw = W - 0.4;
    for (let i = 0; i < n; i++) {
      const lx = -aw / 2 + (aw / n) * (i + 0.5);
      P(Shape.box(aw / n, 0.06, 1.6), lx, base + fh - 0.35, D / 2 + 0.75, stripes[i % 2], {}, 0.45, 0, 0);
      D2(Shape.cyl(0.04, 0.0, aw / n, 3), lx, base + fh - 0.72, D / 2 + 1.52, stripes[i % 2], {}, 0, 0, Math.PI / 2);
    }
    // sign
    P(Shape.rbox(2.6, 0.7, 0.14, 0.08, 1), 0, base + fh + 0.45, D / 2 + 0.12, '#2a3f66');
    D2(Shape.rbox(2.3, 0.45, 0.04, 0.05, 1), 0, base + fh + 0.45, D / 2 + 0.2, h.kind === 'cafe' ? '#ffd166' : '#9fe0ff');
    if (h.kind === 'cafe') {
      // outdoor tables
      for (const tx of [-2.4, 2.4]) {
        const tz = D / 2 + 2.6;
        P(Shape.cyl(0.8, 0.08, 0.12, 8), tx, base + 0.4 - 0.5, tz, '#4a4f5a');
        P(Shape.cyl(0.07, 1.2, 1.2, 16), tx, base + 0.82 - 0.5, tz, '#ffffff');
        P(Shape.cyl(2.2, 0.05, 0.05, 6), tx, base + 1.5 - 0.5, tz, '#d9d2c5');
        P(Shape.cone(0.7, 2.6, 12), tx, base + 2.65 - 0.5, tz, h.kind === 'cafe' ? '#e8505b' : '#2f8fd8');
        for (const cxo of [-0.9, 0.9]) P(Shape.rbox(0.5, 0.08, 0.5, 0.04, 1), tx + cxo, base + 0.5 - 0.5, tz, '#c98d5a');
      }
    }
  }
  if (h.kind === 'harbour') {
    // clock tower
    const ty = roofY + rise * 0.4;
    P(Shape.rbox(2.6, 3.4, 2.6, 0.1, 1), 0, ty + 1.7, 0, h.wall, { ao: 0.2 });
    P(Shape.rbox(2.9, 0.24, 2.9, 0.06, 1), 0, ty + 3.45, 0, h.trim);
    P(Shape.cone(2.2, 3.6, 4), 0, ty + 4.6, 0, h.roof, {}, 0, Math.PI / 4, 0);
    P(Shape.cyl(1.4, 0.06, 0.06, 6), 0, ty + 6.2, 0, '#e7c25a');
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const ox = Math.sin(a) * 1.32;
      const oz = Math.cos(a) * 1.32;
      P(Shape.cyl(0.08, 1.6, 1.6, 20), ox, ty + 2.2, oz, '#fffdf2', {}, Math.PI / 2, a, 0);
      D2(Shape.box(0.08, 0.6, 0.04), ox * 1.04, ty + 2.4, oz * 1.04, '#22314d', {}, 0, a, 0);
      D2(Shape.box(0.07, 0.45, 0.04), ox * 1.04 + Math.cos(a) * 0.18, ty + 2.2, oz * 1.04 - Math.sin(a) * 0.18, '#22314d', {}, 0, a, 1.2);
    }
    // life rings on the wall
    for (const lx of [-3, 3]) P(Shape.torus(0.9, 0.2, 16), lx, base + 1.6, D / 2 + 0.2, '#ff5a3c', {}, Math.PI / 2, 0, 0);
  }
  if (h.kind === 'shed') {
    // hanging buoys & nets
    for (let k = 0; k < 4; k++) D2(Shape.sphere(0.45, 8), -W / 2 + 1.2 + k * 0.7, base + 2.2 - (k % 2) * 0.3, D / 2 + 0.35, ['#ff6b3d', '#ffffff', '#ffd23f', '#ff6b3d'][k]);
  }
  ctx.col.addBox({ x: h.x, z: h.z, hw: W / 2 + 0.3, hd: D / 2 + 0.3, yaw: h.yaw });
}

export function addLampPost(ctx: WorldCtx, x: number, z: number, yOverride?: number) {
  const y = yOverride ?? ctx.terrain.sample(x, z);
  const P = ctx.props.at(x, z);
  P.add(Shape.cyl(0.4, 0.42, 0.5, 8), T(x, y + 0.2, z), '#2d4a3e', {});
  P.add(Shape.cyl(3.6, 0.14, 0.18, 8), T(x, y + 2.0, z), '#2d4a3e', { ao: 0.2 });
  P.add(Shape.rbox(0.6, 0.12, 0.6, 0.04, 1), T(x, y + 3.85, z), '#2d4a3e');
  P.add(Shape.cone(0.5, 0.8, 4), T(x, y + 4.55, z, 0, Math.PI / 4, 0), '#2d4a3e');
  ctx.bulbs.add(Shape.rbox(0.42, 0.55, 0.42, 0.08, 1), T(x, y + 4.15, z), '#ffe3a0');
  ctx.col.addCircle({ x, z, r: 0.28 });
}

function addBench(ctx: WorldCtx, x: number, z: number, yaw: number) {
  const y = ctx.terrain.sample(x, z);
  const L = T(x, y, z, 0, yaw);
  const P = localPut(() => ctx.props.at(x, z), L);
  for (let i = 0; i < 3; i++) P(Shape.rbox(2.0, 0.08, 0.16, 0.03, 1), 0, 0.55, -0.2 + i * 0.2, '#c98d5a');
  for (let i = 0; i < 2; i++) P(Shape.rbox(2.0, 0.16, 0.06, 0.03, 1), 0, 0.85 + i * 0.22, -0.32, '#c98d5a', {}, -0.15, 0, 0);
  for (const sx of [-0.85, 0.85]) P(Shape.rbox(0.1, 0.6, 0.6, 0.03, 1), sx, 0.3, -0.05, '#3a3f48');
  ctx.col.addBox({ x, z, hw: 1.0, hd: 0.35, yaw });
}

function addCrate(b: Batch, x: number, y: number, z: number, s: number, yaw: number) {
  b.add(Shape.rbox(s, s, s, 0.05, 1), T(x, y + s / 2, z, 0, yaw), '#c08a52', { ao: 0.3, noise: 0.1 });
  for (const o of [-1, 1]) b.add(Shape.box(s * 1.01, s * 0.12, s * 1.01), T(x, y + s / 2 + o * s * 0.35, z, 0, yaw), '#8f6238');
}

function addBarrel(b: Batch, x: number, y: number, z: number, s: number) {
  b.add(Shape.lathe([[0.36 * s, 0], [0.44 * s, 0.3 * s], [0.46 * s, 0.5 * s], [0.44 * s, 0.7 * s], [0.36 * s, 1.0 * s]], 14, true, false), T(x, y, z), '#b07444', { ao: 0.3 });
  for (const hy of [0.15, 0.85]) b.add(Shape.torus(0.84 * s, 0.05 * s, 14), T(x, y + hy * s, z), '#5a5f68');
}

function addLobsterPot(b: Batch, x: number, y: number, z: number, yaw: number) {
  b.add(Shape.box(1.0, 0.08, 0.7), T(x, y + 0.04, z, 0, yaw), '#7a5a3a');
  for (let k = 0; k < 4; k++) b.add(Shape.torus(0.7, 0.04, 10), T(x - 0.36 + k * 0.24, y + 0.06, z, 0, yaw, Math.PI / 2, 1, 1, 1).multiply(Matrix.Scaling(1, 1, 1)), '#d8c49a');
  b.add(Shape.box(1.0, 0.04, 0.04), T(x, y + 0.4, z, 0, yaw), '#d8c49a');
}

export function buildVillage(ctx: WorldCtx) {
  for (const h of HOUSES) addHouse(ctx, h);
  const { terrain } = ctx;
  // ---------------- quay wall
  const qy = 1.55;
  const qb = ctx.props.at((QUAY.x0 + QUAY.x1) / 2, QUAY.z);
  const rnd = rng(77);
  for (let x = QUAY.x0; x < QUAY.x1; ) {
    const w = 1.4 + rnd() * 1.2;
    for (let row = 0; row < 3; row++) {
      const off = row % 2 ? w * 0.5 : 0;
      const bx = Math.min(QUAY.x1, x + off);
      const c = Color3.FromHexString('#b4aa9c').scale(0.85 + rnd() * 0.25);
      qb.add(Shape.rbox(w * 0.96, 0.95, 1.1, 0.12, 1), T(bx + w / 2, qy - 0.45 - row * 0.95, QUAY.z - 0.1), c, { ao: 0.2 });
    }
    x += w;
  }
  qb.add(Shape.rbox(QUAY.x1 - QUAY.x0 + 0.8, 0.3, 1.5, 0.08, 1), T((QUAY.x0 + QUAY.x1) / 2, qy + 0.05, QUAY.z + 0.1), '#d7cfc2', { ao: 0.2 });
  // block walking off the quay wall except at the jetty and the beach slipway
  ctx.col.addBox({ x: (QUAY.x0 + JETTY.x - 2) / 2, z: QUAY.z - 0.6, hw: (JETTY.x - 2 - QUAY.x0) / 2, hd: 0.4, yaw: 0 });
  ctx.col.addBox({ x: (JETTY.x + 2 + QUAY.x1) / 2, z: QUAY.z - 0.6, hw: (QUAY.x1 - JETTY.x - 2) / 2, hd: 0.4, yaw: 0 });
  // bollards on the quay
  for (let x = QUAY.x0 + 3; x < QUAY.x1; x += 7) {
    if (Math.abs(x - JETTY.x) < 3) continue;
    qb.add(Shape.lathe([[0.25, 0], [0.22, 0.4], [0.3, 0.55], [0.28, 0.65], [0, 0.66]], 12), T(x, qy + 0.2, QUAY.z + 0.2), '#2b2f36', { ao: 0.3 });
    ctx.col.addCircle({ x, z: QUAY.z + 0.2, r: 0.3 });
  }

  // ---------------- jetty
  const jb = ctx.props.at(JETTY.x, (JETTY.z0 + JETTY.z1) / 2);
  const jy = JETTY.y;
  const len = JETTY.z0 - JETTY.z1;
  for (let i = 0; i * 0.55 < len; i++) {
    const z = JETTY.z0 - i * 0.55 - 0.27;
    const c = Color3.FromHexString(i % 3 === 0 ? '#c9965f' : i % 3 === 1 ? '#b98552' : '#d4a46c').scale(0.92 + rnd() * 0.12);
    jb.add(Shape.rbox(JETTY.halfW * 2 + 0.2, 0.14, 0.5, 0.04, 1), T(JETTY.x + (rnd() - 0.5) * 0.06, jy - 0.07, z, 0, (rnd() - 0.5) * 0.02, 0), c, { noise: 0.08 });
  }
  for (const sx of [-1, 1]) {
    jb.add(Shape.rbox(0.25, 0.3, len, 0.05, 1), T(JETTY.x + sx * JETTY.halfW, jy - 0.3, (JETTY.z0 + JETTY.z1) / 2), '#7d5634', { ao: 0.3 });
    for (let z = JETTY.z0 - 1; z > JETTY.z1 - 0.5; z -= 3.2) {
      jb.add(Shape.cyl(4.6, 0.36, 0.42, 10), T(JETTY.x + sx * (JETTY.halfW + 0.05), jy - 2.0, z), '#6b4a30', { ao: 0.6, top: '#8a6040' });
      ctx.col.addCircle({ x: JETTY.x + sx * (JETTY.halfW + 0.15), z, r: 0.25 });
    }
    // low rail rope along the jetty
    ctx.col.addBox({ x: JETTY.x + sx * (JETTY.halfW + 0.3), z: (JETTY.z0 + JETTY.z1) / 2 - 2, hw: 0.2, hd: len / 2 - 0.5, yaw: 0, enabled: () => true });
  }
  ctx.col.addBox({ x: JETTY.x, z: JETTY.z1 - 0.4, hw: JETTY.halfW + 0.4, hd: 0.25, yaw: 0 });
  ctx.col.addPlatform({ x: JETTY.x, z: (JETTY.z0 + JETTY.z1) / 2 - 0.5, hw: JETTY.halfW + 0.3, hd: len / 2 + 1.2, yaw: 0, y: jy, surface: 'wood' });
  // jetty props
  addLampPost(ctx, JETTY.x + 1.3, JETTY.z0 - 8, jy);
  addCrate(jb, JETTY.x + 0.9, jy, JETTY.z0 - 3.5, 0.8, 0.2);
  addCrate(jb, JETTY.x + 0.85, jy + 0.8, JETTY.z0 - 3.6, 0.6, 0.6);
  addBarrel(jb, JETTY.x - 1.0, jy, JETTY.z0 - 13, 1.0);
  addBarrel(jb, JETTY.x - 0.95, jy, JETTY.z0 - 14.1, 0.9);
  ctx.col.addCircle({ x: JETTY.x + 0.9, z: JETTY.z0 - 3.5, r: 0.55 });
  ctx.col.addCircle({ x: JETTY.x - 1.0, z: JETTY.z0 - 13.5, r: 0.8 });
  jb.add(Shape.torus(0.9, 0.18, 14), T(JETTY.x - 1.1, jy + 0.1, JETTY.z0 - 19, 0, 0, 0, 1, 0.5, 1), '#e6d3a3');
  jb.add(Shape.torus(0.6, 0.16, 14), T(JETTY.x - 1.1, jy + 0.25, JETTY.z0 - 19, 0, 0, 0, 1, 0.5, 1), '#e6d3a3');

  // ---------------- harbour clutter on the quay
  const hb = ctx.props.at(0, -58);
  addLobsterPot(hb, -12, qy, -59.2, 0.2);
  addLobsterPot(hb, -12.4, qy + 0.45, -59.0, -0.3);
  addLobsterPot(hb, 18, qy, -58.8, 0.1);
  addCrate(hb, -4, qy, -58.6, 0.9, 0.3);
  addCrate(hb, -2.9, qy, -58.9, 0.8, -0.2);
  addBarrel(hb, 30, qy, -59, 1);
  addBarrel(hb, 31, qy, -58.6, 1);
  for (const [x, z, r] of [
    [-12.2, -59.1, 0.7],
    [18, -58.8, 0.6],
    [-3.5, -58.7, 1.0],
    [30.5, -58.8, 0.9],
  ])
    ctx.col.addCircle({ x, z, r });
  // fishing net frame
  {
    const x = -24;
    const z = -58.5;
    const y = terrain.sample(x, z);
    for (const ox of [-1.5, 1.5]) hb.add(Shape.cyl(2.4, 0.12, 0.14, 6), T(x + ox, y + 1.2, z), '#7d5634');
    hb.add(Shape.cyl(3.2, 0.08, 0.08, 6), T(x, y + 2.35, z, 0, 0, Math.PI / 2), '#7d5634');
    ctx.detail.at(x, z).add(Shape.box(2.9, 1.8, 0.04), T(x, y + 1.4, z), '#4f7f7a', { noise: 0.4 });
    ctx.col.addBox({ x, z, hw: 1.7, hd: 0.25, yaw: 0 });
  }

  // ---------------- street lamps
  for (const [x, z] of [
    [-28, -38.5],
    [-12, -38.5],
    [10, -44.5],
    [22, -38.5],
    [38, -40],
    [-20, -46],
    [2, -57.5],
    [16, -57.5],
    [3, -22],
    [36, -48],
  ])
    addLampPost(ctx, x, z);

  // ---------------- village square: fountain with a puffin statue
  {
    const [x, z] = VILLAGE_SQUARE;
    const y = terrain.sample(x, z);
    const b = ctx.props.at(x, z);
    b.add(Shape.lathe([[2.8, 0], [3.0, 0.2], [3.0, 0.7], [2.6, 0.75], [2.55, 0.35], [0, 0.35]], 28), T(x, y, z), '#cfc6b8', { ao: 0.3 });
    b.add(Shape.cyl(1.4, 0.7, 0.9, 16), T(x, y + 0.9, z), '#cfc6b8', { ao: 0.2 });
    b.add(Shape.lathe([[1.4, 0], [1.6, 0.25], [1.5, 0.35], [0, 0.3]], 20), T(x, y + 1.6, z), '#cfc6b8');
    ctx.detail.at(x, z).add(Shape.cyl(0.08, 5.0, 5.0, 28), T(x, y + 0.62, z), '#5fc8d8', { mul: 1.1 });
    // puffin statue (bronze-ish)
    b.add(Shape.ellipsoid(0.9, 1.2, 0.8, 12), T(x, y + 2.45, z), '#4b6b7a', { ao: 0.3 });
    b.add(Shape.sphere(0.72, 12), T(x, y + 3.25, z + 0.05), '#4b6b7a');
    b.add(Shape.cone(0.55, 0.42, 8), T(x, y + 3.18, z + 0.55, Math.PI / 2, 0, 0, 1, 1, 0.6), '#c98d3a');
    ctx.col.addCircle({ x, z, r: 3.1 });
  }
  addBench(ctx, -2, -36, Math.PI * 0.85);
  addBench(ctx, 12.5, -36, -Math.PI * 0.85);
  addBench(ctx, -6, -58.6, Math.PI);
  addBench(ctx, 26, -46.5, -Math.PI / 2);

  // ---------------- market stall + phone box + post box
  {
    const x = -4.5;
    const z = -44;
    const y = terrain.sample(x, z);
    const L = T(x, y, z, 0, 0.25);
    const P = localPut(() => ctx.props.at(x, z), L);
    P(Shape.rbox(3.2, 0.9, 1.4, 0.06, 1), 0, 0.45, 0, '#c98d5a', { ao: 0.3 });
    for (const sx of [-1.5, 1.5]) for (const sz of [-0.6, 0.6]) P(Shape.cyl(2.6, 0.08, 0.08, 6), sx, 1.3, sz, '#e8e2d5');
    for (let i = 0; i < 6; i++) P(Shape.box(3.4 / 6, 0.06, 1.8), -1.7 + (i + 0.5) * (3.4 / 6), 2.65, 0, i % 2 ? '#ffffff' : '#3fb07a', {}, 0.1, 0, 0);
    const fruit = ['#e8423c', '#ffb02e', '#7bd34a', '#ffd23f'];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) ctx.detail.at(x, z).add(Shape.sphere(0.2, 6), T(-1.2 + i * 0.8 + (k % 3) * 0.18 - 0.18, 0.98 + Math.floor(k / 3) * 0.12, -0.2 + Math.floor(k / 3) * 0.2).multiply(L), fruit[i]);
    ctx.col.addBox({ x, z, hw: 1.7, hd: 0.8, yaw: 0.25 });
  }
  {
    const x = 30;
    const z = -38.5;
    const y = terrain.sample(x, z);
    const P = ctx.props.at(x, z);
    P.add(Shape.rbox(1.2, 2.6, 1.2, 0.08, 1), T(x, y + 1.3, z, 0, 0.3), '#d62d2d', { ao: 0.25 });
    P.add(Shape.rbox(1.3, 0.3, 1.3, 0.1, 1), T(x, y + 2.7, z, 0, 0.3), '#c02525');
    ctx.windows.add(Shape.box(0.9, 1.5, 1.24), T(x, y + 1.45, z, 0, 0.3), '#ffffff');
    ctx.col.addCircle({ x, z, r: 0.8 });
    const px = -36;
    const pz = -38.8;
    const py = terrain.sample(px, pz);
    P.add(Shape.cyl(1.3, 0.55, 0.6, 14), T(px, py + 0.65, pz), '#d62d2d', { ao: 0.25 });
    P.add(Shape.sphere(0.58, 14), T(px, py + 1.3, pz, 0, 0, 0, 1, 0.5, 1), '#c02525');
    ctx.col.addCircle({ x: px, z: pz, r: 0.4 });
  }

  // ---------------- bunting across the street
  const bunting = (ax: number, az: number, ay: number, bx: number, bz: number, by: number) => {
    const n = 14;
    const pts: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new Vector3(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * 1.3, az + (bz - az) * t));
    }
    ctx.detail.at(ax, az).add(Shape.tube(pts, 0.025, 4), Matrix.Identity(), '#f5f0e6');
    const cols = ['#ff5d5d', '#ffd23f', '#3fb2ff', '#7bd34a', '#ff8fd0', '#ffffff'];
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      const yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      ctx.foliage.at(p.x, p.z).add(Shape.prism([[-0.28, 0], [0.28, 0], [0, -0.6]], 0.02), T(p.x, p.y, p.z, 0, yaw, 0), cols[i % cols.length], { sway: 0.5 });
    }
  };
  bunting(-24.5, -29, 6.4, -20.5, -48, 6.2);
  bunting(-6.5, -29, 6.4, -2, -47, 5.5);
  bunting(15.5, -28.8, 6.4, 22, -47.5, 6.0);
  bunting(-15.5, -28.5, 8.6, 15.5, -28.8, 6.4);

  // garden fences behind the north row
  // (kept light — the hill behind the houses is open meadow)
}

/** Build a cartoon boat (returns a single mesh, origin at waterline). */
export function buildBoat(ctx: WorldCtx, name: string, opts: { hull: string; stripe: string; cabin?: string; length?: number; mast?: boolean; deck?: string; parent?: TransformNode }) {
  const b = new Batch();
  const L = opts.length ?? 5;
  const W = L * 0.42;
  // hull: upside-down half ellipsoid
  b.add(Shape.ellipsoid(1, 1, 1, 16), Matrix.Scaling(W, L * 0.36, L).multiply(T(0, 0.15, 0)), opts.hull, { ao: 0.45 });
  b.add(Shape.torus(1, 0.06, 28), Matrix.Scaling(W * 1.0, 1, L * 1.0).multiply(T(0, 0.55, 0)), opts.stripe);
  b.add(Shape.cyl(0.08, 1, 1, 28), Matrix.Scaling(W * 0.96, 1, L * 0.96).multiply(T(0, 0.5, 0)), opts.deck ?? '#d8b07a');
  if (opts.cabin) {
    b.add(Shape.rbox(W * 0.6, 1.2, L * 0.28, 0.12, 2), T(0, 1.15, -L * 0.08), opts.cabin, { ao: 0.25 });
    b.add(Shape.rbox(W * 0.7, 0.18, L * 0.34, 0.06, 1), T(0, 1.82, -L * 0.08), opts.stripe);
    b.add(Shape.cyl(0.6, 0.18, 0.2, 8), T(W * 0.15, 2.2, -L * 0.15), '#3a3f48');
  }
  if (opts.mast) {
    b.add(Shape.cyl(L * 1.0, 0.1, 0.14, 8), T(0, 0.5 + L * 0.5, L * 0.08), '#e8e2d5');
    b.add(Shape.prism([[0, 0], [0, L * 0.85], [L * 0.45, 0.2]], 0.04), T(0.0, 1.0, L * 0.06, 0, -Math.PI / 2, 0), '#fffaf0');
  }
  // bow fender
  b.add(Shape.sphere(0.3, 8), T(0, 0.45, L * 0.5), '#3a3f48');
  const m = b.build(name, ctx.scene, ctx.mats.vc, opts.parent);
  return m;
}
