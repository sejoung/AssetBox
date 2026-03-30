import { useMemo } from "react";
import type {
  ValidationResult,
  ValidationItem,
  ValidationSeverity,
  ValidationCategory,
  ValidationGroup,
} from "../types/asset";
import type { MeshDiagnostics } from "../components/ModelLoader";

export interface ValidationInput {
  polyCount: number;
  vertexCount: number;
  meshCount: number;
  fileSize: number;
  textureCount: number;
  missingTextureCount: number;
  maxTextureRes: number;
  diagnostics: MeshDiagnostics;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function worst(...severities: ValidationSeverity[]): ValidationSeverity {
  if (severities.includes("bad")) return "bad";
  if (severities.includes("warning")) return "warning";
  return "good";
}

function item(
  category: ValidationCategory,
  label: string,
  value: string,
  severity: ValidationSeverity,
  threshold?: string
): ValidationItem {
  return { category, label, value, severity, threshold };
}

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  geometry: "Geometry",
  topology: "Topology",
  uv: "UV",
  texture: "Texture",
  material: "Material",
  transform: "Scale / Transform",
};

const CATEGORY_ORDER: ValidationCategory[] = [
  "geometry",
  "topology",
  "uv",
  "texture",
  "material",
  "transform",
];

export function validateAsset(input: ValidationInput): ValidationResult {
  const items: ValidationItem[] = [];
  const d = input.diagnostics;

  // ── Geometry ──
  const polySev: ValidationSeverity =
    input.polyCount > 500_000 ? "bad" : input.polyCount > 100_000 ? "warning" : "good";
  items.push(
    item("geometry", "Tris", formatNumber(input.polyCount), polySev, "< 100K good · < 500K warning")
  );

  const vertSev: ValidationSeverity =
    input.vertexCount > 300_000 ? "bad" : input.vertexCount > 100_000 ? "warning" : "good";
  items.push(
    item(
      "geometry",
      "Verts",
      formatNumber(input.vertexCount),
      vertSev,
      "< 100K good · < 300K warning"
    )
  );

  const meshSev: ValidationSeverity =
    input.meshCount > 100 ? "bad" : input.meshCount > 50 ? "warning" : "good";
  items.push(
    item("geometry", "Meshes", input.meshCount.toString(), meshSev, "< 50 good · < 100 warning")
  );

  items.push(
    item(
      "geometry",
      "File Size",
      formatFileSize(input.fileSize),
      input.fileSize > 100 * 1024 * 1024
        ? "bad"
        : input.fileSize > 50 * 1024 * 1024
          ? "warning"
          : "good",
      "< 50MB good · < 100MB warning"
    )
  );

  if (d.degenerateTriCount > 0) {
    const pct = input.polyCount > 0 ? d.degenerateTriCount / input.polyCount : 0;
    items.push(
      item(
        "geometry",
        "Degenerate Tris",
        formatNumber(d.degenerateTriCount),
        pct > 0.05 ? "bad" : pct > 0.01 ? "warning" : "good",
        "< 1% good · < 5% warning"
      )
    );
  }

  const bb = d.boundingBox;
  items.push(item("geometry", "Dimensions", `${bb.x} × ${bb.y} × ${bb.z}`, "good"));

  // ── Topology ──
  if (d.nonManifoldEdgeCount > 0) {
    items.push(
      item(
        "topology",
        "Non-manifold",
        `${d.nonManifoldEdgeCount} edges`,
        d.nonManifoldEdgeCount > 50 ? "bad" : "warning",
        "Edges shared by 3+ faces"
      )
    );
  } else {
    items.push(item("topology", "Non-manifold", "Clean", "good"));
  }

  if (d.openEdgeCount > 0) {
    items.push(
      item(
        "topology",
        "Open Edges",
        `${d.openEdgeCount}`,
        d.openEdgeCount > 100 ? "bad" : "warning",
        "Boundary edges — mesh is not watertight"
      )
    );
  } else {
    items.push(item("topology", "Open Edges", "Watertight", "good"));
  }

  if (d.flippedNormalTriCount > 0) {
    const pct = input.polyCount > 0 ? d.flippedNormalTriCount / input.polyCount : 0;
    items.push(
      item(
        "topology",
        "Flipped Normals",
        formatNumber(d.flippedNormalTriCount),
        pct > 0.1 ? "bad" : "warning",
        "Normals pointing inward"
      )
    );
  } else {
    items.push(item("topology", "Flipped Normals", "None", "good"));
  }

  // ── UV ──
  if (d.meshesWithoutUV > 0) {
    items.push(
      item(
        "uv",
        "No UVs",
        `${d.meshesWithoutUV} / ${input.meshCount} meshes`,
        d.meshesWithoutUV === input.meshCount ? "bad" : "warning",
        "All meshes should have UV coordinates"
      )
    );
  } else {
    items.push(item("uv", "UV Coverage", "All meshes", "good"));
  }

  const maxChannels = d.uvChannelCounts.length > 0 ? Math.max(...d.uvChannelCounts) : 0;
  items.push(item("uv", "UV Channels", `${maxChannels}`, maxChannels > 0 ? "good" : "warning"));

  // ── Texture ──
  items.push(item("texture", "Textures", input.textureCount.toString(), "good"));

  if (input.missingTextureCount > 0) {
    items.push(
      item(
        "texture",
        "Missing",
        input.missingTextureCount.toString(),
        input.missingTextureCount > 2 ? "bad" : "warning",
        "0 good · 1-2 warning · 3+ bad"
      )
    );
  }

  items.push(
    item(
      "texture",
      "Max Resolution",
      `${input.maxTextureRes}px`,
      input.maxTextureRes > 8192 ? "bad" : input.maxTextureRes > 4096 ? "warning" : "good",
      "< 4096 good · < 8192 warning"
    )
  );

  // ── Material ──
  items.push(item("material", "Materials", d.materialCount.toString(), "good"));

  if (d.meshesWithoutMaterial > 0) {
    items.push(
      item(
        "material",
        "No Material",
        `${d.meshesWithoutMaterial} meshes`,
        d.meshesWithoutMaterial === input.meshCount ? "bad" : "warning",
        "Meshes without assigned material"
      )
    );
  }

  // ── Transform ──
  if (d.nonUniformScaleCount > 0) {
    items.push(
      item(
        "transform",
        "Non-uniform Scale",
        `${d.nonUniformScaleCount} objects`,
        "warning",
        "Scale X/Y/Z should be equal"
      )
    );
  } else {
    items.push(item("transform", "Scale", "Uniform", "good"));
  }

  if (d.offCenterDistance > 1) {
    items.push(
      item(
        "transform",
        "Pivot Offset",
        `${d.offCenterDistance}`,
        d.offCenterDistance > 10 ? "warning" : "good",
        "Distance from origin — may cause issues on import"
      )
    );
  } else {
    items.push(item("transform", "Pivot", "Centered", "good"));
  }

  // ── Group by category ──
  const groups: ValidationGroup[] = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0);

  const overall = worst(...items.map((i) => i.severity));

  return { overall, items, groups };
}

export function useAssetValidation(input: ValidationInput | null): ValidationResult | null {
  return useMemo(() => {
    if (!input) return null;
    return validateAsset(input);
  }, [input]);
}
