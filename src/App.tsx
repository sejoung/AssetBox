import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import "./App.css";
import { DropZone } from "./components/DropZone";
import { Viewer3D, type Viewer3DHandle } from "./components/Viewer3D";
import { InfoPanel } from "./components/InfoPanel";
import { FileTreePanel } from "./components/FileTreePanel";
import { useFileDropHandler } from "./hooks/useFileDropHandler";
import { useFileTree } from "./hooks/useFileTree";
import { useBatchValidation } from "./hooks/useBatchValidation";
import { inspectModel } from "./lib/assetPipeline";
import {
  filterIssues,
  firstChildPath,
  isModelPath,
  parentDir,
  parentRowPath,
  stepModelPath,
  stepPath,
  type FlatRow,
} from "./lib/fileTree";
import { isDirectory } from "./hooks/useTauriCommand";
import { clearPrefetch, prefetchModel } from "./components/ModelLoader";
import { invoke } from "@tauri-apps/api/core";
import type { AssetInfo, ValidationResult, ValidationSeverity } from "./types/asset";
import type { LoadedModel } from "./components/ModelLoader";
import * as log from "./lib/logger";

/** Warms the next model during idle time, falling back where rIC is missing. */
function scheduleIdle(task: () => void): () => void {
  const ric = window.requestIdleCallback;
  if (typeof ric === "function") {
    const handle = ric(task, { timeout: 2000 });
    return () => window.cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(task, 600);
  return () => clearTimeout(timer);
}

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [severityByPath, setSeverityByPath] = useState<Record<string, ValidationSeverity>>({});
  const viewerRef = useRef<Viewer3DHandle>(null);

  const tree = useFileTree();

  /**
   * Bumped on every selection. An in-flight inspection compares the epoch it
   * started with against the current one, so a slow directory scan can never
   * paint file A's verdict over file B.
   */
  const epochRef = useRef(0);

  const recordSeverity = useCallback((path: string, severity: ValidationSeverity) => {
    setSeverityByPath((prev) => (prev[path] === severity ? prev : { ...prev, [path]: severity }));
  }, []);

  const batch = useBatchValidation(recordSeverity);

  const selectFile = useCallback((path: string) => {
    epochRef.current++;
    setError(null);
    setFilePath(path);
  }, []);

  /** Focus follows the keyboard and the mouse; files additionally load. */
  const activate = useCallback(
    (path: string, isDir: boolean) => {
      setFocusedPath(path);
      if (!isDir) selectFile(path);
    },
    [selectFile]
  );

  // Rows actually on screen — the keyboard walks this exact list.
  const visibleRows: FlatRow[] = useMemo(
    () => (onlyIssues ? filterIssues(tree.rows, severityByPath) : tree.rows),
    [onlyIssues, tree.rows, severityByPath]
  );

  const navPaths = useMemo(
    () =>
      tree.search.active
        ? tree.search.results.map((entry) => entry.path)
        : visibleRows.map((row) => row.path),
    [tree.search.active, tree.search.results, visibleRows]
  );

  // The window-level handler reads live values here instead of re-subscribing.
  const navRef = useRef({ rows: visibleRows, paths: navPaths, tree, focused: focusedPath });
  navRef.current = { rows: visibleRows, paths: navPaths, tree, focused: focusedPath };

  const navigateTo = useCallback(
    async (dir: string) => {
      await tree.navigate(dir);
    },
    [tree]
  );

  // Prefetched models belong to the folder we just left.
  useEffect(() => {
    clearPrefetch();
  }, [tree.location]);

  // After moving up, put the cursor on the folder we came from.
  useEffect(() => {
    if (tree.revealed) setFocusedPath(tree.revealed);
  }, [tree.revealed]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") await navigateTo(selected);
    } catch (err) {
      log.error("Open folder failed:", err);
    }
  }, [navigateTo]);

  /** Folders become the current location; model files are selected. */
  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      setError(null);

      for (const path of paths) {
        let directory: boolean;
        try {
          directory = await isDirectory(path);
        } catch {
          directory = !isModelPath(path);
        }
        if (directory) {
          await navigateTo(path);
          return;
        }
      }

      const model = paths.find(isModelPath);
      if (!model) return;

      // Only re-navigate when the file lives outside the current folder, so
      // dropping a sibling keeps the expansion state.
      const parent = parentDir(model);
      if (navRef.current.tree.location !== parent) await navigateTo(parent);
      activate(model, false);
    },
    [activate, navigateTo]
  );

  useFileDropHandler(handleDroppedPaths);

  const handleBrowserDrop = useCallback((files: File[]) => {
    // Browser drops only carry a real path outside Tauri's webview; the Tauri
    // drag-drop event above is the path that matters in the desktop app.
    const path = (files[0] as (File & { path?: string }) | undefined)?.path;
    if (path) {
      setError(null);
      setFilePath(path);
    }
  }, []);

  const handleModelLoaded = useCallback(
    async (model: LoadedModel) => {
      const path = filePath;
      if (!path) return;
      const epoch = epochRef.current;

      try {
        const { info, validation: result } = await inspectModel(path, model);
        if (epoch !== epochRef.current) return; // superseded by a newer selection
        setAsset(info);
        setValidation(result);
        recordSeverity(path, result.overall);
      } catch (err) {
        if (epoch !== epochRef.current) return;
        log.error("Failed to build asset info:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [filePath, recordSeverity]
  );

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setAsset(null);
    setValidation(null);
  }, []);

  // File-manager style keyboard navigation over the tree.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { rows, paths, tree: current, focused } = navRef.current;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && (event.key === "b" || event.key === "B")) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (modifier && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        setSidebarOpen(true);
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && current.search.active) {
        current.search.setQuery("");
        setSearchOpen(false);
        return;
      }
      if (modifier || event.altKey) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const next = stepPath(paths, focused, event.key === "ArrowDown" ? 1 : -1);
        if (!next) return;
        event.preventDefault();
        const row = rows.find((candidate) => candidate.path === next);
        activate(next, row?.node.entry.isDir ?? false);
        return;
      }

      // Expansion and parent traversal only make sense in tree mode.
      if (current.search.active || !focused) return;
      const row = rows.find((candidate) => candidate.path === focused);

      if (event.key === "ArrowRight") {
        if (!row?.node.entry.isDir) return;
        event.preventDefault();
        if (!row.node.expanded) {
          void current.setExpanded(focused, true);
        } else {
          const child = firstChildPath(rows, focused);
          if (child) {
            const childRow = rows.find((candidate) => candidate.path === child);
            activate(child, childRow?.node.entry.isDir ?? false);
          }
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (row?.node.entry.isDir && row.node.expanded) {
          void current.setExpanded(focused, false);
          return;
        }
        const parent = row ? parentRowPath(rows, row.path) : null;
        if (parent) {
          activate(parent, true);
          return;
        }
        void current.navigateUp();
        return;
      }

      if (event.key === "Enter" && row?.node.entry.isDir) {
        event.preventDefault();
        void current.navigate(row.path);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activate]);

  // Once the current file is inspected, warm the next model in the list.
  useEffect(() => {
    if (!asset || batch.progress.running || tree.search.active) return;
    const next = stepModelPath(navRef.current.rows, asset.filePath, 1);
    if (!next) return;
    return scheduleIdle(() => prefetchModel(next));
  }, [asset, batch.progress.running, tree.search.active]);

  const handleValidateAll = useCallback(() => {
    if (tree.location) void batch.run(tree.location);
  }, [batch, tree.location]);

  const viewer = useMemo(
    () =>
      filePath ? (
        <Viewer3D
          ref={viewerRef}
          filePath={filePath}
          onModelLoaded={handleModelLoaded}
          onError={handleError}
        />
      ) : null,
    [filePath, handleModelLoaded, handleError]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {sidebarOpen && (
        <FileTreePanel
          tree={tree}
          rows={visibleRows}
          selectedPath={filePath}
          focusedPath={focusedPath}
          onActivate={activate}
          severityByPath={severityByPath}
          onOpenFolder={handleOpenFolder}
          onlyIssues={onlyIssues}
          onOnlyIssuesChange={setOnlyIssues}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          batchProgress={batch.progress}
          onValidateAll={handleValidateAll}
          onCancelBatch={batch.cancel}
        />
      )}

      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Full-screen viewport */}
        <DropZone onFileDrop={handleBrowserDrop} hasFile={!!filePath}>
          {viewer}
        </DropZone>

        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Show file tree (Cmd+B)"
            className="absolute bottom-3 left-3 z-30 px-2 py-1 rounded-lg text-[11px] cursor-pointer hover:brightness-125 transition-all"
            style={{ backgroundColor: "rgba(16, 24, 48, 0.94)", color: "#c8c8d4" }}
          >
            ☰ Files
          </button>
        )}

        {/* Overlay UI */}
        <InfoPanel
          asset={asset}
          validation={validation}
          viewerRef={viewerRef}
          assetPath={filePath}
        />

        {/* Error toast */}
        {error && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.15)",
              backdropFilter: "blur(12px)",
              color: "var(--danger)",
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => invoke("open_log_directory").catch(() => {})}
              className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer hover:brightness-125 transition-all"
              style={{ backgroundColor: "rgba(248, 113, 113, 0.3)", color: "#f87171" }}
              title="Open log directory"
            >
              Logs
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
