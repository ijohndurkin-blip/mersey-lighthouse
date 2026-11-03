import { AbstractMesh, Mesh, Scene } from '../babylon';
import { Batch, ChunkedBatch } from './geo';
import { Mats } from './materials';
import { Terrain } from './terrain';
import { Collision } from './collision';
import type { QualityLevel } from '../core/quality';
import type { Environment } from './environment';

export interface WorldCtx {
  scene: Scene;
  terrain: Terrain;
  col: Collision;
  mats: Mats;
  env: Environment;
  quality: QualityLevel;
  /** static vertex-coloured props, chunked for culling */
  props: ChunkedBatch;
  /** static props that should NOT cast shadows (small details) */
  detail: ChunkedBatch;
  /** foliage with wind sway */
  foliage: ChunkedBatch;
  /** window panes (glow at night) */
  windows: Batch;
  /** warm lamp bulbs (glow at night) */
  bulbs: Batch;
  casters: AbstractMesh[];
  dynamic: Mesh[];
}

export function newCtx(scene: Scene, terrain: Terrain, col: Collision, mats: Mats, env: Environment, quality: QualityLevel): WorldCtx {
  return {
    scene,
    terrain,
    col,
    mats,
    env,
    quality,
    props: new ChunkedBatch(64),
    detail: new ChunkedBatch(64),
    foliage: new ChunkedBatch(64),
    windows: new Batch(),
    bulbs: new Batch(),
    casters: [],
    dynamic: [],
  };
}
