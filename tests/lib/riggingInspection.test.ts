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

it("draws bone-only roots and transformed joints, releasing only its own buffers", () => {
  const { scene, child, mesh } = fixture();
  scene.position.set(10, 20, 30);
  const overlay = createBoneOverlay(scene);
  overlay.update();
  const lines = overlay.group.children[0] as THREE.LineSegments;
  const points = overlay.group.children[1] as THREE.Points;
  expect(Array.from(lines.geometry.getAttribute("position").array)).toEqual([
    10, 20, 30, 12, 21, 30,
  ]);
  expect(points.geometry.getAttribute("position").count).toBe(2);
  child.position.y = 3;
  overlay.update();
  expect(lines.geometry.getAttribute("position").getY(1)).toBe(23);
  const source = mesh.geometry.getAttribute("skinWeight");
  let released = 0,
    sourceReleased = 0;
  lines.geometry.addEventListener("dispose", () => released++);
  mesh.geometry.addEventListener("dispose", () => sourceReleased++);
  overlay.dispose();
  expect(released).toBe(1);
  expect(sourceReleased).toBe(0);
  expect(mesh.geometry.getAttribute("skinWeight")).toBe(source);
});
