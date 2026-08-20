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
import { isModelPath, parentDir, stepModelPath } from "./lib/fileTree";
import { getRecentFolders, pushRecentFolder } from "./lib/recentFolders";
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
  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelsOnly, setModelsOnly] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [severityByPath, setSeverityByPath] = useState<Record<string, ValidationSeverity>>({});
  const [recentFolders, setRecentFolders] = useState<string[]>(() => getRecentFolders());
  const viewerRef = useRef<Viewer3DHandle>(null);

  const tree = useFileTree(modelsOnly);
  const { openRoot: openTreeRoot, rows, state: treeState } = tree;

  // Refs let the window-level keyboard handler read current values without
  // being re-registered on every selection.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selectedRef = useRef<string | null>(filePath);
  selectedRef.current = filePath;
  const rootRef = useRef<string | null>(treeState.root);
  rootRef.current = treeState.root;

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

  const openRoot = useCallback(
    async (dir: string) => {
      clearPrefetch();
      setRecentFolders(pushRecentFolder(dir));
      await openTreeRoot(dir);
    },
    [openTreeRoot]
  );

  const handleOpenFolder = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") await openRoot(selected);
    } catch (err) {
      log.error("Open folder failed:", err);
    }
  }, [openRoot]);

  /** Folders become the tree root; model files are selected (and reveal their folder). */
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
          await openRoot(path);
          return;
        }
      }

      const model = paths.find(isModelPath);
      if (!model) return;

      // Only re-root when the file lives outside the folder already open,
      // so dropping a sibling keeps the current expansion state.
      const parent = parentDir(model);
      if (rootRef.current !== parent) await openRoot(parent);
      selectFile(model);
    },
    [openRoot, selectFile]
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

  // ↑/↓ steps through model files; Cmd/Ctrl+B toggles the tree.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key === "b" || event.key === "B")) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const next = stepModelPath(
        rowsRef.current,
        selectedRef.current,
        event.key === "ArrowDown" ? 1 : -1
      );
      if (!next) return;
      event.preventDefault();
      selectFile(next);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectFile]);

  // Once the current file is inspected, warm the next one in the list.
  useEffect(() => {
    if (!asset || batch.progress.running) return;
    const next = stepModelPath(rowsRef.current, asset.filePath, 1);
    if (!next) return;
    return scheduleIdle(() => prefetchModel(next));
  }, [asset, batch.progress.running]);

  const handleValidateAll = useCallback(() => {
    if (treeState.root) void batch.run(treeState.root);
  }, [batch, treeState.root]);

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
          selectedPath={filePath}
          onSelect={selectFile}
          severityByPath={severityByPath}
          modelsOnly={modelsOnly}
          onModelsOnlyChange={setModelsOnly}
          onOpenFolder={handleOpenFolder}
          recentFolders={recentFolders}
          onOpenRecent={openRoot}
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
