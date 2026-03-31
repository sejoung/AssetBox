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
  fileSize: number;
  format: "fbx" | "glb" | "gltf" | "obj";
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  textures: TextureInfo[];
  missingTextures: TextureType[];
  retopoDiag?: RetopoDiagInfo;
}

export type ValidationSeverity = "good" | "warning" | "bad";

export type ValidationCategory =
  | "geometry"
  | "topology"
  | "uv"
  | "texture"
  | "material"
  | "transform";

export interface ValidationItem {
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
