import * as THREE from "three";
import { expect, it } from "vitest";
import { createBoneInfluenceOverlay, inspectBoneInfluence } from "../../src/lib/boneInfluence";

function fixture() {
  const a = new THREE.Bone();
  a.name = "Hips";
  const b = new THREE.Bone();
  b.name = "Spine";
  b.position.y = 1;
  a.add(b);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 0.25, 0.75, 0, 0], 4)
  );
  a.updateMatrixWorld(true);
  const first = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  first.name = "Body";
  first.bind(new THREE.Skeleton([a, b]));
  const second = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  second.name = "Clothes";
  second.bind(new THREE.Skeleton([b, a]));
  const model = new THREE.Group().add(a, first, second);
  return { a, b, first, second, model };
}

it("matches the selected bone to each mesh's local joint palette and preserves partial weights", () => {
  const { a, model } = fixture();
  const selected = inspectBoneInfluence(model, a.uuid)!;
  expect(selected.targets.map((target) => Array.from(target.weights!))).toEqual([
    [1, 0, 0.25],
    [0, 1, 0.75],
  ]);
  expect(selected.targets.map((target) => target.weightedVertices)).toEqual([2, 2]);
  expect(inspectBoneInfluence(model, "missing")).toBeNull();
});

it("distinguishes missing weights, unused joints and bones without bindings", () => {
  const { a, b, first, second, model } = fixture();
  const control = new THREE.Bone();
  model.add(control);
  expect(inspectBoneInfluence(model, control.uuid)!.targets).toEqual([]);
  first.geometry = first.geometry.clone();
  first.geometry.deleteAttribute("skinWeight");
  second.geometry.getAttribute("skinWeight").array.fill(0);
  const selected = inspectBoneInfluence(model, b.uuid)!;
  expect(selected.targets[0].weights).toBeNull();
  expect(selected.targets[1].weights).not.toBeNull();
  expect(selected.targets[1].weightedVertices).toBe(0);
  expect(inspectBoneInfluence(model, a.uuid)!.targets[1].maxWeight).toBe(0);
});

it("uses the loaded skinned pose and world transform without modifying or disposing source geometry", () => {
  const { a, b, first, model } = fixture();
  model.position.set(3, 4, 5);
  model.scale.setScalar(2);
  b.rotation.z = 0.5;
  model.updateMatrixWorld(true);
  const selection = inspectBoneInfluence(model, a.uuid)!;
  const originalGeometry = first.geometry,
    originalMaterial = first.material;
  const weights = Array.from(first.geometry.getAttribute("skinWeight").array);
  const overlay = createBoneInfluenceOverlay(selection);
  overlay.update();
  const surface = overlay.group.children[0] as THREE.Mesh;
  const position = new THREE.Vector3();
  for (let vertex = 0; vertex < 3; vertex++) {
    const expected = first
      .getVertexPosition(vertex, new THREE.Vector3())
      .applyMatrix4(first.matrixWorld);
    position
      .fromBufferAttribute(surface.geometry.getAttribute("position"), vertex)
      .applyMatrix4(surface.matrix);
    expect(position.distanceTo(expected)).toBeLessThan(0.000001);
  }
  expect(surface.geometry.getAttribute("boneWeight").getX(1)).toBe(0);
  expect(surface.geometry.getAttribute("boneWeight").getX(0)).toBe(1);
  let sourceDisposed = 0,
    overlayDisposed = 0;
  originalGeometry.addEventListener("dispose", () => sourceDisposed++);
  surface.geometry.addEventListener("dispose", () => overlayDisposed++);
  overlay.dispose();
  expect(sourceDisposed).toBe(0);
  expect(overlayDisposed).toBe(1);
  expect(first.geometry).toBe(originalGeometry);
  expect(first.material).toBe(originalMaterial);
  expect(Array.from(first.geometry.getAttribute("skinWeight").array)).toEqual(weights);
});
