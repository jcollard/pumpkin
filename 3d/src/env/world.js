// Sky, sea, sun and terrain for any track. Each track's course object supplies
// the land shape (terrainH), how to colour it (colourAt), and the mood (sun, sky, fog).
//
// Terrain is shaded with CC0 photo textures (assets/textures) mixed by slope and
// height: grass/ground, rock on steep cuts, packed soil along the verges and sand
// at the waterline. The course's colourAt still sets the colour; the photos add
// detail and relief around it. Optional course fields:
//   groundSets: {ground, rock, soil, sand}   texture folder names (defaults below)
//   splatAt(x, z, h, slope, out[4]) -> sets out = [rock, soil, sand, 0] weights 0..1
//   foam: false                               no shore foam
//   shoreBox: {x0, x1, z0, z1}                where to look for coastline foam
import * as THREE from 'three';
import {Sky} from 'three/addons/Sky.js';
import {Water} from 'three/addons/Water.js';
import {smooth, clamp} from '../noise.js';
import {waterNormals} from '../textures.js';
import {pbr, noiseTexture, GLSL_COMMON} from './surface.js';

const DEFAULT_SKY = {turbidity: 5.5, rayleigh: 1.4, mieCoefficient: 0.006, mieDirectionalG: 0.86, cloudCoverage: 0.32, cloudDensity: 0.35, cloudElevation: 0.55, cloudScale: 0.00018};

// Shared clock uniform for animated shaders (foam, grass and foliage wind).
// buildSkySea().update(wall) advances it every frame.
export const clock = {time: {value: 0}};

// Objects left out of the sea's reflection pass (grass, shrubs, trees, small props):
// they are barely visible in a wavy reflection but would double the scene's cost.
export const reflectionSkip = new Set();
export function noReflect(...objects) { for (const o of objects.flat()) if (o) reflectionSkip.add(o); return objects[0]; }
// Crowds (BatchedMesh) and anything flagged userData.noReflect are skipped too.
function skipBatched(o, hidden, depth = 0) {
  if (!o.visible || depth > 3) return;
  if (o.isBatchedMesh || o.userData?.noReflect) { o.visible = false; hidden.push(o); return; }
  for (const c of o.children) skipBatched(c, hidden, depth + 1);
}

export function buildSkySea(scene, renderer, course, {low = false} = {}) {
  reflectionSkip.clear(); // a new track is being built
  const sunDir = course.sunDir.clone().normalize();
  const sky = new Sky();
  sky.scale.setScalar(45000);
  const u = sky.material.uniforms, params = {...DEFAULT_SKY, ...(course.sky || {})};
  for (const [k, v] of Object.entries(params)) if (u[k]) u[k].value = v;
  u.sunPosition.value.copy(sunDir).multiplyScalar(1000);
  scene.add(sky);
  const fog = course.fog || {};
  scene.fog = new THREE.Fog(fog.color ?? 0xc7ccc8, fog.near ?? 900, fog.far ?? 16000);

  // Image-based light from the same sky over a ground the colour of the land,
  // so glossy pumpkins reflect sky above and warm earth below (not sky twice).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), envSky = new Sky();
  envSky.scale.setScalar(1000);
  for (const k of Object.keys(u)) if (envSky.material.uniforms[k]) envSky.material.uniforms[k].value = u[k].value;
  envSky.material.uniforms.cloudCoverage && (envSky.material.uniforms.cloudCoverage.value = Math.min(0.25, params.cloudCoverage));
  // The sun itself is the DirectionalLight; leaving its disc in the environment map
  // lights shadowed areas from the sun's direction too and washes shadows out.
  if (envSky.material.uniforms.showSunDisc) envSky.material.uniforms.showSunDisc.value = course.envSunDisc ? 1 : 0;
  envScene.add(envSky);
  const hemi = course.hemi || {};
  if (course.envGround !== false) {
    const gcol = new THREE.Color(course.envGround ?? hemi.ground ?? 0x7a6448).multiplyScalar(0.55);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({color: gcol, side: THREE.DoubleSide}));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -12;
    envScene.add(ground);
  }
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = course.envIntensity ?? 0.55;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(course.sunColor ?? 0xffe0b5, course.sunIntensity ?? 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 700});
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(hemi.sky ?? 0xc4d8f2, hemi.ground ?? 0x7a6448, hemi.intensity ?? 1.0));

  let water = null, foam = null;
  if (course.sea !== false) {
    const geo = new THREE.PlaneGeometry(30000, 30000);
    water = low
      ? new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: course.seaColor ?? 0x1d5566, roughness: 0.25, metalness: 0.1}))
      : new Water(geo, {textureWidth: 512, textureHeight: 512, waterNormals: waterNormals(), sunDirection: sunDir.clone(),
        sunColor: course.seaSunColor ?? 0xffe6c4, waterColor: course.seaColor ?? 0x0e4352, distortionScale: course.seaDistortion ?? 2.2, fog: true});
    if (water.material.uniforms?.size) water.material.uniforms.size.value = 6;
    if (water.material.fragmentShader) { // tighter, sparklier sun glint than the addon's default
      const [shiny, spec] = course.seaGlint ?? [170, 1.1];
      water.material.fragmentShader = water.material.fragmentShader.replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5,', `sunLight( surfaceNormal, eyeDirection, ${shiny.toFixed(1)}, ${spec.toFixed(2)}, 0.5,`);
    }
    water.rotation.x = -Math.PI / 2;
    water.position.set(1000, course.seaLevel ?? 0, 0);
    if (water.onBeforeRender && water.material.uniforms?.mirrorSampler) {
      // Mirror pass: skip registered small stuff and reuse this frame's shadow map.
      const mirror = water.onBeforeRender, hidden = [];
      water.onBeforeRender = function (renderer, ...rest) {
        hidden.length = 0;
        for (const o of reflectionSkip) if (o.visible && o.parent) { o.visible = false; hidden.push(o); }
        for (const o of rest[0]?.children ?? []) skipBatched(o, hidden);
        const au = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.autoUpdate = false;
        try { mirror.call(this, renderer, ...rest); } finally {
          renderer.shadowMap.autoUpdate = au;
          for (const o of hidden) o.visible = true;
        }
      };
    }
    scene.add(water);
    if (course.foam !== false) foam = shoreFoam(scene, course, {low});
  }
  scene.userData.shoreFoam = foam;

  return {
    sun, sunDir, water, envRT, foam,
    followShadow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(sunDir, 300);
    },
    update(wall) {
      if (water?.material.uniforms?.time) water.material.uniforms.time.value = wall * 0.55;
      clock.time.value = wall;
    },
  };
}

// --- Shore foam -----------------------------------------------------------
// A transparent sheet just above the sea. A baked height map of the land tells
// the shader where the water is shallow: foam hugs the shoreline, breaks in
// moving bands, and rings any rocks registered with addRocks([{x, z, r}]).
export function shoreFoam(scene, course, {low = false, box, res} = {}) {
  const n = course.terrain.near;
  const b = box ?? course.shoreBox ?? {x0: n.x0 - 900, x1: n.x1 + 1100, z0: -60, z1: 760};
  const W = res?.[0] ?? (low ? 512 : 1024), H = res?.[1] ?? (low ? 192 : 320);
  const sea = course.seaLevel ?? 0;
  const data = new Uint8Array(W * H * 4), heights = new Float32Array(W * H);
  const X = i => b.x0 + (i + 0.5) / W * (b.x1 - b.x0), Z = j => b.z0 + (j + 0.5) / H * (b.z1 - b.z0);
  // Coarse pass, then refine only near the waterline.
  const S = 4, cw = Math.ceil(W / S) + 1, ch = Math.ceil(H / S) + 1, coarse = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) coarse[j * cw + i] = course.terrainH(X(Math.min(W - 1, i * S)), Z(Math.min(H - 1, j * S))) - sea;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ci = Math.min(cw - 2, (i / S) | 0), cj = Math.min(ch - 2, (j / S) | 0);
    const c = [coarse[cj * cw + ci], coarse[cj * cw + ci + 1], coarse[(cj + 1) * cw + ci], coarse[(cj + 1) * cw + ci + 1]];
    const lo = Math.min(...c), hi = Math.max(...c);
    let h;
    if (lo > 6 || hi < -14) { const fx = i / S - ci, fz = j / S - cj; h = (c[0] * (1 - fx) + c[1] * fx) * (1 - fz) + (c[2] * (1 - fx) + c[3] * fx) * fz; }
    else h = course.terrainH(X(i), Z(j)) - sea;
    heights[j * W + i] = h;
  }
  const encode = () => {
    for (let k = 0; k < W * H; k++) {
      const v = clamp((heights[k] + 12) / 16, 0, 1) * 255; // -12..+4 m
      data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
    }
  };
  encode();
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
  Object.assign(uniforms, {
    hMap: {value: tex}, box: {value: new THREE.Vector4(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0)},
    noise: {value: noiseTexture()}, time: clock.time, sunDir: {value: course.sunDir.clone().normalize()},
    shallow: {value: new THREE.Color(course.shallowColor ?? 0x3f8f8a)}, shallowAmt: {value: course.shallowAmount ?? 0.32},
    sunCol: {value: new THREE.Color(course.sunColor ?? 0xffe0b5)},
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true, lights: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D hMap, noise; uniform vec4 box; uniform float time, shallowAmt; uniform vec3 sunDir, shallow, sunCol;
      varying vec3 vW;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = (vW.xz - box.xy) / box.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
        float h = texture2D(hMap, uv).r * 16.0 - 12.0;      // land height (m) relative to the sea
        if (h > 0.6) discard;
        float depth = max(0.0, -h);
        float n1 = texture2D(noise, vW.xz * 0.045 + vec2(time * 0.011, time * 0.007)).r;
        float n2 = texture2D(noise, vW.xz * 0.012 - vec2(time * 0.004, 0.0)).g;
        float n3 = texture2D(noise, vW.xz * 0.16 + vec2(0.0, time * 0.02)).r;
        // Swash right at the edge, breaking bands rolling in, and drifting streaks.
        float edge = smoothstep(1.9 + 1.6 * n2, 0.0, depth);
        float phase = depth * 1.15 - time * 0.9 + n2 * 5.0;
        float band = smoothstep(0.6, 0.97, sin(phase)) * smoothstep(7.0, 0.8, depth);
        float lace = smoothstep(0.4, 0.72, n1 * 0.62 + n3 * 0.58 - 0.08);
        vec2 sp = vec2(vW.x * 0.8 + vW.z * 0.6, vW.z * 0.8 - vW.x * 0.6);
        float streak = smoothstep(0.58, 0.8, texture2D(noise, sp * vec2(0.012, 0.05) + vec2(time * 0.003, 0.0)).g) * smoothstep(12.0, 2.0, depth);
        float foam = clamp(edge * (0.2 + 0.9 * lace) + band * lace * 0.8 + streak * lace * 0.45, 0.0, 1.0);
        foam *= smoothstep(0.6, 0.0, h) * (0.75 + 0.25 * n3);
        // Shallow water tint (turquoise over sand), fading with depth.
        float sh = smoothstep(9.0, 0.5, depth) * shallowAmt;
        float lit = 0.55 + 0.45 * clamp(sunDir.y * 3.0, 0.0, 1.0);
        vec3 foamCol = vec3(0.93, 0.95, 0.96) * lit * (0.75 + 0.25 * sunCol);
        float a = max(foam * 0.92, sh * (1.0 - foam));
        vec3 col = mix(shallow * lit, foamCol, foam / max(a, 1e-3) * min(1.0, foam * 1.2));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0, 1, 1);
  geo.rotateX(-Math.PI / 2); geo.translate((b.x0 + b.x1) / 2, sea + 0.06, (b.z0 + b.z1) / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2; mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh, texture: tex, box: b,
    // Paint rocks (sea stacks) into the height map so foam rings them.
    addRocks(list) {
      for (const r of list) {
        const rad = r.r ?? r.s ?? 4, reach = rad * 2.3;
        const i0 = Math.max(0, Math.floor((r.x - reach - b.x0) / (b.x1 - b.x0) * W)), i1 = Math.min(W - 1, Math.ceil((r.x + reach - b.x0) / (b.x1 - b.x0) * W));
        const j0 = Math.max(0, Math.floor((r.z - reach - b.z0) / (b.z1 - b.z0) * H)), j1 = Math.min(H - 1, Math.ceil((r.z + reach - b.z0) / (b.z1 - b.z0) * H));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(X(i) - r.x, Z(j) - r.z) / rad, k = j * W + i;
          const target = 1.6 * (1 - d * d), w = 1 - smooth(1.25, 2.2, d);
          if (target > heights[k]) heights[k] += (target - heights[k]) * w;
        }
      }
      encode(); tex.needsUpdate = true;
    },
  };
}

// --- Terrain ----------------------------------------------------------------
const DEFAULT_SETS = {ground: 'grass_dry', rock: 'rock_cliff', soil: 'dirt_packed', sand: 'sand_beach'};

// Default layer weights from slope/height; courses may override with splatAt.
function defaultSplat(course, x, z, h, slope, out) {
  const rock = smooth(0.62, 1.0, slope);
  const nearRoad = Math.abs(z) < course.roadHalf + 3.2 ? smooth(course.roadHalf + 3.2, course.roadHalf + 0.8, Math.abs(z)) : 0;
  const sand = course.sea !== false && course.sea && h < 2.6 + (course.seaLevel ?? 0) && slope < 0.6 ? smooth(2.6, 1.2, h - (course.seaLevel ?? 0)) : 0;
  out[0] = rock * (1 - sand); out[1] = nearRoad * (1 - rock) * 0.9; out[2] = sand; out[3] = 0;
  return out;
}

// Splat material for terrain meshes with vertex colours and a `splat` attribute
// (rock, soil, sand, -). Exported so tracks can shade their own ground meshes.
export function terrainMaterial(course = {}, {low = false, sets = {}, detail = null} = {}) {
  const S = {...DEFAULT_SETS, ...(course.groundSets || {}), ...sets};
  const g = pbr(S.ground), r = pbr(S.rock), s = pbr(S.soil), a = pbr(S.sand, {normal: false, roughness: false});
  const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.95, metalness: 0, map: detail || null});
  const U = {
    tG: {value: g.map}, tGN: {value: g.normalMap}, tR: {value: r.map}, tRN: {value: r.normalMap},
    tS: {value: s.map}, tSN: {value: s.normalMap}, tA: {value: a.map}, tNoise: {value: noiseTexture()},
    mG: {value: g.mean}, mR: {value: r.mean}, mS: {value: s.mean}, mA: {value: a.mean},
    ready: {value: 0},
  };
  Promise.all([g.ready, r.ready, s.ready, a.ready]).then(() => { U.ready.value = 1; });
  const LOW = low ? 1 : 0;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vqS;\nvarying vec3 vqW;\nvarying vec3 vqWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vqS = splat; vqW = (modelMatrix * vec4(transformed, 1.0)).xyz; vqWN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vqS; varying vec3 vqW; varying vec3 vqWN;
        uniform sampler2D tG, tGN, tR, tRN, tS, tSN, tA, tNoise;
        uniform vec3 mG, mR, mS, mA; uniform float ready;
        ${GLSL_COMMON}
        vec3 vqNw; float vqRough;
        vec4 tri(sampler2D t, vec3 p, vec3 w, float s) {
          return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 N = normalize(vqWN);
          vec3 w3 = pow(abs(N), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z + 1e-5);
          float dist = length(vqW - cameraPosition);
          float nearK = 140.0 / (140.0 + dist);
          vec2 p = vqW.xz;
          float nz = texture2D(tNoise, p * 0.0031).b, nm = texture2D(tNoise, p * 0.021).g;
          // Ground at two scales (3.2 m and 15 m, rotated) to hide tiling.
          vec3 g1 = texture2D(tG, p * 0.31).rgb;
          vec3 g2 = texture2D(tG, vqRot(p, 0.61) * 0.066).rgb;
          vec3 gC = mix(g1, g2, clamp(0.25 + 0.55 * (1.0 - nearK) + (nz - 0.5) * 0.9, 0.08, 0.92));
          // Rock: triplanar, 6 m and 22 m.
          vec3 rC = mix(tri(tR, vqW, w3, 0.16).rgb, tri(tR, vqW + 31.0, w3, 0.045).rgb, 0.45 + 0.3 * (1.0 - nearK));
          vec3 sC = mix(texture2D(tS, p * 0.33).rgb, texture2D(tS, vqRot(p, 1.1) * 0.07).rgb, 0.4);
          vec3 aC = mix(texture2D(tA, p * 0.25).rgb, texture2D(tA, vqRot(p, 0.4) * 0.05).rgb, 0.5);
          float lr = dot(rC / mR, vec3(0.333)), lg = dot(gC / mG, vec3(0.333));
          // Height-aware blending: rock shows first through its own bright faces.
          float wr = clamp((vqS.x - 0.5) * 2.4 + 0.5 + (lr - 1.0) * 0.9 + (nm - 0.5) * 0.6, 0.0, 1.0);
          float ws = clamp(vqS.y * 1.4 + (nm - 0.5) * 0.7 - (lg - 1.0) * 0.5 - 0.15, 0.0, 1.0) * (1.0 - wr);
          float wa = clamp(vqS.z, 0.0, 1.0) * (1.0 - wr);
          float wg = max(0.0, 1.0 - wr - ws - wa);
          float sum = wg + wr + ws + wa; wg /= sum; wr /= sum; ws /= sum; wa /= sum;
          float k = ready * mix(0.6, 1.0, nearK);
          vec3 base = diffuseColor.rgb;
          vec3 cg = base * mix(vec3(1.0), pow(clamp(gC / mG, 0.0, 2.2), vec3(1.35)), 0.95 * k);
          vec3 rR = pow(clamp(rC / mR, 0.0, 2.4), vec3(1.25));
          vec3 cr = mix(base * mix(vec3(1.0), rR, k), rR * dot(mR, vec3(0.333)) * dot(base, vec3(0.333)) / max(0.03, dot(mR, vec3(0.333))) * (mR / max(0.03, dot(mR, vec3(0.333)))), 0.55 * ready);
          vec3 cs = mix(base * mix(vec3(1.0), clamp(sC / mS, 0.0, 2.2), 0.85 * k), sC * 0.8, 0.2 * ready);
          vec3 ca = base * mix(vec3(1.0), clamp(aC / mA, 0.0, 2.0), 0.6 * k);
          diffuseColor.rgb = cg * wg + cr * wr + cs * ws + ca * wa;
          // Gentle macro variation so big slopes don't look airbrushed.
          diffuseColor.rgb *= 0.88 + 0.24 * nz;
          vqRough = 0.97 * wg + 0.86 * wr + 0.93 * ws + 0.9 * wa;
          #if ${LOW}
            vqNw = N;
          #else
            vec3 ng = texture2D(tGN, p * 0.31).xyz * 2.0 - 1.0;
            vec3 ns = texture2D(tSN, p * 0.33).xyz * 2.0 - 1.0;
            vec3 rx = texture2D(tRN, vqW.zy * 0.16).xyz * 2.0 - 1.0;
            vec3 ry = texture2D(tRN, vqW.xz * 0.16).xyz * 2.0 - 1.0;
            vec3 rz = texture2D(tRN, vqW.xy * 0.16).xyz * 2.0 - 1.0;
            float kn = ready * nearK;
            vec3 nG = vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ng, 0.9 * kn);
            vec3 nS = vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ns, 0.9 * kn);
            vec3 nR = normalize(vqUDN(N, vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), rx, 1.3 * kn) * w3.x
                              + vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ry, 1.3 * kn) * w3.y
                              + vqUDN(N, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), rz, 1.3 * kn) * w3.z);
            vqNw = normalize(nG * wg + nR * wr + nS * ws + N * wa);
          #endif
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vqRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(vqNw, 0.0)).xyz) * faceDirection;`);
  };
  mat.userData.terrain = U;
  mat.customProgramCacheKey = () => 'vq-terrain-' + LOW + (detail ? '-d' : '');
  return mat;
}

// Grid coordinates from a to b: `step` inside [f0, f1], growing with distance outside it.
function graded(a, b, step, f0, f1, ramp = 600, maxMul = 5) {
  const out = [a];
  for (let x = a; x < b;) {
    const d = Math.max(0, f0 - x, x - f1);
    x += step * Math.min(maxMul, 1 + d / ramp);
    out.push(Math.min(x, b));
  }
  if (b - out[out.length - 2] < step * 0.3) out.splice(out.length - 2, 1);
  return out;
}

function gridGeometry(xs, zs) {
  const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; pos[k * 3] = xs[i]; pos[k * 3 + 2] = zs[j]; }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function terrainMesh(course, {x0, x1, z0, z1, step, sink, uvScale, focus}, material) {
  let geo;
  if (focus) geo = gridGeometry(graded(x0, x1, step, focus.x0, focus.x1), graded(z0, z1, step, focus.z0, focus.z1));
  else {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
    geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  }
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), splat = new Float32Array(pos.count * 4), uv = geo.attributes.uv, col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = course.terrainH(x, z) - (sink ? sink(x, z) : 0);
    pos.setY(i, y);
    // Mixing height into V keeps the detail texture from streaking on walls that face the track.
    uv.setXY(i, x / uvScale, (z - y) / uvScale);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, w = [0, 0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.max(0.05, nrm.getY(i)), slope = Math.sqrt(1 - ny * ny) / ny;
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    course.colourAt(x, z, h, slope, col);
    colors.set([col.r, col.g, col.b], i * 3);
    if (course.splatAt) {
      w.fill(0);
      const res = course.splatAt(x, z, h, slope, w);
      if (Array.isArray(res) && res !== w) for (let k = 0; k < 4; k++) w[k] = res[k] ?? 0;
    } else defaultSplat(course, x, z, h, slope, w);
    splat.set(w, i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  return new THREE.Mesh(geo, material);
}

// A detailed patch around the course plus a coarse far field that dips under it.
export function buildTerrain(scene, course, {low = false} = {}) {
  const material = terrainMaterial(course, {low, detail: course.groundDetail ?? null});
  const n = course.terrain.near, f = course.terrain.far;
  const nearMesh = terrainMesh(course, {...n, step: low ? n.step * 1.5 : n.step, uvScale: n.uvScale ?? 7}, material);
  nearMesh.receiveShadow = true;
  const inside = (x, z) => Math.min(x - n.x0, n.x1 - x, z - n.z0, n.z1 - z);
  // The far field gets coarser away from the course (graded: false keeps a uniform grid).
  const farMesh = terrainMesh(course, {...f, step: low ? f.step * 1.6 : f.step, uvScale: f.uvScale ?? 40, focus: f.graded === false ? null : n,
    sink: (x, z) => (course.terrain.farSink ?? 14) * smooth(0, 40, inside(x, z))}, material);
  scene.add(nearMesh, farMesh);
  return {nearMesh, farMesh, material};
}
