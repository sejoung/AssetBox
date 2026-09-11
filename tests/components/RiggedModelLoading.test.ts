import { afterEach, expect, it, vi } from "vitest";
import { loadModel } from "../../src/components/ModelLoader";
import { riggedGltf } from "../fixtures/riggedGltf";
import { disposeScene } from "../../src/lib/disposeScene";
afterEach(() => vi.unstubAllGlobals());
it("preserves actual glTF skin and animation metadata through the loader", async () => {
  const fetcher = globalThis.fetch;
  vi.stubGlobal("fetch", (input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    return url === "http://fixture/rigged.gltf"
      ? Promise.resolve(new Response(riggedGltf()))
      : fetcher(input);
  });
  const loaded = await loadModel("http://fixture/rigged.gltf");
  expect(loaded.rigging.bones.map((bone) => bone.name)).toEqual(["Hips", "Spine"]);
  expect(loaded.rigging.skeletonCount).toBe(1);
  expect(loaded.rigging.skins[0]).toMatchObject({
    name: "Body",
    vertexCount: 24,
    maxInfluences: 1,
    unweightedVertices: 0,
  });
  expect(loaded.rigging.clips).toMatchObject([{ name: "Idle", duration: 1.5, trackCount: 1 }]);
  disposeScene(loaded.scene);
});
