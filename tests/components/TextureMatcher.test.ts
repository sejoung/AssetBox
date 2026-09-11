import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildAssetInfo } from "../../src/components/TextureMatcher";
import { analyzeModel } from "../../src/components/ModelLoader";
import { scanAssetDirectory } from "../../src/hooks/useTauriCommand";
import { validateLoadedAsset } from "../../src/lib/assetPipeline";

vi.mock("../../src/hooks/useTauriCommand", () => ({ scanAssetDirectory: vi.fn() }));
function model(verified = true, failures: string[] = []) {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  return { scene, ...analyzeModel(scene, verified, failures) };
}

describe("asset texture evidence", () => {
  it("does not infer required normal/roughness maps from a nearby basecolor filename", async () => {
    vi.mocked(scanAssetDirectory).mockResolvedValue({
      model_path: "/hero.glb",
      model_file_size: 1024,
      directory: "/",
      sibling_files: [],
      textures: [
        { file_name: "other_basecolor.png", file_path: "/other_basecolor.png", file_size: 100 },
      ],
    });
    const loaded = model();
    const info = await buildAssetInfo("/hero.glb", loaded);
    expect(info.missingTextures).toEqual([]);
    expect(info.textures).toHaveLength(1);
    const validation = validateLoadedAsset(info, loaded);
    expect(validation.items.find((item) => item.label === "Bound Textures")?.value).toBe("0");
    expect(validation.items.find((item) => item.label === "Max Resolution")?.value).toBe(
      "Not used"
    );
  });
  it("preserves resource failures even if no nearby texture files were discovered", async () => {
    vi.mocked(scanAssetDirectory).mockRejectedValue(new Error("Permission denied"));
    const loaded = model(true, ["/missing.png"]);
    const info = await buildAssetInfo("/hero.glb", loaded);
    expect(info.fileSize).toBeNull();
    expect(info.missingTextures).toEqual(["/missing.png"]);
    expect(validateLoadedAsset(info, loaded).overall).toBe("bad");
  });
});
