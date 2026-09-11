import type { AssetInfo, ValidationResult } from "../types/asset";
import type { LoadedModel } from "../components/ModelLoader";
import { buildAssetInfo } from "../components/TextureMatcher";
import { validateAsset } from "../hooks/useAssetValidation";

export function validateLoadedAsset(info: AssetInfo, model: LoadedModel): ValidationResult {
  return validateAsset({
    polyCount: info.polyCount,
    vertexCount: info.vertexCount,
    meshCount: info.meshCount,
    fileSize: info.fileSize,
    textureCount: model.textureInspection.count,
    failedResourceCount: model.textureInspection.failedResources.length,
    maxTextureRes: model.textureInspection.maxResolution,
    textureReferencesVerified: model.textureInspection.referencesVerified,
    unknownTextureResolutions: model.textureInspection.unknownResolutions,
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
