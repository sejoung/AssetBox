import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listDirectory, searchFiles, watchDirectory, type DirEntry } from "./useTauriCommand";
import {
  EMPTY_TREE,
  createTree,
  expandedPaths,
  flattenTree,
  hasParent,
  invalidateChildren,
  parentDir,
  setChildren,
  setExpanded,
  setNodeError,
  setNodeLoading,
  setSort as setSortMode,
  type FlatRow,
  type SortMode,
  type TreeState,
} from "../lib/fileTree";
import { loadSession, saveSession } from "../lib/treeSession";
import { getRecentFolders, pushRecentFolder } from "../lib/recentFolders";
import * as log from "../lib/logger";

const WATCH_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 200;

export interface TreeSearch {
  query: string;
  setQuery: (query: string) => void;
  results: DirEntry[];
  searching: boolean;
  active: boolean;
}

export interface NavigateOptions {
  /** Folder to expand and highlight after arriving — used when moving up. */
  reveal?: string;
  /** Folders to re-open, e.g. when restoring a session. */
  expand?: string[];
}

export interface FileTree {
  state: TreeState;
  rows: FlatRow[];
  location: string | null;
  canGoUp: boolean;
  navigate: (dir: string, options?: NavigateOptions) => Promise<void>;
  navigateUp: () => Promise<void>;
  toggle: (path: string) => Promise<void>;
  setExpanded: (path: string, expanded: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  modelsOnly: boolean;
  setModelsOnly: (value: boolean) => void;
  sort: SortMode;
  setSort: (mode: SortMode) => void;
  search: TreeSearch;
  recentFolders: string[];
  /** Folder highlighted after navigating up, so you can see where you came from. */
  revealed: string | null;
  restoring: boolean;
}

/**
 * Owns the lazily-loaded directory tree. The model is *navigation*, like a file
 * manager: `location` is the folder on screen and moving up simply re-roots to
 * the parent, so there is no "open"/"close" state to manage.
 */
export function useFileTree(onFilesChanged?: (paths: string[] | null) => void): FileTree {
  const changeCallback = useRef(onFilesChanged);
  changeCallback.current = onFilesChanged;
  const generation = useRef(0);
  const navigation = useRef(0);
  const watchQueue = useRef(Promise.resolve());
  const requests = useRef(new Map<string | null, number>());
  const mounted = useRef(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const invalidateRequests = useCallback(() => {
    generation.current++;
    navigation.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateRequests();
    };
  }, [invalidateRequests]);
  const session = useRef(loadSession()).current;

  const [state, setReactState] = useState<TreeState>(EMPTY_TREE);
  const [modelsOnly, setModelsOnlyState] = useState(session.modelsOnly);
  const [sort, setSortState] = useState<SortMode>(session.sort);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(!!session.location);
  const [recentFolders, setRecentFolders] = useState<string[]>(() => getRecentFolders());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirEntry[]>([]);
  const [searching, setSearching] = useState(false);

  // Callbacks read the latest values through refs so their identities stay
  // stable for effects and the window-level keyboard handler.
  const stateRef = useRef(state);
  const setState = useCallback((update: TreeState | ((previous: TreeState) => TreeState)) => {
    const next = typeof update === "function" ? update(stateRef.current) : update;
    stateRef.current = next;
    setReactState(next);
  }, []);
  const modelsOnlyRef = useRef(modelsOnly);
  modelsOnlyRef.current = modelsOnly;
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const fetchInto = useCallback(
    async (dir: string, target: string | null) => {
      const epoch = generation.current;
      const request = (requests.current.get(target) ?? 0) + 1;
      requests.current.set(target, request);
      const current = () =>
        mounted.current && epoch === generation.current && requests.current.get(target) === request;
      setState((prev) => setNodeLoading(prev, target, true));
      try {
        const entries: DirEntry[] = await listDirectory(dir, modelsOnlyRef.current);
        if (!current()) return;
        setState((prev) => setChildren(prev, target, entries));
      } catch (err) {
        if (!current()) return;
        log.error("listDirectory failed:", err);
        setState((prev) =>
          setNodeError(prev, target, err instanceof Error ? err.message : String(err))
        );
      }
    },
    [setState]
  );

  const expandPath = useCallback(
    async (path: string) => {
      const node = stateRef.current.nodes[path];
      if (!node || !node.entry.isDir) return;
      setState((prev) => setExpanded(prev, path, true));
      if (node.children === null) await fetchInto(path, path);
    },
    [fetchInto, setState]
  );

  const navigate = useCallback(
    async (dir: string, options: NavigateOptions = {}) => {
      const epoch = ++generation.current;
      requests.current.clear();
      const nav = ++navigation.current;
      // Serialize native watcher replacement; skip queued obsolete roots.
      watchQueue.current = watchQueue.current.then(async () => {
        if (!mounted.current || nav !== navigation.current) return;
        try {
          await watchDirectory(dir);
        } catch (err) {
          log.warn("watch_directory failed:", err);
        }
      });
      setState(createTree(dir, sortRef.current));
      setRevealed(options.reveal ?? null);
      setQuery("");
      setRecentFolders(pushRecentFolder(dir));

      await fetchInto(dir, null);
      if (epoch !== generation.current || !mounted.current) return;

      // Shallow folders first, so a parent is loaded before its child.
      const toExpand = [...(options.expand ?? []), ...(options.reveal ? [options.reveal] : [])]
        .filter((path, index, all) => all.indexOf(path) === index)
        .sort((a, b) => a.length - b.length);

      for (const path of toExpand) {
        if (epoch !== generation.current || !mounted.current) return;
        await expandPath(path);
      }
    },
    [expandPath, fetchInto, setState]
  );

  const navigateUp = useCallback(async () => {
    const current = stateRef.current.root;
    if (!current || !hasParent(current)) return;
    await navigate(parentDir(current), { reveal: current });
  }, [navigate]);

  const toggle = useCallback(
    async (path: string) => {
      const node = stateRef.current.nodes[path];
      if (!node || !node.entry.isDir) return;

      if (node.expanded) {
        setState((prev) => setExpanded(prev, path, false));
        return;
      }
      await expandPath(path);
    },
    [expandPath, setState]
  );

  const setExpandedPath = useCallback(
    async (path: string, expanded: boolean) => {
      if (!expanded) {
        setState((prev) => setExpanded(prev, path, false));
        return;
      }
      await expandPath(path);
    },
    [expandPath, setState]
  );

  /** Re-fetches the current folder and everything open beneath it. */
  const refresh = useCallback(
    async (notifyChange = true) => {
      const current = stateRef.current;
      if (!current.root) return;

      const epoch = ++generation.current;
      if (notifyChange) changeCallback.current?.(null);
      setRefreshVersion((value) => value + 1);
      const open = expandedPaths(current);
      setState((prev) => invalidateChildren(prev));

      await fetchInto(current.root, null);
      for (const path of open) {
        if (epoch !== generation.current || !mounted.current) return;
        // Folders deleted since the last listing simply drop out of the tree.
        if (!stateRef.current.nodes[path]) continue;
        await fetchInto(path, path);
      }
    },
    [fetchInto, setState]
  );

  const setModelsOnly = useCallback((value: boolean) => {
    modelsOnlyRef.current = value;
    setModelsOnlyState(value);
    saveSession({ modelsOnly: value });
  }, []);

  const setSort = useCallback(
    (mode: SortMode) => {
      sortRef.current = mode;
      setSortState(mode);
      setState((prev) => setSortMode(prev, mode));
      saveSession({ sort: mode });
    },
    [setState]
  );

  // Restore the folder and expansion state from the previous run.
  useEffect(() => {
    if (!session.location) return;
    void navigate(session.location, { expand: session.expanded }).finally(
      () => mounted.current && setRestoring(false)
    );
    // Runs once on mount; `session` is a ref snapshot taken before first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.root) return;
    saveSession({ location: state.root, expanded: expandedPaths(state) });
  }, [state]);

  // The filter changes what every listing contains, so cached levels are
  // re-fetched while expansion state is preserved.
  const appliedFilter = useRef(modelsOnly);
  useEffect(() => {
    if (appliedFilter.current === modelsOnly) return;
    appliedFilter.current = modelsOnly;
    void refresh(false);
  }, [modelsOnly, refresh]);

  // Filesystem watcher → debounced refresh.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    let sourceChanged = false;
    const paths = new Set<string>();
    let eventRoot: string | null = null;

    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<{ root: string; paths: string[] }>(
          "file-tree-changed",
          (event) => {
            if (disposed || (event.payload?.root && event.payload.root !== stateRef.current.root))
              return;
            if (eventRoot !== stateRef.current.root) {
              paths.clear();
              sourceChanged = false;
            }
            eventRoot = stateRef.current.root;
            for (const path of event.payload?.paths ?? []) paths.add(path);
            // Older native builds send no paths: conservatively invalidate all.
            sourceChanged ||=
              !event.payload?.paths?.length ||
              event.payload.paths.some((path) => !/_(thumbnail\.png|report\.html)$/i.test(path));
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              if (disposed || eventRoot !== stateRef.current.root) return;
              if (sourceChanged) changeCallback.current?.(paths.size ? [...paths] : null);
              paths.clear();
              sourceChanged = false;
              void refresh(false);
            }, WATCH_DEBOUNCE_MS);
          }
        );
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

  // Debounced recursive search. Results replace the tree with a flat list.
  const root = state.root;
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !root) {
      setResults([]);
      setSearching(false);
      return;
    }

    let disposed = false;
    setResults([]);
    setSearching(true);
    const timer = setTimeout(() => {
      searchFiles(root, trimmed, modelsOnly)
        .then((entries) => {
          if (!disposed) setResults(entries);
        })
        .catch((err) => {
          if (disposed) return;
          log.warn("search_files failed:", err);
          setResults([]);
        })
        .finally(() => {
          if (!disposed) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [query, root, modelsOnly, refreshVersion]);

  const rows = useMemo(() => flattenTree(state), [state]);

  const search = useMemo<TreeSearch>(
    () => ({ query, setQuery, results, searching, active: query.trim().length > 0 }),
    [query, results, searching]
  );

  return useMemo(
    () => ({
      state,
      rows,
      location: state.root,
      canGoUp: hasParent(state.root),
      navigate,
      navigateUp,
      toggle,
      setExpanded: setExpandedPath,
      refresh,
      modelsOnly,
      setModelsOnly,
      sort,
      setSort,
      search,
      recentFolders,
      revealed,
      restoring,
    }),
    [
      state,
      rows,
      navigate,
      navigateUp,
      toggle,
      setExpandedPath,
      refresh,
      modelsOnly,
      setModelsOnly,
      sort,
      setSort,
      search,
      recentFolders,
      revealed,
      restoring,
    ]
  );
}
