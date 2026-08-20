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
export type SortMode = "name" | "size" | "modified";

export interface TreeState {
  root: string | null;
  sort: SortMode;
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
  sort: "name",
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
  if (idx < 0) return path;
  if (idx === 0) return "/"; // "/Users" -> "/"
  const parent = path.slice(0, idx);
  // "C:\\assets" -> "C:\\", not "C:"
  return parent.endsWith(":") ? parent + path[idx] : parent;
}

/** False at a filesystem root, where there is nowhere left to go up to. */
export function hasParent(path: string | null): boolean {
  return !!path && parentDir(path) !== path;
}

export interface Crumb {
  name: string;
  path: string;
}

/** Path split into clickable breadcrumb segments, root first. */
export function breadcrumbs(path: string | null): Crumb[] {
  if (!path) return [];
  const windows = path.includes("\\");
  const separator = windows ? "\\" : "/";
  const parts = path.split(/[/\\]/).filter(Boolean);
  const crumbs: Crumb[] = [];

  let accumulated: string;
  if (windows) {
    const drive = parts.shift() ?? "";
    accumulated = drive;
    crumbs.push({ name: drive, path: drive + separator });
  } else {
    accumulated = "";
    crumbs.push({ name: "/", path: "/" });
  }

  for (const part of parts) {
    accumulated += separator + part;
    crumbs.push({ name: part, path: accumulated });
  }
  return crumbs;
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

export function createTree(root: string, sort: SortMode = "name"): TreeState {
  return { ...EMPTY_TREE, root, sort, rootLoading: true };
}

export function setSort(state: TreeState, sort: SortMode): TreeState {
  return { ...state, sort };
}

/**
 * Folders always come first; files then order by the active mode.
 * Size and date sort descending because the interesting asset is the biggest
 * or the newest one, not the smallest.
 */
function sortPaths(paths: string[], nodes: Record<string, TreeNode>, sort: SortMode): string[] {
  return [...paths].sort((left, right) => {
    const a = nodes[left]?.entry;
    const b = nodes[right]?.entry;
    if (!a || !b) return 0;
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (!a.isDir) {
      if (sort === "size" && a.fileSize !== b.fileSize) return b.fileSize - a.fileSize;
      if (sort === "modified" && a.modified !== b.modified) return b.modified - a.modified;
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
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

  const walk = (unsorted: string[] | null, depth: number) => {
    if (!unsorted) return;
    for (const path of sortPaths(unsorted, state.nodes, state.sort)) {
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

// ── Row navigation ──
//
// Focus moves row by row like a file manager, including folders; selection
// (the file actually loaded in the viewer) follows focus only for files.

export function rowIndex(rows: FlatRow[], path: string | null): number {
  return path === null ? -1 : rows.findIndex((row) => row.path === path);
}

/** Next/previous entry in a visible list. Clamps at both ends. */
export function stepPath(
  paths: string[],
  current: string | null,
  direction: 1 | -1
): string | null {
  if (paths.length === 0) return null;

  const index = current === null ? -1 : paths.indexOf(current);
  if (index === -1) return direction === 1 ? paths[0] : paths[paths.length - 1];

  const next = index + direction;
  if (next < 0 || next >= paths.length) return null;
  return paths[next];
}

/** Next/previous visible row, folders included. */
export function stepRow(rows: FlatRow[], current: string | null, direction: 1 | -1): string | null {
  return stepPath(
    rows.map((row) => row.path),
    current,
    direction
  );
}

/** The row one level up from `path`, or null at the top level. */
export function parentRowPath(rows: FlatRow[], path: string): string | null {
  const index = rowIndex(rows, path);
  if (index <= 0) return null;

  const depth = rows[index].depth;
  if (depth === 0) return null;

  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth === depth - 1) return rows[i].path;
  }
  return null;
}

/** First child of an expanded folder, or null when it has none in view. */
export function firstChildPath(rows: FlatRow[], path: string): string | null {
  const index = rowIndex(rows, path);
  if (index === -1 || index + 1 >= rows.length) return null;
  return rows[index + 1].depth > rows[index].depth ? rows[index + 1].path : null;
}

/**
 * Hides files that came back clean, keeping folders so the tree stays
 * navigable. Files that have not been validated yet are also hidden — the
 * point of the filter is to look at known problems.
 */
export function filterIssues(
  rows: FlatRow[],
  severityByPath: Record<string, ValidationSeverity>
): FlatRow[] {
  return rows.filter((row) => {
    if (row.node.entry.isDir) return true;
    const severity = severityByPath[row.path];
    return severity === "warning" || severity === "bad";
  });
}

export interface IssueCounts {
  warning: number;
  bad: number;
}

export function countIssues(
  rows: FlatRow[],
  severityByPath: Record<string, ValidationSeverity>
): IssueCounts {
  let warning = 0;
  let bad = 0;
  for (const row of rows) {
    const severity = severityByPath[row.path];
    if (severity === "warning") warning++;
    else if (severity === "bad") bad++;
  }
  return { warning, bad };
}
