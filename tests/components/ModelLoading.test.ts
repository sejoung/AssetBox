import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { loadModel } from "../../src/components/ModelLoader";

const fixture = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("three/examples/jsm/loaders/FBXLoader.js", () => ({
  FBXLoader: class {
    constructor(private manager: THREE.LoadingManager) {}
    load(
      url: string,
      onLoad: (scene: THREE.Group) => void,
      _progress: unknown,
      onError: (error: Error) => void
    ) {
      fixture.load(this.manager, url, onLoad, onError);
    }
  },
}));

describe("loader completion", () => {
  it("waits for dependent images before measuring and preserves nonfatal failures", async () => {
    let finishImages!: () => void;
    fixture.load.mockImplementation(
      (manager: THREE.LoadingManager, url: string, onLoad: (scene: THREE.Group) => void) => {
        const map = new THREE.Texture();
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map })));
        manager.itemStart(url);
        manager.itemStart("albedo.png");
        manager.itemStart("missing_normal.png");
        onLoad(scene);
        manager.itemEnd(url);
        finishImages = () => {
          map.image = { width: 4096, height: 2048 };
          manager.itemEnd("albedo.png");
          manager.itemError("missing_normal.png");
          manager.itemEnd("missing_normal.png");
        };
      }
    );
    let resolved = false;
    const pending = loadModel("http://fixture/hero.fbx").then((model) => {
      resolved = true;
      return model;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    finishImages();
    expect((await pending).textureInspection).toMatchObject({
      maxResolution: 4096,
      failedResources: ["missing_normal.png"],
    });
  });
  it("rejects a model-load failure without waiting forever for resources", async () => {
    fixture.load.mockImplementation(
      (_manager: unknown, _url: unknown, _onLoad: unknown, onError: (error: Error) => void) =>
        onError(new Error("Cannot load model"))
    );
    await expect(loadModel("http://fixture/broken.fbx")).rejects.toThrow("Cannot load model");
  });
});
