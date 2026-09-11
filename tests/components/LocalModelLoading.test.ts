import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { loadModel } from "../../src/components/ModelLoader";
import { LOCAL_RESOURCE_BASE, localResourceResolver } from "../../src/lib/modelResources";
import { disposeScene } from "../../src/lib/disposeScene";
import { convertFileSrc } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each(["asset://localhost/", "http://asset.localhost/"])(
  "loads glTF buffers and textures through native whole-path encoding (%s)",
  async (origin) => {
    const path = "/Users/artist/한글 #/chair.gltf";
    const convert = (value: string) => origin + encodeURIComponent(value);
    vi.mocked(convertFileSrc).mockImplementation(convert);
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const json = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      buffers: [{ uri: "chair.bin", byteLength: positions.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
      images: [{ uri: "../textures/wood%20%23.png" }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4, height: 4, close: vi.fn() }))
    );
    const fetcher = vi.fn(async (input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === convert(path)) return new Response(JSON.stringify(json));
      if (url === convert("/Users/artist/한글 #/chair.bin")) return new Response(positions.buffer);
      if (url === convert("/Users/artist/textures/wood #.png"))
        return new Response(new Uint8Array([1]));
      throw new Error(`Unexpected resource: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const loaded = await loadModel(path);
    expect(loaded.polyCount).toBe(1);
    expect(loaded.textureInspection.maxResolution).toBe(4);
    expect(loaded.textureInspection.failedResources).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    disposeScene(loaded.scene);
  }
);

it("resolves Windows paths, encoded URI characters and parent folders, preserving remote/embedded URLs", () => {
  const convert = vi.fn((path: string) => path);
  const resolve = localResourceResolver("C:\\Assets\\한글 #\\chair.gltf", convert);
  expect(resolve(LOCAL_RESOURCE_BASE + "../textures/wood%20%23.png")).toBe(
    "C:/Assets/textures/wood #.png"
  );
  expect(resolve(LOCAL_RESOURCE_BASE + "tex%2520.png")).toBe("C:/Assets/한글 #/tex%20.png");
  for (const url of [
    "https://cdn.test/a.png",
    "data:image/png;base64,abc",
    "blob:http://test/123",
  ]) {
    expect(resolve(url)).toBe(url);
  }
  const fbx = localResourceResolver("C:\\Assets\\chair.fbx", convert, false);
  expect(fbx(LOCAL_RESOURCE_BASE + "textures\\wood%20.png")).toBe("C:/Assets/textures/wood%20.png");
});

it("resolves the relative dependency URL produced by Three's loader utilities", () => {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(
    localResourceResolver(
      "/models/chair.gltf",
      (path) => `asset://localhost/${encodeURIComponent(path)}`
    )
  );
  expect(manager.resolveURL(THREE.LoaderUtils.resolveURL("chair.bin", LOCAL_RESOURCE_BASE))).toBe(
    "asset://localhost/%2Fmodels%2Fchair.bin"
  );
});
