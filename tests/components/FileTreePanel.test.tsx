import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTreePanel } from "../../src/components/FileTreePanel";
import {
  EMPTY_TREE,
  createTree,
  flattenTree,
  setChildren,
  setExpanded,
} from "../../src/lib/fileTree";
import type { DirEntry } from "../../src/hooks/useTauriCommand";
import type { FileTree } from "../../src/hooks/useFileTree";
import type { TreeState } from "../../src/lib/fileTree";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

function entry(path: string, isDir: boolean, thumbnailPath: string | null = null): DirEntry {
  return {
    name: path.split("/").pop() ?? path,
    path,
    isDir,
    fileSize: isDir ? 0 : 2048,
    kind: isDir ? "dir" : "model",
    hasChildren: isDir,
    thumbnailPath,
  };
}

function makeTree(state: TreeState, overrides: Partial<FileTree> = {}): FileTree {
  return {
    state,
    rows: flattenTree(state),
    openRoot: vi.fn(),
    toggle: vi.fn(),
    refresh: vi.fn(),
    closeRoot: vi.fn(),
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

function renderPanel(tree: FileTree, props: Partial<Parameters<typeof FileTreePanel>[0]> = {}) {
  const defaults = {
    tree,
    selectedPath: null,
    onSelect: vi.fn(),
    severityByPath: {},
    modelsOnly: true,
    onModelsOnlyChange: vi.fn(),
    onOpenFolder: vi.fn(),
    recentFolders: [],
    onOpenRecent: vi.fn(),
    batchProgress: { running: false, done: 0, total: 0, current: null },
    onValidateAll: vi.fn(),
    onCancelBatch: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  render(<FileTreePanel {...merged} />);
  return merged;
}

describe("FileTreePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prompts to open a folder when no root is set", () => {
    renderPanel(makeTree(EMPTY_TREE));
    expect(screen.getByText(/Open a folder/)).toBeInTheDocument();
  });

  it("renders visible rows and the model count", () => {
    renderPanel(makeTree(baseState()));
    expect(screen.getByText("sub")).toBeInTheDocument();
    expect(screen.getByText("hero.glb")).toBeInTheDocument();
    expect(screen.getByText("2 models")).toBeInTheDocument();
    // Collapsed folder contents stay out of the DOM.
    expect(screen.queryByText("inner.obj")).not.toBeInTheDocument();
  });

  it("renders children of an expanded folder", () => {
    renderPanel(makeTree(setExpanded(baseState(), "/root/sub", true)));
    expect(screen.getByText("inner.obj")).toBeInTheDocument();
    expect(screen.getByText("3 models")).toBeInTheDocument();
  });

  it("selects a model on click but toggles a folder", () => {
    const toggle = vi.fn();
    const tree = makeTree(baseState(), { toggle });
    const { onSelect } = renderPanel(tree);

    fireEvent.click(screen.getByText("hero.glb"));
    expect(onSelect).toHaveBeenCalledWith("/root/hero.glb");

    fireEvent.click(screen.getByText("sub"));
    expect(toggle).toHaveBeenCalledWith("/root/sub");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks the selected row", () => {
    renderPanel(makeTree(baseState()), { selectedPath: "/root/hero.glb" });
    const rows = screen.getAllByTestId("tree-row");
    const selected = rows.filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("hero.glb");
  });

  it("shows a severity dot for files that have been validated", () => {
    renderPanel(makeTree(baseState()), {
      severityByPath: { "/root/hero.glb": "bad" },
    });
    expect(screen.getAllByTestId("severity-dot")).toHaveLength(1);
  });

  it("shows a generated thumbnail when one exists next to the model", () => {
    let state = createTree("/root");
    state = setChildren(state, null, [entry("/root/hero.glb", false, "/root/hero_thumbnail.png")]);
    renderPanel(makeTree({ ...state, rootLoading: false }));
    expect(screen.getByTestId("tree-thumbnail")).toHaveAttribute(
      "src",
      "asset://localhost//root/hero_thumbnail.png"
    );
  });

  it("runs and cancels batch validation", () => {
    const { onValidateAll } = renderPanel(makeTree(baseState()));
    fireEvent.click(screen.getByText("Validate All"));
    expect(onValidateAll).toHaveBeenCalled();

    const onCancelBatch = vi.fn();
    render(<div />);
    renderPanel(makeTree(baseState()), {
      batchProgress: { running: true, done: 2, total: 5, current: "hero.glb" },
      onCancelBatch,
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancelBatch).toHaveBeenCalled();
  });

  it("toggles the 3D-files-only filter", () => {
    const { onModelsOnlyChange } = renderPanel(makeTree(baseState()));
    fireEvent.click(screen.getByLabelText("3D files only"));
    expect(onModelsOnlyChange).toHaveBeenCalledWith(false);
  });

  it("opens a recent folder", () => {
    const { onOpenRecent } = renderPanel(makeTree(baseState()), {
      recentFolders: ["/previous/project"],
    });
    fireEvent.click(screen.getByTitle("Recent folders"));
    fireEvent.click(screen.getByTitle("/previous/project"));
    expect(onOpenRecent).toHaveBeenCalledWith("/previous/project");
  });
});
