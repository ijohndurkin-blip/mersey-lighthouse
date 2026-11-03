import {
  Color3,
  Material,
  MaterialPluginBase,
  Scene,
  StandardMaterial,
  UniformBuffer,
  FresnelParameters,
} from '../babylon';

/** Global wind clock shared by all wind plugins. */
export const Wind = { time: 0, strength: 1 };

/**
 * Adds gentle wind sway to a StandardMaterial. Sway weight comes from the vertex colour
 * alpha channel (written by Batch with `sway`), so trunks stay still and leaves move.
 */
export class WindPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'Wind', 200, { WINDSWAY: false });
    this._enable(true);
  }
  override prepareDefines(defines: any) {
    defines.WINDSWAY = true;
  }
  override getClassName() {
    return 'WindPlugin';
  }
  override getUniforms() {
    return {
      ubo: [
        { name: 'windTime', size: 1, type: 'float' },
        { name: 'windStrength', size: 1, type: 'float' },
      ],
      vertex: `#ifdef WINDSWAY
        uniform float windTime;
        uniform float windStrength;
      #endif`,
    };
  }
  override bindForSubMesh(ubo: UniformBuffer) {
    ubo.updateFloat('windTime', Wind.time);
    ubo.updateFloat('windStrength', Wind.strength);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        #ifdef WINDSWAY
        #ifdef VERTEXCOLOR
          float swayW = color.a;
          float ph = worldPos.x * 0.21 + worldPos.z * 0.17;
          float s1 = sin(windTime * 1.7 + ph) * 0.6 + sin(windTime * 3.1 + ph * 2.3) * 0.25;
          float s2 = cos(windTime * 1.3 + ph * 1.4) * 0.4;
          worldPos.x += s1 * swayW * 0.35 * windStrength;
          worldPos.z += s2 * swayW * 0.25 * windStrength;
          worldPos.y -= abs(s1) * swayW * 0.04 * windStrength;
        #endif
        #endif
        `,
      };
    }
    return null;
  }
}

export interface Mats {
  vc: StandardMaterial;
  vcFoliage: StandardMaterial;
  char: StandardMaterial;
  glow: StandardMaterial;
  windows: StandardMaterial;
  lamp: StandardMaterial;
  sparkle: StandardMaterial;
  ghost: StandardMaterial;
  energy: StandardMaterial;
  metal: StandardMaterial;
}

export function createMaterials(scene: Scene): Mats {
  const vc = new StandardMaterial('vc', scene);
  vc.diffuseColor = Color3.White();
  vc.specularColor = new Color3(0.06, 0.06, 0.05);
  vc.specularPower = 24;

  const vcFoliage = new StandardMaterial('vcFoliage', scene);
  vcFoliage.diffuseColor = Color3.White();
  vcFoliage.specularColor = new Color3(0.03, 0.04, 0.02);
  vcFoliage.specularPower = 16;
  new WindPlugin(vcFoliage);

  const char = new StandardMaterial('char', scene);
  char.diffuseColor = Color3.White();
  char.specularColor = new Color3(0.18, 0.18, 0.18);
  char.specularPower = 40;
  char.emissiveFresnelParameters = new FresnelParameters();
  char.emissiveFresnelParameters.bias = 0.55;
  char.emissiveFresnelParameters.power = 2.5;
  char.emissiveFresnelParameters.leftColor = new Color3(0.22, 0.2, 0.17);
  char.emissiveFresnelParameters.rightColor = Color3.Black();

  const glow = new StandardMaterial('glow', scene);
  glow.diffuseColor = Color3.Black();
  glow.specularColor = Color3.Black();
  glow.emissiveColor = new Color3(1, 0.85, 0.45);
  glow.disableLighting = true;

  const windows = new StandardMaterial('windows', scene);
  windows.diffuseColor = new Color3(0.25, 0.33, 0.42);
  windows.specularColor = new Color3(0.6, 0.6, 0.6);
  windows.specularPower = 64;
  windows.emissiveColor = new Color3(0.05, 0.06, 0.08);

  const lamp = new StandardMaterial('lamp', scene);
  lamp.diffuseColor = new Color3(0.9, 0.85, 0.6);
  lamp.emissiveColor = new Color3(0.15, 0.13, 0.08);
  lamp.specularColor = new Color3(1, 1, 1);
  lamp.specularPower = 96;

  const sparkle = new StandardMaterial('sparkle', scene);
  sparkle.disableLighting = true;
  sparkle.emissiveColor = Color3.White();

  const ghost = new StandardMaterial('ghost', scene);
  ghost.disableLighting = true;
  ghost.emissiveColor = new Color3(0.5, 0.95, 1);
  ghost.alpha = 0.35;
  ghost.backFaceCulling = false;

  const energy = new StandardMaterial('energy', scene);
  energy.disableLighting = true;
  energy.emissiveColor = new Color3(0.2, 0.9, 1);

  const metal = new StandardMaterial('metal', scene);
  metal.diffuseColor = Color3.White();
  metal.specularColor = new Color3(0.7, 0.62, 0.45);
  metal.specularPower = 48;

  return { vc, vcFoliage, char, glow, windows, lamp, sparkle, ghost, energy, metal };
}
