// Developer-only character viewer: open the game with ?viewer=1 to see the hero on a studio backdrop.
import { Color3, Color4, DirectionalLight, Engine, FreeCamera, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3 } from '../babylon';
import { createMaterials } from '../world/materials';
import { buildPanda } from '../characters/panda';
import { Rig } from '../characters/rig';
import { EXPLORER_LOOKS } from '../characters/cast';

export function runViewer(canvas: HTMLCanvasElement) {
  const u = new URL(location.href);
  const num = (k: string, d: number) => (u.searchParams.has(k) ? parseFloat(u.searchParams.get(k)!) : d);
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.36, 0.37, 0.4, 1);
  const mats = createMaterials(scene);
  const hemi = new HemisphericLight('h', new Vector3(0.1, 1, 0.2), scene);
  hemi.diffuse = new Color3(0.8, 0.86, 1);
  hemi.groundColor = new Color3(0.62, 0.58, 0.55);
  hemi.intensity = 0.5;
  hemi.specular = Color3.Black();
  const sun = new DirectionalLight('s', new Vector3(0.55, -1, 0.75).normalize(), scene);
  sun.position = new Vector3(-6, 12, -9);
  sun.intensity = 0.95;
  sun.diffuse = new Color3(1, 0.95, 0.86);
  const sg = new ShadowGenerator(2048, sun);
  sg.usePercentageCloserFiltering = true;
  sg.bias = 0.002;
  sg.normalBias = 0.02;
  sg.darkness = 0.45;
  const floor = MeshBuilder.CreateGround('floor', { width: 30, height: 30 }, scene);
  const fm = new StandardMaterial('fm', scene);
  fm.diffuseColor = new Color3(0.42, 0.43, 0.46);
  fm.specularColor = Color3.Black();
  floor.material = fm;
  floor.receiveShadows = true;
  const t0 = performance.now();
  const p = buildPanda(scene, mats, EXPLORER_LOOKS[Math.round(num('look', 0))].shirt, num('detail', 1));
  (window as any).__sculptMs = Math.round(performance.now() - t0);
  (window as any).__tris = p.meshes.reduce((a, m) => a + m.getTotalIndices() / 3, 0);
  for (const m of p.meshes) {
    sg.getShadowMap()!.renderList!.push(m);
    m.receiveShadows = true;
  }
  const rig = new Rig(p);
  rig.foreScale = 0.3;
  rig.stride = 0.85;
  if (!u.searchParams.has('anim')) (rig as any).lookTimer = 1e9;
  rig.speed = num('speed', 0);
  const yaw = (num('a', 0) * Math.PI) / 180;
  const dist = num('d', 4.4);
  const ty = num('ty', 0.82);
  const cam = new FreeCamera('c', new Vector3(Math.sin(yaw) * dist, ty + num('up', 0.1), -Math.cos(yaw) * dist), scene);
  cam.fov = num('fov', 0.45);
  cam.minZ = 0.05;
  cam.setTarget(new Vector3(0, ty, 0));
  p.root.rotation.y = Math.PI;
  const frame = (dt: number) => {
    rig.update(dt);
    p.fill.direction.copyFrom(cam.getDirection(Vector3.Forward()));
    scene.render();
  };
  (window as any).__frame = (n: number) => {
    for (let i = 0; i < n; i++) frame(1 / 30);
    return canvas.toDataURL('image/png');
  };
  if (!u.searchParams.has('shot')) engine.runRenderLoop(() => frame(Math.min(0.05, engine.getDeltaTime() / 1000)));
  window.addEventListener('resize', () => engine.resize());
  scene.render();
  scene.whenReadyAsync().then(() => ((window as any).__ready = true));
}
