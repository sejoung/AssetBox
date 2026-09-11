import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { captureInspectionSource, inspectIssue } from "../../src/lib/issueInspection";
import { focusIssueBounds } from "../../src/lib/focusIssueBounds";
import { analyzeModel } from "../../src/components/ModelLoader";
import type { InspectionKind, ValidationItem } from "../../src/types/asset";

const item = (inspection: InspectionKind): ValidationItem => ({
  inspection,
  label: inspection,
  value: "",
  severity: "warning",
  category: "topology",
});
const sceneWith = (geometry: THREE.BufferGeometry) => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  return scene;
};
const positions = (values: number[]) =>
  new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(values, 3));

describe("inspection locations", () => {
  it.each([false, true])(
    "locates actual boundary edges and preserves seam handling (nonindexed=%s)",
    (nonindexed) => {
      const geometry = new THREE.PlaneGeometry();
      const scene = sceneWith(nonindexed ? geometry.toNonIndexed() : geometry);
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      const source = captureInspectionSource(scene);
      const selection = inspectIssue(source, item("open-edges"));
      expect(selection.targets).toHaveLength(1);
      expect(selection.targets[0].count).toBe(analyzeModel(scene).diagnostics.openEdgeCount);
      expect(selection.targets[0].positions).toHaveLength(4 * 2 * 3);
      expect(inspectIssue(source, item("non-manifold")).targets).toHaveLength(0);
    }
  );

  it("marks only the shared edge with three incident faces", () => {
    const scene = sceneWith(
      positions([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    );
    const target = inspectIssue(captureInspectionSource(scene), item("non-manifold")).targets[0];
    expect(target.count).toBe(1);
    expect([...target.positions]).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it("uses source normals and face indices after a view mode replaces render geometry/materials", () => {
    const geometry = new THREE.PlaneGeometry();
    for (let i = 0; i < geometry.attributes.normal.count; i++)
      geometry.attributes.normal.setXYZ(i, 0, 0, -1);
    const scene = sceneWith(geometry);
    const mesh = scene.children[0] as THREE.Mesh;
    mesh.material = new THREE.MeshStandardMaterial({ name: "Paint" });
    const source = captureInspectionSource(scene);
    mesh.geometry = new THREE.BoxGeometry();
    mesh.material = new THREE.MeshBasicMaterial();
    const target = inspectIssue(source, item("normal-mismatch")).targets[0];
    expect(target.count).toBe(2);
    expect(target.positions.length).toBe(18);
    expect(target.details).toContain("Material: Paint");
    expect(mesh.geometry).not.toBe(geometry);
    expect(geometry.index!.count).toBe(6);
  });

  it("locates collapsed triangles and unchecked normals using the validation predicates", () => {
    const scene = sceneWith(positions([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]));
    const source = captureInspectionSource(scene);
    expect(inspectIssue(source, item("degenerate")).targets[0].count).toBe(1);
    expect(inspectIssue(source, item("unchecked-normals")).targets[0].count).toBe(2);
    expect(inspectIssue(source, item("normal-mismatch")).targets).toHaveLength(0);
  });

  it("keeps nested transforms model-local so display centering does not move the highlight", () => {
    const scene = new THREE.Group();
    scene.name = "Asset";
    scene.position.set(100, 20, -10);
    const parent = new THREE.Group();
    parent.name = "Assembly";
    parent.position.set(3, 2, 1);
    parent.rotation.z = Math.PI / 2;
    parent.scale.set(2, 3, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry());
    mesh.name = "Panel";
    parent.add(mesh);
    scene.add(parent);
    const source = captureInspectionSource(scene);
    const target = inspectIssue(source, item("open-edges")).targets[0];
    expect(target.name).toBe("Asset / Assembly / Panel");
    expect(target.bounds.getCenter(new THREE.Vector3()).toArray()).toEqual([3, 2, 1]);
    expect(target.bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(3);
    const wrapper = new THREE.Group();
    wrapper.position.set(-103, -22, 9);
    wrapper.add(scene);
    wrapper.updateMatrixWorld(true);
    const worldBounds = target.bounds.clone().applyMatrix4(scene.matrixWorld);
    expect(worldBounds.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0);
    const scale = inspectIssue(source, item("non-uniform-scale"));
    expect(scale.targets).toHaveLength(1);
    expect(scale.targets[0].id).toBe(parent.uuid);
  });

  it("lists only missing UV bindings in material slots actually used by the mesh", () => {
    const geometry = new THREE.PlaneGeometry();
    geometry.clearGroups();
    geometry.addGroup(0, 6, 0);
    const map = new THREE.Texture();
    map.channel = 1;
    map.name = "Wood";
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(geometry, [
        new THREE.MeshStandardMaterial({ name: "Oak", map }),
        new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
      ])
    );
    let source = captureInspectionSource(scene);
    expect(inspectIssue(source, item("missing-uv")).targets).toHaveLength(0);
    const target = inspectIssue(source, item("required-uv")).targets[0];
    expect(target.details).toEqual(["Oak · map · Wood · UV 1 · size unknown · channel missing"]);
    geometry.setAttribute("uv1", geometry.attributes.uv.clone());
    source = captureInspectionSource(scene);
    expect(inspectIssue(source, item("required-uv")).targets).toHaveLength(0);
  });

  it("locates the actual oversized texture binding and does not invent failed-resource ownership", () => {
    const scene = new THREE.Group();
    for (const width of [8, 8192]) {
      const map = new THREE.Texture({ width, height: 4 });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map })));
    }
    const source = captureInspectionSource(scene, ["/missing/wood.png"]);
    expect(inspectIssue(source, item("textures")).targets).toHaveLength(2);
    const selected = inspectIssue(source, item("texture-resolution"));
    expect(selected.targets).toHaveLength(1);
    expect(selected.targets[0].details[0]).toContain("8192px");
    const failed = inspectIssue(source, item("failed-resources"));
    expect(failed.targets).toHaveLength(0);
    expect(failed.source.failedResources).toEqual(["/missing/wood.png"]);
  });

  it("caps overlay allocation while preserving total counts and bounds", () => {
    const values: number[] = [];
    for (let i = 0; i < 7000; i++) values.push(i * 2, 0, 0, i * 2 + 1, 0, 0, i * 2, 1, 0);
    const scene = sceneWith(positions(values));
    const target = inspectIssue(captureInspectionSource(scene), item("open-edges")).targets[0];
    expect(target.count).toBe(21000);
    expect(target.positions.length).toBe(20000 * 6);
    expect(target.truncated).toBe(true);
    expect(target.bounds.max.x).toBe(13999);
  });
});

it.each([1e-6, 1, 1e6])("fits a selected region into a narrow viewport at scale %s", (scale) => {
  const camera = new THREE.PerspectiveCamera(50, 0.45, 0.01, 1000);
  camera.position.set(3 * scale, 3 * scale, 3 * scale);
  const bounds = new THREE.Box3(
    new THREE.Vector3(-scale, -scale, -scale),
    new THREE.Vector3(scale, scale, scale)
  );
  const controls = Object.assign(new THREE.EventDispatcher(), {
    target: new THREE.Vector3(),
    minDistance: 0,
    maxDistance: 1,
    update: vi.fn(),
  });
  focusIssueBounds(camera, controls, bounds, bounds);
  // The fitted view must be ready before a renderer frame or pointer event.
  for (const x of [-scale, scale])
    for (const y of [-scale, scale])
      for (const z of [-scale, scale]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
        expect(Math.abs(projected.z)).toBeLessThan(1);
      }
  expect(controls.target.toArray()).toEqual([0, 0, 0]);
  expect(controls.update).toHaveBeenCalled();
});

it("marks the loaded morph pose while keeping source topology diagnostics", () => {
  const geometry = new THREE.PlaneGeometry();
  const morph = geometry.attributes.position.clone();
  for (let i = 0; i < morph.count; i++) morph.setX(i, morph.getX(i) + 10);
  geometry.morphAttributes.position = [morph];
  const scene = sceneWith(geometry);
  (scene.children[0] as THREE.Mesh).morphTargetInfluences![0] = 0.5;
  const target = inspectIssue(captureInspectionSource(scene), item("open-edges")).targets[0];
  expect(target.bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(5);
  expect(target.count).toBe(4);
});

it("discloses instance bounds instead of placing shared edges at an invented instance", () => {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial(), 2);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-10, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(10, 0, 0));
  const scene = new THREE.Group();
  scene.add(mesh);
  const target = inspectIssue(captureInspectionSource(scene), item("open-edges")).targets[0];
  expect(target.primitive).toBe("bounds");
  expect(target.bounds.min.x).toBe(-10.5);
  expect(target.bounds.max.x).toBe(10.5);
  expect(target.details.join(" ")).toContain("individual faces are not highlighted");
});

it("does not send non-finite vertices to the overlay or camera", () => {
  const scene = sceneWith(positions([0, 0, 0, NaN, 0, 0, 0, 1, 0]));
  const target = inspectIssue(captureInspectionSource(scene), item("degenerate")).targets[0];
  expect(target.positions.length).toBe(0);
  expect(
    [...target.bounds.min.toArray(), ...target.bounds.max.toArray()].every(Number.isFinite)
  ).toBe(true);
  expect(target.details).toContain("Non-finite vertices cannot be highlighted.");
});
