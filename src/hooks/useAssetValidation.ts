import { useMemo } from "react";
import { formatFileSize } from "../lib/fileTree";
import type {
  ValidationResult,
  ValidationItem,
  ValidationSeverity,
  ValidationCategory,
  ValidationGroup,
  InspectionKind,
} from "../types/asset";
import type { MeshDiagnostics } from "../components/ModelLoader";
import { worstSeverity } from "../lib/validationStatus";

export interface ValidationInput {
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  fileSize: number | null;
  textureCount: number;
  failedResourceCount: number;
  maxTextureRes: number | null;
  textureReferencesVerified: boolean;
  unknownTextureResolutions: number;
  diagnostics: MeshDiagnostics;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  geometry: "Geometry",
  topology: "Topology",
  uv: "UV",
  texture: "Texture",
  material: "Material",
  transform: "Scale / Transform",
};

export function validateAsset(input: ValidationInput): ValidationResult {
  const items: ValidationItem[] = [];
  const d = input.diagnostics;
  const add = (
    category: ValidationCategory,
    label: string,
    value: string,
    severity: ValidationSeverity,
    threshold?: string,
    inspection?: InspectionKind
  ) => {
    items.push({
      category,
      label,
      value,
      severity,
      threshold,
      ...(inspection ? { inspection } : {}),
    });
  };
  // These are reference budgets, not proof that an asset is defective.
  add(
    "geometry",
    "Tris",
    formatNumber(input.polyCount),
    input.polyCount > 100_000 ? "warning" : "good",
    "Reference budget: ≤ 100K triangles. Consider LODs or simplification only if the target budget requires it."
  );
  add(
    "geometry",
    "Verts",
    formatNumber(input.vertexCount),
    input.vertexCount > 100_000 ? "warning" : "good",
    "Reference budget: ≤ 100K render vertices. UV and normal seams can increase this count."
  );
  add(
    "geometry",
    "Meshes",
    String(input.meshCount),
    input.meshCount === 0 ? "unknown" : input.meshCount > 50 ? "warning" : "good",
    input.meshCount === 0
      ? "No meshes were available for inspection."
      : "Reference budget: ≤ 50 meshes. Review scene structure against the target renderer."
  );
  add(
    "geometry",
    "File Size",
    input.fileSize === null ? "Unknown" : formatFileSize(input.fileSize),
    input.fileSize === null ? "unknown" : input.fileSize > 50 * 1024 * 1024 ? "warning" : "good",
    input.fileSize === null
      ? "File metadata could not be read. Reopen the folder and inspect again."
      : "Reference budget: ≤ 50 MiB. Check loading time and storage requirements before reducing data."
  );
  if (d.degenerateTriCount > 0) {
    const ratio = input.polyCount > 0 ? d.degenerateTriCount / input.polyCount : 0;
    add(
      "geometry",
      "Degenerate Tris",
      formatNumber(d.degenerateTriCount),
      ratio > 0.05 ? "bad" : "warning",
      "Zero-area or numerically collapsed triangles. Inspect and remove unintended degenerate faces; > 5% needs attention.",
      "degenerate"
    );
  }
  const bb = d.boundingBox;
  add("geometry", "Dimensions", `${bb.x} × ${bb.y} × ${bb.z}`, "good");

  const edgeNote =
    "Exact coincident positions are joined within each mesh for this check; this does not prove a closed volume.";
  add(
    "topology",
    "Non-manifold",
    d.nonManifoldEdgeCount ? `${d.nonManifoldEdgeCount} edges` : "None detected",
    d.nonManifoldEdgeCount ? "warning" : "good",
    `Edges shared by 3+ faces. Inspect overlapping/internal faces if unintended. ${edgeNote}`,
    d.nonManifoldEdgeCount > 0 ? "non-manifold" : undefined
  );
  add(
    "topology",
    "Open Edges",
    d.openEdgeCount ? String(d.openEdgeCount) : "None detected",
    d.openEdgeCount ? "warning" : "good",
    `Boundary edges may be intentional on open surfaces. Close only unintended gaps. ${edgeNote}`,
    d.openEdgeCount > 0 ? "open-edges" : undefined
  );
  add(
    "topology",
    "Normal Consistency",
    d.normalMismatchTriCount
      ? `${formatNumber(d.normalMismatchTriCount)} mismatched tris`
      : d.uncheckedNormalTriCount > 0
        ? "Incomplete"
        : "No mismatches",
    d.normalMismatchTriCount ? "warning" : d.uncheckedNormalTriCount > 0 ? "unknown" : "good",
    "Compares triangle winding with vertex normals, not inside/outside. Inspect marked vertices in Normals view before recalculating normals.",
    d.normalMismatchTriCount > 0 ? "normal-mismatch" : undefined
  );
  if (d.uncheckedNormalTriCount > 0)
    add(
      "topology",
      "Unchecked Normals",
      `${d.uncheckedNormalTriCount} tris`,
      "unknown",
      "Missing/invalid normals or degenerate faces prevent this check. Inspect in the source editor.",
      "unchecked-normals"
    );

  if (d.meshesMissingRequiredUV > 0)
    add(
      "uv",
      "Missing Required UVs",
      `${d.meshesMissingRequiredUV} meshes`,
      "bad",
      "A loaded material texture references a UV channel absent from its mesh. Add/export that channel or correct the material binding.",
      "required-uv"
    );
  if (d.meshesWithoutUV > 0)
    add(
      "uv",
      "No UVs",
      `${d.meshesWithoutUV} / ${input.meshCount} meshes`,
      "warning",
      "UVs are needed for UV-mapped textures, but may be unnecessary for constant-color or generated-coordinate materials. Unwrap only when needed.",
      "missing-uv"
    );
  else add("uv", "UV Coverage", "All meshes", "good");
  const maxChannels = d.uvChannelCounts.length ? Math.max(...d.uvChannelCounts) : 0;
  add(
    "uv",
    "UV Channels",
    String(maxChannels),
    "good",
    "Counts available uv, uv1, uv2… attributes; this does not verify unwrap quality."
  );

  add(
    "texture",
    "Bound Textures",
    input.textureReferencesVerified ? String(input.textureCount) : "Unknown",
    input.textureReferencesVerified ? "good" : "unknown",
    "Counts unique textures bound to the loaded scene. OBJ material-library references are not resolved by this loader.",
    input.textureCount > 0 ? "textures" : undefined
  );
  if (input.failedResourceCount > 0)
    add(
      "texture",
      "Failed Resources",
      String(input.failedResourceCount),
      "bad",
      "The loader reported failed resource requests. Check the listed paths, access permissions and source material references, then reload.",
      "failed-resources"
    );
  const resolutionComplete =
    input.textureReferencesVerified &&
    input.unknownTextureResolutions === 0 &&
    input.failedResourceCount === 0;
  if (input.maxTextureRes !== null) {
    add(
      "texture",
      "Max Resolution",
      `${input.maxTextureRes}px${resolutionComplete ? "" : " (partial)"}`,
      input.maxTextureRes > 4096 ? "warning" : resolutionComplete ? "good" : "unknown",
      "Measured from loaded texture dimensions. Reference budget: ≤ 4096px; review detail and memory needs before resizing.",
      "texture-resolution"
    );
    if (!resolutionComplete)
      add(
        "texture",
        "Texture Inspection",
        "Incomplete",
        "unknown",
        "Some resource dimensions or material references could not be checked. The displayed maximum covers measured textures only."
      );
  } else {
    const unused = resolutionComplete && input.textureCount === 0;
    add(
      "texture",
      "Max Resolution",
      unused ? "Not used" : "Unknown",
      unused ? "good" : "unknown",
      unused
        ? "No texture maps are bound to the loaded materials."
        : "Texture dimensions are unavailable. No assumed resolution is used; inspect source textures and reload."
    );
  }

  add(
    "material",
    "Materials",
    String(d.materialCount),
    "good",
    "Materials present in the loaded scene; loaders may provide defaults."
  );
  if (d.meshesWithoutMaterial > 0)
    add(
      "material",
      "No Material",
      `${d.meshesWithoutMaterial} meshes`,
      "warning",
      "Review whether a material is required for the intended appearance, then assign/export it if needed.",
      "no-material"
    );
  if (!input.textureReferencesVerified)
    add(
      "material",
      "Source Materials",
      "Not checked",
      "unknown",
      "OBJLoader does not read MTL files. Default viewer materials do not confirm the source material setup."
    );
  add(
    "transform",
    d.nonUniformScaleCount > 0 ? "Non-uniform Scale" : "Scale",
    d.nonUniformScaleCount > 0 ? `${d.nonUniformScaleCount} objects` : "Uniform",
    d.nonUniformScaleCount > 0 ? "warning" : "good",
    "Non-uniform scale can be intentional. Check the target pipeline before applying transforms, especially on rigged models.",
    d.nonUniformScaleCount > 0 ? "non-uniform-scale" : undefined
  );
  add(
    "transform",
    "Center Offset",
    String(d.offCenterDistance),
    d.offCenterDistance > 10 ? "warning" : "good",
    "Bounding-box center distance from the scene origin in model units; not a pivot correctness test. Review placement only if unintended."
  );

  const groups: ValidationGroup[] = (Object.keys(CATEGORY_LABELS) as ValidationCategory[]).map(
    (category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: items.filter((item) => item.category === category),
    })
  );
  return { overall: worstSeverity(items.map((item) => item.severity)), items, groups };
}

export function useAssetValidation(input: ValidationInput | null): ValidationResult | null {
  return useMemo(() => (input ? validateAsset(input) : null), [input]);
}
