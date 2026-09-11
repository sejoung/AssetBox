import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  analyzeEdges,
  analyzeNormalConsistency,
  countDegenerateTriangles,
  uvChannels,
} from "../../src/lib/geometryDiagnostics";
import { analyzeModel } from "../../src/components/ModelLoader";

function geometry(positions: number[]) {
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
}

describe("geometric adjacency", () => {
  it("recognizes a closed box across hard-normal/UV seams in both storage formats", () => {
    const indexed = new THREE.BoxGeometry();
    for (const box of [indexed, indexed.toNonIndexed()]) {
      expect(analyzeEdges(box)).toEqual({ nonManifold: 0, openEdges: 0 });
      expect(box.attributes.position.count).toBe(box.index ? 24 : 36);
    }
  });
  it("counts a plane's four boundary edges rather than its internal diagonal", () => {
    expect(analyzeEdges(new THREE.PlaneGeometry().toNonIndexed())).toEqual({
      nonManifold: 0,
      openEdges: 4,
    });
  });
  it("detects an edge shared by three faces", () => {
    expect(
      analyzeEdges(
        geometry([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
      ).nonManifold
    ).toBe(1);
  });
  it("preserves small intentional gaps instead of welding by a tolerance", () => {
    const mesh = geometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.00000001, 1, 0, 0.00000001, 0, -1, 0,
    ]);
    expect(analyzeEdges(mesh).openEdges).toBe(6);
  });
  it("does not count zero-area triangles as extra boundary edges", () => {
    expect(analyzeEdges(geometry([0, 0, 0, 1, 0, 0, 2, 0, 0]))).toEqual({
      nonManifold: 0,
      openEdges: 0,
    });
  });
});

describe("normal consistency and scale", () => {
  it.each([1, 1e-6, 1e6])("does not reject well-shaped triangles at scale %s", (scale) => {
    const triangle = geometry([0, 0, 0, scale, 0, 0, 0, scale, 0]);
    triangle.computeVertexNormals();
    expect(countDegenerateTriangles(triangle)).toBe(0);
    expect(analyzeNormalConsistency(triangle).mismatches).toBe(0);
    triangle.attributes.normal.setXYZ(0, 0, 0, -1);
    triangle.attributes.normal.setXYZ(1, 0, 0, -1);
    triangle.attributes.normal.setXYZ(2, 0, 0, -1);
    const result = analyzeNormalConsistency(triangle);
    expect(result.mismatches).toBe(1);
    expect([...result.vertices]).toEqual([0, 1, 2]);
  });
  it("does not claim that consistent inward winding is a normal mismatch", () => {
    const box = new THREE.BoxGeometry();
    const index = box.index!;
    for (let i = 0; i < index.count; i += 3) {
      const first = index.getX(i);
      index.setX(i, index.getX(i + 1));
      index.setX(i + 1, first);
    }
    box.computeVertexNormals();
    expect(analyzeNormalConsistency(box).mismatches).toBe(0);
  });
  it("records unavailable normals as unchecked", () => {
    const result = analyzeNormalConsistency(geometry([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    expect(result.unchecked).toBe(1);
    expect(result.mismatches).toBe(0);
  });
});

describe("UV material bindings", () => {
  it("recognizes current Three.js uv1 and uv2 channel attributes", () => {
    const mesh = new THREE.PlaneGeometry();
    mesh.setAttribute("uv1", mesh.attributes.uv.clone());
    mesh.setAttribute("uv2", mesh.attributes.uv.clone());
    expect(uvChannels(mesh)).toEqual([0, 1, 2]);
  });
  it("requires the particular UV channel referenced by a loaded texture", () => {
    const group = new THREE.Group();
    const mesh = new THREE.PlaneGeometry();
    const map = new THREE.Texture();
    map.channel = 1;
    group.add(new THREE.Mesh(mesh, new THREE.MeshStandardMaterial({ map })));
    expect(analyzeModel(group).diagnostics.meshesMissingRequiredUV).toBe(1);
    mesh.setAttribute("uv1", mesh.attributes.uv.clone());
    expect(analyzeModel(group).diagnostics.meshesMissingRequiredUV).toBe(0);
    mesh.deleteAttribute("uv");
    mesh.deleteAttribute("uv1");
    map.mapping = THREE.EquirectangularReflectionMapping;
    expect(analyzeModel(group).diagnostics.meshesMissingRequiredUV).toBe(0);
  });
});

it("does not require UVs from unused material slots", () => {
  const geometry = new THREE.PlaneGeometry();
  geometry.clearGroups();
  geometry.addGroup(0, 6, 0);
  const map = new THREE.Texture();
  map.channel = 2;
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(geometry, [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial({ map }),
    ])
  );
  const analysis = analyzeModel(group);
  expect(analysis.diagnostics.meshesMissingRequiredUV).toBe(0);
  expect(analysis.textureInspection.count).toBe(0);
});
