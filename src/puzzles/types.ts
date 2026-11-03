import { AbstractMesh, PickingInfo, Scene, Vector3 } from '../babylon';
import type { World } from '../world/world';
import type { UI } from '../ui/ui';
import type { AudioEngine } from '../audio/audio';
import type { FX } from '../fx/fx';
import type { CameraRig } from '../camera/cameraRig';

export interface PuzzleHost {
  scene: Scene;
  world: World;
  ui: UI;
  audio: AudioEngine;
  fx: FX;
  cam: CameraRig;
  pipSay: (text: string, dur?: number) => void;
}

export function pickAt(scene: Scene, x: number, y: number, pred: (m: AbstractMesh) => boolean): PickingInfo | null {
  const r = scene.pick(x, y, pred);
  return r && r.hit ? r : null;
}

export function tweenVec(from: Vector3, to: Vector3, t: number, arc = 0) {
  const p = Vector3.Lerp(from, to, t);
  p.y += Math.sin(t * Math.PI) * arc;
  return p;
}
