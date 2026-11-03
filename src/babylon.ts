// Tree-shaken Babylon.js entry point: only the engine features the game uses.
// (Importing from '@babylonjs/core' directly would bundle the whole engine.)

// side-effect registrations
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/Extensions/engine.renderTarget';
import '@babylonjs/core/Engines/Extensions/engine.renderTargetTexture';
import '@babylonjs/core/Engines/Extensions/engine.uniformBuffer';
import '@babylonjs/core/Engines/Extensions/engine.alpha';
import '@babylonjs/core/Engines/Extensions/engine.dynamicBuffer';
import '@babylonjs/core/Engines/Extensions/engine.readTexture';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Rendering/outlineRenderer';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';

export { Engine } from '@babylonjs/core/Engines/engine';
export { Constants } from '@babylonjs/core/Engines/constants';
export { Scene } from '@babylonjs/core/scene';
export { Camera } from '@babylonjs/core/Cameras/camera';
export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Matrix, Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
export { Plane } from '@babylonjs/core/Maths/math.plane';
export { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
export { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder';
export { CreateCapsuleVertexData } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
export { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
export { CreateDiscVertexData } from '@babylonjs/core/Meshes/Builders/discBuilder';
export { CreateIcoSphereVertexData } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
export { CreateSphereVertexData } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
export { CreateTorusVertexData } from '@babylonjs/core/Meshes/Builders/torusBuilder';
export { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { PointLight } from '@babylonjs/core/Lights/pointLight';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { Effect } from '@babylonjs/core/Materials/effect';
export { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
export { Material } from '@babylonjs/core/Materials/material';
export { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
export { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
export { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
export { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
export type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo';
