import * as THREE from "three";

type Resources = {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
  skeletons: Set<THREE.Skeleton>;
};
const owned = new WeakMap<THREE.Object3D, Resources>();
const disposed = new WeakSet<THREE.Object3D>();

/** Capture original resources before diagnostic modes temporarily replace them.
 * Temporary overlays own and release their own resources. */
export function retainSceneResources(scene: THREE.Object3D): void {
  if (owned.has(scene) || disposed.has(scene)) return;
  const resources: Resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    skeletons: new Set(),
  };
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    resources.geometries.add(child.geometry);
    if (child instanceof THREE.SkinnedMesh) resources.skeletons.add(child.skeleton);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      resources.materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) resources.textures.add(value);
      }
    }
  });
  owned.set(scene, resources);
}

/** Idempotent release, including shared source materials hidden by view modes. */
export function disposeScene(scene: THREE.Object3D): void {
  if (disposed.has(scene)) return;
  retainSceneResources(scene);
  const resources = owned.get(scene)!;
  disposed.add(scene);
  owned.delete(scene);
  resources.geometries.forEach((geometry) => geometry.dispose());
  resources.materials.forEach((material) => material.dispose());
  resources.textures.forEach((texture) => texture.dispose());
  resources.skeletons.forEach((skeleton) => skeleton.dispose());
}
