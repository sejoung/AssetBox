import { describe, it, expect } from "vitest";
import { validateAsset, type ValidationInput } from "../../src/hooks/useAssetValidation";

const baseDiagnostics = {
  degenerateTriCount: 0,
  boundingBox: { x: 1, y: 2, z: 1 },
  nonManifoldEdgeCount: 0,
  openEdgeCount: 0,
  normalMismatchTriCount: 0,
  uncheckedNormalTriCount: 0,
  meshesMissingRequiredUV: 0,
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
  failedResourceCount: 0,
  maxTextureRes: 2048,
  textureReferencesVerified: true,
  unknownTextureResolutions: 0,
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

  it("reviews high counts against a target budget instead of rejecting the asset", () => {
    const result = validateAsset({ ...baseInput, polyCount: 600_000, vertexCount: 400_000 });
    expect(result.overall).toBe("warning");
  });

  it("reviews large files against a target budget", () => {
    const result = validateAsset({ ...baseInput, fileSize: 200 * 1024 * 1024 });
    const item = result.items.find((i) => i.label === "File Size");
    expect(item?.severity).toBe("warning");
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
    expect(item?.value).toBe("None detected");
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
    expect(item?.value).toBe("None detected");
  });

  it("warns on open edges", () => {
    const result = validateAsset(withDiag({ openEdgeCount: 30 }));
    const item = result.items.find((i) => i.label === "Open Edges");
    expect(item?.severity).toBe("warning");
  });

  it("warns on flipped normals", () => {
    const result = validateAsset(withDiag({ normalMismatchTriCount: 50 }));
    const item = result.items.find((i) => i.label === "Normal Consistency");
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
  it("flags confirmed resource load failures", () => {
    const result = validateAsset({ ...baseInput, failedResourceCount: 2 });
    const item = result.items.find((i) => i.label === "Failed Resources");
    expect(item?.severity).toBe("bad");
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
    const item = result.items.find((i) => i.label === "Center Offset");
    expect(item?.value).toBe("0");
  });

  it("warns on off-center pivot", () => {
    const result = validateAsset(withDiag({ offCenterDistance: 25 }));
    const item = result.items.find((i) => i.label === "Center Offset");
    expect(item?.severity).toBe("warning");
  });
});

describe("evidence and uncertainty", () => {
  const get = (input: ValidationInput, label: string) =>
    validateAsset(input).items.find((item) => item.label === label)!;
  it("keeps unknown size and unknown resolution from passing", () => {
    const input = {
      ...baseInput,
      fileSize: null,
      maxTextureRes: null,
      unknownTextureResolutions: 1,
    };
    expect(get(input, "File Size")).toMatchObject({ value: "Unknown", severity: "unknown" });
    expect(get(input, "Max Resolution")).toMatchObject({ value: "Unknown", severity: "unknown" });
    expect(validateAsset(input).overall).toBe("unknown");
  });
  it("distinguishes no bound textures from unresolved material references", () => {
    const input = { ...baseInput, textureCount: 0, maxTextureRes: null };
    expect(get(input, "Max Resolution")).toMatchObject({ value: "Not used", severity: "good" });
    expect(get({ ...input, textureReferencesVerified: false }, "Max Resolution").severity).toBe(
      "unknown"
    );
  });
  it("labels partial measurements and retains known high-resolution warnings", () => {
    const input = { ...baseInput, maxTextureRes: 8192, unknownTextureResolutions: 1 };
    expect(get(input, "Max Resolution")).toMatchObject({
      value: "8192px (partial)",
      severity: "warning",
    });
    expect(get(input, "Texture Inspection").severity).toBe("unknown");
  });
  it("does not mark a texture-free material bad just because every mesh lacks UVs", () => {
    expect(get(withDiag({ meshesWithoutUV: baseInput.meshCount }), "No UVs").severity).toBe(
      "warning"
    );
    expect(get(withDiag({ meshesMissingRequiredUV: 1 }), "Missing Required UVs").severity).toBe(
      "bad"
    );
  });
  it("does not treat many intentional boundary edges as a mandatory failure", () => {
    expect(get(withDiag({ openEdgeCount: 1000 }), "Open Edges").severity).toBe("warning");
  });
  it("marks missing normals as unknown rather than no mismatches", () => {
    expect(get(withDiag({ uncheckedNormalTriCount: 10 }), "Normal Consistency").severity).toBe(
      "unknown"
    );
  });
  it("does not suppress confirmed problems when other checks are incomplete", () => {
    expect(validateAsset({ ...baseInput, failedResourceCount: 1, fileSize: null }).overall).toBe(
      "bad"
    );
  });
  it.each([100_000, 100_001])("uses exact reference budget boundaries at %i triangles", (count) => {
    expect(get({ ...baseInput, polyCount: count }, "Tris").severity).toBe(
      count === 100_000 ? "good" : "warning"
    );
  });
});
