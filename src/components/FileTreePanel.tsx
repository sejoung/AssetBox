import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { convertFilePath } from "./ModelLoader";
import { OVERLAY_BORDER } from "../lib/overlayStyle";
import {
  SEVERITY_COLORS,
  baseName,
  formatFileSize,
  treeStats,
  type FlatRow,
} from "../lib/fileTree";
import type { FileTree } from "../hooks/useFileTree";
import type { BatchProgress } from "../hooks/useBatchValidation";
import type { ValidationSeverity } from "../types/asset";

const ROW_HEIGHT = 28;
const OVERSCAN = 8;
const MIN_WIDTH = 200;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 280;

interface FileTreePanelProps {
  tree: FileTree;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  severityByPath: Record<string, ValidationSeverity>;
  modelsOnly: boolean;
  onModelsOnlyChange: (value: boolean) => void;
  onOpenFolder: () => void;
  recentFolders: string[];
  onOpenRecent: (path: string) => void;
  batchProgress: BatchProgress;
  onValidateAll: () => void;
  onCancelBatch: () => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="w-3 h-3 shrink-0 transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--text-secondary)" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

const TreeRow = memo(function TreeRow({
  row,
  selected,
  severity,
  onSelect,
  onToggle,
}: {
  row: FlatRow;
  selected: boolean;
  severity: ValidationSeverity | undefined;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const { entry, expanded, loading } = row.node;
  const isDir = entry.isDir;

  const handleClick = useCallback(() => {
    if (isDir) onToggle(entry.path);
    else onSelect(entry.path);
  }, [isDir, entry.path, onSelect, onToggle]);

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isDir ? expanded : undefined}
      data-testid="tree-row"
      title={entry.path}
      onClick={handleClick}
      className="flex items-center gap-1.5 pr-2 cursor-pointer select-none text-xs whitespace-nowrap hover:bg-white/5"
      style={{
        height: ROW_HEIGHT,
        paddingLeft: 8 + row.depth * 12,
        backgroundColor: selected ? "rgba(233, 69, 96, 0.22)" : undefined,
        color: selected ? "var(--text-primary)" : "#c8c8d4",
      }}
    >
      <span className="w-3 shrink-0 flex items-center justify-center">
        {isDir && entry.hasChildren && <Chevron open={expanded} />}
      </span>

      {isDir ? (
        <svg
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: "#8a8aa0" }}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      ) : entry.thumbnailPath ? (
        <img
          data-testid="tree-thumbnail"
          src={convertFilePath(entry.thumbnailPath)}
          alt=""
          className="w-4 h-4 shrink-0 rounded object-cover"
        />
      ) : (
        <span
          className="shrink-0 text-[9px] font-bold uppercase w-4 text-center"
          style={{ color: entry.kind === "model" ? "#e94560" : "#6a6a80" }}
        >
          {entry.name.split(".").pop()?.slice(0, 3)}
        </span>
      )}

      <span className="truncate flex-1">{entry.name}</span>

      {loading && (
        <span className="text-[10px]" style={{ color: "#6a6a80" }}>
          …
        </span>
      )}

      {!isDir && entry.kind === "model" && (
        <span className="text-[10px] font-mono shrink-0" style={{ color: "#6a6a80" }}>
          {formatFileSize(entry.fileSize)}
        </span>
      )}

      {severity && (
        <span
          data-testid="severity-dot"
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: SEVERITY_COLORS[severity] }}
        />
      )}
    </div>
  );
});

export function FileTreePanel({
  tree,
  selectedPath,
  onSelect,
  severityByPath,
  modelsOnly,
  onModelsOnlyChange,
  onOpenFolder,
  recentFolders,
  onOpenRecent,
  batchProgress,
  onValidateAll,
  onCancelBatch,
}: FileTreePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [showRecents, setShowRecents] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { state, rows, toggle } = tree;

  // Track the scroll viewport so only visible rows are rendered — a folder of
  // several thousand textures would otherwise mount thousands of nodes.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleToggle = useCallback((path: string) => void toggle(path), [toggle]);

  // Keep the selected row in view when the selection moves by keyboard.
  useEffect(() => {
    if (!selectedPath || !listRef.current) return;
    const index = rows.findIndex((row) => row.path === selectedPath);
    if (index === -1) return;

    const el = listRef.current;
    const top = index * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    }
  }, [selectedPath, rows]);

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement?.clientWidth ?? DEFAULT_WIDTH;

    const onMove = (moveEvent: MouseEvent) => {
      const next = startWidth + (moveEvent.clientX - startX);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visible = rows.slice(first, last);
  const stats = treeStats(rows);

  return (
    <aside
      data-testid="file-tree"
      className="relative shrink-0 flex flex-col h-full"
      style={{ width, backgroundColor: "#101828", borderRight: OVERLAY_BORDER }}
    >
      {/* Header */}
      <div className="px-2.5 py-2 flex flex-col gap-2" style={{ borderBottom: OVERLAY_BORDER }}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenFolder}
            className="px-2 py-1 rounded text-[11px] font-semibold cursor-pointer hover:brightness-110 transition-all"
            style={{ backgroundColor: "#e94560", color: "white" }}
          >
            Open Folder
          </button>

          {recentFolders.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowRecents((value) => !value)}
                title="Recent folders"
                className="px-1.5 py-1 rounded text-[11px] cursor-pointer hover:bg-white/10 transition-all"
                style={{ color: "var(--text-secondary)" }}
              >
                ▾
              </button>
              {showRecents && (
                <div
                  className="absolute left-0 top-full mt-1 z-30 rounded-lg py-1 min-w-[220px]"
                  style={{ backgroundColor: "#16213e", border: OVERLAY_BORDER }}
                >
                  {recentFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => {
                        setShowRecents(false);
                        onOpenRecent(folder);
                      }}
                      title={folder}
                      className="block w-full text-left px-3 py-1.5 text-[11px] truncate cursor-pointer hover:bg-white/10"
                      style={{ color: "#c8c8d4" }}
                    >
                      {baseName(folder)}
                      <span className="ml-1.5 text-[9px]" style={{ color: "#6a6a80" }}>
                        {folder}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={() => void tree.refresh()}
            disabled={!state.root}
            title="Refresh"
            className="px-1.5 py-1 rounded text-[11px] cursor-pointer hover:bg-white/10 transition-all disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
          >
            ⟳
          </button>
        </div>

        {state.root && (
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="truncate text-[11px] font-semibold" title={state.root}>
              {baseName(state.root)}
              <span className="ml-1.5 text-[10px] font-normal" style={{ color: "#6a6a80" }}>
                {stats.models} models
              </span>
            </div>
            <button
              onClick={tree.closeRoot}
              title="Close folder"
              className="shrink-0 px-1 rounded text-[11px] cursor-pointer hover:bg-white/10 transition-all"
              style={{ color: "var(--text-secondary)" }}
            >
              ×
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <label
            className="flex items-center gap-1.5 text-[10px] cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={modelsOnly}
              onChange={(event) => onModelsOnlyChange(event.target.checked)}
              className="cursor-pointer"
            />
            3D files only
          </label>

          {batchProgress.running ? (
            <button
              onClick={onCancelBatch}
              className="px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer"
              style={{ backgroundColor: "rgba(248, 113, 113, 0.25)", color: "#f87171" }}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onValidateAll}
              disabled={!state.root}
              className="px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer hover:bg-white/10 transition-all disabled:opacity-30"
              style={{ backgroundColor: "rgba(90, 90, 140, 0.35)", color: "#c8c8d4" }}
            >
              Validate All
            </button>
          )}
        </div>

        {batchProgress.running && (
          <div className="flex flex-col gap-1">
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: "#2a2a4a" }}
            >
              <div
                className="h-full transition-all duration-150"
                style={{
                  width: batchProgress.total
                    ? `${(batchProgress.done / batchProgress.total) * 100}%`
                    : "0%",
                  backgroundColor: "#e94560",
                }}
              />
            </div>
            <span className="text-[9px] truncate" style={{ color: "#6a6a80" }}>
              {batchProgress.done}/{batchProgress.total} {batchProgress.current ?? ""}
            </span>
          </div>
        )}
      </div>

      {/* Rows */}
      <div
        ref={listRef}
        role="tree"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {state.rootLoading && (
          <p className="px-3 py-2 text-[11px]" style={{ color: "#6a6a80" }}>
            Loading…
          </p>
        )}

        {state.rootError && (
          <p className="px-3 py-2 text-[11px]" style={{ color: "var(--danger)" }}>
            {state.rootError}
          </p>
        )}

        {!state.root && !state.rootLoading && (
          <p className="px-3 py-4 text-[11px] leading-relaxed" style={{ color: "#6a6a80" }}>
            Open a folder, or drop one anywhere in the window, to review its 3D files side by side.
          </p>
        )}

        {state.root && !state.rootLoading && rows.length === 0 && (
          <p className="px-3 py-4 text-[11px]" style={{ color: "#6a6a80" }}>
            No 3D files in this folder.
          </p>
        )}

        {/* Spacer-based windowing: only the visible slice is mounted. */}
        <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
          <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
            {visible.map((row) => (
              <TreeRow
                key={row.path}
                row={row}
                selected={row.path === selectedPath}
                severity={severityByPath[row.path]}
                onSelect={onSelect}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[var(--accent)]/40"
        style={{ transform: "translateX(50%)" }}
      />
    </aside>
  );
}
