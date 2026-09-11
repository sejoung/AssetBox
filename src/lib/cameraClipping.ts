import * as THREE from "three";

const center = new THREE.Vector3();
const size = new THREE.Vector3();

/** Keep the whole model in depth range while preserving precision as the view moves. */
export function updateCameraClipping(camera: THREE.PerspectiveCamera, bounds: THREE.Box3) {
  if (
    bounds.isEmpty() ||
    ![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(
      Number.isFinite
    )
  )
    return;

  camera.updateWorldMatrix(true, false);
  bounds.getCenter(center).applyMatrix4(camera.matrixWorldInverse);
  // A bounding sphere stays conservative during orbiting and off-center inspection.
  const radius = Math.max(bounds.getSize(size).length() / 2, 1e-8);
  const depth = -center.z;
  if (!Number.isFinite(depth) || !Number.isFinite(radius)) return;

  // Keep a small near plane only when inspecting from inside the model bounds.
  // A permanently tiny near plane loses depth precision when zooming out.
  const near = Math.max((depth - radius) * 0.5, radius * 1e-5);
  const far = Math.max(depth + radius * 1.2, radius * 2, near * 2);
  if (camera.near === near && camera.far === far) return;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}
