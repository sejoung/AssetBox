import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDirectory, unwatchDirectory, watchDirectory, type DirEntry } from "./useTauriCommand";
import {
  EMPTY_TREE,
  createTree,
  expandedPaths,
  flattenTree,
  invalidateChildren,
  setChildren,
  setExpanded,
  setNodeError,
  setNodeLoading,
  type FlatRow,
  type TreeState,
} from "../lib/fileTree";
import * as log from "../lib/logger";

const WATCH_DEBOUNCE_MS = 300;

export interface FileTree {
  state: TreeState;
  rows: FlatRow[];
  openRoot: (dir: string) => Promise<void>;
  toggle: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  closeRoot: () => void;
}

/**
 * Owns the lazily-loaded directory tree. Only the selected path is lifted into
 * App — expansion state and cached listings stay here.
 */
export function useFileTree(modelsOnly: boolean): FileTree {
  const [state, setState] = useState<TreeState>(EMPTY_TREE);

  // Reading the tree inside callbacks without making them depend on it,
  // so identities stay stable for effects and keyboard handlers.
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchInto = useCallback(async (dir: string, target: string | null, only: boolean) => {
    setState((prev) => setNodeLoading(prev, target, true));
    try {
      const entries: DirEntry[] = await listDirectory(dir, only);
      setState((prev) => setChildren(prev, target, entries));
    } catch (err) {
      log.error("listDirectory failed:", err);
      setState((prev) =>
        setNodeError(prev, target, err instanceof Error ? err.message : String(err))
      );
    }
  }, []);

  const openRoot = useCallback(
    async (dir: string) => {
      setState(createTree(dir));
      await fetchInto(dir, null, modelsOnly);
      watchDirectory(dir).catch((err) => log.warn("watch_directory failed:", err));
    },
    [fetchInto, modelsOnly]
  );

  const closeRoot = useCallback(() => {
    setState(EMPTY_TREE);
    unwatchDirectory().catch(() => {});
  }, []);

  const toggle = useCallback(
    async (path: string) => {
      const node = stateRef.current.nodes[path];
      if (!node || !node.entry.isDir) return;

      const nextExpanded = !node.expanded;
      setState((prev) => setExpanded(prev, path, nextExpanded));

      if (nextExpanded && node.children === null) {
        await fetchInto(path, path, modelsOnly);
      }
    },
    [fetchInto, modelsOnly]
  );

  /** Re-fetches the root and every folder the user has open. */
  const refresh = useCallback(async () => {
    const current = stateRef.current;
    if (!current.root) return;

    const open = expandedPaths(current);
    setState((prev) => invalidateChildren(prev));

    await fetchInto(current.root, null, modelsOnly);
    for (const path of open) {
      // Folders removed since the last listing simply drop out of the tree.
      if (!stateRef.current.nodes[path]) continue;
      await fetchInto(path, path, modelsOnly);
    }
  }, [fetchInto, modelsOnly]);

  // A models-only toggle changes what every listing contains, so all cached
  // levels are re-fetched while expansion state is preserved.
  const initialFilter = useRef(modelsOnly);
  useEffect(() => {
    if (initialFilter.current === modelsOnly) return;
    initialFilter.current = modelsOnly;
    void refresh();
  }, [modelsOnly, refresh]);

  // Filesystem watcher → debounced refresh.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen("file-tree-changed", () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refresh(), WATCH_DEBOUNCE_MS);
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {
        // Not running under Tauri (tests / browser dev) — manual refresh only.
      }
    }
    void setup();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [refresh]);

  const rows = useMemo(() => flattenTree(state), [state]);

  return useMemo(
    () => ({ state, rows, openRoot, toggle, refresh, closeRoot }),
    [state, rows, openRoot, toggle, refresh, closeRoot]
  );
}
