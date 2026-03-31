import { describe, it, expect } from "vitest";
import { convertFilePath } from "../../src/components/ModelLoader";

describe("convertFilePath", () => {
  it("converts Windows backslash paths", () => {
    expect(convertFilePath("C:\\Users\\test\\model.fbx")).toBe(
      "asset://localhost/C%3A/Users/test/model.fbx"
    );
  });

  it("converts macOS/Linux forward slash paths", () => {
    expect(convertFilePath("/Users/beni/models/model.fbx")).toBe(
      "asset://localhost//Users/beni/models/model.fbx"
    );
  });

  it("encodes spaces in path segments", () => {
    expect(convertFilePath("C:\\Users\\My Files\\model.fbx")).toBe(
      "asset://localhost/C%3A/Users/My%20Files/model.fbx"
    );
  });

  it("encodes Korean characters in path segments", () => {
    const result = convertFilePath("C:\\Users\\한글 폴더\\model.fbx");
    expect(result).toContain("asset://localhost/C%3A/Users/");
    expect(result).toContain("/model.fbx");
    // 슬래시는 인코딩되지 않아야 함
    expect(result).not.toContain("%2F");
    expect(result).not.toContain("%5C");
  });

  it("preserves slashes and only encodes segments", () => {
    const result = convertFilePath("D:\\Projects\\3D Assets\\hero_model.glb");
    expect(result).toBe("asset://localhost/D%3A/Projects/3D%20Assets/hero_model.glb");
  });

  it("handles paths with special characters", () => {
    const result = convertFilePath("C:\\Users\\test\\[assets]\\model (1).fbx");
    expect(result).toBe("asset://localhost/C%3A/Users/test/%5Bassets%5D/model%20(1).fbx");
  });
});
