import type { TextureInfo, AssetInfo } from "../types/asset";
import { findTexturesInFileList } from "../lib/textureRules";
import { scanAssetDirectory, type ScanResult } from "../hooks/useTauriCommand";
import type { LoadedModel } from "./ModelLoader";
import * as log from "../lib/logger";

const FORMAT_MAP: Record<string, AssetInfo["format"]> = {
  fbx: "fbx",
  glb: "glb",
  gltf: "gltf",
  obj: "obj",
};

export async function buildAssetInfo(filePath: string, model: LoadedModel): Promise<AssetInfo> {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  let textures: TextureInfo[] = [];
  let fileSize: number | null = null;

  try {
    const scanResult: ScanResult = await scanAssetDirectory(filePath);

    fileSize = scanResult.model_file_size > 0 ? scanResult.model_file_size : null;

    textures = findTexturesInFileList(scanResult.textures.map((t) => t.file_path));

    textures = textures.map((tex) => {
      const scanned = scanResult.textures.find((s) => s.file_path === tex.filePath);
      return {
        ...tex,
        filePath: scanned?.file_path ?? tex.filePath,
      };
    });
  } catch (err) {
    log.warn("Directory scan failed, continuing without textures:", err);
  }

  // Nearby filenames are discovery hints, not evidence of a material dependency.
  const missingTextures = model.textureInspection.failedResources;

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
    retopoDiag: model.retopoDiag,
  };
}
