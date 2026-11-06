// Merge the static meshes of a group that share a material into one mesh each
// (fewer draw calls). Only use it on groups whose contents never move.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';

export function consolidate(group, parent = group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const buckets = new Map();
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || Array.isArray(o.material) || o.userData.keep) return;
    const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${attrs}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  let merged = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => {
      let g = o.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
    parent.add(m);
    merged += list.length - 1;
  }
  return merged;
}
