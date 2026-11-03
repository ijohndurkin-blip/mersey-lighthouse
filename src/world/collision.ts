import { Terrain, Surface } from './terrain';

/** World offset -> local (Babylon left-handed yaw: local +z faces (sin yaw, cos yaw)). */
export function toLocal(dx: number, dz: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
export function toWorld(lx: number, lz: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

export interface CircleCol {
  x: number;
  z: number;
  r: number;
  /** top height (characters can stand on it when above), optional */
  top?: number;
  enabled?: () => boolean;
}
export interface BoxCol {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
  top?: number;
  enabled?: () => boolean;
}
export interface Platform {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
  y: number | ((lx: number, lz: number) => number);
  surface: Surface;
  enabled?: () => boolean;
}

export class Collision {
  circles: CircleCol[] = [];
  boxes: BoxCol[] = [];
  platforms: Platform[] = [];
  /** extra "no-go" predicate (e.g. west mountains) */
  minX = -63;
  maxSlope = 1.05;

  constructor(public terrain: Terrain) {}

  addCircle(c: CircleCol) {
    this.circles.push(c);
    return c;
  }
  addBox(b: BoxCol) {
    this.boxes.push(b);
    return b;
  }
  addPlatform(p: Platform) {
    this.platforms.push(p);
    return p;
  }

  private local(p: { x: number; z: number; yaw: number }, x: number, z: number) {
    const dx = x - p.x;
    const dz = z - p.z;
    return toLocal(dx, dz, p.yaw);
  }

  /** Highest platform under (x,z) whose top is reachable from curY. */
  platformAt(x: number, z: number, curY: number, step = 0.6) {
    let best: { y: number; surface: Surface } | null = null;
    for (const p of this.platforms) {
      if (p.enabled && !p.enabled()) continue;
      const { lx, lz } = this.local(p, x, z);
      if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hd) continue;
      const y = typeof p.y === 'number' ? p.y : p.y(lx, lz);
      if (y > curY + step) continue;
      if (!best || y > best.y) best = { y, surface: p.surface };
    }
    return best;
  }

  groundAt(x: number, z: number, curY: number): { y: number; surface: Surface; water: boolean } {
    const t = this.terrain.sample(x, z);
    const ws = this.terrain.waterSurface(x, z);
    const plat = this.platformAt(x, z, curY);
    if (plat && plat.y >= t - 0.05) return { y: plat.y, surface: plat.surface, water: false };
    return { y: t, surface: this.terrain.surfaceAt(x, z), water: t < ws - 0.3 };
  }

  /** Can a character stand at (x,z) moving from height fromY? */
  walkable(x: number, z: number, fromY: number, dist: number): boolean {
    if (x < this.minX) return false;
    const plat = this.platformAt(x, z, fromY);
    if (plat) return true;
    const t = this.terrain.sample(x, z);
    const ws = this.terrain.waterSurface(x, z);
    if (t < ws - 0.32) return false;
    const rise = t - fromY;
    if (rise > 0.45 && rise / Math.max(dist, 0.05) > this.maxSlope) return false;
    return true;
  }

  /** Push a circle of radius r out of all solid colliders (xz). */
  resolve(pos: { x: number; y: number; z: number }, r: number) {
    for (const c of this.circles) {
      if (c.enabled && !c.enabled()) continue;
      if (c.top !== undefined && pos.y >= c.top - 0.05) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = rr - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
    for (const b of this.boxes) {
      if (b.enabled && !b.enabled()) continue;
      if (b.top !== undefined && pos.y >= b.top - 0.05) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      if (Math.abs(dx) > b.hw + b.hd + r + 1 && Math.abs(dz) > b.hw + b.hd + r + 1) continue;
      const { lx, lz } = toLocal(dx, dz, b.yaw);
      const cx = Math.max(-b.hw, Math.min(b.hw, lx));
      const cz = Math.max(-b.hd, Math.min(b.hd, lz));
      let ox = lx - cx;
      let oz = lz - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      let nlx: number;
      let nlz: number;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = r - d;
        nlx = lx + (ox / d) * push;
        nlz = lz + (oz / d) * push;
      } else {
        // inside the box: push out along the shallowest axis
        const px = b.hw - Math.abs(lx);
        const pz = b.hd - Math.abs(lz);
        if (px < pz) {
          nlx = Math.sign(lx || 1) * (b.hw + r);
          nlz = lz;
        } else {
          nlx = lx;
          nlz = Math.sign(lz || 1) * (b.hd + r);
        }
        ox = 0;
        oz = 0;
      }
      // back to world
      const w = toWorld(nlx, nlz, b.yaw);
      pos.x = b.x + w.x;
      pos.z = b.z + w.z;
    }
  }
}
