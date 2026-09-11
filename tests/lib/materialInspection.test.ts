import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { inspectTextures } from "../../src/lib/materialInspection";

function scene(...materials: THREE.Material[]) {
  const group = new THREE.Group();
  for (const material of materials) group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return group;
}

describe("loaded texture measurements", () => {
  it("measures real dimensions and counts shared textures once", () => {
    const map = new THREE.Texture({ width: 8192, height: 4096 });
    const normalMap = new THREE.Texture({ width: 512, height: 512 });
    const result = inspectTextures(
      scene(
        new THREE.MeshStandardMaterial({ map, normalMap }),
        new THREE.MeshStandardMaterial({ map })
      ),
      true
    );
    expect(result).toMatchObject({ count: 2, maxResolution: 8192, unknownResolutions: 0 });
  });
  it("keeps unreadable textures separate from the measured maximum", () => {
    const result = inspectTextures(
      scene(
        new THREE.MeshStandardMaterial({
          map: new THREE.Texture({ width: 1024, height: 1024 }),
          normalMap: new THREE.Texture(),
        })
      ),
      true
    );
    expect(result).toMatchObject({ maxResolution: 1024, unknownResolutions: 1 });
  });
  it("returns no assumed maximum when dimensions cannot be read", () => {
    expect(
      inspectTextures(scene(new THREE.MeshStandardMaterial({ map: new THREE.Texture() })), true)
        .maxResolution
    ).toBeNull();
  });
  it("does not equate unresolved OBJ materials with a verified texture-free asset", () => {
    expect(inspectTextures(scene(new THREE.MeshStandardMaterial()), false)).toMatchObject({
      referencesVerified: false,
      count: 0,
      maxResolution: null,
    });
  });
  it("measures all cube faces and reports incomplete faces", () => {
    const envMap = new THREE.CubeTexture([
      { width: 512, height: 512 },
      { width: 1024, height: 1024 },
      null,
    ]);
    expect(inspectTextures(scene(new THREE.MeshStandardMaterial({ envMap })), true)).toMatchObject({
      maxResolution: 1024,
      unknownResolutions: 1,
    });
  });
  it("deduplicates actual resource failures", () => {
    expect(inspectTextures(scene(), true, ["a.png", "a.png"]).failedResources).toEqual(["a.png"]);
  });
});
