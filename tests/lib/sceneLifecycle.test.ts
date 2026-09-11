import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { applyRetopoOverlay } from "../../src/lib/retopoOverlay";
import { disposeScene, retainSceneResources } from "../../src/lib/disposeScene";

it.each([true, false])(
  "restores shared geometry and source colors after repeated Retopo views (colors=%s)",
  (colored) => {
    const geometry = new THREE.BoxGeometry();
    const color = new THREE.Float32BufferAttribute(new Float32Array(24 * 3).fill(0.25), 3);
    if (colored) geometry.setAttribute("color", color);
    const material = new THREE.MeshStandardMaterial({ vertexColors: colored });
    const a = new THREE.Mesh(geometry, material),
      b = new THREE.Mesh(geometry, material);
    const scene = new THREE.Group().add(a, b);
    for (let index = 0; index < 3; index++) {
      const restore = applyRetopoOverlay(scene)!;
      expect(a.geometry).not.toBe(geometry);
      expect(geometry.getAttribute("color")).toBe(colored ? color : undefined);
      const disposed = vi.fn();
      a.geometry.addEventListener("dispose", disposed);
      restore();
      expect(disposed).toHaveBeenCalledOnce();
      expect(a.geometry).toBe(geometry);
      expect(b.geometry).toBe(geometry);
      expect(a.material).toBe(material);
      expect(geometry.getAttribute("color")).toBe(colored ? color : undefined);
      expect(Array.from(color.array)).toEqual(new Array(72).fill(0.25));
    }
    disposeScene(scene);
  }
);

it("releases original shared GPU resources exactly once while a diagnostic overlay is active", () => {
  const geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture });
  const scene = new THREE.Group().add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material)
  );
  const geoDispose = vi.fn(),
    matDispose = vi.fn(),
    texDispose = vi.fn();
  geometry.addEventListener("dispose", geoDispose);
  material.addEventListener("dispose", matDispose);
  texture.addEventListener("dispose", texDispose);
  retainSceneResources(scene);
  const restore = applyRetopoOverlay(scene)!;
  disposeScene(scene);
  restore();
  disposeScene(scene);
  expect(geoDispose).toHaveBeenCalledOnce();
  expect(matDispose).toHaveBeenCalledOnce();
  expect(texDispose).toHaveBeenCalledOnce();
});
