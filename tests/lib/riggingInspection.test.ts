import * as THREE from "three";
import { expect, it } from "vitest";
import { inspectRigging } from "../../src/lib/riggingInspection";
import { createBoneOverlay } from "../../src/lib/boneOverlay";

function fixture() {
  const root = new THREE.Bone();
  root.name = "Root";
  const child = new THREE.Bone();
  child.name = "Joint";
  child.position.y = 1;
  const intermediary = new THREE.Group();
  intermediary.position.x = 2;
  root.add(intermediary);
  intermediary.add(child);
  root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3)
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([0.5, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], 4)
  );
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([root, child]));
  mesh.name = "Body";
  return { root, child, mesh, scene: new THREE.Group().add(root, mesh) };
}

it("deduplicates shared skeletons and preserves hierarchy through non-bone parents", () => {
  const { scene, mesh, root, child } = fixture();
  scene.add(mesh.clone());
  const weights = Array.from(mesh.geometry.getAttribute("skinWeight").array);
  const rig = inspectRigging(scene);
  expect(rig.skeletonCount).toBe(1);
  expect(rig.bones).toEqual([
    { id: root.uuid, name: "Root", parentId: null },
    { id: child.uuid, name: "Joint", parentId: root.uuid },
  ]);
  expect(rig.skins).toHaveLength(2);
  expect(rig.skins[0]).toMatchObject({
    vertexCount: 3,
    maxInfluences: 2,
    unweightedVertices: 1,
    invalidInfluenceVertices: 0,
  });
  expect(Array.from(mesh.geometry.getAttribute("skinWeight").array)).toEqual(weights);
});

it("distinguishes unreadable attributes, invalid references and unbound bones", () => {
  const { scene, mesh } = fixture();
  mesh.geometry.getAttribute("skinIndex").setX(0, 99);
  mesh.geometry.getAttribute("skinWeight").setX(1, NaN);
  expect(inspectRigging(scene).skins[0].invalidInfluenceVertices).toBe(2);
  mesh.geometry.deleteAttribute("skinWeight");
  expect(inspectRigging(scene).skins[0].maxInfluences).toBeNull();
  const boneOnly = inspectRigging(new THREE.Group().add(new THREE.Bone()));
  expect(boneOnly.bones).toHaveLength(1);
  expect(boneOnly.skins).toEqual([]);
  expect(inspectRigging(new THREE.Group()).bones).toEqual([]);
});

it("includes detached skin joints and allows duplicate bone names", () => {
  const { mesh, root, child } = fixture();
  root.name = child.name = "Joint";
  const rig = inspectRigging(new THREE.Group().add(mesh));
  expect(rig.bones).toHaveLength(2);
  expect(new Set(rig.bones.map((bone) => bone.id)).size).toBe(2);
});

it.each([0.00001, 1, 100000])(
  "aligns octahedral heads and tails with transformed joints at scale %s",
  (scale) => {
    const { scene, root, child } = fixture();
    scene.position.set(10 * scale, 20 * scale, 30 * scale);
    scene.scale.set(scale * 2, scale, scale * 0.5);
    scene.rotation.z = 0.4;
    const overlay = createBoneOverlay(scene);
    overlay.update();
    const bodies = overlay.group.getObjectByName("Octahedral bones") as THREE.InstancedMesh;
    const joints = overlay.group.getObjectByName("Bone joints") as THREE.InstancedMesh;
    expect(bodies.count).toBe(1);
    expect(joints.count).toBe(2);
    expect(bodies.geometry.getAttribute("position").count).toBe(24); // eight triangular faces
    const matrix = new THREE.Matrix4();
    const checkEndpoints = () => {
      bodies.getMatrixAt(0, matrix);
      const head = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
      const tail = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
      expect(head.distanceTo(root.getWorldPosition(new THREE.Vector3())) / scale).toBeLessThan(
        0.00001
      );
      expect(tail.distanceTo(child.getWorldPosition(new THREE.Vector3())) / scale).toBeLessThan(
        0.00001
      );
    };
    checkEndpoints();
    child.position.y = 3;
    overlay.update();
    checkEndpoints();
    // Wide shoulder near the head, tapering to a point at the tail.
    expect(bodies.geometry.getAttribute("position").getY(1)).toBeCloseTo(0.2);
    overlay.dispose();
  }
);

it("keeps terminal and isolated joints without inventing tails, and skips zero-length bodies", () => {
  const root = new THREE.Bone(),
    child = new THREE.Bone(),
    branch = new THREE.Bone();
  root.add(child, branch);
  branch.position.x = 2;
  const scene = new THREE.Group().add(root, new THREE.Bone());
  const overlay = createBoneOverlay(scene);
  overlay.update();
  const bodies = overlay.group.getObjectByName("Octahedral bones") as THREE.InstancedMesh;
  const joints = overlay.group.getObjectByName("Bone joints") as THREE.InstancedMesh;
  expect(bodies.count).toBe(1);
  expect(joints.count).toBe(4);
  expect(Array.from(joints.instanceMatrix.array).every(Number.isFinite)).toBe(true);
  child.position.y = 1;
  overlay.update();
  expect(bodies.count).toBe(2);
  branch.position.x = 0;
  overlay.update();
  expect(bodies.count).toBe(1);
  overlay.dispose();
});

it("releases overlay instance buffers, geometry and materials once without disposing source skin data", () => {
  const { scene, mesh } = fixture();
  const weights = Array.from(mesh.geometry.getAttribute("skinWeight").array);
  const transforms = mesh.skeleton.bones.map((bone) => bone.matrix.toArray());
  const overlay = createBoneOverlay(scene);
  const owned = new Set<THREE.EventDispatcher<{ dispose: object }>>();
  overlay.group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) owned.add(object);
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      owned.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        owned.add(material);
    }
  });
  let released = 0,
    sourceReleased = 0;
  for (const resource of owned) resource.addEventListener("dispose", () => released++);
  mesh.geometry.addEventListener("dispose", () => sourceReleased++);
  overlay.update();
  overlay.dispose();
  overlay.dispose();
  expect(released).toBe(owned.size);
  expect(sourceReleased).toBe(0);
  expect(Array.from(mesh.geometry.getAttribute("skinWeight").array)).toEqual(weights);
  expect(mesh.skeleton.bones.map((bone) => bone.matrix.toArray())).toEqual(transforms);
});

it("keeps all selected parent branches and gives occluded bones a separate faint depth pass", () => {
  const root = new THREE.Bone(),
    left = new THREE.Bone(),
    right = new THREE.Bone();
  root.add(left, right);
  left.position.set(-1, 1, 0);
  right.position.set(1, 1, 0);
  const overlay = createBoneOverlay(new THREE.Group().add(root), root.uuid);
  overlay.update();
  const selected = overlay.group.getObjectByName("Selected bones") as THREE.InstancedMesh;
  const bodies = overlay.group.getObjectByName("Octahedral bones") as THREE.InstancedMesh;
  const hidden = overlay.group.getObjectByName("Occluded bones") as THREE.InstancedMesh;
  expect(selected.count).toBe(2);
  expect(bodies.userData.boneIds).toEqual([root.uuid, root.uuid]);
  const visibleMaterial = bodies.material as THREE.MeshBasicMaterial;
  const hiddenMaterial = hidden.material as THREE.MeshBasicMaterial;
  expect(visibleMaterial.depthTest).toBe(true);
  expect(visibleMaterial.depthFunc).toBe(THREE.LessEqualDepth);
  expect(hiddenMaterial.depthFunc).toBe(THREE.GreaterDepth);
  expect(hiddenMaterial.opacity).toBeLessThan(visibleMaterial.opacity);
  overlay.dispose();
});
