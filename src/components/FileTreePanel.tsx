import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { convertFilePath } from "./ModelLoader";
import { Chevron, FileIcon } from "./FileTreeIcons";
import { revealInFileManager, type DirEntry } from "../hooks/useTauriCommand";
import {
  SEVERITY_COLORS,
  baseName,
  breadcrumbs,
  countIssues,
  formatFileSize,
  parentDir,
  treeStats,
  type FlatRow,
  type SortMode,
} from "../lib/fileTree";
import { loadSession, saveSession } from "../lib/treeSession";
import type { FileTree } from "../hooks/useFileTree";
import type { BatchProgress } from "../hooks/useBatchValidation";
import type { ValidationSeverity } from "../types/asset";
import * as log from "../lib/logger";

const ROW_HEIGHT = 28;
const OVERSCAN = 10;
const MIN_WIDTH = 240;
const MAX_WIDTH = 560;
const INDENT = 14;

const PANEL_BG = "#0d1424";
const BORDER = "1px solid rgba(60, 60, 100, 0.45)";

export interface FileTreePanelProps {
  tree: FileTree;
  /** Rows to display — already filtered, so keyboard and mouse agree. */
  rows: FlatRow[];
  selectedPath: string | null;
  focusedPath: string | null;
  onActivate: (path: string, isDir: boolean) => void;
  severityByPath: Record<string, ValidationSeverity>;
  onOpenFolder: () => void;
  onlyIssues: boolean;
  onOnlyIssuesChange: (value: boolean) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  batchProgress: BatchProgress;
  onValidateAll: () => void;
  onCancelBatch: () => void;
}

interface MenuTarget {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

// ── Toolbar ──

function ToolbarButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex items-center justify-center w-7 h-7 rounded cursor-pointer transition-colors hover:bg-white/10 disabled:opacity-25 disabled:cursor-default"
      style={{ color: active ? "#e94560" : "#9a9ab0" }}
    >
      {children}
    </button>
  );
}

// ── Rows ──

const TreeRow = memo(function TreeRow({
  row,
  selected,
  focused,
  revealed,
  severity,
  onActivate,
  onToggle,
  onContextMenu,
}: {
  row: FlatRow;
  selected: boolean;
  focused: boolean;
  revealed: boolean;
  severity: ValidationSeverity | undefined;
  onActivate: (path: string, isDir: boolean) => void;
  onToggle: (path: string) => void;
  onContextMenu: (target: MenuTarget) => void;
}) {
  const { entry, expanded, loading } = row.node;
  const isDir = entry.isDir;

  const handleClick = useCallback(() => {
    onActivate(entry.path, isDir);
    if (isDir) onToggle(entry.path);
  }, [entry.path, isDir, onActivate, onToggle]);

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isDir ? expanded : undefined}
      data-testid="tree-row"
      title={entry.path}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY, path: entry.path, isDir });
      }}
      className="group relative flex items-center gap-2 pr-2 cursor-pointer select-none text-body whitespace-nowrap hover:bg-white/[0.06]"
      style={{
        height: ROW_HEIGHT,
        paddingLeft: 6,
        backgroundColor: selected
          ? "rgba(233, 69, 96, 0.20)"
          : revealed
            ? "rgba(255, 255, 255, 0.05)"
            : undefined,
        outline: focused ? "2px solid rgba(233, 69, 96, 0.9)" : undefined,
        outlineOffset: -2,
        color: selected ? "#f0f0f5" : "#c2c2d0",
      }}
    >
      {severity && (
        <span
          data-testid="severity-bar"
          className="absolute left-0 top-0 h-full w-[4px]"
          style={{ backgroundColor: SEVERITY_COLORS[severity] }}
        />
      )}

      {/* Indent guides make depth readable at a glance. */}
      {Array.from({ length: row.depth }, (_, level) => (
        <span
          key={level}
          className="shrink-0 h-full"
          style={{ width: INDENT, borderLeft: "1px solid rgba(255, 255, 255, 0.07)" }}
        />
      ))}

      <span className="w-3.5 shrink-0 flex items-center justify-center">
        {isDir && entry.hasChildren && <Chevron open={expanded} />}
      </span>

      {entry.thumbnailPath ? (
        <img
          data-testid="tree-thumbnail"
          src={convertFilePath(entry.thumbnailPath)}
          alt=""
          className="w-5 h-5 shrink-0 rounded-sm object-cover"
        />
      ) : (
        <FileIcon name={entry.name} kind={entry.kind} isDir={isDir} />
      )}

      <span className="truncate flex-1">{entry.name}</span>

      {loading && (
        <span className="text-meta shrink-0" style={{ color: "var(--text-muted)" }}>
          …
        </span>
      )}

      {!isDir && (
        <span className="text-meta shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
          {formatFileSize(entry.fileSize)}
        </span>
      )}
    </div>
  );
});

const SearchRow = memo(function SearchRow({
  entry,
  root,
  selected,
  focused,
  severity,
  onActivate,
  onContextMenu,
}: {
  entry: DirEntry;
  root: string;
  selected: boolean;
  focused: boolean;
  severity: ValidationSeverity | undefined;
  onActivate: (path: string, isDir: boolean) => void;
  onContextMenu: (target: MenuTarget) => void;
}) {
  const relative = parentDir(entry.path)
    .slice(root.length)
    .replace(/^[/\\]/, "");

  return (
    <div
      role="option"
      aria-selected={selected}
      data-testid="search-row"
      title={entry.path}
      onClick={() => onActivate(entry.path, false)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY, path: entry.path, isDir: false });
      }}
      className="group relative flex items-center gap-2 px-2 cursor-pointer select-none text-body whitespace-nowrap hover:bg-white/[0.06]"
      style={{
        height: ROW_HEIGHT,
        backgroundColor: selected ? "rgba(233, 69, 96, 0.20)" : undefined,
        outline: focused ? "2px solid rgba(233, 69, 96, 0.9)" : undefined,
        outlineOffset: -2,
        color: selected ? "#f0f0f5" : "#c2c2d0",
      }}
    >
      {severity && (
        <span
          className="absolute left-0 top-0 h-full w-[4px]"
          style={{ backgroundColor: SEVERITY_COLORS[severity] }}
        />
      )}
      <FileIcon name={entry.name} kind={entry.kind} isDir={false} />
      <span className="truncate shrink-0">{entry.name}</span>
      {relative && (
        <span className="truncate text-meta" style={{ color: "var(--text-muted)" }}>
          {relative}
        </span>
      )}
    </div>
  );
});

// ── Panel ──

export function FileTreePanel({
  tree,
  rows,
  selectedPath,
  focusedPath,
  onActivate,
  severityByPath,
  onOpenFolder,
  onlyIssues,
  onOnlyIssuesChange,
  searchOpen,
  onSearchOpenChange,
  batchProgress,
  onValidateAll,
  onCancelBatch,
}: FileTreePanelProps) {
  const [width, setWidth] = useState(() => loadSession().width);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextTarget, setContextTarget] = useState<MenuTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { state, location, canGoUp, search, revealed, recentFolders } = tree;

  const stats = useMemo(() => treeStats(tree.rows), [tree.rows]);
  const issues = useMemo(() => countIssues(tree.rows, severityByPath), [tree.rows, severityByPath]);
  const crumbs = useMemo(() => breadcrumbs(location), [location]);

  // Only visible rows are mounted; a library folder can hold thousands.
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    setViewportHeight(element.clientHeight);
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Keep the focused row on screen when the keyboard drives navigation.
  useEffect(() => {
    if (!focusedPath || !listRef.current) return;
    const index = search.active
      ? search.results.findIndex((entry) => entry.path === focusedPath)
      : rows.findIndex((row) => row.path === focusedPath);
    if (index === -1) return;

    const element = listRef.current;
    const top = index * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) {
      element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
    }
  }, [focusedPath, rows, search.active, search.results]);

  const handleToggle = useCallback((path: string) => void tree.toggle(path), [tree]);

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement?.clientWidth ?? MIN_WIDTH;

    const onMove = (moveEvent: MouseEvent) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidth((current) => {
        saveSession({ width: current });
        return current;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Any click outside closes the popovers.
  useEffect(() => {
    if (!menuOpen && !contextTarget) return;
    const close = () => {
      setMenuOpen(false);
      setContextTarget(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen, contextTarget]);

  const total = search.active ? search.results.length : rows.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);

  const handleReveal = useCallback((path: string) => {
    revealInFileManager(path).catch((err) => log.warn("reveal failed:", err));
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard?.writeText(path).catch((err) => log.warn("clipboard failed:", err));
  }, []);

  return (
    <aside
      data-testid="file-tree"
      className="relative shrink-0 flex flex-col h-full"
      style={{ width, backgroundColor: PANEL_BG, borderRight: BORDER }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1" style={{ borderBottom: BORDER }}>
        <ToolbarButton label="Open folder" onClick={onOpenFolder}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          label="Up one level"
          onClick={() => void tree.navigateUp()}
          disabled={!canGoUp}
        >
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </ToolbarButton>

        <ToolbarButton label="Refresh" onClick={() => void tree.refresh()} disabled={!location}>
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 11-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </ToolbarButton>

        <ToolbarButton
          label="Search"
          active={searchOpen}
          disabled={!location}
          onClick={() => {
            const next = !searchOpen;
            onSearchOpenChange(next);
            if (!next) search.setQuery("");
          }}
        >
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </ToolbarButton>

        <div className="flex-1" />

        <div className="relative">
          <ToolbarButton
            label="More options"
            active={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </ToolbarButton>

          {menuOpen && (
            <div
              onClick={(event) => event.stopPropagation()}
              className="absolute right-0 top-full mt-1 z-40 rounded-lg py-1 min-w-[220px] text-body"
              style={{ backgroundColor: "#16213e", border: BORDER }}
            >
              <p
                className="px-3 py-1 text-label font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Sort by
              </p>
              {(
                [
                  ["name", "Name"],
                  ["size", "Size"],
                  ["modified", "Date modified"],
                ] as [SortMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => tree.setSort(mode)}
                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
                  style={{ color: "#c2c2d0" }}
                >
                  <span className="w-3">{tree.sort === mode ? "✓" : ""}</span>
                  {label}
                </button>
              ))}

              <div className="my-1" style={{ borderTop: BORDER }} />

              <button
                onClick={() => tree.setModelsOnly(!tree.modelsOnly)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
                style={{ color: "#c2c2d0" }}
              >
                <span className="w-3">{tree.modelsOnly ? "✓" : ""}</span>
                3D files only
              </button>
              <button
                onClick={() => onOnlyIssuesChange(!onlyIssues)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
                style={{ color: "#c2c2d0" }}
              >
                <span className="w-3">{onlyIssues ? "✓" : ""}</span>
                Only show issues
              </button>

              {recentFolders.length > 0 && (
                <>
                  <div className="my-1" style={{ borderTop: BORDER }} />
                  <p
                    className="px-3 py-1 text-label font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Recent
                  </p>
                  {recentFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => void tree.navigate(folder)}
                      title={folder}
                      className="block w-full text-left px-3 py-1.5 truncate cursor-pointer hover:bg-white/10"
                      style={{ color: "#c2c2d0" }}
                    >
                      {baseName(folder)}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {location && (
        <div
          data-testid="breadcrumb"
          className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto text-body whitespace-nowrap"
          style={{ borderBottom: BORDER, scrollbarWidth: "none" }}
        >
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
              {index > 0 && <span style={{ color: "var(--text-faint)" }}>›</span>}
              <button
                onClick={() => void tree.navigate(crumb.path)}
                title={crumb.path}
                disabled={index === crumbs.length - 1}
                className="px-1 rounded cursor-pointer hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent max-w-[150px] truncate"
                style={{
                  color: index === crumbs.length - 1 ? "#f0f0f5" : "#9a9ab0",
                  fontWeight: index === crumbs.length - 1 ? 600 : 400,
                }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search box */}
      {searchOpen && (
        <div className="px-2 py-1.5" style={{ borderBottom: BORDER }}>
          <input
            ref={searchInputRef}
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                search.setQuery("");
                onSearchOpenChange(false);
              }
            }}
            placeholder="Search this folder…"
            className="w-full px-2 py-1.5 rounded text-body outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#e0e0ea" }}
          />
        </div>
      )}

      {/* Rows */}
      <div
        ref={listRef}
        role={search.active ? "listbox" : "tree"}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {(state.rootLoading || tree.restoring) && (
          <p className="px-3 py-2 text-body" style={{ color: "var(--text-muted)" }}>
            Loading…
          </p>
        )}

        {state.rootError && (
          <p className="px-3 py-2 text-body" style={{ color: "var(--danger)" }}>
            {state.rootError}
          </p>
        )}

        {!location && !tree.restoring && (
          <p className="px-3 py-4 text-body leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Open a folder, or drop one anywhere in the window, to review its 3D files side by side.
          </p>
        )}

        {location && !state.rootLoading && total === 0 && (
          <p className="px-3 py-4 text-body" style={{ color: "var(--text-muted)" }}>
            {search.active
              ? search.searching
                ? "Searching…"
                : "No matches."
              : onlyIssues
                ? "No issues found yet."
                : "This folder is empty."}
          </p>
        )}

        <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
          <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
            {search.active
              ? search.results
                  .slice(first, last)
                  .map((entry) => (
                    <SearchRow
                      key={entry.path}
                      entry={entry}
                      root={location ?? ""}
                      selected={entry.path === selectedPath}
                      focused={entry.path === focusedPath}
                      severity={severityByPath[entry.path]}
                      onActivate={onActivate}
                      onContextMenu={setContextTarget}
                    />
                  ))
              : rows
                  .slice(first, last)
                  .map((row) => (
                    <TreeRow
                      key={row.path}
                      row={row}
                      selected={row.path === selectedPath}
                      focused={row.path === focusedPath}
                      revealed={row.path === revealed}
                      severity={severityByPath[row.path]}
                      onActivate={onActivate}
                      onToggle={handleToggle}
                      onContextMenu={setContextTarget}
                    />
                  ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-meta"
        style={{ borderTop: BORDER, color: "var(--text-muted)" }}
      >
        {batchProgress.running ? (
          <>
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
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
            <span className="shrink-0 tabular-nums">
              {batchProgress.done}/{batchProgress.total}
            </span>
            <button
              onClick={onCancelBatch}
              className="shrink-0 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/10"
              style={{ color: "#f87171" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="shrink-0">{stats.models} models</span>
            {issues.warning > 0 && (
              <span className="shrink-0" style={{ color: SEVERITY_COLORS.warning }}>
                {issues.warning} ⚠
              </span>
            )}
            {issues.bad > 0 && (
              <span className="shrink-0" style={{ color: SEVERITY_COLORS.bad }}>
                {issues.bad} ✕
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={onValidateAll}
              disabled={!location}
              className="shrink-0 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/10 disabled:opacity-30 disabled:cursor-default"
              style={{ color: "#9a9ab0" }}
            >
              Validate all
            </button>
          </>
        )}
      </div>

      {/* Context menu */}
      {contextTarget && (
        <div
          onClick={(event) => event.stopPropagation()}
          className="fixed z-50 rounded-lg py-1 min-w-[180px] text-body"
          style={{
            left: contextTarget.x,
            top: contextTarget.y,
            backgroundColor: "#16213e",
            border: BORDER,
          }}
        >
          {contextTarget.isDir && (
            <button
              onClick={() => {
                void tree.navigate(contextTarget.path);
                setContextTarget(null);
              }}
              className="block w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
              style={{ color: "#c2c2d0" }}
            >
              Open here
            </button>
          )}
          <button
            onClick={() => {
              handleReveal(contextTarget.path);
              setContextTarget(null);
            }}
            className="block w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
            style={{ color: "#c2c2d0" }}
          >
            Reveal in file manager
          </button>
          <button
            onClick={() => {
              handleCopyPath(contextTarget.path);
              setContextTarget(null);
            }}
            className="block w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
            style={{ color: "#c2c2d0" }}
          >
            Copy path
          </button>
          <button
            onClick={() => {
              void tree.refresh();
              setContextTarget(null);
            }}
            className="block w-full text-left px-3 py-1.5 cursor-pointer hover:bg-white/10"
            style={{ color: "#c2c2d0" }}
          >
            Refresh
          </button>
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[var(--accent)]/40"
        style={{ transform: "translateX(50%)" }}
      />
    </aside>
  );
}
