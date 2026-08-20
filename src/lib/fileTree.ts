import type { DirEntry } from "../hooks/useTauriCommand";
import type { ValidationSeverity } from "../types/asset";

/** Extensions the viewer can open. Kept in sync with the Rust side. */
export const MODEL_EXTENSIONS = ["fbx", "glb", "gltf", "obj"] as const;

export interface TreeNode {
  entry: DirEntry;
  /** null = children not fetched yet */
  children: string[] | null;
  expanded: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Tree state as a flat path-keyed map rather than a nested structure —
 * expanding/collapsing touches exactly one entry, which keeps the immutable
 * updates trivial.
 */
export interface TreeState {
  root: string | null;
  rootChildren: string[] | null;
  rootLoading: boolean;
  rootError: string | null;
  nodes: Record<string, TreeNode>;
}

export interface FlatRow {
  path: string;
  depth: number;
  node: TreeNode;
}

export const EMPTY_TREE: TreeState = {
  root: null,
  rootChildren: null,
  rootLoading: false,
  rootError: null,
  nodes: {},
};

export function isModelPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (MODEL_EXTENSIONS as readonly string[]).includes(ext);
}

export function baseName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeNode(entry: DirEntry): TreeNode {
  return { entry, children: null, expanded: false, loading: false, error: null };
}

export function createTree(root: string): TreeState {
  return { ...EMPTY_TREE, root, rootLoading: true };
}

/** Stores a freshly fetched directory listing for `path` (null = tree root). */
export function setChildren(state: TreeState, path: string | null, entries: DirEntry[]): TreeState {
  const nodes = { ...state.nodes };
  const childPaths: string[] = [];

  for (const entry of entries) {
    childPaths.push(entry.path);
    // Preserve expansion/children of nodes that survive a refresh.
    const existing = nodes[entry.path];
    nodes[entry.path] = existing ? { ...existing, entry, loading: false } : makeNode(entry);
  }

  if (path === null) {
    return { ...state, rootChildren: childPaths, rootLoading: false, rootError: null, nodes };
  }

  const parent = nodes[path];
  if (!parent) return { ...state, nodes };
  nodes[path] = { ...parent, children: childPaths, loading: false, error: null };
  return { ...state, nodes };
}

export function setNodeLoading(state: TreeState, path: string | null, loading: boolean): TreeState {
  if (path === null) return { ...state, rootLoading: loading };
  const node = state.nodes[path];
  if (!node) return state;
  return { ...state, nodes: { ...state.nodes, [path]: { ...node, loading } } };
}

export function setNodeError(state: TreeState, path: string | null, error: string): TreeState {
  if (path === null) return { ...state, rootLoading: false, rootError: error };
  const node = state.nodes[path];
  if (!node) return state;
  return { ...state, nodes: { ...state.nodes, [path]: { ...node, loading: false, error } } };
}

export function setExpanded(state: TreeState, path: string, expanded: boolean): TreeState {
  const node = state.nodes[path];
  if (!node) return state;
  return { ...state, nodes: { ...state.nodes, [path]: { ...node, expanded } } };
}

/** Drops every cached listing but remembers which folders were open. */
export function invalidateChildren(state: TreeState): TreeState {
  const nodes: Record<string, TreeNode> = {};
  for (const [path, node] of Object.entries(state.nodes)) {
    nodes[path] = { ...node, children: null };
  }
  return { ...state, rootChildren: null, nodes };
}

export function expandedPaths(state: TreeState): string[] {
  return Object.entries(state.nodes)
    .filter(([, node]) => node.expanded && node.entry.isDir)
    .map(([path]) => path);
}

/**
 * Walks the visible portion of the tree into a render-ready list.
 * Rendering a flat array avoids recursive components and makes windowing
 * a matter of slicing.
 */
export function flattenTree(state: TreeState): FlatRow[] {
  const rows: FlatRow[] = [];

  const walk = (paths: string[] | null, depth: number) => {
    if (!paths) return;
    for (const path of paths) {
      const node = state.nodes[path];
      if (!node) continue;
      rows.push({ path, depth, node });
      if (node.entry.isDir && node.expanded) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(state.rootChildren, 0);
  return rows;
}

/** All model files currently visible, in display order. */
export function visibleModelPaths(rows: FlatRow[]): string[] {
  return rows.filter((row) => !row.node.entry.isDir).map((row) => row.path);
}

/**
 * Next/previous model relative to `current`, skipping folders.
 * Returns the first model when nothing is selected yet, and clamps at both
 * ends so holding an arrow key never wraps around unexpectedly.
 */
export function stepModelPath(
  rows: FlatRow[],
  current: string | null,
  direction: 1 | -1
): string | null {
  const models = visibleModelPaths(rows);
  if (models.length === 0) return null;

  const index = current === null ? -1 : models.indexOf(current);
  if (index === -1) return direction === 1 ? models[0] : models[models.length - 1];

  const next = index + direction;
  if (next < 0 || next >= models.length) return null;
  return models[next];
}

export interface TreeStats {
  models: number;
  folders: number;
}

export function treeStats(rows: FlatRow[]): TreeStats {
  let models = 0;
  let folders = 0;
  for (const row of rows) {
    if (row.node.entry.isDir) folders++;
    else if (row.node.entry.kind === "model") models++;
  }
  return { models, folders };
}

export const SEVERITY_COLORS: Record<ValidationSeverity, string> = {
  good: "#4ade80",
  warning: "#fbbf24",
  bad: "#f87171",
};
