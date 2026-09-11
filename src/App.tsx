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
import {
  captureInspectionSource,
  inspectIssue,
  type InspectionSource,
  type IssueSelection,
} from "./lib/issueInspection";
import type { ValidationItem } from "./types/asset";

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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [severityByPath, setSeverityByPath] = useState<Record<string, ValidationSeverity>>({});
  const viewerRef = useRef<Viewer3DHandle>(null);
  const inspectionSource = useRef<InspectionSource | null>(null);
  const [bonesVisible, setBonesVisible] = useState(false);
  const [issueSelection, setIssueSelection] = useState<IssueSelection | null>(null);
  const clearIssue = useCallback(() => setIssueSelection(null), []);
  const selectIssue = useCallback((item: ValidationItem) => {
    setBonesVisible(false);
    if (inspectionSource.current) setIssueSelection(inspectIssue(inspectionSource.current, item));
  }, []);
  const toggleBones = useCallback((visible: boolean) => {
    setIssueSelection(null);
    setBonesVisible(visible);
  }, []);
  const selectIssueTarget = useCallback((targetIndex: number) => {
    setIssueSelection((current) => (current ? { ...current, targetIndex } : null));
  }, []);
  const currentFileRef = useRef(filePath);
  currentFileRef.current = filePath;

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
  const cancelBatch = batch.cancel;

  const selectFile = useCallback(
    (path: string) => {
      if (path === currentFileRef.current) {
        clearPrefetch();
        cancelBatch();
        setSeverityByPath((previous) => {
          const next = { ...previous };
          delete next[path];
          return next;
        });
        setLoadAttempt((value) => value + 1);
      }
      currentFileRef.current = path;
      epochRef.current++;
      setBonesVisible(false);
      setAsset(null);
      setValidation(null);
      inspectionSource.current = null;
      setIssueSelection(null);
      setError(null);
      setFilePath(path);
    },
    [cancelBatch]
  );

  const invalidateSources = useCallback(() => {
    clearPrefetch();
    cancelBatch();
    setSeverityByPath({});
    if (currentFileRef.current) selectFile(currentFileRef.current);
  }, [cancelBatch, selectFile]);
  const tree = useFileTree(invalidateSources);

  /** Focus follows the keyboard and the mouse; files additionally load. */
  const activate = useCallback(
    (path: string, isDir: boolean) => {
      setFocusedPath(path);
      if (!isDir) {
        if (isModelPath(path)) selectFile(path);
        else setError("This file cannot be previewed. Choose an FBX, GLB, glTF or OBJ model.");
      }
    },
    [selectFile]
  );

  // Rows actually on screen — the keyboard walks this exact list.
  const visibleRows: FlatRow[] = useMemo(
    () => (onlyIssues ? filterIssues(tree.rows, severityByPath) : tree.rows),
    [onlyIssues, tree.rows, severityByPath]
  );

  const displayTree = useMemo(
    () =>
      onlyIssues && tree.search.active
        ? {
            ...tree,
            search: {
              ...tree.search,
              results: tree.search.results.filter(
                (entry) =>
                  severityByPath[entry.path] === "warning" ||
                  severityByPath[entry.path] === "bad" ||
                  severityByPath[entry.path] === "unknown"
              ),
            },
          }
        : tree,
    [tree, onlyIssues, severityByPath]
  );

  const navPaths = useMemo(
    () =>
      tree.search.active
        ? displayTree.search.results.map((entry) => entry.path)
        : visibleRows.map((row) => row.path),
    [tree.search.active, displayTree.search.results, visibleRows]
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
      setError("Could not open the folder. Please try again.");
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
      if (!model) {
        setError("Choose an FBX, GLB, glTF or OBJ model, or open a folder.");
        return;
      }

      // Only re-navigate when the file lives outside the current folder, so
      // dropping a sibling keeps the expansion state.
      const parent = parentDir(model);
      if (navRef.current.tree.location !== parent) await navigateTo(parent);
      activate(model, false);
    },
    [activate, navigateTo]
  );

  useFileDropHandler(handleDroppedPaths);

  const handleBrowserDrop = useCallback(
    (files: File[]) => {
      const paths = files
        .map((file) => (file as File & { path?: string }).path)
        .filter((path): path is string => !!path);
      if (paths.length) void handleDroppedPaths(paths);
    },
    [handleDroppedPaths]
  );

  const handleModelLoaded = useCallback(
    async (model: LoadedModel) => {
      const path = filePath;
      if (!path) return;
      const epoch = epochRef.current;
      try {
        const source = captureInspectionSource(
          model.scene,
          model.textureInspection.failedResources
        );
        const { info, validation: result } = await inspectModel(path, model);
        if (epoch !== epochRef.current) return; // superseded by a newer selection
        inspectionSource.current = source;
        setIssueSelection(null);
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
    setBonesVisible(false);
    setError(err.message);
    setAsset(null);
    setValidation(null);
    inspectionSource.current = null;
    setIssueSelection(null);
  }, []);

  // File-manager style keyboard navigation over the tree.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select") || event.target.isContentEditable)
      ) {
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
      if (
        !sidebarOpen ||
        !(event.target instanceof Element) ||
        !event.target.closest('[role="tree"], [role="listbox"]')
      )
        return;

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
  }, [activate, sidebarOpen]);

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
          loadRevision={loadAttempt}
          ref={viewerRef}
          filePath={filePath}
          onModelLoaded={handleModelLoaded}
          onError={handleError}
          bonesVisible={bonesVisible}
          issueSelection={issueSelection}
          onClearIssue={clearIssue}
        />
      ) : null,
    [
      filePath,
      handleModelLoaded,
      handleError,
      loadAttempt,
      issueSelection,
      clearIssue,
      bonesVisible,
    ]
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⬡
          </span>
          AssetBox<span className="brand-caption">3D asset workspace</span>
        </div>
        <div className="header-actions">
          <button
            className="ui-button"
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle files (⌘/Ctrl+B)"
          >
            Files
          </button>
          <button className="ui-button" onClick={handleOpenFolder}>
            Open folder
          </button>
        </div>
      </header>
      <main className="workspace">
        {sidebarOpen && (
          <FileTreePanel
            tree={displayTree}
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
        <section className="preview-pane" aria-label="3D preview">
          <div className="preview-heading">
            <span className="section-label">Preview</span>
            <span className="preview-filename" title={filePath ?? undefined}>
              {filePath ? filePath.split(/[/\\]/).pop() : "No model selected"}
            </span>
          </div>
          <div className="preview-stage">
            <DropZone
              onFileDrop={handleBrowserDrop}
              hasFile={!!filePath}
              onOpenFolder={handleOpenFolder}
              hasFolder={!!tree.location}
            >
              {viewer}
            </DropZone>
            {error && (
              <div className="error-notice" role="alert">
                <div>
                  <strong>Unable to complete the action</strong>
                  <p>{error}</p>
                </div>
                {filePath && !asset && (
                  <button
                    className="ui-button"
                    onClick={() => {
                      epochRef.current++;
                      setError(null);
                      setLoadAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry
                  </button>
                )}
                <button
                  className="ui-button"
                  onClick={() => invoke("open_log_directory").catch(() => {})}
                >
                  Logs
                </button>
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </section>
        <InfoPanel
          asset={asset}
          validation={validation}
          viewerRef={viewerRef}
          assetPath={filePath}
          onBonesVisibleChange={toggleBones}
          bonesVisible={bonesVisible}
          issueSelection={issueSelection}
          onInspectIssue={selectIssue}
          onSelectIssueTarget={selectIssueTarget}
          onClearIssue={clearIssue}
        />
      </main>
    </div>
  );
}

export default App;
