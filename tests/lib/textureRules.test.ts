import { describe, it, expect } from "vitest";
import { matchTextureType, findTexturesInFileList } from "../../src/lib/textureRules";

describe("matchTextureType", () => {
  it("matches basecolor variants", () => {
    expect(matchTextureType("hero_basecolor.png")).toBe("basecolor");
    expect(matchTextureType("hero_BaseColor.png")).toBe("basecolor");
    expect(matchTextureType("hero_diffuse.png")).toBe("basecolor");
    expect(matchTextureType("hero_albedo.jpg")).toBe("basecolor");
    expect(matchTextureType("hero_color.png")).toBe("basecolor");
  });

  it("matches normal map variants", () => {
    expect(matchTextureType("hero_normal.png")).toBe("normal");
    expect(matchTextureType("hero_Normal.png")).toBe("normal");
    expect(matchTextureType("hero_nrm.png")).toBe("normal");
  });

  it("matches roughness variants", () => {
    expect(matchTextureType("hero_roughness.png")).toBe("roughness");
    expect(matchTextureType("hero_Roughness.jpg")).toBe("roughness");
    expect(matchTextureType("hero_rough.png")).toBe("roughness");
  });

  it("matches metallic variants", () => {
    expect(matchTextureType("hero_metallic.png")).toBe("metallic");
    expect(matchTextureType("hero_Metalness.png")).toBe("metallic");
    expect(matchTextureType("hero_metal.png")).toBe("metallic");
  });

  it("matches AO variants", () => {
    expect(matchTextureType("hero_ao.png")).toBe("ao");
    expect(matchTextureType("hero_AO.png")).toBe("ao");
    expect(matchTextureType("hero_ambientocclusion.png")).toBe("ao");
    expect(matchTextureType("hero_occlusion.png")).toBe("ao");
  });

  it("matches emissive", () => {
    expect(matchTextureType("hero_emissive.png")).toBe("emissive");
    expect(matchTextureType("hero_emission.png")).toBe("emissive");
  });

  it("matches height/displacement", () => {
    expect(matchTextureType("hero_height.png")).toBe("height");
    expect(matchTextureType("hero_displacement.png")).toBe("height");
    expect(matchTextureType("hero_disp.png")).toBe("height");
  });

  it("matches opacity", () => {
    expect(matchTextureType("hero_opacity.png")).toBe("opacity");
    expect(matchTextureType("hero_alpha.png")).toBe("opacity");
  });

  it("returns unknown for unrecognized names", () => {
    expect(matchTextureType("hero_preview.png")).toBe("unknown");
    expect(matchTextureType("screenshot.jpg")).toBe("unknown");
  });
});

describe("findTexturesInFileList", () => {
  it("finds matching textures from a file list", () => {
    const files = [
      "/models/hero_basecolor.png",
      "/models/hero_normal.png",
      "/models/hero_roughness.png",
      "/models/hero_metallic.png",
      "/models/readme.txt",
    ];

    const result = findTexturesInFileList(files);

    expect(result).toHaveLength(4);
    expect(result.find((t) => t.type === "basecolor")?.fileName).toBe("hero_basecolor.png");
    expect(result.find((t) => t.type === "normal")?.fileName).toBe("hero_normal.png");
    expect(result.find((t) => t.type === "roughness")?.fileName).toBe("hero_roughness.png");
    expect(result.find((t) => t.type === "metallic")?.fileName).toBe("hero_metallic.png");
  });

  it("ignores non-image files", () => {
    const files = ["/models/model.fbx", "/models/readme.md"];
    const result = findTexturesInFileList(files);
    expect(result).toHaveLength(0);
  });

  it("handles empty list", () => {
    expect(findTexturesInFileList([])).toEqual([]);
  });
});
