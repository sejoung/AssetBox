import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { updateCameraClipping } from "../../src/lib/cameraClipping";
import { focusIssueBounds } from "../../src/lib/focusIssueBounds";

function cube(scale: number) {
  return new THREE.Box3(
    new THREE.Vector3().setScalar(-scale),
    new THREE.Vector3().setScalar(scale)
  );
}

function expectDepthContained(camera: THREE.PerspectiveCamera, bounds: THREE.Box3) {
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const depth = new THREE.Vector3(x, y, z).project(camera).z;
        expect(depth).toBeGreaterThan(-1);
        expect(depth).toBeLessThan(1);
      }
}

describe("camera clipping", () => {
  it.each([1e-6, 1, 1e6])(
    "keeps the entire model visible at maximum zoom-out, scale %s",
    (scale) => {
      const camera = new THREE.PerspectiveCamera(50, 1.5);
      camera.position.set(3, 3, 3).multiplyScalar(scale);
      const bounds = cube(scale);
      const controls = Object.assign(new THREE.EventDispatcher(), {
        target: new THREE.Vector3(),
        minDistance: 0,
        maxDistance: 1,
        update() {},
      });
      focusIssueBounds(camera, controls, bounds, bounds);
      for (const fraction of [0.4, 0.7, 0.95, 1]) {
        for (const angle of [-1, 0, 1, Math.PI]) {
          camera.position
            .set(Math.sin(angle), 0.5, Math.cos(angle))
            .normalize()
            .multiplyScalar(controls.maxDistance * fraction);
          camera.lookAt(controls.target);
          updateCameraClipping(camera, bounds);
          expectDepthContained(camera, bounds);
        }
      }
    }
  );

  it("resolves closely spaced model surfaces throughout zoom-out with a 24-bit depth buffer", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5);
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 0.002));
    const quantizedDepth = (z: number) =>
      Math.round((new THREE.Vector3(0, 0, z).project(camera).z * 0.5 + 0.5) * (2 ** 24 - 1));
    for (const distance of [5, 30, 60, 100]) {
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      updateCameraClipping(camera, bounds);
      expect(quantizedDepth(0) - quantizedDepth(0.002)).toBeGreaterThan(100);
    }
  });

  it("uses model depth when the camera targets an off-center finding or is panned", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5);
    const bounds = cube(5).translate(new THREE.Vector3(100, -20, 80));
    camera.position.set(90, -15, 110);
    camera.lookAt(98, -18, 84);
    const position = camera.position.clone();
    const orientation = camera.quaternion.clone();
    updateCameraClipping(camera, bounds);
    expectDepthContained(camera, bounds);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(orientation)).toBe(true);
  });

  it.each([1e-6, 1, 1e6])(
    "retains close inspection after zooming back inside bounds, scale %s",
    (scale) => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 100 * scale);
      updateCameraClipping(camera, cube(scale));
      camera.position.set(0, 0, 0.1 * scale);
      updateCameraClipping(camera, cube(scale));
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.near).toBeLessThan(scale * 0.001);
      const depth = new THREE.Vector3(0, 0, 0.099 * scale).project(camera).z;
      expect(Math.abs(depth)).toBeLessThan(1);
      expect(camera.far).toBeGreaterThan(scale);
    }
  );

  it("handles point bounds and a model behind the camera with a valid projection", () => {
    const camera = new THREE.PerspectiveCamera();
    for (const bounds of [cube(0), cube(1).translate(new THREE.Vector3(0, 0, 100))]) {
      updateCameraClipping(camera, bounds);
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
      expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    }
  });

  it("ignores empty and non-finite bounds", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    for (const bounds of [new THREE.Box3(), cube(NaN), cube(Infinity)]) {
      updateCameraClipping(camera, bounds);
      expect(camera.near).toBe(0.01);
      expect(camera.far).toBe(100);
    }
  });

  it("avoids recomputing an unchanged projection", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.z = 10;
    const update = vi.spyOn(camera, "updateProjectionMatrix");
    updateCameraClipping(camera, cube(1));
    updateCameraClipping(camera, cube(1));
    expect(update).toHaveBeenCalledTimes(1);
  });
});
