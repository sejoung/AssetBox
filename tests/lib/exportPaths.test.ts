import { expect, it } from "vitest";
import { exportPath } from "../../src/lib/exportPaths";
it.each(["thumbnail", "report"] as const)(
  "keeps %s outputs distinct across formats and dotted folders",
  (kind) => {
    const paths = [
      "/models.v2/의자.fbx",
      "/models.v2/의자.glb",
      "/models.v2/의자.gltf",
      "/models.v2/의자.obj",
    ];
    const outputs = paths.map((path) => exportPath(path, kind));
    expect(new Set(outputs).size).toBe(paths.length);
    outputs.forEach((output, index) => expect(output.startsWith(paths[index] + "_")).toBe(true));
  }
);
