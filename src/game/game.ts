import { Color3, Color4, Engine, Matrix, Mesh, Scene, TransformNode, Vector3, DefaultRenderingPipeline, ParticleSystem } from '@babylonjs/core';
import { applyScaling, createEngine, createPipeline } from '../core/renderer';
import { detectQuality, isTouchDevice, QualityLevel, saveQuality } from '../core/quality';
import { World } from '../world/world';
import { buildExplorer, buildFinn, buildPip, buildProfessor, EXPLORER_LOOKS } from '../characters/cast';
import { NPC, Pip, Player } from '../characters/actors';
import { CameraRig, Shot } from '../camera/cameraRig';
import { Input } from '../input/input';
import { UI, Line } from '../ui/ui';
import { AudioEngine } from '../audio/audio';
import { FX } from '../fx/fx';
import { Creatures } from '../world/creatures';
import { BridgePuzzle } from '../puzzles/bridge';
import { GearPuzzle } from '../puzzles/gears';
import { CircuitPuzzle, TurbineControl } from '../puzzles/energy';
import { PuzzleHost } from '../puzzles/types';
import { Batch, Shape, T } from '../world/geo';
import {
  BRIDGE,
  BUNDLES,
  FINN_POS,
  JETTY,
  LIGHTHOUSE,
  PANEL,
  PLAYER_START,
  PROF_POS,
  RESCUE_PATH,
  STARFISH,
  TURBINE,
  VILLAGE_SQUARE,
  WORKSHOP,
} from '../world/layout';
import {
  BRIDGE_DONE,
  CAPTIONS,
  FINN_INTRO,
  FINN_LATER,
  GEARS_DONE,
  HINTS,
  OBJECTIVES,
  PANEL_DONE,
  PIP_INTRO,
  PROF_INTRO,
  QUIPS,
  Stage,
  TURBINE_DONE,
} from './story';
import { clamp, easeInOut, smoothstep } from '../core/noise';

type Mode = 'loading' | 'title' | 'cinematic' | 'play' | 'dialogue' | 'puzzle' | 'paused' | 'complete';

interface Interactable {
  id: string;
  pos: () => Vector3;
  r: number;
  label: () => string | null;
  act: () => void;
}

interface SaveData {
  stage: number;
  bundles: string[];
  starfish: number[];
  look: number;
  time: number;
}

const SAVE_KEY = 'mm.save.v1';
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Game {
  engine!: Engine;
  scene!: Scene;
  quality!: QualityLevel;
  world!: World;
  cam!: CameraRig;
  input!: Input;
  ui: UI;
  audio = new AudioEngine();
  fx!: FX;
  creatures!: Creatures;
  pipeline: DefaultRenderingPipeline | null = null;
  player!: Player;
  pip!: Pip;
  finn!: NPC;
  prof!: NPC;
  bridge!: BridgePuzzle;
  gears!: GearPuzzle;
  turbine!: TurbineControl;
  circuit!: CircuitPuzzle;
  mode: Mode = 'loading';
  private prevMode: Mode = 'play';
  stage: Stage = Stage.Intro;
  bundles = new Set<string>();
  starfish = new Set<number>();
  look = 0;
  playTime = 0;
  time = 0;
  private interactables: Interactable[] = [];
  private current: Interactable | null = null;
  private bundleMeshes: { id: string; node: TransformNode; ps: ParticleSystem }[] = [];
  private starMeshes: { i: number; node: TransformNode; ps: ParticleSystem }[] = [];
  private stageTimer = 0;
  private hintIdx = 0;
  private lastQuip = 0;
  private jumps = 0;
  private activePuzzle: 'bridge' | 'gears' | 'circuit' | null = null;
  private windFlow!: ReturnType<FX['energyFlow']>;
  private lhFlow!: ReturnType<FX['energyFlow']>;
  private rescueMoving = false;
  private rescueDist = 0;
  private rescueDone = false;
  private beamOn = 0;
  private fireworks = false;
  private fwTimer = 0;
  private skipRequested = false;
  private closePause: (() => void) | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private dynScale = 1;
  private titleOrbit = 0;
  private hasLens = false;
  private lensCarry: Mesh | null = null;
  private debugFrame?: (n: number) => string;

  constructor(private canvas: HTMLCanvasElement, uiRoot: HTMLDivElement) {
    this.ui = new UI(uiRoot);
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  async boot() {
    const loader = this.ui.loading();
    const step = async (p: number, label: string) => {
      loader.set(p, label);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    };
    await step(0.02, 'Waking up the island…');
    this.quality = detectQuality();
    this.engine = createEngine(this.canvas, this.quality);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.world = new World(this.scene, this.quality);
    await this.world.build(step);
    this.cam = new CameraRig(this.scene, this.world.terrain);
    this.pipeline = createPipeline(this.scene, this.cam.cam, this.quality);
    this.fx = new FX(this.scene);
    this.input = new Input(this.canvas, document.getElementById('ui')!);
    this.input.onTap = (x, y) => this.onTap(x, y);
    this.creatures = new Creatures(this.scene, this.world, this.fx);
    await step(0.9, 'Waking up the characters…');
    this.load();
    this.buildCharacters();
    this.buildPuzzles();
    this.buildCollectibles();
    this.setupInteractables();
    this.setupUIHooks();
    // ambient effects
    this.fx.chimneySmoke(this.world.workshop.chimneyTop);
    const sq = VILLAGE_SQUARE;
    this.fx.fountain(new Vector3(sq[0], this.world.terrain.sample(sq[0], sq[1]) + 2.05, sq[1]));
    this.fx.windLeaves(() => this.player.pos);
    this.windFlow = this.fx.energyFlow(this.world.cottage.cablePoints[0], new Color3(0.3, 0.95, 1));
    this.lhFlow = this.fx.energyFlow(this.world.cottage.cablePoints[1], new Color3(1, 0.9, 0.4));
    await step(0.96, 'Polishing the lighthouse…');
    this.world.env.setTod(0.12, true);
    this.cam.cam.position.set(140, 60, -120);
    this.cam.cam.setTarget(new Vector3(10, 5, 10));
    this.scene.render();
    await this.scene.whenReadyAsync();
    loader.set(1, 'Ready!');
    loader.done();
    window.addEventListener('resize', () => this.engine.resize());
    const u = new URL(location.href);
    this.debugFrame = (n: number) => {
      for (let i = 0; i < n; i++) this.frame(1 / 30);
      return this.canvas.toDataURL('image/png');
    };
    (window as any).__frame = this.debugFrame;
    if (!u.searchParams.has('shot')) this.engine.runRenderLoop(() => this.frame());
    this.showTitle();
    (window as any).__ready = true;
  }

  // ===========================================================================
  // Setup helpers
  // ===========================================================================
  private buildCharacters() {
    const { scene, world } = this;
    const sh = world.env.shadow;
    const ex = buildExplorer(scene, world.mats, EXPLORER_LOOKS[this.look]);
    this.player = new Player(ex, world.col, sh);
    this.player.teleport(PLAYER_START.x, PLAYER_START.z, 0);
    this.player.onStep = (s, run) => this.audio.step(s, run);
    this.player.onJump = () => {
      this.audio.jump();
      this.jumps++;
      if (this.jumps === 3) this.ui.pipSay(pick(QUIPS.jump), 3);
    };
    this.player.onLand = (i) => {
      this.audio.land();
      if (i > 0.3) this.fx.dust(this.player.pos.add(new Vector3(0, 0.1, 0)), 10);
    };
    this.pip = new Pip(buildPip(scene, world.mats), world.col, sh);
    this.pip.place(this.player.pos.add(new Vector3(-1.5, 2, 0)));
    this.finn = new NPC('Captain Finn', buildFinn(scene, world.mats), world.col, sh, FINN_POS[0], FINN_POS[1], Math.PI, 150);
    this.prof = new NPC('Professor Cogsworth', buildProfessor(scene, world.mats), world.col, sh, BRIDGE.x + 1.5, BRIDGE.halfLen + 3.5, Math.PI, 230);
    world.col.addCircle({ x: 0, z: 0, r: 0.6, enabled: () => false });
  }

  private rebuildPlayer() {
    const pos = this.player.pos.clone();
    const yaw = this.player.yaw;
    for (const m of this.player.nodes.meshes) m.dispose();
    this.player.nodes.root.dispose();
    const ex = buildExplorer(this.scene, this.world.mats, EXPLORER_LOOKS[this.look]);
    const old = this.player;
    this.player = new Player(ex, this.world.col, this.world.env.shadow);
    this.player.onStep = old.onStep;
    this.player.onJump = old.onJump;
    this.player.onLand = old.onLand;
    this.player.teleport(pos.x, pos.z, yaw);
  }

  private host(): PuzzleHost {
    return {
      scene: this.scene,
      world: this.world,
      ui: this.ui,
      audio: this.audio,
      fx: this.fx,
      cam: this.cam,
      pipSay: (t, d) => this.ui.pipSay(t, d),
    };
  }

  private buildPuzzles() {
    const host = this.host();
    this.bridge = new BridgePuzzle(host);
    this.bridge.onExit = () => this.endPuzzle();
    this.bridge.onSolved = () => this.onBridgeSolved();
    this.gears = new GearPuzzle(host, this.world.workshop.boardAnchor);
    this.gears.onExit = () => this.endPuzzle();
    this.gears.onSolved = () => this.onGearsSolved();
    this.turbine = new TurbineControl(host, this.world.turbine);
    this.turbine.onAligned = () => this.onTurbineAligned();
    this.circuit = new CircuitPuzzle(host, this.world.cottage.panelAnchor);
    this.circuit.onExit = () => this.endPuzzle();
    this.circuit.onSolved = () => this.onCircuitSolved();
    this.circuit.onPower = (pct, w, s) => {
      if (this.stage >= Stage.Turbine) this.ui.setPower(pct, w, s);
      this.world.cottage.batteryLights.forEach((m, i) => {
        (m.material as any).emissiveColor = i < pct / 25 ? new Color3(0.3, 1, 0.5) : new Color3(0.2, 0.25, 0.3);
      });
    };
  }

  private buildCollectibles() {
    const { scene, world } = this;
    // bridge part bundles
    for (const b of BUNDLES) {
      const node = new TransformNode('bundle_' + b.id, scene);
      const y = world.terrain.sample(b.x, b.z);
      node.position.set(b.x, y, b.z);
      const bb = new Batch();
      if (b.id === 'posts') {
        for (let i = 0; i < 3; i++) bb.add(Shape.rbox(0.34, 0.34, 2.2 - i * 0.3, 0.06, 1), T(-0.4 + i * 0.4, 0.17, 0, 0, 0.1 * i, 0), '#8b5e3c', { noise: 0.1 });
        bb.add(Shape.torus(1.3, 0.05, 12), T(0, 0.25, 0, 0, 0, Math.PI / 2, 1, 0.5, 1), '#d8c49a');
      } else if (b.id === 'beams') {
        for (let i = 0; i < 3; i++) bb.add(Shape.rbox(0.3, 0.3, 3.4, 0.06, 1), T(-0.35 + i * 0.35, 0.15 + (i === 1 ? 0.3 : 0), 0), '#b98552', { noise: 0.1 });
      } else {
        bb.add(Shape.prism([[-0.8, 0], [0.8, 0], [0, 1.2]], 0.14), T(0, 0.02, 0, Math.PI / 2, 0, 0), '#a67446');
        bb.add(Shape.prism([[-0.8, 0], [0.8, 0], [0, 1.2]], 0.14), T(0.1, 0.18, 0.1, Math.PI / 2, 0.4, 0), '#c9965f');
        bb.add(Shape.rbox(1.2, 0.14, 1.2, 0.04, 1), T(-0.2, 0.34, -0.1, 0, 0.8, 0), '#b98552');
      }
      // ribbon tag
      bb.add(Shape.sphere(0.3, 8), T(0, 0.8, 0), '#ffd23f');
      const m = bb.build('bundleMesh', scene, world.mats.vc, node);
      world.env.shadow.getShadowMap()!.renderList!.push(m);
      const ps = this.fx.glimmer(node.position.add(new Vector3(0, 0.3, 0)));
      const has = this.bundles.has(b.id);
      node.setEnabled(!has && this.stage >= Stage.Collect);
      if (has || this.stage < Stage.Collect) ps.stop();
      this.bundleMeshes.push({ id: b.id, node, ps });
    }
    // starfish
    const star: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.16 : 0.42;
      star.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    STARFISH.forEach(([x, z], i) => {
      const node = new TransformNode('starfish', scene);
      const g = world.col.groundAt(x, z, 50);
      node.position.set(x, g.y + 0.45, z);
      const sb = new Batch();
      sb.add(Shape.prism(star, 0.12), T(0, 0, 0), '#ff8a5c', { top: '#ffb38a' });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        sb.add(Shape.sphere(0.06, 5), T(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.07), '#ffffff');
      }
      const m = sb.build('starfishMesh', scene, world.mats.char, node);
      m.isPickable = false;
      const ps = this.fx.glimmer(node.position.add(new Vector3(0, -0.2, 0)), new Color4(1, 0.6, 0.4, 1), 5);
      if (this.starfish.has(i)) {
        node.setEnabled(false);
        ps.stop();
      }
      this.starMeshes.push({ i, node, ps });
    });
  }

  private setupInteractables() {
    const W = this.world;
    const boardPos = () => Vector3.TransformCoordinates(new Vector3(0, -1.2, 3.0), W.workshop.boardAnchor.getWorldMatrix());
    const bridgeSite = new Vector3(BRIDGE.x, BRIDGE.bankY, -BRIDGE.halfLen - 1.6);
    const panelPos = () => Vector3.TransformCoordinates(new Vector3(0, 0, 2.2), W.cottage.panelAnchor.getWorldMatrix());
    this.interactables = [
      {
        id: 'finn',
        pos: () => this.finn.pos,
        r: 3.2,
        label: () => 'Talk to Captain Finn',
        act: () => this.talkFinn(),
      },
      {
        id: 'prof',
        pos: () => this.prof.pos,
        r: 3.2,
        label: () => (this.prof.path.length ? null : 'Talk to the Professor'),
        act: () => this.talkProf(),
      },
      {
        id: 'bridge',
        pos: () => bridgeSite,
        r: 4.5,
        label: () => (this.bridge.solved ? null : this.stage >= Stage.BuildBridge ? 'Build the bridge' : 'Look at the broken bridge'),
        act: () => {
          if (this.stage === Stage.BuildBridge) this.startPuzzle('bridge');
          else if (this.stage < Stage.BuildBridge) {
            this.ui.pipSay(
              this.stage < Stage.Collect ? "The bridge is broken! Let's talk to Captain Finn first." : `We need all the bridge parts first! We have <b>${this.bundles.size} of 3</b>.`,
              4,
            );
          }
        },
      },
      {
        id: 'board',
        pos: boardPos,
        r: 3.4,
        label: () => (this.gears.solved ? null : 'Use the gear machine'),
        act: () => {
          if (this.stage === Stage.Gears) this.startPuzzle('gears');
          else if (this.stage < Stage.Gears) this.ui.pipSay("Let's talk to the Professor first – it's his machine!", 4);
        },
      },
      {
        id: 'turbine',
        pos: () => W.turbine.basePos,
        r: 4.2,
        label: () => (this.turbine.locked ? null : 'Turn the turbine'),
        act: () => {
          if (this.stage < Stage.Turbine) {
            this.ui.pipSay("The turbine is facing the wrong way! We'll need the Professor's lens before we fix the power, though.", 4.5);
            return;
          }
          this.player.rig.play('interact', 0.8);
          this.turbine.turn();
          if (!this.turbine.aligned && this.turbine.presses === 2) this.ui.pipSay('Look at the <b>windsock</b>! Its big open end faces where the wind is coming from.', 5);
        },
      },
      {
        id: 'panel',
        pos: panelPos,
        r: 3.2,
        label: () => (this.circuit.solved ? null : 'Open the power panel'),
        act: () => {
          if (this.stage >= Stage.Panel || (this.stage === Stage.Turbine && this.turbine.aligned)) this.startPuzzle('circuit');
          else if (this.stage === Stage.Turbine) {
            this.ui.pipSay("Let's get the wind turbine spinning first – it's up on the hill!", 4);
          } else this.ui.pipSay('The power panel! We will need this later.', 3);
        },
      },
      {
        id: 'door',
        pos: () => W.lighthouse.doorPos,
        r: 3.8,
        label: () => (this.stage === Stage.Lens ? 'Place the Sun Lens' : this.stage >= Stage.Finale ? null : 'Lighthouse door'),
        act: () => {
          if (this.stage === Stage.Lens) this.finale();
          else this.ui.pipSay(this.hasLens ? 'The lighthouse has no power yet! Let\'s fix the turbine and the power panel.' : "The lighthouse is dark… We'll need the Sun Lens AND electricity.", 4.5);
        },
      },
    ];
  }

  private setupUIHooks() {
    const ui = this.ui;
    ui.onVoice = (who) => {
      const p = who === 'pip' ? 520 : who === 'finn' ? 150 : who === 'prof' ? 240 : 330;
      this.audio.voice(p);
    };
    ui.onPause = () => this.togglePause();
    ui.onHint = () => this.giveHint(true);
    ui.onSoundToggle = () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.muted);
      ui.setSound(!this.audio.muted);
    };
    ui.setSound(!this.audio.muted);
    ui.onInteractTap = () => this.input.pressInteract();
    ui.onJumpTap = () => this.input.pressJump();
    ui.onClick = () => this.audio.click();
  }

  // ===========================================================================
  // Title & flow
  // ===========================================================================
  private showTitle() {
    this.mode = 'title';
    this.ui.showHud(false);
    this.audio.setMood('title');
    const saved = this.readSave();
    this.ui.title({
      canContinue: !!saved && saved.stage > Stage.MeetFinn,
      look: this.look,
      looks: EXPLORER_LOOKS,
      onLook: (i) => {
        this.look = i;
        this.audio.unlock();
        this.audio.select();
      },
      onStart: () => {
        this.audio.unlock();
        this.audio.click();
        this.requestFullscreenOnTouch();
        this.newGame();
      },
      onContinue: () => {
        this.audio.unlock();
        this.audio.click();
        this.requestFullscreenOnTouch();
        this.continueGame();
      },
      onFullscreen: () => this.toggleFullscreen(),
    });
  }

  private requestFullscreenOnTouch() {
    if (isTouchDevice()) this.toggleFullscreen(true);
  }

  private toggleFullscreen(onlyEnter = false) {
    const d = document as any;
    const el = document.documentElement as any;
    try {
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())?.catch?.(() => undefined);
        (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => undefined);
      } else if (!onlyEnter) (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch?.(() => undefined);
    } catch {
      /* not permitted */
    }
  }

  private async newGame() {
    this.clearSave();
    if (this.look !== 0) this.rebuildPlayer();
    this.stage = Stage.Intro;
    this.bundles.clear();
    this.playTime = 0;
    await this.introCinematic();
    this.startPlay();
    this.setStage(Stage.MeetFinn);
    await sleep(400);
    await this.talk(PIP_INTRO, this.pip.pos, false);
  }

  private continueGame() {
    const s = this.readSave();
    if (!s) return this.newGame();
    if (this.look !== s.look) {
      this.look = s.look;
      this.rebuildPlayer();
    }
    this.playTime = s.time;
    for (const b of s.bundles) this.bundles.add(b);
    for (const i of s.starfish) this.starfish.add(i);
    this.restoreStage(s.stage);
    this.startPlay();
  }

  private restoreStage(st: Stage) {
    const W = this.world;
    if (st >= Stage.Finale) st = Stage.Free;
    if (st > Stage.BuildBridge) this.bridge.buildInstant();
    if (st > Stage.BuildBridge) this.prof.place(PROF_POS[0], PROF_POS[1], Math.PI / 2);
    if (st > Stage.Gears) {
      this.gears.solveInstant();
      this.hasLens = true;
    }
    if (st > Stage.Turbine) {
      this.turbine.setAlignedInstant();
      this.circuit.setWind(true);
      this.windFlow.setOn(true);
      W.cottage.cableMat.emissiveColor = new Color3(0.1, 0.5, 0.6);
    }
    if (st > Stage.Panel) this.circuit.solveInstant();
    if (st === Stage.Free) {
      this.lightLighthouse(1);
      this.rescueDone = true;
      const end = RESCUE_PATH[RESCUE_PATH.length - 1];
      W.rescue.node.position.set(end[0], 0, end[1]);
      W.rescue.node.rotation.y = Math.PI;
    }
    for (const b of this.bundleMeshes) {
      const show = st >= Stage.Collect && !this.bundles.has(b.id);
      b.node.setEnabled(show);
      if (show) b.ps.start();
      else b.ps.stop();
    }
    for (const s of this.starMeshes) {
      if (this.starfish.has(s.i)) {
        s.node.setEnabled(false);
        s.ps.stop();
      }
    }
    // checkpoint positions
    const spots: Record<number, [number, number]> = {
      [Stage.MeetFinn]: [JETTY.x, -70],
      [Stage.Collect]: [8, -52],
      [Stage.BuildBridge]: [1, -14],
      [Stage.ToWorkshop]: [-2, 12],
      [Stage.Gears]: [-14, 17],
      [Stage.Turbine]: [-12, 16],
      [Stage.Panel]: [22, 44],
      [Stage.Lens]: [46, 74],
      [Stage.Free]: [46, 74],
    };
    const sp = spots[st] ?? [JETTY.x, -70];
    this.player.teleport(sp[0], sp[1], 0);
    this.pip.place(this.player.pos.add(new Vector3(-1.5, 2, 0)));
    this.setStage(st, true);
  }

  private startPlay() {
    this.mode = 'play';
    this.ui.showHud(true);
    this.ui.setTouch(isTouchDevice());
    this.ui.setStarfish(this.starfish.size, STARFISH.length);
    this.cam.snapFollow(this.player.pos.add(new Vector3(0, 1.4, 0)), this.player.yaw);
    this.updateMood();
  }

  private setStage(s: Stage, silent = false) {
    this.stage = s;
    this.stageTimer = 0;
    this.hintIdx = 0;
    const o = OBJECTIVES[s];
    if (o) this.ui.setObjective(o.text, o.icon, s === Stage.Collect ? `${this.bundles.size} of 3 found` : o.sub ?? '');
    const prog = s <= Stage.BuildBridge ? 0 : s <= Stage.Gears ? 1 : s <= Stage.Panel ? 2 : s <= Stage.Lens ? 3 : 4;
    this.ui.setProgress(prog);
    const inv: string[] = [];
    if (this.hasLens) inv.push('lens');
    this.ui.setInventory(inv);
    if (s >= Stage.Turbine && s <= Stage.Lens) this.ui.setPower(this.circuit.compute(), this.circuit.windOn && this.circuit.windReach, this.circuit.solarReach);
    else this.ui.setPower(null);
    // time of day follows the story
    const tods: Record<number, number> = {
      [Stage.MeetFinn]: 0.0,
      [Stage.Collect]: 0.08,
      [Stage.BuildBridge]: 0.16,
      [Stage.ToWorkshop]: 0.32,
      [Stage.Gears]: 0.38,
      [Stage.Turbine]: 0.55,
      [Stage.Panel]: 0.66,
      [Stage.Lens]: 0.8,
      [Stage.Free]: 1,
    };
    if (tods[s] !== undefined) this.world.env.setTod(tods[s], silent);
    if (s === Stage.Collect) {
      for (const b of this.bundleMeshes) {
        if (this.bundles.has(b.id)) continue;
        b.node.setEnabled(true);
        b.ps.start();
      }
    }
    if (!silent) this.save();
    this.updateMood();
  }

  private updateMood() {
    if (this.mode === 'puzzle') this.audio.setMood('puzzle');
    else if (this.mode === 'play' || this.mode === 'dialogue') this.audio.setMood(this.world.env.targetTod > 0.75 ? 'night' : 'explore');
  }

  // ===========================================================================
  // Talking
  // ===========================================================================
  private async talk(lines: Line[], focus: Vector3, frame = true) {
    const prev = this.mode;
    this.mode = 'dialogue';
    this.input.reset();
    const pp = this.player.pos;
    if (frame) {
      const mid = Vector3.Lerp(pp, focus, 0.5);
      const d = focus.subtract(pp);
      d.y = 0;
      const len = d.length() || 1;
      d.scaleInPlace(1 / len);
      const side = new Vector3(d.z, 0, -d.x);
      const camPos = mid.add(side.scale(4.6 + len * 0.3)).add(new Vector3(0, 2.0, 0)).add(d.scale(-1.6));
      const g = this.world.terrain.sample(camPos.x, camPos.z) + 1.2;
      if (camPos.y < g) camPos.y = g;
      this.cam.setFixed(camPos, mid.add(new Vector3(0, 1.45, 0)));
      // face each other
      this.player.yaw = Math.atan2(focus.x - pp.x, focus.z - pp.z);
      this.player.nodes.root.rotation.y = this.player.yaw;
    }
    const speakerRig = (who: Line['who']) => (who === 'finn' ? this.finn.rig : who === 'prof' ? this.prof.rig : who === 'explorer' ? this.player.rig : null);
    await this.ui.dialogue(lines, {
      onLine: (l) => {
        const r = speakerRig(l.who);
        if (r) r.play('talk', 2.8);
        if (l.who === 'pip') this.pip.doEmote(Math.random() < 0.5 ? 'nod' : 'jump');
      },
    });
    this.mode = prev === 'dialogue' ? 'play' : prev === 'cinematic' ? 'cinematic' : 'play';
    if (this.mode === 'play') this.cam.release(this.cam.yaw);
  }

  private async talkFinn() {
    if (this.stage === Stage.MeetFinn) {
      await this.talk(FINN_INTRO, this.finn.pos);
      this.finn.rig.play('point', 2);
      this.setStage(Stage.Collect);
      this.ui.toast('New mission: Find the bridge parts!', 'posts');
      this.audio.success();
    } else {
      const l = FINN_LATER[this.stage] ?? [{ who: 'finn', text: this.stage >= Stage.Free ? 'You did it! Bobbin and the animals are safe thanks to you, Lighthouse Hero!' : "Keep going, explorer! The whole island is cheering for you." }];
      await this.talk(l as Line[], this.finn.pos);
    }
  }

  private async talkProf() {
    if (this.stage === Stage.ToWorkshop) {
      await this.talk(PROF_INTRO, this.prof.pos);
      this.setStage(Stage.Gears);
    } else if (this.stage < Stage.BuildBridge + 1) {
      await this.talk([{ who: 'prof', text: "Hello over there! I'm stuck on this side of the stream. Can you fix the bridge?" }], this.prof.pos);
    } else {
      const t =
        this.stage === Stage.Gears
          ? 'The gear machine is at the back of my workshop. Remember: gears that touch spin opposite ways!'
          : this.stage === Stage.Turbine
            ? 'The turbine is up on the hill. Turn it so it faces INTO the wind!'
            : this.stage >= Stage.Free
              ? 'Marvellous! I shall write a whole book about you. Chapter one: The Bridge Builder!'
              : 'Onward to the lighthouse, my clever friend!';
      await this.talk([{ who: 'prof', text: t }], this.prof.pos);
    }
  }

  // ===========================================================================
  // Puzzles
  // ===========================================================================
  private startPuzzle(p: 'bridge' | 'gears' | 'circuit') {
    this.mode = 'puzzle';
    this.activePuzzle = p;
    this.input.reset();
    this.input.joystickEnabled = false;
    this.ui.showHud(false);
    this.ui.prompt(null, false);
    this.audio.setMood('puzzle');
    if (p === 'bridge') this.bridge.enter();
    if (p === 'gears') this.gears.enter();
    if (p === 'circuit') this.circuit.enter();
  }

  private endPuzzle() {
    this.activePuzzle = null;
    this.input.joystickEnabled = true;
    if (this.mode === 'puzzle') {
      this.mode = 'play';
      this.ui.showHud(true);
      this.cam.release(this.cam.yaw);
      this.updateMood();
    }
  }

  private onTap(x: number, y: number) {
    if (this.mode !== 'puzzle') return;
    const r = this.canvas.getBoundingClientRect();
    const px = x - r.left;
    const py = y - r.top;
    if (this.activePuzzle === 'bridge') this.bridge.tap(px, py);
    if (this.activePuzzle === 'gears') this.gears.tap(px, py);
    if (this.activePuzzle === 'circuit') this.circuit.tap(px, py);
  }

  private async onBridgeSolved() {
    this.activePuzzle = null;
    this.input.joystickEnabled = true;
    this.mode = 'cinematic';
    this.audio.bigSuccess();
    this.fx.confetti(new Vector3(BRIDGE.x, BRIDGE.deckY + 1, BRIDGE.z));
    // show the planks flying in
    await this.cam.play({
      from: new Vector3(BRIDGE.x + 12, BRIDGE.deckY + 3, BRIDGE.z - 6),
      to: new Vector3(BRIDGE.x + 7, BRIDGE.deckY + 4.5, BRIDGE.z + 9),
      lookFrom: new Vector3(BRIDGE.x, BRIDGE.deckY, BRIDGE.z),
      dur: 3.8,
    });
    await this.ui.achievement('Bridge Builder', 'You measured, matched and used strong triangles!', 'bridge');
    this.ui.showHud(true);
    this.mode = 'play';
    this.player.teleport(BRIDGE.x, -BRIDGE.halfLen - 2.5, 0);
    this.cam.snapFollow(this.player.pos.add(new Vector3(0, 1.4, 0)), 0);
    this.setStage(Stage.ToWorkshop);
    this.prof.rig.play('celebrate', 2.5);
    await this.talk(BRIDGE_DONE, this.prof.pos);
    // professor walks to the workshop
    const pts = [new Vector3(-3, 0, 11), new Vector3(-10, 0, 14.5), new Vector3(PROF_POS[0], 0, PROF_POS[1])];
    this.prof.walkTo(pts, () => {
      this.prof.homeYaw = Math.PI / 2;
    });
  }

  private async onGearsSolved() {
    this.activePuzzle = null;
    this.input.joystickEnabled = true;
    this.mode = 'cinematic';
    this.hasLens = true;
    this.gears.lens.setEnabled(false);
    this.ui.toast('You got the Sun Lens!', 'lens');
    this.audio.bigSuccess();
    this.fx.confetti(this.world.workshop.boardAnchor.getAbsolutePosition().add(new Vector3(0, 1, 0)));
    await sleep(600);
    await this.ui.achievement('Gear Genius', 'You discovered that touching gears spin opposite ways!', 'gear');
    this.ui.showHud(true);
    this.mode = 'play';
    this.cam.release(this.cam.yaw + Math.PI);
    this.player.rig.play('celebrate', 2);
    await this.talk(GEARS_DONE, this.prof.pos);
    this.setStage(Stage.Turbine);
  }

  private async onTurbineAligned() {
    this.circuit.setWind(true);
    this.windFlow.setOn(true);
    this.world.cottage.cableMat.emissiveColor = new Color3(0.1, 0.5, 0.6);
    this.audio.success();
    this.ui.feedback('Into the wind! Whoosh!', 'good');
    this.fx.sparkle(this.world.turbine.hubPos(), new Color4(0.5, 1, 1, 1), 60);
    this.player.rig.play('cheer', 2);
    await sleep(1600);
    this.mode = 'cinematic';
    await this.cam.play({
      from: new Vector3(TURBINE.x - 16, 20, TURBINE.z - 10),
      to: new Vector3(TURBINE.x - 10, 24, TURBINE.z + 8),
      lookFrom: this.world.turbine.hubPos(),
      dur: 3.2,
    });
    this.mode = 'play';
    this.cam.release(this.cam.yaw);
    await this.talk(TURBINE_DONE, this.pip.pos, false);
    this.setStage(Stage.Panel);
  }

  private async onCircuitSolved() {
    this.activePuzzle = null;
    this.input.joystickEnabled = true;
    this.mode = 'cinematic';
    this.audio.bigSuccess();
    this.audio.ambient.hum = 1;
    this.fx.confetti(this.world.cottage.panelAnchor.getAbsolutePosition().add(new Vector3(0, 2.5, 0)));
    await sleep(900);
    await this.ui.achievement('Energy Expert', 'You powered the lighthouse with wind and sunshine!', 'bolt');
    this.ui.showHud(true);
    this.mode = 'play';
    this.cam.release(this.cam.yaw);
    await this.talk(PANEL_DONE, this.pip.pos, false);
    this.setStage(Stage.Lens);
  }

  // ===========================================================================
  // Cinematics
  // ===========================================================================
  private async shot(s: Shot, caption?: string) {
    if (this.skipRequested) return;
    if (caption !== undefined) this.ui.caption(caption || null);
    await this.cam.play(s);
  }

  private async introCinematic() {
    this.mode = 'cinematic';
    this.skipRequested = false;
    this.ui.setLetterbox(true);
    this.ui.showSkip(() => {
      this.skipRequested = true;
      this.cam.skipShot();
    });
    this.audio.setMood('title');
    this.world.env.setTod(0.02, true);
    const W = this.world;
    const lh = new Vector3(LIGHTHOUSE.x, W.lighthouse.topY - 6, LIGHTHOUSE.z);
    // the taxi waits far out at sea
    const taxiStart = new Vector3(JETTY.x + 30, 0, -160);
    const taxiEnd = new Vector3(JETTY.x + 3.6, 0, JETTY.z1 + 4);
    W.taxi.node.position.copyFrom(taxiStart);
    W.taxi.node.rotation.y = -0.15;
    this.player.nodes.root.setEnabled(false);
    await this.shot({ from: new Vector3(150, 46, -60), to: new Vector3(120, 34, 10), lookFrom: new Vector3(20, 4, 0), lookTo: lh, dur: 6 }, CAPTIONS[0]);
    await this.shot({ from: new Vector3(LIGHTHOUSE.x + 22, W.lighthouse.topY + 2, LIGHTHOUSE.z - 18), lookFrom: lh.add(new Vector3(0, 4, 0)), dur: 6, orbit: 0.9 }, CAPTIONS[1]);
    const boat = W.rescue.node.position;
    await this.shot({ from: boat.add(new Vector3(-16, 5, -14)), to: boat.add(new Vector3(-10, 3, -9)), lookFrom: boat.add(new Vector3(0, 1.2, 0)), dur: 6 }, CAPTIONS[2]);
    await this.shot({ from: boat.add(new Vector3(-30, 14, -40)), to: boat.add(new Vector3(-50, 22, -70)), lookFrom: boat, lookTo: new Vector3(80, 0, 70), dur: 5 }, CAPTIONS[3]);
    // taxi sails in
    this.audio.engine(6.5);
    const taxiShot = this.shot(
      { from: new Vector3(JETTY.x + 26, 7, -122), to: new Vector3(JETTY.x + 14, 5, -95), lookFrom: taxiStart.add(new Vector3(0, 1, 0)), lookTo: taxiEnd.add(new Vector3(0, 1, 0)), dur: 6.5 },
      CAPTIONS[4],
    );
    const t0 = performance.now();
    while (!this.skipRequested && performance.now() - t0 < 6500) {
      const k = easeInOut(Math.min(1, (performance.now() - t0) / 6300));
      W.taxi.node.position.x = taxiStart.x + (taxiEnd.x - taxiStart.x) * k;
      W.taxi.node.position.z = taxiStart.z + (taxiEnd.z - taxiStart.z) * k;
      await sleep(16);
    }
    await taxiShot;
    W.taxi.node.position.x = taxiEnd.x;
    W.taxi.node.position.z = taxiEnd.z;
    W.taxi.node.rotation.y = 0;
    this.ui.caption(null);
    this.ui.showSkip(null);
    await this.ui.fade(true);
    this.player.nodes.root.setEnabled(true);
    this.player.teleport(PLAYER_START.x, PLAYER_START.z, 0);
    this.pip.place(this.player.pos.add(new Vector3(-2, 3, 2)));
    this.world.env.setTod(0, true);
    this.ui.setLetterbox(false);
    this.cam.snapFollow(this.player.pos.add(new Vector3(0, 1.4, 0)), 0);
    await this.ui.fade(false);
    this.skipRequested = false;
  }

  private lightLighthouse(k: number) {
    const L = this.world.lighthouse;
    L.lens.isVisible = true;
    L.glassMat.emissiveColor = new Color3(1, 0.85, 0.5).scale(0.15 + k * 1.3);
    L.glassMat.alpha = 0.55 + k * 0.4;
    (L.lens.material as any).emissiveColor = new Color3(1, 0.9, 0.6).scale(0.3 + k * 1.4);
    L.light.intensity = k * 2.2;
    L.beamPivot.setEnabled(k > 0.05);
    L.beamMat.setFloat('intensity', k * 0.85);
    this.beamOn = k;
    this.world.env.beam.on = k;
  }

  private async finale() {
    this.mode = 'cinematic';
    this.setStage(Stage.Finale, true);
    this.ui.showHud(false);
    this.ui.prompt(null, false);
    this.ui.setLetterbox(true);
    this.audio.setMood('quiet');
    this.skipRequested = false;
    const W = this.world;
    const L = W.lighthouse;
    const top = new Vector3(LIGHTHOUSE.x, L.topY, LIGHTHOUSE.z);
    W.env.todSpeed = 0.12;
    W.env.setTod(0.97);
    // gather everyone near the lighthouse
    const door = L.doorPos;
    const toCot = new Vector3(PANEL.x - LIGHTHOUSE.x, 0, PANEL.z - LIGHTHOUSE.z).normalize();
    const side = new Vector3(toCot.z, 0, -toCot.x);
    const spot = (a: number, b: number) => door.add(toCot.scale(a)).add(side.scale(b));
    const ps = spot(2.5, 0);
    this.player.teleport(ps.x, ps.z, Math.atan2(LIGHTHOUSE.x - ps.x, LIGHTHOUSE.z - ps.z));
    const fs = spot(3.5, 2.6);
    this.finn.place(fs.x, fs.z, Math.atan2(LIGHTHOUSE.x - fs.x, LIGHTHOUSE.z - fs.z));
    const prs = spot(3.5, -2.6);
    this.prof.place(prs.x, prs.z, Math.atan2(LIGHTHOUSE.x - prs.x, LIGHTHOUSE.z - prs.z));
    this.pip.place(spot(1.8, 1.2).add(new Vector3(0, 2, 0)));
    // 1. lens in place
    L.lens.isVisible = true;
    this.fx.sparkle(top, new Color4(1, 0.9, 0.5, 1), 80);
    this.audio.pickup();
    await this.shot({ from: top.add(new Vector3(-7, 1.5, -6)), to: top.add(new Vector3(-5, 0.5, -4)), lookFrom: top, dur: 3.2 }, 'The Sun Lens clicks into place…');
    // 2. energy flows
    this.audio.setMood('night');
    this.audio.zap();
    this.windFlow.setOn(true);
    this.lhFlow.setOn(true);
    W.cottage.cableMat.emissiveColor = new Color3(0.2, 0.8, 1);
    this.audio.ambient.hum = 1;
    const cot = new Vector3(PANEL.x, W.terrain.sample(PANEL.x, PANEL.z) + 3, PANEL.z);
    await this.shot({ from: cot.add(new Vector3(-12, 5, -10)), to: cot.add(new Vector3(-8, 7, 4)), lookFrom: cot, lookTo: top.add(new Vector3(0, -8, 0)), dur: 4 }, 'Wind power and stored sunshine rush along the cables…');
    // 3. glow builds up the tower
    const glowStart = performance.now();
    const ramp = async (dur: number, from: number, to: number) => {
      const t0 = performance.now();
      while (performance.now() - t0 < dur && !this.skipRequested) {
        const k = (performance.now() - t0) / dur;
        this.lightLighthouse(from + (to - from) * k);
        await sleep(16);
      }
      this.lightLighthouse(to);
    };
    void glowStart;
    this.audio.lampOn();
    const s3 = this.shot({ from: new Vector3(LIGHTHOUSE.x - 18, L.baseY + 3, LIGHTHOUSE.z - 22), to: new Vector3(LIGHTHOUSE.x - 16, L.baseY + 10, LIGHTHOUSE.z - 20), lookFrom: new Vector3(LIGHTHOUSE.x, L.baseY + 8, LIGHTHOUSE.z), lookTo: top, dur: 3.5 }, 'The lamp begins to glow…');
    await ramp(3200, 0, 0.35);
    await s3;
    // 4. ignition + rising camera
    this.ui.flash();
    this.audio.setMood('finale');
    this.audio.fanfare();
    this.cam.shake = 0.25;
    const s4 = this.shot(
      { from: new Vector3(LIGHTHOUSE.x - 30, L.baseY + 8, LIGHTHOUSE.z - 34), to: new Vector3(LIGHTHOUSE.x - 70, L.baseY + 70, LIGHTHOUSE.z - 110), lookFrom: top, lookTo: new Vector3(40, 0, 40), dur: 7, fov: 1.05 },
      'The lighthouse shines again!',
    );
    await ramp(1200, 0.35, 1);
    await s4;
    // 5. rescue boat heads home
    this.rescueMoving = true;
    this.audio.engine(10);
    const boat = W.rescue.node;
    const follow = async (dur: number) => {
      const t0 = performance.now();
      while (performance.now() - t0 < dur && !this.skipRequested) {
        const p = boat.position;
        const back = new Vector3(Math.sin(boat.rotation.y), 0, Math.cos(boat.rotation.y)).scale(-14);
        this.cam.setFixed(p.add(back).add(new Vector3(0, 6, 0)), p.add(new Vector3(0, 1.5, 0)));
        this.cam.mode = 'fixed';
        await sleep(16);
      }
    };
    this.ui.caption('Bobbin can see the way home!');
    await follow(5500);
    // fast-forward the voyage
    this.rescueDist = Math.max(this.rescueDist, this.rescuePathLength() - 45);
    await follow(4500);
    // 6. safe in harbour + fireworks
    this.fireworks = true;
    this.ui.caption('Safe and sound in the harbour!');
    const harbour = new Vector3(JETTY.x, 2, JETTY.z1 + 6);
    await this.shot({ from: harbour.add(new Vector3(-18, 10, -22)), to: harbour.add(new Vector3(-24, 16, -12)), lookFrom: harbour, lookTo: harbour.add(new Vector3(0, 12, 20)), dur: 5 });
    // 7. celebration at the lighthouse
    this.player.rig.play('celebrate', 9);
    this.finn.rig.play('cheer', 9);
    this.prof.rig.play('celebrate', 9);
    this.pip.doEmote('spin');
    this.ui.caption('Hooray for the Lighthouse Hero!');
    const mid = Vector3.Lerp(this.finn.pos, this.prof.pos, 0.5);
    const toward = this.player.pos.subtract(new Vector3(LIGHTHOUSE.x, this.player.pos.y, LIGHTHOUSE.z)).normalize();
    await this.shot({ from: mid.add(toward.scale(9)).add(new Vector3(0, 2.5, 0)), to: mid.add(toward.scale(7)).add(new Vector3(0, 2, 0)), lookFrom: mid.add(new Vector3(0, 1.6, 0)), lookTo: mid.add(new Vector3(0, 3.5, 0)), dur: 5 });
    this.ui.caption(null);
    this.ui.setLetterbox(false);
    // finish state even if skipped
    this.lightLighthouse(1);
    if (!this.rescueDone) {
      this.rescueDist = this.rescuePathLength();
      this.rescueMoving = true;
    }
    W.env.setTod(1);
    this.skipRequested = false;
    await this.ui.achievement('Lighthouse Hero', 'You saved Mersey Isle!', 'lighthouse', 3.4);
    this.complete();
  }

  private complete() {
    this.mode = 'complete';
    this.stage = Stage.Free;
    this.save();
    const mins = Math.floor(this.playTime / 60);
    const secs = Math.floor(this.playTime % 60);
    const all = this.starfish.size >= STARFISH.length;
    this.ui.complete({
      badges: [
        { title: 'Bridge Builder', desc: 'Shapes & measuring', icon: 'bridge', got: true },
        { title: 'Gear Genius', desc: 'Cause & effect', icon: 'gear', got: true },
        { title: 'Energy Expert', desc: 'Renewable power', icon: 'bolt', got: true },
        { title: 'Lighthouse Hero', desc: 'Saved the island', icon: 'lighthouse', got: true },
        { title: 'Star Spotter', desc: `${this.starfish.size}/${STARFISH.length} starfish`, icon: 'starfish', got: all },
      ],
      starfish: this.starfish.size,
      total: STARFISH.length,
      time: `${mins}m ${secs.toString().padStart(2, '0')}s`,
      onReplay: () => {
        this.clearSave();
        location.reload();
      },
      onExplore: () => {
        this.fireworks = false;
        this.setStage(Stage.Free);
        this.startPlay();
      },
    });
  }

  private rescuePathLength() {
    let l = 0;
    for (let i = 1; i < RESCUE_PATH.length; i++) l += Math.hypot(RESCUE_PATH[i][0] - RESCUE_PATH[i - 1][0], RESCUE_PATH[i][1] - RESCUE_PATH[i - 1][1]);
    return l;
  }

  private updateRescue(dt: number) {
    if (!this.rescueMoving || this.rescueDone) return;
    const total = this.rescuePathLength();
    this.rescueDist = Math.min(total, this.rescueDist + dt * 16);
    let d = this.rescueDist;
    let i = 1;
    for (; i < RESCUE_PATH.length; i++) {
      const seg = Math.hypot(RESCUE_PATH[i][0] - RESCUE_PATH[i - 1][0], RESCUE_PATH[i][1] - RESCUE_PATH[i - 1][1]);
      if (d <= seg) break;
      d -= seg;
    }
    i = Math.min(i, RESCUE_PATH.length - 1);
    const a = RESCUE_PATH[i - 1];
    const b = RESCUE_PATH[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = clamp(d / seg, 0, 1);
    const node = this.world.rescue.node;
    node.position.x = a[0] + (b[0] - a[0]) * t;
    node.position.z = a[1] + (b[1] - a[1]) * t;
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    let dy = yaw - node.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    node.rotation.y += dy * Math.min(1, dt * 2);
    if (this.rescueDist >= total) {
      this.rescueDone = true;
      this.rescueMoving = false;
    }
  }

  private updateFireworks(dt: number) {
    if (!this.fireworks) return;
    this.fwTimer -= dt;
    if (this.fwTimer > 0) return;
    this.fwTimer = 0.45 + Math.random() * 0.6;
    const centers = [new Vector3(JETTY.x, 0, -75), new Vector3(LIGHTHOUSE.x, 10, LIGHTHOUSE.z)];
    const c = centers[Math.random() < 0.55 ? 0 : 1];
    const from = c.add(new Vector3((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20));
    const to = from.add(new Vector3((Math.random() - 0.5) * 10, 28 + Math.random() * 18, (Math.random() - 0.5) * 10));
    const cols = [new Color4(1, 0.35, 0.4, 1), new Color4(1, 0.85, 0.3, 1), new Color4(0.4, 0.8, 1, 1), new Color4(0.6, 1, 0.5, 1), new Color4(1, 0.5, 1, 1)];
    this.fx.rocket(from, to, () => {
      this.fx.firework(to, pick(cols));
      this.audio.firework();
    });
  }

  // ===========================================================================
  // Per-frame
  // ===========================================================================
  private frame(dtOverride?: number) {
    const dt = dtOverride ?? Math.min(0.05, this.engine.getDeltaTime() / 1000);
    this.input.poll();
    if (this.input.consumePause() && (this.mode === 'play' || this.mode === 'puzzle' || this.mode === 'paused')) this.togglePause();
    if (this.mode === 'paused') {
      this.scene.render();
      return;
    }
    this.time += dt;
    const look = this.input.consumeLook();
    if (this.mode === 'play' || this.mode === 'dialogue' || this.mode === 'puzzle') this.playTime += dt;
    // ---------------- title orbit
    if (this.mode === 'title') {
      this.titleOrbit += dt * 0.05;
      const a = this.titleOrbit - 0.9;
      const target = new Vector3(20, 6, 10);
      this.cam.cam.position.set(target.x + Math.sin(a) * 175, 62 + Math.sin(this.titleOrbit * 0.7) * 8, target.z - Math.cos(a) * 175);
      this.cam.cam.setTarget(target);
    }
    // ---------------- player & companions
    const canMove = this.mode === 'play';
    this.player.update(dt, canMove ? this.input : null, this.cam.yaw);
    if (!canMove) this.input.consumeJump();
    this.pip.update(dt, this.player, this.time);
    this.finn.update(dt, this.player.pos);
    this.prof.update(dt, this.player.pos);
    // ---------------- world
    this.world.env.update(dt, this.cam.cam, this.mode === 'title' ? new Vector3(20, 0, 10) : this.player.pos);
    this.world.update(dt);
    this.creatures.update(dt, this.time, this.player.pos);
    this.turbine.update(dt, this.time);
    this.bridge.update(dt);
    this.gears.update(dt);
    this.circuit.update(dt);
    this.windFlow.update(dt);
    this.lhFlow.update(dt, 18);
    this.world.workshop.wheel.rotation.z -= dt * 0.9;
    // workshop roof fades when inside
    const inside = this.world.workshop.inside(this.player.pos.x, this.player.pos.z) || this.activePuzzle === 'gears';
    this.world.workshop.roof.visibility += ((inside ? 0.0 : 1) - this.world.workshop.roof.visibility) * Math.min(1, dt * 6);
    this.world.workshop.roof.isVisible = this.world.workshop.roof.visibility > 0.02;
    // lighthouse beam
    if (this.beamOn > 0) {
      const L = this.world.lighthouse;
      L.beamPivot.rotation.y += dt * 0.7;
      L.beamMat.setFloat('time', this.time);
      const a = L.beamPivot.rotation.y;
      this.world.env.beam.pos.set(LIGHTHOUSE.x, L.topY, LIGHTHOUSE.z);
      this.world.env.beam.dir.set(Math.sin(a), 0, Math.cos(a));
    }
    this.updateRescue(dt);
    this.updateFireworks(dt);
    // collectibles spin
    for (const s of this.starMeshes) {
      if (!s.node.isEnabled()) continue;
      s.node.rotation.y += dt * 1.6;
      s.node.position.y += Math.sin(this.time * 2 + s.i) * 0.003;
    }
    for (const b of this.bundleMeshes) if (b.node.isEnabled()) b.node.rotation.y = Math.sin(this.time * 0.8) * 0.15;
    // lens carried by the player (floats beside them)
    this.updateLensCarry();
    // ---------------- gameplay
    if (this.mode === 'play') {
      this.stageTimer += dt;
      this.checkCollect();
      this.updateInteract();
      this.autoHints(dt);
    } else this.ui.prompt(null, this.input.touchMode);
    // ---------------- camera
    const focus = this.player.pos.add(new Vector3(0, 1.4, 0));
    if (this.mode !== 'title') this.cam.update(dt, focus, this.mode === 'play' ? look : { dx: 0, dy: 0, zoom: 0 }, this.player.speed / 7.8, this.player.yaw);
    this.updateMarker();
    this.updateAudio(dt);
    this.adaptPerformance(dt);
    this.scene.render();
  }

  private updateLensCarry() {
    if (!this.hasLens || this.stage >= Stage.Finale) {
      this.lensCarry?.setEnabled(false);
      return;
    }
    if (!this.lensCarry) {
      const b = new Batch();
      b.add(Shape.ico(0.18, 1), T(0, 0, 0, 0, 0, 0, 1, 1.3, 1), '#fff6c8', { flat: true });
      b.add(Shape.torus(0.4, 0.04, 14), T(0, 0, 0), '#e7b84a');
      this.lensCarry = b.build('lensCarry', this.scene, this.world.mats.glow);
      this.lensCarry.isPickable = false;
    }
    this.lensCarry.setEnabled(this.mode !== 'title');
    const p = this.pip.pos;
    this.lensCarry.position.set(p.x, p.y + 0.95 + Math.sin(this.time * 3) * 0.05, p.z);
    this.lensCarry.rotation.y += 0.03;
  }

  private checkCollect() {
    const pp = this.player.pos;
    for (const b of this.bundleMeshes) {
      if (!b.node.isEnabled()) continue;
      if (Vector3.DistanceSquared(pp, b.node.position) < 2.4 * 2.4) {
        b.node.setEnabled(false);
        b.ps.stop();
        this.bundles.add(b.id);
        this.audio.pickup();
        this.fx.sparkle(b.node.position.add(new Vector3(0, 1, 0)));
        this.player.rig.play('cheer', 1.2);
        const def = BUNDLES.find((x) => x.id === b.id)!;
        this.ui.toast(`Found the ${def.name}! (${this.bundles.size}/3)`, b.id);
        if (this.bundles.size >= 3) {
          this.ui.pipSay("That's all three! Now let's carry them to the <b>broken bridge</b>!", 5);
          this.setStage(Stage.BuildBridge);
        } else {
          this.ui.setObjective(OBJECTIVES[Stage.Collect].text, 'posts', `${this.bundles.size} of 3 found`);
          this.ui.pipSay(b.id === 'posts' ? 'Posts! Different lengths, too – interesting…' : b.id === 'beams' ? 'Long beams! These are for going across the stream.' : 'Triangle braces! What are those for, I wonder?', 4);
          this.save();
        }
      }
    }
    for (const s of this.starMeshes) {
      if (!s.node.isEnabled()) continue;
      if (Vector3.DistanceSquared(pp, s.node.position) < 1.7 * 1.7) {
        s.node.setEnabled(false);
        s.ps.stop();
        this.starfish.add(s.i);
        this.audio.starfish();
        this.fx.sparkle(s.node.position, new Color4(1, 0.6, 0.4, 1), 30);
        this.ui.setStarfish(this.starfish.size, STARFISH.length, true);
        if (this.starfish.size === STARFISH.length) {
          this.ui.achievement('Star Spotter', 'You found every starfish!', 'starfish');
          this.audio.bigSuccess();
        } else if (this.starfish.size === 1 || Math.random() < 0.4) this.ui.pipSay(pick(QUIPS.starfish), 4);
        this.save();
      }
    }
  }

  private updateInteract() {
    const pp = this.player.pos;
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      const p = it.pos();
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (d > it.r || Math.abs(p.y - pp.y) > 4) continue;
      if (!it.label()) continue;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    this.current = best;
    this.ui.prompt(best ? best.label() : null, this.input.touchMode);
    if (this.input.consumeInteract() && best) {
      this.audio.click();
      best.act();
    }
  }

  private giveHint(manual: boolean) {
    this.audio.unlock();
    if (this.mode === 'puzzle') {
      if (this.activePuzzle === 'bridge') this.bridge.hint();
      if (this.activePuzzle === 'gears') this.gears.hint();
      if (this.activePuzzle === 'circuit') this.circuit.hint();
      return;
    }
    const hs = HINTS[this.stage];
    if (!hs) return;
    this.ui.pipSay(hs[Math.min(this.hintIdx, hs.length - 1)], 6);
    this.hintIdx++;
    this.pip.doEmote('jump');
    this.ui.pulseHint(false);
    if (manual) this.stageTimer = Math.min(this.stageTimer, 20);
  }

  private autoHints(dt: number) {
    if (this.input.consumeHint()) this.giveHint(true);
    if (this.stageTimer > 35) this.ui.pulseHint(true);
    if (this.stageTimer > 55) {
      this.stageTimer = 20;
      this.giveHint(false);
    }
    // idle quips
    this.lastQuip += dt;
    if (performance.now() - this.input.lastInputTime > 25000 && this.lastQuip > 30) {
      this.lastQuip = 0;
      this.ui.pipSay(pick(QUIPS.idle), 5);
    }
  }

  private markerTarget(): Vector3 | null {
    const W = this.world;
    switch (this.stage) {
      case Stage.MeetFinn:
        return this.finn.pos.add(new Vector3(0, 2.6, 0));
      case Stage.Collect: {
        let best: Vector3 | null = null;
        let bd = Infinity;
        for (const b of this.bundleMeshes) {
          if (!b.node.isEnabled()) continue;
          const d = Vector3.Distance(b.node.position, this.player.pos);
          if (d < bd) {
            bd = d;
            best = b.node.position.add(new Vector3(0, 1.8, 0));
          }
        }
        return best;
      }
      case Stage.BuildBridge:
        return new Vector3(BRIDGE.x, BRIDGE.bankY + 2.5, -BRIDGE.halfLen - 1.5);
      case Stage.ToWorkshop:
        return this.prof.pos.add(new Vector3(0, 2.8, 0));
      case Stage.Gears:
        return W.workshop.boardAnchor.getAbsolutePosition().add(new Vector3(0, 0.5, 0));
      case Stage.Turbine:
        return W.turbine.basePos.add(new Vector3(0, 4, 0));
      case Stage.Panel:
        return W.cottage.panelAnchor.getAbsolutePosition().add(new Vector3(0, 4.2, 0));
      case Stage.Lens:
        return W.lighthouse.doorPos.add(new Vector3(0, 3.5, 0));
    }
    return null;
  }

  private updateMarker() {
    const target = this.mode === 'play' ? this.markerTarget() : null;
    if (!target) {
      this.ui.marker(0, 0, false, true, 0);
      return;
    }
    const eng = this.engine;
    const w = eng.getRenderWidth() * eng.getHardwareScalingLevel();
    const h = eng.getRenderHeight() * eng.getHardwareScalingLevel();
    const vp = this.cam.cam.viewport.toGlobal(w, h);
    const p = Vector3.Project(target, Matrix.Identity(), this.scene.getTransformMatrix(), vp);
    const camDir = this.cam.cam.getDirection(Vector3.Forward());
    const behind = Vector3.Dot(target.subtract(this.cam.cam.position), camDir) < 0;
    const dist = Vector3.Distance(target, this.player.pos);
    const m = 46;
    let x = p.x;
    let y = p.y;
    const on = !behind && x > m && x < w - m && y > m + 40 && y < h - m;
    if (on && dist < 3.5) {
      this.ui.marker(0, 0, false, true, 0);
      return;
    }
    if (!on) {
      let dx = x - w / 2;
      let dy = y - h / 2;
      if (behind) {
        dx = -dx;
        dy = -dy;
        if (Math.abs(dy) < 1) dy = h;
      }
      const s = Math.min((w / 2 - m) / Math.abs(dx || 1e-3), (h / 2 - m - 30) / Math.abs(dy || 1e-3));
      x = w / 2 + dx * s;
      y = h / 2 + dy * s + 20;
      this.ui.marker(x, y, true, false, dist, Math.atan2(dy, dx) + Math.PI / 2);
    } else this.ui.marker(x, y, true, true, dist);
  }

  private updateAudio(dt: number) {
    const pp = this.mode === 'title' ? new Vector3(20, 0, 10) : this.player.pos;
    const T = this.world.terrain;
    const lf = T.landFrac(pp.x, pp.z);
    const coast = this.mode === 'title' ? 0.8 : clamp(1.15 - lf * 0.9 + (pp.y < 3 ? 0.25 : 0), 0.15, 1);
    const sd = this.world.env.streamDistance(pp.x, pp.z);
    this.audio.ambient.coast = coast;
    this.audio.ambient.stream = 1 - smoothstep(5, 26, sd);
    this.audio.ambient.wind = clamp(0.3 + pp.y / 18, 0.2, 1);
    this.audio.ambient.birds = this.world.env.night > 0.6 ? 0 : lf > 0.9 ? 1 : 0.4;
    this.audio.updateAmbient(dt);
  }

  private adaptPerformance(dt: number) {
    if (this.mode !== 'play' || this.input.touchMode === undefined) return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 4) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (fps < 26 && this.dynScale > 0.6) {
      this.dynScale -= 0.15;
      const base = this.engine.getHardwareScalingLevel();
      this.engine.setHardwareScalingLevel(Math.min(2, base / 0.85));
    }
  }

  // ===========================================================================
  // Pause
  // ===========================================================================
  togglePause() {
    if (this.mode === 'paused') {
      this.closePause?.();
      this.closePause = null;
      this.mode = this.prevMode;
      return;
    }
    if (this.mode !== 'play' && this.mode !== 'puzzle') return;
    this.prevMode = this.mode;
    this.mode = 'paused';
    this.input.reset();
    this.closePause = this.ui.pauseMenu({
      music: this.audio.musicVol,
      sfx: this.audio.sfxVol,
      quality: this.quality,
      sensitivity: this.cam.sensitivity / 0.0055,
      onMusic: (v) => this.audio.setVolumes(v, this.audio.sfxVol),
      onSfx: (v) => this.audio.setVolumes(this.audio.musicVol, v),
      onSensitivity: (v) => (this.cam.sensitivity = 0.0055 * v),
      onQuality: (q) => {
        if (q === this.quality) return;
        saveQuality(q);
        this.save();
        location.reload();
      },
      onResume: () => {
        this.closePause = null;
        this.mode = this.prevMode;
      },
      onRestart: () => {
        this.clearSave();
        location.reload();
      },
    });
  }

  // ===========================================================================
  // Save / load
  // ===========================================================================
  private readSave(): SaveData | null {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return s ? (JSON.parse(s) as SaveData) : null;
    } catch {
      return null;
    }
  }
  private load() {
    const s = this.readSave();
    if (s && typeof s.look === 'number') this.look = Math.max(0, Math.min(EXPLORER_LOOKS.length - 1, s.look));
  }
  save() {
    if (this.stage < Stage.MeetFinn) return;
    try {
      const d: SaveData = { stage: this.stage, bundles: [...this.bundles], starfish: [...this.starfish], look: this.look, time: this.playTime };
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }
  private clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ===========================================================================
  // Debug / test helpers (used by automated play-tests)
  // ===========================================================================
  debug = {
    teleport: (x: number, z: number) => this.player.teleport(x, z, this.player.yaw),
    stage: () => this.stage,
    mode: () => this.mode,
    start: () => this.newGame(),
    skip: () => {
      this.skipRequested = true;
      this.cam.skipShot();
    },
    interact: () => this.input.pressInteract(),
    pos: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }),
    restore: (s: number) => {
      this.restoreStage(s);
      this.startPlay();
    },
  };
}

