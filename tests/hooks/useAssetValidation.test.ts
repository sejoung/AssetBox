import { describe, it, expect } from "vitest";
import { validateAsset, type ValidationInput } from "../../src/hooks/useAssetValidation";

const baseDiagnostics = {
  degenerateTriCount: 0,
  boundingBox: { x: 1, y: 2, z: 1 },
  nonManifoldEdgeCount: 0,
  openEdgeCount: 0,
  flippedNormalTriCount: 0,
  meshesWithoutUV: 0,
  uvChannelCounts: [1],
  materialCount: 1,
  meshesWithoutMaterial: 0,
  nonUniformScaleCount: 0,
  offCenterDistance: 0,
};

const baseInput: ValidationInput = {
  polyCount: 5000,
  vertexCount: 3000,
  meshCount: 3,
  fileSize: 1024 * 1024,
  textureCount: 3,
  missingTextureCount: 0,
  maxTextureRes: 2048,
  diagnostics: baseDiagnostics,
};

function withDiag(overrides: Partial<typeof baseDiagnostics>): ValidationInput {
  return { ...baseInput, diagnostics: { ...baseDiagnostics, ...overrides } };
}

describe("validateAsset", () => {
  // Geometry
  it("returns good for a well-formed asset", () => {
    const result = validateAsset(baseInput);
    expect(result.overall).toBe("good");
  });

  it("groups items by category", () => {
    const result = validateAsset(baseInput);
    expect(result.groups.length).toBeGreaterThanOrEqual(4);
    expect(result.groups.map((g) => g.category)).toContain("geometry");
    expect(result.groups.map((g) => g.category)).toContain("topology");
  });

  it("warning for high poly count", () => {
    const result = validateAsset({ ...baseInput, polyCount: 120_000 });
    const item = result.items.find((i) => i.label === "Tris");
    expect(item?.severity).toBe("warning");
  });

  it("bad for very high poly count", () => {
    const result = validateAsset({ ...baseInput, polyCount: 600_000, vertexCount: 400_000 });
    expect(result.overall).toBe("bad");
  });

  it("bad on very large file size", () => {
    const result = validateAsset({ ...baseInput, fileSize: 200 * 1024 * 1024 });
    const item = result.items.find((i) => i.label === "File Size");
    expect(item?.severity).toBe("bad");
  });

  it("shows bounding box dimensions", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "Dimensions");
    expect(item?.value).toBe("1 × 2 × 1");
  });

  it("detects degenerate tris", () => {
    const result = validateAsset(withDiag({ degenerateTriCount: 200 }));
    const item = result.items.find((i) => i.label === "Degenerate Tris");
    expect(item?.severity).toBe("warning");
  });

  // Topology
  it("shows clean when no non-manifold", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "Non-manifold");
    expect(item?.value).toBe("Clean");
    expect(item?.severity).toBe("good");
  });

  it("warns on non-manifold edges", () => {
    const result = validateAsset(withDiag({ nonManifoldEdgeCount: 10 }));
    const item = result.items.find((i) => i.label === "Non-manifold");
    expect(item?.severity).toBe("warning");
  });

  it("shows watertight when no open edges", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "Open Edges");
    expect(item?.value).toBe("Watertight");
  });

  it("warns on open edges", () => {
    const result = validateAsset(withDiag({ openEdgeCount: 30 }));
    const item = result.items.find((i) => i.label === "Open Edges");
    expect(item?.severity).toBe("warning");
  });

  it("warns on flipped normals", () => {
    const result = validateAsset(withDiag({ flippedNormalTriCount: 50 }));
    const item = result.items.find((i) => i.label === "Flipped Normals");
    expect(item?.severity).toBe("warning");
  });

  // UV
  it("shows UV coverage when all meshes have UVs", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "UV Coverage");
    expect(item?.severity).toBe("good");
  });

  it("warns when some meshes have no UVs", () => {
    const result = validateAsset(withDiag({ meshesWithoutUV: 1 }));
    const item = result.items.find((i) => i.label === "No UVs");
    expect(item?.severity).toBe("warning");
  });

  // Texture
  it("warns on missing textures", () => {
    const result = validateAsset({ ...baseInput, missingTextureCount: 2 });
    const item = result.items.find((i) => i.label === "Missing");
    expect(item?.severity).toBe("warning");
  });

  // Material
  it("warns on meshes without material", () => {
    const result = validateAsset(withDiag({ meshesWithoutMaterial: 2 }));
    const item = result.items.find((i) => i.label === "No Material");
    expect(item?.severity).toBe("warning");
  });

  // Transform
  it("shows uniform scale when ok", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "Scale");
    expect(item?.value).toBe("Uniform");
  });

  it("warns on non-uniform scale", () => {
    const result = validateAsset(withDiag({ nonUniformScaleCount: 2 }));
    const item = result.items.find((i) => i.label === "Non-uniform Scale");
    expect(item?.severity).toBe("warning");
  });

  it("shows centered pivot", () => {
    const result = validateAsset(baseInput);
    const item = result.items.find((i) => i.label === "Pivot");
    expect(item?.value).toBe("Centered");
  });

  it("warns on off-center pivot", () => {
    const result = validateAsset(withDiag({ offCenterDistance: 25 }));
    const item = result.items.find((i) => i.label === "Pivot Offset");
    expect(item?.severity).toBe("warning");
  });
});
