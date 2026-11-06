// glTF model loading for scenery. Models are cached; placing one clones it.
// Use place() for a few copies and scatterModel() for many (InstancedMesh per part).
import * as THREE from 'three';

let loaderPromise = null;
async function loader() {
  loaderPromise ??= import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
  return loaderPromise;
}

const cache = new Map();
// Path is relative to the page (index.html), e.g. 'assets/models/trees/oak.glb'.
export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader().then(l => l.loadAsync(path)).then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g.scene;
  }).catch(e => { console.warn('[models] could not load', path, e.message); return null; }));
  return cache.get(path);
}
export const loadModels = paths => Promise.all(paths.map(loadModel));

// Add one copy. opts: {x, y, z, rotY, scale (number or [x,y,z]), shadows}
export async function place(group, path, {x = 0, y = 0, z = 0, rotY = 0, scale = 1, cast = true} = {}) {
  const tpl = await loadModel(path);
  if (!tpl) return null;
  const obj = tpl.clone(true);
  obj.position.set(x, y, z); obj.rotation.y = rotY;
  Array.isArray(scale) ? obj.scale.set(...scale) : obj.scale.setScalar(scale);
  if (!cast) obj.traverse(o => { if (o.isMesh) o.castShadow = false; });
  group.add(obj);
  return obj;
}

// Many copies of one model as InstancedMeshes (one per mesh part).
// points: [{x, y, z, rotY?, scale?}]. Returns the created meshes.
export async function scatterModel(group, path, points, {cast = true, colorJitter = 0} = {}) {
  const tpl = await loadModel(path);
  if (!tpl || !points.length) return [];
  tpl.updateMatrixWorld(true);
  const parts = [];
  tpl.traverse(o => { if (o.isMesh) parts.push(o); });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const out = [];
  for (const part of parts) {
    const inst = new THREE.InstancedMesh(part.geometry, part.material, points.length);
    points.forEach((pt, i) => {
      q.setFromAxisAngle(up, pt.rotY ?? 0);
      const sc = pt.scale ?? 1;
      Array.isArray(sc) ? s.set(...sc) : s.setScalar(sc);
      p.set(pt.x, pt.y, pt.z);
      m.compose(p, q, s).multiply(part.matrixWorld);
      inst.setMatrixAt(i, m);
      if (colorJitter) inst.setColorAt(i, new THREE.Color(1, 1, 1).offsetHSL(0, 0, (Math.sin(i * 12.9898) * 0.5) * colorJitter));
    });
    inst.castShadow = cast && part.castShadow; inst.receiveShadow = true;
    group.add(inst); out.push(inst);
  }
  return out;
}

// Bounding box size of a loaded model at scale 1 (useful to fit real-world heights).
export async function modelSize(path) {
  const tpl = await loadModel(path);
  if (!tpl) return null;
  return new THREE.Box3().setFromObject(tpl).getSize(new THREE.Vector3());
}
