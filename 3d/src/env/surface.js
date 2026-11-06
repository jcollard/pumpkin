// PBR surface textures (CC0 sets in assets/textures/<name>/{color,normal,roughness}.jpg)
// and world-space detail mapping for any MeshStandardMaterial.
//
// Why world space: the race ribbons, berms, terrain and bridge parts all have
// different UV layouts. Sampling the photo textures by world position keeps the
// texel size constant everywhere and lets two scales be mixed to hide tiling.
//
//   pbr(name)                         -> {map, normalMap, roughnessMap, mean (THREE.Color), ready (Promise)}
//   worldDetail(material, opts)       -> material (adds planar/triplanar detail to a MeshStandardMaterial)
//   noiseTexture()                    -> shared tileable greyscale noise (anti-tiling, foam, wind)
import * as THREE from 'three';
import {rng} from '../noise.js';

export const TEXTURE_ROOT = 'assets/textures/';
const loader = new THREE.TextureLoader();
const sets = new Map();
let maxAniso = 8;
export const setMaxAnisotropy = n => { maxAniso = n; };

// Average colour of an image (linear), so detail can be applied as a ratio
// around 1.0 and the course's own palette stays in charge of the hue.
function meanColour(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch { return new THREE.Color(0.5, 0.5, 0.5); }
}

// Mean sRGB colour of the catalogue's colour maps (measured once; avoids a slow
// canvas readback at load time). Unknown sets are measured on load.
const KNOWN_MEANS = {
  dirt_packed: [0.716, 0.5462, 0.3906], grass_dry: [0.6772, 0.5787, 0.4783], grass_green: [0.3763, 0.4244, 0.1874],
  rock_cliff: [0.5143, 0.4113, 0.3157], sand_beach: [0.8978, 0.8402, 0.7084], bark_redwood: [0.3463, 0.2391, 0.1657],
  wood_planks: [0.274, 0.2666, 0.2491], concrete_weathered: [0.4914, 0.4789, 0.4557],
};

// Load (once) a texture set by folder name. Textures are returned immediately
// and fill in when the images arrive; `ready` resolves when all are loaded.
export function pbr(name, {normal = true, roughness = true} = {}) {
  const key = `${name}|${normal}|${roughness}`;
  if (sets.has(key)) return sets.get(key);
  const pending = [];
  const mk = (file, srgb, onImage) => {
    let done;
    pending.push(new Promise(r => { done = r; }));
    const t = loader.load(TEXTURE_ROOT + name + '/' + file, tex => { onImage?.(tex.image); done(); }, undefined, () => { console.warn('[surface] missing', name + '/' + file); done(); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const known = KNOWN_MEANS[name];
  const set = {name, mean: known ? new THREE.Color().setRGB(...known, THREE.SRGBColorSpace) : new THREE.Color(0.5, 0.5, 0.5), loaded: false};
  set.map = mk('color.jpg', true, known ? null : img => set.mean.copy(meanColour(img)));
  set.normalMap = normal ? mk('normal.jpg', false) : null;
  set.roughnessMap = roughness ? mk('roughness.jpg', false) : null;
  set.ready = Promise.all(pending).then(() => { set.loaded = true; return set; });
  sets.set(key, set);
  return set;
}

let noiseTex = null;
// 256² tileable value noise (R: fine, G: medium, B: coarse), linear.
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  const layer = (period, seed) => {
    const r = rng(seed), g = Array.from({length: period * period}, r);
    const at = (i, j) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  };
  const f = [layer(32, 7), layer(64, 8)], m = [layer(8, 9), layer(16, 10)], c = [layer(4, 11), layer(8, 12)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = 255 * (0.65 * f[0](x / 8, y / 8) + 0.35 * f[1](x / 4, y / 4));
    data[i + 1] = 255 * (0.65 * m[0](x / 32, y / 32) + 0.35 * m[1](x / 16, y / 16));
    data[i + 2] = 255 * (0.65 * c[0](x / 64, y / 64) + 0.35 * c[1](x / 32, y / 32));
    data[i + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// GLSL shared by the detail and terrain shaders.
export const GLSL_COMMON = /* glsl */`
vec3 vqUDN(vec3 N, vec3 T, vec3 B, vec3 tn, float k) { return normalize(N + (T * tn.x + B * tn.y) * k); }
vec2 vqRot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
`;

// Add world-space detail texture(s) to a MeshStandardMaterial.
// opts: {set: pbr(...) or name, scale: metres per tile (2.5), macro: second scale (0 = off),
//        mode: 'planar' (XZ, for ground) | 'triplanar' (rock, walls) | 'side' (XY/ZY, vertical faces),
//        strength: 0..1 how much the photo's own variation shows (0.85), colorMix: 0..1 use the photo's
//        own colour instead of material.color/map (0), normalScale (1), roughness: use roughness map (true),
//        fade: distance (m) where detail fades to 50 % (250)}
export function worldDetail(material, opts = {}) {
  const set = typeof opts.set === 'string' ? pbr(opts.set) : opts.set;
  if (!set) return material;
  const o = {scale: 2.5, macro: 0, mode: 'planar', strength: 0.85, colorMix: 0, normalScale: 1, roughness: true, fade: 250, ...opts};
  const uniforms = {
    vqMap: {value: set.map}, vqNor: {value: set.normalMap}, vqRough: {value: set.roughnessMap},
    vqMean: {value: set.mean}, vqReady: {value: set.loaded ? 1 : 0},
    vqScale: {value: 1 / o.scale}, vqMacro: {value: o.macro ? 1 / o.macro : 0}, vqStrength: {value: o.strength},
    vqColorMix: {value: o.colorMix}, vqNScale: {value: o.normalScale}, vqFade: {value: o.fade}, vqNoise: {value: noiseTexture()},
  };
  set.ready.then(() => { uniforms.vqReady.value = 1; });
  material.userData.detail = uniforms;
  const mode = o.mode, useN = !!set.normalMap && o.normalScale > 0, useR = !!set.roughnessMap && o.roughness;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vqW;\nvarying vec3 vqWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 w = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            w = instanceMatrix * w;
          #endif
          vqW = (modelMatrix * w).xyz;
          vec3 n = objectNormal;
          #ifdef USE_INSTANCING
            n = mat3(instanceMatrix) * n;
          #endif
          vqWN = normalize(mat3(modelMatrix) * n); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vqW; varying vec3 vqWN;
        uniform sampler2D vqMap; uniform sampler2D vqNor; uniform sampler2D vqRough; uniform sampler2D vqNoise;
        uniform vec3 vqMean; uniform float vqReady, vqScale, vqMacro, vqStrength, vqColorMix, vqNScale, vqFade;
        ${GLSL_COMMON}
        vec3 vqTN; float vqRoughS;
        vec4 vqSample(sampler2D t, vec3 p, vec3 w, float s) {
          #if ${mode === 'planar' ? 1 : 0}
            return texture2D(t, p.xz * s);
          #else
            vec4 a = texture2D(t, p.zy * s), b = texture2D(t, p.xz * s), c = texture2D(t, p.xy * s);
            return a * w.x + b * w.y + c * w.z;
          #endif
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 vqWeights = pow(abs(vqWN), vec3(4.0));
        ${mode === 'side' ? 'vqWeights.y *= 0.05;' : ''}
        vqWeights /= (vqWeights.x + vqWeights.y + vqWeights.z + 1e-5);
        float vqDist = length(vqW - cameraPosition);
        float vqNear = vqFade / (vqFade + vqDist);
        vec3 vqP = vqW;
        vec4 vqC = vqSample(vqMap, vqP, vqWeights, vqScale);
        if (vqMacro > 0.0) {
          vec3 vqP2 = vec3(vqRot(vqW.xz, 0.61).x, vqW.y, vqRot(vqW.xz, 0.61).y);
          float vqN = texture2D(vqNoise, vqW.xz * 0.004).b;
          vec4 vqC2 = vqSample(vqMap, vec3(vqP2.x, vqW.y, vqP2.z), vqWeights, vqMacro);
          vqC = mix(vqC, vqC2, clamp(0.25 + 0.6 * (1.0 - vqNear) + (vqN - 0.5) * 0.8, 0.0, 0.85));
        }
        vec3 vqRatio = clamp(vqC.rgb / max(vqMean, vec3(0.02)), 0.0, 2.5);
        float vqK = vqReady * vqStrength * mix(0.55, 1.0, vqNear);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vqRatio, vqK);
        diffuseColor.rgb = mix(diffuseColor.rgb, vqC.rgb, vqReady * vqColorMix);
        ${useR ? 'vqRoughS = vqSample(vqRough, vqP, vqWeights, vqScale).g;' : 'vqRoughS = -1.0;'}
        ${useN ? 'vqTN = vqSample(vqNor, vqP, vqWeights, vqScale).xyz * 2.0 - 1.0;' : 'vqTN = vec3(0.0, 0.0, 1.0);'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vqRoughS >= 0.0) roughnessFactor = mix(roughnessFactor, clamp(vqRoughS * 1.1, 0.3, 1.0), 0.75 * vqReady);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${useN ? `{
          vec3 N = normalize(vqWN), nw;
          #if ${mode === 'planar' ? 1 : 0}
            nw = vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vqTN, vqNScale * vqReady * vqNear);
          #else
            vec3 nx = texture2D(vqNor, vqW.zy * vqScale).xyz * 2.0 - 1.0;
            vec3 ny = texture2D(vqNor, vqW.xz * vqScale).xyz * 2.0 - 1.0;
            vec3 nz = texture2D(vqNor, vqW.xy * vqScale).xyz * 2.0 - 1.0;
            float k = vqNScale * vqReady * vqNear;
            vec3 a = vqUDN(N, vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), nx, k);
            vec3 b = vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ny, k);
            vec3 c = vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), nz, k);
            nw = normalize(a * vqWeights.x + b * vqWeights.y + c * vqWeights.z);
          #endif
          vec3 nv = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          normal = nv * faceDirection;
        }` : ''}`);
  };
  const key = `vq-detail-${set.name}-${mode}-${useN}-${useR}`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => key + (prevKey ? prevKey() : '');
  material.needsUpdate = true;
  return material;
}
