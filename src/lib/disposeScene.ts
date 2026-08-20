import * as THREE from "three";

/**
 * Releases geometry/material/texture GPU resources for a loaded scene.
 * Shared by the viewer and by batch validation, both of which load models
 * that must be torn down explicitly — three.js does not do it on GC.
 */
export function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (mat) {
          for (const key of Object.keys(mat) as (keyof typeof mat)[]) {
            const value = mat[key];
            if (value instanceof THREE.Texture) {
              value.dispose();
            }
          }
          mat.dispose();
        }
      }
    }
  });
}
