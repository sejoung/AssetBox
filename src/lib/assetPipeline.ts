import type { AssetInfo, ValidationResult } from "../types/asset";
import type { LoadedModel } from "../components/ModelLoader";
import { buildAssetInfo } from "../components/TextureMatcher";
import { validateAsset } from "../hooks/useAssetValidation";

/** Texture resolution is not read back from the GPU yet; validation assumes 2K. */
export const DEFAULT_MAX_TEXTURE_RES = 2048;

export function validateLoadedAsset(info: AssetInfo, model: LoadedModel): ValidationResult {
  return validateAsset({
    polyCount: info.polyCount,
    vertexCount: info.vertexCount,
    meshCount: info.meshCount,
    fileSize: info.fileSize,
    textureCount: info.textures.length,
    missingTextureCount: info.missingTextures.length,
    maxTextureRes: DEFAULT_MAX_TEXTURE_RES,
    diagnostics: model.diagnostics,
  });
}

export interface Inspection {
  info: AssetInfo;
  validation: ValidationResult;
}

/**
 * Scan siblings for textures, then grade the model. Shared by the interactive
 * viewer and by batch validation so both produce identical verdicts.
 */
export async function inspectModel(filePath: string, model: LoadedModel): Promise<Inspection> {
  const info = await buildAssetInfo(filePath, model);
  return { info, validation: validateLoadedAsset(info, model) };
}
