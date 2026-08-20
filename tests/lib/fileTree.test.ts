import { describe, it, expect } from "vitest";
import {
  EMPTY_TREE,
  baseName,
  createTree,
  expandedPaths,
  flattenTree,
  formatFileSize,
  invalidateChildren,
  isModelPath,
  parentDir,
  setChildren,
  setExpanded,
  setNodeError,
  setNodeLoading,
  stepModelPath,
  treeStats,
  visibleModelPaths,
} from "../../src/lib/fileTree";
import type { DirEntry } from "../../src/hooks/useTauriCommand";

function dir(path: string, hasChildren = true): DirEntry {
  return {
    name: baseName(path),
    path,
    isDir: true,
    fileSize: 0,
    kind: "dir",
    hasChildren,
    thumbnailPath: null,
  };
}

function model(path: string, fileSize = 1024): DirEntry {
  return {
    name: baseName(path),
    path,
    isDir: false,
    fileSize,
    kind: "model",
    hasChildren: false,
    thumbnailPath: null,
  };
}

/** root/ { a.glb, b.fbx, sub/ { c.obj } } with `sub` collapsed. */
function buildTree() {
  let state = createTree("/root");
  state = setChildren(state, null, [dir("/root/sub"), model("/root/a.glb"), model("/root/b.fbx")]);
  state = setChildren(state, "/root/sub", [model("/root/sub/c.obj")]);
  return state;
}

describe("path helpers", () => {
  it("recognizes supported model extensions case-insensitively", () => {
    expect(isModelPath("/a/b.GLB")).toBe(true);
    expect(isModelPath("/a/b.fbx")).toBe(true);
    expect(isModelPath("/a/b.obj")).toBe(true);
    expect(isModelPath("/a/b.gltf")).toBe(true);
    expect(isModelPath("/a/b.png")).toBe(false);
    expect(isModelPath("/a/folder")).toBe(false);
  });

  it("extracts base name from posix and windows paths", () => {
    expect(baseName("/Users/me/assets/hero.glb")).toBe("hero.glb");
    expect(baseName("C:\\assets\\hero.glb")).toBe("hero.glb");
    expect(baseName("/Users/me/assets/")).toBe("assets");
  });

  it("extracts parent directory", () => {
    expect(parentDir("/Users/me/assets/hero.glb")).toBe("/Users/me/assets");
    expect(parentDir("C:\\assets\\hero.glb")).toBe("C:\\assets");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(0)).toBe("-");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("tree state", () => {
  it("starts empty and marks the root as loading", () => {
    expect(flattenTree(EMPTY_TREE)).toEqual([]);
    const state = createTree("/root");
    expect(state.root).toBe("/root");
    expect(state.rootLoading).toBe(true);
  });

  it("flattens only expanded branches", () => {
    const state = buildTree();
    expect(flattenTree(state).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/a.glb",
      "/root/b.fbx",
    ]);

    const expanded = setExpanded(state, "/root/sub", true);
    const rows = flattenTree(expanded);
    expect(rows.map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/sub/c.obj",
      "/root/a.glb",
      "/root/b.fbx",
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 0, 0]);
  });

  it("sorts nothing itself — listing order from the backend is preserved", () => {
    const state = setChildren(createTree("/root"), null, [
      model("/root/z.glb"),
      model("/root/a.glb"),
    ]);
    expect(flattenTree(state).map((row) => row.path)).toEqual(["/root/z.glb", "/root/a.glb"]);
  });

  it("keeps expansion state when a listing is refreshed", () => {
    let state = setExpanded(buildTree(), "/root/sub", true);
    state = setChildren(state, null, [dir("/root/sub"), model("/root/a.glb")]);
    expect(state.nodes["/root/sub"].expanded).toBe(true);
    expect(flattenTree(state).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/sub/c.obj",
      "/root/a.glb",
    ]);
  });

  it("invalidates cached listings but remembers open folders", () => {
    const state = invalidateChildren(setExpanded(buildTree(), "/root/sub", true));
    expect(state.rootChildren).toBeNull();
    expect(state.nodes["/root/sub"].children).toBeNull();
    expect(expandedPaths(state)).toEqual(["/root/sub"]);
    // Nothing renders until the listings come back.
    expect(flattenTree(state)).toEqual([]);
  });

  it("tracks per-node loading and error state", () => {
    let state = setNodeLoading(buildTree(), "/root/sub", true);
    expect(state.nodes["/root/sub"].loading).toBe(true);

    state = setNodeError(state, "/root/sub", "boom");
    expect(state.nodes["/root/sub"].loading).toBe(false);
    expect(state.nodes["/root/sub"].error).toBe("boom");

    expect(setNodeError(state, null, "nope").rootError).toBe("nope");
  });

  it("ignores updates for unknown paths", () => {
    const state = buildTree();
    expect(setExpanded(state, "/nope", true)).toBe(state);
    expect(setNodeLoading(state, "/nope", true)).toBe(state);
  });

  it("counts models and folders in view", () => {
    const rows = flattenTree(setExpanded(buildTree(), "/root/sub", true));
    expect(treeStats(rows)).toEqual({ models: 3, folders: 1 });
    expect(visibleModelPaths(rows)).toEqual(["/root/sub/c.obj", "/root/a.glb", "/root/b.fbx"]);
  });
});

describe("stepModelPath", () => {
  const rows = flattenTree(setExpanded(buildTree(), "/root/sub", true));

  it("selects the first model when nothing is selected", () => {
    expect(stepModelPath(rows, null, 1)).toBe("/root/sub/c.obj");
  });

  it("selects the last model when stepping back from nothing", () => {
    expect(stepModelPath(rows, null, -1)).toBe("/root/b.fbx");
  });

  it("skips folders when moving between models", () => {
    expect(stepModelPath(rows, "/root/sub/c.obj", 1)).toBe("/root/a.glb");
    expect(stepModelPath(rows, "/root/a.glb", -1)).toBe("/root/sub/c.obj");
  });

  it("clamps at both ends instead of wrapping", () => {
    expect(stepModelPath(rows, "/root/b.fbx", 1)).toBeNull();
    expect(stepModelPath(rows, "/root/sub/c.obj", -1)).toBeNull();
  });

  it("returns null when no models are visible", () => {
    expect(stepModelPath([], "/root/a.glb", 1)).toBeNull();
  });

  it("falls back to the first model when the selection is not in view", () => {
    expect(stepModelPath(rows, "/elsewhere/x.glb", 1)).toBe("/root/sub/c.obj");
  });
});
