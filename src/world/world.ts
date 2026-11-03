import { Color3, Mesh, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { Terrain } from './terrain';
import { Collision } from './collision';
import { createMaterials, Mats } from './materials';
import { Environment } from './environment';
import { newCtx, WorldCtx } from './ctx';
import { populateNature, scatterGroundCover, addFence } from './nature';
import { buildVillage, buildBoat } from './village';
import {
  buildBridgeSite,
  buildCottage,
  buildDistant,
  buildLighthouse,
  buildTurbine,
  buildWorkshop,
  CottageHandles,
  DistantHandles,
  LighthouseHandles,
  TurbineHandles,
  WorkshopHandles,
} from './landmarks';
import { QualityLevel, QualitySettings } from '../core/quality';
import { JETTY, RESCUE_BOAT_START, TURBINE } from './layout';
import { Batch, Shape, T } from './geo';

export interface Boat {
  node: TransformNode;
  baseY: number;
  bob: number;
  phase: number;
  moored: boolean;
}

export class World {
  terrain: Terrain;
  col: Collision;
  mats: Mats;
  env: Environment;
  ctx: WorldCtx;
  lighthouse!: LighthouseHandles;
  cottage!: CottageHandles;
  turbine!: TurbineHandles;
  workshop!: WorkshopHandles;
  distant!: DistantHandles;
  boats: Boat[] = [];
  taxi!: Boat;
  rescue!: Boat;
  bulbMat!: StandardMaterial;
  footings!: { z: number; top: number }[];
  staticMeshes: Mesh[] = [];

  constructor(public scene: Scene, public quality: QualityLevel) {
    this.terrain = new Terrain(QualitySettings[quality].terrainCell);
    this.col = new Collision(this.terrain);
    this.mats = createMaterials(scene);
    this.env = new Environment(scene, this.terrain, quality, this.mats);
    this.ctx = newCtx(scene, this.terrain, this.col, this.mats, this.env, quality);
  }

  async build(progress: (p: number, label: string) => Promise<void>) {
    const { scene, ctx } = this;
    const terrainMesh = this.terrain.build(scene);
    await progress(0.2, 'Shaping the island…');
    buildVillage(ctx);
    await progress(0.35, 'Painting the village…');
    this.lighthouse = buildLighthouse(ctx);
    this.cottage = buildCottage(ctx);
    this.turbine = buildTurbine(ctx);
    this.workshop = buildWorkshop(ctx);
    this.footings = buildBridgeSite(ctx).footings;
    this.distant = buildDistant(ctx);
    await progress(0.5, 'Building the lighthouse…');
    populateNature(ctx);
    // sheep field fence on the turbine hill
    addFence(ctx, [
      [6, 58],
      [10, 66],
      [20, 70],
      [30, 66],
    ]);
    addFence(ctx, [
      [-44, -26],
      [-34, -24],
      [-26, -24.5],
    ]);
    await progress(0.65, 'Growing trees…');
    const cover = scatterGroundCover(ctx);
    await progress(0.75, 'Planting flowers…');

    // ---------------- finalize static batches
    const props = ctx.props.build('props', scene, this.mats.vc);
    const detail = ctx.detail.build('detail', scene, this.mats.vc);
    const foliage = ctx.foliage.build('foliage', scene, this.mats.vcFoliage);
    const windows = ctx.windows.build('windows', scene, this.mats.windows);
    windows.freezeWorldMatrix();
    this.bulbMat = new StandardMaterial('bulbs', scene);
    this.bulbMat.disableLighting = true;
    this.bulbMat.emissiveColor = new Color3(0.55, 0.5, 0.42);
    const bulbs = ctx.bulbs.build('bulbs', scene, this.bulbMat);
    bulbs.freezeWorldMatrix();
    this.env.onNightChange.push((g) => {
      this.bulbMat.emissiveColor = Color3.Lerp(new Color3(0.6, 0.56, 0.46), new Color3(1.6, 1.25, 0.7), g);
    });
    for (const m of [...props, ...detail, ...foliage, windows, bulbs]) {
      m.isPickable = false;
      m.receiveShadows = true;
      this.staticMeshes.push(m);
    }
    const shadowMap = this.env.shadow.getShadowMap()!;
    for (const m of [...props, ...foliage, ...ctx.casters]) shadowMap.renderList!.push(m);
    for (const m of ctx.casters) (m as Mesh).receiveShadows = true;
    this.env.addMirrorMeshes([terrainMesh, ...props, ...foliage, this.env.sky]);
    cover.grass.receiveShadows = true;

    // ---------------- boats
    const moored: [number, number, number, any][] = [
      [5.0, -69, 0.05, { hull: '#e2453f', stripe: '#ffffff', cabin: '#f4f0e8', length: 5 }],
      [15.6, -67.5, 0.1, { hull: '#2f8fd8', stripe: '#ffd23f', length: 4.2, mast: true }],
      [-6, -66, -0.4, { hull: '#ffd23f', stripe: '#2f4f7a', length: 3.6 }],
      [27, -65.5, 0.5, { hull: '#4fb07a', stripe: '#ffffff', cabin: '#fff6e0', length: 4.6 }],
      [-18, -65, 0.2, { hull: '#ffffff', stripe: '#e2453f', length: 4, mast: true }],
    ];
    moored.forEach(([x, z, yaw, o], i) => {
      const node = new TransformNode('boat' + i, scene);
      const m = buildBoat(ctx, 'boatMesh' + i, { ...o, parent: node });
      m.receiveShadows = true;
      shadowMap.renderList!.push(m);
      node.position.set(x, 0, z);
      node.rotation.y = yaw;
      this.boats.push({ node, baseY: -0.1, bob: 1, phase: i * 1.3, moored: true });
      this.col.addCircle({ x, z, r: 1.6 });
    });
    // water taxi (brings the player)
    {
      const node = new TransformNode('taxi', scene);
      const m = buildBoat(ctx, 'taxiMesh', { hull: '#ff8a3d', stripe: '#ffffff', cabin: '#fff6e0', length: 6, deck: '#e8c08a', parent: node });
      shadowMap.renderList!.push(m);
      m.receiveShadows = true;
      node.position.set(JETTY.x + 3.6, 0, JETTY.z1 + 4);
      node.rotation.y = 0;
      this.taxi = { node, baseY: -0.15, bob: 0.6, phase: 0.4, moored: true };
      this.boats.push(this.taxi);
    }
    // stranded animal rescue boat
    {
      const node = new TransformNode('rescue', scene);
      const m = buildBoat(ctx, 'rescueMesh', { hull: '#ff6a2a', stripe: '#1f3a6a', cabin: '#ffffff', length: 6.5, deck: '#f2d29a', parent: node });
      shadowMap.renderList!.push(m);
      // tiny seal pup & ducklings on deck
      const b = new Batch();
      b.add(Shape.ellipsoid(0.9, 0.55, 1.3, 12), T(0.6, 0.85, 1.6), '#c9d0d8');
      b.add(Shape.sphere(0.55, 12), T(0.6, 1.2, 2.2), '#d8dee6');
      for (const sx of [-1, 1]) b.add(Shape.sphere(0.12, 6), T(0.6 + sx * 0.13, 1.28, 2.45), '#1a1a20');
      for (let k = 0; k < 3; k++) {
        b.add(Shape.sphere(0.35, 8), T(-0.6 + k * 0.3, 0.8, 0.8 + k * 0.35), '#ffd23f');
        b.add(Shape.sphere(0.24, 8), T(-0.6 + k * 0.3, 1.05, 0.95 + k * 0.35), '#ffd23f');
        b.add(Shape.cone(0.1, 0.1, 5), T(-0.6 + k * 0.3, 1.03, 1.1 + k * 0.35, Math.PI / 2, 0, 0), '#ff8a2a');
      }
      // flag
      b.add(Shape.cyl(3.5, 0.06, 0.06, 5), T(0, 3.2, -1.4), '#e8e2d5');
      b.add(Shape.prism([[0, 0], [1.2, -0.35], [0, -0.7]], 0.03), T(0, 4.9, -1.4), '#ffd23f');
      const deco = b.build('rescueDeco', scene, this.mats.char, node);
      shadowMap.renderList!.push(deco);
      // little lantern on the cabin
      const lb = new Batch();
      lb.add(Shape.sphere(0.35, 8), T(0, 2.35, -0.5), '#ffe6a8');
      lb.build('rescueLamp', scene, this.bulbMat, node);
      node.position.set(RESCUE_BOAT_START.x, 0, RESCUE_BOAT_START.z);
      node.rotation.y = -2.6;
      this.rescue = { node, baseY: -0.15, bob: 1.2, phase: 2, moored: false };
      this.boats.push(this.rescue);
    }
    await progress(0.85, 'Launching boats…');
  }

  update(dt: number) {
    const t = this.env.time;
    for (const b of this.boats) {
      const p = b.node.position;
      const h = this.env.waveHeight(p.x, p.z);
      p.y = b.baseY + h * 0.7 * b.bob;
      b.node.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.035 * b.bob;
      b.node.rotation.z = Math.sin(t * 0.8 + b.phase * 2) * 0.05 * b.bob;
    }
    // distant ambience
    for (const r of this.distant.rotors) (r.getChildren()[0] as Mesh).rotation.z += dt * 0.8;
    this.distant.ships.forEach((s, i) => {
      s.position.x += dt * (1.5 + i * 0.4) * (i % 2 ? -1 : 1);
      if (s.position.x > 700) s.position.x = -700;
      if (s.position.x < -700) s.position.x = 700;
    });
    const k = this.env.current;
    const dm = this.distant.mat;
    dm.setColor3('horizon', k.skyHorizon);
    dm.setVector3('sunDir', this.env.sunDir);
    dm.setFloat('light', 0.55 + (1 - k.night) * 0.5);
    dm.setFloat('haze', 0.5 + k.night * 0.25);
  }

  get turbineXZ() {
    return new Vector3(TURBINE.x, 0, TURBINE.z);
  }
}
