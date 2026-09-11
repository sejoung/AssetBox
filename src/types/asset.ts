export interface TextureInfo {
  type: TextureType;
  fileName: string;
  filePath: string;
  resolution: { width: number; height: number } | null;
}

export type TextureType =
  | "basecolor"
  | "normal"
  | "roughness"
  | "metallic"
  | "ao"
  | "emissive"
  | "height"
  | "opacity"
  | "unknown";

export interface RetopoDiagInfo {
  totalTris: number;
  avgArea: number;
  minArea: number;
  maxArea: number;
  densityRatio: number;
  thinTriPercent: number;
  overDensePercent: number;
  underDensePercent: number;
  needsRetopo: boolean;
  reasons: string[];
}

export interface AssetInfo {
  fileName: string;
  filePath: string;
  fileSize: number | null;
  format: "fbx" | "glb" | "gltf" | "obj";
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  textures: TextureInfo[];
  /** Resource URLs reported as failed by the model loader; not filename guesses. */
  missingTextures: string[];
  retopoDiag?: RetopoDiagInfo;
}

export type ValidationSeverity = "good" | "warning" | "bad" | "unknown";

export type ValidationCategory =
  | "geometry"
  | "topology"
  | "uv"
  | "texture"
  | "material"
  | "transform";

export type InspectionKind =
  | "degenerate"
  | "open-edges"
  | "non-manifold"
  | "normal-mismatch"
  | "unchecked-normals"
  | "missing-uv"
  | "required-uv"
  | "no-material"
  | "non-uniform-scale"
  | "textures"
  | "texture-resolution"
  | "failed-resources";

export interface ValidationItem {
  inspection?: InspectionKind;
  label: string;
  value: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  threshold?: string;
}

export interface ValidationGroup {
  category: ValidationCategory;
  label: string;
  items: ValidationItem[];
}

export interface ValidationResult {
  overall: ValidationSeverity;
  items: ValidationItem[];
  groups: ValidationGroup[];
}
