import * as THREE from "three";
import { updateCameraClipping } from "./cameraClipping";

/** Fit the affected region while retaining the current viewing direction. */
export function focusIssueBounds(
  camera: THREE.PerspectiveCamera,
  controls:
    | (THREE.EventDispatcher & {
        target: THREE.Vector3;
        minDistance: number;
        maxDistance: number;
        update: () => void;
      })
    | null,
  bounds: THREE.Box3,
  modelBounds: THREE.Box3
) {
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
  )
    return;
  const center = bounds.getCenter(new THREE.Vector3());
  const measuredSize = modelBounds.getSize(new THREE.Vector3()).length();
  const modelSize = Math.max(
    Number.isFinite(measuredSize) ? measuredSize : bounds.getSize(new THREE.Vector3()).length(),
    1e-6
  );
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, modelSize * 0.005);
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  const distance = (radius / Math.sin(angle)) * 1.2;
  const direction = camera.position.clone().sub(controls?.target ?? center);
  if (direction.lengthSq() < 1e-12) direction.set(1, 0.8, 1);
  camera.position.copy(center).addScaledVector(direction.normalize(), distance);
  camera.lookAt(center);
  if (controls) {
    controls.target.copy(center);
    controls.minDistance = radius * 0.05;
    controls.maxDistance = Math.max(distance * 20, modelSize * 20);
    controls.update();
  }
  // Publish the fitted view immediately, before the first paint or pointer event.
  camera.updateMatrixWorld(true);
  updateCameraClipping(camera, bounds.clone().union(modelBounds));
}
