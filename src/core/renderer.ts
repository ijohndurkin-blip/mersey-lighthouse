import {
  Camera,
  DefaultRenderingPipeline,
  Engine,
  ImageProcessingConfiguration,
  Scene,
  Color4,
} from '../babylon';
import { QualityLevel, QualitySettings } from './quality';

export function createEngine(canvas: HTMLCanvasElement, quality: QualityLevel) {
  const engine = new Engine(canvas, quality !== 'low', {
    preserveDrawingBuffer: false,
    stencil: true,
    powerPreference: 'high-performance',
    antialias: quality !== 'low',
    adaptToDeviceRatio: false,
  });
  applyScaling(engine, quality);
  return engine;
}

export function applyScaling(engine: Engine, quality: QualityLevel) {
  const dpr = Math.min(window.devicePixelRatio || 1, QualitySettings[quality].scaling);
  engine.setHardwareScalingLevel(1 / Math.max(0.5, dpr));
}

export function createPipeline(scene: Scene, camera: Camera, quality: QualityLevel) {
  const settings = QualitySettings[quality];
  // Image processing (tone mapping) – used directly by materials when post is off
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.05;
  ip.contrast = 1.12;
  ip.vignetteEnabled = false;
  if (!settings.post) return null;
  const p = new DefaultRenderingPipeline('pipeline', true, scene, [camera]);
  p.samples = settings.msaa;
  p.fxaaEnabled = settings.msaa <= 1;
  p.bloomEnabled = settings.bloom;
  p.bloomThreshold = 0.82;
  p.bloomWeight = 0.38;
  p.bloomKernel = 48;
  p.bloomScale = 0.5;
  p.imageProcessingEnabled = true;
  p.imageProcessing.toneMappingEnabled = true;
  p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  p.imageProcessing.exposure = 1.05;
  p.imageProcessing.contrast = 1.12;
  p.imageProcessing.vignetteEnabled = true;
  p.imageProcessing.vignetteWeight = 1.6;
  p.imageProcessing.vignetteStretch = 0.4;
  p.imageProcessing.vignetteColor = new Color4(0.05, 0.08, 0.18, 0);
  p.sharpenEnabled = quality === 'high';
  if (p.sharpen) p.sharpen.edgeAmount = 0.25;
  return p;
}
