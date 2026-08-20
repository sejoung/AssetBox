import { describe, it, expect } from "vitest";
import {
  EMPTY_TREE,
  baseName,
  breadcrumbs,
  countIssues,
  filterIssues,
  firstChildPath,
  hasParent,
  parentRowPath,
  setSort,
  stepPath,
  stepRow,
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
    modified: 0,
  };
}

function model(path: string, fileSize = 1024, modified = 0): DirEntry {
  return {
    name: baseName(path),
    path,
    isDir: false,
    fileSize,
    kind: "model",
    hasChildren: false,
    thumbnailPath: null,
    modified,
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

  it("stops at the filesystem root when walking up", () => {
    expect(parentDir("/Users")).toBe("/");
    expect(parentDir("/")).toBe("/");
    expect(parentDir("C:\\assets")).toBe("C:\\");

    expect(hasParent("/Users/me")).toBe(true);
    expect(hasParent("/")).toBe(false);
    expect(hasParent(null)).toBe(false);
  });

  it("splits a path into breadcrumb segments", () => {
    expect(breadcrumbs("/Users/me/assets")).toEqual([
      { name: "/", path: "/" },
      { name: "Users", path: "/Users" },
      { name: "me", path: "/Users/me" },
      { name: "assets", path: "/Users/me/assets" },
    ]);
    expect(breadcrumbs("C:\\assets\\hero")).toEqual([
      { name: "C:", path: "C:\\" },
      { name: "assets", path: "C:\\assets" },
      { name: "hero", path: "C:\\assets\\hero" },
    ]);
    expect(breadcrumbs(null)).toEqual([]);
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

  it("orders folders first, then files by the active sort mode", () => {
    let state = createTree("/root");
    state = setChildren(state, null, [
      model("/root/big.glb", 900, 10),
      model("/root/apple.glb", 100, 30),
      dir("/root/sub"),
      model("/root/mid.glb", 500, 20),
    ]);

    expect(flattenTree(state).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/apple.glb",
      "/root/big.glb",
      "/root/mid.glb",
    ]);

    // Size and date sort descending — the biggest and the newest come first.
    expect(flattenTree(setSort(state, "size")).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/big.glb",
      "/root/mid.glb",
      "/root/apple.glb",
    ]);
    expect(flattenTree(setSort(state, "modified")).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/apple.glb",
      "/root/mid.glb",
      "/root/big.glb",
    ]);
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

describe("row navigation", () => {
  const rows = flattenTree(setExpanded(buildTree(), "/root/sub", true));
  // Visible order: sub, sub/c.obj, a.glb, b.fbx

  it("steps over every row, folders included", () => {
    expect(stepRow(rows, null, 1)).toBe("/root/sub");
    expect(stepRow(rows, "/root/sub", 1)).toBe("/root/sub/c.obj");
    expect(stepRow(rows, "/root/sub/c.obj", 1)).toBe("/root/a.glb");
    expect(stepRow(rows, "/root/a.glb", -1)).toBe("/root/sub/c.obj");
  });

  it("clamps at both ends", () => {
    expect(stepRow(rows, "/root/b.fbx", 1)).toBeNull();
    expect(stepRow(rows, "/root/sub", -1)).toBeNull();
    expect(stepRow([], null, 1)).toBeNull();
  });

  it("steps a plain path list the same way (search results)", () => {
    const paths = ["/a.glb", "/b.glb"];
    expect(stepPath(paths, null, 1)).toBe("/a.glb");
    expect(stepPath(paths, null, -1)).toBe("/b.glb");
    expect(stepPath(paths, "/a.glb", 1)).toBe("/b.glb");
    expect(stepPath(paths, "/b.glb", 1)).toBeNull();
  });

  it("finds the parent row one level up", () => {
    expect(parentRowPath(rows, "/root/sub/c.obj")).toBe("/root/sub");
    // Top-level rows have no parent in view — the caller navigates up instead.
    expect(parentRowPath(rows, "/root/a.glb")).toBeNull();
    expect(parentRowPath(rows, "/root/sub")).toBeNull();
  });

  it("finds the first child of an expanded folder", () => {
    expect(firstChildPath(rows, "/root/sub")).toBe("/root/sub/c.obj");
    expect(firstChildPath(rows, "/root/a.glb")).toBeNull();

    const collapsed = flattenTree(buildTree());
    expect(firstChildPath(collapsed, "/root/sub")).toBeNull();
  });
});

describe("issue filtering", () => {
  const rows = flattenTree(setExpanded(buildTree(), "/root/sub", true));
  const severity = { "/root/a.glb": "bad", "/root/b.fbx": "good" } as const;

  it("keeps folders and problem files, drops the rest", () => {
    expect(filterIssues(rows, severity).map((row) => row.path)).toEqual([
      "/root/sub",
      "/root/a.glb",
    ]);
  });

  it("counts warnings and failures", () => {
    expect(countIssues(rows, severity)).toEqual({ warning: 0, bad: 1 });
    expect(countIssues(rows, { "/root/a.glb": "warning", "/root/sub/c.obj": "warning" })).toEqual({
      warning: 2,
      bad: 0,
    });
  });
});
