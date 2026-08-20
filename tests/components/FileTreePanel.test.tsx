import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FileTreePanel, type FileTreePanelProps } from "../../src/components/FileTreePanel";
import {
  EMPTY_TREE,
  createTree,
  flattenTree,
  setChildren,
  setExpanded,
  type TreeState,
} from "../../src/lib/fileTree";
import type { DirEntry } from "../../src/hooks/useTauriCommand";
import type { FileTree } from "../../src/hooks/useFileTree";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

import { invoke } from "@tauri-apps/api/core";

function entry(path: string, isDir: boolean, thumbnailPath: string | null = null): DirEntry {
  return {
    name: path.split("/").pop() ?? path,
    path,
    isDir,
    fileSize: isDir ? 0 : 2048,
    kind: isDir ? "dir" : "model",
    hasChildren: isDir,
    thumbnailPath,
    modified: 0,
  };
}

function makeTree(state: TreeState, overrides: Partial<FileTree> = {}): FileTree {
  return {
    state,
    rows: flattenTree(state),
    location: state.root,
    canGoUp: !!state.root && state.root !== "/",
    navigate: vi.fn(),
    navigateUp: vi.fn(),
    toggle: vi.fn(),
    setExpanded: vi.fn(),
    refresh: vi.fn(),
    modelsOnly: true,
    setModelsOnly: vi.fn(),
    sort: "name",
    setSort: vi.fn(),
    search: { query: "", setQuery: vi.fn(), results: [], searching: false, active: false },
    recentFolders: [],
    revealed: null,
    restoring: false,
    ...overrides,
  };
}

function baseState() {
  let state = createTree("/root");
  state = setChildren(state, null, [
    entry("/root/sub", true),
    entry("/root/hero.glb", false),
    entry("/root/prop.fbx", false),
  ]);
  state = setChildren(state, "/root/sub", [entry("/root/sub/inner.obj", false)]);
  return { ...state, rootLoading: false };
}

function renderPanel(tree: FileTree, props: Partial<FileTreePanelProps> = {}) {
  const merged: FileTreePanelProps = {
    tree,
    rows: tree.rows,
    selectedPath: null,
    focusedPath: null,
    onActivate: vi.fn(),
    severityByPath: {},
    onOpenFolder: vi.fn(),
    onlyIssues: false,
    onOnlyIssuesChange: vi.fn(),
    searchOpen: false,
    onSearchOpenChange: vi.fn(),
    batchProgress: { running: false, done: 0, total: 0, current: null },
    onValidateAll: vi.fn(),
    onCancelBatch: vi.fn(),
    ...props,
  };
  render(<FileTreePanel {...merged} />);
  return merged;
}

describe("FileTreePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("empty state", () => {
    it("prompts to open a folder and hides the breadcrumb", () => {
      renderPanel(makeTree(EMPTY_TREE));
      expect(screen.getByText(/Open a folder/)).toBeInTheDocument();
      expect(screen.queryByTestId("breadcrumb")).not.toBeInTheDocument();
    });
  });

  describe("rows", () => {
    it("renders the current level only", () => {
      renderPanel(makeTree(baseState()));
      expect(screen.getByText("sub")).toBeInTheDocument();
      expect(screen.getByText("hero.glb")).toBeInTheDocument();
      expect(screen.queryByText("inner.obj")).not.toBeInTheDocument();
    });

    it("renders children of an expanded folder", () => {
      const tree = makeTree(setExpanded(baseState(), "/root/sub", true));
      renderPanel(tree);
      expect(screen.getByText("inner.obj")).toBeInTheDocument();
    });

    it("activates a file on click and also toggles a folder", () => {
      const toggle = vi.fn();
      const tree = makeTree(baseState(), { toggle });
      const { onActivate } = renderPanel(tree);

      fireEvent.click(screen.getByText("hero.glb"));
      expect(onActivate).toHaveBeenCalledWith("/root/hero.glb", false);

      fireEvent.click(screen.getByText("sub"));
      expect(onActivate).toHaveBeenCalledWith("/root/sub", true);
      expect(toggle).toHaveBeenCalledWith("/root/sub");
    });

    it("marks selection and focus separately", () => {
      renderPanel(makeTree(baseState()), {
        selectedPath: "/root/hero.glb",
        focusedPath: "/root/prop.fbx",
      });
      const rows = screen.getAllByTestId("tree-row");
      const selected = rows.filter((row) => row.getAttribute("aria-selected") === "true");
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveTextContent("hero.glb");

      const focused = rows.find((row) => row.style.outline.includes("solid"));
      expect(focused).toHaveTextContent("prop.fbx");
    });

    it("shows a severity bar for validated files", () => {
      renderPanel(makeTree(baseState()), { severityByPath: { "/root/hero.glb": "bad" } });
      expect(screen.getAllByTestId("severity-bar")).toHaveLength(1);
    });

    it("shows a generated thumbnail when one exists", () => {
      let state = createTree("/root");
      state = setChildren(state, null, [
        entry("/root/hero.glb", false, "/root/hero_thumbnail.png"),
      ]);
      const tree = makeTree({ ...state, rootLoading: false });
      renderPanel(tree);
      expect(screen.getByTestId("tree-thumbnail")).toHaveAttribute(
        "src",
        "asset://localhost//root/hero_thumbnail.png"
      );
    });
  });

  describe("navigation", () => {
    it("renders breadcrumb segments and navigates on click", () => {
      const navigate = vi.fn();
      renderPanel(makeTree(baseState(), { navigate }));

      const crumbs = within(screen.getByTestId("breadcrumb"));
      fireEvent.click(crumbs.getByText("/"));
      expect(navigate).toHaveBeenCalledWith("/");

      // The last crumb is the current folder, so it is not a navigation target.
      expect(crumbs.getByText("root")).toBeDisabled();
    });

    it("moves up a level", () => {
      const navigateUp = vi.fn();
      renderPanel(makeTree(baseState(), { navigateUp }));
      fireEvent.click(screen.getByLabelText("Up one level"));
      expect(navigateUp).toHaveBeenCalled();
    });

    it("disables the up button at the filesystem root", () => {
      renderPanel(makeTree(baseState(), { canGoUp: false }));
      expect(screen.getByLabelText("Up one level")).toBeDisabled();
    });

    it("refreshes on demand", () => {
      const refresh = vi.fn();
      renderPanel(makeTree(baseState(), { refresh }));
      fireEvent.click(screen.getByLabelText("Refresh"));
      expect(refresh).toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("shows the input when opened and reports typing", () => {
      const setQuery = vi.fn();
      const tree = makeTree(baseState(), {
        search: { query: "", setQuery, results: [], searching: false, active: false },
      });
      renderPanel(tree, { searchOpen: true });

      fireEvent.change(screen.getByPlaceholderText("Search this folder…"), {
        target: { value: "hero" },
      });
      expect(setQuery).toHaveBeenCalledWith("hero");
    });

    it("replaces the tree with a flat result list", () => {
      const tree = makeTree(baseState(), {
        search: {
          query: "hero",
          setQuery: vi.fn(),
          results: [entry("/root/lod/hero_lod1.glb", false)],
          searching: false,
          active: true,
        },
      });
      const { onActivate } = renderPanel(tree, { searchOpen: true });

      expect(screen.queryByTestId("tree-row")).not.toBeInTheDocument();
      expect(screen.getByText("hero_lod1.glb")).toBeInTheDocument();
      // The containing folder is shown relative to the current location.
      expect(screen.getByText("lod")).toBeInTheDocument();

      fireEvent.click(screen.getByText("hero_lod1.glb"));
      expect(onActivate).toHaveBeenCalledWith("/root/lod/hero_lod1.glb", false);
    });

    it("reports no matches", () => {
      const tree = makeTree(baseState(), {
        search: {
          query: "zzz",
          setQuery: vi.fn(),
          results: [],
          searching: false,
          active: true,
        },
      });
      renderPanel(tree, { searchOpen: true });
      expect(screen.getByText("No matches.")).toBeInTheDocument();
    });
  });

  describe("options menu", () => {
    function openMenu(tree: FileTree, props: Partial<FileTreePanelProps> = {}) {
      const result = renderPanel(tree, props);
      fireEvent.click(screen.getByLabelText("More options"));
      return result;
    }

    it("changes the sort mode", () => {
      const setSort = vi.fn();
      openMenu(makeTree(baseState(), { setSort }));
      fireEvent.click(screen.getByText("Date modified"));
      expect(setSort).toHaveBeenCalledWith("modified");
    });

    it("toggles the 3D-only and issues filters", () => {
      const setModelsOnly = vi.fn();
      const { onOnlyIssuesChange } = openMenu(makeTree(baseState(), { setModelsOnly }));

      fireEvent.click(screen.getByText("3D files only"));
      expect(setModelsOnly).toHaveBeenCalledWith(false);

      fireEvent.click(screen.getByText("Only show issues"));
      expect(onOnlyIssuesChange).toHaveBeenCalledWith(true);
    });

    it("navigates to a recent folder", () => {
      const navigate = vi.fn();
      openMenu(makeTree(baseState(), { navigate, recentFolders: ["/previous/project"] }));
      fireEvent.click(screen.getByText("project"));
      expect(navigate).toHaveBeenCalledWith("/previous/project");
    });
  });

  describe("context menu", () => {
    it("reveals a file in the file manager", () => {
      renderPanel(makeTree(baseState()));
      fireEvent.contextMenu(screen.getByText("hero.glb"));
      fireEvent.click(screen.getByText("Reveal in file manager"));
      expect(invoke).toHaveBeenCalledWith("reveal_in_file_manager", { path: "/root/hero.glb" });
    });

    it("copies a path", () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.assign(navigator, { clipboard: { writeText } });

      renderPanel(makeTree(baseState()));
      fireEvent.contextMenu(screen.getByText("hero.glb"));
      fireEvent.click(screen.getByText("Copy path"));
      expect(writeText).toHaveBeenCalledWith("/root/hero.glb");
    });

    it("offers to open a folder as the new location", () => {
      const navigate = vi.fn();
      renderPanel(makeTree(baseState(), { navigate }));

      fireEvent.contextMenu(screen.getByText("hero.glb"));
      expect(screen.queryByText("Open here")).not.toBeInTheDocument();

      fireEvent.contextMenu(screen.getByText("sub"));
      fireEvent.click(screen.getByText("Open here"));
      expect(navigate).toHaveBeenCalledWith("/root/sub");
    });
  });

  describe("status bar", () => {
    it("summarizes models and issues", () => {
      renderPanel(makeTree(baseState()), {
        severityByPath: { "/root/hero.glb": "warning", "/root/prop.fbx": "bad" },
      });
      expect(screen.getByText("2 models")).toBeInTheDocument();
      expect(screen.getByText("1 ⚠")).toBeInTheDocument();
      expect(screen.getByText("1 ✕")).toBeInTheDocument();
    });

    it("runs batch validation and swaps to progress while it works", () => {
      const { onValidateAll } = renderPanel(makeTree(baseState()));
      fireEvent.click(screen.getByText("Validate all"));
      expect(onValidateAll).toHaveBeenCalled();
    });

    it("cancels a running batch", () => {
      const { onCancelBatch } = renderPanel(makeTree(baseState()), {
        batchProgress: { running: true, done: 2, total: 5, current: "hero.glb" },
      });
      expect(screen.getByText("2/5")).toBeInTheDocument();
      expect(screen.queryByText("Validate all")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Cancel"));
      expect(onCancelBatch).toHaveBeenCalled();
    });
  });
});
