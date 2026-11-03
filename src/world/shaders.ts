import { Effect } from '../babylon';

const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float s = 0.0; float a = 0.5; for(int i=0;i<4;i++){ s += vnoise(p)*a; p = p*2.03 + vec2(1.7,9.2); a *= 0.5; } return s / 0.9375; }
`;

// ---------------------------------------------------------------- Sky
Effect.ShadersStore['skyVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = viewProjection * world * vec4(position, 1.0);
}`;

Effect.ShadersStore['skyFragmentShader'] = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform float time;
uniform float night;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(hp, 0.5));
  // below horizon: blend to a hazy sea colour
  col = mix(col, horizonColor * 0.85, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, sunDir), 0.0);
  float dayAmt = 1.0 - night;
  col += sunColor * (pow(sd, 5.0) * 0.28 + pow(sd, 48.0) * 0.5) * dayAmt;
  col += sunColor * smoothstep(0.9990, 0.9996, sd) * 3.0 * dayAmt;
  // horizon glow toward the sun at sunset
  col += sunColor * pow(1.0 - hp, 6.0) * pow(sd, 2.0) * 0.35 * dayAmt;
  // clouds
  vec2 uv = d.xz / (h + 0.22);
  uv += vec2(time * 0.006, time * 0.0025);
  float c = fbm3(uv * 1.15);
  float c2 = fbm3(uv * 2.7 + 4.0);
  float cm = smoothstep(0.52, 0.78, c * 0.75 + c2 * 0.3) * smoothstep(-0.02, 0.18, h);
  vec3 litCloud = mix(vec3(1.0, 0.99, 0.96), sunColor * 1.15 + vec3(0.12), 0.35 + 0.45 * (1.0 - hp));
  vec3 shadeCloud = mix(horizonColor, topColor, 0.4) * 0.92;
  float lit = smoothstep(0.4, 0.95, c2 + sd * 0.4);
  vec3 cloudCol = mix(shadeCloud, litCloud, lit);
  cloudCol = mix(cloudCol, vec3(0.16, 0.2, 0.36), night * 0.85);
  col = mix(col, cloudCol, cm * mix(0.9, 0.55, night));
  // stars + moon
  if (night > 0.01) {
    vec2 sp = d.xz / (abs(h) + 0.6) * 160.0;
    vec2 cell = floor(sp);
    float r = hash12(cell);
    vec2 off = vec2(hash12(cell + 7.1), hash12(cell + 3.3));
    float dd = length(fract(sp) - off);
    float star = step(0.93, r) * smoothstep(0.12, 0.0, dd) * (0.6 + 0.4 * sin(time * 2.0 + r * 50.0));
    col += vec3(0.85, 0.9, 1.0) * star * night * smoothstep(0.02, 0.25, h) * (1.0 - cm);
    float md = max(dot(d, moonDir), 0.0);
    col += vec3(0.95, 0.95, 1.0) * smoothstep(0.9993, 0.9996, md) * 1.6 * night;
    col += vec3(0.5, 0.6, 0.9) * pow(md, 40.0) * 0.35 * night;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- Sea
Effect.ShadersStore['seaVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float waveAmp;
varying vec3 vWorld;
varying vec4 vClip;
float waves(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.08, 0.05)) + t * 0.9) * 0.28;
  h += sin(dot(p, vec2(-0.05, 0.11)) + t * 1.25) * 0.16;
  h += sin(dot(p, vec2(0.19, -0.13)) + t * 1.9) * 0.07;
  return h;
}
void main(){
  vec4 wp = world * vec4(position, 1.0);
  wp.y += waves(wp.xz, time) * waveAmp;
  vWorld = wp.xyz;
  gl_Position = viewProjection * wp;
  vClip = gl_Position;
}`;

Effect.ShadersStore['seaFragmentShader'] = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec4 vClip;
uniform vec3 cameraPos;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 skyTop;
uniform vec3 skyHorizon;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform float night;
uniform float waveAmp;
uniform sampler2D depthTex;
uniform vec4 depthRect;
uniform sampler2D mirrorTex;
uniform float useMirror;
uniform vec3 beamPos;
uniform vec3 beamDir;
uniform float beamOn;
${NOISE}
vec2 waveGrad(vec2 p, float t){
  vec2 g = vec2(0.0);
  g += vec2(0.08, 0.05) * cos(dot(p, vec2(0.08, 0.05)) + t * 0.9) * 0.28;
  g += vec2(-0.05, 0.11) * cos(dot(p, vec2(-0.05, 0.11)) + t * 1.25) * 0.16;
  g += vec2(0.19, -0.13) * cos(dot(p, vec2(0.19, -0.13)) + t * 1.9) * 0.07;
  return g * waveAmp;
}
void main(){
  vec3 toCam = cameraPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 g = waveGrad(vWorld.xz, time);
  // ripple detail (fades with distance)
  float fade = 1.0 - smoothstep(30.0, 260.0, dist);
  vec2 p1 = vWorld.xz * 0.35 + vec2(time * 0.18, time * 0.11);
  vec2 p2 = vWorld.xz * 0.9 - vec2(time * 0.21, -time * 0.16);
  float e = 0.15;
  float n1 = vnoise(p1), n1x = vnoise(p1 + vec2(e, 0.0)), n1z = vnoise(p1 + vec2(0.0, e));
  float n2 = vnoise(p2), n2x = vnoise(p2 + vec2(e, 0.0)), n2z = vnoise(p2 + vec2(0.0, e));
  vec2 rg = vec2(n1x - n1, n1z - n1) * 0.9 + vec2(n2x - n2, n2z - n2) * 0.45;
  vec3 n = normalize(vec3(-g.x - rg.x * fade, 1.0, -g.y - rg.y * fade));
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(skyHorizon, skyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
  if (useMirror > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    suv += n.xz * 0.04;
    vec4 m = texture2D(mirrorTex, suv);
    float has = clamp(m.a, 0.0, 1.0);
    sky = mix(sky, m.rgb, has * 0.9);
  }
  // depth from terrain
  vec2 duv = (vWorld.xz - depthRect.xy) / depthRect.zw;
  float depth = 10.0;
  float landH = -2.0;
  if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
    vec4 dt = texture2D(depthTex, duv);
    depth = dt.r * 10.0;
    landH = dt.g * 4.0 - 2.0;
  }
  float waterDepth = max(vWorld.y - landH, 0.0);
  float dShade = smoothstep(0.0, 7.0, depth);
  vec3 water = mix(shallowColor, deepColor, dShade);
  // light scattering in wave crests
  float crest = clamp((vWorld.y) * 1.5, 0.0, 1.0);
  water += shallowColor * crest * 0.18 * (1.0 - night * 0.7);
  float diff = clamp(dot(n, sunDir) * 0.5 + 0.5, 0.0, 1.0);
  water *= mix(0.75, 1.05, diff);
  vec3 col = mix(water, sky, fres * 0.85);
  // sun glint
  float sp = pow(max(dot(R, sunDir), 0.0), 180.0);
  col += sunColor * sp * 2.2 * (1.0 - night * 0.6);
  col += sunColor * pow(max(dot(R, sunDir), 0.0), 18.0) * 0.08 * (1.0 - night);
  // lighthouse beam reflection on the sea
  if (beamOn > 0.0) {
    vec3 toP = vWorld - beamPos;
    vec2 bd = normalize(beamDir.xz);
    float along = dot(normalize(toP.xz), bd);
    float beam = smoothstep(0.92, 0.995, along) * exp(-length(toP.xz) * 0.006);
    col += vec3(1.0, 0.92, 0.65) * beam * beamOn * (0.6 + 0.4 * vnoise(vWorld.xz * 0.8 + time));
  }
  // shore foam
  float shore = 1.0 - smoothstep(0.0, 0.9, waterDepth);
  float fn = vnoise(vWorld.xz * 0.9 + vec2(time * 0.4, -time * 0.2)) * 0.6 + vnoise(vWorld.xz * 2.3 - time * 0.3) * 0.4;
  float band = sin(waterDepth * 9.0 - time * 2.2) * 0.5 + 0.5;
  float foam = smoothstep(0.35, 0.75, shore * (0.55 + band * 0.45) + fn * 0.35 - 0.15) * shore;
  foam = max(foam, smoothstep(0.82, 1.0, shore));
  // whitecaps out at sea
  float cap = smoothstep(0.78, 0.92, vnoise(vWorld.xz * 0.12 + time * 0.05)) * smoothstep(0.15, 0.32, vWorld.y) * 0.5;
  foam = max(foam, cap * fade);
  vec3 foamCol = mix(vec3(1.0), vec3(0.6, 0.7, 0.9), night * 0.6);
  col = mix(col, foamCol, foam * 0.9);
  float alpha = smoothstep(0.0, 0.35, waterDepth);
  alpha = max(alpha, foam * 0.9);
  alpha = clamp(alpha, 0.0, 1.0);
  // fog
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, fogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}`;

// ---------------------------------------------------------------- Stream
Effect.ShadersStore['streamVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vWorld;
varying vec2 vUV;
void main(){
  vec4 wp = world * vec4(position, 1.0);
  wp.y += sin(uv.x * 1.3 - time * 3.0) * 0.025;
  vWorld = wp.xyz;
  vUV = uv;
  gl_Position = viewProjection * wp;
}`;

Effect.ShadersStore['streamFragmentShader'] = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec2 vUV;
uniform vec3 cameraPos;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 skyTop;
uniform vec3 skyHorizon;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform float night;
uniform float speed;
${NOISE}
void main(){
  vec3 toCam = cameraPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 fuv = vec2(vUV.x * 0.5 - time * speed, vUV.y * 1.5);
  float n1 = fbm3(fuv * vec2(0.6, 1.2));
  float n2 = vnoise(fuv * vec2(2.0, 3.0) + 3.0);
  vec3 n = normalize(vec3((n1 - 0.5) * 0.6, 1.0, (n2 - 0.5) * 0.6));
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(skyHorizon, skyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float edge = abs(vUV.y);
  vec3 deep = vec3(0.10, 0.42, 0.52);
  vec3 shallow = vec3(0.36, 0.78, 0.74);
  vec3 water = mix(deep, shallow, smoothstep(0.2, 0.95, edge));
  water *= mix(1.0, 0.35, night);
  vec3 col = mix(water, sky, fres * 0.7);
  col += sunColor * pow(max(dot(R, sunDir), 0.0), 120.0) * 1.6 * (1.0 - night * 0.7);
  float streak = smoothstep(0.62, 0.8, n1 + n2 * 0.25) * 0.35;
  float foam = smoothstep(0.78, 0.98, edge + n2 * 0.18) + streak;
  col = mix(col, mix(vec3(1.0), vec3(0.55, 0.65, 0.85), night * 0.6), clamp(foam, 0.0, 1.0) * 0.75);
  float alpha = 1.0 - smoothstep(0.88, 1.0, edge);
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, fogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha * 0.95);
}`;

// ---------------------------------------------------------------- Light beam (additive cone)
Effect.ShadersStore['beamVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec2 vUV;
varying vec3 vWorld;
void main(){
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUV = uv;
  gl_Position = viewProjection * wp;
}`;

Effect.ShadersStore['beamFragmentShader'] = /* glsl */ `
precision highp float;
varying vec2 vUV;
varying vec3 vWorld;
uniform float intensity;
uniform float time;
uniform vec3 beamColor;
${NOISE}
void main(){
  float along = vUV.y;              // 0 at lamp, 1 at far end
  float across = abs(vUV.x - 0.5) * 2.0;
  float core = pow(1.0 - across, 1.6);
  float fall = pow(1.0 - along, 1.4);
  float dust = 0.75 + 0.25 * vnoise(vWorld.xz * 0.15 + vec2(time * 0.3, 0.0));
  float a = core * fall * intensity * dust;
  gl_FragColor = vec4(beamColor * a, a);
}`;

// ---------------------------------------------------------------- Soft blob shadow / glow sprite
Effect.ShadersStore['glowDiscVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(){ vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;

Effect.ShadersStore['glowDiscFragmentShader'] = /* glsl */ `
precision highp float;
varying vec2 vUV;
uniform vec3 color;
uniform float alpha;
void main(){
  float d = length(vUV - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * alpha;
  gl_FragColor = vec4(color * a, a);
}`;

// ---------------------------------------------------------------- Distant scenery (aerial perspective)
Effect.ShadersStore['distantVertexShader'] = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vColor;
varying vec3 vNormal;
varying float vHeight;
void main(){
  vColor = color.rgb;
  vNormal = normalize(mat3(world) * normal);
  vec4 wp = world * vec4(position, 1.0);
  vHeight = wp.y;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore['distantFragmentShader'] = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying vec3 vNormal;
varying float vHeight;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform float light;
uniform float haze;
void main(){
  float diff = max(dot(normalize(vNormal), sunDir), 0.0) * 0.55 + 0.45;
  vec3 col = vColor * diff * light;
  float h = haze + (1.0 - haze) * (1.0 - smoothstep(0.0, 120.0, vHeight)) * 0.35;
  col = mix(col, horizon, clamp(h, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;
