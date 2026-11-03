import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  MirrorTexture,
  Plane,
  Scene,
  ShaderMaterial,
  ShadowGenerator,
  Vector3,
  VertexData,
  Camera,
  AbstractMesh,
  Vector4,
  Color4,
} from '../babylon';
import './shaders';
import { clamp, damp, lerp, smoothstep, distToPolyline } from '../core/noise';
import { Terrain } from './terrain';
import { STREAM } from './layout';
import type { QualityLevel } from '../core/quality';
import { Wind, Mats } from './materials';

interface TodKey {
  t: number;
  sunElev: number;
  sunAz: number;
  sunColor: string;
  sunInt: number;
  hemiSky: string;
  hemiGround: string;
  hemiInt: number;
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  deep: string;
  shallow: string;
  night: number;
  shadow: number;
}

const KEYS: TodKey[] = [
  {
    t: 0,
    sunElev: 40,
    sunAz: 228,
    sunColor: '#fff0d8',
    sunInt: 1.35,
    hemiSky: '#cfe6ff',
    hemiGround: '#b0a088',
    hemiInt: 0.62,
    skyTop: '#3f8fe0',
    skyHorizon: '#cfe7f6',
    fog: '#cfe2ee',
    fogDensity: 0.0024,
    deep: '#11608f',
    shallow: '#36c9c4',
    night: 0,
    shadow: 0.55,
  },
  {
    t: 0.35,
    sunElev: 24,
    sunAz: 218,
    sunColor: '#ffe2b8',
    sunInt: 1.3,
    hemiSky: '#d7e2f6',
    hemiGround: '#a8957c',
    hemiInt: 0.6,
    skyTop: '#4a86d6',
    skyHorizon: '#f3dcc0',
    fog: '#ead9c8',
    fogDensity: 0.0025,
    deep: '#15598a',
    shallow: '#3abfbc',
    night: 0,
    shadow: 0.55,
  },
  {
    t: 0.6,
    sunElev: 8,
    sunAz: 204,
    sunColor: '#ffb06a',
    sunInt: 1.2,
    hemiSky: '#f0b9a6',
    hemiGround: '#7a6452',
    hemiInt: 0.55,
    skyTop: '#3f5fae',
    skyHorizon: '#ff9f72',
    fog: '#f0ad8e',
    fogDensity: 0.0027,
    deep: '#1c4778',
    shallow: '#3a9db0',
    night: 0.05,
    shadow: 0.5,
  },
  {
    t: 0.8,
    sunElev: 1,
    sunAz: 198,
    sunColor: '#ff7a68',
    sunInt: 0.7,
    hemiSky: '#9283c0',
    hemiGround: '#3e3a4c',
    hemiInt: 0.5,
    skyTop: '#232c6a',
    skyHorizon: '#c86f78',
    fog: '#8a6f94',
    fogDensity: 0.0028,
    deep: '#152a58',
    shallow: '#29638a',
    night: 0.45,
    shadow: 0.35,
  },
  {
    t: 1,
    sunElev: 46,
    sunAz: -40,
    sunColor: '#a9bcff',
    sunInt: 0.55,
    hemiSky: '#5e72b8',
    hemiGround: '#252c44',
    hemiInt: 0.5,
    skyTop: '#0b1438',
    skyHorizon: '#2e427e',
    fog: '#22305e',
    fogDensity: 0.0026,
    deep: '#0b1d42',
    shallow: '#1e5272',
    night: 1,
    shadow: 0.35,
  },
];

const C = (h: string) => Color3.FromHexString(h);

function sampleKeys(t: number) {
  t = clamp(t, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  const lc = (x: string, y: string) => Color3.Lerp(C(x), C(y), f);
  const ln = (x: number, y: number) => lerp(x, y, f);
  return {
    sunElev: ln(a.sunElev, b.sunElev),
    sunAz: ln(a.sunAz, b.sunAz),
    sunColor: lc(a.sunColor, b.sunColor),
    sunInt: ln(a.sunInt, b.sunInt),
    hemiSky: lc(a.hemiSky, b.hemiSky),
    hemiGround: lc(a.hemiGround, b.hemiGround),
    hemiInt: ln(a.hemiInt, b.hemiInt),
    skyTop: lc(a.skyTop, b.skyTop),
    skyHorizon: lc(a.skyHorizon, b.skyHorizon),
    fog: lc(a.fog, b.fog),
    fogDensity: ln(a.fogDensity, b.fogDensity),
    deep: lc(a.deep, b.deep),
    shallow: lc(a.shallow, b.shallow),
    night: ln(a.night, b.night),
    shadow: ln(a.shadow, b.shadow),
  };
}

function dirFrom(elevDeg: number, azDeg: number) {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azDeg * Math.PI) / 180;
  // azimuth measured from +x toward +z
  return new Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).normalize();
}

export class Environment {
  sun: DirectionalLight;
  hemi: HemisphericLight;
  shadow: ShadowGenerator;
  sky: Mesh;
  sea: Mesh[] = [];
  stream: Mesh;
  skyMat: ShaderMaterial;
  seaMat: ShaderMaterial;
  streamMat: ShaderMaterial;
  mirror: MirrorTexture | null = null;
  tod = 0;
  targetTod = 0;
  todSpeed = 0.08;
  time = 0;
  sunDir = new Vector3(0, 1, 0);
  night = 0;
  beam = { on: 0, pos: new Vector3(), dir: new Vector3(1, 0, 0) };
  current = sampleKeys(0);
  onNightChange: ((night: number) => void)[] = [];

  constructor(
    private scene: Scene,
    private terrain: Terrain,
    private quality: QualityLevel,
    private mats: Mats,
  ) {
    scene.clearColor = C('#cfe7f6').toColor4(1);
    scene.ambientColor = new Color3(0.2, 0.2, 0.2);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0024;

    this.hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
    this.sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene);
    this.sun.position = new Vector3(0, 60, 0);
    this.sun.autoUpdateExtends = false;
    this.sun.shadowFrustumSize = quality === 'low' ? 60 : 78;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 260;
    const mapSize = quality === 'high' ? 2048 : quality === 'medium' ? 2048 : 1024;
    this.shadow = new ShadowGenerator(mapSize, this.sun);
    this.shadow.usePercentageCloserFiltering = quality !== 'low';
    this.shadow.filteringQuality = quality === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    if (quality === 'low') this.shadow.usePoissonSampling = true;
    this.shadow.bias = 0.0012;
    this.shadow.normalBias = 0.02;
    this.shadow.darkness = 0.45;
    this.shadow.transparencyShadow = false;

    // ---------------- sky
    this.sky = MeshBuilder.CreateSphere('sky', { diameter: 3600, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.sky.infiniteDistance = true;
    this.sky.isPickable = false;
    this.skyMat = new ShaderMaterial('skyMat', scene, 'sky', {
      attributes: ['position'],
      uniforms: ['world', 'viewProjection', 'sunDir', 'moonDir', 'topColor', 'horizonColor', 'sunColor', 'time', 'night'],
    });
    this.skyMat.backFaceCulling = false;
    this.skyMat.disableDepthWrite = true;
    this.sky.material = this.skyMat;
    this.sky.renderingGroupId = 0;
    this.sky.applyFog = false;

    // ---------------- sea
    const depthTex = terrain.depthTexture(scene);
    this.seaMat = new ShaderMaterial(
      'seaMat',
      scene,
      'sea',
      {
        attributes: ['position'],
        uniforms: [
          'world',
          'viewProjection',
          'time',
          'waveAmp',
          'cameraPos',
          'sunDir',
          'sunColor',
          'skyTop',
          'skyHorizon',
          'deepColor',
          'shallowColor',
          'fogColor',
          'fogDensity',
          'night',
          'depthRect',
          'useMirror',
          'beamPos',
          'beamDir',
          'beamOn',
        ],
        samplers: ['depthTex', 'mirrorTex'],
        needAlphaBlending: true,
      },
    );
    this.seaMat.setTexture('depthTex', depthTex);
    this.seaMat.setVector4('depthRect', new Vector4(terrain.minX, terrain.minZ, terrain.sizeX, terrain.sizeZ));
    this.seaMat.backFaceCulling = false;
    this.seaMat.setFloat('useMirror', 0);
    this.seaMat.setTexture('mirrorTex', depthTex);

    const near = MeshBuilder.CreateGround('seaNear', { width: 520, height: 480, subdivisions: quality === 'low' ? 90 : 150 }, scene);
    near.position.set(5, 0, 5);
    near.material = this.seaMat;
    near.isPickable = false;
    near.alphaIndex = 10;
    this.sea.push(near);
    // far ring: four big flat quads around the near patch
    const far = this.buildFarSea(scene, 5, 5, 260, 240, 3400);
    far.material = this.seaMat;
    far.isPickable = false;
    this.sea.push(far);

    if (quality === 'high') {
      this.mirror = new MirrorTexture('seaMirror', { ratio: 0.5 }, scene, true);
      this.mirror.mirrorPlane = new Plane(0, -1, 0, 0.0);
      this.mirror.refreshRate = 1;
      this.mirror.clearColor = new Color4(0, 0, 0, 0);
      this.seaMat.setTexture('mirrorTex', this.mirror);
      this.seaMat.setFloat('useMirror', 1);
    }

    // ---------------- stream
    this.streamMat = new ShaderMaterial(
      'streamMat',
      scene,
      'stream',
      {
        attributes: ['position', 'uv'],
        uniforms: [
          'world',
          'viewProjection',
          'time',
          'cameraPos',
          'sunDir',
          'sunColor',
          'skyTop',
          'skyHorizon',
          'fogColor',
          'fogDensity',
          'night',
          'speed',
        ],
        needAlphaBlending: true,
      },
    );
    this.streamMat.setFloat('speed', 0.55);
    this.streamMat.backFaceCulling = false;
    this.stream = this.buildStream(scene);
    this.stream.material = this.streamMat;
    this.stream.alphaIndex = 11;

    this.apply(0);
  }

  addMirrorMeshes(meshes: AbstractMesh[]) {
    if (!this.mirror) return;
    this.mirror.renderList!.push(...meshes);
  }

  private buildFarSea(scene: Scene, cx: number, cz: number, hw: number, hd: number, ext: number) {
    const pos: number[] = [];
    const idx: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number) => {
      const b = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    };
    quad(cx - ext, cz + hd, cx + ext, cz + ext);
    quad(cx - ext, cz - ext, cx + ext, cz - hd);
    quad(cx - ext, cz - hd, cx - hw, cz + hd);
    quad(cx + hw, cz - hd, cx + ext, cz + hd);
    const vd = new VertexData();
    vd.positions = pos;
    vd.indices = idx;
    const m = new Mesh('seaFar', scene);
    vd.applyToMesh(m);
    return m;
  }

  private buildStream(scene: Scene) {
    // ribbon along the stream polyline
    const pts = STREAM;
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let s = 0;
    const across = 6;
    let rows = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i > 0) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const st = this.terrain.streamInfo(x, z);
      if (x > 104 || (i > 4 && this.terrain.landFrac(x, z) < 0.55)) break;
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const nx = -tz;
      const nz = tx;
      const W = st.width + 0.7;
      for (let k = 0; k <= across; k++) {
        const v = (k / across) * 2 - 1;
        pos.push(x + nx * v * W, st.surface, z + nz * v * W);
        uvs.push(s, v);
      }
      rows++;
    }
    const row = across + 1;
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < across; k++) {
        const a = r * row + k;
        idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    const vd = new VertexData();
    vd.positions = pos;
    vd.uvs = uvs;
    vd.indices = idx;
    const m = new Mesh('stream', scene);
    vd.applyToMesh(m);
    m.isPickable = false;
    return m;
  }

  setTod(t: number, instant = false) {
    this.targetTod = t;
    if (instant) {
      this.tod = t;
      this.apply(t);
    }
  }

  private apply(t: number) {
    const k = sampleKeys(t);
    this.current = k;
    const sd = dirFrom(k.sunElev, k.sunAz);
    this.sunDir.copyFrom(sd);
    this.sun.direction = sd.scale(-1);
    this.sun.diffuse = k.sunColor;
    this.sun.specular = k.sunColor.scale(0.6);
    this.sun.intensity = k.sunInt;
    this.hemi.diffuse = k.hemiSky;
    this.hemi.groundColor = k.hemiGround;
    this.hemi.intensity = k.hemiInt;
    this.hemi.specular = Color3.Black();
    this.shadow.darkness = 1 - k.shadow;
    this.scene.fogColor = k.fog;
    this.scene.fogDensity = k.fogDensity;
    this.scene.clearColor = k.skyHorizon.toColor4(1);
    this.night = k.night;
    const moon = dirFrom(38, -40);
    const s = this.skyMat;
    s.setVector3('sunDir', sd);
    s.setVector3('moonDir', moon);
    s.setColor3('topColor', k.skyTop);
    s.setColor3('horizonColor', k.skyHorizon);
    s.setColor3('sunColor', k.sunColor);
    s.setFloat('night', k.night);
    for (const m of [this.seaMat, this.streamMat]) {
      m.setVector3('sunDir', sd);
      m.setColor3('sunColor', k.sunColor);
      m.setColor3('skyTop', k.skyTop);
      m.setColor3('skyHorizon', k.skyHorizon);
      m.setColor3('fogColor', k.fog);
      m.setFloat('fogDensity', k.fogDensity * 0.85);
      m.setFloat('night', k.night);
    }
    this.seaMat.setColor3('deepColor', k.deep);
    this.seaMat.setColor3('shallowColor', k.shallow);
    // emissive window glow at dusk
    const glow = smoothstep(0.45, 0.85, t);
    this.mats.windows.emissiveColor = Color3.Lerp(new Color3(0.04, 0.05, 0.07), new Color3(1.0, 0.72, 0.36), glow);
    this.mats.windows.diffuseColor = Color3.Lerp(new Color3(0.3, 0.42, 0.52), new Color3(0.4, 0.3, 0.2), glow);
    for (const cb of this.onNightChange) cb(glow);
  }

  update(dt: number, camera: Camera, focus: Vector3) {
    this.time += dt;
    Wind.time += dt;
    if (Math.abs(this.tod - this.targetTod) > 0.0005) {
      const dir = Math.sign(this.targetTod - this.tod);
      this.tod += dir * Math.min(Math.abs(this.targetTod - this.tod), this.todSpeed * dt);
      this.apply(this.tod);
    }
    // shadow frustum follows the focus point
    const sd = this.sunDir;
    this.sun.position.set(focus.x + sd.x * 90, focus.y + sd.y * 90, focus.z + sd.z * 90);
    const cp = camera.globalPosition;
    this.skyMat.setFloat('time', this.time);
    for (const m of [this.seaMat, this.streamMat]) {
      m.setFloat('time', this.time);
      m.setVector3('cameraPos', cp);
    }
    this.seaMat.setFloat('waveAmp', 1);
    this.seaMat.setVector3('beamPos', this.beam.pos);
    this.seaMat.setVector3('beamDir', this.beam.dir);
    this.seaMat.setFloat('beamOn', this.beam.on);
  }

  /** Approximate sea wave height for floating objects. */
  waveHeight(x: number, z: number) {
    const t = this.time;
    return (
      Math.sin(x * 0.08 + z * 0.05 + t * 0.9) * 0.28 +
      Math.sin(x * -0.05 + z * 0.11 + t * 1.25) * 0.16 +
      Math.sin(x * 0.19 - z * 0.13 + t * 1.9) * 0.07
    );
  }

  /** distance from point to stream centreline (for ambient audio) */
  streamDistance(x: number, z: number) {
    return distToPolyline(x, z, STREAM).d;
  }
}

export { damp };
