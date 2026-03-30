import type { TextureInfo, AssetInfo } from "../types/asset";
import { findTexturesInFileList } from "../lib/textureRules";
import { scanAssetDirectory, type ScanResult } from "../hooks/useTauriCommand";
import type { LoadedModel } from "./ModelLoader";

const FORMAT_MAP: Record<string, AssetInfo["format"]> = {
  fbx: "fbx",
  glb: "glb",
  gltf: "gltf",
  obj: "obj",
};

export async function buildAssetInfo(filePath: string, model: LoadedModel): Promise<AssetInfo> {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  let textures: TextureInfo[] = [];
  let fileSize = 0;

  try {
    const scanResult: ScanResult = await scanAssetDirectory(filePath);

    fileSize = scanResult.model_file_size;

    textures = findTexturesInFileList(scanResult.textures.map((t) => t.file_path));

    textures = textures.map((tex) => {
      const scanned = scanResult.textures.find((s) => s.file_path === tex.filePath);
      return {
        ...tex,
        filePath: scanned?.file_path ?? tex.filePath,
      };
    });
  } catch (err) {
    console.warn("Directory scan failed, continuing without textures:", err);
  }

  // Only check for missing external textures if:
  // - The model has no embedded textures (e.g. OBJ with separate files)
  // - AND there are some external texture files found (implies the user intended separate textures)
  const foundTypes = new Set(textures.map((t) => t.type));
  const expectedTypes = ["basecolor", "normal", "roughness"] as const;
  const shouldCheckMissing = !model.hasEmbeddedTextures && textures.length > 0;
  const missingTextures = shouldCheckMissing ? expectedTypes.filter((t) => !foundTypes.has(t)) : [];

  return {
    fileName,
    filePath,
    fileSize,
    format: FORMAT_MAP[ext] ?? "glb",
    polyCount: model.polyCount,
    vertexCount: model.vertexCount,
    meshCount: model.meshCount,
    textures,
    missingTextures,
  };
}
